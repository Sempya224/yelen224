// Moteur de décision du CTA principal de la fiche Prestataire — chantier
// CTA V1, décision CEO 17/08/2026 (voir docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md).
// Source unique de vérité : aucune autre copie de cette logique ne doit
// exister ailleurs dans le produit. Capacités dérivées uniquement de
// données réelles déjà existantes (institutions.services, paid_services,
// institutions.disponibilites, .website, .whatsapp, .phone) — zéro
// migration, zéro colonne, zéro profile_type.

import { generateSlotsInRange } from "@/lib/disponibilites";
import { urlExterneSure } from "@/lib/urlValidation";

// Même horizon que le wizard de réservation (app/rdv/[id]/page.tsx:645)
// et l'API favoris (app/api/citoyen/favoris/route.ts:7) — un créneau
// au-delà de cette fenêtre n'est de toute façon jamais montré au citoyen.
const JOURS_FENETRE_BOOKING = 28;

export type PrestataireCapacites = {
  hasBooking: boolean;
  hasWebsite: boolean;
  hasWhatsApp: boolean;
  hasPhone: boolean;
};

export type CtaAction = "rdv" | "website" | "whatsapp" | "phone";

export type CtaDecision = {
  principal: { action: CtaAction; label: string } | null;
  secondaires: CtaAction[];
};

export const CTA_LABELS: Record<CtaAction, string> = {
  rdv: "Prendre RDV",
  website: "Découvrir",
  whatsapp: "WhatsApp",
  phone: "Appeler",
};

// Ordre de priorité verrouillé par le CEO (spec V1 §4/§7) — jamais piloté
// par `secteur`/`category`, uniquement par les capacités réelles.
const PRIORITE: { action: CtaAction; capacite: keyof PrestataireCapacites }[] = [
  { action: "rdv", capacite: "hasBooking" },
  { action: "website", capacite: "hasWebsite" },
  { action: "whatsapp", capacite: "hasWhatsApp" },
  { action: "phone", capacite: "hasPhone" },
];

/** `services`/`disponibilites` bruts (jsonb Supabase), pas encore parsés. */
export function deriverCapacites(input: {
  services: unknown[];
  paidServicesActifsCount: number;
  disponibilites: unknown;
  website: string | null | undefined;
  whatsapp: string | null | undefined;
  phone: string | null | undefined;
}): PrestataireCapacites {
  const aDesServicesReels =
    (Array.isArray(input.services) && input.services.length > 0) || input.paidServicesActifsCount > 0;
  // "services présents" seul n'est jamais une preuve de réservabilité —
  // il faut aussi des créneaux réellement générés (règle CEO explicite).
  const aDesCreneauxReels = generateSlotsInRange(input.disponibilites, JOURS_FENETRE_BOOKING).length > 0;

  return {
    hasBooking: aDesServicesReels && aDesCreneauxReels,
    hasWebsite: urlExterneSure(input.website) !== null,
    hasWhatsApp: typeof input.whatsapp === "string" && input.whatsapp.trim() !== "",
    hasPhone: typeof input.phone === "string" && input.phone.trim() !== "",
  };
}

export function deciderCta(capacites: PrestataireCapacites): CtaDecision {
  const disponibles = PRIORITE.filter(p => capacites[p.capacite]).map(p => p.action);
  if (disponibles.length === 0) return { principal: null, secondaires: [] };
  const [principal, ...secondaires] = disponibles;
  return { principal: { action: principal, label: CTA_LABELS[principal] }, secondaires };
}
