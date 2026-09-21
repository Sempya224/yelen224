// Registre des moyens de paiement pour le règlement de l'abonnement Yelen
// Business (Yelen Business → Moyens de paiement, 18/09/2026) — DISTINCT des
// moyens de paiement que l'établissement accepte de ses propres clients
// (paid_bookings.methode_paiement, déclaratif, voir
// app/[slug]/[id]/components/PaiementsTab.tsx). Ici il s'agit de ce que
// Yelen débite pour facturer L'ÉTABLISSEMENT.
//
// Audit préalable : aucune intégration de passerelle de paiement (Orange
// Money, MTN MoMo, NimbaPay, carte) n'existe nulle part dans le projet —
// paid_bookings.methode_paiement est une simple étiquette texte déclarée
// par le citoyen, jamais un appel API réel à un fournisseur. Ce fichier
// définit donc un CATALOGUE des rails de paiement réels du marché
// guinéen (Orange Money, MTN MoMo, NimbaPay existent réellement — les
// citer n'est pas une donnée inventée), mais AUCUN institution n'a
// aujourd'hui de moyen réellement connecté à Yelen : tout affichage
// applicatif doit rester à l'état `not_configured`/`bientot`, jamais
// `active`/`disponible` tant que l'intégration technique n'existe pas.
//
// Architecture volontairement en registre (par pays) plutôt qu'un
// `if (pays === "Guinée")` en dur dans l'écran — Yelen n'opère
// aujourd'hui qu'en Guinée (institutions.pays non encore exploité côté
// dashboard, voir YelenCompteTab.tsx), donc la résolution reste fixée à
// "Guinée" pour l'instant, mais la structure supporte déjà d'autres pays
// dès que ce sera nécessaire, sans réécrire l'écran.
export type PaymentProviderType = "mobile_money" | "bank" | "card" | "other";

// Disponibilité côté PLATEFORME Yelen (peut-on connecter ce rail du tout
// aujourd'hui ?) — distincte de l'état de connexion d'un établissement
// donné (voir PaymentMethodState ci-dessous).
export type PaymentProviderAvailability = "bientot" | "indisponible";

export type PaymentProvider = {
  id: string;
  label: string;
  country: string;
  currency: string;
  type: PaymentProviderType;
  availability: PaymentProviderAvailability;
  description: string;
};

// État de connexion d'un moyen de paiement pour UN établissement donné.
// Ensemble complet prévu dès maintenant (même si seul `not_configured`
// est atteignable aujourd'hui, aucune connexion réelle n'existant encore)
// pour ne pas avoir à retoucher l'écran quand l'intégration arrivera.
export type PaymentMethodState =
  | "not_configured" | "pending" | "verification_required" | "active"
  | "action_required" | "failed" | "suspended" | "expired" | "removed";

// Jamais d'emoji dans Yelen — le point coloré se rend via StatusDot
// (YelenBusinessShared.tsx), pas via un caractère emoji ici.
export const PAYMENT_STATE_META: Record<PaymentMethodState, { label: string; couleur: string }> = {
  not_configured: { label: "Non configuré", couleur: "#6b7280" },
  pending: { label: "En attente", couleur: "#d97706" },
  verification_required: { label: "Vérification requise", couleur: "#d97706" },
  active: { label: "Connecté", couleur: "#16a34a" },
  action_required: { label: "Action requise", couleur: "#d97706" },
  failed: { label: "Échec", couleur: "#dc2626" },
  suspended: { label: "Suspendu", couleur: "#dc2626" },
  expired: { label: "Expiré", couleur: "#dc2626" },
  removed: { label: "Retiré", couleur: "#6b7280" },
};

export const PAYMENT_PROVIDERS_PAR_PAYS: Record<string, PaymentProvider[]> = {
  Guinée: [
    { id: "orange_money", label: "Orange Money", country: "Guinée", currency: "GNF", type: "mobile_money", availability: "bientot",
      description: "Paiement mobile via le compte marchand Orange Money de votre établissement." },
    { id: "mtn_momo", label: "MTN MoMo", country: "Guinée", currency: "GNF", type: "mobile_money", availability: "bientot",
      description: "Paiement mobile via MTN Mobile Money." },
    { id: "nimbapay", label: "NimbaPay", country: "Guinée", currency: "GNF", type: "mobile_money", availability: "bientot",
      description: "Paiement instantané via l'infrastructure nationale de paiement de la Guinée." },
  ],
};

export function fournisseursPourPays(pays: string): PaymentProvider[] {
  return PAYMENT_PROVIDERS_PAR_PAYS[pays] ?? [];
}
