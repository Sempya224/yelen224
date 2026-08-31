import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// Modification d'une activité (renommer/désactiver/réactiver, ajuster le
// statut réglementaire) — écriture exclusivement via la RPC
// modifier_activite (migration 20260821000003), jamais un UPDATE direct :
// c'est elle qui pose app.admin_id pour que le trigger
// activites_tracer_modification écrive activite_historique avec le bon
// auteur. Ne modifie jamais categorie_id/code (renommage contrôlé, pas
// une ré-affectation).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await authorizeAdmin(req, "activites.manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });

    const { label, description, statut, regulatory_status, regulatory_source } = body;

    const { data, error } = await sb.rpc("modifier_activite", {
      p_activite_id: id,
      p_admin_id: admin.adminId,
      p_label: label,
      p_description: description ?? null,
      p_statut: statut,
      p_regulatory_status: regulatory_status,
      p_regulatory_source: regulatory_source ?? null,
    }).single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await sb.from("admin_logs").insert({
      admin_id: admin.adminId,
      action: "MODIFIER_ACTIVITE",
      cible_table: "activites",
      cible_id: id,
      details: { label, statut, regulatory_status },
    });

    return NextResponse.json({ ok: true, activite: data });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
