import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { enregistrerAction } from "@/lib/journalActivite";
import { mintInstitutionTotpChallengeToken } from "@/lib/auth/institutionSession";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative,
  enregistrerTentative, messageSecurite,
} from "@/lib/security/authSecurity";
import { creerSessionInstitution, INSTITUTION_SESSION_TTL_JWT } from "@/lib/institutionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

// Verrouillage persisté en base (failed_attempts/locked_until, migration
// 20260805000016) — protège CE compte membre précis contre le brute-force
// ciblé, quel que soit l'appareil/IP d'origine. Complété (Lot 2 sécurité,
// 28/08/2026) par le throttle device+IP partagé de lib/security/
// authSecurity.ts (catégorie 'institution_login', commune aux 3 facteurs
// de connexion institution) — celui-ci protège contre l'énumération de
// plusieurs `identifiant` différents depuis un même appareil/IP, un angle
// que le verrouillage par compte ne couvre pas.
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

  try {
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip });
    if (porte.state === "blocked" || porte.state === "support_only") {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
        423
      );
    }

    const body = await request.json().catch(() => null);
    const identifiant = body?.identifiant;
    const pin = body?.pin;

    if (typeof identifiant !== "string" || !identifiant.trim() || typeof pin !== "string" || !pin) {
      return finaliser({ error: "Identifiant et PIN requis", code: "MISSING_FIELDS" }, 400);
    }

    const { data: membre } = await supabaseAdmin
      .from("institution_membres")
      .select("id,institution_id,pin_hash,role,actif,doit_changer_pin,prenom,nom,totp_enabled,failed_attempts,locked_until")
      .eq("identifiant", identifiant.trim())
      .maybeSingle();

    if (!membre || !membre.actif || !membre.pin_hash) {
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "institution_login", deviceId, ip, identifiant: identifiant.trim(), outcome: "not_found", userAgent,
      });
      return finaliser({ error: "Identifiant ou PIN incorrect", code: "INVALID_CREDENTIALS", security: etat }, 401);
    }

    if (membre.locked_until && new Date(membre.locked_until).getTime() > Date.now()) {
      return finaliser({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, 429);
    }

    const valid = await bcrypt.compare(pin, membre.pin_hash);
    if (!valid) {
      const failedAttempts = membre.failed_attempts + 1;
      const lockedUntil = failedAttempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : null;
      await supabaseAdmin.from("institution_membres").update({ failed_attempts: failedAttempts, locked_until: lockedUntil }).eq("id", membre.id);
      const etat = await enregistrerTentative(supabaseAdmin, {
        endpointCategory: "institution_login", deviceId, ip, identifiant: identifiant.trim(), outcome: "code_incorrect", userAgent,
      });
      return finaliser({ error: "Identifiant ou PIN incorrect", code: "INVALID_CREDENTIALS", security: etat }, 401);
    }

    const etatVerifie = await enregistrerTentative(supabaseAdmin, {
      endpointCategory: "institution_login", deviceId, ip, identifiant: identifiant.trim(), outcome: "code_correct", userAgent,
    });

    // Blocage connexion institution suspendue — confirmé le 17/08/2026 :
    // SEUL le compte_principal peut se connecter pendant une suspension
    // (pour atteindre l'écran "Espace suspendu"/révision), les membres
    // d'équipe classiques (ce flux identifiant+PIN, jamais compte_principal
    // en pratique) restent bloqués. Vérifié après validation du PIN (pas
    // avant : ne pas transformer cette route en oracle "cette institution
    // est suspendue" pour qui ne connaît que l'identifiant).
    const { data: instStatut } = await supabaseAdmin.from("institutions").select("statut").eq("id", membre.institution_id).maybeSingle();
    if (instStatut?.statut === "suspendue") {
      return finaliser({ error: "Votre établissement a été suspendu par l'équipe Yelen224. Connexion bloquée pour les membres d'équipe — seul le compte principal peut se connecter pour gérer cette situation.", code: "INSTITUTION_SUSPENDED", security: etatVerifie }, 403);
    }

    // 2FA TOTP (chantier sécurité institution 25/07/2026) — le PIN vient de
    // réussir, mais la session n'est établie (et l'action "connexion"
    // journalisée) qu'après validation du TOTP, via
    // /api/institution/auth/totp/login-verify — sinon la journalisation
    // enregistrerait une connexion pas encore réellement terminée.
    // failed_attempts est quand même remis à zéro ici (le PIN était
    // correct) ; derniere_connexion attend la validation TOTP finale.
    if (membre.totp_enabled) {
      await supabaseAdmin.from("institution_membres").update({ failed_attempts: 0, locked_until: null }).eq("id", membre.id);
      const totpToken = await mintInstitutionTotpChallengeToken({
        institutionId: membre.institution_id,
        membreId: membre.id,
        role: membre.role,
        rememberMe: false,
        membreNom: `${membre.prenom} ${membre.nom}`,
      });
      return finaliser({ requiresTotp: true, totpToken, security: etatVerifie }, 200);
    }

    await supabaseAdmin
      .from("institution_membres")
      .update({ failed_attempts: 0, locked_until: null, derniere_connexion: new Date().toISOString() })
      .eq("id", membre.id);

    await enregistrerAction({
      institutionId: membre.institution_id,
      membreId: membre.id,
      membreNom: `${membre.prenom} ${membre.nom}`,
      action: "connexion",
      cibleTable: "institution_membres",
      cibleId: membre.id,
      req: request,
    });

    // institution_sessions (dette technique comblée 30/08/2026, mirroring
    // admin_sessions) — voir lib/institutionAuth.ts::creerSessionInstitution.
    // Seul flux de connexion institution à n'avoir jamais écrit dans cette
    // table jusqu'ici (phone rendu nullable en migration 20260830000007
    // précisément pour ce flux, qui ne charge pas institutions.phone).
    const sid = await creerSessionInstitution(supabaseAdmin, {
      institutionId: membre.institution_id, userAgent: request.headers.get("user-agent"), ip,
    });
    if (!sid) {
      return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
    }

    const token = await new SignJWT({ institutionId: membre.institution_id, membreId: membre.id, role: membre.role, sid })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(membre.institution_id)
      .setIssuedAt()
      .setExpirationTime(INSTITUTION_SESSION_TTL_JWT)
      .setIssuer("yelen224-institution")
      .setAudience("yelen224-institution-dashboard")
      .sign(JWT_SECRET);

    const response = finaliser({
      success: true,
      institutionId: membre.institution_id,
      membreId: membre.id,
      role: membre.role,
      doitChangerPin: membre.doit_changer_pin,
      security: etatVerifie,
    }, 200);

    response.cookies.set("yelen224_institution_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[MEMBRE LOGIN ERROR]", error);
    return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
