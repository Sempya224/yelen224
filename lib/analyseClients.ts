import { createClient } from "@supabase/supabase-js";
import type { KpiMetric, PeriodeJours } from "./analyseAggregation";
import { type SegmentClient, SEGMENT_LABELS } from "./segmentsClients";

// "Mes clients" (Centre d'Analyse) — Customer Analytics, PAS un CRM
// (décision CEO 04/08/2026) : comprendre le comportement de la clientèle,
// jamais gérer une fiche. Aucune coordonnée (phone), aucune note privée,
// aucune action de modification ici — tout ça reste l'écran CRM dédié
// (MesClientsTab.tsx). Historique RDV complet utilisé (pas juste la
// fenêtre) pour calculer premières/dernières visites correctement — une
// fenêtre glissante seule sous-estimerait l'ancienneté réelle d'un client.
//
// Volontairement PAS construit ici, malgré le brief : répartition par sexe
// / tranche d'âge. `citoyen_prefs_visibilite.champs_visibles` (migration
// 20260724000002) a `date_naissance: false` par défaut — la plateforme a
// déjà tranché que la date de naissance n'est pas exposée aux institutions
// par défaut. L'exposer en agrégat ici sans décision produit explicite de
// Bryan contredirait ce défaut déjà posé. À construire seulement sur
// validation explicite.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SEUIL_INACTIF_JOURS = 60;
const SEUIL_PERDU_JOURS = 120;
const SEUIL_RECENT_JOURS = 14;
const SEUIL_VIP_NB_RDV = 7;

export type ClientAnalyseStat = {
  citoyenId: string; nom: string; nbRdv: number; premiereVisite: string; derniereVisite: string;
  segment: SegmentClient; scoreFidelite: number; valeurGeneree: number;
};
export type SegmentCount = { segment: SegmentClient; label: string; count: number; pct: number };
export type FrequenceBucket = { label: string; count: number; pct: number };
export type RfmCle = "tres_recents" | "actifs" | "vip" | "a_risque" | "perdus";
export type RfmSegment = { cle: RfmCle; label: string; count: number; description: string };
export type EvolutionClientsPoint = { date: string; nouveaux: number; recurrents: number; perdus: number };

export type AnalyseClients = {
  clientsUniques: KpiMetric;
  nouveauxClients: KpiMetric;
  clientsRecurrents: KpiMetric;
  tauxFidelite: KpiMetric;
  frequenceMoyenne: KpiMetric;
  satisfaction: KpiMetric;
  evolution: EvolutionClientsPoint[];
  segments: SegmentCount[];
  fidelisation: FrequenceBucket[];
  rfm: RfmSegment[];
  topClients: ClientAnalyseStat[];
  satisfactionSerie: { date: string; note: number }[];
  commentairesRecents: { note: number; commentaire: string; date: string }[];
};

function deltaPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel > 0 ? 100 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

function joursDepuis(iso: string, ref: Date): number {
  return Math.floor((ref.getTime() - new Date(iso).getTime()) / 86400000);
}

function classerSegment(nbRdv: number, joursDepuisDerniere: number): SegmentClient {
  if (joursDepuisDerniere > SEUIL_INACTIF_JOURS) return "inactif";
  if (nbRdv >= SEUIL_VIP_NB_RDV) return "vip";
  if (nbRdv >= 4) return "fidele";
  if (nbRdv >= 2) return "occasionnel";
  return "nouveau";
}

function classerRfm(nbRdv: number, joursDepuisDerniere: number): RfmCle {
  if (joursDepuisDerniere > SEUIL_PERDU_JOURS) return "perdus";
  if (joursDepuisDerniere > SEUIL_INACTIF_JOURS) return "a_risque";
  if (nbRdv >= SEUIL_VIP_NB_RDV) return "vip";
  if (joursDepuisDerniere <= SEUIL_RECENT_JOURS) return "tres_recents";
  return "actifs";
}

export async function calculerAnalyseClients(institutionId: string, fenetreJours: PeriodeJours = 30): Promise<AnalyseClients> {
  const maintenant = new Date();
  const debutCourant = new Date(maintenant.getTime() - fenetreJours * 86400000);
  const debutPrecedent = new Date(maintenant.getTime() - 2 * fenetreJours * 86400000);

  // Historique complet (pas juste la fenêtre) — nécessaire pour dater
  // correctement la première/dernière visite de chaque client.
  const { data: rdvRaw } = await sb.from("rdv").select("citoyen_id,statut,created_at").eq("institution_id", institutionId).order("created_at", { ascending: true }).limit(5000);
  const rdvAll = (rdvRaw ?? []) as { citoyen_id: string | null; statut: string; created_at: string }[];
  const rdvAvecClient = rdvAll.filter((r): r is typeof r & { citoyen_id: string } => !!r.citoyen_id);

  const emptyKpi: KpiMetric = { valeur: 0, delta: null, serie: [] };
  if (rdvAvecClient.length === 0) {
    return {
      clientsUniques: emptyKpi, nouveauxClients: emptyKpi, clientsRecurrents: emptyKpi,
      tauxFidelite: emptyKpi, frequenceMoyenne: emptyKpi, satisfaction: { valeur: null, delta: null, serie: [] },
      evolution: [], segments: [], fidelisation: [], rfm: [], topClients: [], satisfactionSerie: [], commentairesRecents: [],
    };
  }

  const citoyenIds = [...new Set(rdvAvecClient.map(r => r.citoyen_id))];
  const [{ data: usersRaw }, { data: avisRaw }, { data: bookingsRaw }] = await Promise.all([
    sb.from("users").select("id,nom,prenom,phone").in("id", citoyenIds),
    sb.from("avis").select("note,commentaire,created_at,citoyen_id").eq("institution_id", institutionId).order("created_at", { ascending: false }).limit(500),
    sb.from("paid_bookings").select("citoyen_id,montant_paye,statut").eq("institution_id", institutionId).in("statut", ["confirme", "termine"]),
  ]);
  const nomParCitoyen: Record<string, string> = {};
  (usersRaw ?? []).forEach((u: { id: string; nom: string | null; prenom: string | null; phone: string | null }) => {
    nomParCitoyen[u.id] = [u.prenom, u.nom].filter(Boolean).join(" ") || u.phone || "Citoyen";
  });
  const valeurParCitoyen: Record<string, number> = {};
  (bookingsRaw ?? []).forEach((b: { citoyen_id: string; montant_paye: number | null }) => {
    valeurParCitoyen[b.citoyen_id] = (valeurParCitoyen[b.citoyen_id] ?? 0) + (b.montant_paye ?? 0);
  });

  // ── Regroupement par citoyen (historique complet) ──
  const parCitoyen: Record<string, { dates: string[] }> = {};
  rdvAvecClient.forEach(r => {
    if (!parCitoyen[r.citoyen_id]) parCitoyen[r.citoyen_id] = { dates: [] };
    parCitoyen[r.citoyen_id].dates.push(r.created_at);
  });

  const clients: ClientAnalyseStat[] = Object.entries(parCitoyen).map(([citoyenId, v]) => {
    const dates = v.dates.slice().sort();
    const premiereVisite = dates[0];
    const derniereVisite = dates[dates.length - 1];
    const nbRdv = dates.length;
    const jDepuis = joursDepuis(derniereVisite, maintenant);
    const segment = classerSegment(nbRdv, jDepuis);
    const scoreFreq = Math.min(nbRdv / 10, 1) * 60;
    const scoreRecence = Math.max(0, 1 - jDepuis / 90) * 40;
    return {
      citoyenId, nom: nomParCitoyen[citoyenId] ?? "Citoyen", nbRdv, premiereVisite, derniereVisite,
      segment, scoreFidelite: Math.round(scoreFreq + scoreRecence), valeurGeneree: valeurParCitoyen[citoyenId] ?? 0,
    };
  });

  // ── KPIs (scopés à la fenêtre courante vs précédente) ──
  const rdvCourant = rdvAvecClient.filter(r => new Date(r.created_at) >= debutCourant);
  const rdvPrecedent = rdvAvecClient.filter(r => new Date(r.created_at) >= debutPrecedent && new Date(r.created_at) < debutCourant);
  const citoyensCourant = new Set(rdvCourant.map(r => r.citoyen_id));
  const citoyensPrecedent = new Set(rdvPrecedent.map(r => r.citoyen_id));

  const premiereVisiteParCitoyen: Record<string, string> = {};
  clients.forEach(c => { premiereVisiteParCitoyen[c.citoyenId] = c.premiereVisite; });
  const nouveauxCourant = [...citoyensCourant].filter(c => new Date(premiereVisiteParCitoyen[c]) >= debutCourant);
  const nouveauxPrecedent = [...citoyensPrecedent].filter(c => {
    const pv = new Date(premiereVisiteParCitoyen[c]);
    return pv >= debutPrecedent && pv < debutCourant;
  });
  const recurrentsCourant = [...citoyensCourant].filter(c => !nouveauxCourant.includes(c));
  const recurrentsPrecedent = [...citoyensPrecedent].filter(c => !nouveauxPrecedent.includes(c));

  const tauxFideliteCourant = citoyensCourant.size > 0 ? Math.round((recurrentsCourant.length / citoyensCourant.size) * 1000) / 10 : 0;
  const tauxFidelitePrecedent = citoyensPrecedent.size > 0 ? Math.round((recurrentsPrecedent.length / citoyensPrecedent.size) * 1000) / 10 : 0;
  const freqMoyenneCourant = citoyensCourant.size > 0 ? Math.round((rdvCourant.length / citoyensCourant.size) * 10) / 10 : 0;
  const freqMoyennePrecedent = citoyensPrecedent.size > 0 ? Math.round((rdvPrecedent.length / citoyensPrecedent.size) * 10) / 10 : 0;

  const avisAll = (avisRaw ?? []) as { note: number; commentaire: string | null; created_at: string; citoyen_id: string }[];
  const avisCourant = avisAll.filter(a => new Date(a.created_at) >= debutCourant);
  const avisPrecedent = avisAll.filter(a => new Date(a.created_at) >= debutPrecedent && new Date(a.created_at) < debutCourant);
  const satisfactionCourant = avisCourant.length >= 3 ? Math.round((avisCourant.reduce((s, a) => s + a.note, 0) / avisCourant.length) * 10) / 10 : null;
  const satisfactionPrecedente = avisPrecedent.length >= 3 ? avisPrecedent.reduce((s, a) => s + a.note, 0) / avisPrecedent.length : null;

  // ── Évolution (nouveaux / récurrents / perdus par jour) ──
  const evolution: EvolutionClientsPoint[] = Array.from({ length: fenetreJours }, (_, i) => {
    const jourDebut = new Date(debutCourant.getTime() + i * 86400000);
    const jourStr = jourDebut.toISOString().slice(0, 10);
    const nouveauxJour = clients.filter(c => c.premiereVisite.slice(0, 10) === jourStr).length;
    const recurrentsJour = rdvCourant.filter(r => r.created_at.slice(0, 10) === jourStr && premiereVisiteParCitoyen[r.citoyen_id].slice(0, 10) !== jourStr).length;
    const perdusJour = clients.filter(c => {
      const seuil = new Date(new Date(c.derniereVisite).getTime() + SEUIL_INACTIF_JOURS * 86400000);
      return seuil.toISOString().slice(0, 10) === jourStr && joursDepuis(c.derniereVisite, maintenant) > SEUIL_INACTIF_JOURS;
    }).length;
    return { date: jourStr, nouveaux: nouveauxJour, recurrents: recurrentsJour, perdus: perdusJour };
  });

  // ── Segmentation (base actuelle, tous clients confondus) ──
  const segmentsMap: Record<SegmentClient, number> = { nouveau: 0, occasionnel: 0, fidele: 0, vip: 0, inactif: 0 };
  clients.forEach(c => { segmentsMap[c.segment]++; });
  const segments: SegmentCount[] = (Object.keys(segmentsMap) as SegmentClient[])
    .map(s => ({ segment: s, label: SEGMENT_LABELS[s], count: segmentsMap[s], pct: Math.round((segmentsMap[s] / clients.length) * 1000) / 10 }))
    .filter(s => s.count > 0);

  // ── Fidélisation (histogramme fréquence) ──
  const buckets = [
    { label: "1 visite", test: (n: number) => n === 1 },
    { label: "2-3 visites", test: (n: number) => n >= 2 && n <= 3 },
    { label: "4-6 visites", test: (n: number) => n >= 4 && n <= 6 },
    { label: "7+ visites", test: (n: number) => n >= 7 },
  ];
  const fidelisation: FrequenceBucket[] = buckets.map(b => {
    const count = clients.filter(c => b.test(c.nbRdv)).length;
    return { label: b.label, count, pct: Math.round((count / clients.length) * 1000) / 10 };
  });

  // ── RFM simplifié ──
  const rfmMap: Record<RfmCle, number> = { tres_recents: 0, actifs: 0, vip: 0, a_risque: 0, perdus: 0 };
  clients.forEach(c => { rfmMap[classerRfm(c.nbRdv, joursDepuis(c.derniereVisite, maintenant))]++; });
  const rfmMeta: Record<RfmCle, { label: string; description: string }> = {
    tres_recents: { label: "Très récents", description: `Visite dans les ${SEUIL_RECENT_JOURS} derniers jours` },
    actifs: { label: "Actifs", description: "Client régulier, pas encore fidèle" },
    vip: { label: "VIP", description: `${SEUIL_VIP_NB_RDV}+ RDV, toujours actif` },
    a_risque: { label: "À risque", description: `Aucune visite depuis ${SEUIL_INACTIF_JOURS}-${SEUIL_PERDU_JOURS} jours` },
    perdus: { label: "Perdus", description: `Aucune visite depuis plus de ${SEUIL_PERDU_JOURS} jours` },
  };
  const rfm: RfmSegment[] = (Object.keys(rfmMap) as RfmCle[]).map(k => ({ cle: k, label: rfmMeta[k].label, count: rfmMap[k], description: rfmMeta[k].description }));

  // ── Top 10 clients (lecture seule, score fidélité décroissant) ──
  const topClients = clients.slice().sort((a, b) => b.scoreFidelite - a.scoreFidelite).slice(0, 10);

  const satisfactionSerie = avisAll.slice(0, 30).reverse().map(a => ({ date: a.created_at.slice(0, 10), note: a.note }));
  const commentairesRecents = avisAll.filter(a => a.commentaire && a.commentaire.trim().length > 0).slice(0, 5).map(a => ({ note: a.note, commentaire: a.commentaire!, date: a.created_at }));

  return {
    clientsUniques: { valeur: citoyensCourant.size, delta: deltaPct(citoyensCourant.size, citoyensPrecedent.size), serie: [] },
    nouveauxClients: { valeur: nouveauxCourant.length, delta: deltaPct(nouveauxCourant.length, nouveauxPrecedent.length), serie: [] },
    clientsRecurrents: { valeur: recurrentsCourant.length, delta: deltaPct(recurrentsCourant.length, recurrentsPrecedent.length), serie: [] },
    tauxFidelite: { valeur: tauxFideliteCourant, delta: tauxFidelitePrecedent > 0 ? Math.round((tauxFideliteCourant - tauxFidelitePrecedent) * 10) / 10 : null, serie: [] },
    frequenceMoyenne: { valeur: freqMoyenneCourant, delta: freqMoyennePrecedent > 0 ? Math.round((freqMoyenneCourant - freqMoyennePrecedent) * 10) / 10 : null, serie: [] },
    satisfaction: { valeur: satisfactionCourant, delta: satisfactionCourant !== null && satisfactionPrecedente !== null ? Math.round((satisfactionCourant - satisfactionPrecedente) * 10) / 10 : null, serie: [] },
    evolution, segments, fidelisation, rfm, topClients, satisfactionSerie, commentairesRecents,
  };
}
