import { createClient } from "@supabase/supabase-js";
import { CANAL_LABELS, type Canal } from "./canalAcquisition";
import { VILLES_GUINEE, REGION_PAR_VILLE, REGIONS_GUINEE_LABELS } from "./villes";

// Agrégation "Vue d'ensemble" du Centre d'Analyse — fenêtre configurable
// (sélecteur de période global, en-tête), comparée à la même durée
// précédente. Vues/clics viennent des offres publiées par l'institution
// (offre_vues/offre_clics), RDV/conversion/citoyens atteints de `rdv`,
// satisfaction de `avis` — toutes des tables réelles, zéro donnée
// inventée. "Citoyens atteints" = citoyens distincts ayant soumis ≥1
// demande de RDV sur la période (même définition que "client" partout
// ailleurs dans le produit) — délibérément pas une métrique de reach/
// impressions marketing, qui n'existe nulle part dans le schéma.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const FENETRE_JOURS = 30;
// Presets du sélecteur de période global (en-tête du Centre d'Analyse) —
// mêmes valeurs que le sélecteur du graphique d'évolution (Lot 3), pour
// cohérence visuelle, mais appliquées ici aux KPI/Top offres plutôt qu'au
// seul graphique.
export const PERIODES_VALIDES = [7, 30, 90, 365] as const;
export type PeriodeJours = typeof PERIODES_VALIDES[number];
// Même garde-fou que MIN_AVIS_POUR_SCORE dans lib/reputationScore.ts —
// évite d'afficher une moyenne trompeuse calculée sur 1-2 avis.
export const MIN_AVIS_POUR_SATISFACTION = 3;

const STATUTS_CONFIRMES = ["confirme", "effectue", "termine", "honore"];

export type KpiMetric = {
  valeur: number | null; // null = pas assez de données pour afficher un chiffre honnête
  delta: number | null;  // vs période précédente ; en points pour tauxConversion, en % ailleurs
  serie: number[];       // points journaliers (fenêtre courante) pour la mini-sparkline
};

export type VueEnsemble = {
  vues: KpiMetric;
  clics: KpiMetric;
  rdvGeneres: KpiMetric;
  tauxConversion: KpiMetric;
  citoyensAtteints: KpiMetric;
  satisfaction: KpiMetric;
};

function bucketiserParJour(dates: string[], debut: Date, jours: number): number[] {
  const buckets = Array(jours).fill(0);
  const debutMs = debut.getTime();
  dates.forEach(iso => {
    const idx = Math.floor((new Date(iso).getTime() - debutMs) / 86400000);
    if (idx >= 0 && idx < jours) buckets[idx]++;
  });
  return buckets;
}

function deltaPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel > 0 ? 100 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

export type PointEvolution = { date: string; vues: number; clics: number; conversions: number };

const JOURS_EVOLUTION_MAX = 365;

// Alimente le graphique "Évolution des performances" (3 courbes) — un seul
// fetch sur la fenêtre max, le sélecteur 7j/30j/90j/1an retranche côté
// client (même convention que app/api/institution/offres/vues/route.ts).
export async function calculerEvolution(institutionId: string): Promise<PointEvolution[]> {
  const debut = new Date(Date.now() - JOURS_EVOLUTION_MAX * 86400000);

  const { data: mesOffres } = await sb.from("offres").select("id").eq("institution_id", institutionId);
  const offreIds = (mesOffres ?? []).map(o => o.id);

  const [vuesRes, clicsRes, rdvRes] = await Promise.all([
    offreIds.length > 0
      ? sb.from("offre_vues").select("created_at").in("offre_id", offreIds).gte("created_at", debut.toISOString())
      : Promise.resolve({ data: [] as { created_at: string }[] }),
    offreIds.length > 0
      ? sb.from("offre_clics").select("created_at").in("offre_id", offreIds).gte("created_at", debut.toISOString())
      : Promise.resolve({ data: [] as { created_at: string }[] }),
    sb.from("rdv").select("created_at,statut").eq("institution_id", institutionId).gte("created_at", debut.toISOString()),
  ]);

  const compterParJour = (dates: string[]): Record<string, number> => {
    const m: Record<string, number> = {};
    dates.forEach(iso => { const d = iso.slice(0, 10); m[d] = (m[d] ?? 0) + 1; });
    return m;
  };

  const vuesParJour = compterParJour((vuesRes.data ?? []).map(v => v.created_at));
  const clicsParJour = compterParJour((clicsRes.data ?? []).map(c => c.created_at));
  const rdvList = (rdvRes.data ?? []) as { created_at: string; statut: string }[];
  const conversionsParJour = compterParJour(rdvList.filter(r => STATUTS_CONFIRMES.includes(r.statut)).map(r => r.created_at));

  return Array.from({ length: JOURS_EVOLUTION_MAX }, (_, i) => {
    const d = new Date(Date.now() - (JOURS_EVOLUTION_MAX - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { date: d, vues: vuesParJour[d] ?? 0, clics: clicsParJour[d] ?? 0, conversions: conversionsParJour[d] ?? 0 };
  });
}

export type TopOffre = { id: string; titre: string; image_url: string | null; vues: number; clics: number; ctr: number };

// Alimente la carte "Top offres performantes" — fenêtre 30 jours, mêmes
// tables que calculerVueEnsemble (offre_vues/offre_clics), triées par vues
// décroissantes. "Répartition par canal" reste un stub côté UI (aucune
// colonne canal/acquisition n'existe, cf. audit du 04/08/2026).
export async function calculerTopOffres(institutionId: string, fenetreJours: number = FENETRE_JOURS, limite = 5): Promise<TopOffre[]> {
  const debut = new Date(Date.now() - fenetreJours * 86400000);
  const { data: mesOffres } = await sb.from("offres").select("id,titre,image_url").eq("institution_id", institutionId);
  const offres = mesOffres ?? [];
  if (offres.length === 0) return [];
  const ids = offres.map(o => o.id);

  const [vuesRes, clicsRes] = await Promise.all([
    sb.from("offre_vues").select("offre_id").in("offre_id", ids).gte("created_at", debut.toISOString()),
    sb.from("offre_clics").select("offre_id").in("offre_id", ids).gte("created_at", debut.toISOString()),
  ]);

  const vuesParOffre: Record<string, number> = {};
  (vuesRes.data ?? []).forEach((v: { offre_id: string }) => { vuesParOffre[v.offre_id] = (vuesParOffre[v.offre_id] ?? 0) + 1; });
  const clicsParOffre: Record<string, number> = {};
  (clicsRes.data ?? []).forEach((c: { offre_id: string }) => { clicsParOffre[c.offre_id] = (clicsParOffre[c.offre_id] ?? 0) + 1; });

  return offres
    .map(o => {
      const vues = vuesParOffre[o.id] ?? 0;
      const clics = clicsParOffre[o.id] ?? 0;
      return { id: o.id, titre: o.titre, image_url: o.image_url, vues, clics, ctr: vues > 0 ? Math.round((clics / vues) * 1000) / 10 : 0 };
    })
    .filter(o => o.vues > 0 || o.clics > 0)
    .sort((a, b) => b.vues - a.vues)
    .slice(0, limite);
}

export type CanalStat = { canal: string; label: string; count: number; pct: number };

// Alimente le donut "Répartition par canal" — canal réel capturé depuis
// le 04/08/2026 (cf. lib/canalAcquisition.ts, app/offres/[id]/page.tsx).
// Toute vue antérieure à cette date a `canal = NULL` en base (aucun
// backfill possible) et est comptée dans "Autres" plutôt qu'ignorée.
export async function calculerRepartitionCanal(institutionId: string, fenetreJours: number = FENETRE_JOURS): Promise<CanalStat[]> {
  const debut = new Date(Date.now() - fenetreJours * 86400000);
  const { data: mesOffres } = await sb.from("offres").select("id").eq("institution_id", institutionId);
  const ids = (mesOffres ?? []).map(o => o.id);
  if (ids.length === 0) return [];

  const { data: vues } = await sb.from("offre_vues").select("canal").in("offre_id", ids).gte("created_at", debut.toISOString());
  const rows = (vues ?? []) as { canal: string | null }[];
  if (rows.length === 0) return [];

  const counts: Record<string, number> = {};
  rows.forEach(v => { const c = v.canal ?? "autres"; counts[c] = (counts[c] ?? 0) + 1; });
  const total = rows.length;

  return Object.entries(counts)
    .map(([canal, count]) => ({ canal, label: CANAL_LABELS[canal as Canal] ?? CANAL_LABELS.autres, count, pct: Math.round((count / total) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count);
}

export type PrefectureStat = {
  ville: string; region: string; rdv: number; citoyens: number; confirmes: number;
  tauxConfirmation: number; deltaRdv: number | null; tendance: "hausse" | "baisse" | "stable"; serie: number[];
};
export type RegionStat = { region: string; label: string; rdv: number; citoyens: number; pct: number; prefecturesCouvertes: number; delta: number | null };
export type AnalyseGeo = {
  prefecturesCouvertes: number;
  prefecturesCouvertesTotal: number;
  prefecturesCouvertesDelta: number | null;
  prefecturesCouvertesDeltaAbs: number;
  regionDominante: { region: string; label: string; pct: number } | null;
  nouveauxCitoyens: number;
  croissanceGeo: number | null;
  prefectureEnProgression: { ville: string; delta: number } | null;
  prefectureADevelopper: { ville: string; tauxConfirmation: number } | null;
  regions: RegionStat[];
  prefectures: PrefectureStat[];
};

// Alimente l'onglet "Géographie" — répartition réelle des RDV par ville du
// citoyen (users.ville, renseignée obligatoirement à l'inscription,
// cf. app/inscription/page.tsx + lib/villes.ts, les 33 préfectures de
// Guinée + rattachement aux 8 régions administratives réelles,
// lib/villes.ts::REGION_PAR_VILLE). Carte interactive (lib/guineeRegionsGeo.ts)
// alimentée au niveau région uniquement — aucune frontière géographique par
// préfecture (ADM2) n'est disponible dans le projet, seulement ADM1 (régions,
// fourni par Bryan le 04/08/2026), donc pas de choroplèthe par préfecture.
// "Nouveaux citoyens" = citoyens vus dans la fenêtre courante mais absents
// de la fenêtre précédente (proxy réel scopé à la fenêtre de comparaison,
// même logique que tous les autres deltas de cet écran — pas un "jamais vu
// de toute l'histoire").
export async function calculerAnalyseGeo(institutionId: string, fenetreJours: number = FENETRE_JOURS): Promise<AnalyseGeo> {
  const maintenant = new Date();
  const debutCourant = new Date(maintenant.getTime() - fenetreJours * 86400000);
  const debutPrecedent = new Date(maintenant.getTime() - 2 * fenetreJours * 86400000);

  const { data: rdvRaw } = await sb.from("rdv").select("citoyen_id,statut,created_at").eq("institution_id", institutionId).gte("created_at", debutPrecedent.toISOString());
  const rdvAll = (rdvRaw ?? []) as { citoyen_id: string | null; statut: string; created_at: string }[];

  const estCourant = (iso: string) => new Date(iso) >= debutCourant;
  const rdvCourant = rdvAll.filter(r => estCourant(r.created_at));
  const rdvPrecedent = rdvAll.filter(r => !estCourant(r.created_at));

  const citoyenIds = [...new Set(rdvAll.map(r => r.citoyen_id).filter((v): v is string => !!v))];
  const { data: usersRaw } = citoyenIds.length > 0
    ? await sb.from("users").select("id,ville").in("id", citoyenIds)
    : { data: [] as { id: string; ville: string | null }[] };
  const villeParCitoyen: Record<string, string> = {};
  (usersRaw ?? []).forEach((u: { id: string; ville: string | null }) => { villeParCitoyen[u.id] = u.ville || "Non renseignée"; });
  const villeDe = (citoyenId: string | null) => citoyenId ? (villeParCitoyen[citoyenId] ?? "Non renseignée") : "Non renseignée";

  // ── Par préfecture (courant + précédent, pour deltas/tendance/série) ──
  type Acc = { rdv: number; citoyens: Set<string>; confirmes: number; parJour: number[] };
  const parPrefectureCourant: Record<string, Acc> = {};
  const rdvPrecedentParVille: Record<string, number> = {};

  rdvCourant.forEach(r => {
    const ville = villeDe(r.citoyen_id);
    if (!parPrefectureCourant[ville]) parPrefectureCourant[ville] = { rdv: 0, citoyens: new Set(), confirmes: 0, parJour: Array(fenetreJours).fill(0) };
    const acc = parPrefectureCourant[ville];
    acc.rdv++;
    if (r.citoyen_id) acc.citoyens.add(r.citoyen_id);
    if (STATUTS_CONFIRMES.includes(r.statut)) acc.confirmes++;
    const idx = Math.floor((new Date(r.created_at).getTime() - debutCourant.getTime()) / 86400000);
    if (idx >= 0 && idx < fenetreJours) acc.parJour[idx]++;
  });
  rdvPrecedent.forEach(r => {
    const ville = villeDe(r.citoyen_id);
    rdvPrecedentParVille[ville] = (rdvPrecedentParVille[ville] ?? 0) + 1;
  });

  const prefectures: PrefectureStat[] = Object.entries(parPrefectureCourant)
    .map(([ville, acc]) => {
      const prec = rdvPrecedentParVille[ville] ?? 0;
      const delta = deltaPct(acc.rdv, prec);
      const tendance: PrefectureStat["tendance"] = delta === null ? "stable" : delta > 5 ? "hausse" : delta < -5 ? "baisse" : "stable";
      return {
        ville, region: REGION_PAR_VILLE[ville] ?? "autres", rdv: acc.rdv, citoyens: acc.citoyens.size, confirmes: acc.confirmes,
        tauxConfirmation: Math.round((acc.confirmes / acc.rdv) * 1000) / 10,
        deltaRdv: delta, tendance, serie: acc.parJour,
      };
    })
    .sort((a, b) => b.rdv - a.rdv);

  // ── Par région (rollup des préfectures) ──
  const parRegion: Record<string, { rdv: number; citoyens: Set<string>; villes: Set<string> }> = {};
  prefectures.forEach(p => {
    if (!parRegion[p.region]) parRegion[p.region] = { rdv: 0, citoyens: new Set(), villes: new Set() };
    parRegion[p.region].rdv += p.rdv;
    parRegion[p.region].villes.add(p.ville);
    // citoyens comptés par préfecture, additionnés (pas de doublon inter-préfecture possible : 1 citoyen = 1 ville)
  });
  const totalRdvCourant = rdvCourant.length;
  const rdvPrecedentParRegion: Record<string, number> = {};
  Object.entries(rdvPrecedentParVille).forEach(([ville, count]) => {
    const region = REGION_PAR_VILLE[ville] ?? "autres";
    rdvPrecedentParRegion[region] = (rdvPrecedentParRegion[region] ?? 0) + count;
  });
  const regions: RegionStat[] = Object.entries(parRegion)
    .map(([region, v]) => ({
      region, label: REGIONS_GUINEE_LABELS[region] ?? region, rdv: v.rdv,
      citoyens: prefectures.filter(p => p.region === region).reduce((s, p) => s + p.citoyens, 0),
      pct: totalRdvCourant > 0 ? Math.round((v.rdv / totalRdvCourant) * 1000) / 10 : 0,
      prefecturesCouvertes: v.villes.size,
      delta: deltaPct(v.rdv, rdvPrecedentParRegion[region] ?? 0),
    }))
    .sort((a, b) => b.rdv - a.rdv);

  // ── KPIs ──
  const villesCourantSet = new Set(prefectures.map(p => p.ville));
  const villesPrecedentSet = new Set(Object.keys(rdvPrecedentParVille));
  const citoyensCourantSet = new Set(rdvCourant.map(r => r.citoyen_id).filter((v): v is string => !!v));
  const citoyensPrecedentSet = new Set(rdvPrecedent.map(r => r.citoyen_id).filter((v): v is string => !!v));
  const nouveauxCitoyens = [...citoyensCourantSet].filter(c => !citoyensPrecedentSet.has(c)).length;

  const prefecturesReconnues = prefectures.filter(p => (VILLES_GUINEE as readonly string[]).includes(p.ville));
  const regionDominante = regions.length > 0 ? { region: regions[0].region, label: regions[0].label, pct: regions[0].pct } : null;

  const progressions = prefectures.filter(p => p.deltaRdv !== null && (rdvPrecedentParVille[p.ville] ?? 0) > 0).sort((a, b) => (b.deltaRdv ?? 0) - (a.deltaRdv ?? 0));
  const prefectureEnProgression = progressions.length > 0 && (progressions[0].deltaRdv ?? 0) > 0 ? { ville: progressions[0].ville, delta: progressions[0].deltaRdv! } : null;

  const aDevelopper = [...prefecturesReconnues].sort((a, b) => a.tauxConfirmation - b.tauxConfirmation)[0];
  const prefectureADevelopper = aDevelopper ? { ville: aDevelopper.ville, tauxConfirmation: aDevelopper.tauxConfirmation } : null;

  return {
    prefecturesCouvertes: prefecturesReconnues.length,
    prefecturesCouvertesTotal: VILLES_GUINEE.length,
    prefecturesCouvertesDelta: deltaPct(villesCourantSet.size, villesPrecedentSet.size),
    prefecturesCouvertesDeltaAbs: villesCourantSet.size - villesPrecedentSet.size,
    regionDominante,
    nouveauxCitoyens,
    croissanceGeo: deltaPct(villesCourantSet.size, villesPrecedentSet.size),
    prefectureEnProgression,
    prefectureADevelopper,
    regions,
    prefectures,
  };
}

export async function calculerVueEnsemble(institutionId: string, fenetreJours: number = FENETRE_JOURS): Promise<VueEnsemble> {
  const maintenant = new Date();
  const debutCourant = new Date(maintenant.getTime() - fenetreJours * 86400000);
  const debutPrecedent = new Date(maintenant.getTime() - 2 * fenetreJours * 86400000);

  const { data: mesOffres } = await sb.from("offres").select("id").eq("institution_id", institutionId);
  const offreIds = (mesOffres ?? []).map(o => o.id);

  const [vuesRes, clicsRes, rdvRes, avisRes] = await Promise.all([
    offreIds.length > 0
      ? sb.from("offre_vues").select("created_at").in("offre_id", offreIds).gte("created_at", debutPrecedent.toISOString())
      : Promise.resolve({ data: [] as { created_at: string }[] }),
    offreIds.length > 0
      ? sb.from("offre_clics").select("created_at").in("offre_id", offreIds).gte("created_at", debutPrecedent.toISOString())
      : Promise.resolve({ data: [] as { created_at: string }[] }),
    sb.from("rdv").select("created_at,statut,citoyen_id").eq("institution_id", institutionId).gte("created_at", debutPrecedent.toISOString()),
    sb.from("avis").select("note,created_at").eq("institution_id", institutionId).gte("created_at", debutPrecedent.toISOString()),
  ]);

  const vues = (vuesRes.data ?? []) as { created_at: string }[];
  const clics = (clicsRes.data ?? []) as { created_at: string }[];
  const rdv = (rdvRes.data ?? []) as { created_at: string; statut: string; citoyen_id: string | null }[];
  const avis = (avisRes.data ?? []) as { note: number; created_at: string }[];

  const estCourant = (iso: string) => new Date(iso) >= debutCourant;

  // ── Vues / Clics ──
  const vuesCourant = vues.filter(v => estCourant(v.created_at));
  const vuesPrecedent = vues.length - vuesCourant.length;
  const clicsCourant = clics.filter(c => estCourant(c.created_at));
  const clicsPrecedent = clics.length - clicsCourant.length;

  // ── RDV générés ──
  const rdvCourant = rdv.filter(r => estCourant(r.created_at));
  const rdvPrecedent = rdv.length - rdvCourant.length;

  // ── Citoyens atteints (réel : citoyens distincts ayant soumis une
  // demande de RDV sur la période — même définition que "client" partout
  // ailleurs dans le produit, cf. MesClientsTab.tsx : "client = a eu ≥1
  // RDV". Pas de reach/impressions marketing inventé.) ──
  const citoyensAtteintsCourant = new Set(rdvCourant.map(r => r.citoyen_id).filter(Boolean)).size;
  const citoyensAtteintsPrecedent = new Set(rdv.filter(r => !estCourant(r.created_at)).map(r => r.citoyen_id).filter(Boolean)).size;

  // ── Taux de conversion (en points, pas en %) ──
  const confirmesCourant = rdvCourant.filter(r => STATUTS_CONFIRMES.includes(r.statut)).length;
  const confirmesPrecedent = (rdv.length - rdvCourant.length) > 0
    ? rdv.filter(r => !estCourant(r.created_at) && STATUTS_CONFIRMES.includes(r.statut)).length
    : 0;
  const tauxCourant = rdvCourant.length > 0 ? Math.round((confirmesCourant / rdvCourant.length) * 1000) / 10 : 0;
  const tauxPrecedentPct = rdvPrecedent > 0 ? Math.round((confirmesPrecedent / rdvPrecedent) * 1000) / 10 : 0;

  // ── Satisfaction ──
  const avisCourant = avis.filter(a => estCourant(a.created_at));
  const avisPrecedent = avis.filter(a => !estCourant(a.created_at));
  const satisfactionCourant = avisCourant.length >= MIN_AVIS_POUR_SATISFACTION
    ? Math.round((avisCourant.reduce((s, a) => s + a.note, 0) / avisCourant.length) * 10) / 10
    : null;
  const satisfactionPrecedente = avisPrecedent.length >= MIN_AVIS_POUR_SATISFACTION
    ? avisPrecedent.reduce((s, a) => s + a.note, 0) / avisPrecedent.length
    : null;

  // ── Séries journalières (sparklines, fenêtre courante uniquement) ──
  const serieVues = bucketiserParJour(vuesCourant.map(v => v.created_at), debutCourant, fenetreJours);
  const serieClics = bucketiserParJour(clicsCourant.map(c => c.created_at), debutCourant, fenetreJours);
  const serieRdv = bucketiserParJour(rdvCourant.map(r => r.created_at), debutCourant, fenetreJours);

  const serieConfirmesParJour = bucketiserParJour(rdvCourant.filter(r => STATUTS_CONFIRMES.includes(r.statut)).map(r => r.created_at), debutCourant, fenetreJours);
  const serieConversion = serieRdv.map((total, i) => total > 0 ? Math.round((serieConfirmesParJour[i] / total) * 100) : 0);

  const citoyensParJour: Set<string>[] = Array.from({ length: fenetreJours }, () => new Set());
  rdvCourant.forEach(r => {
    if (!r.citoyen_id) return;
    const idx = Math.floor((new Date(r.created_at).getTime() - debutCourant.getTime()) / 86400000);
    if (idx >= 0 && idx < fenetreJours) citoyensParJour[idx].add(r.citoyen_id);
  });
  const serieCitoyensAtteints = citoyensParJour.map(s => s.size);

  const noteParJour: number[][] = Array.from({ length: fenetreJours }, () => []);
  avisCourant.forEach(a => {
    const idx = Math.floor((new Date(a.created_at).getTime() - debutCourant.getTime()) / 86400000);
    if (idx >= 0 && idx < fenetreJours) noteParJour[idx].push(a.note);
  });
  const serieSatisfaction = noteParJour.map(jour => jour.length > 0 ? Math.round((jour.reduce((s, n) => s + n, 0) / jour.length) * 10) / 10 : 0);

  return {
    vues: { valeur: vuesCourant.length, delta: deltaPct(vuesCourant.length, vuesPrecedent), serie: serieVues },
    clics: { valeur: clicsCourant.length, delta: deltaPct(clicsCourant.length, clicsPrecedent), serie: serieClics },
    rdvGeneres: { valeur: rdvCourant.length, delta: deltaPct(rdvCourant.length, rdvPrecedent), serie: serieRdv },
    tauxConversion: { valeur: tauxCourant, delta: rdvPrecedent > 0 ? Math.round((tauxCourant - tauxPrecedentPct) * 10) / 10 : null, serie: serieConversion },
    citoyensAtteints: { valeur: citoyensAtteintsCourant, delta: deltaPct(citoyensAtteintsCourant, citoyensAtteintsPrecedent), serie: serieCitoyensAtteints },
    satisfaction: {
      valeur: satisfactionCourant,
      delta: satisfactionCourant !== null && satisfactionPrecedente !== null ? Math.round((satisfactionCourant - satisfactionPrecedente) * 10) / 10 : null,
      serie: serieSatisfaction,
    },
  };
}
