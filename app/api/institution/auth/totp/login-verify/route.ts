import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { verify as verifyTotp } from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { verifyInstitutionTotpChallengeToken } from "@/lib/auth/institutionSession";
import { enregistrerAction } from "@/lib/journalActivite";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.INSTITUTION_JWT_SECRET!);

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

function lockedMsRemaining(membreId: string): number {
  const entry = failedAttempts.get(membreId);
  if (!entry) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

function registerFailure(membreId: string) {
  const now = Date.now();
  const entry = failedAttempts.get(membreId);
  const count = entry && entry.lockedUntil === 0 ? entry.count + 1 : 1;
  const lockedUntil = count >= 5 ? now + 5 * 60 * 1000 : 0;
  failedAttempts.set(membreId, { count, lockedUntil });
}

function clearFailures(membreId: string) {
  failedAttempts.delete(membreId);
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

    if (lockedMsRemaining(challenge.membreId) > 0) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "LOCKED" }, { status: 429 });
    }

    const [{ data: membre }, { data: institution }] = await Promise.all([
      supabaseAdmin.from("institution_membres").select("totp_secret, totp_backup_codes").eq("id", challenge.membreId).maybeSingle(),
      supabaseAdmin.from("institutions").select("id, name, phone").eq("id", challenge.institutionId).single(),
    ]);

    if (!membre?.totp_secret || !institution) {
      return NextResponse.json({ error: "Configuration 2FA introuvable.", code: "NOT_FOUND" }, { status: 404 });
    }

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
      registerFailure(challenge.membreId);
      return NextResponse.json({ error: "Code invalide", code: "INVALID_CODE" }, { status: 401 });
    }

    clearFailures(challenge.membreId);

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

    const token = await new SignJWT({ institutionId: institution.id, membreId: challenge.membreId, role: challenge.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(institution.id)
      .setIssuedAt()
      .setExpirationTime("8h")
      .setIssuer("yelen224-institution")
      .setAudience("yelen224-institution-dashboard")
      .sign(JWT_SECRET);

    await supabaseAdmin.from("institution_sessions").insert({
      institution_id: institution.id,
      phone: institution.phone,
      user_agent: request.headers.get("user-agent"),
      is_active: true,
    });

    const response = NextResponse.json({
      success: true,
      institution: { id: institution.id, name: institution.name },
      membreId: challenge.membreId,
      role: challenge.role,
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
