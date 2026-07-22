import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const JWT_SECRET = new TextEncoder().encode(process.env.CITOYEN_WEBAUTHN_JWT_SECRET!);

function getWebAuthnRpID(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    try { return new URL(envUrl).hostname; } catch {}
  }
  return new URL(request.url).hostname;
}

const ipAttempts = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Pas de session ici : c'est justement le but — permettre à un appareil
// déjà enrôlé de rétablir une session sans repasser par le flow
// téléphone + OTP complet (même modèle que l'institution). Le citoyenId
// fourni n'est qu'une prétention d'identité ; c'est auth-verify
// (vérification de signature) qui la prouve cryptographiquement.
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    if (!checkIpRateLimit(ip)) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes.", code: "RATE_LIMITED" }, { status: 429 });
    }

    const body = await request.json();
    const { citoyenId } = body;

    if (!citoyenId || typeof citoyenId !== "string") {
      return NextResponse.json({ error: "citoyenId requis", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const { data: creds } = await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .select("credential_id")
      .eq("citoyen_id", citoyenId);

    if (!creds || creds.length === 0) {
      return NextResponse.json({ error: "Aucun accès rapide configuré pour ce compte", code: "NOT_CONFIGURED" }, { status: 404 });
    }

    const rpID = getWebAuthnRpID(request);

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
      userVerification: "required",
    });

    const challengeToken = await new SignJWT({ citoyenId, challenge: options.challenge })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .setIssuer("yelen224-citoyen-webauthn")
      .sign(JWT_SECRET);

    return NextResponse.json({ success: true, options, challengeToken });
  } catch (error) {
    console.error("[CITOYEN WEBAUTHN AUTH OPTIONS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
