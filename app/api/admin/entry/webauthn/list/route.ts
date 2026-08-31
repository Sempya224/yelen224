import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Admin Entry Security V2 — Lot 3 (30/08/2026). Lecture seule, protégée —
// liste les credentials d'entrée actifs pour /admin/security/entree.
// Révocation : hors périmètre du Lot 3 (CEO : "aucune fonctionnalité
// supplémentaire") — à faire par Bryan en SQL direct pendant les tests
// (UPDATE admin_entry_webauthn_credentials SET revoked_at = now() ...),
// interface de révocation à construire dans un lot séparé si validé.
export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, "admin_entry.manage");
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("admin_entry_webauthn_credentials")
      .select("id, device_label, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ credentials: data || [] });
  } catch (error) {
    console.error("[ADMIN ENTRY WEBAUTHN LIST ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405 });
}
