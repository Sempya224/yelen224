import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { extraireIpClient } from "@/lib/edgeSecurity";
import {
  resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentativeAdminEntry, messageSecurite,
} from "@/lib/security/authSecurity";
import { getWebAuthnRpID } from "@/lib/webauthnOrigin";
import { mintAdminEntryChallengeToken } from "@/lib/adminEntry";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Admin Entry Security V2 — Lot 3 (30/08/2026). Route PUBLIQUE (aucune
// session, aucun cookie admin requis — c'est le but : établir un droit
// d'entrée AVANT toute authentification). Option A verrouillée par la
// décision CEO (docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md, section 2) :
// aucun identifiant fourni par le client — allowCredentials est construit
// à partir de TOUTES les lignes actives de admin_entry_webauthn_credentials,
// jamais un filtre par entité (il n'y en a pas, par conception — un
// credential appartient au droit d'entrée, pas à un compte précis).
export async function POST(request: NextRequest) {
  const { deviceId, estNouveau } = resoudreDeviceId(request);
  const ip = extraireIpClient(request);

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status });
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
    return response;
  };

  try {
    const porte = await evaluerTentativeAdminEntry(supabaseAdmin, { deviceId, ip });
    if (porte.state === "blocked" || porte.state === "support_only") {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
        423
      );
    }

    const { data: creds } = await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .select("credential_id")
      .is("revoked_at", null);

    if (!creds || creds.length === 0) {
      // Même code que citoyen/institution quand aucun credential n'existe —
      // ne révèle rien de plus qu'un formulaire de connexion classique.
      return finaliser({ error: "Accès non configuré", code: "NOT_CONFIGURED" }, 404);
    }

    const rpID = getWebAuthnRpID(request);

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: creds.map((c) => ({ id: c.credential_id })),
      userVerification: "required",
    });

    const challengeToken = await mintAdminEntryChallengeToken(options.challenge);

    return finaliser({ success: true, options, challengeToken }, 200);
  } catch (error) {
    console.error("[ADMIN ENTRY WEBAUTHN AUTH OPTIONS ERROR]", error);
    return finaliser({ error: "Erreur serveur", code: "SERVER_ERROR" }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
