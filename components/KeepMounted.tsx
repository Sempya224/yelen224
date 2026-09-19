// Persistance d'un panneau d'onglet interne (état "tab" local, pas une
// route) — même principe que app/[slug]/[id]/layout.tsx::KeepMounted côté
// institution (caché en CSS plutôt que démonté), généralisé ici pour
// app/page.tsx (chantier "audit fetching Accueil citoyen", 29/08/2026).
// Sans ce composant, un simple `{tab === "x" && (...)}` démonte tout le
// sous-arbre à chaque changement d'onglet — tout composant y ayant son
// propre useEffect de chargement (même correct, même `[]` en dépendances)
// se remonte et refetch à chaque retour sur l'onglet, jamais une seule
// fois par session. `visited` évite de rendre un panneau jamais visité
// (poids initial nul), `current === tabKey` bascule ensuite juste l'affichage.
export function KeepMounted<T extends string>({ tabKey, current, visited, children }: {
  tabKey: T; current: T; visited: Set<T>; children: React.ReactNode;
}) {
  if (!visited.has(tabKey)) return null;
  return <div style={{ display: current === tabKey ? "block" : "none" }}>{children}</div>;
}
