import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { can } from "@/lib/institutionPermissions";
import { hashAgentQrToken, signerDefiCheckin } from "@/lib/checkinAuth";
import { extraireIpClient } from "@/lib/edgeSecurity";
import { resoudreDeviceId, poserCookieDeviceSiNecessaire, evaluerTentative, enregistrerTentative, messageSecurite } from "@/lib/security/authSecurity";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// POST → étape 1 (scan du badge QR agent). N'authentifie rien : produit
// un challengeToken de 2 min, échangé ensuite contre un PIN par
// app/api/checkin/auth. Réponse volontairement générique dans tous les
// cas d'échec (badge inconnu/révoqué/compte inactif/rôle non autorisé) —
// le badge seul ne doit jamais permettre de distinguer ces cas (arbitrage
// Bryan 13/09/2026 : "le QR seul ne peut pas garantir la sécurité").
export async function POST(request: NextRequest) {
  const { deviceId, estNouveau } = resoudreDeviceId(request);
  const ip = extraireIpClient(request);
  const userAgent = request.headers.get("user-agent");

  const finaliser = (body: Record<string, unknown>, status: number) => {
    const response = NextResponse.json(body, { status });
    poserCookieDeviceSiNecessaire(response, deviceId, estNouveau);
    return response;
  };

  const echecGenerique = () => finaliser({ error: "Badge invalide ou inactif.", code: "BADGE_INVALIDE" }, 401);

  try {
    const porte = await evaluerTentative(supabaseAdmin, { deviceId, ip });
    if (porte.state === "blocked" || porte.state === "support_only") {
      return finaliser(
        { error: messageSecurite(porte.state), code: porte.state === "blocked" ? "AUTH_SECURITY_BLOCKED" : "AUTH_SECURITY_SUPPORT_ONLY", security: porte },
        423
      );
    }

    const body = await request.json().catch(() => null);
    const token = body?.token;
    if (typeof token !== "string" || !token.trim()) {
      return finaliser({ error: "Aucun badge détecté. Réessayez de le scanner.", code: "MISSING_TOKEN" }, 400);
    }

    const hash = hashAgentQrToken(token.trim());
    const { data: membre } = await supabaseAdmin
      .from("institution_membres")
      .select("id,institution_id,prenom,role,actif,checkin_qr_revoked_at")
      .eq("checkin_qr_hash", hash)
      .maybeSingle();

    if (!membre || !membre.actif || membre.checkin_qr_revoked_at) {
      await enregistrerTentative(supabaseAdmin, { endpointCategory: "checkin_login", deviceId, ip, outcome: "not_found", userAgent });
      return echecGenerique();
    }

    if (!can(membre.role, "appointment.check_in")) {
      await enregistrerTentative(supabaseAdmin, { endpointCategory: "checkin_login", deviceId, ip, outcome: "not_found", userAgent });
      return echecGenerique();
    }

    await enregistrerTentative(supabaseAdmin, { endpointCategory: "checkin_login", deviceId, ip, outcome: "trouve", userAgent });

    const challengeToken = await signerDefiCheckin({ membreId: membre.id, institutionId: membre.institution_id });
    return finaliser({ success: true, challengeToken, prenom: membre.prenom }, 200);
  } catch (error) {
    console.error("[CHECKIN IDENTIFY ERROR]", error);
    return finaliser({ error: "Une erreur est survenue. Réessayez dans un instant.", code: "SERVER_ERROR" }, 500);
  }
}
