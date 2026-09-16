"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SECTEUR_LABELS } from "@/lib/institutionTaxonomy";
import { SuivisSection } from "./suivis-section";
import { YelenLoader } from "@/components/YelenLoader";

// Lot 1 "Mes démarches" (chantier stratégie rétention v2, voir CLAUDE.md
// /chantier-strategie-retention-v2) — checklist personnelle libre, aucune
// donnée partagée avec une institution, aucun modèle pré-rempli par Yelen.
// Écriture directe via Supabase (RLS auth.uid() = citoyen_id), pas de route
// API dédiée : mirroring citoyen_favoris, pas le style service_role-only
// des tables de sécurité — une démarche n'est pas un secret.
//
// Modernisation UX/UI (24/08/2026, brief Bryan) — même donnée, même
// logique métier, rendu repensé : indicateurs de tête devenus des filtres
// tactiles, fiche détail passée en bottom sheet natif, recherche locale
// (titre) propre à cet écran (distincte de la recherche globale du header
// partagé), "prochaine étape"/"jours de retard" affichés explicitement,
// états vides différenciés par filtre. Orange Yelen recentré sur les
// actions/éléments actifs (CTA, filtre État actif) plutôt que réparti sur
// tout l'écran (bandeau conseils, badge établissement passés en neutre).

const P = { pointerEvents: "none" as const };
const Ic = {
  Plus:      () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Check:     () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Trash:     () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Search:    () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Bldg:      () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  X:         () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chev:      () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>,
  Back:      () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Info:      () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Repeat:    () => <svg style={P} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
};

const FAQ_DEMARCHES: { q: string; r: string }[] = [
  { q: "Qu'est-ce que \"Mes démarches\" ?", r: "Un espace personnel pour suivre vos dossiers administratifs, vos renouvellements de documents ou toute échéance que vous ne voulez pas oublier — indépendamment de vos rendez-vous pris sur Yelen. Utile pour un citoyen comme pour un entrepreneur ou un chef d'entreprise qui suit ses propres démarches professionnelles (licences, déclarations, fournisseurs…)." },
  { q: "À quoi sert la catégorie Personnel/Professionnel ?", r: "Uniquement à vous y retrouver et à filtrer votre liste. Elle est optionnelle et n'a aucun autre effet — vous pouvez la changer à tout moment depuis le détail d'une démarche." },
  { q: "Dois-je obligatoirement ajouter des étapes ?", r: "Non. Vous pouvez créer une démarche avec juste un titre et une date, comme un simple rappel (ex. l'expiration d'un document). Les étapes servent uniquement si vous voulez suivre une progression détaillée, comme un dossier en plusieurs parties." },
  { q: "Que se passe-t-il quand je coche toutes mes étapes ?", r: "La démarche passe automatiquement au statut \"Terminée\", sans action supplémentaire de votre part." },
  { q: "Quelle est la différence entre \"Terminée\" et \"Clôturée\" ?", r: "\"Terminée\" signifie que toutes les étapes ont été cochées. \"Clôturée\" signifie que vous avez choisi de fermer la démarche vous-même, manuellement, alors qu'il restait au moins une étape non cochée." },
  { q: "Que signifie le badge \"En retard\" ?", r: "Une étape (ou la date cible, si vous n'avez ajouté aucune étape) a dépassé sa date prévue sans avoir été cochée." },
  { q: "L'établissement que je lie à une démarche voit-il cette information ?", r: "Non. Lier un établissement à une démarche est purement indicatif pour vous permettre de vous y retrouver — aucune donnée n'est partagée avec cet établissement." },
  { q: "Puis-je modifier une démarche après l'avoir créée ?", r: "Oui. Depuis le détail d'une démarche, vous pouvez modifier le titre et la date cible, ajouter ou supprimer des étapes à tout moment, et rouvrir une démarche déjà terminée ou clôturée." },
  { q: "Mes démarches sont-elles privées ?", r: "Oui, entièrement. Seul vous pouvez les consulter — aucune institution ni aucun autre citoyen n'y a accès." },
];

type Categorie = "personnel" | "professionnel";
// Lot 2 (24/08/2026) — priorité simple, 4 niveaux, alignée sur la colonne
// `priorite` ajoutée par la migration 20260824000002. `normale` est le
// défaut silencieux (jamais affiché sur les cartes, pour ne pas surcharger
// l'écran) — seules `importante`/`urgente` méritent un signal visuel.
type Priorite = "faible" | "normale" | "importante" | "urgente";
// Lot 4 — même pattern que evenements_agenda.recurrence (migration
// 20260718000001) : colonne + génération à la volée d'une seule prochaine
// occurrence à la complétion, pas de table d'instances matérialisées.
type Recurrence = "aucune" | "quotidien" | "hebdomadaire" | "mensuel" | "annuel";
type Etape = { id: string; libelle: string; date_echeance: string | null; fait: boolean; ordre: number; priorite: Priorite; note: string | null; rappel_jours_avant: number | null };
type Demarche = {
  id: string; titre: string; institution_id: string | null; institution_nom: string | null;
  date_cible: string | null; statut: "en_cours" | "terminee"; created_at: string; etapes: Etape[];
  categorie: Categorie | null; termine_le: string | null;
  priorite: Priorite; date_debut: string | null; objectif: string | null;
  recurrence: Recurrence; recurrence_fin: string | null; rappel_jours_avant: number | null;
};
type InstitutionOption = { id: string; name: string; secteur: string | null };
type FiltreEtat = "toutes" | "en_retard" | "aujourdhui" | "a_venir" | "terminees";
type VueIntelligente = "en_retard" | "aujourdhui" | "a_venir" | "terminee";

const EXEMPLES_PERSONNEL = ["Renouvellement de passeport", "Dossier universitaire", "Renouvellement d'ordonnance"];
const EXEMPLES_PROFESSIONNEL = ["Renouvellement RCCM", "Déclaration fiscale", "Suivi paiement fournisseur", "Renouvellement de licence commerciale"];

function estEnRetard(d: Demarche): boolean {
  if (d.statut === "terminee") return false;
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  if (d.etapes.length > 0) return d.etapes.some((e) => !e.fait && e.date_echeance && new Date(e.date_echeance) < aujourdHui);
  return !!d.date_cible && new Date(d.date_cible) < aujourdHui;
}

function formatDateCourt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateHeure(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Date la plus proche à surveiller pour une démarche non terminée — date de
// la prochaine étape non cochée si des étapes existent, sinon la date
// cible générale. Un seul point de calcul, réutilisé par
// texteTempsRestant/classifierDemarche pour ne jamais diverger.
function prochaineDateCible(d: Demarche): string | null {
  return d.etapes.length > 0
    ? d.etapes.filter((e) => !e.fait && e.date_echeance).map((e) => e.date_echeance as string).sort()[0] ?? null
    : d.date_cible;
}

function texteTempsRestant(d: Demarche): string | null {
  const prochaine = prochaineDateCible(d);
  if (!prochaine) return null;
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const cible = new Date(prochaine); cible.setHours(0, 0, 0, 0);
  const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
  if (jours < 0) return null;
  if (jours === 0) return "Se termine aujourd'hui";
  if (jours === 1) return "Se termine demain";
  return `Se termine dans ${jours} jours`;
}

// Vues intelligentes (Lot 1, 24/08/2026) — classe chaque démarche dans
// exactement une des 4 catégories façon Todoist/Apple Reminders
// "Aujourd'hui / À venir / En retard / Terminées", dérivées des données
// existantes (aucune nouvelle colonne nécessaire pour ce lot).
function classifierDemarche(d: Demarche): VueIntelligente {
  if (d.statut === "terminee") return "terminee";
  if (estEnRetard(d)) return "en_retard";
  const prochaine = prochaineDateCible(d);
  if (prochaine) {
    const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
    const cible = new Date(prochaine); cible.setHours(0, 0, 0, 0);
    if (cible.getTime() === aujourdHui.getTime()) return "aujourdhui";
  }
  return "a_venir";
}

// Ajouts modernisation 24/08/2026 — dérivés purs, aucun nouvel état serveur.
function joursDeRetard(d: Demarche): number | null {
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  let dateRef: string | null;
  if (d.etapes.length > 0) {
    const retards = d.etapes.filter((e) => !e.fait && e.date_echeance && new Date(e.date_echeance) < aujourdHui).map((e) => e.date_echeance as string).sort();
    dateRef = retards[0] ?? null;
  } else {
    dateRef = d.date_cible;
  }
  if (!dateRef) return null;
  const cible = new Date(dateRef); cible.setHours(0, 0, 0, 0);
  const jours = Math.round((aujourdHui.getTime() - cible.getTime()) / 86400000);
  return jours > 0 ? jours : null;
}

function prochaineEtapeLabel(d: Demarche): string | null {
  const restantes = d.etapes.filter((e) => !e.fait);
  if (restantes.length === 0) return null;
  const triees = restantes.slice().sort((a, b) => {
    if (a.date_echeance && b.date_echeance) return a.date_echeance.localeCompare(b.date_echeance);
    if (a.date_echeance) return -1;
    if (b.date_echeance) return 1;
    return a.ordre - b.ordre;
  });
  return triees[0].libelle;
}

function joindreListeFr(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function IllustrationVictoire() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <g stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" opacity="0.7">
        <line x1="48" y1="0" x2="48" y2="9"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(45 48 40)"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(-45 48 40)"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(90 48 40)"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(-90 48 40)"/>
      </g>
      <path d="M36 52 L27 89 L48 78 L69 89 L60 52 Z" fill="#C8940A"/>
      <circle cx="48" cy="42" r="27" fill="#F5A623" stroke="#C8940A" strokeWidth="2.5"/>
      <path d="M35 43l9 9 17-18" stroke="#080812" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Illustration "pas encore le moment" — reprend la composition de
// IllustrationVictoire (badge rond doré + accent) pour une horloge plutôt
// qu'un trophée, cohérente visuellement avec la modale de célébration
// tout en signalant clairement une situation différente (patience, pas
// réussite).
function IllustrationPatience() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="50" r="34" fill="rgba(245,166,35,0.12)"/>
      <rect x="40" y="12" width="16" height="9" rx="3.5" fill="#C8940A"/>
      <circle cx="48" cy="50" r="27" fill="#F5A623" stroke="#C8940A" strokeWidth="2.5"/>
      <path d="M48 35v16l11 7" stroke="#080812" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Illustration suppression — même composition que les deux précédentes,
// en rouge (sévérité) plutôt qu'en doré : seule illustration des trois à
// ne pas utiliser la couleur de marque, cohérent avec la convention
// "rouge réservé aux actions destructives" du reste de l'écran.
function IllustrationSuppression() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="50" r="34" fill="rgba(239,68,68,0.1)"/>
      <circle cx="48" cy="50" r="27" fill="#ef4444" stroke="#c62828" strokeWidth="2.5"/>
      <path d="M36 40h24M40 40v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M42 40v20a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V40" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Illustration état vide (24/08/2026) — même composition que les trois
// précédentes (badge rond + accent), un carnet à cocher plutôt qu'une
// horloge/corbeille/trophée. `size` réglable : pleine taille pour l'état
// vide global (aucune démarche créée), réduite pour l'état vide d'un
// filtre/d'une recherche (situation plus légère, moins d'emphase).
function IllustrationDemarcheVide({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="50" r="34" fill="rgba(245,166,35,0.1)"/>
      <rect x="30" y="24" width="36" height="46" rx="6" fill="#F5A623" stroke="#C8940A" strokeWidth="2.5"/>
      <rect x="40" y="18" width="16" height="10" rx="3" fill="#C8940A"/>
      <rect x="38" y="37" width="20" height="3.5" rx="1.75" fill="#fff"/>
      <rect x="38" y="46" width="20" height="3.5" rx="1.75" fill="#fff"/>
      <rect x="38" y="55" width="13" height="3.5" rx="1.75" fill="#fff"/>
    </svg>
  );
}

// Badge compact réutilisé pour statut/catégorie (liste + détail) — la même
// pastille était redéfinie à 5 endroits différents avant cette passe.
type Ton = "neutral" | "orange" | "green" | "red" | "blue";
function Pill({ children, ton, isDark }: { children: React.ReactNode; ton: Ton; isDark: boolean }) {
  const map: Record<Ton, { bg: string; fg: string }> = {
    neutral: { bg: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)", fg: isDark ? "#8E8E93" : "#6C6C70" },
    orange:  { bg: "transparent", fg: "#F5A623" },
    green:   { bg: "rgba(34,197,94,0.12)",  fg: "#22c55e" },
    red:     { bg: "rgba(239,68,68,0.12)",  fg: "#ef4444" },
    blue:    { bg: "rgba(59,130,246,0.1)",  fg: "#3b82f6" },
  };
  const c = map[ton];
  return <span style={{ color: c.fg, background: c.bg, fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", display: "inline-block", flexShrink: 0 }}>{children}</span>;
}

// Sélecteur de priorité (Lot 2, 24/08/2026) — "faible"/"normale" restent
// volontairement neutres (pas de couleur) : seules "importante"/"urgente"
// portent un signal visuel, pour respecter la consigne "éviter une
// interface surchargée de couleurs" du brief. Réutilisé identique en
// création et en édition.
const PRIORITE_LABEL: Record<Priorite, string> = { faible: "Faible", normale: "Normale", importante: "Importante", urgente: "Urgente" };
function PrioriteSegmente({ valeur, onChange, t1, t2, brd, isDark }: {
  valeur: Priorite; onChange: (p: Priorite) => void; t1: string; t2: string; brd: string; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
      {(["faible", "normale", "importante", "urgente"] as const).map((p) => {
        const actif = valeur === p;
        const couleur = p === "urgente" ? "#ef4444" : p === "importante" ? "#F5A623" : t1;
        const teinte = p === "urgente" ? "rgba(239,68,68,0.12)" : p === "importante" ? "rgba(245,166,35,0.12)" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)");
        return (
          <button key={p} className="tap" onClick={() => onChange(p)} style={{ padding: "6px 10px", borderRadius: "20px", border: `1px solid ${actif ? couleur : brd}`, background: actif ? teinte : "transparent", color: actif ? couleur : t2, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>
            {PRIORITE_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

// Sélecteur de récurrence (Lot 4) — entièrement neutre (pas de couleur
// sémantique, contrairement à la priorité) : ce n'est pas un signal
// d'urgence, juste une préférence de répétition.
const RECURRENCE_LABEL: Record<Recurrence, string> = { aucune: "Aucune", quotidien: "Quotidien", hebdomadaire: "Hebdomadaire", mensuel: "Mensuel", annuel: "Annuel" };

// Lot 6 — libellés du journal citoyen_demarche_historique.
const HISTORIQUE_LABEL: Record<string, string> = { creation: "Créée", terminee: "Terminée", reouverte: "Rouverte", modifiee: "Modifiée" };
function RecurrenceSegmente({ valeur, onChange, t2, isDark }: {
  valeur: Recurrence; onChange: (r: Recurrence) => void; t2: string; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
      {(["aucune", "quotidien", "hebdomadaire", "mensuel", "annuel"] as const).map((r) => {
        const actif = valeur === r;
        return (
          <button key={r} className="tap" onClick={() => onChange(r)} style={{ padding: "6px 12px", borderRadius: "20px", border: "none", backgroundColor: actif ? "#F5A623" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), color: actif ? "#080812" : t2, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>
            {RECURRENCE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

// Décale une date d'un intervalle de récurrence — utilisé pour calculer la
// prochaine date cible ET les dates des étapes copiées vers la prochaine
// occurrence.
function ajouterIntervalle(dateIso: string, recurrence: Exclude<Recurrence, "aucune">): string {
  const d = new Date(dateIso);
  if (recurrence === "quotidien") d.setDate(d.getDate() + 1);
  else if (recurrence === "hebdomadaire") d.setDate(d.getDate() + 7);
  else if (recurrence === "mensuel") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// Sélecteur de rappel (Lot 5) — délai en jours avant l'échéance, niveau
// jour uniquement (voir décision de scope). `null` = pas de rappel
// personnalisé (le cron applique alors son défaut de 2 jours pour la
// démarche, aucun rappel dédié pour une étape sans valeur).
const RAPPEL_OPTIONS: (number | null)[] = [null, 1, 3, 7, 14];
function RappelSegmente({ valeur, onChange, t2, isDark }: {
  valeur: number | null; onChange: (v: number | null) => void; t2: string; isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
      {RAPPEL_OPTIONS.map((v) => {
        const actif = valeur === v;
        return (
          <button key={String(v)} className="tap" onClick={() => onChange(v)} style={{ padding: "6px 12px", borderRadius: "20px", border: "none", backgroundColor: actif ? "#F5A623" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), color: actif ? "#080812" : t2, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>
            {v === null ? "Aucun" : `${v} j`}
          </button>
        );
      })}
    </div>
  );
}

// Carte démarche — extraite au niveau module (modernisation 24/08/2026) :
// rendu plus compact (accent de couleur à gauche plutôt que blocs pleins),
// réutilisée à l'identique pour les deux groupes "En cours / À venir" et
// "Passées / Terminées". Aucune donnée/logique nouvelle, uniquement du
// rendu — les mêmes helpers purs (estEnRetard, joursDeRetard,
// prochaineEtapeLabel) que la fiche détail.
function DemarcheCarte({ d, isDark, card, brd, t1, t2, t3, ombreCard, onOpen }: {
  d: Demarche; isDark: boolean; card: string; brd: string; t1: string; t2: string; t3: string; ombreCard: string;
  onOpen: (d: Demarche) => void;
}) {
  const enRetard = estEnRetard(d);
  const total = d.etapes.length;
  const fait = d.etapes.filter((e) => e.fait).length;
  const clotureeIncomplete = d.statut === "terminee" && total > 0 && fait < total;
  const retard = joursDeRetard(d);
  const prochaine = prochaineEtapeLabel(d);

  return (
    <div
      className="tap" onClick={() => onOpen(d)}
      style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "0px", padding: "13px 15px", boxShadow: ombreCard, cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "5px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", flex: 1, minWidth: 0 }}>
            {(d.priorite === "urgente" || d.priorite === "importante") && (
              <span title={PRIORITE_LABEL[d.priorite]} style={{ width: "7px", height: "7px", borderRadius: "50%", background: d.priorite === "urgente" ? "#ef4444" : "#F5A623", flexShrink: 0, marginTop: "6px" }}/>
            )}
            <div style={{ color: t1, fontSize: "14.5px", fontWeight: 800, minWidth: 0, lineHeight: 1.3 }}>{d.titre}</div>
          </div>
          {d.statut === "terminee" && <Pill ton="green" isDark={isDark}>{clotureeIncomplete ? "Clôturée" : "Terminée"}</Pill>}
          {d.statut !== "terminee" && enRetard && <Pill ton="red" isDark={isDark}>En retard</Pill>}
        </div>

        {(d.institution_nom || d.categorie || d.recurrence !== "aucune") && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "7px", flexWrap: "wrap" }}>
            {d.categorie && <Pill ton={d.categorie === "professionnel" ? "blue" : "neutral"} isDark={isDark}>{d.categorie === "professionnel" ? "Professionnel" : "Personnel"}</Pill>}
            {d.institution_nom && <span style={{ display: "flex", alignItems: "center", gap: "4px", color: t3, fontSize: "11px", fontWeight: 600 }}><Ic.Bldg/>{d.institution_nom}</span>}
            {d.recurrence !== "aucune" && <span title={RECURRENCE_LABEL[d.recurrence]} style={{ display: "flex", alignItems: "center", color: t3 }}><Ic.Repeat/></span>}
          </div>
        )}

        {d.statut === "terminee" ? (
          <div style={{ color: t2, fontSize: "11.5px", fontWeight: 600 }}>
            {clotureeIncomplete ? "Clôturée" : "Terminée"} le {formatDateHeure(d.termine_le) ?? formatDateCourt(d.created_at)}
            {total > 0 && ` · ${fait}/${total} étape${total > 1 ? "s" : ""} complétée${fait > 1 ? "s" : ""}`}
          </div>
        ) : enRetard ? (
          <div style={{ color: "#ef4444", fontSize: "12px", fontWeight: 700 }}>
            {retard ? `Échéance dépassée de ${retard} jour${retard > 1 ? "s" : ""}` : "Échéance dépassée"}
          </div>
        ) : (
          <>
            {total > 0 ? (
              <>
                <div style={{ height: "5px", borderRadius: "3px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "5px" }}>
                  <div style={{ height: "100%", width: `${(fait / total) * 100}%`, background: "#F5A623", borderRadius: "3px" }}/>
                </div>
                <div style={{ color: t2, fontSize: "11px" }}>{fait}/{total} étape{total > 1 ? "s" : ""}</div>
                {prochaine && <div style={{ color: t1, fontSize: "11.5px", fontWeight: 600, marginTop: "3px" }}>Prochaine étape : {prochaine}</div>}
              </>
            ) : d.date_cible ? (
              <div style={{ color: t2, fontSize: "11.5px", fontWeight: 600 }}>Échéance : {formatDateCourt(d.date_cible)}</div>
            ) : (
              <div style={{ color: t3, fontSize: "11.5px" }}>Créée le {formatDateCourt(d.created_at)}</div>
            )}
            {texteTempsRestant(d) && (
              <div style={{ color: "#F5A623", fontSize: "10.5px", fontWeight: 700, marginTop: "3px" }}>{texteTempsRestant(d)}</div>
            )}
          </>
        )}
      </div>
      <span style={{ color: t3, flexShrink: 0, transform: "rotate(-90deg)" }}><Ic.Chev/></span>
    </div>
  );
}

export function MesDemarchesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombreCard = isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)";

  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [demarches, setDemarches] = useState<Demarche[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Indicateur de position de scroll — barre verticale sur le bord droit
  // de l'écran (standard iOS/Android natif), même pattern que app/page.tsx
  // (retour CEO 23/07/2026). Visible uniquement pendant le défilement, puis
  // s'estompe après une pause.
  const [scrollPct, setScrollPct] = useState(0);
  const [scrollThumbH, setScrollThumbH] = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [filtre, setFiltre] = useState<FiltreEtat>("toutes");
  const [filtreCategorie, setFiltreCategorie] = useState<"toutes" | Categorie>("toutes");
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [rechercheTexte, setRechercheTexte] = useState("");

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [titreForm, setTitreForm] = useState("");
  const [categorieForm, setCategorieForm] = useState<Categorie | null>(null);
  const [dateCibleForm, setDateCibleForm] = useState("");
  // Lot 2 — options avancées : repliées par défaut (création simple en
  // 1 champ obligatoire), révélées à la demande plutôt que d'afficher
  // objectif/priorité/date de début d'emblée.
  const [optionsAvanceesOuvertes, setOptionsAvanceesOuvertes] = useState(false);
  const [objectifForm, setObjectifForm] = useState("");
  const [prioriteForm, setPrioriteForm] = useState<Priorite>("normale");
  const [dateDebutForm, setDateDebutForm] = useState("");
  const [recurrenceForm, setRecurrenceForm] = useState<Recurrence>("aucune");
  const [recurrenceFinForm, setRecurrenceFinForm] = useState("");
  const [rappelJoursForm, setRappelJoursForm] = useState<number | null>(null);
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutionResultats, setInstitutionResultats] = useState<InstitutionOption[]>([]);
  const [institutionChoisie, setInstitutionChoisie] = useState<InstitutionOption | null>(null);
  const [etapesForm, setEtapesForm] = useState<{ libelle: string; date_echeance: string }[]>([]);
  const [etapeLibelleDraft, setEtapeLibelleDraft] = useState("");
  const [etapeDateDraft, setEtapeDateDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<Demarche | null>(null);
  const [nouvelleEtapeLibelle, setNouvelleEtapeLibelle] = useState("");
  const [nouvelleEtapeDate, setNouvelleEtapeDate] = useState("");
  const [busyEtapeId, setBusyEtapeId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  // Lot 3 — étape dépliée pour éditer sa priorité/note (une seule à la
  // fois), brouillon local de la note tant qu'elle n'est pas enregistrée.
  const [etapeDeplieeId, setEtapeDeplieeId] = useState<string | null>(null);
  const [etapeNoteDraft, setEtapeNoteDraft] = useState("");
  // Lot 6 — historique de progression, chargé à l'ouverture d'une fiche
  // (citoyen_demarche_historique, RLS auth.uid()=citoyen_id, voir migration
  // 20260824000002). Section repliée par défaut : audit secondaire, pas
  // l'information principale de la fiche.
  const [historique, setHistorique] = useState<{ id: string; evenement: string; detail: string | null; created_at: string }[]>([]);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [editionActive, setEditionActive] = useState(false);
  const [editTitre, setEditTitre] = useState("");
  const [editDateCible, setEditDateCible] = useState("");
  const [editCategorie, setEditCategorie] = useState<Categorie | null>(null);
  const [editObjectif, setEditObjectif] = useState("");
  const [editPriorite, setEditPriorite] = useState<Priorite>("normale");
  const [editDateDebut, setEditDateDebut] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>("aucune");
  const [editRecurrenceFin, setEditRecurrenceFin] = useState("");
  const [editRappelJours, setEditRappelJours] = useState<number | null>(null);
  // Instantané des valeurs au moment de l'ouverture de l'édition (24/08/2026,
  // brief CEO "état du bouton d'action") — sert à détecter une vraie
  // modification avant d'activer le bouton, jamais un état inventé.
  const [editSnapshot, setEditSnapshot] = useState<{
    titre: string; dateCible: string; categorie: Categorie | null; objectif: string; priorite: Priorite;
    dateDebut: string; recurrence: Recurrence; recurrenceFin: string; rappelJours: number | null;
  } | null>(null);
  const [afficherGuide, setAfficherGuide] = useState(true);
  const [faqOuverte, setFaqOuverte] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{ titre: string; message: string; danger?: boolean; onConfirm: () => void | Promise<void> } | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [celebration, setCelebration] = useState<{ titre: string } | null>(null);
  const [blocageEcheance, setBlocageEcheance] = useState<{ titre: string; date: string } | null>(null);
  const [confirmationSuppression, setConfirmationSuppression] = useState<Demarche | null>(null);
  const [suppressionBusy, setSuppressionBusy] = useState(false);

  const clotureeIncompleteDetail = useMemo(() => {
    if (!detail || detail.statut !== "terminee" || detail.etapes.length === 0) return false;
    return !detail.etapes.every((e) => e.fait);
  }, [detail]);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setCitoyenId(session.user.id);
    const { data, error } = await supabase
      .from("citoyen_demarches")
      .select("*, institutions(name), etapes:citoyen_demarche_etapes(*)")
      .eq("citoyen_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) { showToast("Impossible de charger vos démarches.", "error"); return; }
    // `description` (nom réel de la colonne, présente depuis la toute
    // première migration) est réutilisée comme "objectif" côté UI (Lot 2) —
    // simple renommage d'affichage, aucune nouvelle colonne pour ce champ.
    type DemarcheRow = Omit<Demarche, "institution_nom" | "etapes" | "objectif"> & { institutions: { name: string } | null; etapes: Etape[]; description: string | null };
    const normalized: Demarche[] = ((data ?? []) as unknown as DemarcheRow[]).map((d) => ({
      ...d,
      institution_nom: d.institutions?.name ?? null,
      objectif: d.description,
      etapes: (d.etapes ?? []).slice().sort((a: Etape, b: Etape) => a.ordre - b.ordre),
    }));
    setDemarches(normalized);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  useEffect(() => {
    const onScrollPct = () => {
      const viewport = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const max = total - viewport;
      setScrollPct(max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0);
      setScrollThumbH(total > 0 ? Math.min(Math.max(viewport / total, 0.08), 1) : 1);
      setScrollBarShown(true);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => setScrollBarShown(false), 900);
    };
    onScrollPct();
    window.addEventListener("scroll", onScrollPct, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!creationOuverte) return;
    const q = institutionQuery.trim();
    // Réinitialise la liste de résultats affichée dès que la recherche
    // devient trop courte (système externe : la requête Supabase
    // débattue ci-dessous, même pattern justifié qu'app/recherche/shared.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.length < 2) { setInstitutionResultats([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("institutions").select("id,name,secteur").ilike("name", `%${q}%`).limit(8);
      setInstitutionResultats((data as InstitutionOption[]) ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [institutionQuery, creationOuverte]);

  useEffect(() => {
    // Réinitialise l'onglet historique à chaque changement de démarche
    // sélectionnée, avant de recharger depuis Supabase (système externe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoriqueOuvert(false);
    if (!detail) { setHistorique([]); return; }
    void (async () => {
      const { data } = await supabase
        .from("citoyen_demarche_historique")
        .select("id,evenement,detail,created_at")
        .eq("demarche_id", detail.id)
        .order("created_at", { ascending: false });
      setHistorique(data ?? []);
    })();
    // detail volontairement réduit à detail?.id : ne réagir qu'au
    // changement de démarche sélectionnée, pas à chaque mise à jour de
    // l'objet (évite un rechargement de l'historique à chaque frappe
    // d'édition par ex.).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  // Deep link ?id= depuis la carte "Vos démarches en cours" de l'accueil
  // (24/08/2026) — ouvre directement le sheet de détail au lieu
  // d'atterrir sur la liste générale. Le ref garantit un seul essai (pas
  // de réouverture forcée après une fermeture manuelle si `demarches` est
  // rechargé plus tard par une autre action).
  const deepLinkAppliqueRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliqueRef.current || !demarches) return;
    deepLinkAppliqueRef.current = true;
    const id = searchParams.get("id");
    if (!id) return;
    const d = demarches.find((x) => x.id === id);
    // Ouvre le sheet de détail depuis un paramètre d'URL externe
    // (?id=, deep link) au montage — même justification que ci-dessus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d) { setDetail(d); setEditionActive(false); }
  }, [demarches, searchParams]);

  const kpi = useMemo(() => {
    const list = demarches ?? [];
    const parVue: Record<VueIntelligente, number> = { en_retard: 0, aujourdhui: 0, a_venir: 0, terminee: 0 };
    for (const d of list) parVue[classifierDemarche(d)]++;
    return { total: list.length, enRetard: parVue.en_retard, aujourdhui: parVue.aujourdhui, aVenir: parVue.a_venir, terminees: parVue.terminee };
  }, [demarches]);

  const demarchesFiltrees = useMemo(() => {
    let list = demarches ?? [];
    if (filtre === "aujourdhui") list = list.filter((d) => classifierDemarche(d) === "aujourdhui");
    if (filtre === "a_venir") list = list.filter((d) => classifierDemarche(d) === "a_venir");
    if (filtre === "en_retard") list = list.filter((d) => classifierDemarche(d) === "en_retard");
    if (filtre === "terminees") list = list.filter((d) => d.statut === "terminee");
    if (filtreCategorie !== "toutes") list = list.filter((d) => d.categorie === filtreCategorie);
    return list;
  }, [demarches, filtre, filtreCategorie]);

  const enRecherche = rechercheTexte.trim().length > 0;
  const demarchesRecherche = useMemo(() => {
    if (!enRecherche) return [];
    const q = rechercheTexte.trim().toLowerCase();
    return (demarches ?? []).filter((d) => d.titre.toLowerCase().includes(q));
  }, [demarches, rechercheTexte, enRecherche]);

  const listeAffichee = enRecherche ? demarchesRecherche : demarchesFiltrees;

  const categoriesPresentes = useMemo(() => new Set((demarches ?? []).map((d) => d.categorie).filter(Boolean)), [demarches]);

  // Vues intelligentes en tuiles tactiles (Lot 1) — remplace Total/En cours
  // par Aujourd'hui/À venir, dans l'ordre du brief. Taper une tuile déjà
  // active la désélectionne (retour à "toutes"), pas de tuile "Total"
  // dédiée : la vue par défaut montre déjà tout, groupé par section.
  const KPI_TUILES: { key: FiltreEtat; label: string; valeur: number; couleur: string }[] = [
    { key: "aujourdhui", label: "Aujourd'hui", valeur: kpi.aujourdhui, couleur: "#F5A623" },
    { key: "a_venir",    label: "À venir",     valeur: kpi.aVenir,     couleur: t1 },
    { key: "en_retard",  label: "En retard",   valeur: kpi.enRetard,   couleur: "#ef4444" },
    { key: "terminees",  label: "Terminées",   valeur: kpi.terminees,  couleur: "#22c55e" },
  ];

  function messageVide(): { titre: string; description: string } {
    if (enRecherche) return { titre: `Aucun résultat pour « ${rechercheTexte.trim()} »`, description: "Essayez un autre mot-clé, ou vérifiez l'orthographe du titre." };
    if (filtre === "aujourdhui") return { titre: "Rien pour aujourd'hui", description: "Aucune démarche n'a d'échéance aujourd'hui." };
    if (filtre === "a_venir") return { titre: "Rien à venir", description: "Aucune démarche avec une échéance future pour l'instant." };
    if (filtre === "terminees") return { titre: "Aucune démarche terminée", description: "Les démarches terminées apparaîtront ici." };
    if (filtre === "en_retard") return { titre: "Aucune démarche en retard", description: "Tout est à jour — bien joué." };
    if (filtreCategorie === "professionnel") return { titre: "Aucune démarche professionnelle", description: "Créez-en une pour suivre vos dossiers pro." };
    if (filtreCategorie === "personnel") return { titre: "Aucune démarche personnelle", description: "Créez-en une pour suivre vos dossiers personnels." };
    return { titre: "Aucune démarche pour ce filtre", description: "Essayez un autre filtre." };
  }

  function fermerCreation() {
    setCreationOuverte(false);
    setTitreForm(""); setCategorieForm(null); setDateCibleForm(""); setInstitutionQuery(""); setInstitutionResultats([]);
    setInstitutionChoisie(null); setEtapesForm([]); setEtapeLibelleDraft(""); setEtapeDateDraft("");
    setOptionsAvanceesOuvertes(false); setObjectifForm(""); setPrioriteForm("normale"); setDateDebutForm("");
    setRecurrenceForm("aucune"); setRecurrenceFinForm(""); setRappelJoursForm(null);
  }

  function ouvrirCreationDepuisExemple(titre: string, categorie: Categorie) {
    setTitreForm(titre);
    setCategorieForm(categorie);
    setCreationOuverte(true);
  }

  function ajouterEtapeDraft() {
    if (!etapeLibelleDraft.trim()) return;
    setEtapesForm((prev) => [...prev, { libelle: etapeLibelleDraft.trim(), date_echeance: etapeDateDraft }]);
    setEtapeLibelleDraft(""); setEtapeDateDraft("");
  }

  function champsManquantsCreation(): string[] {
    const manques: string[] = [];
    if (!categorieForm) manques.push("une catégorie (Personnel ou Professionnel)");
    if (!dateCibleForm) manques.push("une date cible");
    if (etapesForm.length === 0) manques.push("au moins une étape");
    return manques;
  }

  function handleClicCreer() {
    const manques = champsManquantsCreation();
    if (manques.length === 0) { void handleCreerDemarche(); return; }
    setConfirmation({
      titre: "Démarche non organisée",
      message: `Il manque ${joindreListeFr(manques)}. Sans cela, cette démarche sera plus difficile à suivre et à retrouver (pas de détection "en retard" fiable, pas de progression visible). Vous pouvez la créer quand même, ou revenir compléter ces champs.`,
      onConfirm: handleCreerDemarche,
    });
  }

  // Fire-and-forget : ne doit jamais bloquer le toast ni la fermeture du
  // formulaire, une erreur ici est sans conséquence pour l'utilisateur.
  async function notifierCreationDemarche(demarcheId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch("/api/citoyen/demarches/notifier-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ demarcheId }),
      });
    } catch {}
  }

  // Lot 6 — journal append-only (citoyen_demarche_historique), un
  // événement par mutation structurante. Fire-and-forget comme
  // notifierCreationDemarche ci-dessus : un échec ici n'affecte jamais
  // l'action réelle (créer/terminer/modifier), juste sa trace.
  async function journaliser(demarcheId: string, evenement: string, detail: string) {
    if (!citoyenId) return;
    try { await supabase.from("citoyen_demarche_historique").insert({ demarche_id: demarcheId, citoyen_id: citoyenId, evenement, detail }); } catch {}
  }

  async function handleCreerDemarche() {
    if (!titreForm.trim() || !citoyenId) return;
    setCreating(true);
    const { data: nouvelle, error } = await supabase
      .from("citoyen_demarches")
      .insert({
        citoyen_id: citoyenId, titre: titreForm.trim(), categorie: categorieForm, institution_id: institutionChoisie?.id ?? null, date_cible: dateCibleForm || null,
        description: objectifForm.trim() || null, priorite: prioriteForm, date_debut: dateDebutForm || null,
        recurrence: recurrenceForm, recurrence_fin: recurrenceForm !== "aucune" ? (recurrenceFinForm || null) : null,
        rappel_jours_avant: rappelJoursForm,
      })
      .select()
      .single();
    if (error || !nouvelle) { setCreating(false); showToast("Impossible de créer la démarche.", "error"); return; }
    if (etapesForm.length > 0) {
      const rows = etapesForm.map((e, idx) => ({
        demarche_id: nouvelle.id, citoyen_id: citoyenId, libelle: e.libelle,
        date_echeance: e.date_echeance || null, ordre: idx,
      }));
      const { error: errEtapes } = await supabase.from("citoyen_demarche_etapes").insert(rows);
      if (errEtapes) showToast("Démarche créée, mais certaines étapes n'ont pas pu être enregistrées.", "error");
    }
    setCreating(false);
    fermerCreation();
    await charger();
    showToast("Démarche créée.");
    void notifierCreationDemarche(nouvelle.id);
    void journaliser(nouvelle.id, "creation", "Démarche créée.");
  }

  // Lot 4 — appelé une seule fois, juste après qu'une démarche récurrente
  // passe à "terminee" (depuis la case à cocher ou depuis "Marquer
  // terminée"). Fire-and-forget côté appelant : ne doit jamais bloquer ni
  // faire échouer la complétion elle-même si la génération rate.
  async function genererProchaineOccurrence(demarche: Demarche) {
    if (demarche.recurrence === "aucune" || !citoyenId) return;
    const base = demarche.date_cible ?? new Date().toISOString().slice(0, 10);
    const prochaineDate = ajouterIntervalle(base, demarche.recurrence);
    if (demarche.recurrence_fin && prochaineDate > demarche.recurrence_fin) return;
    const { data: nouvelle, error } = await supabase
      .from("citoyen_demarches")
      .insert({
        citoyen_id: citoyenId, titre: demarche.titre, categorie: demarche.categorie,
        institution_id: demarche.institution_id, date_cible: prochaineDate,
        description: demarche.objectif, priorite: demarche.priorite,
        recurrence: demarche.recurrence, recurrence_fin: demarche.recurrence_fin, rappel_jours_avant: demarche.rappel_jours_avant,
      })
      .select()
      .single();
    if (error || !nouvelle) return;
    if (demarche.etapes.length > 0) {
      const rows = demarche.etapes.map((e) => ({
        demarche_id: nouvelle.id, citoyen_id: citoyenId, libelle: e.libelle, priorite: e.priorite, ordre: e.ordre, rappel_jours_avant: e.rappel_jours_avant,
        date_echeance: e.date_echeance ? ajouterIntervalle(e.date_echeance, demarche.recurrence as Exclude<Recurrence, "aucune">) : null,
      }));
      await supabase.from("citoyen_demarche_etapes").insert(rows);
    }
    await charger();
    showToast(`Prochaine échéance créée automatiquement (${RECURRENCE_LABEL[demarche.recurrence].toLowerCase()}).`);
    void journaliser(nouvelle.id, "creation", `Créée automatiquement (récurrence ${RECURRENCE_LABEL[demarche.recurrence].toLowerCase()}).`);
  }

  async function executerToggleEtape(etape: Etape, demarche: Demarche, nouveauFait: boolean) {
    setBusyEtapeId(etape.id);
    const { error } = await supabase
      .from("citoyen_demarche_etapes")
      .update({ fait: nouveauFait, fait_le: nouveauFait ? new Date().toISOString() : null })
      .eq("id", etape.id);
    setBusyEtapeId(null);
    if (error) { showToast("Impossible de mettre à jour cette étape.", "error"); return; }

    const etapesMaj = demarche.etapes.map((e) => (e.id === etape.id ? { ...e, fait: nouveauFait } : e));
    const toutesFaites = etapesMaj.length > 0 && etapesMaj.every((e) => e.fait);
    let statutMaj = demarche.statut;
    if (toutesFaites && demarche.statut !== "terminee") {
      const { error: errStatut } = await supabase.from("citoyen_demarches").update({ statut: "terminee", termine_le: new Date().toISOString() }).eq("id", demarche.id);
      if (errStatut) showToast("Étape cochée, mais le statut de la démarche n'a pas pu être mis à jour.", "error");
      else {
        statutMaj = "terminee"; setCelebration({ titre: demarche.titre });
        void genererProchaineOccurrence(demarche);
        void journaliser(demarche.id, "terminee", "Terminée automatiquement (toutes les étapes cochées).");
      }
    } else if (!toutesFaites && demarche.statut === "terminee") {
      const { error: errStatut } = await supabase.from("citoyen_demarches").update({ statut: "en_cours", termine_le: null }).eq("id", demarche.id);
      if (errStatut) showToast("Étape décochée, mais le statut de la démarche n'a pas pu être mis à jour.", "error");
      else { statutMaj = "en_cours"; void journaliser(demarche.id, "reouverte", "Rouverte automatiquement (étape décochée)."); }
    }
    const demarcheMaj = { ...demarche, etapes: etapesMaj, statut: statutMaj };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail((d) => (d && d.id === demarche.id ? demarcheMaj : d));
  }

  function handleToggleEtape(etape: Etape, demarche: Demarche) {
    const nouveauFait = !etape.fait;
    if (nouveauFait && etape.date_echeance) {
      const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
      const dateEtape = new Date(etape.date_echeance); dateEtape.setHours(0, 0, 0, 0);
      if (dateEtape.getTime() !== aujourdHui.getTime()) {
        setConfirmation({
          titre: "Confirmer l'étape",
          message: `Cette étape était prévue pour le ${formatDateCourt(etape.date_echeance)}. La marquer terminée aujourd'hui ?`,
          onConfirm: () => executerToggleEtape(etape, demarche, nouveauFait),
        });
        return;
      }
    }
    void executerToggleEtape(etape, demarche, nouveauFait);
  }

  async function handleAjouterEtapeDetail(demarche: Demarche) {
    if (!nouvelleEtapeLibelle.trim() || !citoyenId) return;
    setBusyAction(true);
    const ordre = demarche.etapes.length > 0 ? Math.max(...demarche.etapes.map((e) => e.ordre)) + 1 : 0;
    const { data, error } = await supabase
      .from("citoyen_demarche_etapes")
      .insert({ demarche_id: demarche.id, citoyen_id: citoyenId, libelle: nouvelleEtapeLibelle.trim(), date_echeance: nouvelleEtapeDate || null, ordre })
      .select()
      .single();
    setBusyAction(false);
    if (error || !data) { showToast("Impossible d'ajouter cette étape.", "error"); return; }
    let demarcheMaj = { ...demarche, etapes: [...demarche.etapes, data as Etape] };
    if (demarche.statut === "terminee") {
      const { error: errStatut } = await supabase.from("citoyen_demarches").update({ statut: "en_cours", termine_le: null }).eq("id", demarche.id);
      if (errStatut) showToast("Étape ajoutée, mais la démarche n'a pas pu être rouverte automatiquement.", "error");
      else demarcheMaj = { ...demarcheMaj, statut: "en_cours" };
    }
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
    setNouvelleEtapeLibelle(""); setNouvelleEtapeDate("");
  }

  async function executerSupprimerEtape(etape: Etape, demarche: Demarche) {
    const { error } = await supabase.from("citoyen_demarche_etapes").delete().eq("id", etape.id);
    if (error) { showToast("Impossible de supprimer cette étape.", "error"); return; }
    const demarcheMaj = { ...demarche, etapes: demarche.etapes.filter((e) => e.id !== etape.id) };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
  }

  // Système de sheets de confirmation (24/08/2026, brief CEO) — seule
  // action destructive de ce fichier qui s'exécutait encore sans aucune
  // confirmation (contrairement à "terminer"/"supprimer la démarche", déjà
  // couverts). Réutilise le système `confirmation` générique déjà en
  // place, pas de nouveau composant.
  function handleSupprimerEtape(etape: Etape, demarche: Demarche) {
    setConfirmation({
      titre: "Supprimer cette étape ?",
      message: `« ${etape.libelle} » sera définitivement supprimée de cette démarche.`,
      danger: true,
      onConfirm: () => executerSupprimerEtape(etape, demarche),
    });
  }

  // Lot 3 — réorganisation par boutons monter/descendre (pas de
  // drag-and-drop : plus fiable en mobile-first, pas de dépendance
  // supplémentaire). Échange les valeurs `ordre` de l'étape et de sa
  // voisine, deux updates ciblés plutôt qu'une renumérotation complète.
  async function handleDeplacerEtape(etape: Etape, demarche: Demarche, direction: "haut" | "bas") {
    const idx = demarche.etapes.findIndex((e) => e.id === etape.id);
    const voisinIdx = direction === "haut" ? idx - 1 : idx + 1;
    if (idx === -1 || voisinIdx < 0 || voisinIdx >= demarche.etapes.length) return;
    const voisin = demarche.etapes[voisinIdx];
    setBusyEtapeId(etape.id);
    const [r1, r2] = await Promise.all([
      supabase.from("citoyen_demarche_etapes").update({ ordre: voisin.ordre }).eq("id", etape.id),
      supabase.from("citoyen_demarche_etapes").update({ ordre: etape.ordre }).eq("id", voisin.id),
    ]);
    setBusyEtapeId(null);
    if (r1.error || r2.error) { showToast("Impossible de réorganiser les étapes.", "error"); return; }
    const etapesMaj = demarche.etapes
      .map((e) => (e.id === etape.id ? { ...e, ordre: voisin.ordre } : e.id === voisin.id ? { ...e, ordre: etape.ordre } : e))
      .slice()
      .sort((a, b) => a.ordre - b.ordre);
    const demarcheMaj = { ...demarche, etapes: etapesMaj };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
  }

  async function handleChangerPrioriteEtape(etape: Etape, demarche: Demarche, priorite: Priorite) {
    const { error } = await supabase.from("citoyen_demarche_etapes").update({ priorite }).eq("id", etape.id);
    if (error) { showToast("Impossible de mettre à jour la priorité de cette étape.", "error"); return; }
    const demarcheMaj = { ...demarche, etapes: demarche.etapes.map((e) => (e.id === etape.id ? { ...e, priorite } : e)) };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
  }

  // Lot 5 — rappel propre à une étape (indépendant du rappel de la
  // démarche), sans effet si l'étape n'a pas de date_echeance : le cron
  // (supabase/functions/demarches-rappels) ignore les rappels sans date.
  async function handleChangerRappelEtape(etape: Etape, demarche: Demarche, rappel_jours_avant: number | null) {
    const { error } = await supabase.from("citoyen_demarche_etapes").update({ rappel_jours_avant }).eq("id", etape.id);
    if (error) { showToast("Impossible de mettre à jour le rappel de cette étape.", "error"); return; }
    const demarcheMaj = { ...demarche, etapes: demarche.etapes.map((e) => (e.id === etape.id ? { ...e, rappel_jours_avant } : e)) };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
  }

  async function handleEnregistrerNoteEtape(etape: Etape, demarche: Demarche) {
    const note = etapeNoteDraft.trim() || null;
    setBusyAction(true);
    const { error } = await supabase.from("citoyen_demarche_etapes").update({ note }).eq("id", etape.id);
    setBusyAction(false);
    if (error) { showToast("Impossible d'enregistrer cette note.", "error"); return; }
    const demarcheMaj = { ...demarche, etapes: demarche.etapes.map((e) => (e.id === etape.id ? { ...e, note } : e)) };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
  }

  function toggleEtapeDepliee(etape: Etape) {
    if (etapeDeplieeId === etape.id) { setEtapeDeplieeId(null); return; }
    setEtapeDeplieeId(etape.id);
    setEtapeNoteDraft(etape.note ?? "");
  }

  async function executerBasculeStatut(demarche: Demarche, nouveauStatut: "en_cours" | "terminee", celebrer: boolean) {
    setBusyAction(true);
    const { error } = await supabase
      .from("citoyen_demarches")
      .update({ statut: nouveauStatut, termine_le: nouveauStatut === "terminee" ? new Date().toISOString() : null })
      .eq("id", demarche.id);
    setBusyAction(false);
    if (error) { showToast("Impossible de mettre à jour la démarche.", "error"); return; }
    const demarcheMaj = { ...demarche, statut: nouveauStatut };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
    if (celebrer) {
      setCelebration({ titre: demarche.titre });
      void genererProchaineOccurrence(demarche);
      void journaliser(demarche.id, "terminee", "Marquée terminée manuellement.");
    } else if (nouveauStatut === "en_cours") {
      void journaliser(demarche.id, "reouverte", "Démarche rouverte.");
    }
  }

  // Bug réel trouvé le 24/08/2026 (Bryan) : une démarche "simple rappel"
  // (sans étape, juste une date_cible future) pouvait être marquée
  // terminée n'importe quand — pour une démarche récurrente, ça déclenchait
  // genererProchaineOccurrence() en avance, créant une "prochaine
  // occurrence" à une date pas encore logique et donnant l'impression d'un
  // doublon dans "À venir". Une démarche AVEC étapes n'est pas concernée
  // (cocher une étape en avance est un usage normal, façon Todoist) — la
  // restriction ne s'applique qu'à l'échéance simple, qui représente un
  // événement daté (un paiement, une visite) qui ne peut pas "arriver" en
  // avance.
  function handleBasculerStatut(demarche: Demarche) {
    const nouveauStatut: "en_cours" | "terminee" = demarche.statut === "terminee" ? "en_cours" : "terminee";
    if (nouveauStatut === "terminee") {
      if (demarche.etapes.length === 0 && demarche.date_cible) {
        const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
        const cible = new Date(demarche.date_cible); cible.setHours(0, 0, 0, 0);
        if (cible.getTime() > aujourdHui.getTime()) {
          setBlocageEcheance({ titre: demarche.titre, date: demarche.date_cible });
          return;
        }
      }
      const nonCochees = demarche.etapes.filter((e) => !e.fait).length;
      if (nonCochees > 0) {
        setConfirmation({
          titre: "Étapes non cochées",
          message: `${nonCochees} étape${nonCochees > 1 ? "s" : ""} non cochée${nonCochees > 1 ? "s" : ""} sur cette démarche. La clôturer quand même ?`,
          onConfirm: () => executerBasculeStatut(demarche, nouveauStatut, false),
        });
        return;
      }
    }
    void executerBasculeStatut(demarche, nouveauStatut, nouveauStatut === "terminee");
  }

  async function executerSuppressionDemarche(demarche: Demarche) {
    const { error } = await supabase.from("citoyen_demarches").delete().eq("id", demarche.id);
    if (error) { showToast("Impossible de supprimer cette démarche.", "error"); return; }
    setDemarches((prev) => prev?.filter((d) => d.id !== demarche.id) ?? null);
    setDetail(null);
    showToast("Démarche supprimée.");
  }

  // Passe désormais par un sheet dédié (illustration + message humain,
  // comme blocageEcheance) plutôt que la modale générique setConfirmation
  // — retour Bryan 24/08/2026 : une suppression définitive mérite plus
  // qu'une boîte de dialogue texte brut.
  function handleSupprimerDemarche(demarche: Demarche) {
    setConfirmationSuppression(demarche);
  }

  function ouvrirEdition(demarche: Demarche) {
    const snap = {
      titre: demarche.titre, dateCible: demarche.date_cible ?? "", categorie: demarche.categorie,
      objectif: demarche.objectif ?? "", priorite: demarche.priorite, dateDebut: demarche.date_debut ?? "",
      recurrence: demarche.recurrence, recurrenceFin: demarche.recurrence_fin ?? "", rappelJours: demarche.rappel_jours_avant,
    };
    setEditSnapshot(snap);
    setEditTitre(snap.titre);
    setEditDateCible(snap.dateCible);
    setEditCategorie(snap.categorie);
    setEditObjectif(snap.objectif);
    setEditPriorite(snap.priorite);
    setEditDateDebut(snap.dateDebut);
    setEditRecurrence(snap.recurrence);
    setEditRecurrenceFin(snap.recurrenceFin);
    setEditRappelJours(snap.rappelJours);
    setEditionActive(true);
  }

  async function handleEnregistrerEdition(demarche: Demarche) {
    if (!editTitre.trim()) return;
    setBusyAction(true);
    const { error } = await supabase.from("citoyen_demarches").update({
      titre: editTitre.trim(), date_cible: editDateCible || null, categorie: editCategorie,
      description: editObjectif.trim() || null, priorite: editPriorite, date_debut: editDateDebut || null,
      recurrence: editRecurrence, recurrence_fin: editRecurrence !== "aucune" ? (editRecurrenceFin || null) : null,
      rappel_jours_avant: editRappelJours,
    }).eq("id", demarche.id);
    setBusyAction(false);
    if (error) { showToast("Impossible d'enregistrer les modifications.", "error"); return; }
    const demarcheMaj = { ...demarche, titre: editTitre.trim(), date_cible: editDateCible || null, categorie: editCategorie, objectif: editObjectif.trim() || null, priorite: editPriorite, date_debut: editDateDebut || null, recurrence: editRecurrence, recurrence_fin: editRecurrence !== "aucune" ? (editRecurrenceFin || null) : null, rappel_jours_avant: editRappelJours };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
    setEditionActive(false);
    setEditSnapshot(null);
    void journaliser(demarche.id, "modifiee", "Informations modifiées.");
  }

  // Bouton d'édition actif seulement si une vraie modification a été
  // saisie par rapport à l'instantané pris à l'ouverture — évite de
  // laisser croire qu'il y a quelque chose à enregistrer quand ce n'est
  // pas le cas (brief CEO 24/08/2026).
  const editionModifiee = !!editSnapshot && (
    editTitre.trim() !== editSnapshot.titre
    || editDateCible !== editSnapshot.dateCible
    || editCategorie !== editSnapshot.categorie
    || editObjectif.trim() !== editSnapshot.objectif
    || editPriorite !== editSnapshot.priorite
    || editDateDebut !== editSnapshot.dateDebut
    || editRecurrence !== editSnapshot.recurrence
    || editRecurrenceFin !== editSnapshot.recurrenceFin
    || editRappelJours !== editSnapshot.rappelJours
  );

  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "12.5px",
    padding: "10px 14px", borderRadius: "12px", border: `1px solid ${brd}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`,
    borderRadius: "12px", padding: "12px 14px", color: t1, fontSize: "14px",
  };
  // Champ "à plat" façon liste groupée (formulaire "Nouvelle démarche"
  // modernisé le 24/08/2026, référence WhatsApp "Add item" : rangées dans
  // une seule carte, séparées par un trait fin, placeholder = libellé du
  // champ, pas de cadre par champ ni de label flottant au-dessus).
  const plainInputStyle: React.CSSProperties = {
    width: "100%", border: "none", outline: "none", background: "transparent",
    padding: "14px 16px", color: t1, fontSize: "15px", fontFamily: "inherit",
  };

  if (loading) {
    return <CompteLoadingScreen titre="Mes démarches"/>;
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes sheetUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}.dTuile,.dSeg{transition:border-color 0.15s,background-color 0.15s,color 0.15s}`}</style>
      <CompteHeader titre="Mes démarches"/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 100px" }}>
        <SuivisSection isDark={isDark} onCreerDemarche={ouvrirCreationDepuisExemple}/>

        <div id="demarches" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "14px", paddingTop: "4px" }}>
          {rechercheOuverte ? (
            <div style={{ flex: 1, position: "relative" }}>
              <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: t3 }}><Ic.Search/></div>
              <input
                autoFocus value={rechercheTexte} onChange={(e) => setRechercheTexte(e.target.value)}
                placeholder="Rechercher une démarche…"
                style={{ ...inputStyle, paddingLeft: "36px", paddingRight: "36px" }}
              />
              <button
                onClick={() => { setRechercheOuverte(false); setRechercheTexte(""); }} className="tap" aria-label="Fermer la recherche"
                style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t3, cursor: "pointer", padding: "8px" }}
              ><Ic.X/></button>
            </div>
          ) : (
            <>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800 }}>Vos démarches</div>
              {(demarches?.length ?? 0) > 0 && (
                <button onClick={() => setRechercheOuverte(true)} className="tap" aria-label="Rechercher une démarche" style={{ width: "32px", height: "32px", borderRadius: "50%", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", flexShrink: 0 }}><Ic.Search/></button>
              )}
            </>
          )}
        </div>

        {!enRecherche && afficherGuide && (
          <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px", position: "relative", boxShadow: ombreCard }}>
            <button onClick={() => setAfficherGuide(false)} className="tap" style={{ position: "absolute", top: "10px", right: "10px", background: "none", border: "none", color: t3, cursor: "pointer", padding: "4px" }}><Ic.X/></button>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", paddingRight: "24px" }}>
              <div style={{ color: "#F5A623", flexShrink: 0 }}><Ic.Info/></div>
              <div style={{ color: t1, fontSize: "12.5px", fontWeight: 800 }}>Comment ça marche ?</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {[
                "Donnez un titre à ce que vous voulez suivre (un dossier, un renouvellement, une échéance, personnel ou professionnel).",
                "Ajoutez des étapes si vous voulez suivre une progression — ou n'en ajoutez aucune pour un simple rappel de date.",
                "Cochez vos étapes au fur et à mesure : la démarche passe automatiquement en \"Terminée\" une fois tout coché.",
              ].map((txt, i) => (
                <div key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}>
                  <span style={{ width: "15px", height: "15px", borderRadius: "50%", background: "rgba(245,166,35,0.15)", color: "#F5A623", fontSize: "9.5px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{i + 1}</span>
                  <span style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>{txt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!enRecherche && (demarches?.length ?? 0) > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "14px" }}>
            {KPI_TUILES.map((k) => {
              const actif = filtre === k.key;
              return (
                <button
                  key={k.key} onClick={() => setFiltre((prev) => (prev === k.key ? "toutes" : k.key))} className="tap dTuile"
                  style={{
                    backgroundColor: card, border: `1.5px solid ${actif ? k.couleur : brd}`, borderRadius: "14px",
                    padding: "11px 6px", textAlign: "center", cursor: "pointer", boxShadow: actif ? ombreCard : "none",
                  }}
                >
                  <div style={{ color: actif ? k.couleur : t1, fontSize: "18px", fontWeight: 900, lineHeight: 1 }}>{k.valeur}</div>
                  <div style={{ color: actif ? k.couleur : t2, fontSize: "10px", fontWeight: 700, marginTop: "4px" }}>{k.label}</div>
                </button>
              );
            })}
          </div>
        )}

        <button
          className="tap" onClick={() => setCreationOuverte(true)}
          style={{
            width: "100%", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "14.5px",
            padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            marginBottom: "18px", boxShadow: isDark ? "none" : "0 4px 14px rgba(245,166,35,0.25)",
          }}
        >
          <Ic.Plus/> Nouvelle démarche
        </button>

        {!enRecherche && categoriesPresentes.size > 0 && (
          <div style={{ display: "flex", padding: "3px", borderRadius: "12px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", marginBottom: "18px" }}>
            {([["toutes", "Toutes"], ["personnel", "Personnel"], ["professionnel", "Professionnel"]] as const).map(([val, label]) => {
              const actif = filtreCategorie === val;
              return (
                <button
                  key={val} onClick={() => setFiltreCategorie(val)} className="tap dSeg"
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: "9px", border: "none",
                    background: actif ? card : "transparent", color: actif ? t1 : t2, fontWeight: actif ? 800 : 600, fontSize: "12px",
                    boxShadow: actif ? (isDark ? "none" : "0 1px 3px rgba(0,0,0,0.08)") : "none", cursor: "pointer",
                  }}
                >{label}</button>
              );
            })}
          </div>
        )}

        {(demarches?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><IllustrationDemarcheVide/></div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Aucune démarche</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>Créez votre première démarche pour suivre un dossier en cours ou une échéance à venir.</div>
            <div style={{ color: t3, fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Pour un usage personnel :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginBottom: "16px" }}>
              {EXEMPLES_PERSONNEL.map((ex) => (
                <button key={ex} className="tap" onClick={() => ouvrirCreationDepuisExemple(ex, "personnel")} style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, borderRadius: "20px", padding: "7px 13px", color: t1, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>{ex}</button>
              ))}
            </div>
            <div style={{ color: t3, fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Pour un usage professionnel :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
              {EXEMPLES_PROFESSIONNEL.map((ex) => (
                <button key={ex} className="tap" onClick={() => ouvrirCreationDepuisExemple(ex, "professionnel")} style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "20px", padding: "7px 13px", color: "#3b82f6", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>{ex}</button>
              ))}
            </div>
          </div>
        )}

        {listeAffichee.length === 0 && (demarches?.length ?? 0) > 0 && (
          <div style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}><IllustrationDemarcheVide size={56}/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "4px" }}>{messageVide().titre}</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>{messageVide().description}</div>
          </div>
        )}

        {(() => {
          // Regroupement par vue intelligente (Lot 1) — même classification
          // que les tuiles KPI ci-dessus, ordre de priorité décroissante :
          // ce qui réclame une action immédiate d'abord.
          const groupes: { titre: string; items: Demarche[] }[] = [
            { titre: "En retard", items: listeAffichee.filter((d) => classifierDemarche(d) === "en_retard") },
            { titre: "Aujourd'hui", items: listeAffichee.filter((d) => classifierDemarche(d) === "aujourdhui") },
            { titre: "À venir", items: listeAffichee.filter((d) => classifierDemarche(d) === "a_venir") },
            { titre: "Passées / Terminées", items: listeAffichee.filter((d) => d.statut === "terminee") },
          ];
          const ouvrir = (d: Demarche) => { setDetail(d); setEditionActive(false); };
          return (
            <>
              {groupes.map((g) => g.items.length > 0 && (
                <div key={g.titre} style={{ marginBottom: "22px" }}>
                  <div style={{ color: t2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "9px", paddingLeft: "2px" }}>{g.titre}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                    {g.items.map((d) => (
                      <DemarcheCarte key={d.id} d={d} isDark={isDark} card={card} brd={brd} t1={t1} t2={t2} t3={t3} ombreCard={ombreCard} onOpen={ouvrir}/>
                    ))}
                  </div>
                </div>
              ))}
            </>
          );
        })()}

        <div style={{ marginTop: "36px" }}>
          <div style={{ color: t1, fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>Questions fréquentes</div>
          <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "14px" }}>Tout ce qu&apos;il faut savoir sur le fonctionnement de cet écran.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {FAQ_DEMARCHES.map((item, i) => (
              <button key={i} onClick={() => setFaqOuverte(i)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "12px", padding: "13px 14px", cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{item.q}</span>
                <span style={{ color: t3, flexShrink: 0, transform: "rotate(-90deg)" }}><Ic.Chev/></span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "28px", padding: "18px 16px", borderTop: `1px solid ${brd}`, textAlign: "center" }}>
          <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", marginBottom: "8px" }}>YELEN224</div>
          <p style={{ color: t3, fontSize: "11.5px", lineHeight: 1.7, margin: 0, maxWidth: "440px", marginLeft: "auto", marginRight: "auto" }}>
            Yelen existe pour une seule raison : rendre l&apos;accès aux services essentiels — santé, administration, banque, justice — aussi simple et digne que possible pour chaque citoyen guinéen. Chaque démarche suivie ici reste la vôtre, privée, à votre rythme. Yelen, c&apos;est votre lumière dans vos démarches du quotidien.
          </p>
        </div>
      </main>
      </PullToRefresh>

      {creationOuverte && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", overflowX: "hidden" }}>
          {/* Refonte 25/08/2026 : même rendu que le formulaire "Ajouter une
              dépense" (app/menu/depenses/depenses-client.tsx) — fermeture en
              case nue, champs en cartes remplies plutôt que rangées bordées,
              action principale en gros bouton plein or Yelen en bas, boutons
              de sélection (catégorie/récurrence/rappel) remplis or Yelen au
              lieu d'un simple contour. */}
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: bg, borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={fermerCreation} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><Ic.X/></button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Nouvelle démarche</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>

            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombreCard }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Titre de la démarche (obligatoire)</div>
              <input value={titreForm} onChange={(e) => setTitreForm(e.target.value)} placeholder="Ex : Renouveler ma carte d'identité" autoFocus style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontSize: "15px", fontWeight: 600, boxSizing: "border-box" }}/>
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, margin: "18px 0 8px" }}>Catégorie</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(["personnel", "professionnel"] as const).map((c) => (
                <button key={c} className="tap" onClick={() => setCategorieForm((prev) => (prev === c ? null : c))} style={{ padding: "8px 16px", borderRadius: "24px", border: "none", backgroundColor: categorieForm === c ? "#F5A623" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), color: categorieForm === c ? "#080812" : t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>{c === "personnel" ? "Personnel" : "Professionnel"}</button>
              ))}
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, margin: "18px 0 8px" }}>Établissement lié (optionnel)</div>
            <div style={{ backgroundColor: card, borderRadius: "16px", boxShadow: ombreCard, overflow: "hidden" }}>
              {institutionChoisie ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: t1, fontSize: "14px", fontWeight: 600, minWidth: 0 }}><Ic.Bldg/>{institutionChoisie.name}</span>
                  <button onClick={() => setInstitutionChoisie(null)} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
                </div>
              ) : (
                <input value={institutionQuery} onChange={(e) => setInstitutionQuery(e.target.value)} placeholder="Rechercher un établissement" style={{ width: "100%", padding: "13px 16px", border: "none", background: "transparent", color: t1, fontSize: "14px", fontWeight: 600, boxSizing: "border-box" }}/>
              )}
              {!institutionChoisie && institutionResultats.length > 0 && (
                <div>
                  {institutionResultats.map((opt) => (
                    <button key={opt.id} className="tap" onClick={() => { setInstitutionChoisie(opt); setInstitutionQuery(""); setInstitutionResultats([]); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${brd}`, padding: "10px 16px", cursor: "pointer", boxSizing: "border-box" }}>
                      <div style={{ color: t1, fontSize: "14px", fontWeight: 600 }}>{opt.name}</div>
                      {opt.secteur && <div style={{ color: t3, fontSize: "11.5px" }}>{SECTEUR_LABELS[opt.secteur] ?? opt.secteur}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, margin: "18px 0 8px" }}>Date cible (optionnel)</div>
            <input type="date" value={dateCibleForm} onChange={(e) => setDateCibleForm(e.target.value)} style={{ width: "100%", maxWidth: "100%", minWidth: 0, padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: dateCibleForm ? t1 : t3, fontSize: "14px", fontWeight: 600, boxSizing: "border-box", colorScheme: isDark ? "dark" : "light" }}/>

            <button onClick={handleClicCreer} disabled={!titreForm.trim() || creating} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: 800, cursor: !titreForm.trim() || creating ? "default" : "pointer", opacity: !titreForm.trim() || creating ? 0.5 : 1, marginTop: "22px", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
              {creating ? <YelenLoader size={16} color="#080812"/> : "Créer la démarche"}
            </button>

            <button onClick={() => setOptionsAvanceesOuvertes((v) => !v)} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", width: "100%", background: "none", border: "none", padding: "16px 0 4px", color: t2, fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
              {optionsAvanceesOuvertes ? "Moins d'options" : "Plus d'options"}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="3" strokeLinecap="round" style={{ transform: optionsAvanceesOuvertes ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }}><path d="m9 18 6-6-6-6"/></svg>
            </button>

            {optionsAvanceesOuvertes && (
              <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombreCard, marginTop: "8px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Objectif recherché (optionnel)</div>
                <textarea value={objectifForm} onChange={(e) => setObjectifForm(e.target.value)} rows={2} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontSize: "14px", fontWeight: 600, marginBottom: "16px", boxSizing: "border-box", resize: "none", fontFamily: "inherit" }}/>

                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Priorité</div>
                <div style={{ marginBottom: "16px" }}>
                  <PrioriteSegmente valeur={prioriteForm} onChange={setPrioriteForm} t1={t1} t2={t2} brd={brd} isDark={isDark}/>
                </div>

                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Date de début (optionnel)</div>
                <input type="date" value={dateDebutForm} onChange={(e) => setDateDebutForm(e.target.value)} style={{ width: "100%", maxWidth: "100%", minWidth: 0, padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: dateDebutForm ? t1 : t3, fontSize: "14px", fontWeight: 600, marginBottom: "16px", boxSizing: "border-box", colorScheme: isDark ? "dark" : "light" }}/>

                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Récurrence (optionnel)</div>
                <div style={{ marginBottom: recurrenceForm !== "aucune" ? "16px" : 0 }}>
                  <RecurrenceSegmente valeur={recurrenceForm} onChange={setRecurrenceForm} t2={t2} isDark={isDark}/>
                </div>
                {recurrenceForm !== "aucune" && (
                  <>
                    <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Jusqu&apos;au (optionnel)</div>
                    <input type="date" value={recurrenceFinForm} onChange={(e) => setRecurrenceFinForm(e.target.value)} style={{ width: "100%", maxWidth: "100%", minWidth: 0, padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: recurrenceFinForm ? t1 : t3, fontSize: "14px", fontWeight: 600, marginBottom: "16px", boxSizing: "border-box", colorScheme: isDark ? "dark" : "light" }}/>
                  </>
                )}

                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Rappel</div>
                <RappelSegmente valeur={rappelJoursForm} onChange={setRappelJoursForm} t2={t2} isDark={isDark}/>
              </div>
            )}

            <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.5, padding: "0 4px", marginTop: "16px", marginBottom: "24px" }}>
              Seul le titre est obligatoire. Tout le reste — catégorie, établissement, date cible, objectif, priorité, date de début — reste optionnel et sert uniquement à mieux organiser et retrouver votre démarche plus tard.
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>Étapes (optionnel)</div>
            <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginBottom: "8px" }}>
              {etapesForm.map((e, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "11px 16px", borderBottom: `1px solid ${brd}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.libelle}</div>
                    {e.date_echeance && <div style={{ color: t3, fontSize: "11px" }}>{formatDateCourt(e.date_echeance)}</div>}
                  </div>
                  <button onClick={() => setEtapesForm((prev) => prev.filter((_, i) => i !== idx))} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px" }}>
                <input value={etapeLibelleDraft} onChange={(e) => setEtapeLibelleDraft(e.target.value)} placeholder="Ajouter une étape" style={{ ...plainInputStyle, padding: "8px 0", flex: 1, fontSize: "14px" }}/>
                <input type="date" value={etapeDateDraft} onChange={(e) => setEtapeDateDraft(e.target.value)} style={{ border: "none", background: "transparent", color: etapeDateDraft ? t1 : t3, fontSize: "12.5px", width: "100px", colorScheme: isDark ? "dark" : "light", flexShrink: 0 }}/>
                <button onClick={ajouterEtapeDraft} aria-label="Ajouter l'étape" className="tap" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}><Ic.Plus/></button>
              </div>
            </div>
            <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.5, padding: "0 4px" }}>
              Laissez vide pour un simple rappel d&apos;échéance, sans étapes détaillées. Vous les cocherez une par une plus tard, dans le détail de la démarche.
            </div>
          </div>
        </div>
      )}

      {detail && (() => {
        const detailTotal = detail.etapes.length;
        const detailFait = detail.etapes.filter((e) => e.fait).length;
        const detailEnRetard = estEnRetard(detail);
        const detailRetardJours = joursDeRetard(detail);
        const detailProchaine = prochaineEtapeLabel(detail);
        return (
          <div onClick={() => { setDetail(null); setEditionActive(false); setEtapeDeplieeId(null); }} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {/* Hauteur intrinsèque au contenu (pas de height fixe) plafonnée à
                96svh — retour Bryan 11/09/2026, référence YouTube "History" :
                une démarche courte reste courte, une démarche avec beaucoup
                d'étapes (comme "Réduire mes dépenses") monte jusqu'à
                quasiment plein écran plutôt que de s'arrêter à 88svh. */}
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px 24px 0 0", padding: "10px 20px calc(env(safe-area-inset-bottom) + 20px)", width: "100%", maxWidth: "560px", maxHeight: "96svh", overflowY: "auto", animation: "sheetUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "10px" }}>
                <div style={{ color: t1, fontSize: "17px", fontWeight: 800, flex: 1, lineHeight: 1.3 }}>{editionActive ? "Modifier la démarche" : detail.titre}</div>
                <button onClick={() => { setDetail(null); setEditionActive(false); setEtapeDeplieeId(null); }} className="tap" aria-label="Fermer" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
              </div>

              {editionActive ? (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Titre</label>
                  <input value={editTitre} onChange={(e) => setEditTitre(e.target.value)} style={{ ...inputStyle, marginBottom: "12px" }}/>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Date cible</label>
                  <input type="date" value={editDateCible} onChange={(e) => setEditDateCible(e.target.value)} style={{ ...inputStyle, marginBottom: "12px", colorScheme: isDark ? "dark" : "light" }}/>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Catégorie</label>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                    {(["personnel", "professionnel"] as const).map((c) => (
                      <button key={c} className="tap" onClick={() => setEditCategorie((prev) => (prev === c ? null : c))} style={{ ...btnGhost, flex: 1, border: "none", backgroundColor: editCategorie === c ? "#F5A623" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), color: editCategorie === c ? "#080812" : t1 }}>{c === "personnel" ? "Personnel" : "Professionnel"}</button>
                    ))}
                  </div>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Objectif (optionnel)</label>
                  <textarea value={editObjectif} onChange={(e) => setEditObjectif(e.target.value)} rows={2} style={{ ...inputStyle, marginBottom: "12px", resize: "none", fontFamily: "inherit" }}/>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Priorité</label>
                  <div style={{ marginBottom: "12px" }}>
                    <PrioriteSegmente valeur={editPriorite} onChange={setEditPriorite} t1={t1} t2={t2} brd={brd} isDark={isDark}/>
                  </div>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Date de début (optionnel)</label>
                  <input type="date" value={editDateDebut} onChange={(e) => setEditDateDebut(e.target.value)} style={{ ...inputStyle, marginBottom: "12px", colorScheme: isDark ? "dark" : "light" }}/>
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Récurrence</label>
                  <div style={{ marginBottom: "12px" }}>
                    <RecurrenceSegmente valeur={editRecurrence} onChange={setEditRecurrence} t2={t2} isDark={isDark}/>
                  </div>
                  {editRecurrence !== "aucune" && (
                    <>
                      <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Jusqu&apos;au (optionnel)</label>
                      <input type="date" value={editRecurrenceFin} onChange={(e) => setEditRecurrenceFin(e.target.value)} style={{ ...inputStyle, marginBottom: "12px", colorScheme: isDark ? "dark" : "light" }}/>
                    </>
                  )}
                  <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Rappel</label>
                  <div style={{ marginBottom: "14px" }}>
                    <RappelSegmente valeur={editRappelJours} onChange={setEditRappelJours} t2={t2} isDark={isDark}/>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button disabled={!editTitre.trim() || busyAction || !editionModifiee} onClick={() => handleEnregistrerEdition(detail)} className="tap" style={{ ...btnGhost, flex: 1, background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623", opacity: !editTitre.trim() || busyAction || !editionModifiee ? 0.5 : 1, cursor: !editTitre.trim() || busyAction || !editionModifiee ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{busyAction ? <YelenLoader size={14}/> : "Modifier"}</button>
                    <button onClick={() => { setEditionActive(false); setEditSnapshot(null); }} className="tap" style={{ ...btnGhost, flex: 1 }}>Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                    {detail.statut === "terminee" ? (
                      <Pill ton="green" isDark={isDark}>{clotureeIncompleteDetail ? "Clôturée" : "Terminée"}</Pill>
                    ) : detailEnRetard ? (
                      <Pill ton="red" isDark={isDark}>En retard</Pill>
                    ) : (
                      <Pill ton="orange" isDark={isDark}>En cours</Pill>
                    )}
                    {detail.categorie && <Pill ton={detail.categorie === "professionnel" ? "blue" : "neutral"} isDark={isDark}>{detail.categorie === "professionnel" ? "Professionnel" : "Personnel"}</Pill>}
                    {(detail.priorite === "urgente" || detail.priorite === "importante") && (
                      <Pill ton={detail.priorite === "urgente" ? "red" : "orange"} isDark={isDark}>{PRIORITE_LABEL[detail.priorite]}</Pill>
                    )}
                  </div>
                  {detail.institution_nom && <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}><Ic.Bldg/>{detail.institution_nom}</div>}
                  {detail.recurrence !== "aucune" && (
                    <div style={{ color: t2, fontSize: "12px", marginBottom: "6px" }}>
                      Se répète : {RECURRENCE_LABEL[detail.recurrence].toLowerCase()}
                      {detail.recurrence_fin && ` jusqu'au ${formatDateCourt(detail.recurrence_fin)}`}
                    </div>
                  )}
                  {detail.rappel_jours_avant !== null && (
                    <div style={{ color: t2, fontSize: "12px", marginBottom: "6px" }}>Rappel : {detail.rappel_jours_avant} jour{detail.rappel_jours_avant > 1 ? "s" : ""} avant l&apos;échéance</div>
                  )}
                  {detail.objectif && (
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ color: t3, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "3px" }}>Objectif</div>
                      <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>{detail.objectif}</div>
                    </div>
                  )}
                  {/* Résumé "à la Todoist" (Lot 3) — Prochaine action /
                      Échéance / Progression regroupées, plutôt que des
                      lignes de texte éparpillées. */}
                  {detail.statut !== "terminee" && (detailProchaine || detail.date_cible || detailTotal > 0) && (
                    <div style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "14px", padding: "14px 16px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {detailProchaine && (
                        <div>
                          <div style={{ color: t3, fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase" }}>Prochaine action</div>
                          <div style={{ color: t1, fontSize: "14px", fontWeight: 700, marginTop: "2px" }}>{detailProchaine}</div>
                        </div>
                      )}
                      {detail.date_cible && (
                        <div>
                          <div style={{ color: t3, fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase" }}>Échéance</div>
                          <div style={{ color: detailEnRetard ? "#ef4444" : t1, fontSize: "14px", fontWeight: 700, marginTop: "2px" }}>
                            {detailEnRetard
                              ? (detailRetardJours ? `Dépassée de ${detailRetardJours} jour${detailRetardJours > 1 ? "s" : ""}` : "Dépassée")
                              : formatDateCourt(detail.date_cible)}
                          </div>
                        </div>
                      )}
                      {detailTotal > 0 && (
                        <div>
                          <div style={{ color: t3, fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase" }}>Progression</div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                            <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(detailFait / detailTotal) * 100}%`, background: "#F5A623", borderRadius: "3px" }}/>
                            </div>
                            <span style={{ color: t1, fontSize: "12.5px", fontWeight: 700, flexShrink: 0 }}>{detailFait}/{detailTotal}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                    {detail.date_debut && <span style={{ color: t2, fontSize: "12px" }}>Début : {formatDateCourt(detail.date_debut)}</span>}
                    {detail.statut === "terminee" && detail.date_cible && <span style={{ color: t2, fontSize: "12px" }}>Date cible : {formatDateCourt(detail.date_cible)}</span>}
                    <button onClick={() => ouvrirEdition(detail)} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>Modifier</button>
                  </div>
                  <div style={{ marginBottom: "10px" }}/>
                </>
              )}

              {detail.etapes.length === 0 && (
                <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.5, fontStyle: "italic", marginBottom: "12px" }}>
                  Aucune étape pour l&apos;instant — {detail.date_cible ? "cette démarche sert de simple rappel pour la date ci-dessus." : "cette démarche n'a pas de suivi détaillé."} Ajoutez une étape ci-dessous si vous voulez suivre une progression.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                {detail.etapes.map((e, idx) => {
                  const depliee = etapeDeplieeId === e.id;
                  return (
                    <div key={e.id} style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px" }}>
                        <button disabled={busyEtapeId === e.id} onClick={() => handleToggleEtape(e, detail)} className="tap" style={{ width: "22px", height: "22px", borderRadius: "7px", border: e.fait ? "none" : `2px solid ${t3}`, background: e.fait ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: busyEtapeId === e.id ? 0.5 : 1 }}>
                          {e.fait && <Ic.Check/>}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            {(e.priorite === "urgente" || e.priorite === "importante") && (
                              <span title={PRIORITE_LABEL[e.priorite]} style={{ width: "6px", height: "6px", borderRadius: "50%", background: e.priorite === "urgente" ? "#ef4444" : "#F5A623", flexShrink: 0 }}/>
                            )}
                            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 600, textDecoration: e.fait ? "line-through" : "none", opacity: e.fait ? 0.6 : 1, minWidth: 0 }}>{e.libelle}</div>
                          </div>
                          {e.date_echeance && <div style={{ color: !e.fait && new Date(e.date_echeance) < new Date() ? "#ef4444" : t3, fontSize: "11px" }}>{formatDateCourt(e.date_echeance)}</div>}
                        </div>
                        <button onClick={() => toggleEtapeDepliee(e)} aria-label="Détails de l'étape" className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0, transform: depliee ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><Ic.Chev/></button>
                        <button onClick={() => handleSupprimerEtape(e, detail)} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.Trash/></button>
                      </div>

                      {depliee && (
                        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${brd}`, marginTop: "0px", paddingTop: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                            <button disabled={idx === 0 || busyEtapeId === e.id} onClick={() => handleDeplacerEtape(e, detail, "haut")} className="tap" style={{ ...btnGhost, padding: "6px 10px", fontSize: "11.5px", opacity: idx === 0 ? 0.4 : 1 }}>↑ Monter</button>
                            <button disabled={idx === detail.etapes.length - 1 || busyEtapeId === e.id} onClick={() => handleDeplacerEtape(e, detail, "bas")} className="tap" style={{ ...btnGhost, padding: "6px 10px", fontSize: "11.5px", opacity: idx === detail.etapes.length - 1 ? 0.4 : 1 }}>↓ Descendre</button>
                          </div>
                          <div style={{ color: t2, fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>Priorité</div>
                          <div style={{ marginBottom: "10px" }}>
                            <PrioriteSegmente valeur={e.priorite} onChange={(p) => handleChangerPrioriteEtape(e, detail, p)} t1={t1} t2={t2} brd={brd} isDark={isDark}/>
                          </div>
                          {e.date_echeance && (
                            <>
                              <div style={{ color: t2, fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>Rappel avant cette étape</div>
                              <div style={{ marginBottom: "10px" }}>
                                <RappelSegmente valeur={e.rappel_jours_avant} onChange={(v) => handleChangerRappelEtape(e, detail, v)} t2={t2} isDark={isDark}/>
                              </div>
                            </>
                          )}
                          <div style={{ color: t2, fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>Note</div>
                          <textarea value={etapeNoteDraft} onChange={(ev) => setEtapeNoteDraft(ev.target.value)} placeholder="Note pour cette étape (optionnel)" rows={2} style={{ ...inputStyle, fontSize: "12.5px", resize: "none", fontFamily: "inherit", marginBottom: "8px" }}/>
                          {etapeNoteDraft.trim() !== (e.note ?? "") && (
                            <button disabled={busyAction} onClick={() => handleEnregistrerNoteEtape(e, detail)} className="tap" style={{ ...btnGhost, background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623", padding: "6px 12px", fontSize: "11.5px", display: "flex", alignItems: "center", justifyContent: "center" }}>{busyAction ? <YelenLoader size={12}/> : "Enregistrer la note"}</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
                <input value={nouvelleEtapeLibelle} onChange={(e) => setNouvelleEtapeLibelle(e.target.value)} placeholder="Ajouter une étape" style={{ ...inputStyle, flex: 1, padding: "9px 11px", fontSize: "13px" }}/>
                <input type="date" value={nouvelleEtapeDate} onChange={(e) => setNouvelleEtapeDate(e.target.value)} style={{ ...inputStyle, width: "116px", padding: "9px 11px", fontSize: "13px", colorScheme: isDark ? "dark" : "light" }}/>
                <button disabled={!nouvelleEtapeLibelle.trim() || busyAction} onClick={() => handleAjouterEtapeDetail(detail)} className="tap" style={{ ...btnGhost, padding: "0 12px", opacity: !nouvelleEtapeLibelle.trim() || busyAction ? 0.5 : 1 }}><Ic.Plus/></button>
              </div>

              {historique.length > 0 && (
                <div style={{ marginBottom: "14px" }}>
                  <button onClick={() => setHistoriqueOuvert((v) => !v)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: "4px 0", cursor: "pointer" }}>
                    <span style={{ color: t2, fontSize: "12px", fontWeight: 700 }}>Historique ({historique.length})</span>
                    <span style={{ color: t3, transform: historiqueOuvert ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><Ic.Chev/></span>
                  </button>
                  {historiqueOuvert && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                      {historique.map((h) => (
                        <div key={h.id} style={{ display: "flex", gap: "8px" }}>
                          <div style={{ color: t3, fontSize: "11px", flexShrink: 0, width: "84px" }}>{formatDateCourt(h.created_at)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: t1, fontSize: "12px", fontWeight: 700 }}>{HISTORIQUE_LABEL[h.evenement] ?? h.evenement}</div>
                            {h.detail && <div style={{ color: t2, fontSize: "11.5px" }}>{h.detail}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ color: t3, fontSize: "11px", lineHeight: 1.5, marginBottom: "12px" }}>
                {detail.statut === "terminee"
                  ? "Cette démarche est marquée terminée — vous pouvez la rouvrir à tout moment."
                  : detail.etapes.length === 0
                    ? "Aucune étape ici : marquez-la terminée vous-même une fois la démarche accomplie."
                    : "Elle passe automatiquement en \"Terminée\" une fois toutes les étapes cochées, ou vous pouvez la clôturer manuellement avant."}
              </div>
              <button disabled={busyAction} onClick={() => handleBasculerStatut(detail)} className="tap" style={{ ...btnGhost, width: "100%", background: detail.statut === "terminee" ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)") : "rgba(34,197,94,0.12)", borderColor: detail.statut === "terminee" ? brd : "rgba(34,197,94,0.4)", color: detail.statut === "terminee" ? t1 : "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {busyAction ? <YelenLoader size={14} color={detail.statut === "terminee" ? t1 : "#22c55e"}/> : detail.statut === "terminee" ? "Rouvrir la démarche" : "Marquer terminée"}
              </button>

              <div style={{ borderTop: `1px solid ${brd}`, marginTop: "14px", paddingTop: "14px" }}>
                <button onClick={() => handleSupprimerDemarche(detail)} className="tap" style={{ ...btnGhost, width: "100%", color: "#ef4444" }}><Ic.Trash/> Supprimer la démarche</button>
              </div>
            </div>
          </div>
        );
      })()}

      {faqOuverte !== null && (
        <div onClick={() => setFaqOuverte(null)} style={{ position: "fixed", inset: 0, zIndex: 9200, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px 24px 0 0", padding: "10px 20px calc(env(safe-area-inset-bottom) + 24px)", width: "100%", maxWidth: "560px", maxHeight: "70svh", overflowY: "auto", animation: "sheetUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
              <div style={{ color: t3, fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase" }}>Question</div>
              <button onClick={() => setFaqOuverte(null)} className="tap" aria-label="Fermer" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
            </div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, lineHeight: 1.35, marginBottom: "16px" }}>{FAQ_DEMARCHES[faqOuverte].q}</div>
            <div style={{ borderTop: `1px solid ${brd}`, paddingTop: "14px" }}>
              <div style={{ color: t3, fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "8px" }}>Réponse</div>
              <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.65 }}>{FAQ_DEMARCHES[faqOuverte].r}</div>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div onClick={() => { if (!confirmationBusy) setConfirmation(null); }} style={{ position: "fixed", inset: 0, zIndex: 9700, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}` }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>{confirmation.titre}</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>{confirmation.message}</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmation(null)} disabled={confirmationBusy} className="tap" style={{ ...btnGhost, flex: 1, opacity: confirmationBusy ? 0.5 : 1 }}>Annuler</button>
              <button onClick={async () => { setConfirmationBusy(true); await confirmation.onConfirm(); setConfirmationBusy(false); setConfirmation(null); }} disabled={confirmationBusy} className="tap" style={{ ...btnGhost, flex: 1, background: confirmation.danger ? "rgba(239,68,68,0.12)" : "rgba(245,166,35,0.12)", borderColor: confirmation.danger ? "rgba(239,68,68,0.4)" : "rgba(245,166,35,0.4)", color: confirmation.danger ? "#ef4444" : "#F5A623", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {confirmationBusy ? <YelenLoader size={14} color={confirmation.danger ? "#ef4444" : "#F5A623"}/> : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {celebration && (
        <div onClick={() => setCelebration(null)} style={{ position: "fixed", inset: 0, zIndex: 9800, backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "32px 24px 24px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}`, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}><IllustrationVictoire/></div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: 900, marginBottom: "8px" }}>Bravo !</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "22px" }}>
              Vous avez terminé « {celebration.titre} ». Une discipline comme celle-ci construit une vie administrative bien gérée — continuez ainsi.
            </div>
            <button onClick={() => setCelebration(null)} className="tap" style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "14px", border: "none", cursor: "pointer" }}>Continuer</button>
          </div>
        </div>
      )}

      {blocageEcheance && (() => {
        const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
        const cible = new Date(blocageEcheance.date); cible.setHours(0, 0, 0, 0);
        const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
        return (
          <div onClick={() => setBlocageEcheance(null)} style={{ position: "fixed", inset: 0, zIndex: 9800, backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "32px 24px 24px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}`, textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}><IllustrationPatience/></div>
              <div style={{ color: t1, fontSize: "19px", fontWeight: 900, marginBottom: "8px" }}>Pas encore le moment</div>
              <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "22px" }}>
                « {blocageEcheance.titre} » est prévue pour le {formatDateCourt(blocageEcheance.date)}{jours > 0 ? ` — encore ${jours} jour${jours > 1 ? "s" : ""}` : ""}. Une échéance ne peut pas être marquée terminée avant d&apos;être arrivée. Elle reste bien suivie dans « À venir » en attendant.
              </div>
              <button onClick={() => setBlocageEcheance(null)} className="tap" style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "14px", border: "none", cursor: "pointer" }}>Compris</button>
            </div>
          </div>
        );
      })()}

      {confirmationSuppression && (
        <div onClick={() => { if (!suppressionBusy) setConfirmationSuppression(null); }} style={{ position: "fixed", inset: 0, zIndex: 9800, backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "32px 24px 24px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}`, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}><IllustrationSuppression/></div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: 900, marginBottom: "8px" }}>Supprimer cette démarche ?</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "22px" }}>
              « {confirmationSuppression.titre} » sera définitivement supprimée{confirmationSuppression.etapes.length > 0 ? `, avec ${confirmationSuppression.etapes.length > 1 ? "ses" : "son"} ${confirmationSuppression.etapes.length} étape${confirmationSuppression.etapes.length > 1 ? "s" : ""}` : ""} et son historique. Cette action est irréversible — Yelen ne pourra plus vous la montrer ensuite.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={async () => { const d = confirmationSuppression; if (!d) return; setSuppressionBusy(true); await executerSuppressionDemarche(d); setSuppressionBusy(false); setConfirmationSuppression(null); }} disabled={suppressionBusy} className="tap" style={{ width: "100%", background: "#ef4444", color: "#fff", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "14px", border: "none", cursor: suppressionBusy ? "default" : "pointer", opacity: suppressionBusy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {suppressionBusy ? <YelenLoader size={16} color="#fff"/> : "Supprimer définitivement"}
              </button>
              <button onClick={() => setConfirmationSuppression(null)} disabled={suppressionBusy} className="tap" style={{ ...btnGhost, width: "100%", opacity: suppressionBusy ? 0.5 : 1 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}

      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 60px)",
          bottom: "calc(env(safe-area-inset-bottom) + 12px)",
          right: "3px",
          width: "3px",
          zIndex: 90,
          pointerEvents: "none",
          opacity: scrollBarShown ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${scrollPct * (1 - scrollThumbH) * 100}%`,
            height: `${scrollThumbH * 100}%`,
            width: "100%",
            borderRadius: "3px",
            background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)",
          }}
        />
      </div>
    </div>
  );
}
