// Système d'illustrations pour états vides — façon Google (Gmail "boîte
// vide", Drive "aucun fichier") : une illustration + un titre + un texte
// qui explique et guide, jamais une simple phrase sèche ("Aucun message").
// Toujours en couleur Yelen (gold #F5A623 par défaut). Un seul variant
// pour l'instant (messagerie) — fichier pensé pour en accueillir d'autres
// au même endroit plutôt que de dupliquer le pattern ailleurs.
import type { ReactNode } from "react";

type EmptyStateVariant = "messages" | "clients" | "questions" | "historique" | "scanner" | "favoris" | "avis" | "recherche";

function MessagesIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={color}/>
      <path d="M24 30a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H36l-9 8v-8h-3a6 6 0 0 1-6-6z" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
      <circle cx="34" cy="39" r="2.5" fill="#fff"/>
      <circle cx="44" cy="39" r="2.5" fill="#fff" opacity="0.75"/>
      <circle cx="54" cy="39" r="2.5" fill="#fff" opacity="0.5"/>
      <path d="M62 20a3 3 0 0 1 3 3 3 3 0 0 1 3-3 3 3 0 0 1-3-3 3 3 0 0 1-3 3z" fill="#fff" opacity="0.6"/>
    </svg>
  );
}

// Client = dérivé de l'historique RDV avec CETTE institution (jamais un
// citoyen créé à part) — le "+" évoque le prochain rendez-vous qui fera
// apparaître le premier client, pas un bouton "ajouter" qui n'existe pas.
function ClientsIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={`${color}0d`}/>
      <circle cx="44" cy="35" r="11" stroke={color} strokeWidth="2.5" fill={`${color}12`}/>
      <path d="M24 62c2.5-11 10-17 20-17s17.5 6 20 17" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <circle cx="66" cy="24" r="8" fill={color} opacity="0.12"/>
      <path d="M62 24h8M66 20v8" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

// Même silhouette de bulle que MessagesIllustration (questions publiques
// = un échange, comme les messages) mais un point d'interrogation à
// l'intérieur plutôt que des points de saisie — distingue visuellement
// "on attend une question" de "on attend un message".
function QuestionsIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={`${color}0d`}/>
      <path d="M24 30a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H36l-9 8v-8h-3a6 6 0 0 1-6-6z" stroke={color} strokeWidth="2.5" strokeLinejoin="round" fill={`${color}12`}/>
      <path d="M38 33a4 4 0 1 1 6 3.5c-1.5 1-2 1.7-2 3" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <circle cx="42" cy="44.5" r="1.4" fill={color}/>
    </svg>
  );
}

// Horloge + arc en pointillés = trace laissée par le temps qui passe —
// pour "Rendez-vous passés" (historique), pas un simple cadran neutre.
function HistoriqueIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={`${color}0d`}/>
      <circle cx="44" cy="44" r="18" stroke={color} strokeWidth="2.5" fill={`${color}12`}/>
      <path d="M44 34v10l7 5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M44 20a24 24 0 0 1 22 15" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="1 5"/>
    </svg>
  );
}

// Viewfinder + grille QR — pour l'historique des présences confirmées par
// scan, jamais confondu avec l'horloge d'historique générique.
function ScannerIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={`${color}0d`}/>
      <rect x="30" y="30" width="28" height="28" rx="4" stroke={color} strokeWidth="2.5" fill={`${color}12`}/>
      <rect x="36" y="36" width="6" height="6" fill={color}/>
      <rect x="46" y="36" width="6" height="6" fill={color} opacity="0.5"/>
      <rect x="36" y="46" width="6" height="6" fill={color} opacity="0.5"/>
      <path d="M22 24v-2a4 4 0 0 1 4-4h2M60 18h2a4 4 0 0 1 4 4v2M68 60v2a4 4 0 0 1-4 4h-2M28 66h-2a4 4 0 0 1-4-4v-2" stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

// Coeur pour "aucun favori" — même silhouette que l'icône favoris du
// reste de l'app, juste redessinée dans le langage illustration (fond
// circulaire + remplissage translucide) plutôt qu'un simple trait.
function FavorisIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={color}/>
      <path d="M44 60s-17-10.2-17-22.5A9.5 9.5 0 0 1 44 30a9.5 9.5 0 0 1 17 7.5C61 49.8 44 60 44 60z" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Étoile pour "aucun avis publié".
function AvisIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={color}/>
      <path d="M44 25l5.7 11.6 12.8 1.9-9.3 9 2.2 12.7L44 54l-11.4 6.2 2.2-12.7-9.3-9 12.8-1.9L44 25z" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Loupe barrée — "aucun résultat pour cette recherche/ces filtres",
// distincte de MessagesIllustration pour ne jamais confondre "rien
// envoyé pour l'instant" et "vos filtres ne trouvent rien".
function RechercheIllustration({ color }: { color: string }) {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
      <circle cx="44" cy="44" r="40" fill={color}/>
      <circle cx="39" cy="39" r="14" stroke="#fff" strokeWidth="2.5" fill="none"/>
      <line x1="49" y1="49" x2="60" y2="60" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="34" y1="39" x2="44" y2="39" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

const ILLUSTRATIONS: Record<EmptyStateVariant, (color: string) => ReactNode> = {
  messages: (color) => <MessagesIllustration color={color}/>,
  clients: (color) => <ClientsIllustration color={color}/>,
  questions: (color) => <QuestionsIllustration color={color}/>,
  historique: (color) => <HistoriqueIllustration color={color}/>,
  scanner: (color) => <ScannerIllustration color={color}/>,
  favoris: (color) => <FavorisIllustration color={color}/>,
  avis: (color) => <AvisIllustration color={color}/>,
  recherche: (color) => <RechercheIllustration color={color}/>,
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
