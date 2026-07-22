// Salutation partagée (Bonjour/Bon après-midi/Bonsoir/Bonne nuit selon
// l'heure) — décision CEO du 20/07/2026 (chantier "Yelen Assistant") :
// chaque notification RDV, citoyen comme institution, s'ouvre systématiquement
// par cette salutation + le prénom du citoyen ou le nom de l'établissement.
// Existait déjà en local dans app/institution/[id]/dashboard/page.tsx
// (getSalutation) — centralisée ici pour rester la seule source de vérité,
// partagée par le header institution et le moteur de notifications.
// Guinée = UTC+0 sans heure d'été, donc l'heure serveur (Vercel/Netlify en
// UTC) correspond directement à l'heure locale réelle du destinataire —
// aucune conversion de fuseau nécessaire.
export function salutation(nom: string): string {
  const h = new Date().getHours();
  if (h < 6)  return `Bonne nuit, ${nom} 🌙`;
  if (h < 12) return `Bonjour, ${nom} ☀️`;
  if (h < 18) return `Bon après-midi, ${nom} 👋`;
  return `Bonsoir, ${nom} 🌆`;
}
