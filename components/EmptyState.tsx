// Système d'illustrations pour états vides — façon Google (Gmail "boîte
// vide", Drive "aucun fichier") : une illustration + un titre + un texte
// qui explique et guide, jamais une simple phrase sèche ("Aucun message").
// Toujours en couleur Yelen (gold #F5A623 par défaut). Un seul variant
// pour l'instant (messagerie) — fichier pensé pour en accueillir d'autres
// au même endroit plutôt que de dupliquer le pattern ailleurs.
import type { ReactNode } from "react";

type EmptyStateVariant = "messages";

function MessagesIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={`${color}0d`}/>
      <path d="M24 30a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H36l-9 8v-8h-3a6 6 0 0 1-6-6z" stroke={color} strokeWidth="2.5" strokeLinejoin="round" fill={`${color}12`}/>
      <circle cx="34" cy="39" r="2.5" fill={color}/>
      <circle cx="44" cy="39" r="2.5" fill={color} opacity="0.6"/>
      <circle cx="54" cy="39" r="2.5" fill={color} opacity="0.35"/>
      <path d="M62 20a3 3 0 0 1 3 3 3 3 0 0 1 3-3 3 3 0 0 1-3-3 3 3 0 0 1-3 3z" fill={color} opacity="0.5"/>
    </svg>
  );
}

const ILLUSTRATIONS: Record<EmptyStateVariant, (color: string) => ReactNode> = {
  messages: (color) => <MessagesIllustration color={color}/>,
};

export function EmptyState({
  variant = "messages",
  title,
  message,
  color = "#F5A623",
  titleColor = "#F1F5F9",
  textColor = "#64748B",
}: {
  variant?: EmptyStateVariant;
  title: string;
  message: string;
  color?: string;
  titleColor?: string;
  textColor?: string;
}) {
  return (
    <div style={{ textAlign: "center", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
        {ILLUSTRATIONS[variant](color)}
      </div>
      <div style={{ color: titleColor, fontSize: "14px", fontWeight: "800", marginBottom: "6px" }}>{title}</div>
      <div style={{ color: textColor, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "260px", margin: "0 auto" }}>{message}</div>
    </div>
  );
}
