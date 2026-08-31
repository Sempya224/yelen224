// Registre "contenu de notification" (Mission Ghost — Notifications V2,
// 24/08/2026). Source unique type → { famille, illustration, CTA } —
// consommée par NotifPanel.tsx (liste) et NotificationDetailOverlay.tsx
// (détail), jamais deux switch dupliqués. Zéro LLM : classification et
// destination purement déterministes, basées sur les colonnes réelles de
// `notifications` (voir migrations 20260822000001, 20260824000003/000005).
//
// Illustrations "sur mesure" par famille (pas par type exact — un même
// glyphe pour toute une famille reste cohérent et évite d'en maintenir
// des dizaines), même composition que IllustrationVictoire/Patience/
// Suppression déjà dans mes-demarches-client.tsx : halo doré/rouge très
// pâle (12% — jamais une bordure ou un badge fonctionnel, seulement un
// glow décoratif) + badge plein en couleur réelle de marque. Alerte =
// rouge, tout le reste = doré plat #F5A623 (jamais de jaune pâle en
// dehors du halo), même logique de ton que les "insights" de Mes
// dépenses (alerte/critique = rouge, neutre/information = doré).

import type { ReactNode } from "react";

export type NotifFamille = "information" | "rappel" | "insight" | "alerte" | "progression" | "assistance";

export type NotifFk = {
  type?: string | null;
  rdv_id?: string | null;
  demarche_id?: string | null;
  etape_id?: string | null;
  depense_id?: string | null;
  budget_id?: string | null;
  objectif_id?: string | null;
};

const OR = { or: "#F5A623", orFonce: "#C8940A", orHalo: "rgba(245,166,35,0.12)" };
const RG = { rouge: "#ef4444", rougeFonce: "#c62828", rougeHalo: "rgba(239,68,68,0.1)" };

function Badge({ size, accent, accentFonce, halo, children }: { size: number; accent: string; accentFonce: string; halo: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="50" r="34" fill={halo}/>
      <circle cx="48" cy="50" r="27" fill={accent} stroke={accentFonce} strokeWidth="2.5"/>
      {children}
    </svg>
  );
}

export type IllustrationProps = { size?: number };
const TAILLE_DEFAUT = 88;

function IllustrationDepenseAjoutee({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <rect x="34" y="34" width="28" height="22" rx="4" fill="#fff"/>
      <path d="M48 39v12M42 45h12" stroke={OR.orFonce} strokeWidth="3" strokeLinecap="round"/>
    </Badge>
  );
}

function IllustrationBudgetDepasse({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={RG.rouge} accentFonce={RG.rougeFonce} halo={RG.rougeHalo}>
      <path d="M48 38v14" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="48" cy="58" r="2.6" fill="#fff"/>
    </Badge>
  );
}

function IllustrationObjectifEcheance({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <circle cx="48" cy="50" r="11" stroke="#fff" strokeWidth="3" fill="none"/>
      <circle cx="48" cy="50" r="4.5" fill="#fff"/>
    </Badge>
  );
}

function IllustrationRecurrence({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <path d="M40 42a9 9 0 0 1 15-4M56 58a9 9 0 0 1-15 4" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M55 34l1 6-6-1M41 66l-1-6 6 1" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Badge>
  );
}

function IllustrationDemarcheCreee({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <rect x="36" y="33" width="24" height="30" rx="4" fill="#fff"/>
      <path d="M41 46h14M41 52h14M41 58h9" stroke={OR.orFonce} strokeWidth="2.4" strokeLinecap="round"/>
    </Badge>
  );
}

function IllustrationDemarcheEcheance({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <rect x="35" y="37" width="26" height="22" rx="3" fill="#fff"/>
      <path d="M35 43h26" stroke={OR.orFonce} strokeWidth="2.4"/>
      <path d="M41 33v8M55 33v8" stroke={OR.orFonce} strokeWidth="2.4" strokeLinecap="round"/>
    </Badge>
  );
}

function IllustrationDemarcheRetard({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={RG.rouge} accentFonce={RG.rougeFonce} halo={RG.rougeHalo}>
      <circle cx="48" cy="50" r="12" stroke="#fff" strokeWidth="3" fill="none"/>
      <path d="M48 43v8l6 4" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Badge>
  );
}

function IllustrationEtapeEcheance({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <rect x="38" y="38" width="20" height="20" rx="4" stroke="#fff" strokeWidth="3" fill="none"/>
    </Badge>
  );
}

function IllustrationEtapeRetard({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={RG.rouge} accentFonce={RG.rougeFonce} halo={RG.rougeHalo}>
      <rect x="38" y="38" width="20" height="20" rx="4" stroke="#fff" strokeWidth="3" fill="none"/>
    </Badge>
  );
}

export function IllustrationGenerique({ size = TAILLE_DEFAUT }: IllustrationProps) {
  return (
    <Badge size={size} accent={OR.or} accentFonce={OR.orFonce} halo={OR.orHalo}>
      <path d="M40 46a8 8 0 0 1 16 0c0 7 3.5 9 3.5 9h-23s3.5-2 3.5-9z" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M45 59a3 3 0 0 0 6 0" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
    </Badge>
  );
}

type Entree = { famille: NotifFamille; Illustration: (props: IllustrationProps) => ReactNode };

const REGISTRE: Record<string, Entree> = {
  depense_ajoutee: { famille: "information", Illustration: IllustrationDepenseAjoutee },
  depense_budget_depasse: { famille: "alerte", Illustration: IllustrationBudgetDepasse },
  depense_objectif_echeance: { famille: "rappel", Illustration: IllustrationObjectifEcheance },
  depense_recurrente_a_venir: { famille: "rappel", Illustration: IllustrationRecurrence },
  demarche_creee: { famille: "information", Illustration: IllustrationDemarcheCreee },
  demarche_echeance: { famille: "rappel", Illustration: IllustrationDemarcheEcheance },
  demarche_retard: { famille: "alerte", Illustration: IllustrationDemarcheRetard },
  etape_echeance: { famille: "rappel", Illustration: IllustrationEtapeEcheance },
  etape_retard: { famille: "alerte", Illustration: IllustrationEtapeRetard },
};

const ENTREE_GENERIQUE: Entree = { famille: "information", Illustration: IllustrationGenerique };

export function resoudreNotif(type: string | null | undefined): Entree {
  return (type && REGISTRE[type]) || ENTREE_GENERIQUE;
}

// CTA résolu par FK présente (pas par type exact) : robuste à tout type
// futur qui porterait la même FK sans registre dédié. Ordre de priorité
// = spécificité (une démarche/étape avant un simple RDV générique).
export function resoudreCta(notif: NotifFk): { label: string; href: string } | null {
  if (notif.demarche_id) return { label: "Voir ma démarche", href: `/compte/mes-demarches?id=${notif.demarche_id}` };
  if (notif.objectif_id) return { label: "Voir mon objectif", href: `/menu/depenses?objectif=${notif.objectif_id}` };
  if (notif.budget_id) return { label: "Voir mon budget", href: `/menu/depenses?budget=${notif.budget_id}` };
  if (notif.depense_id) return { label: "Voir la dépense", href: `/menu/depenses?depense=${notif.depense_id}` };
  if (notif.rdv_id) return { label: "Voir la conversation", href: `/messagerie?rdv_id=${notif.rdv_id}` };
  return null;
}
