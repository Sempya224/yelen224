import type { VueEnsemble, PeriodeJours } from "./analyseAggregation";
import type { AnalyseClients } from "./analyseClients";

// "Insight IA" du Centre d'Analyse — ZÉRO appel LLM, uniquement des règles
// déterministes sur les métriques réelles de calculerVueEnsemble(). Même
// discipline que lib/reputationScore.ts::genererRecommandationsIA() et
// app/api/institution/journal/resume/route.ts : chaîne de conditions
// ordonnée (la plus actionnable en premier), une seule phrase retenue,
// repli neutre si rien ne se déclenche. Décision explicite de Bryan
// (04/08/2026) : le libellé "IA" du brief ne doit jamais impliquer un vrai
// modèle génératif.
function libellePeriode(jours: PeriodeJours): string {
  if (jours === 7) return "les 7 derniers jours";
  if (jours === 30) return "les 30 derniers jours";
  if (jours === 90) return "les 90 derniers jours";
  return "l'année en cours";
}

export function genererInsightAnalyse(v: VueEnsemble | null, periodeJours: PeriodeJours = 30): string {
  if (v === null) return "Chargement des données…";
  const periode = libellePeriode(periodeJours);

  if (v.rdvGeneres.valeur !== null && v.rdvGeneres.valeur > 0 && v.tauxConversion.valeur !== null && v.tauxConversion.valeur < 30) {
    return `Votre taux de conversion (${v.tauxConversion.valeur}%) est en dessous de la moyenne sur ${periode}. Activez les réponses rapides et vérifiez vos disponibilités.`;
  }
  if (v.tauxConversion.delta !== null && v.tauxConversion.delta <= -10) {
    return `Votre taux de conversion a reculé de ${v.tauxConversion.delta} points vs la période précédente. Surveillez vos créneaux disponibles.`;
  }
  if (v.satisfaction.valeur !== null && v.satisfaction.valeur < 3.5) {
    return `Votre note moyenne (${v.satisfaction.valeur}/5) est en dessous du seuil recommandé. Répondre aux avis négatifs rassure vos futurs clients.`;
  }
  if (v.vues.valeur === 0 && v.clics.valeur === 0) {
    return `Aucune vue ni clic enregistré sur vos offres sur ${periode}. Publier une nouvelle offre peut relancer votre visibilité.`;
  }
  if (v.vues.delta !== null && v.vues.delta >= 15) {
    return `Vos vues ont progressé de +${v.vues.delta}% sur ${periode}. Continuez sur cette lancée.`;
  }
  if (v.rdvGeneres.delta !== null && v.rdvGeneres.delta >= 15) {
    return `Vous générez ${v.rdvGeneres.delta > 0 ? "+" : ""}${v.rdvGeneres.delta}% de RDV en plus vs la période précédente. Excellente dynamique.`;
  }
  return "Aucune anomalie détectée sur la période — vos indicateurs sont stables.";
}

// Insight "Mes clients" — même discipline zéro-LLM, sur les segments réels
// de calculerAnalyseClients().
export function genererInsightClients(c: AnalyseClients | null): string {
  if (c === null) return "Chargement des données…";
  if (c.topClients.length === 0) return "Aucun client pour le moment — dès vos premiers RDV, cette section s'enrichira automatiquement.";

  const totalClients = c.segments.reduce((s, seg) => s + seg.count, 0);
  const fideles = c.segments.find(s => s.segment === "fidele")?.count ?? 0;
  const vip = c.segments.find(s => s.segment === "vip")?.count ?? 0;
  const rdvFidelesVip = c.topClients.filter(cl => cl.segment === "fidele" || cl.segment === "vip").reduce((s, cl) => s + cl.nbRdv, 0);
  const totalRdvTop = c.topClients.reduce((s, cl) => s + cl.nbRdv, 0);
  const aRisque = c.rfm.find(r => r.cle === "a_risque")?.count ?? 0;
  const perdus = c.rfm.find(r => r.cle === "perdus")?.count ?? 0;

  if (perdus > 0 && totalClients > 0 && perdus / totalClients >= 0.2) {
    return `${perdus} client${perdus > 1 ? "s" : ""} (${Math.round((perdus / totalClients) * 100)}% de votre base) n'${perdus > 1 ? "ont" : "a"} pas pris RDV depuis plus de 4 mois. Une relance ciblée pourrait limiter la perte de clientèle.`;
  }
  if (aRisque > 0 && totalClients > 0 && aRisque / totalClients >= 0.15) {
    return `${aRisque} client${aRisque > 1 ? "s" : ""} n'${aRisque > 1 ? "ont" : "a"} pas visité depuis 2 à 4 mois — à risque de devenir inactifs. Un rappel ou une offre ciblée peut les faire revenir.`;
  }
  if (fideles + vip > 0 && totalRdvTop > 0) {
    const pctBase = Math.round(((fideles + vip) / totalClients) * 100);
    const pctRdv = Math.round((rdvFidelesVip / totalRdvTop) * 100);
    if (pctBase > 0 && pctRdv > pctBase * 1.5) {
      return `Vos clients fidèles et VIP représentent ${pctBase}% de votre base mais génèrent ${pctRdv}% des RDV du top clients. Une campagne de fidélisation ciblée sur vos nouveaux clients peut augmenter la rétention.`;
    }
  }
  if (c.nouveauxClients.valeur !== null && c.nouveauxClients.valeur > 0 && c.tauxFidelite.valeur !== null && c.tauxFidelite.valeur < 30) {
    return `Vous accueillez de nouveaux clients (${c.nouveauxClients.valeur} sur la période) mais votre taux de fidélité (${c.tauxFidelite.valeur}%) reste bas. Le suivi post-RDV peut améliorer le retour.`;
  }
  return "Aucune anomalie détectée sur votre clientèle — la répartition entre nouveaux, réguliers et fidèles reste équilibrée.";
}
