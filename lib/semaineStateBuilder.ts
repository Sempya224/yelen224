// Cette semaine — v1 (27/08/2026). Assemble un SemaineState réel depuis
// les tables existantes — aucune nouvelle table de données métier, aucune
// duplication de logique déjà écrite ailleurs :
// - bornes de semaine : lib/semaineEngine.ts::limitesSemaineCourante
//   (source unique, réutilisée par l'affichage du libellé côté page.tsx).
// - budget dépassé (pour exclure la carte dépense dominante déjà couverte
//   par l'État d'attention) : même seuil que lib/citizenStateBuilder.ts
//   (mois civil en cours, comparaison à montant_limite) — dupliqué ici
//   pour la même raison déjà actée dans ce projet (fichiers indépendants,
//   jamais un second seuil inventé).
// - engagement : lib/discoveryMemory.ts, jamais recalculé ici.
import type { SupabaseClient } from "@supabase/supabase-js";
import { limitesSemaineCourante, type SemaineSourceType, type SemaineState } from "./semaineEngine";
import { lireEngagement } from "./discoveryMemory";
import type { EngagementEntry } from "./discoveryEngine";

export async function construireSemaineState(
  supabase: SupabaseClient,
  citoyenId: string
): Promise<SemaineState> {
  const { debutISO, finISO } = limitesSemaineCourante();
  const debutDate = debutISO.slice(0, 10);
  const finDate = finISO.slice(0, 10);
  const aujourdHuiISO = new Date().toISOString();
  const debutMoisISO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  const [
    depensesSemaineRes, budgetsRes, depensesMoisRes,
    nouvelleDemarcheRes, etapesAvanceesRes,
    rdvEffectuesRes, rdvAVenirRes,
    pointsRes, avisCandidatsRes,
  ] = await Promise.all([
    supabase.from("citoyen_depenses").select("categorie,montant").eq("citoyen_id", citoyenId).gte("date_depense", debutDate).lte("date_depense", finDate),
    supabase.from("citoyen_budgets").select("categorie,montant_limite").eq("citoyen_id", citoyenId).eq("actif", true),
    supabase.from("citoyen_depenses").select("categorie,montant").eq("citoyen_id", citoyenId).gte("date_depense", debutMoisISO),
    supabase.from("citoyen_demarches").select("id,titre").eq("citoyen_id", citoyenId).gte("created_at", debutISO).lte("created_at", finISO).order("created_at", { ascending: false }).limit(1),
    supabase.from("citoyen_demarche_etapes").select("demarche_id,fait_le,citoyen_demarches(id,titre,created_at)").eq("citoyen_id", citoyenId).eq("fait", true).gte("fait_le", debutISO).lte("fait_le", finISO).order("fait_le", { ascending: false }),
    supabase.from("rdv").select("id", { count: "exact", head: true }).eq("citoyen_id", citoyenId).eq("statut", "termine").gte("termine_at", debutISO).lte("termine_at", finISO),
    supabase.from("rdv").select("id,date_rdv,institutions!rdv_institution_id_fkey(name)")
      .eq("citoyen_id", citoyenId).gte("date_rdv", aujourdHuiISO).lte("date_rdv", finISO)
      .not("statut", "in", "(refuse,annule,termine)").order("date_rdv", { ascending: true }).limit(1),
    supabase.from("points_transactions").select("points_delta").eq("citoyen_id", citoyenId).gt("points_delta", 0).gte("created_at", debutISO).lte("created_at", finISO),
    supabase.from("rdv").select("id,institution_id,institutions!rdv_institution_id_fkey(name)").eq("citoyen_id", citoyenId).eq("statut", "termine").eq("avis_demande", true),
  ]);

  // --- Dépenses de la semaine + catégorie dominante (uniquement si une
  // vraie pluralité se dégage, jamais un artefact d'une dépense isolée) --
  type DepenseRow = { categorie: string; montant: number };
  const depensesSemaine = (depensesSemaineRes.data ?? []) as DepenseRow[];
  const nb_depenses_semaine = depensesSemaine.length;
  const montant_total_semaine = depensesSemaine.reduce((s, d) => s + d.montant, 0);
  const totalParCategorie = new Map<string, number>();
  for (const d of depensesSemaine) totalParCategorie.set(d.categorie, (totalParCategorie.get(d.categorie) ?? 0) + d.montant);
  let categorie_dominante: SemaineState["categorie_dominante"] = null;
  if (montant_total_semaine > 0) {
    const [topCategorie, topMontant] = [...totalParCategorie.entries()].sort((a, b) => b[1] - a[1])[0];
    const part_pct = Math.round((topMontant / montant_total_semaine) * 100);
    if (part_pct >= 40) {
      const { CATEGORIE_LABEL_DEPENSE } = await import("./depenses");
      categorie_dominante = {
        categorie: topCategorie,
        label: (CATEGORIE_LABEL_DEPENSE as Record<string, string>)[topCategorie] ?? topCategorie,
        montant: topMontant,
        part_pct,
      };
    }
  }

  // --- Exclusion si cette catégorie a déjà un budget mensuel dépassé actif
  // (même seuil que lib/citizenStateBuilder.ts) — jamais la même histoire
  // racontée à la fois par "À faire" et "Cette semaine" -------------------
  let categorie_dominante_deja_signalee_attention = false;
  if (categorie_dominante) {
    const depensesMois = (depensesMoisRes.data ?? []) as DepenseRow[];
    const totalMoisParCategorie = new Map<string, number>();
    for (const d of depensesMois) totalMoisParCategorie.set(d.categorie, (totalMoisParCategorie.get(d.categorie) ?? 0) + d.montant);
    type BudgetRow = { categorie: string | null; montant_limite: number };
    categorie_dominante_deja_signalee_attention = ((budgetsRes.data ?? []) as BudgetRow[]).some((b) =>
      b.categorie === categorie_dominante!.categorie && (totalMoisParCategorie.get(b.categorie) ?? 0) > b.montant_limite
    );
  }

  // --- Démarches : nouvelle cette semaine, sinon étape franchie cette
  // semaine sur une démarche pas elle-même créée cette semaine (déjà
  // couverte par le cas "nouvelle") ---------------------------------------
  type NouvelleDemarcheRow = { id: string; titre: string };
  const nouvelleDemarcheRows = (nouvelleDemarcheRes.data ?? []) as NouvelleDemarcheRow[];
  const nouvelle_demarche = nouvelleDemarcheRows[0] ?? null;

  type EtapeAvanceeRow = { demarche_id: string; fait_le: string; citoyen_demarches: { id: string; titre: string; created_at: string } | null };
  let demarche_avancee: SemaineState["demarche_avancee"] = null;
  if (!nouvelle_demarche) {
    const candidate = ((etapesAvanceesRes.data ?? []) as unknown as EtapeAvanceeRow[])
      .find((e) => e.citoyen_demarches && e.citoyen_demarches.created_at < debutISO);
    if (candidate?.citoyen_demarches) demarche_avancee = { id: candidate.citoyen_demarches.id, titre: candidate.citoyen_demarches.titre };
  }

  // --- Rendez-vous : effectués cette semaine (compte), prochain à venir
  // cette semaine (un seul, le plus proche) -------------------------------
  const nb_rdv_effectues_semaine = rdvEffectuesRes.count ?? 0;
  type RdvAVenirRow = { id: string; date_rdv: string; institutions: { name: string | null } | null };
  const rdvAVenirRows = (rdvAVenirRes.data ?? []) as unknown as RdvAVenirRow[];
  const rdv_a_venir_semaine = rdvAVenirRows[0]
    ? { id: rdvAVenirRows[0].id, institution: rdvAVenirRows[0].institutions?.name ?? "l'institution", date: rdvAVenirRows[0].date_rdv }
    : null;

  // --- Points Yelen Reward gagnés cette semaine (deltas positifs uniquement,
  // jamais compensés par une pénalité — "gagnés" ne veut pas dire "solde") --
  const points_gagnes_semaine = ((pointsRes.data ?? []) as { points_delta: number }[]).reduce((s, p) => s + p.points_delta, 0);

  // --- Avis en attente (même requête que app/api/citoyen/assistant/route.ts,
  // dupliquée ici pour la même raison déjà actée dans ce projet — recroiser
  // avec avis.brouillon=false plutôt que de se fier au seul rdv.avis_demande) --
  type AvisCandidatRow = { id: string; institution_id: string; institutions: { name: string | null } | null };
  const avisCandidats = (avisCandidatsRes.data ?? []) as unknown as AvisCandidatRow[];
  let avis_en_attente: SemaineState["avis_en_attente"] = [];
  if (avisCandidats.length > 0) {
    const { data: avisExistants } = await supabase.from("avis").select("rdv_id").in("rdv_id", avisCandidats.map((c) => c.id)).eq("brouillon", false);
    const dejaAvis = new Set(((avisExistants ?? []) as { rdv_id: string }[]).map((a) => a.rdv_id));
    avis_en_attente = avisCandidats.filter((c) => !dejaAvis.has(c.id)).map((c) => ({ id: c.id, institution: c.institutions?.name ?? "l'institution" }));
  }

  // citoyen_recommendation_events est partagé avec lib/discoveryEngine.ts,
  // dont plusieurs source_type portent les mêmes noms bruts ("depense",
  // "demarche", "rdv", "reward") — sans préfixe, leurs historiques de
  // fraîcheur/confiance se mélangeraient (lireEngagement regroupe par seul
  // source_type, jamais par categorie). Toutes les écritures liées à
  // "Cette semaine" utilisent donc le préfixe "semaine_" côté table ; on le
  // retire ici pour retrouver les clés propres attendues par le moteur.
  const engagementBrut = await lireEngagement(supabase, citoyenId);
  const engagement: Partial<Record<SemaineSourceType, EngagementEntry>> = {};
  for (const [cle, valeur] of Object.entries(engagementBrut)) {
    if (valeur && cle.startsWith("semaine_")) engagement[cle.slice("semaine_".length) as SemaineSourceType] = valeur;
  }

  return {
    citoyen_id: citoyenId,
    semaine_debut: debutISO,
    semaine_fin: finISO,
    nb_depenses_semaine,
    montant_total_semaine,
    categorie_dominante,
    categorie_dominante_deja_signalee_attention,
    nouvelle_demarche,
    demarche_avancee,
    nb_rdv_effectues_semaine,
    rdv_a_venir_semaine,
    points_gagnes_semaine,
    avis_en_attente,
    engagement,
  };
}
