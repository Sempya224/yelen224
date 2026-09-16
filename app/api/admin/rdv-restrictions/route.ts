import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse, AdminAuthError } from "@/lib/adminAuth";

// Vue admin des restrictions de rendez-vous (no-show, décision CEO
// 03/09/2026) — structure calquée sur app/api/admin/suspension-revisions/route.ts
// (filtre de statut/niveau, boîte de réception). Deux ressources distinctes
// exposées par la même route selon `filtre` : les restrictions elles-mêmes
// (tous/restreint_7j/restreint_30j/clos) et les demandes d'appel (appels).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    await authorizeAdmin(request, "citoyens.rdv_restrictions");

    const { searchParams } = new URL(request.url);
    const filtre = searchParams.get("filtre") || "tous";

    if (filtre === "appels") {
      const statut = searchParams.get("statut") || "en_attente";
      let query = supabaseAdmin
        .from("citoyen_rdv_appels")
        .select("id, reference, message, statut, created_at, decision_motif, decision_le, citoyen_id, restriction_id, users(prenom, nom, phone), citoyen_rdv_restrictions(reference, niveau, absences_total)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (statut !== "tous") query = query.eq("statut", statut);

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json(data ?? []);
    }

    let query = supabaseAdmin
      .from("citoyen_rdv_restrictions")
      .select("id, reference, niveau, absences_total, jusqu_au, statut, created_at, levee_le, levee_par, citoyen_id, users(prenom, nom, phone)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filtre !== "tous") query = query.eq("niveau", filtre);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    if (e instanceof AdminAuthError) return adminAuthErrorResponse(e);
    console.error("[ADMIN RDV RESTRICTIONS GET ERROR]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
