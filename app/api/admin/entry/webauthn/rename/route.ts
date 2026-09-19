import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Admin Entry Security V2 — lot dédié gestion des credentials (30/08/2026).
export async function POST(request: NextRequest) {
  try {
    await authorizeAdmin(request, "admin_entry.manage");
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { id, deviceLabel } = body as { id?: string; deviceLabel?: string };

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Identifiant manquant", code: "MISSING_FIELDS" }, { status: 400 });
    }
    if (typeof deviceLabel !== "string" || !deviceLabel.trim()) {
      return NextResponse.json({ error: "Nom requis", code: "MISSING_FIELDS" }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .update({ device_label: deviceLabel.trim() })
      .eq("id", id)
      .is("revoked_at", null)
      .select("id");

    if (error) {
      console.error("[ADMIN ENTRY WEBAUTHN RENAME ERROR]", error.code, error.message);
      return NextResponse.json({ error: "Erreur lors du renommage", code: "UPDATE_ERROR" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Appareil introuvable", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN ENTRY WEBAUTHN RENAME ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
