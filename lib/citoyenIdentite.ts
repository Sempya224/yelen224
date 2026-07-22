// Identifiant Yelen ID citoyen — dérivé de façon déterministe de l'uuid
// users.id (jamais aléatoire, jamais stocké séparément), pour qu'un citoyen
// voie exactement le même identifiant partout où il apparaît : l'aperçu
// carte de l'onglet Compte (app/page.tsx) et l'écran complet
// /compte/carte-yelen. Remplace l'ancien préfixe "GN-2024-" codé en dur qui
// n'existait que dans app/page.tsx (année fixe sans rapport avec la date
// d'adhésion réelle du citoyen).
export function formatYelenId(userId: string): string {
  const hex = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `YL-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
