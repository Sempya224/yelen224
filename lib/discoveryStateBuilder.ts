// Guidance / Découverte — Lot 4 (26/08/2026). Assemble un DiscoveryState
// réel depuis les tables existantes — aucune nouvelle table de données
// métier, aucune duplication de logique déjà écrite ailleurs :
// - secteur le plus fréquenté : lib/citoyenTendances.ts::deriverTendancesCitoyen
//   (déjà exporté, déjà testé par "Vos tendances" — réutilisé tel quel).
// - offre correspondant à un centre d'intérêt : même requête et même
//   mapping que app/page.tsx (offreDecouverte, OFFRE_CATEGORIE_VERS_INTERETS),
//   dupliquée ici pour la même raison déjà actée dans ce projet (logique
//   inline non exportée côté page — voir citizenStateBuilder.ts pour le
//   précédent), jamais un second mapping inventé.
// - engagement/palier : lib/discoveryMemory.ts / lib/discoveryProgression.ts,
//   jamais recalculés ici.
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriverTendancesCitoyen, type RdvPourTendance } from "./citoyenTendances";
import { OFFRE_CATEGORIE_VERS_INTERETS } from "./offresCategories";
import { lireEngagement } from "./discoveryMemory";
import { synchroniserStade } from "./discoveryProgression";
import type { DiscoverySourceType, DiscoveryState, EngagementEntry } from "./discoveryEngine";
import { construireCitizenState } from "./citizenStateBuilder";
import { calculerEtatDattention } from "./attentionEngine";
import { lireMemoire } from "./attentionMemory";
import { construireSemaineState } from "./semaineStateBuilder";
import { calculerSemaine } from "./semaineEngine";

// Familles reconnues par discoveryEngine.ts — toute valeur hors de cet
// ensemble (ex. "avis", "budget", "etape" côté attentionEngine) n'a pas
// d'équivalent en découverte, donc rien à exclure pour elle.
const FAMILLES_DISCOVERY = new Set<DiscoverySourceType>([
  "rdv", "demarche", "depense", "interet", "offre", "community", "lecon", "calculatrice", "reward",
]);
function versDiscoverySource(source_type: string): DiscoverySourceType | null {
  return FAMILLES_DISCOVERY.has(source_type as DiscoverySourceType) ? (source_type as DiscoverySourceType) : null;
}

export async function construireDiscoveryState(
  supabase: SupabaseClient,
  citoyenId: string
): Promise<DiscoveryState> {
  const [rdvRes, demarchesRes, depensesRes, favorisRes, usersRes, derniereDemarcheRes, derniereDepenseRes] = await Promise.all([
    supabase.from("rdv")
      .select("institution_id,date_rdv,institutions!rdv_institution_id_fkey(name,secteur)")
      .eq("citoyen_id", citoyenId),
    supabase.from("citoyen_demarches").select("id", { count: "exact", head: true }).eq("citoyen_id", citoyenId),
    supabase.from("citoyen_depenses").select("id", { count: "exact", head: true }).eq("citoyen_id", citoyenId),
    supabase.from("citoyen_favoris").select("id", { count: "exact", head: true }).eq("citoyen_id", citoyenId),
    supabase.from("users").select("centres_interet,created_at").eq("id", citoyenId).maybeSingle(),
    // Dernier fait réel (états D/E, brief "Comptes existants sans activité")
    // — une seule ligne par table, aucune donnée dupliquée avec les compteurs
    // ci-dessus (head:true ne renvoie jamais la colonne de date).
    supabase.from("citoyen_demarches").select("created_at").eq("citoyen_id", citoyenId).order("created_at", { ascending: false }).limit(1),
    supabase.from("citoyen_depenses").select("date_depense").eq("citoyen_id", citoyenId).order("date_depense", { ascending: false }).limit(1),
  ]);

  type RdvRow = { institution_id: string; date_rdv: string; institutions: { name: string | null; secteur: string | null } | null };
  const rdvBruts = (rdvRes.data ?? []) as unknown as RdvRow[];
  const nb_rdv_total = rdvBruts.length;
  const rdvPourTendances: RdvPourTendance[] = rdvBruts.map((r) => ({
    institutionId: r.institution_id,
    institutionNom: r.institutions?.name ?? null,
    secteur: r.institutions?.secteur ?? null,
    dateRdv: r.date_rdv,
  }));
  const tendances = deriverTendancesCitoyen(rdvPourTendances);
  const secteur_top = tendances.suffisant && tendances.secteurTop
    ? { secteur: tendances.secteurTop, label: tendances.secteurTopLabel ?? tendances.secteurTop }
    : null;

  const nb_demarches_total = demarchesRes.count ?? 0;
  const nb_depenses_total = depensesRes.count ?? 0;
  const a_favoris = (favorisRes.count ?? 0) > 0;
  const userRow = usersRes.data as { centres_interet: string[] | null; created_at: string | null } | null;
  const centres_interet = userRow?.centres_interet ?? [];
  const compte_cree_le = userRow?.created_at ?? new Date().toISOString();

  // Dernier fait réel tous types confondus (états D/E) — comparaison de
  // chaînes ISO/date suffisante (ordre lexicographique = ordre chronologique
  // pour ces formats), jamais un Date() superflu pour une simple comparaison.
  const dateDerniereDemarche = ((derniereDemarcheRes.data ?? [])[0] as { created_at: string } | undefined)?.created_at ?? null;
  const dateDerniereDepense = ((derniereDepenseRes.data ?? [])[0] as { date_depense: string } | undefined)?.date_depense ?? null;
  const dateDernierRdv = rdvBruts.reduce<string | null>((max, r) => (!max || r.date_rdv > max ? r.date_rdv : max), null);
  const derniere_activite_le = [dateDerniereDemarche, dateDerniereDepense, dateDernierRdv]
    .filter((d): d is string => d !== null)
    .reduce<string | null>((max, d) => (!max || d > max ? d : max), null);

  // Une offre candidate max, uniquement si un centre d'intérêt réel est
  // déclaré — même garde-fou que app/page.tsx (jamais tout le catalogue).
  let offre_interet: DiscoveryState["offre_interet"] = null;
  if (centres_interet.length > 0) {
    const { data: offresData } = await supabase
      .from("offres")
      .select("id,titre,categorie,date_expiration")
      .eq("statut", "publiee")
      .or(`date_expiration.is.null,date_expiration.gt.${new Date().toISOString()}`)
      .order("epingle", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);
    type OffreRow = { id: string; titre: string; categorie: string; date_expiration: string | null };
    const match = ((offresData ?? []) as OffreRow[]).find((o) =>
      (OFFRE_CATEGORIE_VERS_INTERETS[o.categorie] || []).some((id) => centres_interet.includes(id))
    );
    if (match) offre_interet = { id: match.id, titre: match.titre, categorie: match.categorie, date_expiration: match.date_expiration };
  }

  const engagement = await lireEngagement(supabase, citoyenId) as Partial<Record<DiscoverySourceType, EngagementEntry>>;
  const stade_decouverte = await synchroniserStade(supabase, citoyenId, nb_rdv_total + nb_demarches_total + nb_depenses_total);

  // Déduplication inter-sections (brief "Pour vous" §12) : réutilise les
  // deux moteurs déjà construits (attention/semaine) tels quels, jamais une
  // seconde logique de priorité — seule la famille (source_type) du
  // prochain geste d'attention et des candidats "Cette semaine" du jour
  // sert à exclure la même famille ici.
  const [attentionMemoire, attentionState, semaineState] = await Promise.all([
    lireMemoire(supabase, citoyenId),
    construireCitizenState(supabase, citoyenId),
    construireSemaineState(supabase, citoyenId),
  ]);
  const { prochainGeste } = calculerEtatDattention(attentionState, attentionMemoire);
  const semaineCandidats = calculerSemaine(semaineState);
  const familles_deja_couvertes = [
    ...(prochainGeste ? [versDiscoverySource(prochainGeste.source_type)] : []),
    ...semaineCandidats.map((c) => versDiscoverySource(c.source_type)),
  ].filter((f): f is DiscoverySourceType => f !== null);

  return {
    citoyen_id: citoyenId,
    stade_decouverte,
    compte_cree_le,
    derniere_activite_le,
    nb_rdv_total,
    nb_demarches_total,
    nb_depenses_total,
    a_favoris,
    centres_interet,
    secteur_top,
    offre_interet,
    familles_deja_couvertes,
    engagement,
  };
}
