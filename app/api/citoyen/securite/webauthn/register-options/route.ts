import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { generateRegistrationOptions } from "@simplewebauthn/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Secret dédié — jamais réutilisé depuis ADMIN_JWT_SECRET ou
// INSTITUTION_JWT_SECRET (3 systèmes d'auth distincts, cf. CLAUDE.md
// /auth : mélanger leurs secrets brouillerait la frontière entre eux).
const JWT_SECRET = new TextEncoder().encode(process.env.CITOYEN_WEBAUTHN_JWT_SECRET!);
const RP_NAME = "YELEN224";

function getWebAuthnRpID(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    try { return new URL(envUrl).hostname; } catch {}
  }
  return new URL(request.url).hostname;
}

// Enrôler un nouveau credential exige une session existante (accessToken
// Supabase) — on attache un facteur d'authentification à un compte
// précis, jamais sans savoir de façon certaine lequel (même garde que
// register-options côté institution).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = body?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const { data: citoyen } = await supabaseAdmin.from("users").select("id, prenom, nom, phone").eq("id", user.id).single();
    if (!citoyen) {
      return NextResponse.json({ error: "Compte introuvable", code: "NOT_FOUND" }, { status: 404 });
    }

    const displayName = [citoyen.prenom, citoyen.nom].filter(Boolean).join(" ").trim() || citoyen.phone || "Citoyen Yelen";

    const { data: existingCreds } = await supabaseAdmin
      .from("citoyen_webauthn_credentials")
      .select("credential_id")
      .eq("citoyen_id", citoyen.id);

    const rpID = getWebAuthnRpID(request);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(citoyen.id),
      userName: displayName,
      userDisplayName: displayName,
      attestationType: "none",
      excludeCredentials: (existingCreds || []).map((c) => ({ id: c.credential_id })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
    });

    // Challenge encodé dans un JWT signé courte durée (5 min), pas stocké en
    // mémoire serveur (ne survit pas de façon fiable entre deux invocations
    // de fonction serverless Netlify) — même choix que côté institution.
    const challengeToken = await new SignJWT({ citoyenId: citoyen.id, challenge: options.challenge })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .setIssuer("yelen224-citoyen-webauthn")
      .sign(JWT_SECRET);

    return NextResponse.json({ success: true, options, challengeToken });
  } catch (error) {
    console.error("[CITOYEN WEBAUTHN REGISTER OPTIONS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
