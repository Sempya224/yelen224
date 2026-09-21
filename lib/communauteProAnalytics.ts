// Yelen Community — logique partagée entre les routes analytics
// institution (Audience, Présence, Vue d'ensemble V2 — 16/09/2026).
// Extrait après la 3e duplication exacte (communaute-audience,
// communaute-presence, communaute-apercu) — avant ça chaque route gardait
// sa propre copie, conforme à la préférence du projet pour la duplication
// légère plutôt que l'abstraction prématurée, mais 3 copies identiques
// dépasse ce seuil.
export type PeriodeCommunaute = "7j" | "30j" | "90j" | "12mois";

export function calculerBornesCommunaute(periode: PeriodeCommunaute): { debut: Date; fin: Date } {
  const fin = new Date();
  const debut = new Date(fin);
  if (periode === "7j") debut.setUTCDate(debut.getUTCDate() - 7);
  else if (periode === "90j") debut.setUTCDate(debut.getUTCDate() - 90);
  else if (periode === "12mois") debut.setUTCMonth(debut.getUTCMonth() - 12);
  else debut.setUTCDate(debut.getUTCDate() - 30);
  return { debut, fin };
}

export function jourStrCommunaute(d: Date): string { return d.toISOString().slice(0, 10); }

// Complétude du profil — 7 critères réels, équipondérés (~14,3 % chacun),
// jamais persisté (recalculé à chaque appel, même principe que
// score_sante côté citoyen). Aucun champ "photos" générique n'existe pour
// une institution (seuls logo/banniere) — décision Bryan 16/09/2026 : les
// traiter comme 2 critères visuels séparés plutôt que d'inventer une
// notion de galerie qui n'existe pas dans le schéma.
export type CriterePresence = { cle: string; label: string; ok: boolean; suggestion: string };

export function calculerCriteresPresence(inst: {
  logo: string | null; banniere: string | null; description: string | null;
  adresse: string | null; horaires: unknown; services: unknown; phone: string | null; whatsapp: string | null;
}): CriterePresence[] {
  const horairesRempli = !!inst.horaires && typeof inst.horaires === "object" && Object.keys(inst.horaires as object).length > 0;
  const servicesRempli = Array.isArray(inst.services) ? inst.services.length > 0
    : !!inst.services && typeof inst.services === "object" && Object.keys(inst.services as object).length > 0;
  return [
    { cle: "logo", label: "Logo", ok: !!inst.logo, suggestion: "Ajoutez votre logo" },
    { cle: "banniere", label: "Photo de couverture", ok: !!inst.banniere, suggestion: "Ajoutez une photo de couverture" },
    { cle: "description", label: "Description", ok: !!inst.description?.trim(), suggestion: "Complétez votre description" },
    { cle: "adresse", label: "Adresse", ok: !!inst.adresse?.trim(), suggestion: "Renseignez votre adresse" },
    { cle: "horaires", label: "Horaires", ok: horairesRempli, suggestion: "Ajoutez vos horaires" },
    { cle: "services", label: "Services", ok: servicesRempli, suggestion: "Complétez vos services" },
    { cle: "contact", label: "Contact", ok: !!(inst.phone?.trim() || inst.whatsapp?.trim()), suggestion: "Ajoutez un numéro de contact" },
  ];
}

export function scorePresencePct(criteres: CriterePresence[]): number {
  return criteres.length > 0 ? Math.round((criteres.filter(c => c.ok).length / criteres.length) * 100) : 0;
}

// Seuil minimum avant d'afficher un agrégat (%, portée, tendance) — même
// discipline que VueEnsembleView::topCategorieLabel (≥3 publications) et
// les favoris citoyen (≥3 mesures) : jamais une fausse précision sur un
// échantillon trop petit.
export const SEUIL_MIN_ECHANTILLON_COMMUNAUTE = 3;
