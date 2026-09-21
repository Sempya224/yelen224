import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedMembre } from "@/lib/institutionAuth";
import { canAccessTab } from "@/lib/institutionPermissions";
import { calculerBornesCommunaute, calculerCriteresPresence, scorePresencePct, type PeriodeCommunaute } from "@/lib/communauteProAnalytics";

// Yelen Community — onglet Présence (16/09/2026, brief CEO). Répond à
// "comment les citoyens découvrent l'établissement et que font-ils
// ensuite", distinct d'Audience ("qui vous suit") — même principe de
// séparation que la Vue d'ensemble/Performance/Audience déjà en place.
//
// Hors périmètre V1 (même décision que l'onglet Audience, 16/09/2026) :
// "Apparitions" (nombre de fois où l'établissement est présenté dans une
// liste/carrousel, distinct d'une vraie ouverture de fiche) et "Sources de
// découverte" (recherche/fil/publication/partage) — aucune table ne trace
// aujourd'hui où un citoyen a vu l'établissement avant d'ouvrir sa fiche
// (institution_vues/post_impressions n'ont pas de colonne "source").
// Chantier d'instrumentation séparé, couvrira les 2 onglets à la fois.
//
// "Recherches ayant affiché votre établissement" — recherches_populaires
// est un compteur global par terme, jamais relié à quelle institution est
// apparue dans les résultats : donnée non disponible non plus, même stub
// honnête que ci-dessus.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function jourStr(d: Date): string { return d.toISOString().slice(0, 10); }

export async function GET(req: NextRequest) {
  const membre = await getAuthenticatedMembre(req);
  if (!membre) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (canAccessTab(membre.role, "communaute-pro") === "none") {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }
  const instId = membre.institutionId;

  const periodeParam = req.nextUrl.searchParams.get("periode");
  const periode: PeriodeCommunaute = periodeParam === "7j" || periodeParam === "90j" || periodeParam === "12mois" ? periodeParam : "30j";
  const { debut, fin } = calculerBornesCommunaute(periode);

  const [{ data: vuesRows }, { data: postsRow }, { count: nbRdv }, { count: nbConversations }, { data: instRow }] = await Promise.all([
    sb.from("institution_vues").select("citoyen_id, created_at").eq("institution_id", instId).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
    sb.from("posts").select("id").eq("institution_auteur_id", instId).eq("auteur_type", "institution"),
    sb.from("rdv").select("id", { count: "exact", head: true }).eq("institution_id", instId).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString()),
    sb.from("conversations").select("id", { count: "exact", head: true }).eq("institution_id", instId).gte("cree_le", debut.toISOString()).lte("cree_le", fin.toISOString()),
    sb.from("institutions").select("logo, banniere, description, adresse, horaires, services, phone, whatsapp, secteur, ville").eq("id", instId).maybeSingle(),
  ]);

  const vues = vuesRows ?? [];
  const postIds = (postsRow ?? []).map(p => p.id);
  let nbVuesPublications = 0;
  if (postIds.length > 0) {
    const { count } = await sb.from("post_vues").select("id", { count: "exact", head: true }).in("post_id", postIds).gte("created_at", debut.toISOString()).lte("created_at", fin.toISOString());
    nbVuesPublications = count ?? 0;
  }

  const visiteursUniques = new Set(vues.map(v => v.citoyen_id).filter((id): id is string => !!id)).size;

  const serieParJour = new Map<string, { vuesJour: number; visiteursJour: Set<string> }>();
  for (let d = new Date(debut); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    serieParJour.set(jourStr(d), { vuesJour: 0, visiteursJour: new Set() });
  }
  for (const v of vues) {
    const cle = jourStr(new Date(v.created_at));
    const entree = serieParJour.get(cle);
    if (!entree) continue;
    entree.vuesJour++;
    if (v.citoyen_id) entree.visiteursJour.add(v.citoyen_id);
  }
  const serie = [...serieParJour.entries()].map(([date, v]) => ({ date, vues: v.vuesJour, visiteurs: v.visiteursJour.size }));

  const actions = {
    voir_profil: vues.length,
    voir_publication: nbVuesPublications,
    prendre_rdv: nbRdv ?? 0,
    ouvrir_messagerie: nbConversations ?? 0,
  };

  const criteres = instRow ? calculerCriteresPresence(instRow) : [];
  const scorePct = scorePresencePct(criteres);

  return NextResponse.json({
    bornes: { debut: debut.toISOString(), fin: fin.toISOString() },
    kpi: {
      vues_profil: vues.length,
      visiteurs_uniques: visiteursUniques,
      apparitions: null,
      actions_total: actions.voir_profil + actions.voir_publication + actions.prendre_rdv + actions.ouvrir_messagerie,
    },
    serie,
    actions,
    profil: instRow ? { logo: instRow.logo, secteur: instRow.secteur, adresse: instRow.adresse, ville: instRow.ville, description: instRow.description, horaires: instRow.horaires } : null,
    score_presence: { pct: scorePct, criteres },
  });
}
