import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";
import { getWebAuthnRpID } from "@/lib/webauthnOrigin";
import { mintAdminEntryChallengeToken } from "@/lib/adminEntry";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const RP_NAME = "YELEN224";

// Admin Entry Security V2 — Lot 3 (30/08/2026). Route PROTÉGÉE — enrôler un
// credential capable d'ouvrir /admin/login exige une VRAIE session admin
// déjà établie (admin_sessions, via authorizeAdmin) : jamais le grant
// d'entrée lui-même, qui n'existe pas encore au moment de l'enrôlement et
// ne pourrait de toute façon jamais servir de preuve d'autorisation
// (amorçage résolu par la session admin normale, cohérent avec la
// séparation de la décision section 1).
export async function POST(request: NextRequest) {
  try {
    await authorizeAdmin(request, "admin_entry.manage");
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const deviceLabel = typeof body?.deviceLabel === "string" && body.deviceLabel.trim() ? body.deviceLabel.trim() : undefined;

    const { data: existingCreds } = await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .select("credential_id")
      .is("revoked_at", null);

    const rpID = getWebAuthnRpID(request);

    // userID opaque et aléatoire — aucun compte admin individuel n'est
    // attaché à un credential d'entrée (Option A, décision section 2), donc
    // rien de réel à y encoder. Jamais réutilisé comme identité ensuite :
    // auth-verify ne lit jamais authenticationInfo.userHandle.
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: crypto.randomBytes(16),
      userName: deviceLabel || "Admin Yelen224",
      userDisplayName: deviceLabel || "Admin Yelen224",
      attestationType: "none",
      excludeCredentials: (existingCreds || []).map((c) => ({ id: c.credential_id })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
    });

    const challengeToken = await mintAdminEntryChallengeToken(options.challenge);

    return NextResponse.json({ success: true, options, challengeToken });
  } catch (error) {
    console.error("[ADMIN ENTRY WEBAUTHN REGISTER OPTIONS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
