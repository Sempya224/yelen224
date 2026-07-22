import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { flipAnnoncesPlanifiees } from "@/lib/annoncesAutoPublish";

// Lot D (refonte Communication → Annonces, 20/07/2026) — remplace le
// supabase.from("annonces").select(...) direct de la fiche publique
// institution (app/institution/[id]/page.tsx). Deux raisons : déclencher
// la bascule planifiée→publiée à la consultation (voir
// lib/annoncesAutoPublish.ts, pas de cron sur ce projet), et disposer d'un
// point d'entrée serveur unique pour le futur suivi d'engagement (Lot E —
// vues/likes/commentaires), plutôt que de multiplier les policies RLS
// publiques par table.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const institutionId = new URL(req.url).searchParams.get("institution_id");
  if (!institutionId) return NextResponse.json({ error: "institution_id requis" }, { status: 400 });

  await flipAnnoncesPlanifiees(sb, institutionId);

  const { data, error } = await sb
    .from("annonces")
    .select("id,titre,contenu,type,format,media_urls,epingle,image_url,created_at,date_expiration")
    .eq("institution_id", institutionId)
    .eq("statut", "publiee")
    .order("epingle", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const annonces = (data ?? []).filter((a) => !a.date_expiration || new Date(a.date_expiration) > new Date());
  return NextResponse.json({ annonces });
}
