// Taxonomie secteur / statut_juridique — source unique de vérité, réutilisée
// par l'onboarding (app/institution/inscription/page.tsx) et le sélecteur de
// correction post-inscription (ProfilEntrepriseTab.tsx). Valeurs alignées sur
// les CHECK constraints de institutions.secteur / .statut_juridique (voir
// supabase/migrations/20260710000001_onboarding_prestataire.sql). Les labels
// de statut_juridique sont formulés pour un public large — Yelen couvre toute
// structure qui reçoit des rendez-vous (institution publique, PME, profession
// libérale, ou entrepreneur/commerçant individuel), pas seulement les
// institutions au sens administratif.

export type SecteurId =
  | "sante" | "administratif" | "financier" | "juridique"
  | "beaute_bien_etre" | "commerce" | "artisanat" | "services_divers";

export type StatutJuridiqueId = "public" | "prive_formel" | "liberal" | "individuel_informel";

export const SECTEURS: { id: SecteurId; label: string }[] = [
  { id: "sante",             label: "Santé" },
  { id: "administratif",     label: "Administratif" },
  { id: "financier",         label: "Financier" },
  { id: "juridique",         label: "Juridique" },
  { id: "beaute_bien_etre",  label: "Beauté / Bien-être" },
  { id: "commerce",          label: "Commerce" },
  { id: "artisanat",         label: "Artisanat" },
  { id: "services_divers",   label: "Services divers" },
];

export const STATUTS_JURIDIQUES: { id: StatutJuridiqueId; label: string; description: string }[] = [
  { id: "public",              label: "Institution publique",                    description: "Hôpital, mairie, ambassade ou toute administration d'État" },
  { id: "prive_formel",        label: "PME / Entreprise",                        description: "Entreprise ou société enregistrée (RCCM) — clinique privée, banque, cabinet…" },
  { id: "liberal",              label: "Profession libérale",                     description: "Profession réglementée exercée en libéral — médecin, avocat, notaire…" },
  { id: "individuel_informel", label: "Entrepreneur / Commerçant individuel",    description: "Activité individuelle non enregistrée formellement — coiffeur, artisan, boutique…" },
];

export const SERVICES_PAR_SECTEUR: Record<SecteurId, string[]> = {
  sante: ["Consultation générale", "Consultation spécialisée", "Urgences", "Vaccination", "Analyses / Laboratoire"],
  administratif: ["Acte d'état civil", "Carte d'identité / Passeport", "Permis", "Légalisation de documents"],
  financier: ["Ouverture de compte", "Demande de crédit", "Transfert d'argent", "Conseil financier"],
  juridique: ["Consultation juridique", "Dépôt de dossier", "Audience", "Médiation"],
  beaute_bien_etre: ["Coiffure", "Soins esthétiques", "Massage", "Spa"],
  commerce: ["Vente en boutique", "Retrait de commande", "Conseil produit", "Livraison"],
  artisanat: ["Commande sur mesure", "Réparation", "Devis", "Retrait d'ouvrage"],
  services_divers: ["Consultation", "Prestation à domicile", "Rendez-vous conseil", "Autre"],
};

// SVG dédiés par secteur — pas d'emoji, cohérent avec le reste de l'app
// (icônes stroke, currentColor).
export function SecteurIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "sante": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>;
    case "administratif": return <svg {...p}><path d="M4 21V10l8-6 8 6v11M9 21v-6h6v6"/></svg>;
    case "financier": return <svg {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>;
    case "juridique": return <svg {...p}><path d="M12 3v18M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0zM5 7h14M8 21h8"/></svg>;
    case "beaute_bien_etre": return <svg {...p}><path d="M12 3l1.8 5.6L19 10l-5.2 1.4L12 17l-1.8-5.6L5 10l5.2-1.4z"/></svg>;
    case "commerce": return <svg {...p}><path d="M6 2l1.5 5M18 2l-1.5 5M3 7h18l-1.4 13a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"/></svg>;
    case "artisanat": return <svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-8 8l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 8-8z"/></svg>;
    default: return <svg {...p}><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>;
  }
}
