import { createClient } from "@supabase/supabase-js";
import { generateSlotsInRange } from "./disponibilites";
import { rdvNonTraite } from "./rdvGating";
import type { KpiMetric, PeriodeJours } from "./analyseAggregation";

// Heatmap d'Activité détaillée (Centre d'Analyse) — "occupation" est une
// vraie métrique ici, pas inventée : `institutions.disponibilites`
// contient la liste réelle des créneaux configurés par l'institution
// (réutilise lib/disponibilites.ts::generateSlotsInRange, déjà le point
// de vérité unique pour ce format côté citoyen — pas de parsing dupliqué),
// et `institutions.capacite_par_creneau` (NOT NULL, défaut 1, migration
// 20260720000005) donne le nombre réel de personnes par créneau.
// capacité d'une cellule (jour × tranche 2h) = nb de créneaux configurés
// dans cette tranche × capacite_par_creneau. Occupation = RDV réels / cette
// capacité. Cellule sans créneau configuré = "Fermé" (occupation null),
// jamais un pourcentage inventé.
//
// Volontairement PAS de colonne "Présence par créneau" (taux de scan QR) :
// même garde-fou que lib/analyseTunnel.ts, `presence_status` flagué non
// vérifié par CLAUDE.md à l'écriture de ce fichier. La colonne "Non traités"
// ajoutée ici (08/09/2026) est différente : dérivée de rdvNonTraite()
// (lib/rdvGating.ts), déjà la source unique validée avec Bryan pour ce
// signal précis dans le dashboard institution — pas une nouvelle
// interprétation de presence_status non confirmée.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const JOURS_ABBREV = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const TRANCHES = ["8h", "10h", "12h", "14h", "16h", "18h", "20h"];

function trancheIdx(heure: number): number {
  return Math.min(Math.max(Math.floor((heure - 8) / 2), 0), 6);
}
function jourIdxFromISO(dateISO: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateISO);
  return (d.getDay() + 6) % 7;
}

export type HeatmapCell = { jour: string; tranche: string; rdv: number; annulations: number; capacite: number; occupation: number | null };
export type CreneauInfo = { jour: string; tranche: string; occupation: number; rdv: number };
export type AnnulationTranche = { label: string; count: number; pct: number };
export type PerformanceJour = { jour: string; rdv: number; annulations: number; tauxAnnulation: number; nonTraites: number; occupation: number | null };

export type AnalyseHeatmap = {
  totalRdv: KpiMetric;
  heurePointe: string;
  jourPointe: string;
  tauxOccupationMoyen: KpiMetric;
  creneauxSatures: KpiMetric;
  creneauxSousUtilises: KpiMetric;
  matrice: HeatmapCell[][];
  creneauxCritiques: CreneauInfo[];
  creneauxDisponibles: CreneauInfo[];
  evolutionHoraire: { heure: string; count: number }[];
  evolutionHebdo: { jour: string; count: number }[];
  annulationsParTranche: AnnulationTranche[];
  performanceParJour: PerformanceJour[];
};

function deltaPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel > 0 ? 100 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

export async function calculerAnalyseHeatmap(institutionId: string, fenetreJours: PeriodeJours = 30): Promise<AnalyseHeatmap> {
  const maintenant = new Date();
  const debutCourant = new Date(maintenant.getTime() - fenetreJours * 86400000);
  const debutPrecedent = new Date(maintenant.getTime() - 2 * fenetreJours * 86400000);

  const [{ data: instRaw }, { data: rdvRaw }] = await Promise.all([
    sb.from("institutions").select("disponibilites,capacite_par_creneau").eq("id", institutionId).maybeSingle(),
    sb.from("rdv").select("date_rdv,heure_rdv,statut,presence_status,created_at").eq("institution_id", institutionId).gte("created_at", debutPrecedent.toISOString()),
  ]);

  const capacitePersonne = (instRaw as { capacite_par_creneau: number } | null)?.capacite_par_creneau ?? 1;
  // 14 jours = chaque jour de semaine apparaît 2 fois, dédupliqué par
  // (jour, heure) pour reconstruire le vrai gabarit hebdomadaire même si
  // les créneaux d'aujourd'hui déjà passés sont exclus par generateSlotsInRange.
  const slots = generateSlotsInRange((instRaw as { disponibilites: unknown } | null)?.disponibilites, 14);
  const creneauxParCellule: number[][] = Array.from({ length: 7 }, () => Array(7).fill(0));
  const vus = new Set<string>();
  slots.forEach(s => {
    const ji = jourIdxFromISO(s.dateRdv);
    const cle = `${ji}-${s.heureRdv}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    const h = Number(s.heureRdv.slice(0, 2));
    creneauxParCellule[ji][trancheIdx(h)]++;
  });

  const rdvAll = (rdvRaw ?? []) as { date_rdv: string; heure_rdv: string | null; statut: string; presence_status: string | null; created_at: string }[];
  const estCourant = (iso: string) => new Date(iso) >= debutCourant;
  const rdvCourant = rdvAll.filter(r => estCourant(r.created_at) && r.heure_rdv);
  const rdvPrecedent = rdvAll.filter(r => !estCourant(r.created_at) && r.heure_rdv);

  const rdvParCellule: number[][] = Array.from({ length: 7 }, () => Array(7).fill(0));
  const annulParCellule: number[][] = Array.from({ length: 7 }, () => Array(7).fill(0));
  const rdvParHeure: Record<number, number> = {};
  const rdvParJour: number[] = Array(7).fill(0);
  const annulParJour: number[] = Array(7).fill(0);
  const nonTraiteParJour: number[] = Array(7).fill(0);
  const annulParPeriodeJour: Record<"matin" | "midi" | "apres_midi" | "soir", number> = { matin: 0, midi: 0, apres_midi: 0, soir: 0 };

  rdvCourant.forEach(r => {
    const ji = jourIdxFromISO(r.date_rdv);
    const h = Number(r.heure_rdv!.slice(0, 2));
    const ti = trancheIdx(h);
    rdvParCellule[ji][ti]++;
    rdvParHeure[h] = (rdvParHeure[h] ?? 0) + 1;
    rdvParJour[ji]++;
    if (rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv!)) nonTraiteParJour[ji]++;
    if (r.statut === "annule") {
      annulParCellule[ji][ti]++;
      annulParJour[ji]++;
      if (h >= 6 && h < 12) annulParPeriodeJour.matin++;
      else if (h >= 12 && h < 14) annulParPeriodeJour.midi++;
      else if (h >= 14 && h < 18) annulParPeriodeJour.apres_midi++;
      else annulParPeriodeJour.soir++;
    }
  });

  const matrice: HeatmapCell[][] = JOURS_ABBREV.map((jour, ji) =>
    TRANCHES.map((tranche, ti) => {
      const capacite = creneauxParCellule[ji][ti] * capacitePersonne;
      const rdv = rdvParCellule[ji][ti];
      return { jour, tranche, rdv, annulations: annulParCellule[ji][ti], capacite, occupation: capacite > 0 ? Math.min(100, Math.round((rdv / capacite) * 100)) : null };
    })
  );
  const cellulesOuvertes = matrice.flat().filter(c => c.occupation !== null);

  const totalRdvC = rdvCourant.length, totalRdvP = rdvPrecedent.length;
  const heurePointeEntry = Object.entries(rdvParHeure).sort((a, b) => b[1] - a[1])[0];
  const heurePointe = heurePointeEntry ? `${heurePointeEntry[0].padStart(2, "0")}h00` : "—";
  const jourPointeIdx = rdvParJour.indexOf(Math.max(...rdvParJour));
  const jourPointe = Math.max(...rdvParJour) > 0 ? JOURS_LABELS[jourPointeIdx] : "—";

  const tauxOccupationMoyen = cellulesOuvertes.length > 0 ? Math.round(cellulesOuvertes.reduce((s, c) => s + (c.occupation ?? 0), 0) / cellulesOuvertes.length) : 0;
  const creneauxSatures = cellulesOuvertes.filter(c => (c.occupation ?? 0) >= 86).length;
  const creneauxSousUtilises = cellulesOuvertes.filter(c => (c.occupation ?? 0) <= 30).length;

  const critiquesOrdonnes = cellulesOuvertes.slice().sort((a, b) => (b.occupation ?? 0) - (a.occupation ?? 0));
  const disponiblesOrdonnes = cellulesOuvertes.slice().sort((a, b) => (a.occupation ?? 0) - (b.occupation ?? 0));
  const creneauxCritiques: CreneauInfo[] = critiquesOrdonnes.slice(0, 3).map(c => ({ jour: c.jour, tranche: c.tranche, occupation: c.occupation ?? 0, rdv: c.rdv }));
  const creneauxDisponibles: CreneauInfo[] = disponiblesOrdonnes.slice(0, 3).map(c => ({ jour: c.jour, tranche: c.tranche, occupation: c.occupation ?? 0, rdv: c.rdv }));

  const evolutionHoraire = Array.from({ length: 24 }, (_, h) => ({ heure: `${String(h).padStart(2, "0")}h`, count: rdvParHeure[h] ?? 0 }));
  const evolutionHebdo = JOURS_LABELS.map((jour, i) => ({ jour, count: rdvParJour[i] }));

  const totalAnnulations = Object.values(annulParPeriodeJour).reduce((s, n) => s + n, 0);
  const annulationsParTranche: AnnulationTranche[] = totalAnnulations > 0
    ? [
        { label: "Matin (6h-12h)", count: annulParPeriodeJour.matin, pct: Math.round((annulParPeriodeJour.matin / totalAnnulations) * 1000) / 10 },
        { label: "Midi (12h-14h)", count: annulParPeriodeJour.midi, pct: Math.round((annulParPeriodeJour.midi / totalAnnulations) * 1000) / 10 },
        { label: "Après-midi (14h-18h)", count: annulParPeriodeJour.apres_midi, pct: Math.round((annulParPeriodeJour.apres_midi / totalAnnulations) * 1000) / 10 },
        { label: "Soir (18h+)", count: annulParPeriodeJour.soir, pct: Math.round((annulParPeriodeJour.soir / totalAnnulations) * 1000) / 10 },
      ].filter(t => t.count > 0)
    : [];

  const performanceParJour: PerformanceJour[] = JOURS_LABELS.map((jour, ji) => {
    const cellulesJourOuvertes = matrice[ji].filter(c => c.occupation !== null);
    const occupationJour = cellulesJourOuvertes.length > 0 ? Math.round(cellulesJourOuvertes.reduce((s, c) => s + (c.occupation ?? 0), 0) / cellulesJourOuvertes.length) : null;
    const rdv = rdvParJour[ji], annulations = annulParJour[ji];
    return { jour, rdv, annulations, tauxAnnulation: rdv > 0 ? Math.round((annulations / rdv) * 1000) / 10 : 0, nonTraites: nonTraiteParJour[ji], occupation: occupationJour };
  });

  return {
    totalRdv: { valeur: totalRdvC, delta: deltaPct(totalRdvC, totalRdvP), serie: [] },
    heurePointe, jourPointe,
    tauxOccupationMoyen: { valeur: tauxOccupationMoyen, delta: null, serie: [] },
    creneauxSatures: { valeur: creneauxSatures, delta: null, serie: [] },
    creneauxSousUtilises: { valeur: creneauxSousUtilises, delta: null, serie: [] },
    matrice, creneauxCritiques, creneauxDisponibles, evolutionHoraire, evolutionHebdo, annulationsParTranche, performanceParJour,
  };
}
