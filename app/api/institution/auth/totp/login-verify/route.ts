import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { verify as verifyTotp } from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { verifyInstitutionTotpChallengeToken } from "@/lib/auth/institutionSession";
import { enregistrerAction } from "@/lib/journalActivite";
import { extraireIpClient } from "@/lib/edgeSecurity";
import { creerSessionInstitution, INSTITUTION_SESSION_TTL_JWT } from "@/lib/institutionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

// Verrouillage persisté sur institution_membres (migration
// 20260805000016) — remplace le Map en mémoire. challenge.membreId
// référence toujours une ligne institution_membres, y compris pour les
// flux OTP téléphone/PIN de déverrouillage/WebAuthn (le compte_principal
// créé automatiquement à l'inscription, migration 20260714000001) — ce
// verrouillage couvre donc bien tous les appelants de cette route
// partagée, pas seulement la connexion membre par identifiant+PIN.
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

async function lockedMsRemaining(membreId: string): Promise<number> {
  const { data } = await supabaseAdmin.from("institution_membres").select("locked_until").eq("id", membreId).maybeSingle();
  if (!data?.locked_until) return 0;
  const remaining = new Date(data.locked_until).getTime() - Date.now();
  return remaining > 0 ? remaining : 0;
}

async function registerFailure(membreId: string) {
  const { data } = await supabaseAdmin.from("institution_membres").select("failed_attempts").eq("id", membreId).maybeSingle();
  const failedAttempts = (data?.failed_attempts ?? 0) + 1;
  const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
  await supabaseAdmin.from("institution_membres").update({ failed_attempts: failedAttempts, locked_until: lockedUntil }).eq("id", membreId);
}

async function clearFailures(membreId: string) {
  await supabaseAdmin.from("institution_membres").update({ failed_attempts: 0, locked_until: null, derniere_connexion: new Date().toISOString() }).eq("id", membreId);
}

// Finalise réellement une connexion institution après que le facteur
// principal (OTP téléphone, PIN de déverrouillage, WebAuthn ou identifiant+
// PIN membre) a déjà réussi et émis un totpToken — seul point qui mint la
// vraie session (yelen224_institution_session) quand la 2FA est activée
// (chantier sécurité institution 25/07/2026, mirroring citoyen).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const totpToken = body?.totpToken;
    const code = body?.code;
    if (typeof totpToken !== "string" || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Requête incomplète", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const challenge = await verifyInstitutionTotpChallengeToken(totpToken);
    if (!challenge) {
      return NextResponse.json({ error: "Session de vérification expirée. Reconnectez-vous.", code: "INVALID_CHALLENGE" }, { status: 401 });
    }

    if ((await lockedMsRemaining(challenge.membreId)) > 0) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, { status: 429 });
    }

    const [{ data: membre }, { data: institution }] = await Promise.all([
      supabaseAdmin.from("institution_membres").select("totp_secret, totp_backup_codes").eq("id", challenge.membreId).maybeSingle(),
      supabaseAdmin.from("institutions").select("id, name, phone, statut").eq("id", challenge.institutionId).single(),
    ]);

    if (!membre?.totp_secret || !institution) {
      return NextResponse.json({ error: "Configuration 2FA introuvable.", code: "NOT_FOUND" }, { status: 404 });
    }

    // Institution suspendue — ne bloque plus ce point de finalisation
    // (révisé le 17/08/2026). Sûr de laisser passer ici : membre/login
    // bloque désormais AVANT même de minter un jeton de défi pour une
    // institution suspendue (voir ce fichier), donc un challenge qui arrive
    // ici pour une institution suspendue ne peut venir que des 3 flux
    // compte_principal (OTP téléphone, WebAuthn, PIN de déverrouillage) —
    // jamais d'un membre d'équipe classique. Le flag `suspended` voyage
    // jusqu'à la réponse finale.
    const suspended = institution.statut === "suspendue";

    let codeValide = (await verifyTotp({ secret: membre.totp_secret, token: code.trim() })).valid;
    if (!codeValide && Array.isArray(membre.totp_backup_codes)) {
      const codes: string[] = membre.totp_backup_codes;
      for (let i = 0; i < codes.length; i++) {
        if (await bcrypt.compare(code.trim(), codes[i])) {
          codeValide = true;
          const restants = [...codes];
          restants.splice(i, 1);
          await supabaseAdmin.from("institution_membres").update({ totp_backup_codes: restants }).eq("id", challenge.membreId);
          break;
        }
      }
    }

    if (!codeValide) {
      await registerFailure(challenge.membreId);
      return NextResponse.json({ error: "Code invalide", code: "INVALID_CODE" }, { status: 401 });
    }

    await clearFailures(challenge.membreId);

    if (challenge.membreNom) {
      await enregistrerAction({
        institutionId: challenge.institutionId,
        membreId: challenge.membreId,
        membreNom: challenge.membreNom,
        action: "connexion",
        cibleTable: "institution_membres",
        cibleId: challenge.membreId,
        req: request,
      });
    }

    // institution_sessions (dette technique comblée 30/08/2026, mirroring
    // admin_sessions) — voir lib/institutionAuth.ts::creerSessionInstitution.
    const sid = await creerSessionInstitution(supabaseAdmin, {
      institutionId: institution.id, phone: institution.phone,
      userAgent: request.headers.get("user-agent"), ip: extraireIpClient(request),
    });
    if (!sid) {
      return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
    }

    const token = await new SignJWT({ institutionId: institution.id, membreId: challenge.membreId, role: challenge.role, sid })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime(INSTITUTION_SESSION_TTL_JWT)
      .setIssuer("yelen224-institution")
      .setAudience("yelen224-institution-dashboard")
      .sign(JWT_SECRET);

    const response = NextResponse.json({
      success: true,
      institution: { id: institution.id, name: institution.name },
      membreId: challenge.membreId,
      role: challenge.role,
      suspended,
    });

    response.cookies.set("yelen224_institution_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    // "Se souvenir de moi" — même logique que verify-otp/route.ts, honorée
    // ici seulement (le choix a été fait avant la 2FA, transporté par le
    // jeton de défi).
    if (challenge.rememberMe) {
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      await supabaseAdmin.from("institution_remember_tokens").insert({
        institution_id: institution.id,
        token_hash: tokenHash,
        user_agent: request.headers.get("user-agent"),
        expires_at: expiresAt,
      });

      response.cookies.set("yelen224_institution_remember", rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 24 * 60 * 60,
        path: "/",
      });
    }

    return response;

  } catch (error) {
    console.error("[INSTITUTION TOTP LOGIN VERIFY ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
