// Constantes/types de restriction RDV partagés client + serveur — extraits
// de lib/rdvRestrictions.ts (03/09/2026) pour que components/
// RdvRestrictionScreen.tsx (client) puisse les importer sans tirer avec eux
// lib/notificationEngine.ts (donc web-push, dépendance Node-only net/tls)
// dans le bundle navigateur. Zéro import ici, volontairement.
export type RdvRestrictionNiveau = "restreint_7j" | "restreint_30j" | "clos";

export const RDV_ABSENCE_SEUILS: Record<RdvRestrictionNiveau, number> = {
  restreint_7j: 3,
  restreint_30j: 5,
  clos: 10,
};

export const RDV_RESTRICTION_DUREE_JOURS: Record<"restreint_7j" | "restreint_30j", number> = {
  restreint_7j: 7,
  restreint_30j: 30,
};
