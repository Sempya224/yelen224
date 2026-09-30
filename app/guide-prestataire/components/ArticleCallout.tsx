import type { ReactNode } from "react";

export type CalloutVariant = "info" | "success" | "warning" | "danger";

const LABEL: Record<CalloutVariant, string> = {
  info: "À savoir",
  success: "Conseil",
  warning: "Attention",
  danger: "Important",
};

// Icônes minimalistes (aucun emoji, règle no-emoji du projet) — une forme
// par variante pour que le type reste identifiable même sans la couleur
// (daltonisme), pas seulement le fond coloré.
function CalloutIcon({ variant }: { variant: CalloutVariant }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  if (variant === "info") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16.5" />
        <circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (variant === "success") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <polyline points="8 12.5 10.8 15.3 16 9.5" />
      </svg>
    );
  }
  if (variant === "warning") {
    return (
      <svg {...common}>
        <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
        <line x1="12" y1="10" x2="12" y2="14.5" />
        <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Z" />
      <line x1="12" y1="8.5" x2="12" y2="13" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Composant réutilisable — fond coloré léger + bordure fine + titre à icône
// (façon Shopify Help Center), remplace l'ancienne carte blanche générique
// pour signaler un contenu réellement particulier. Réservé aux 4 cas
// définis (§4 du brief refonte 23/09/2026) : jamais un habillage par
// défaut pour du texte normal.
export function ArticleCallout({
  variant,
  title,
  children,
}: {
  variant: CalloutVariant;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`hc-callout hc-callout--${variant}`}>
      <div className="hc-callout__header">
        <CalloutIcon variant={variant} />
        <span>{title ?? LABEL[variant]}</span>
      </div>
      <div className="hc-callout__content">{children}</div>
    </aside>
  );
}
