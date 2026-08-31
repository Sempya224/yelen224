import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Ligne = { date: string; vues: number; clics: number };

// Bucket par jour (AAAA-MM-JJ) — même fonction pour vues et clics, aucune
// logique de comptage distincte entre les deux tables (structure identique).
function bucketParJour(rows: { created_at: string }[] | null): Record<string, number> {
  const m: Record<string, number> = {};
  (rows ?? []).forEach(r => {
    const d = r.created_at.slice(0, 10);
    m[d] = (m[d] ?? 0) + 1;
  });
  return m;
}

// Agrégation réelle vues/clics d'une institution — alimente le graphique
// "Performance des offres" (MesOffresPerformanceChart.tsx) et la colonne
// CTR de la table (MesOffresTable.tsx). Fenêtre fixe 30 jours ; le
// sélecteur 7j/30j du graphique retranche côté client, un seul fetch.
export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: mesOffres } = await sb.from("offres").select("id").eq("institution_id", membre.institutionId);
  const ids = (mesOffres ?? []).map(o => o.id);
  if (ids.length === 0) return NextResponse.json({ parJour: [], parOffre: {} });

  const depuis = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: vues }, { data: clics }] = await Promise.all([
    sb.from("offre_vues").select("offre_id, created_at").in("offre_id", ids).gte("created_at", depuis),
    sb.from("offre_clics").select("offre_id, created_at").in("offre_id", ids).gte("created_at", depuis),
  ]);

  const vuesParJour = bucketParJour(vues);
  const clicsParJour = bucketParJour(clics);
  const parJour: Ligne[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
    return { date: d, vues: vuesParJour[d] ?? 0, clics: clicsParJour[d] ?? 0 };
  });

  const parOffre: Record<string, { vues: number; clics: number }> = {};
  ids.forEach(id => { parOffre[id] = { vues: 0, clics: 0 }; });
  (vues ?? []).forEach(v => { if (parOffre[v.offre_id]) parOffre[v.offre_id].vues++; });
  (clics ?? []).forEach(c => { if (parOffre[c.offre_id]) parOffre[c.offre_id].clics++; });

  return NextResponse.json({ parJour, parOffre });
}
