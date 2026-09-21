import { createClient } from "@supabase/supabase-js";
import type { KpiMetric, PeriodeJours } from "./analyseAggregation";
import { type AcquisitionSource, ACQUISITION_SOURCE_LABELS } from "./acquisitionSource";

// Centre d'Analyse → Acquisition — agrège acquisition_events (voir
// migration 20260917000002), seule table réellement instrumentée sur
// tout le parcours découverte→action. Volontairement PAS mélangé avec
// rdv.provenance/paid_bookings.provenance (réel mais QR-only) ni
// annonce_vues dans la comparaison "Sources" : ces canaux auraient un
// signal que les autres sources n'ont pas encore, faussant la
// comparaison. `event_type` "profile_view" = découverte, tout le reste
// (appointment_started/contact_started/favori_ajoute/profile_share) =
// action. Aucun événement "service_view" distinct : dans le parcours réel
// du produit, cliquer un service démarre directement le flux RDV
// (appointment_started), il n'existe pas de moment "consultation" séparé
// à mesurer honnêtement.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ACTION_EVENT_TYPES = ["appointment_started", "contact_started", "favori_ajoute", "profile_share"] as const;
const APRES_DECOUVERTE_LABELS: Record<typeof ACTION_EVENT_TYPES[number], string> = {
  appointment_started: "Rendez-vous démarré",
  contact_started: "Contact initié",
  favori_ajoute: "Établissement enregistré",
  profile_share: "Partage effectué",
};

export type SourceStat = { source: AcquisitionSource; label: string; visiteurs: number; part: number; actions: number; tauxAction: number | null };
export type ApresDecouverteStat = { eventType: string; label: string; count: number };
export type EvolutionAcquisitionPoint = { date: string; visiteurs: number; nouveaux: number; recurrents: number; actions: number };

export type AnalyseAcquisition = {
  visiteurs: KpiMetric;
  nouveauxVisiteurs: KpiMetric;
  visiteursRecurrents: KpiMetric;
  actionsGenerees: KpiMetric;
  tauxAction: KpiMetric;
  sources: SourceStat[];
  apresDecouverte: ApresDecouverteStat[];
  evolution: EvolutionAcquisitionPoint[];
};

type EventRow = { event_type: string; source: string; citoyen_id: string | null; visiteur_id: string | null; created_at: string };

function deltaPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel > 0 ? 100 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

// Clé de visiteur : citoyen connecté d'abord, sinon l'UUID anonyme
// localStorage (lib/acquisitionEvents.ts::obtenirVisiteurId), sinon un
// singleton par ligne (visiteur sans aucun identifiant persistant —
// compte pour le total mais jamais pour nouveaux/récurrents, comme les
// citoyens non identifiés ailleurs dans le Centre d'Analyse).
function cleVisiteur(r: Pick<EventRow, "citoyen_id" | "visiteur_id">, indexRepli: string): string {
  return r.citoyen_id ?? r.visiteur_id ?? `anon-${indexRepli}`;
}

export async function calculerAnalyseAcquisition(institutionId: string, fenetreJours: PeriodeJours = 30, sourceFiltre?: AcquisitionSource): Promise<AnalyseAcquisition> {
  const maintenant = new Date();
  const debutCourant = new Date(maintenant.getTime() - fenetreJours * 86400000);
  const debutPrecedent = new Date(maintenant.getTime() - 2 * fenetreJours * 86400000);

  // Historique complet (pas juste la fenêtre) — nécessaire pour dater la
  // première visite réelle de chaque visiteur, même logique que
  // rdvAvecClient dans lib/analyseClients.ts.
  const { data: raw } = await sb.from("acquisition_events").select("event_type,source,citoyen_id,visiteur_id,created_at").eq("institution_id", institutionId).order("created_at", { ascending: true }).limit(5000);
  const tous = ((raw ?? []) as EventRow[]).map((r, i) => ({ ...r, cle: cleVisiteur(r, String(i)) }));
  const evenements = sourceFiltre ? tous.filter(e => e.source === sourceFiltre) : tous;

  const vues = evenements.filter(e => e.event_type === "profile_view");
  const actions = evenements.filter(e => (ACTION_EVENT_TYPES as readonly string[]).includes(e.event_type));

  const emptyKpi: KpiMetric = { valeur: 0, delta: null, serie: [] };
  if (vues.length === 0) {
    return {
      visiteurs: emptyKpi, nouveauxVisiteurs: emptyKpi, visiteursRecurrents: emptyKpi,
      actionsGenerees: emptyKpi, tauxAction: { valeur: null, delta: null, serie: [] },
      sources: [], apresDecouverte: [], evolution: [],
    };
  }

  // Première vue par visiteur, sur tout l'historique — détermine
  // nouveau/récurrent quel que soit le moment où on regarde.
  const premiereVueParCle: Record<string, string> = {};
  vues.forEach(v => {
    if (!premiereVueParCle[v.cle] || v.created_at < premiereVueParCle[v.cle]) premiereVueParCle[v.cle] = v.created_at;
  });

  const estCourant = (iso: string) => new Date(iso) >= debutCourant;
  const estPrecedent = (iso: string) => new Date(iso) >= debutPrecedent && new Date(iso) < debutCourant;

  const vuesCourant = vues.filter(v => estCourant(v.created_at));
  const vuesPrecedent = vues.filter(v => estPrecedent(v.created_at));
  const visiteursCourant = new Set(vuesCourant.map(v => v.cle));
  const visiteursPrecedent = new Set(vuesPrecedent.map(v => v.cle));

  const nouveauxCourant = [...visiteursCourant].filter(c => premiereVueParCle[c] >= debutCourant.toISOString());
  const nouveauxPrecedent = [...visiteursPrecedent].filter(c => premiereVueParCle[c] >= debutPrecedent.toISOString() && premiereVueParCle[c] < debutCourant.toISOString());
  const recurrentsCourant = visiteursCourant.size - nouveauxCourant.length;
  const recurrentsPrecedent = visiteursPrecedent.size - nouveauxPrecedent.length;

  const actionsCourant = actions.filter(a => estCourant(a.created_at));
  const actionsPrecedent = actions.filter(a => estPrecedent(a.created_at));
  const visiteursAvecActionCourant = new Set(actionsCourant.map(a => a.cle)).size;
  const tauxActionCourant = visiteursCourant.size > 0 ? Math.round((visiteursAvecActionCourant / visiteursCourant.size) * 1000) / 10 : null;
  const visiteursAvecActionPrecedent = new Set(actionsPrecedent.map(a => a.cle)).size;
  const tauxActionPrecedent = visiteursPrecedent.size > 0 ? Math.round((visiteursAvecActionPrecedent / visiteursPrecedent.size) * 1000) / 10 : null;

  // ── Sources (visiteurs/part/actions/taux, fenêtre courante) ──
  const totalVisiteursCourant = visiteursCourant.size;
  const sourcesMap: Record<string, { visiteurs: Set<string>; actions: number }> = {};
  vuesCourant.forEach(v => {
    if (!sourcesMap[v.source]) sourcesMap[v.source] = { visiteurs: new Set(), actions: 0 };
    sourcesMap[v.source].visiteurs.add(v.cle);
  });
  actionsCourant.forEach(a => {
    if (!sourcesMap[a.source]) sourcesMap[a.source] = { visiteurs: new Set(), actions: 0 };
    sourcesMap[a.source].actions++;
  });
  const sources: SourceStat[] = Object.entries(sourcesMap)
    .map(([source, v]) => {
      const nbVisiteurs = v.visiteurs.size;
      return {
        source: source as AcquisitionSource,
        label: ACQUISITION_SOURCE_LABELS[source as AcquisitionSource] ?? source,
        visiteurs: nbVisiteurs,
        part: totalVisiteursCourant > 0 ? Math.round((nbVisiteurs / totalVisiteursCourant) * 1000) / 10 : 0,
        actions: v.actions,
        tauxAction: nbVisiteurs > 0 ? Math.round((v.actions / nbVisiteurs) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.visiteurs - a.visiteurs);

  // ── Après la découverte (compteurs réels par type d'action) ──
  const apresDecouverte: ApresDecouverteStat[] = ACTION_EVENT_TYPES
    .map(t => ({ eventType: t, label: APRES_DECOUVERTE_LABELS[t], count: actionsCourant.filter(a => a.event_type === t).length }))
    .filter(s => s.count > 0);

  // ── Évolution (série quotidienne sur la fenêtre) ──
  const evolution: EvolutionAcquisitionPoint[] = Array.from({ length: fenetreJours }, (_, i) => {
    const jourDebut = new Date(debutCourant.getTime() + i * 86400000);
    const jourStr = jourDebut.toISOString().slice(0, 10);
    const vuesJour = vuesCourant.filter(v => v.created_at.slice(0, 10) === jourStr);
    const clesJour = new Set(vuesJour.map(v => v.cle));
    const nouveauxJour = [...clesJour].filter(c => premiereVueParCle[c].slice(0, 10) === jourStr).length;
    return {
      date: jourStr,
      visiteurs: clesJour.size,
      nouveaux: nouveauxJour,
      recurrents: clesJour.size - nouveauxJour,
      actions: actionsCourant.filter(a => a.created_at.slice(0, 10) === jourStr).length,
    };
  });

  return {
    visiteurs: { valeur: visiteursCourant.size, delta: deltaPct(visiteursCourant.size, visiteursPrecedent.size), serie: [] },
    nouveauxVisiteurs: { valeur: nouveauxCourant.length, delta: deltaPct(nouveauxCourant.length, nouveauxPrecedent.length), serie: [] },
    visiteursRecurrents: { valeur: recurrentsCourant, delta: deltaPct(recurrentsCourant, recurrentsPrecedent), serie: [] },
    actionsGenerees: { valeur: actionsCourant.length, delta: deltaPct(actionsCourant.length, actionsPrecedent.length), serie: [] },
    tauxAction: { valeur: tauxActionCourant, delta: tauxActionCourant !== null && tauxActionPrecedent !== null ? Math.round((tauxActionCourant - tauxActionPrecedent) * 10) / 10 : null, serie: [] },
    sources, apresDecouverte, evolution,
  };
}
