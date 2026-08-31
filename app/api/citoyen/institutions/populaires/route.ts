import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TOP_N = 15;
const FENETRE_LIGNES = 5000;

// Section "Populaire" du Search (Lot G, 28/08/2026, brief §9/§12) —
// combinaison déterministe de 3 signaux réels (vues de fiche, avis,
// réservations), zéro LLM, même philosophie que lib/reputationScore.ts.
// institution_vues/rdv ne sont lisibles qu'en service_role (RLS fermée en
// lecture directe) — cette route ne renvoie jamais les lignes brutes,
// seulement un classement d'ids + compteurs agrégés. Non authentifiée :
// la découverte fonctionne pour un citoyen non connecté, comme le reste
// de /recherche.
export async function GET() {
  try {
    const { data: institutions, error } = await supabaseAdmin
      .from("institutions")
      .select("id, nb_avis")
      .eq("statut", "validee")
      .limit(FENETRE_LIGNES);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!institutions || institutions.length === 0) return NextResponse.json({ ids: [] });

    const [{ data: vues }, { data: rdvRows }] = await Promise.all([
      supabaseAdmin.from("institution_vues").select("institution_id").limit(FENETRE_LIGNES),
      supabaseAdmin.from("rdv").select("institution_id").limit(FENETRE_LIGNES),
    ]);

    const vuesParInst = new Map<string, number>();
    (vues ?? []).forEach(v => vuesParInst.set(v.institution_id, (vuesParInst.get(v.institution_id) ?? 0) + 1));
    const rdvParInst = new Map<string, number>();
    (rdvRows ?? []).forEach(r => { if (r.institution_id) rdvParInst.set(r.institution_id, (rdvParInst.get(r.institution_id) ?? 0) + 1); });

    const maxVues = Math.max(1, ...institutions.map(i => vuesParInst.get(i.id) ?? 0));
    const maxAvis = Math.max(1, ...institutions.map(i => i.nb_avis ?? 0));
    const maxRdv = Math.max(1, ...institutions.map(i => rdvParInst.get(i.id) ?? 0));

    // Score composite — 3 signaux pondérés également, chacun normalisé sur
    // son propre maximum réel du jeu de données (jamais un seuil absolu
    // inventé). Une institution sans aucun signal (0 vue/avis/rdv) obtient
    // un score de 0, n'apparaît simplement pas dans le top si d'autres ont
    // un vrai signal.
    const classement = institutions
      .map(i => {
        const vues = vuesParInst.get(i.id) ?? 0;
        const avis = i.nb_avis ?? 0;
        const rdv = rdvParInst.get(i.id) ?? 0;
        const score = (vues / maxVues) * (1 / 3) + (avis / maxAvis) * (1 / 3) + (rdv / maxRdv) * (1 / 3);
        return { id: i.id, score, vues, avis, rdv };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    return NextResponse.json({ ids: classement.map(c => c.id), details: classement });
  } catch (error) {
    console.error("[INSTITUTIONS POPULAIRES GET ERROR]", error);
    return NextResponse.json({ error: "Erreur serveur", code: "SERVER_ERROR" }, { status: 500 });
  }
}
