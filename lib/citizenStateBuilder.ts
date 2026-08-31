// État d'attention Yelen — Lot 1 (25/08/2026). Assemble un CitizenState
// réel depuis les tables existantes — aucune nouvelle table, aucune
// duplication de logique métier déjà écrite ailleurs :
// - démarches en retard/proches : lib/citoyenDemarchesRappels.ts (déjà
//   testé, réutilisé tel quel via prochaineDate).
// - budgets dépassés : même seuil que supabase/functions/citoyen-depenses-alertes
//   (mois civil en cours, comparaison au montant_limite), dupliqué une
//   fois de plus pour la même raison déjà actée dans ce projet (Deno vs
//   Node) — jamais un troisième seuil différent inventé.
// - récompenses : reward_unlocks + milestones (schéma vérifié, pas deviné).
// - anomalies de dépenses : même seuil que app/menu/depenses/depenses-client.tsx
//   Lot 6 "À surveiller" (mois dernier >= 10 000 GNF, hausse stricte,
//   variation >= 20%) — logique inline non exportée côté client (types
//   locaux Depense/Ligne), donc reproduite ici plutôt qu'importée.
// - dépenses récurrentes à venir : même fenêtre que
//   supabase/functions/citoyen-depenses-alertes Lot 8 (2 jours).
// - objectifs en cours : citoyen_objectifs_financiers (statut='actif' —
//   la transition vers 'atteint' se fait déjà à l'écriture d'une
//   contribution, voir app/menu/depenses/actions.ts, jamais recalculée
//   ici) + somme des contributions, exclu si aucune contribution réelle
//   (0% n'est pas une "progression positive" à afficher).
// - publications suivies / avis en attente : la règle anti-contenu-
//   générique du moteur (jamais poussé sans RDV lié) est appliquée dès
//   la requête — seules les institutions avec un RDV à venir réel sont
//   interrogées, jamais tout l'abonnement/historique du citoyen. Avis en
//   attente reprend le garde-fou déjà trouvé dans
//   app/api/citoyen/assistant/route.ts (recroiser avec `avis.brouillon=false`
//   plutôt que de faire confiance au seul flag `rdv.avis_demande`).
//
// `serviceRequiertIdentite` est un paramètre explicite, jamais déduit
// silencieusement : ce n'est vrai que dans le contexte d'une action
// précise (ex. accéder à un service qui l'exige), pas un fait ambiant du
// citoyen — l'assemblage général (accueil) le laisse à false par défaut.
import type { SupabaseClient } from "@supabase/supabase-js";
import { prochaineDate, type DemarcheRappel, type EtapeRappel } from "./citoyenDemarchesRappels";
import type { CitizenState } from "./attentionEngine";
import { CATEGORIES_DEPENSE, CATEGORIE_LABEL_DEPENSE } from "./depenses";

type Options = { serviceRequiertIdentite?: boolean };

export async function construireCitizenState(
  supabase: SupabaseClient,
  citoyenId: string,
  options: Options = {}
): Promise<CitizenState> {
  const aujourdHuiISO = new Date().toISOString().slice(0, 10);
  const anneeMois = new Date();
  const debutMoisISO = `${anneeMois.getFullYear()}-${String(anneeMois.getMonth() + 1).padStart(2, "0")}-01`;
  // Bornes du mois civil précédent, pour la comparaison "anomalie de
  // dépenses" (même règle que app/menu/depenses/depenses-client.tsx
  // Lot 6 "À surveiller", dupliquée ici pour la même raison déjà actée
  // dans ce fichier — jamais un second seuil inventé).
  const debutMoisDernier = new Date(anneeMois.getFullYear(), anneeMois.getMonth() - 1, 1);
  const debutMoisDernierISO = `${debutMoisDernier.getFullYear()}-${String(debutMoisDernier.getMonth() + 1).padStart(2, "0")}-01`;
  const finMoisDernierISO = new Date(anneeMois.getFullYear(), anneeMois.getMonth(), 0).toISOString().slice(0, 10);
  // Fenêtre "dépense récurrente à venir", même défaut que
  // citoyen-depenses-alertes Lot 8.
  const finFenetreRecurrence = new Date(); finFenetreRecurrence.setDate(finFenetreRecurrence.getDate() + 2);
  const finFenetreRecurrenceISO = finFenetreRecurrence.toISOString().slice(0, 10);

  const [rdvRes, demarchesRes, budgetsRes, depensesRes, depensesMoisDernierRes, recurrentesRes, objectifsRes, usersRes, unlocksRes] = await Promise.all([
    supabase.from("rdv")
      .select("id,institution_id,date_rdv,statut,institutions!rdv_institution_id_fkey(name)")
      .eq("citoyen_id", citoyenId)
      .gte("date_rdv", aujourdHuiISO)
      .not("statut", "in", "(refuse,annule,termine)")
      .order("date_rdv", { ascending: true }),
    supabase.from("citoyen_demarches")
      .select("id,titre,categorie,priorite,date_cible,institutions(name),etapes:citoyen_demarche_etapes(libelle,date_echeance,fait,ordre)")
      .eq("citoyen_id", citoyenId)
      .eq("statut", "en_cours"),
    supabase.from("citoyen_budgets").select("id,categorie,montant_limite").eq("citoyen_id", citoyenId).eq("actif", true),
    supabase.from("citoyen_depenses").select("categorie,montant").eq("citoyen_id", citoyenId).gte("date_depense", debutMoisISO).lte("date_depense", aujourdHuiISO),
    supabase.from("citoyen_depenses").select("categorie,montant").eq("citoyen_id", citoyenId).gte("date_depense", debutMoisDernierISO).lte("date_depense", finMoisDernierISO),
    supabase.from("citoyen_depenses").select("id,categorie,montant,description,recurrence_prochaine_date")
      .eq("citoyen_id", citoyenId)
      .neq("recurrence", "aucune")
      .not("recurrence_prochaine_date", "is", null)
      .gte("recurrence_prochaine_date", aujourdHuiISO)
      .lte("recurrence_prochaine_date", finFenetreRecurrenceISO),
    supabase.from("citoyen_objectifs_financiers").select("id,titre,montant_cible").eq("citoyen_id", citoyenId).eq("statut", "actif"),
    supabase.from("users").select("identite_verifiee").eq("id", citoyenId).maybeSingle(),
    supabase.from("reward_unlocks")
      .select("id,statut,milestones(label,statut_disponibilite)")
      .eq("citoyen_id", citoyenId)
      .neq("statut", "reclame"),
  ]);

  // --- RDV à venir + documents manquants -----------------------------
  type RdvRow = { id: string; institution_id: string; date_rdv: string; institutions: { name: string | null } | null };
  const rdvAVenirBruts = (rdvRes.data ?? []) as unknown as RdvRow[];
  const rdvIds = rdvAVenirBruts.map((r) => r.id);
  const { data: docsData } = rdvIds.length > 0
    ? await supabase.from("citoyen_documents").select("rdv_id,label").eq("citoyen_id", citoyenId).eq("statut", "en_attente").in("rdv_id", rdvIds)
    : { data: [] as { rdv_id: string; label: string }[] };
  const docsParRdv = new Map<string, string[]>();
  for (const d of (docsData ?? []) as { rdv_id: string; label: string }[]) {
    docsParRdv.set(d.rdv_id, [...(docsParRdv.get(d.rdv_id) ?? []), d.label]);
  }
  const rdv_a_venir = rdvAVenirBruts.map((r) => ({
    id: r.id,
    institution: r.institutions?.name ?? "l'institution",
    date: r.date_rdv,
    documents_manquants: docsParRdv.get(r.id) ?? [],
  }));
  // Institutions avec un RDV réel à venir — seule intersection pertinente
  // pour publications suivies / avis en attente (règle anti-contenu-
  // générique du moteur). `rdvRes` trié par date_rdv croissante : la
  // première rencontre par institution est bien le prochain RDV.
  const rdvAVenirParInstitution = new Map<string, string>();
  for (const r of rdvAVenirBruts) {
    if (!rdvAVenirParInstitution.has(r.institution_id)) rdvAVenirParInstitution.set(r.institution_id, r.id);
  }
  const institutionsAvecRdvAVenir = [...rdvAVenirParInstitution.keys()];

  // --- Démarches ouvertes : en retard/proche calculé par la logique déjà
  // existante et testée, jamais réimplémentée ici -----------------------
  type DemarcheRow = { id: string; titre: string; categorie: "personnel" | "professionnel" | null; priorite: DemarcheRappel["priorite"]; date_cible: string | null; institutions: { name: string | null } | null; etapes: EtapeRappel[] };
  const demarchesBrutes = ((demarchesRes.data ?? []) as unknown as DemarcheRow[]).map((d): DemarcheRappel => ({
    id: d.id, titre: d.titre, institutionNom: d.institutions?.name ?? null, dateCible: d.date_cible,
    etapes: d.etapes ?? [], categorie: d.categorie, priorite: d.priorite,
  }));
  const demarches_ouvertes = demarchesBrutes.map((d) => {
    const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
    const cible = prochaineDate(d);
    return {
      id: d.id, titre: d.titre, categorie: d.categorie ?? "personnel",
      echeance: cible ? cible.toISOString().slice(0, 10) : null,
      en_retard: !!cible && cible < aujourdHui,
    };
  });

  // --- Budgets dépassés (même seuil que citoyen-depenses-alertes) ------
  type DepenseRow = { categorie: string; montant: number };
  const depensesMois = (depensesRes.data ?? []) as DepenseRow[];
  const totalParCategorie = new Map<string, number>();
  for (const d of depensesMois) totalParCategorie.set(d.categorie, (totalParCategorie.get(d.categorie) ?? 0) + d.montant);
  const totalGlobal = depensesMois.reduce((s, d) => s + d.montant, 0);
  type BudgetRow = { id: string; categorie: string | null; montant_limite: number };
  const budgets_depasses = ((budgetsRes.data ?? []) as BudgetRow[])
    .map((b) => ({ id: b.id, categorie: b.categorie, total: b.categorie ? (totalParCategorie.get(b.categorie) ?? 0) : totalGlobal, limite: b.montant_limite }))
    .filter((b) => b.total > b.limite)
    .map((b) => ({ id: b.id, categorie: b.categorie ?? "mensuel", total: b.total, limite: b.limite }));

  // --- Anomalies de dépenses (variation vs. mois dernier, même règle que
  // depenses-client.tsx Lot 6 : plancher 10 000 GNF le mois dernier pour
  // ignorer le bruit sur de petits montants, hausse stricte, seuil 20%) --
  const depensesMoisDernier = (depensesMoisDernierRes.data ?? []) as DepenseRow[];
  const totalParCategorieMoisDernier = new Map<string, number>();
  for (const d of depensesMoisDernier) totalParCategorieMoisDernier.set(d.categorie, (totalParCategorieMoisDernier.get(d.categorie) ?? 0) + d.montant);
  const depenses_anomalies = CATEGORIES_DEPENSE.flatMap((c) => {
    const ceMois = totalParCategorie.get(c.id) ?? 0;
    const moisDernier = totalParCategorieMoisDernier.get(c.id) ?? 0;
    if (moisDernier < 10000 || ceMois <= moisDernier) return [];
    const variation_pct = Math.round(((ceMois - moisDernier) / moisDernier) * 100);
    if (variation_pct < 20) return [];
    return [{ id: `depense-anomalie-${c.id}-${debutMoisISO}`, categorie: c.id, variation_pct }];
  });

  // --- Dépenses récurrentes à venir (même fenêtre que
  // citoyen-depenses-alertes Lot 8) -------------------------------------
  type RecurrenteRow = { id: string; categorie: string; montant: number; description: string | null; recurrence_prochaine_date: string };
  const depenses_recurrentes_a_venir = ((recurrentesRes.data ?? []) as RecurrenteRow[]).map((d) => ({
    id: d.id,
    libelle: d.description || CATEGORIE_LABEL_DEPENSE[d.categorie as keyof typeof CATEGORIE_LABEL_DEPENSE] || d.categorie,
    montant: d.montant,
    date: d.recurrence_prochaine_date,
  }));

  // --- Objectifs en cours (progression réelle uniquement — 0% n'est pas
  // une progression positive à afficher) ---------------------------------
  type ObjectifRow = { id: string; titre: string; montant_cible: number };
  const objectifsActifs = (objectifsRes.data ?? []) as ObjectifRow[];
  const objectifIds = objectifsActifs.map((o) => o.id);
  const { data: contributionsData } = objectifIds.length > 0
    ? await supabase.from("citoyen_objectif_contributions").select("objectif_id,montant").in("objectif_id", objectifIds)
    : { data: [] as { objectif_id: string; montant: number }[] };
  const contribuParObjectif = new Map<string, number>();
  for (const c of (contributionsData ?? []) as { objectif_id: string; montant: number }[]) {
    contribuParObjectif.set(c.objectif_id, (contribuParObjectif.get(c.objectif_id) ?? 0) + c.montant);
  }
  const objectifs_en_cours = objectifsActifs.flatMap((o) => {
    const actuel = contribuParObjectif.get(o.id) ?? 0;
    if (actuel <= 0) return [];
    return [{ id: o.id, titre: o.titre, progression_pct: Math.round((actuel / o.montant_cible) * 100) }];
  });

  // --- Avis en attente (uniquement pour les institutions avec un RDV
  // réel à venir — la relance n'a de sens que dans ce contexte) ---------
  type AvisAttenteRow = { id: string; institution_id: string; institutions: { name: string | null } | null };
  let avis_en_attente: CitizenState["avis_en_attente"] = [];
  if (institutionsAvecRdvAVenir.length > 0) {
    const { data: avisAttenteRows } = await supabase.from("rdv")
      .select("id,institution_id,institutions!rdv_institution_id_fkey(name)")
      .eq("citoyen_id", citoyenId).eq("statut", "termine").eq("avis_demande", true)
      .in("institution_id", institutionsAvecRdvAVenir);
    const candidats = (avisAttenteRows ?? []) as unknown as AvisAttenteRow[];
    let dejaAvis = new Set<string>();
    if (candidats.length > 0) {
      const { data: avisExistants } = await supabase.from("avis").select("rdv_id")
        .in("rdv_id", candidats.map((c) => c.id)).eq("brouillon", false);
      dejaAvis = new Set((avisExistants ?? []).map((a) => (a as { rdv_id: string }).rdv_id));
    }
    avis_en_attente = candidats
      .filter((c) => !dejaAvis.has(c.id))
      .map((c) => ({ id: c.id, institution: c.institutions?.name ?? "l'institution", rdv_prochain_id: rdvAVenirParInstitution.get(c.institution_id) ?? null }));
  }

  // --- Publications des institutions suivies (citoyen_abonnements, même
  // restriction anti-contenu-générique) ----------------------------------
  type AnnonceRow = { id: string; titre: string; institution_id: string; date_expiration: string | null; institutions: { name: string | null } | null };
  let publications_etablissements_suivis: CitizenState["publications_etablissements_suivis"] = [];
  if (institutionsAvecRdvAVenir.length > 0) {
    const { data: abonnementsRows } = await supabase.from("citoyen_abonnements").select("institution_id")
      .eq("citoyen_id", citoyenId).in("institution_id", institutionsAvecRdvAVenir);
    const institutionsSuivies = (abonnementsRows ?? []).map((a) => (a as { institution_id: string }).institution_id);
    if (institutionsSuivies.length > 0) {
      const { data: annonceRows } = await supabase.from("annonces")
        .select("id,titre,institution_id,date_expiration,institutions(name)")
        .in("institution_id", institutionsSuivies).eq("statut", "publiee")
        .order("created_at", { ascending: false }).limit(10);
      const maintenant = new Date();
      publications_etablissements_suivis = ((annonceRows ?? []) as unknown as AnnonceRow[])
        .filter((a) => !a.date_expiration || new Date(a.date_expiration) > maintenant)
        .map((a) => ({ id: a.id, institution: a.institutions?.name ?? "l'institution", rdv_lie_id: rdvAVenirParInstitution.get(a.institution_id) ?? null, texte: a.titre }));
    }
  }

  // --- Récompenses disponibles (exclut les paliers pas encore ouverts,
  // ex. "Offres partenaires" tant qu'il est a_venir) --------------------
  type UnlockRow = { id: string; milestones: { label: string; statut_disponibilite: string } | null };
  const recompenses_disponibles = ((unlocksRes.data ?? []) as unknown as UnlockRow[])
    .filter((u) => u.milestones?.statut_disponibilite === "disponible")
    .map((u) => ({ id: u.id, label: u.milestones!.label }));

  return {
    citoyen_id: citoyenId,
    rdv_a_venir,
    demarches_ouvertes,
    service_requiert_identite: options.serviceRequiertIdentite ?? false,
    identite_verifiee: Boolean((usersRes.data as { identite_verifiee: boolean } | null)?.identite_verifiee),
    budgets_depasses,
    depenses_anomalies,
    depenses_recurrentes_a_venir,
    objectifs_en_cours,
    recompenses_disponibles,
    publications_etablissements_suivis,
    avis_en_attente,
  };
}
