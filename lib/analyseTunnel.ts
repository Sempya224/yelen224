import { createClient } from "@supabase/supabase-js";
import type { KpiMetric, PeriodeJours } from "./analyseAggregation";

// Tunnel d'Acquisition détaillé (Centre d'Analyse) — KPIs réels, panel des
// pertes dérivé du tunnel lui-même, causes d'abandon réelles (motif_refus/
// motif_annulation, texte libre saisi par l'institution — jamais reclassé
// dans une taxonomie inventée, affiché tel quel).
//
// Volontairement PAS d'étape "Présence confirmée" (demandée par le brief) :
// CLAUDE.md flague explicitement `presence`/`presence_status`/
// `presence_confirmed_at` comme non vérifiés par SQL vis-à-vis de l'enum
// `statut_rdv` ("reste à vérifier par SQL avant tout travail sur le taux
// de présence") — construire une étape dessus sans cette vérification
// serait exactement le genre de donnée non confirmée que le protocole du
// projet interdit. Les 3 étapes ci-dessous (Demandes/Confirmés/Terminés)
// utilisent `statut`, déjà vérifié et utilisé partout ailleurs dans le
// produit.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const STATUTS_CONFIRMES = ["confirme", "effectue", "termine", "honore"];
const STATUTS_TERMINES = ["effectue", "termine", "honore"];

export type NiveauPerte = "critique" | "moyen" | "faible";
export type PerteEtape = { etape: string; label: string; perteCount: number; deltaPct: number; niveau: NiveauPerte };
export type CauseAbandon = { type: "refus" | "annulation"; motif: string; count: number; pct: number };

export type AnalyseTunnel = {
  demandes: KpiMetric;
  confirmes: KpiMetric;
  termines: KpiMetric;
  enAttente: KpiMetric;
  conversionGlobale: KpiMetric;
  perteTotale: KpiMetric;
  pertes: PerteEtape[];
  causesAbandon: CauseAbandon[];
};

function deltaPct(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel > 0 ? 100 : null;
  return Math.round(((actuel - precedent) / precedent) * 1000) / 10;
}

function niveauPerte(pct: number): NiveauPerte {
  if (pct >= 20) return "critique";
  if (pct >= 10) return "moyen";
  return "faible";
}

export async function calculerAnalyseTunnel(institutionId: string, fenetreJours: PeriodeJours = 30): Promise<AnalyseTunnel> {
  const maintenant = new Date();
  const debutCourant = new Date(maintenant.getTime() - fenetreJours * 86400000);
  const debutPrecedent = new Date(maintenant.getTime() - 2 * fenetreJours * 86400000);

  const { data: rdvRaw } = await sb
    .from("rdv")
    .select("statut,created_at,motif_refus,motif_annulation")
    .eq("institution_id", institutionId)
    .gte("created_at", debutPrecedent.toISOString());
  const rdvAll = (rdvRaw ?? []) as { statut: string; created_at: string; motif_refus: string | null; motif_annulation: string | null }[];

  const estCourant = (iso: string) => new Date(iso) >= debutCourant;
  const rdvCourant = rdvAll.filter(r => estCourant(r.created_at));
  const rdvPrecedent = rdvAll.filter(r => !estCourant(r.created_at));

  const compter = (rows: typeof rdvAll, pred: (s: string) => boolean) => rows.filter(r => pred(r.statut)).length;

  const demandesC = rdvCourant.length, demandesP = rdvPrecedent.length;
  const confirmesC = compter(rdvCourant, s => STATUTS_CONFIRMES.includes(s)), confirmesP = compter(rdvPrecedent, s => STATUTS_CONFIRMES.includes(s));
  const terminesC = compter(rdvCourant, s => STATUTS_TERMINES.includes(s)), terminesP = compter(rdvPrecedent, s => STATUTS_TERMINES.includes(s));
  const enAttenteC = compter(rdvCourant, s => s === "en_attente"), enAttenteP = compter(rdvPrecedent, s => s === "en_attente");

  const conversionC = demandesC > 0 ? Math.round((terminesC / demandesC) * 1000) / 10 : 0;
  const conversionP = demandesP > 0 ? Math.round((terminesP / demandesP) * 1000) / 10 : 0;
  const perteC = Math.round((100 - conversionC) * 10) / 10;
  const perteP = Math.round((100 - conversionP) * 10) / 10;

  // ── Panel des pertes (dérivé des 2 transitions réelles du tunnel) ──
  const perteConfirmationPct = demandesC > 0 ? Math.round(((demandesC - confirmesC) / demandesC) * 1000) / 10 : 0;
  const perteRealisationPct = confirmesC > 0 ? Math.round(((confirmesC - terminesC) / confirmesC) * 1000) / 10 : 0;
  const pertes: PerteEtape[] = [
    { etape: "confirmation", label: "Demande → Confirmation", perteCount: demandesC - confirmesC, deltaPct: perteConfirmationPct, niveau: niveauPerte(perteConfirmationPct) },
    { etape: "realisation", label: "Confirmation → Réalisation", perteCount: confirmesC - terminesC, deltaPct: perteRealisationPct, niveau: niveauPerte(perteRealisationPct) },
  ].sort((a, b) => b.deltaPct - a.deltaPct);

  // ── Causes d'abandon réelles (texte libre, jamais reclassé) ──
  const refus = rdvCourant.filter(r => r.statut === "refuse");
  const annulations = rdvCourant.filter(r => r.statut === "annule");
  const compteMotifs: Record<string, { type: "refus" | "annulation"; motif: string; count: number }> = {};
  refus.forEach(r => {
    const motif = (r.motif_refus || "").trim() || "Non précisé";
    const cle = `refus:${motif}`;
    if (!compteMotifs[cle]) compteMotifs[cle] = { type: "refus", motif, count: 0 };
    compteMotifs[cle].count++;
  });
  annulations.forEach(r => {
    const motif = (r.motif_annulation || "").trim() || "Non précisé";
    const cle = `annulation:${motif}`;
    if (!compteMotifs[cle]) compteMotifs[cle] = { type: "annulation", motif, count: 0 };
    compteMotifs[cle].count++;
  });
  const totalAbandons = refus.length + annulations.length;
  const causesTriees = Object.values(compteMotifs).sort((a, b) => b.count - a.count);
  const top5 = causesTriees.slice(0, 5);
  const autresCount = causesTriees.slice(5).reduce((s, c) => s + c.count, 0);
  const causesAbandon: CauseAbandon[] = totalAbandons > 0
    ? [
        ...top5.map(c => ({ type: c.type, motif: c.motif, count: c.count, pct: Math.round((c.count / totalAbandons) * 1000) / 10 })),
        ...(autresCount > 0 ? [{ type: "refus" as const, motif: "Autres", count: autresCount, pct: Math.round((autresCount / totalAbandons) * 1000) / 10 }] : []),
      ]
    : [];

  return {
    demandes: { valeur: demandesC, delta: deltaPct(demandesC, demandesP), serie: [] },
    confirmes: { valeur: confirmesC, delta: deltaPct(confirmesC, confirmesP), serie: [] },
    termines: { valeur: terminesC, delta: deltaPct(terminesC, terminesP), serie: [] },
    enAttente: { valeur: enAttenteC, delta: deltaPct(enAttenteC, enAttenteP), serie: [] },
    conversionGlobale: { valeur: conversionC, delta: conversionP > 0 ? Math.round((conversionC - conversionP) * 10) / 10 : null, serie: [] },
    perteTotale: { valeur: perteC, delta: perteP > 0 ? Math.round((perteC - perteP) * 10) / 10 : null, serie: [] },
    pertes,
    causesAbandon,
  };
}
