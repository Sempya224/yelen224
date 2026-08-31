import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verify } from "otplib";
import bcrypt from "bcryptjs";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Pas de mot de passe institution à redemander (contraste avec l'admin) —
// la preuve de possession du 2e facteur lui-même (un code TOTP ou de
// secours valide) sert de confirmation pour désactiver, comme côté citoyen.
export async function POST(request: NextRequest) {
  try {
    const membre = await getAuthenticatedMembre(request);
    if (!membre) {
      return NextResponse.json({ error: "Non authentifié", code: "NO_SESSION" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const code = body?.code;
    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Code requis", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const { data: row } = await supabaseAdmin.from("institution_membres").select("totp_secret, totp_backup_codes").eq("id", membre.membreId).maybeSingle();
    if (!row?.totp_secret) {
      return NextResponse.json({ error: "La 2FA n'est pas activée.", code: "NOT_FOUND" }, { status: 400 });
    }

    let codeValide = (await verify({ secret: row.totp_secret, token: code.trim() })).valid;
    if (!codeValide && Array.isArray(row.totp_backup_codes)) {
      for (const hash of row.totp_backup_codes as string[]) {
        if (await bcrypt.compare(code.trim(), hash)) { codeValide = true; break; }
      }
    }
    if (!codeValide) {
      return NextResponse.json({ error: "Code invalide", code: "INVALID_CODE" }, { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from("institution_membres")
      .update({ totp_secret: null, totp_enabled: false, totp_backup_codes: null })
      .eq("id", membre.membreId);
    if (error) throw error;

    // institution_sessions (dette technique comblée 30/08/2026, remplace
    // institutions.session_revoked_at de GAP-04-04) — invalide toute session
    // active de l'institution (échelle institution entière, pas seulement ce
    // membre — voir lib/institutionAuth.ts). Désactiver un facteur de
    // sécurité force une reconnexion, y compris sur cet appareil (même
    // précédent que le chantier MFA Admin du 13/08/2026).
    const { error: revokeError } = await supabaseAdmin
      .from("institution_sessions")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "totp_disabled" })
      .eq("institution_id", membre.institutionId)
      .is("revoked_at", null);
    if (revokeError) console.error("[INSTITUTION TOTP DISABLE] Erreur révocation session:", revokeError.message);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[INSTITUTION TOTP DISABLE ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
