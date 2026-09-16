// Badge partagé admin + institution (mission "Design System partagé Admin →
// Institution", 01/09/2026). Extrait tel quel depuis app/admin/adminUiKit.tsx
// (chantier refonte admin, 26/07/2026) — déjà agnostique de toute couleur
// (label/color/bg fournis par l'appelant), donc zéro changement de
// comportement pour l'usage admin existant, réexporté depuis adminUiKit.tsx
// pour ne pas casser ses 10 appelants. Institution fournit ses propres
// couleurs (jamais une teinte partagée/imposée) via ses propres tokens.
export function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: '20px',
      backgroundColor: bg, color,
      fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px',
    }}>{label}</span>
  );
}
