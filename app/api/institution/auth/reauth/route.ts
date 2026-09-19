import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { verify as verifyTotp } from "otplib";
import { getAuthenticatedMembre, INSTITUTION_SESSION_TTL_MS, INSTITUTION_SESSION_TTL_JWT } from "@/lib/institutionAuth";
import { enregistrerAction } from "@/lib/journalActivite";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative, enregistrerTentative, messageSecurite,
} from "@/lib/security/authSecurity";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

// Réauthentification pour actions sensibles côté institution (16/09/2026,
// durci le même jour après revue critique) — mirroring intégral de
// app/api/admin/auth/reauth/route.ts, y compris ce que la 1re version
// n'avait pas :
//  - throttle device+IP (evaluerTentative/enregistrerTentative, catégorie
//    'institution_login' partagée avec le login) — sans lui, un device/IP
//    déjà bloqué ailleurs pouvait continuer à essayer des PIN ici.
//  - rotation de session : une réauth réussie mint une NOUVELLE ligne
//    institution_sessions (nouveau sid, nouveau cookie) et révoque
//    l'ancienne — sans ça, un cookie de session déjà volé restait
//    "reauth récent" dès que la victime légitime se réauthentifiait sur la
//    même ligne partagée.
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export async function POST(request: NextRequest) {
  const { deviceId, estNouveau } = resoudreDeviceId(request);
  const ip = extraireIpClient(request);
  const userAgent = request.headers.get("user-agent");

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status });
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
    return response;
  };

  // Throttle device+IP vérifié EN PREMIER, avant toute lecture DB
  // d'authentification — même principe que documenté dans
  // lib/security/authSecurity.ts ("une action refusée par le système ne
  // doit plus continuer à interroger la base"), corrigé le 16/09/2026
  // (l'ordre initial vérifiait la session avant le throttle).
  const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip });
  if (porte.state === "blocked" || porte.state === "support_only") {
    return finaliser(
      { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
      423
    );
  }

  const membre = await getAuthenticatedMembre(request);
  if (!membre) return finaliser({ error: "Non authentifié" }, 401);

  const body = await request.json().catch(() => null);
  const pin = body?.pin;
  const totpCode = body?.totp_code;
  if (typeof pin !== "string" || !pin) {
    return finaliser({ error: "Entrez votre PIN pour confirmer votre identité.", code: "MISSING_FIELDS" }, 400);
  }

  const { data: row } = await supabaseAdmin
    .from("institution_membres")
    .select("identifiant, pin_hash, compte_principal, totp_enabled, totp_secret, totp_backup_codes, failed_attempts, locked_until, prenom, nom")
    .eq("id", membre.membreId)
    .maybeSingle();
  if (!row) return finaliser({ error: "Votre compte est introuvable. Reconnectez-vous et réessayez.", code: "NOT_FOUND" }, 404);

  // Le compte principal (register/route.ts) n'a JAMAIS de
  // institution_membres.pin_hash à la création — son PIN vit sur
  // institutions.pin_hash ("Sécurité du compte"), institution_membres.pin_hash
  // n'étant renseigné pour lui QUE s'il a en plus défini un PIN personnel
  // via "Administration & accès". Sans ce routage, la réauth était
  // silencieusement impossible pour tout compte principal n'ayant jamais
  // touché cet écran — trouvé en revue finale, pas en test réel.
  let pinHashAVerifier = row.pin_hash;
  if (row.compte_principal && !pinHashAVerifier) {
    const { data: institution } = await supabaseAdmin
      .from("institutions")
      .select("pin_hash")
      .eq("id", membre.institutionId)
      .maybeSingle();
    pinHashAVerifier = institution?.pin_hash ?? null;
  }
  if (!pinHashAVerifier) {
    return finaliser({ error: "Aucun code PIN configuré pour confirmer votre identité. Configurez-en un dans Sécurité du compte ou Administration & accès.", code: "NO_FACTOR_CONFIGURED" }, 400);
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const minutesRestantes = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000);
    return finaliser({ error: `Trop de tentatives incorrectes. Réessayez dans ${minutesRestantes} minute${minutesRestantes > 1 ? "s" : ""}.`, code: "LOCKED" }, 429);
  }

  const membreNom = `${row.prenom} ${row.nom}`;

  const echec = async (raison: string) => {
    const failedAttempts = (row.failed_attempts ?? 0) + 1;
    const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
    await supabaseAdmin.from("institution_membres").update({ failed_attempts: failedAttempts, locked_until: lockedUntil }).eq("id", membre.membreId);
    await enregistrerAction({
      institutionId: membre.institutionId, membreId: membre.membreId, membreNom,
      action: "reauth_echec", cibleTable: "institution_membres", cibleId: membre.membreId,
      details: { raison }, req: request,
    });
    return enregistrerTentative(supabaseAdmin, {
      endpointCategory: "institution_login", deviceId, ip, identifiant: row.identifiant, outcome: raison, userAgent,
    });
  };

  const pinValide = await bcrypt.compare(pin, pinHashAVerifier);
  if (!pinValide) {
    const etat = await echec("pin_incorrect");
    return finaliser({ error: "Le PIN saisi est incorrect. Réessayez.", code: "INVALID_CREDENTIALS", security: etat }, 401);
  }

  if (row.totp_enabled) {
    if (typeof totpCode !== "string" || !totpCode.trim()) {
      return finaliser({ requiresTotp: true }, 200);
    }
    let totpValide = row.totp_secret ? (await verifyTotp({ secret: row.totp_secret, token: totpCode.trim(), epochTolerance: 30 })).valid : false;
    if (!totpValide && Array.isArray(row.totp_backup_codes)) {
      const codes: string[] = row.totp_backup_codes;
      for (let i = 0; i < codes.length; i++) {
        if (await bcrypt.compare(totpCode.trim(), codes[i])) {
          totpValide = true;
          const restants = [...codes];
          restants.splice(i, 1);
          await supabaseAdmin.from("institution_membres").update({ totp_backup_codes: restants }).eq("id", membre.membreId);
          break;
        }
      }
    }
    if (!totpValide) {
      const etat = await echec("totp_incorrect");
      return finaliser({ error: "Ce code est incorrect ou a expiré. Vérifiez l'heure de votre téléphone, ou utilisez un code de secours.", code: "INVALID_CREDENTIALS", security: etat }, 401);
    }
  }

  if (row.failed_attempts > 0 || row.locked_until) {
    await supabaseAdmin.from("institution_membres").update({ failed_attempts: 0, locked_until: null }).eq("id", membre.membreId);
  }
  const etatVerifie = await enregistrerTentative(supabaseAdmin, {
    endpointCategory: "institution_login", deviceId, ip, identifiant: row.identifiant, outcome: "code_correct", userAgent,
  });

  // Rotation — nouvelle session avec reauth_at déjà renseigné, ancienne
  // révoquée. Ne touche jamais aux autres sessions/appareils de ce membre.
  const expiresAt = new Date(Date.now() + INSTITUTION_SESSION_TTL_MS).toISOString();
  const nowIso = new Date().toISOString();
  const { data: nouvelleSession, error: sessionError } = await supabaseAdmin
    .from("institution_sessions")
    .insert({ institution_id: membre.institutionId, membre_id: membre.membreId, user_agent: userAgent, ip, expires_at: expiresAt, reauth_at: nowIso })
    .select("id")
    .single();
  if (sessionError || !nouvelleSession) {
    console.error("[INSTITUTION REAUTH] Erreur création session:", sessionError?.message);
    return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
  }

  await supabaseAdmin
    .from("institution_sessions")
    .update({ revoked_at: nowIso, revoked_reason: "reauth_rotation" })
    .eq("id", membre.sid);

  await enregistrerAction({
    institutionId: membre.institutionId, membreId: membre.membreId, membreNom,
    action: "reauth_reussie", cibleTable: "institution_membres", cibleId: membre.membreId,
    req: request,
  });

  const token = await new SignJWT({ institutionId: membre.institutionId, membreId: membre.membreId, role: membre.role, sid: nouvelleSession.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(membre.institutionId)
    .setIssuedAt()
    .setExpirationTime(INSTITUTION_SESSION_TTL_JWT)
    .setIssuer("yelen224-institution")
    .setAudience("yelen224-institution-dashboard")
    .sign(JWT_SECRET);

  const response = finaliser({ success: true, security: etatVerifie }, 200);
  response.cookies.set("yelen224_institution_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return response;
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
