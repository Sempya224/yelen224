import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { calculerScoreSecurite } from "@/lib/citoyenSecurite";
import { verifierCitoyenToken } from "@/lib/citoyenAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Un seul appel pour peupler l'écran Sécurité citoyen (Lot E) — mirroring
// api/institution/security-status. Ne renvoie jamais pin_hash, token_hash
// ou credential_id/public_key bruts, uniquement ce qui est nécessaire à
// l'affichage (libellé, dates) et à cibler une révocation (id).
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const user = await verifierCitoyenToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: "Session invalide ou expirée", code: "NO_SESSION" }, { status: 401 });
    }

    const [{ data: citoyen }, { data: credentials }, { data: rememberTokens }] = await Promise.all([
      supabaseAdmin.from("users").select("pin_hash, totp_enabled").eq("id", user.id).single(),
      supabaseAdmin
        .from("citoyen_webauthn_credentials")
        .select("id, device_label, created_at, last_used_at")
        .eq("citoyen_id", user.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("citoyen_remember_tokens")
        .select("id, token_hash, user_agent, ip, device_label, device_type, status, created_at, expires_at, last_used_at")
        .eq("citoyen_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const currentRememberToken = request.cookies.get("yelen224_citoyen_remember")?.value;
    const currentTokenHash = currentRememberToken
      ? crypto.createHash("sha256").update(currentRememberToken).digest("hex")
      : null;

    const pinConfigure = !!citoyen?.pin_hash;
    const biometrieActive = (credentials ?? []).length > 0;
    const totpActive = !!citoyen?.totp_enabled;
    const score = calculerScoreSecurite({ pinConfigure, biometrieActive, totpActive });

    return NextResponse.json({
      success: true,
      pin_configured: pinConfigure,
      totp_enabled: totpActive,
      webauthn_credentials: (credentials ?? []).map(c => ({
        id: c.id,
        device_label: c.device_label,
        created_at: c.created_at,
        last_used_at: c.last_used_at,
      })),
      remember_devices: (rememberTokens ?? []).map(t => ({
        id: t.id,
        device_label: t.device_label,
        device_type: t.device_type,
        // Trusted Device (30/08/2026) — 'trusted'/'pending'/'revoked',
        // voir supabase/migrations/20260830000004_trusted_device.sql.
        status: t.status,
        user_agent: t.user_agent,
        ip: t.ip,
        created_at: t.created_at,
        expires_at: t.expires_at,
        last_used_at: t.last_used_at,
        is_current_device: currentTokenHash !== null && t.token_hash === currentTokenHash,
      })),
      score,
    });
  } catch (error) {
    console.error("[CITOYEN SECURITY STATUS ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

