// Icône officielle Yelen224 — un soleil minimal (cercle + 8 rayons), cohérent
// avec "Yelen" = "lumière" en malinké. Référence visuelle : le header de
// app/institution/connexion/page.tsx et app/institution/inscription/page.tsx.
// Composant unique, réutilisé partout — ne pas redéfinir localement ailleurs.
export function YelenLogo({ size = 18, color = "currentColor", strokeWidth = 2.5 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  );
}
