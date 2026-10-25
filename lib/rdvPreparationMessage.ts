// Fonction pure partagée entre la popup "Préparer la venue" (client,
// app/[slug]/[id]/components/PreparationVisiteModal.tsx — pour l'aperçu en
// direct) et lib/notificationEngine.ts (serveur — pour l'envoi réel). Ne
// contient aucun accès réseau/Supabase : peut être importée sans risque
// depuis un composant "use client", contrairement à notificationEngine.ts
// qui est serveur uniquement. Garantit que ce que le citoyen reçoit est
// exactement ce que l'établissement a vu dans l'aperçu avant d'envoyer.
export function buildMessagePreparation(params: {
  institutionNom: string;
  guichet: string;
  instructions?: string | null;
}): string {
  const instructions = (params.instructions ?? "").trim();
  const base = `${params.institutionNom} a préparé votre venue. Présentez-vous à : ${params.guichet.trim()}.`;
  return instructions ? `${base} ${instructions}` : base;
}
