import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdmin, adminAuthErrorResponse } from "@/lib/adminAuth";

// Chantier Taxonomie des activités (20/08/2026) — liste des activités
// pour l'écran admin app/admin/activites/page.tsx. Lecture seule ;
// écriture exclusivement via la RPC modifier_activite (route [id],
// migration 20260821000003) ou decider_demande_activite (rattachement/
// création depuis une demande "Autre activité").
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function GET(req: NextRequest) {
  try {
    await authorizeAdmin(req, "activites.manage");

    // Requête séparée plutôt qu'un embed PostgREST (activite_categories(...))
    // — un embed implicite a déjà cassé une route centrale par le passé
    // dans ce projet (CLAUDE.md /pieges-techniques-connus), on n'en
    // introduit pas un nouveau même sur une route à faible trafic.
    const [{ data: activites, error: errActivites }, { data: categories, error: errCategories }] = await Promise.all([
      sb.from("activites")
        .select("id,categorie_id,code,label,description,alias,ordre,statut,regulatory_status,regulatory_source,cree_le")
        .order("categorie_id", { ascending: true })
        .order("ordre", { ascending: true }),
      sb.from("activite_categories").select("id,code,label,ordre").order("ordre", { ascending: true }),
    ]);

    if (errActivites) return NextResponse.json({ error: errActivites.message }, { status: 500 });
    if (errCategories) return NextResponse.json({ error: errCategories.message }, { status: 500 });

    return NextResponse.json({ activites, categories });
  } catch (e) {
    return adminAuthErrorResponse(e);
  }
}
