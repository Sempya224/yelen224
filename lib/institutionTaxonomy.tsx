// Taxonomie secteur / statut_juridique — source unique de vérité, réutilisée
// par l'onboarding (app/institution/inscription/page.tsx) et le sélecteur de
// correction post-inscription (ProfilEntrepriseTab.tsx). Valeurs alignées sur
// les CHECK constraints de institutions.secteur / .statut_juridique (voir
// supabase/migrations/20260710000001_onboarding_prestataire.sql). Les labels
// de statut_juridique sont formulés pour un public large — Yelen couvre toute
// structure qui reçoit des rendez-vous (institution publique, PME, profession
// libérale, ou entrepreneur/commerçant individuel), pas seulement les
// institutions au sens administratif.
//
// Centralisation secteur (chantier Hôtel, Phase 0, 19/08/2026) : ce fichier
// absorbe lib/secteurs.ts (SECTEUR_LABELS/SECTEUR_META, ex-chantier Favoris
// citoyen) et les listes id-only dupliquées dans ActiviteStep.tsx /
// register/route.ts / profile/route.ts. Zéro changement de valeur — mêmes 8
// secteurs, mêmes couleurs, mêmes 4 statuts juridiques qu'avant.
//
// Phase 1 (19/08/2026, docs/ui/YELEN_HOTEL_MODEL_AUDIT.md) : 9ᵉ secteur
// "hotel" ajouté ici — seul point d'ajout nécessaire pour que le wizard
// d'inscription, la correction de profil (ProfilEntrepriseTab.tsx), les
// suggestions de services (ServicesTab.tsx) et la validation serveur
// (register/route.ts, profile/route.ts, via SECTEUR_ID_LIST) le proposent
// automatiquement. Migration correspondante :
// supabase/migrations/20260819000001_institutions_secteur_hotel.sql
// (élargit le CHECK constraint, pas encore exécutée). La fiche publique
// (InstitutionPublicClient.tsx) n'est volontairement pas touchée ici — sa
// propre icône de secteur (SECTEUR_ICON) retombe déjà sur Icons.Building par
// défaut pour tout id absent, comportement acceptable en attendant la Phase 2
// dédiée (bloc "Chambres"/Équipements).
//
// ⚠️ Dette identifiée en vérifiant les consommateurs, PAS corrigée ici (pas de
// changement de comportement visible) : les labels de statut_juridique
// affichés dans le wizard d'inscription (ActiviteStep.tsx/ReviewStep.tsx —
// "Public", "Privé formel", "Libéral", "Individuel / informel") divergent du
// texte plus long ci-dessous utilisé par ProfilEntrepriseTab.tsx
// ("Institution publique", "PME / Entreprise", "Profession libérale",
// "Entrepreneur / Commerçant individuel"). Décision de contenu à trancher
// séparément — les deux formulations restent volontairement en place.
//
// Révision taxonomie (décision CEO, 20/08/2026,
// docs/audits/TAXONOMIE_YELEN_COMMERCE_TECHNOLOGIE_AUDIT.md) : "commerce"
// retiré (positionnement produit, indépendant du cas Nimba SMS — 0
// institution/0 paid_services concernés, vérifié en base avant retrait,
// §5/§20 de l'audit), "technologie_numerique" ajouté (couvre les
// entreprises B2B tech/numérique/télécom, jusqu'ici sans secteur adapté).
// Migration correspondante :
// supabase/migrations/20260820000001_institutions_secteur_technologie_commerce.sql.
//
// ⚠️ GEL (chantier Taxonomie des activités, Phase 5, 20/08/2026,
// docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md) : `institutions.secteur`
// / SECTEUR_ID_LIST / SECTEURS / SECTEUR_LABELS / SECTEUR_META /
// SERVICES_PAR_SECTEUR sont désormais gelés en LECTURE SEULE — plus jamais
// écrits par aucun écran produit (wizard d'inscription, ProfilEntrepriseTab,
// register/route.ts, profile/route.ts basculés vers
// activite_categorie_id/activite_principale_id/institution_activites, voir
// activiteVisuels.tsx + migrations 20260821000001-009). Ne jamais ajouter de
// nouvelle valeur ici ni faire évoluer ce fichier pour un besoin produit —
// toute nouvelle activité se crée désormais dans la table `activites`
// (admin, app/admin/activites/page.tsx). Ce fichier reste en place
// uniquement pour les lecteurs historiques encore actifs (fiche publique en
// repli avant migration d'une institution, opengraph-image.tsx, écrans
// citoyen favoris/mes-avis/mes-demarches, ServicesTab.tsx suggestions
// "Offre générale") — jamais supprimé tant que ces lecteurs existent.
// `institutions.category` reste également hors périmètre de ce chantier
// (bug d'étiquetage admin connu et non corrigé, app/admin/institutions/
// page.tsx et api/admin/kpis/route.ts — différé volontairement).

export type SecteurId =
  | "sante" | "administratif" | "financier" | "juridique"
  | "beaute_bien_etre" | "artisanat" | "services_divers" | "hotel"
  | "technologie_numerique";

export type StatutJuridiqueId = "public" | "prive_formel" | "liberal" | "individuel_informel";

export const SECTEURS: { id: SecteurId; label: string }[] = [
  { id: "sante",             label: "Santé" },
  { id: "administratif",     label: "Administratif" },
  { id: "financier",         label: "Financier" },
  { id: "juridique",         label: "Juridique" },
  { id: "beaute_bien_etre",  label: "Beauté / Bien-être" },
  { id: "artisanat",         label: "Artisanat" },
  { id: "services_divers",   label: "Services divers" },
  { id: "hotel",             label: "Hôtel" },
  { id: "technologie_numerique", label: "Technologie & numérique" },
];

// Couleurs par secteur — reprises telles quelles de l'ex lib/secteurs.ts
// (SECTEUR_META), utilisées par la fiche publique (badge secteur) et l'image
// opengraph. Séparées de SECTEURS ci-dessus pour ne pas changer sa forme
// {id,label} déjà consommée par ServicesTab.tsx/ProfilEntrepriseTab.tsx.
const SECTEUR_COLORS: Record<SecteurId, string> = {
  sante:             "#ef4444",
  administratif:     "#F5A623",
  financier:         "#22c55e",
  juridique:         "#f43f5e",
  beaute_bien_etre:  "#a855f7",
  artisanat:         "#f97316",
  services_divers:   "#8b5cf6",
  hotel:             "#3b82f6",
  technologie_numerique: "#0ea5e9",
};

// Typées Record<string, ...> (pas Record<SecteurId, ...>) volontairement :
// tous les consommateurs actuels indexent avec une valeur `string` brute
// venue de la base ou d'un état libre (inst.secteur, state.activite.secteur),
// jamais garantie SecteurId côté TypeScript — même permissivité que l'ancien
// lib/secteurs.ts pour ne rien casser à la compilation.
export const SECTEUR_LABELS: Record<string, string> = Object.fromEntries(
  SECTEURS.map(s => [s.id, s.label])
);

export const SECTEUR_META: Record<string, { color: string }> = Object.fromEntries(
  SECTEURS.map(s => [s.id, { color: SECTEUR_COLORS[s.id] }])
);

// Listes d'ids brutes (string[], pas SecteurId[]/StatutJuridiqueId[]) pour les
// routes de validation serveur (`.includes(valeurBrute)` sur une entrée
// `unknown`/`string` du body) — register/route.ts et profile/route.ts.
export const SECTEUR_ID_LIST: readonly string[] = SECTEURS.map(s => s.id);

export const STATUTS_JURIDIQUES: { id: StatutJuridiqueId; label: string; description: string }[] = [
  { id: "public",              label: "Institution publique",                    description: "Hôpital, mairie, ambassade ou toute administration d'État" },
  { id: "prive_formel",        label: "PME / Entreprise",                        description: "Entreprise ou société enregistrée (RCCM) — clinique privée, banque, cabinet…" },
  { id: "liberal",              label: "Profession libérale",                     description: "Profession réglementée exercée en libéral — médecin, avocat, notaire…" },
  { id: "individuel_informel", label: "Entrepreneur / Commerçant individuel",    description: "Activité individuelle non enregistrée formellement — coiffeur, artisan, boutique…" },
];

export const STATUT_JURIDIQUE_ID_LIST: readonly string[] = STATUTS_JURIDIQUES.map(s => s.id);

export const SERVICES_PAR_SECTEUR: Record<SecteurId, string[]> = {
  sante: ["Consultation générale", "Consultation spécialisée", "Urgences", "Vaccination", "Analyses / Laboratoire"],
  administratif: ["Acte d'état civil", "Carte d'identité / Passeport", "Permis", "Légalisation de documents"],
  financier: ["Ouverture de compte", "Demande de crédit", "Transfert d'argent", "Conseil financier"],
  juridique: ["Consultation juridique", "Dépôt de dossier", "Audience", "Médiation"],
  beaute_bien_etre: ["Coiffure", "Soins esthétiques", "Massage", "Spa"],
  artisanat: ["Commande sur mesure", "Réparation", "Devis", "Retrait d'ouvrage"],
  services_divers: ["Consultation", "Prestation à domicile", "Rendez-vous conseil", "Autre"],
  // Types de chambres nommés avec prix indicatif — V1 vitrine, réutilisent
  // paid_services tel quel (aucun inventaire/disponibilité réelle, voir
  // Partie 7/15 de l'audit). Pas une réservation par date.
  hotel: ["Chambre simple", "Chambre double", "Suite", "Chambre familiale"],
  technologie_numerique: ["Démonstration produit", "Support technique", "Intégration API", "Consultation technique"],
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
    case "artisanat": return <svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-8 8l-6.6 6.6a2.1 2.1 0 0 1-3-3l6.6-6.6a6 6 0 0 1 8-8z"/></svg>;
    case "hotel": return <svg {...p}><path d="M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/><path d="M3 18h18"/><path d="M5 10V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/></svg>;
    case "technologie_numerique": return <svg {...p}><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
    default: return <svg {...p}><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></svg>;
  }
}
