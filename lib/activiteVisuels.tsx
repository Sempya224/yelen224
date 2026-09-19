// Métadonnées visuelles des 15 catégories d'activité (couleur/icône) —
// chantier Taxonomie des activités, Phase 2 (20/08/2026,
// docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md §4.3/§12). Reste
// volontairement en TS (15 entrées, jamais 150) : les catégories/activités
// elles-mêmes vivent en base (activite_categories/activites), seule la
// présentation visuelle reste en code — même séparation déjà appliquée à
// SECTEUR_COLORS/SecteurIcon dans lib/institutionTaxonomy.tsx.
//
// Plusieurs tracés sont repris tels quels de lib/institutionTaxonomy.tsx
// (SecteurIcon) là où l'ancien secteur correspond conceptuellement à la
// nouvelle catégorie (ex. ancien "sante" → nouvelle "Santé & médical") —
// cohérence visuelle, pas une coïncidence.
export const ACTIVITE_CATEGORIE_COLORS: Record<string, string> = {
  institutions_publiques_administratif: "#F5A623",
  sante_medical:                        "#ef4444",
  finance_assurance_paiements:          "#22c55e",
  droit_comptabilite_conseil:           "#f43f5e",
  technologie_numerique_telecom:        "#0ea5e9",
  education_formation_recherche:        "#6366f1",
  hebergement_restauration_evenements:  "#3b82f6",
  transport_logistique_mobilite:        "#14b8a6",
  btp_immobilier_technique:             "#78716c",
  agriculture_elevage_rural:            "#65a30d",
  artisanat_fabrication_reparation:     "#f97316",
  beaute_bien_etre_sport:               "#a855f7",
  communication_medias_creation:        "#ec4899",
  services_entreprises_externalisation: "#8b5cf6",
  associations_ong_organisations:       "#06b6d4",
};

// Libellés courts (pastilles/pills de recherche citoyenne, chantier
// "Recherche & catégories", 21/08/2026) — les `label` d'activite_categories
// (ex. "Hébergement, restauration & événements") sont trop longs pour une
// pastille/chip. Même 15 codes, jamais une 16e liste.
export const ACTIVITE_CATEGORIE_SHORT: Record<string, string> = {
  institutions_publiques_administratif: "Administration",
  sante_medical:                        "Santé",
  finance_assurance_paiements:          "Finance",
  droit_comptabilite_conseil:           "Droit",
  technologie_numerique_telecom:        "Technologie",
  education_formation_recherche:        "Éducation",
  hebergement_restauration_evenements:  "Hôtels & restos",
  transport_logistique_mobilite:        "Transport",
  btp_immobilier_technique:             "BTP & immobilier",
  agriculture_elevage_rural:            "Agriculture",
  artisanat_fabrication_reparation:     "Artisanat",
  beaute_bien_etre_sport:               "Beauté & sport",
  communication_medias_creation:        "Communication",
  services_entreprises_externalisation: "Services pro",
  associations_ong_organisations:       "ONG",
};

export function ActiviteCategorieIcon({ code, color, size = 20 }: { code: string; color: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (code) {
    case "institutions_publiques_administratif": return <svg {...p}><path d="M4 21V10l8-6 8 6v11M9 21v-6h6v6"/></svg>;
    case "sante_medical": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>;
    case "finance_assurance_paiements": return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>;
    case "droit_comptabilite_conseil": return <svg {...p}><path d="M12 3v18M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0zM5 7h14M8 21h8"/></svg>;
    case "technologie_numerique_telecom": return <svg {...p}><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
    case "education_formation_recherche": return <svg {...p}><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>;
    case "hebergement_restauration_evenements": return <svg {...p}><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M3 18h18"/><path d="M5 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg>;
    case "transport_logistique_mobilite": return <svg {...p}><rect x="1" y="6" width="14" height="11" rx="1"/><path d="M15 9h4l3 3v5h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="17.5" cy="19" r="1.6"/></svg>;
    case "btp_immobilier_technique": return <svg {...p}><path d="M3 21h18M5 21V9l7-6 7 6v12M9 21v-4h6v4"/><line x1="9" y1="12" x2="15" y2="12"/></svg>;
    case "agriculture_elevage_rural": return <svg {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>;
    case "artisanat_fabrication_reparation": return <svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-8 8l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 8-8z"/></svg>;
    case "beaute_bien_etre_sport": return <svg {...p}><path d="M12 3l1.8 5.6L19 10l-5.2 1.4L12 17l-1.8-5.6L5 10l5.2-1.4z"/></svg>;
    case "communication_medias_creation": return <svg {...p}><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>;
    case "services_entreprises_externalisation": return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case "associations_ong_organisations": return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    default: return <svg {...p}><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>;
  }
}
