// Helpers d'affichage partagés entre les écrans "Yelen Business" qui
// montrent tous le même rappel factuel du compte (Compte Yelen, Contrat
// Yelen, et les prochains à venir) — extrait de YelenCompteTab.tsx pour
// éviter de dupliquer ces mappings à chaque nouvel écran de la section.
export type InstCompte = {
  id: string;
  name: string;
  logo: string | null;
  secteur?: string | null;
  category: string;
  statut?: string;
  plan?: string;
  created_at?: string;
  badge_verifie: boolean;
};

// Jamais d'emoji dans Yelen — le point coloré se rend via StatusDot
// (YelenBusinessShared.tsx), pas via un caractère emoji ici.
export const STATUT_META: Record<string, { label: string; couleur: string }> = {
  validee: { label: "Actif", couleur: "#16a34a" },
  en_attente: { label: "En attente de validation", couleur: "#d97706" },
  suspendue: { label: "Suspendu", couleur: "#dc2626" },
  refusee: { label: "Refusé", couleur: "#dc2626" },
};

export const PLAN_LABELS: Record<string, string> = { essentiel: "Essentiel", pro: "Pro", entreprise: "Entreprise" };

export function formatDateLongue(iso?: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
