"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { YELEN224_USER_ID_KEY, YELEN224_LAST_TAB_KEY } from "@/lib/auth/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isWebAuthnSupported, registerBiometrie, authenticateBiometrie } from "@/lib/auth/citoyenBiometrie";
import { MonAssistant } from "@/components/MonAssistant";
import { formatYelenId } from "@/lib/citoyenIdentite";
import { souscrirePush } from "@/lib/pushClient";
import { NotifPanel } from "@/components/NotifPanel";
import { rdvEstEnRetard, rdvEstAbsent, rdvJourneeDejaPassee } from "@/lib/rdvGating";
import { deriverTendancesCitoyen } from "@/lib/citoyenTendances";
import { deriverRappelsDemarches, type DemarcheRappel } from "@/lib/citoyenDemarchesRappels";
import { formatGNF, CATEGORIE_LABEL_DEPENSE, COULEUR_CATEGORIE_DEPENSE, type CategorieDepenseId } from "@/lib/depenses";
import { LogoutFlow, CITOYEN_LOGOUT_COPY } from "@/components/LogoutFlow";
import { CitoyenMenu } from "@/components/CitoyenMenu";
import { CompteRechercheOverlay } from "@/components/CompteRechercheOverlay";
import { PullToRefresh } from "@/components/PullToRefresh";
import { InstitutionsRecentesSection } from "@/components/InstitutionsRecentesSection";
import OffreFicheOverlay from "@/components/OffreFicheOverlay";
import { OFFRE_CAT_LABELS, OFFRE_CATEGORIE_VERS_INTERETS, OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";
import { YelenLoader, YelenLoaderEcran } from "@/components/YelenLoader";
import { PostCard, CommunauteEmptyIllustration, Avatar as CommunauteAvatar, CategorieChip, type Post, type Commentaire } from "@/components/CommunautePostCard";
import ProfilAuteurOverlay from "@/components/ProfilAuteurOverlay";
import SignalerCommunauteModal from "@/components/SignalerCommunauteModal";
import MesPublicationsOverlay from "@/components/MesPublicationsOverlay";
import CreerPostOverlay from "@/components/CreerPostOverlay";
import { POST_CATEGORIES } from "@/lib/communauteCategories";

const CarteMapHome = dynamic(() => import("@/components/CarteMapHome"), { ssr: false });

async function ft<T>(p: Promise<T> | PromiseLike<T>, ms = 5000): Promise<T | null> {
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), ms))
    ]);
  } catch { return null; }
}

const P = { pointerEvents: "none" as const };

// Version affichée en pied de l'onglet Compte (décision produit
// 18/07/2026) — distincte de la "Version 1.0 — Mars 2025" des pages
// légales (CGU/Confidentialité), qui versionne le texte juridique, pas
// l'application. Mise à jour manuelle par Bryan à chaque étape notable
// (celle-ci reflète le chantier "Mon compte" + Journal d'activité).
const YELEN_APP_VERSION = "2.334.0-387";

// ============================================================
// ICÔNES
// ============================================================
const Ic = {
  Home:     (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Search:   (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Cal:      (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Msg:      (a?: boolean, b?: number) => <span style={{ position: "relative", display: "inline-flex", pointerEvents: "none" }}><svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>{b ? <span style={{ position: "absolute", top: "-4px", right: "-4px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>{b}</span> : null}</span>,
  User:     (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill={a ? "#F5A623" : "none"} stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Bell:     (a?: boolean, b?: number) => <span style={{ position: "relative", display: "inline-flex", pointerEvents: "none" }}><svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>{!!b && <span style={{ position: "absolute", top: "-4px", right: "-4px", backgroundColor: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", borderRadius: "10px", minWidth: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>{b > 9 ? "9+" : b}</span>}</span>,
  X:        () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Back:     () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>,
  Chev:     () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Shield:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Star:     (f?: boolean) => <svg style={P} width="11" height="11" viewBox="0 0 24 24" fill={f ? "#F5A623" : "none"} stroke="#F5A623" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Clock:    () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Plus:     () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Map:      () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Globe:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Bldg:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  Hosp:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Info:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Help:     () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Headset:  () => <svg style={P} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>,
  Lock:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Out:      () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Expand:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>,
  Notif:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Trash:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Settings: (a?: boolean) => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#F5A623" : "currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  QR:       () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>,
  Pay:      () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Finger:   () => <svg style={P} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M8 11a4 4 0 0 0 8 0"/><path d="M12 18v4"/><path d="M4 15.5A9 9 0 0 0 20 15"/></svg>,
  Award:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>,
  TrendUp:  () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Doc:      () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Check:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Bank:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  Device:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  // Presse-papier + coche — reprend exactement l'icône de l'écran "Mes
  // démarches" lui-même (app/compte/mes-demarches/mes-demarches-client.tsx)
  // pour la cohérence visuelle, dimensionnée comme les 4 autres icônes de
  // la nav du bas (24x24) — Ic.Doc() (14x14) y paraissait minuscule et
  // dépareillée (retour CEO 23/07/2026).
  Clipboard: () => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M9 12l2 2 4-4"/></svg>,
  // Étiquette — nouvel onglet "Offres" du 26/07/2026, dimensionnée comme
  // les autres icônes de la nav du bas (24x24), même gabarit que Clipboard.
  Tag:      () => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  // Deux personnages — "Communauté" du 27/07/2026 (remplace Mes démarches
  // dans la nav du bas), même gabarit 24x24 que les icônes voisines.
  Community:() => <svg style={P} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

// ============================================================
// TYPES
// ============================================================
type Tab = "accueil" | "offres" | "rdv" | "communaute" | "compte";
type Fait = { label: string; valeur: string };
type Offre = {
  id: string; titre: string; description_courte: string; description_longue: string;
  categorie: string; genre: string; partenaire_nom: string; partenaire_logo: string | null;
  cta_label: string | null; cta_url: string | null; epingle: boolean;
  date_expiration?: string | null; nb_clics?: number;
  faits?: Fait[]; avantages?: string[]; limites?: string[];
  // Avis réels de l'établissement partenaire (institutions.moyenne_avis/
  // nb_avis, jointure via offres.institution_id) — retour Bryan
  // 26/07/2026, affiché après le nom sur la carte. Jamais affiché si
  // nb_avis = 0 (pas de "0.0 (0 avis)" vide).
  institutions?: { moyenne_avis: number | null; nb_avis: number | null } | null;
};
// Palette de tuiles pleine couleur façon MoneyLion — l'offre n'a pas de
// couleur de marque stockée en base, donc une teinte est dérivée de façon
// déterministe du nom du partenaire (même partenaire = toujours la même
// couleur), plutôt que d'inventer un champ supplémentaire non demandé.
const OFFRE_PALETTE = [
  "linear-gradient(135deg,#F5A623,#C8740A)",
  "linear-gradient(135deg,#2563EB,#1E3A8A)",
  "linear-gradient(135deg,#DC2626,#7F1D1D)",
  "linear-gradient(135deg,#16A34A,#14532D)",
  "linear-gradient(135deg,#9333EA,#581C87)",
  "linear-gradient(135deg,#0D9488,#134E4A)",
];
function offreGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return OFFRE_PALETTE[h % OFFRE_PALETTE.length];
}

// Panneau de recherche Offres — recherches récentes + offres consultées
// récemment, en localStorage (même convention que
// components/CompteRechercheOverlay.tsx, clés distinctes propres à cet
// onglet). Jamais un historique inventé : uniquement ce que le citoyen a
// réellement tapé/ouvert.
const OFFRE_RECH_RECENTES_KEY = "yelen224_offres_recherches_recentes";
const OFFRE_CONSULTEES_KEY = "yelen224_offres_consultees_recemment";
const OFFRE_RECH_MAX = 6;

function lireOffreRecherchesRecentes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFRE_RECH_RECENTES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function enregistrerOffreRechercheRecente(q: string) {
  if (typeof window === "undefined") return;
  const propre = q.trim();
  if (propre.length < 2) return;
  try {
    const next = [propre, ...lireOffreRecherchesRecentes().filter(x => x.toLowerCase() !== propre.toLowerCase())].slice(0, OFFRE_RECH_MAX);
    localStorage.setItem(OFFRE_RECH_RECENTES_KEY, JSON.stringify(next));
  } catch {}
}
function retirerOffreRechercheRecente(q: string): string[] {
  const next = lireOffreRecherchesRecentes().filter(x => x !== q);
  try { localStorage.setItem(OFFRE_RECH_RECENTES_KEY, JSON.stringify(next)); } catch {}
  return next;
}
function lireOffresConsulteesIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFRE_CONSULTEES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function enregistrerOffreConsultee(id: string) {
  if (typeof window === "undefined") return;
  try {
    const next = [id, ...lireOffresConsulteesIds().filter(x => x !== id)].slice(0, OFFRE_RECH_MAX);
    localStorage.setItem(OFFRE_CONSULTEES_KEY, JSON.stringify(next));
  } catch {}
}

// Illustration Yelen sur mesure (noyau + rayons, même langage graphique
// que /menu/recompenses) pour l'état vide du panneau de recherche — pas
// d'icône générique de loupe grise.
function IllustrationRechercheVide({ isDark }: { isDark: boolean }) {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="34" fill={isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.08)"} />
      <circle cx="33" cy="33" r="13" stroke="#F5A623" strokeWidth="3" fill="none" />
      <line x1="42" y1="42" x2="52" y2="52" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 33h10M33 28v10" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

// Lignes de faits — présentées comme un petit tableau "Points clés"
// (bandes alternées, en-tête explicite) plutôt qu'une simple liste
// label/valeur : le contenu reste celui saisi par le prestataire (parfois
// peu clair côté institution), mais la structure visuelle, elle, doit
// rester lisible dans tous les cas (retour Bryan 26/07/2026).
function FaitsPointsCles({ faits, t1, t2, isDark }: { faits: { label: string; valeur: string }[]; t1: string; t2: string; isDark: boolean }) {
  if (faits.length === 0) return null;
  return (
    <div style={{ marginTop: "14px" }}>
      <div style={{ color: t2, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Points clés</div>
      <div style={{ borderRadius: "10px", overflow: "hidden" }}>
        {faits.map((f, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "7px 10px", background: isDark ? (i % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)") : (i % 2 ? "rgba(0,0,0,0.015)" : "rgba(0,0,0,0.035)") }}>
            <span style={{ color: t2, fontSize: "12px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
            <span style={{ color: t1, fontSize: "12px", fontWeight: 800, textAlign: "right", flexShrink: 0, marginLeft: "10px" }}>{f.valeur}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Le CTA visuel affiche désormais le libellé propre du prestataire
// (ex. "Postuler") — ce texte seul peut laisser croire qu'il déclenche
// l'action immédiatement, alors qu'un tap n'importe où sur la carte ouvre
// toujours la fiche détail d'abord. Ce lien secondaire clarifie l'étape
// réelle (retour Bryan 26/07/2026).
function VoirDetailsLien({ t3 }: { t3: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginTop: "8px", color: t3, fontSize: "11px", fontWeight: 700 }}>
      Voir les détails
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </div>
  );
}

// Badge de genre d'offre — façon app US (MoneyLion "CREDIT BUILDER",
// DoorDash "Livraison gratuite") : couleur pleine propre au genre,
// affiché en évidence sur la carte, jamais un simple texte gris (retour
// Bryan 26/07/2026 : "on ne sait pas quel genre d'offre, tout est
// identique").
function GenreBadge({ genre }: { genre: string }) {
  const couleurs = OFFRE_GENRE_COULEURS[genre as OffreGenre];
  if (!couleurs) return null;
  return (
    <span style={{ display: "inline-block", background: couleurs.bg, color: couleurs.texte, fontSize: "9.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
      {OFFRE_GENRE_LABELS[genre as OffreGenre] || genre}
    </span>
  );
}

// Tuile offre — définie au niveau module (pas de recréation par frappe,
// pas de perte de focus, même règle que les composants Section du Journal
// d'activité). Toute la carte est la cible de tap, le CTA visuel n'est
// qu'une affordance, pas un second comportement (le flux reste : carte →
// détail → redirection externe).
// 3 rendus distincts (retour Bryan 26/07/2026 : "moderniser... différencie
// celle horizontale et verticale et celle populaire, chacune avec son
// rendu professionnel") :
// - "populaire" : carte phare du carrousel "Offres populaires" — bandeau
//   coloré en en-tête + ruban "EN VEDETTE", format le plus premium.
// - "verticale" : carte riche de la liste principale — logo, titre,
//   description, points clés.
// - "horizontale" : tuile compacte des groupes mélangés dans le feed —
//   volontairement plus légère (pas de points clés), pensée pour un
//   défilement rapide, pas une lecture complète.
function OffreTuile({ offre, onOpen, variant = "verticale", card, t1, t2, t3, brd, isDark, style: styleIndex = 0 }: {
  offre: Offre; onOpen: () => void; variant?: "populaire" | "verticale" | "horizontale";
  card: string; t1: string; t2: string; t3: string; brd: string; isDark: boolean; style?: number;
}) {
  const badgeGradient = offreGradient(offre.partenaire_nom);
  const faits = (offre.faits || []).slice(0, 4);
  // Signal d'urgence honnête — date_expiration est déjà chargée mais
  // n'était affichée nulle part sur la carte elle-même avant ce chantier
  // (retour Bryan 26/07/2026, analyse conversion). Jamais de compte à
  // rebours artificiel : uniquement la vraie date, à J-7 ou moins.
  const joursRestants = offre.date_expiration
    ? Math.ceil((new Date(offre.date_expiration).getTime() - Date.now()) / 86400000)
    : null;
  const expireBientot = joursRestants !== null && joursRestants >= 0 && joursRestants <= 7;
  const texteExpiration = joursRestants === 0 ? "Expire aujourd'hui" : joursRestants === 1 ? "Expire demain" : `Expire dans ${joursRestants} j`;
  const animation = { animation: "fadeUp 0.35s ease both", animationDelay: `${Math.min(styleIndex, 6) * 0.05}s` };
  // Avis réels de l'établissement (institutions.moyenne_avis/nb_avis) —
  // jamais affiché si nb_avis = 0, jamais un chiffre inventé.
  const nbAvis = offre.institutions?.nb_avis || 0;
  const moyenneAvis = offre.institutions?.moyenne_avis || 0;
  const hasAvis = nbAvis > 0;

  // ───────────────────── Variante compacte (horizontale) ─────────────────────
  if (variant === "horizontale") {
    return (
      <div
        role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="tap offre-card-riche"
        style={{
          display: "flex", flexDirection: "column", textAlign: "left", cursor: "pointer",
          background: card, border: `1px solid ${brd}`, borderRadius: "18px", overflow: "hidden",
          width: "230px", maxWidth: "230px", minWidth: 0, boxSizing: "border-box", flexShrink: 0,
          boxShadow: isDark ? "0 4px 14px rgba(0,0,0,0.3)" : "0 4px 14px rgba(0,0,0,0.07)",
          ...animation,
        }}
      >
        <div style={{ position: "relative", height: "52px", background: badgeGradient, flexShrink: 0 }}>
          {expireBientot && (
            <span style={{ position: "absolute", top: "6px", right: "6px", background: "rgba(0,0,0,0.35)", color: "#fff", fontSize: "9px", fontWeight: 800, padding: "2px 7px", borderRadius: "20px", whiteSpace: "nowrap" }}>
              {texteExpiration}
            </span>
          )}
          <div style={{ position: "absolute", left: "12px", bottom: "-16px", width: "38px", height: "38px", borderRadius: "11px", overflow: "hidden", background: card, border: `2px solid ${card}`, boxShadow: "0 2px 6px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {offre.partenaire_logo ? (
              <img src={offre.partenaire_logo} alt={offre.partenaire_nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#F5A623", fontWeight: 900, fontSize: "13px" }}>{offre.partenaire_nom.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        </div>
        <div style={{ padding: "22px 12px 14px" }}>
          <div style={{ marginBottom: "6px" }}><GenreBadge genre={offre.genre} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
            <span style={{ color: t1, fontSize: "12px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{offre.partenaire_nom}</span>
            {hasAvis && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", color: t2, fontSize: "10.5px", fontWeight: 700, flexShrink: 0 }}>
                <span style={{ color: "#F5A623" }}>★</span>{moyenneAvis.toFixed(1)}
              </span>
            )}
          </div>
          <div style={{ color: t1, fontSize: "14px", fontWeight: 900, lineHeight: 1.25, marginTop: "3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {offre.titre}
          </div>
          <div style={{ marginTop: "10px", padding: "8px", borderRadius: "999px", background: "linear-gradient(135deg,#F5A623,#C8940A)", textAlign: "center" }}>
            <span style={{ color: "#080812", fontWeight: 800, fontSize: "11.5px" }}>{offre.cta_label || "Voir l'offre"}</span>
          </div>
          <div style={{ textAlign: "center", marginTop: "6px", color: t3, fontSize: "10px", fontWeight: 700 }}>Voir les détails</div>
        </div>
      </div>
    );
  }

  const estPopulaire = variant === "populaire";

  // ───────────────── Variantes riches (populaire / verticale) ─────────────────
  return (
    <div
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="tap offre-card-riche"
      style={{
        display: "flex", flexDirection: "column", textAlign: "left", cursor: "pointer",
        background: card, border: `1px solid ${brd}`, borderRadius: "20px", overflow: "hidden",
        width: estPopulaire ? "82vw" : "100%", maxWidth: estPopulaire ? "340px" : "100%",
        minWidth: 0, boxSizing: "border-box", flexShrink: 0,
        boxShadow: isDark ? "0 4px 18px rgba(0,0,0,0.35)" : "0 4px 18px rgba(0,0,0,0.08)",
        scrollSnapAlign: estPopulaire ? "start" : undefined,
        ...animation,
      }}
    >
      <div style={{ padding: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
          <GenreBadge genre={offre.genre} />
          {estPopulaire && (
            <div style={{ display: "inline-flex", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: "9px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px", letterSpacing: "0.3px" }}>
              ★ EN VEDETTE
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "13px", flexShrink: 0, overflow: "hidden", background: badgeGradient, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
            {offre.partenaire_logo ? (
              <img src={offre.partenaire_logo} alt={offre.partenaire_nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#fff", fontWeight: 900, fontSize: "15px" }}>{offre.partenaire_nom.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: "1px" }}>
            <span style={{ color: t1, fontSize: "14px", fontWeight: 800, letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{offre.partenaire_nom}</span>
            {hasAvis && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: t2, fontSize: "11.5px", fontWeight: 700 }}>
                <span style={{ color: "#F5A623" }}>★</span>{moyenneAvis.toFixed(1)}
                <span style={{ color: t3 }}>({nbAvis} avis)</span>
              </span>
            )}
          </div>
          {expireBientot && (
            <span style={{ marginLeft: "auto", flexShrink: 0, background: "rgba(220,38,38,0.1)", color: "#DC2626", fontSize: "10px", fontWeight: 800, padding: "3px 8px", borderRadius: "20px", whiteSpace: "nowrap" }}>
              {texteExpiration}
            </span>
          )}
        </div>

        <div style={{ color: t1, fontSize: estPopulaire ? "22px" : "21px", fontWeight: 900, lineHeight: 1.2, letterSpacing: "-0.3px", marginTop: "14px", wordBreak: "break-word" }}>
          {offre.titre}
        </div>
        <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginTop: "4px", wordBreak: "break-word" }}>
          {offre.description_courte}
        </div>

        {faits.length > 0 && <div style={{ height: "1px", background: brd, marginTop: "16px" }} />}
        <FaitsPointsCles faits={faits} t1={t1} t2={t2} isDark={isDark} />

        {estPopulaire && <VoirDetailsLien t3={t3} />}
        <div style={{ marginTop: estPopulaire ? "8px" : "18px", padding: "13px", borderRadius: "999px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(245,166,35,0.25)" }}>
          <span style={{ color: "#080812", fontWeight: 800, fontSize: "13.5px" }}>{offre.cta_label || "Voir l'offre"}</span>
        </div>
        {!estPopulaire && <VoirDetailsLien t3={t3} />}
      </div>
    </div>
  );
}

// Coquille partagée pour les bandeaux promo "grand format" en fin d'écran
// Offres (format repris de la 1ère version du bandeau Yelen Rewards, avant
// sa réduction en ligne compacte) — 4 instances, chacune avec sa propre
// couleur/illustration/animation (retour Bryan 26/07/2026 : "tous moderne
// couleur différente illustration différente animation différente"),
// jamais la même teinte ou le même motif répété.
function PromoBandeauLarge({
  href, chip, titre, sousTitre, cta, isDark, clair, sombre, teinteTexteClair, teinteSousTexteClair, ombre, illustration,
}: {
  href: string; chip: string; titre: string; sousTitre: string; cta: string;
  isDark: boolean; clair: [string, string]; sombre: [string, string];
  teinteTexteClair: string; teinteSousTexteClair: string; ombre: string;
  illustration: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="tap"
      style={{
        display: "block", position: "relative", overflow: "hidden",
        borderRadius: "20px", padding: "20px", marginBottom: "16px", textDecoration: "none",
        background: isDark ? `linear-gradient(135deg,${sombre[0]},${sombre[1]})` : `linear-gradient(135deg,${clair[0]},${clair[1]})`,
        boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.35)" : `0 8px 20px ${ombre}`,
      }}
    >
      {illustration}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "72%" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)", color: isDark ? "#fff" : teinteTexteClair, fontSize: "10px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {chip}
        </div>
        <div style={{ color: isDark ? "#fff" : teinteTexteClair, fontSize: "16.5px", fontWeight: 900, lineHeight: 1.25, marginBottom: "4px" }}>
          {titre}
        </div>
        <div style={{ color: isDark ? "rgba(255,255,255,0.7)" : teinteSousTexteClair, fontSize: "12.5px", lineHeight: 1.5 }}>
          {sousTitre}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "12px", color: isDark ? "#fff" : teinteTexteClair, fontSize: "12.5px", fontWeight: 800 }}>
          {cta}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </div>
      </div>
    </Link>
  );
}

// Illustration "Leçons d'argent" — livre + pièce qui rebondit doucement
// (motif repris de Badge.Book de CitoyenMenu.tsx, vert cohérent).
function IllustrationLecons({ isDark }: { isDark: boolean }) {
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: "absolute", top: "-10px", right: "-8px", opacity: isDark ? 0.7 : 0.95 }}>
      <style>{`
        @keyframes promoLeconsRebond { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes promoLeconsPage { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.86); } }
        .promo-lecons-piece { animation: promoLeconsRebond 1.8s ease-in-out infinite; transform-origin: center; }
        .promo-lecons-page { animation: promoLeconsPage 2.4s ease-in-out infinite; transform-origin: 46px 46px; }
        @media (prefers-reduced-motion: reduce) { .promo-lecons-piece, .promo-lecons-page { animation: none !important; } }
      `}</style>
      <g className="promo-lecons-page" transform="translate(46,46)">
        <path d="M0 -14c-9-6-21-8-33-6v46c12-2 24 0 33 6V-14z" fill={isDark ? "#22C55E" : "#16A34A"} />
        <path d="M0 -14c9-6 21-8 33-6v46c-12-2-24 0-33 6V-14z" fill={isDark ? "#15803D" : "#106B2F"} />
      </g>
      <g className="promo-lecons-piece" transform="translate(66,20)">
        <circle r="12" fill="#F5A623" />
        <text x="0" y="4" fontSize="13" fontWeight="800" fill="#fff" textAnchor="middle">$</text>
      </g>
    </svg>
  );
}

// Illustration "Calculatrice" — boutons qui s'allument en séquence, comme
// une saisie en cours (motif repris de Badge.Calc, indigo cohérent).
function IllustrationCalculatrice({ isDark }: { isDark: boolean }) {
  const dots = [0, 1, 2, 3, 4, 5];
  return (
    <svg width="88" height="92" viewBox="0 0 88 92" style={{ position: "absolute", top: "-8px", right: "-4px", opacity: isDark ? 0.7 : 0.95 }}>
      <style>{`
        @keyframes promoCalcTouche { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
        .promo-calc-touche { animation: promoCalcTouche 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .promo-calc-touche { animation: none !important; } }
      `}</style>
      <rect x="24" y="8" width="46" height="76" rx="10" fill={isDark ? "#4F46E5" : "#4338CA"} />
      <rect x="31" y="16" width="32" height="18" rx="3" fill={isDark ? "rgba(255,255,255,0.25)" : "#C7D2FE"} />
      {dots.map((d, i) => {
        const cx = 34 + (i % 3) * 12.5;
        const cy = 46 + Math.floor(i / 3) * 12.5;
        return <circle key={d} className="promo-calc-touche" cx={cx} cy={cy} r="3.4" fill="#C7D2FE" style={{ animationDelay: `${i * 0.18}s` }} />;
      })}
    </svg>
  );
}

// Illustration "Mes démarches" — coche qui se dessine en boucle (motif
// clipboard, violet cohérent avec Badge.Trend).
function IllustrationDemarches({ isDark }: { isDark: boolean }) {
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: "absolute", top: "-10px", right: "-8px", opacity: isDark ? 0.7 : 0.95 }}>
      <style>{`
        @keyframes promoDemarchesCoche { 0% { stroke-dashoffset: 26; opacity: 0; } 15% { opacity: 1; } 55% { stroke-dashoffset: 0; } 80% { stroke-dashoffset: 0; opacity: 1; } 95% { opacity: 0; } 100% { stroke-dashoffset: 26; opacity: 0; } }
        .promo-demarches-coche { stroke-dasharray: 26; animation: promoDemarchesCoche 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .promo-demarches-coche { animation: none !important; opacity: 1; stroke-dashoffset: 0; } }
      `}</style>
      <rect x="26" y="14" width="40" height="56" rx="7" fill={isDark ? "#7C3AED" : "#6D28D9"} />
      <rect x="35" y="8" width="22" height="10" rx="3" fill={isDark ? "#5B21B6" : "#4C1D95"} />
      <line x1="34" y1="38" x2="58" y2="38" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round" />
      <path className="promo-demarches-coche" d="M33 52l6 6 12-13" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Illustration "Rechercher un établissement" — repère de carte + onde
// radar qui se propage (bleu, motif distinct des 3 autres).
function IllustrationRecherche({ isDark }: { isDark: boolean }) {
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" style={{ position: "absolute", top: "-8px", right: "-6px", opacity: isDark ? 0.7 : 0.95 }}>
      <style>{`
        @keyframes promoRechercheOnde { 0% { transform: scale(0.6); opacity: 0.55; } 100% { transform: scale(1.6); opacity: 0; } }
        .promo-recherche-onde { animation: promoRechercheOnde 2.2s ease-out infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) { .promo-recherche-onde { animation: none !important; opacity: 0; } }
      `}</style>
      <circle className="promo-recherche-onde" cx="46" cy="42" r="16" fill="none" stroke={isDark ? "#60A5FA" : "#2563EB"} strokeWidth="2.4" />
      <circle className="promo-recherche-onde" cx="46" cy="42" r="16" fill="none" stroke={isDark ? "#60A5FA" : "#2563EB"} strokeWidth="2.4" style={{ animationDelay: "1.1s" }} />
      <path d="M46 20c-9.9 0-18 8.1-18 18 0 13.5 18 34 18 34s18-20.5 18-34c0-9.9-8.1-18-18-18z" fill={isDark ? "#3B82F6" : "#2563EB"} />
      <circle cx="46" cy="38" r="8" fill="#fff" />
    </svg>
  );
}

// Données des 4 bandeaux promo (définies une seule fois, réutilisées à la
// fois pour le carrousel fixe de fin d'écran ET pour le mélange entre les
// groupes d'offres — retour Bryan 26/07/2026 : "il se mélange entre les
// annonces... en gardant celle en fin d'écran fixe").
const PROMO_BANDEAUX: {
  href: string; chip: string; titre: string; sousTitre: string; cta: string;
  clair: [string, string]; sombre: [string, string];
  teinteTexteClair: string; teinteSousTexteClair: string; ombre: string;
  Illustration: (props: { isDark: boolean }) => React.ReactNode;
}[] = [
  {
    href: "/menu/lecons-argent", chip: "Leçons d'argent",
    titre: "Apprenez les bases en 2 minutes",
    sousTitre: "Épargne, mobile money, microcrédit : des leçons courtes et sourcées.",
    cta: "Apprendre",
    clair: ["#DCFCE7", "#16A34A"], sombre: ["#0F3D24", "#17171C"],
    teinteTexteClair: "#062B17", teinteSousTexteClair: "rgba(6,43,23,0.65)", ombre: "rgba(22,163,74,0.22)",
    Illustration: IllustrationLecons,
  },
  {
    href: "/menu/calculatrice", chip: "Calculatrice",
    titre: "Simulez avant de vous engager",
    sousTitre: "Microcrédit, épargne : estimez vos mensualités et vos intérêts réels.",
    cta: "Calculer",
    clair: ["#E0E7FF", "#4F46E5"], sombre: ["#241F52", "#17171C"],
    teinteTexteClair: "#1E1B4B", teinteSousTexteClair: "rgba(30,27,75,0.65)", ombre: "rgba(79,70,229,0.22)",
    Illustration: IllustrationCalculatrice,
  },
  {
    href: "/compte/mes-demarches", chip: "Mes démarches",
    titre: "Organisez vos démarches",
    sousTitre: "Personnelles ou professionnelles, suivez chaque étape jusqu'au bout.",
    cta: "Organiser",
    clair: ["#EDE9FE", "#7C3AED"], sombre: ["#2E1065", "#17171C"],
    teinteTexteClair: "#2E1065", teinteSousTexteClair: "rgba(46,16,101,0.65)", ombre: "rgba(124,58,237,0.22)",
    Illustration: IllustrationDemarches,
  },
  {
    href: "/recherche", chip: "Recherche",
    titre: "Trouvez un établissement",
    sousTitre: "Hôpitaux, mairies, banques, ambassades : le bon service près de vous.",
    cta: "Rechercher",
    clair: ["#DBEAFE", "#2563EB"], sombre: ["#1E3A8A", "#17171C"],
    teinteTexteClair: "#0F2557", teinteSousTexteClair: "rgba(15,37,87,0.65)", ombre: "rgba(37,99,235,0.22)",
    Illustration: IllustrationRecherche,
  },
];

function PromoBandeauDepuisSpec({ spec, isDark }: { spec: (typeof PROMO_BANDEAUX)[number]; isDark: boolean }) {
  const Illu = spec.Illustration;
  return (
    <PromoBandeauLarge
      href={spec.href} chip={spec.chip} titre={spec.titre} sousTitre={spec.sousTitre} cta={spec.cta}
      isDark={isDark} clair={spec.clair} sombre={spec.sombre}
      teinteTexteClair={spec.teinteTexteClair} teinteSousTexteClair={spec.teinteSousTexteClair} ombre={spec.ombre}
      illustration={<Illu isDark={isDark} />}
    />
  );
}

type RDV = { id: string; date_rdv: string; heure_rdv?: string; statut: string; objet?: string; institution_id?: string; institution_name?: string; institution_secteur?: string | null; presence?: boolean; presence_status?: string };
type Inst = { id: string; name: string; category?: string; secteur?: string; ville?: string; quartier?: string; adresse?: string; latitude?: number; longitude?: number; phone?: string; logo?: string; moyenne_avis?: number; nb_avis?: number; badge_verifie?: boolean; plan?: string; disponibilites?: any };

// new Date("2026-07-30") = minuit UTC = 29 juillet au soir dans un fuseau
// négatif (ex. Amériques) → un RDV du lendemain s'affichait/se comparait
// comme s'il était la veille. new Date(2026,6,30) = minuit heure locale,
// correct partout — même correctif déjà appliqué dans
// app/mes-rdv/page.tsx::parseDateLocale (retour Bryan 29/07/2026, RDV
// "prochain" affiché avec un jour de retard).
function parseDateLocale(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Échéance courte pour les cartes-événement de dépenses à venir (même
// logique que texteEcheance() dans app/menu/depenses/depenses-client.tsx,
// dupliquée volontairement — petite fonction pure, convention du projet).
function texteEcheanceCourt(dateStr: string): string {
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const cible = new Date(dateStr); cible.setHours(0, 0, 0, 0);
  const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Demain";
  return `Dans ${jours} j`;
}

// Repartitionnement côté client de "Établissements près de vous" : les
// établissements du secteur le plus fréquenté du citoyen (lib/citoyenTendances.ts)
// passent en tête, ordre `moyenne_avis` préservé à l'intérieur de chaque groupe.
// Fonction identité si aucun secteur dominant (invité, ou citoyen sous le seuil
// de preuve) — comportement actuel inchangé dans ce cas.
function priveligierSecteur(insts: Inst[], secteurTop: string | null): Inst[] {
  if (!secteurTop) return insts;
  const memes = insts.filter(i => i.secteur === secteurTop);
  if (memes.length === 0) return insts;
  const autres = insts.filter(i => i.secteur !== secteurTop);
  return [...memes, ...autres];
}
function stInfo(s: string) {
  switch (s) {
    case "confirme":   return { c: "#22c55e", bg: "rgba(34,197,94,0.12)",   l: "Confirmé" };
    case "en_attente": return { c: "#F5A623", bg: "rgba(245,166,35,0.12)",  l: "En attente" };
    case "annule":     return { c: "#ef4444", bg: "rgba(239,68,68,0.12)",   l: "Annulé" };
    case "effectue":   return { c: "#3b82f6", bg: "rgba(59,130,246,0.12)",  l: "Effectué" };
    case "present":    return { c: "#22c55e", bg: "rgba(34,197,94,0.12)",   l: "Présent ✓" };
    case "absent":     return { c: "#ef4444", bg: "rgba(239,68,68,0.12)",   l: "Absent" };
    default:           return { c: "#8E8E93", bg: "rgba(142,142,147,0.12)", l: s };
  }
}

async function handleShareYelen() {
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text = "Découvre Yelen224 — prends rendez-vous en ligne avec les hôpitaux, mairies, banques et ambassades de Guinée, sans faire la queue.";
  try {
    if (navigator.share) {
      await navigator.share({ title: "Yelen224", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      window.alert("Lien copié — partagez-le avec vos proches !");
    }
  } catch {}
}

// ============================================================
// LOGO YELEN224
// ============================================================
function Logo({ size = 38, textSize = 16, subSize = 8, color = "#fff" }: { size?: number; textSize?: number; subSize?: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#F5A623", borderRadius: "28%", transform: "rotate(8deg)", opacity: 0.22 }}/>
        <div style={{ position: "relative", width: size, height: size, backgroundColor: "#F5A623", borderRadius: "28%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}>
          <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
          </svg>
        </div>
      </div>
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: `${textSize}px`, fontWeight: "900", letterSpacing: "0.5px", color }}>YELEN224</div>
        <div style={{ fontSize: `${subSize}px`, fontWeight: "700", letterSpacing: "2px", color: "#F5A623", marginTop: "2px" }}>REPUBLIQUE DE GUINEE</div>
      </div>
    </div>
  );
}

// ============================================================
// WEBAUTHN — Biométrie réelle, vérifiée serveur (Lot C, 18/07/2026)
// ============================================================
// isWebAuthnSupported/registerBiometrie/authenticateBiometrie extraites
// dans lib/auth/citoyenBiometrie.ts (correctif Lot E, 18/07/2026) pour
// être réutilisées aussi par l'écran Sécurité (app/compte/securite) sans
// dupliquer la cérémonie WebAuthn.

// ============================================================
// BIOMETRIE MODAL — Réel WebAuthn (empreinte / Face ID)
// ============================================================
function BiometrieModal({ onSuccess, onClose, prenom, isDark, card, t1, t2, brd, userId }: {
  onSuccess: () => void; onClose: () => void; prenom: string;
  isDark: boolean; card: string; t1: string; t2: string; brd: string;
  userId: string;
}) {
  const [phase, setPhase] = useState<"wait" | "scanning" | "success" | "fail" | "unsupported">("wait");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Vérifier support WebAuthn dès l'ouverture
    if (!isWebAuthnSupported()) {
      setPhase("unsupported");
    }
  }, []);

  async function handleScan() {
    setPhase("scanning");
    setErrorMsg("");

    try {
      const isRegistered = localStorage.getItem("yelen224_bio_registered") === "1";

      let ok = false;
      if (!isRegistered) {
        // Première fois : enregistrer l'empreinte
        const result = await registerBiometrie(userId);
        ok = result.ok;
        if (!result.ok && result.reason === "unsupported") {
          setPhase("unsupported");
          return;
        }
      } else {
        // Déjà enregistré : juste s'authentifier. Ce ré-écran interne
        // (session déjà active) n'est pas le point d'application de la 2FA
        // TOTP (chantier 25/07/2026, voir app/login/page.tsx) — si le
        // citoyen l'a activée, on ne construit pas une 2e UI de saisie de
        // code ici, on renvoie un échec explicite qui pointe vers une
        // reconnexion complète (seul endroit qui applique réellement la 2FA).
        const result = await authenticateBiometrie(userId);
        if (!result.ok && result.requiresTotp) {
          setPhase("fail");
          setErrorMsg("Vérification supplémentaire requise. Reconnectez-vous depuis l'écran de connexion.");
          return;
        }
        ok = result.ok;
      }

      if (ok) {
        setPhase("success");
        setTimeout(() => { onSuccess(); }, 1000);
      } else {
        setPhase("fail");
        setErrorMsg("Authentification échouée. Réessayez.");
      }
    } catch {
      setPhase("fail");
      setErrorMsg("Erreur biométrique. Utilisez votre code PIN.");
    }
  }

  function handleRetry() {
    setPhase("wait");
    setErrorMsg("");
  }

  const ringColor =
    phase === "success" ? "#22c55e" :
    phase === "fail" ? "#ef4444" :
    phase === "scanning" ? "#F5A623" :
    isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ backgroundColor: card, borderRadius: "28px", padding: "40px 28px 36px", maxWidth: "340px", width: "100%", textAlign: "center", border: `1px solid ${brd}`, boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ width: "60px", height: "4px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)", borderRadius: "2px", margin: "0 auto 28px" }}/>
        <Logo size={42} textSize={17} subSize={8} color={t1}/>
        <div style={{ marginTop: "28px", marginBottom: "8px", color: t1, fontSize: "18px", fontWeight: "800" }}>
          {phase === "success" ? "Identité vérifiée ✓" :
           phase === "fail" ? "Échec de vérification" :
           phase === "unsupported" ? "Non disponible" :
           `Bonjour, ${prenom}`}
        </div>
        <div style={{ color: t2, fontSize: "13px", marginBottom: "36px", lineHeight: 1.5 }}>
          {phase === "wait" && (localStorage.getItem("yelen224_bio_registered") === "1"
            ? "Utilisez votre empreinte ou Face ID pour accéder à votre espace"
            : "Enregistrez votre empreinte pour une connexion sécurisée")}
          {phase === "scanning" && "Authentification en cours..."}
          {phase === "success" && "Accès autorisé — YelenID vérifié"}
          {phase === "fail" && (errorMsg || "Authentification échouée.")}
          {phase === "unsupported" && "La biométrie n'est pas disponible sur cet appareil."}
        </div>

        {/* Cercle biométrique */}
        <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 32px" }}>
          {phase === "scanning" && (
            <>
              <div style={{ position: "absolute", inset: "-12px", borderRadius: "50%", border: "2px solid rgba(245,166,35,0.3)", animation: "pingRing 1.5s ease-out infinite" }}/>
              <div style={{ position: "absolute", inset: "-24px", borderRadius: "50%", border: "1.5px solid rgba(245,166,35,0.15)", animation: "pingRing 1.5s ease-out infinite 0.3s" }}/>
            </>
          )}
          {phase === "success" && (
            <div style={{ position: "absolute", inset: "-12px", borderRadius: "50%", border: "2px solid rgba(34,197,94,0.4)", animation: "pingRing 1s ease-out infinite" }}/>
          )}
          <div style={{ width: "120px", height: "120px", borderRadius: "50%",
            background:
              phase === "success" ? "linear-gradient(135deg,#22c55e,#16a34a)" :
              phase === "fail" ? "linear-gradient(135deg,#ef4444,#b91c1c)" :
              phase === "scanning" ? "linear-gradient(135deg,#F5A623,#C8940A)" :
              isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            border: `3px solid ${ringColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.4s ease",
            boxShadow: phase !== "wait" && phase !== "unsupported" ? `0 0 40px ${phase === "success" ? "rgba(34,197,94,0.4)" : phase === "fail" ? "rgba(239,68,68,0.3)" : "rgba(245,166,35,0.4)"}` : "none"
          }}>
            {phase === "success"
              ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              : phase === "fail"
              ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={phase === "scanning" ? "#080812" : t2} strokeWidth="1.4" strokeLinecap="round">
                  <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                  <path d="M8 11a4 4 0 0 0 8 0"/>
                  <path d="M12 18v4"/>
                  <path d="M4 15.5A9 9 0 0 0 20 15"/>
                </svg>
            }
          </div>
        </div>

        {phase === "wait" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={handleScan} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "16px", padding: "16px", borderRadius: "16px", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(245,166,35,0.35)" }}>
              {localStorage.getItem("yelen224_bio_registered") === "1" ? "Toucher pour s'identifier" : "Enregistrer mon empreinte"}
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: t2, fontSize: "14px", cursor: "pointer", padding: "8px" }}>
              Utiliser le code PIN
            </button>
          </div>
        )}

        {phase === "fail" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button onClick={handleRetry} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer" }}>
              Réessayer
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: t2, fontSize: "14px", cursor: "pointer", padding: "8px" }}>
              Utiliser le code PIN
            </button>
          </div>
        )}

        {phase === "unsupported" && (
          <button onClick={onClose} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "16px", border: "none", cursor: "pointer" }}>
            Continuer sans biométrie
          </button>
        )}

        {(phase === "wait" || phase === "success") && (
          <div style={{ marginTop: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            {Ic.Shield()}
            <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700" }}>
              {phase === "success" ? "YelenID vérifié · Clé publique" : "WebAuthn · Vérifié côté serveur"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL OPT-IN BIOMÉTRIE — Proposé à l'utilisateur une fois
// ============================================================
function BiometrieOptInModal({ onActivate, onIgnore, prenom, isDark, card, t1, t2, brd }: {
  onActivate: () => void; onIgnore: () => void; prenom: string;
  isDark: boolean; card: string; t1: string; t2: string; brd: string;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 8500, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0" }}>
      <div style={{ backgroundColor: card, borderRadius: "28px 28px 0 0", padding: "32px 24px 40px", maxWidth: "480px", width: "100%", border: `1px solid ${brd}`, boxShadow: "0 -20px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ width: "40px", height: "4px", background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)", borderRadius: "2px", margin: "0 auto 28px" }}/>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 20px rgba(245,166,35,0.4)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
              <path d="M8 11a4 4 0 0 0 8 0"/>
              <path d="M12 18v4"/>
              <path d="M4 15.5A9 9 0 0 0 20 15"/>
            </svg>
          </div>
          <div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: "900", marginBottom: "4px" }}>
              Connexion biométrique
            </div>
            <div style={{ color: t2, fontSize: "13px" }}>Empreinte digitale · Face ID</div>
          </div>
        </div>

        <p style={{ color: t2, fontSize: "14px", lineHeight: 1.6, marginBottom: "20px" }}>
          Bonjour <strong style={{ color: t1 }}>{prenom}</strong> ! Activez la connexion par empreinte digitale ou Face ID pour accéder à votre espace instantanément — sans saisir de code.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {[
            { icon: "⚡", text: "Connexion en moins d'une seconde" },
            { icon: "🔐", text: "Données stockées localement sur votre appareil" },
            { icon: "🛡️", text: "Standard WebAuthn — niveau bancaire" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px" }}>
              <span style={{ fontSize: "18px" }}>{f.icon}</span>
              <span style={{ color: t1, fontSize: "13px", fontWeight: "600" }}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={onActivate} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "16px", padding: "16px", borderRadius: "16px", border: "none", cursor: "pointer", boxShadow: "0 6px 20px rgba(245,166,35,0.35)" }}>
            Activer la biométrie
          </button>
          <button onClick={onIgnore} style={{ width: "100%", background: "none", border: `1px solid ${brd}`, color: t2, fontWeight: "600", fontSize: "15px", padding: "14px", borderRadius: "16px", cursor: "pointer" }}>
            Pas maintenant
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CARTE IDENTITÉ — Onglet Compte. Fusion de l'ancienne carte
// Accueil (stats RDV/score présence) et de l'ancienne carte
// identité de l'onglet Compte (Niveau du compte/Membre depuis) —
// refonte visuelle façon Booking.com "My account", 23/07/2026.
// Couleur passée du noir au dégradé de marque : le doré est
// réservé au header + cette carte + CTA primaires, tout le reste
// de l'écran redevient neutre pour ne pas diluer la marque.
// ============================================================
function CarteIdentiteCompte({ userId, userName, userPhone, userPhoto, initials, rdvs, userCreeLe, identiteVerifiee, router }: {
  userId: string | null;
  userName: string;
  userPhone: string;
  userPhoto: string | null;
  initials: string;
  rdvs: RDV[];
  userCreeLe: string | null;
  identiteVerifiee: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const yelenId = userId ? formatYelenId(userId) : "YL-????-????";
  const presenceScore = rdvs.length > 0
    ? Math.min(100, Math.round((rdvs.filter(r => r.presence_status === "present").length / rdvs.length) * 100))
    : 100;
  const scoreColor = presenceScore >= 80 ? "#22c55e" : presenceScore >= 50 ? "#C8740A" : "#ef4444";
  const scoreLabel = presenceScore >= 80 ? "Excellent" : presenceScore >= 50 ? "Bon" : "À améliorer";
  const membreDepuis = userCreeLe
    ? new Date(userCreeLe).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div style={{ margin: "0 -16px 12px", borderRadius: "0 0 20px 20px", overflow: "hidden", background: "#F5A623", boxShadow: "0 3px 10px rgba(0,0,0,0.12)", position: "relative" }}>
      <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "radial-gradient(circle,rgba(0,0,0,0.05) 0%,transparent 70%)", pointerEvents: "none" }}/>

      <div style={{ padding: "14px 18px 16px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontSize: "9px", fontWeight: "800", color: "#080812", letterSpacing: "2px" }}>YELENID</div>
            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#080812", opacity: 0.35 }}/>
            <div style={{ fontSize: "9px", color: "rgba(8,8,18,0.55)", fontWeight: "600", letterSpacing: "1px" }}>PASSEPORT NUMÉRIQUE</div>
          </div>
          <div onClick={() => !identiteVerifiee && router.push("/compte/verification-identite")} style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(0,0,0,0.14)", backdropFilter: "blur(8px)", borderRadius: "20px", padding: "3px 10px", cursor: identiteVerifiee ? "default" : "pointer" }}>
            {identiteVerifiee ? Ic.Shield() : <span style={{ color: "#080812", display: "inline-flex" }}>{Ic.Info()}</span>}
            <span style={{ color: identiteVerifiee ? "#22c55e" : "#080812", fontSize: "10px", fontWeight: "700" }}>{identiteVerifiee ? "VÉRIFIÉ" : "À VÉRIFIER"}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: "50px", height: "50px", borderRadius: "16px", overflow: "hidden", background: "rgba(0,0,0,0.14)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: "#080812" }}>
              {userPhoto ? <img src={userPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : initials}
            </div>
            <div style={{ position: "absolute", bottom: "-3px", right: "-3px", width: "16px", height: "16px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #E8960A" }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#080812", fontSize: "16px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName}</div>
            <div style={{ color: "rgba(8,8,18,0.6)", fontSize: "11.5px", marginBottom: "4px" }}>{userPhone} · Membre depuis {membreDepuis}</div>
            <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#080812", fontWeight: "700", letterSpacing: "1px" }}>{yelenId}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {[
            { label: "RDV Total", value: String(rdvs.length || 0), dot: undefined as string | undefined },
            { label: "Score présence", value: `${presenceScore}%`, dot: scoreColor },
            { label: "Statut", value: scoreLabel, dot: scoreColor },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", borderRadius: "10px", padding: "8px 6px", textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", marginBottom: "3px" }}>
                {s.dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.dot, flexShrink: 0 }}/>}
                <span style={{ color: "#080812", fontSize: "14px", fontWeight: "900", lineHeight: 1 }}>{s.value}</span>
              </div>
              <div style={{ color: "rgba(8,8,18,0.55)", fontSize: "9px", fontWeight: "600" }}>{s.label}</div>
            </div>
          ))}
        </div>

        <Link href="/compte/informations-personnelles" className="tap" style={{ display: "block", textAlign: "center", background: "rgba(0,0,0,0.14)", backdropFilter: "blur(8px)", borderRadius: "12px", padding: "10px", color: "#080812", fontSize: "13px", fontWeight: "800", textDecoration: "none" }}>
          Modifier mon profil
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// QUICK ACTIONS
// ============================================================
function QuickActions({ router, t1, t2, card, brd, isDark }: any) {
  const actions = [
    {
      label: "Prendre un RDV",
      sub: "Trouver une institution",
      href: "/recherche",
      grad: "#fff",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14" strokeWidth="3"/><line x1="12" y1="14" x2="12" y2="14" strokeWidth="3"/><line x1="16" y1="14" x2="16" y2="14" strokeWidth="3"/></svg>,
      hot: true,
    },
    {
      label: "Mon QR Code",
      sub: "Confirmer ma présence",
      href: "/mon-qr",
      grad: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3z"/></svg>,
    },
    {
      label: "Scanner QR",
      sub: "Accueil institution",
      href: "/institution/scanner",
      grad: "linear-gradient(135deg,#22c55e,#15803d)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>,
    },
    {
      label: "Payer une Facture",
      sub: "Eau · Électricité · Mobile",
      href: "/paiement",
      grad: "linear-gradient(135deg,#a855f7,#7c3aed)",
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
      soon: true,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>Actions rapides</div>
        <div style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
          {Ic.TrendUp()} Vos raccourcis
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {actions.map(a => (
          <Link key={a.label} href={a.href} style={{ textDecoration: "none" }}>
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", border: `1px solid ${brd}`, position: "relative", overflow: "hidden" }} className="tap">
              {a.hot && (
                <div style={{ position: "absolute", top: "10px", right: "10px", background: "#ef4444", borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: "800", color: "#fff" }}>POPULAIRE</div>
              )}
              {a.soon && (
                <div style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(168,85,247,0.15)", borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: "800", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)" }}>BIENTÔT</div>
              )}
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: a.grad, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>
                {a.icon}
              </div>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800", marginBottom: "3px", lineHeight: 1.2 }}>{a.label}</div>
              <div style={{ color: t2, fontSize: "11px", fontWeight: "500" }}>{a.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Section "Fil d'activité" retirée (20/07/2026, demande explicite de
// Bryan) — redondante avec les cartes "Prochain rendez-vous"/"En retard"
// de l'onglet RDV et avec /mes-rdv.

// ============================================================
// SUGGESTIONS INTELLIGENTES
// ============================================================
function SuggestionsIntelligentes({ rdvs, insts, userLat, userLng, tendances, t1, t2, t3, card, brd, isDark, router }: any) {
  const suggestions: Array<{ icon: string; titre: string; sous: string; href: string; color: string; tag: string }> = [];

  if (userLat && userLng && insts.length > 0) {
    const proche = insts.find((i: Inst) => i.latitude && i.longitude);
    if (proche) {
      suggestions.push({ icon: "📍", titre: proche.name, sous: "À proximité de vous · Disponible maintenant", href: `/institution/${proche.id}`, color: "#3b82f6", tag: "Près de vous" });
    }
  }

  suggestions.push({ icon: "🪪", titre: "Renouvelez votre CNI", sous: "Évitez les files — réservez en ligne à la mairie", href: "/recherche?categorie=Mairie", color: "#F5A623", tag: "Recommandé" });

  if (rdvs.length > 0) {
    suggestions.push({ icon: "🔁", titre: "Reprendre votre démarche", sous: `Dernier RDV : ${rdvs[0]?.institution_name || "Institution"}`, href: "/mes-rdv", color: "#22c55e", tag: "En cours" });
  }

  // Remplace l'ancienne carte "Certificat de résidence — Très demandé
  // cette semaine" (aucune donnée réelle ne soutenait cette affirmation)
  // par un motif dérivé des vrais RDV du citoyen, avec le même seuil de
  // preuve (≥3 RDV) que "Vos tendances" — voir lib/citoyenTendances.ts.
  // Omise plutôt que remplacée par un contenu générique si la preuve
  // manque : jamais d'affirmation inventée à la place.
  if (tendances?.suffisant && tendances.etablissementTopId && tendances.etablissementTopId !== rdvs[0]?.institution_id) {
    suggestions.push({ icon: "🎯", titre: tendances.etablissementTopNom || "Votre établissement habituel", sous: "Là où vous allez le plus souvent", href: `/institution/${tendances.etablissementTopId}`, color: "#a855f7", tag: "Vos habitudes" });
  }

  if (suggestions.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>Pour vous</div>
        <div style={{ color: t2, fontSize: "11px", fontWeight: "600" }}>Personnalisé</div>
      </div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px", scrollSnapType: "x mandatory" }}>
        {suggestions.map((s, i) => (
          <Link key={i} href={s.href} style={{ textDecoration: "none", flexShrink: 0, scrollSnapAlign: "start" }}>
            <div style={{ width: "220px", backgroundColor: card, borderRadius: "18px", padding: "16px", border: `1px solid ${brd}`, position: "relative", overflow: "hidden" }} className="tap">
              <div style={{ position: "absolute", top: "10px", right: "10px", background: `${s.color}18`, borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: "800", color: s.color, border: `1px solid ${s.color}30` }}>{s.tag}</div>
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>{s.icon}</div>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px", lineHeight: 1.2 }}>{s.titre}</div>
              <div style={{ color: t2, fontSize: "11px", lineHeight: 1.4 }}>{s.sous}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// RAPPELS DÉMARCHES — pointeur depuis l'Accueil vers "Mes démarches"
// (retour CEO 29/07/2026). Toutes les démarches actives du citoyen, en
// scroll horizontal quel que soit leur nombre (jamais de liste verticale
// ici, pour ne pas allonger l'écran) — en retard d'abord, puis échéance
// proche, calcul dans lib/citoyenDemarchesRappels.ts. Section absente si
// aucune démarche en cours (jamais de bloc vide).
// ============================================================
function RappelsDemarches({ rappels, t1, t2, card, brd }: any) {
  if (!rappels || rappels.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px" }}>Vos démarches en cours</div>
        <Link href="/compte/mes-demarches" style={{ color: t2, fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Voir tout</Link>
      </div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px", scrollSnapType: "x mandatory" }}>
        {rappels.map((r: any) => {
          const statutLabel = r.enRetard ? "En retard" : r.echeanceProche ? "Bientôt" : "En cours";
          const statutColor = r.enRetard ? "#ef4444" : r.echeanceProche ? "#3b82f6" : t2;
          const pct = r.etapesTotal > 0 ? Math.round((r.etapesFaites / r.etapesTotal) * 100) : 0;
          return (
            <Link key={r.id} href="/compte/mes-demarches" style={{ textDecoration: "none", flexShrink: 0, scrollSnapAlign: "start" }}>
              <div style={{ width: "196px", backgroundColor: card, borderRadius: "14px", padding: "14px", border: `1px solid ${brd}`, borderLeftWidth: "3px", borderLeftColor: r.enRetard ? "#ef4444" : "#22c55e" }} className="tap">
                <div style={{ color: statutColor, fontSize: "10px", fontWeight: "800", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "8px" }}>{statutLabel}</div>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px", lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.titre}</div>
                <div style={{ color: t2, fontSize: "11px", lineHeight: 1.4, marginBottom: r.etapesTotal > 0 ? "10px" : "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sousTexte}</div>
                {r.etapesTotal > 0 && (
                  <div>
                    <div style={{ height: "4px", borderRadius: "2px", backgroundColor: brd, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: "2px", backgroundColor: "#22c55e" }}/>
                    </div>
                    <div style={{ color: t2, fontSize: "10px", marginTop: "5px" }}>{r.etapesFaites}/{r.etapesTotal} étapes</div>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// HERO SLIDES
// ============================================================
const HERO_SLIDES_GUEST = [
  { titre: "Votre RDV en un clic", sous: "Ne vous déplacez plus au hasard : planifiez, réservez, et gagnez du temps depuis votre mobile.", badge: "🇬🇳 Officiel" },
  { titre: "Guinée numérique", sous: "Les services publics et privés à portée de votre téléphone. Hôpitaux, mairies, banques.", badge: "🏛️ État" },
  { titre: "Réservez en 30 sec", sous: "Fini les queues interminables — prenez rendez-vous depuis chez vous en toute sécurité.", badge: "⚡ Rapide" },
  { titre: "Diaspora Guinea", sous: "La diaspora guinéenne peut aussi accéder à tous les services depuis l'étranger.", badge: "🌍 54 pays" },
];

// Carrousel marketing — uniquement pour les visiteurs non connectés (aucun
// état réel à afficher tant qu'il n'y a pas de compte). Les citoyens
// connectés voient désormais StatusHero ci-dessous, plus le message
// statique qui ne reflétait aucune donnée réelle (retour CEO 23/07/2026 :
// "le Hero ne me retient pas... il devrait répondre à Où en suis-je ?").
function HeroTitre({ prenom }: { prenom: string }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const slides = HERO_SLIDES_GUEST;
  void prenom; // conservé dans la signature pour un futur message d'accroche personnalisé pré-inscription

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(p => (p + 1) % slides.length); setVisible(true); }, 350);
    }, 5500);
    return () => clearInterval(t);
  }, [slides.length]);

  const s = slides[idx];
  return (
    <div style={{ transition: "opacity 0.35s ease, transform 0.35s ease", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.2)", borderRadius: "20px", padding: "4px 12px", marginBottom: "10px", backdropFilter: "blur(8px)" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "rgba(8,8,18,0.9)" }}>{s.badge}</span>
      </div>
      <h1 style={{ color: "#080812", fontSize: "30px", fontWeight: "900", margin: "0 0 8px", lineHeight: 1.1, letterSpacing: "-0.5px" }}>{s.titre}</h1>
      <p style={{ color: "rgba(8,8,18,0.65)", fontSize: "13px", fontWeight: "600", margin: "0 0 20px", lineHeight: 1.5, maxWidth: "300px" }}>{s.sous}</p>
    </div>
  );
}

// ============================================================
// STATUS HERO — état vivant du citoyen (chantier "Hero = cerveau de
// l'app", retour CEO 23/07/2026). Remplace le message d'accueil statique
// par un état déterministe basé sur des données réelles uniquement :
// identité vérifiée (lib/citoyenIdentite + soumission CIN, voir
// /compte/verification-identite) et RDV (en retard/à venir). Zéro score
// chiffré (décision actée du 21/07/2026, /chantier-strategie-retention-v2 :
// jamais de score numérique visible pour un citoyen) — uniquement des
// badges factuels, thème "lumière" repris des mots du CEO lui-même.
function greetingTexte(heure: number): string {
  if (heure < 6) return "Bonne nuit";
  if (heure < 12) return "Bonjour";
  if (heure < 18) return "Bon après-midi";
  return "Bonsoir";
}

// Icône jour/nuit — remplace l'emoji de lib/salutation.ts (gardé tel quel
// pour les textes de notification, où un vrai SVG est impossible) par une
// icône trait, demandé par le CEO le 23/07/2026 ("retire les emojis, crée
// des vraies SVG").
function IconSalutation({ heure }: { heure: number }) {
  const jour = heure >= 6 && heure < 18;
  return jour ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  );
}

function StatusHero({ prenom, nom, sexe, dateStr, identiteVerifiee, rdvEnRetard, prochainRdv, aDejaEuRdv, router }: {
  prenom: string;
  nom: string;
  sexe: string | null;
  dateStr: string;
  identiteVerifiee: boolean;
  rdvEnRetard: RDV | undefined;
  prochainRdv: RDV | undefined;
  aDejaEuRdv: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const heure = new Date().getHours();
  // Salutation formelle (Bryan, 23/07/2026 : "Yelen c'est pour les
  // professionnels, ministres etc., c'est important") — M./Mme + nom de
  // famille quand le genre est renseigné, sinon on retombe sur le prénom
  // seul plutôt que d'inventer un titre (aucune donnée fictive).
  const titre = sexe === "homme" ? "M." : sexe === "femme" ? "Mme" : null;
  const nomAffiche = titre && nom ? `${titre} ${nom}` : prenom;
  const statut: "rouge" | "jaune" | "vert" = rdvEnRetard ? "rouge" : !identiteVerifiee ? "jaune" : "vert";
  const HEADLINE: Record<typeof statut, string> = {
    rouge: "Une action importante est en attente.",
    jaune: "Une zone à éclaircir sur votre compte.",
    vert: "Tout est éclairé aujourd'hui.",
  };

  const badgeStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", borderRadius: "12px", padding: "9px 12px" };

  return (
    <div>
      {/* Date + salutation sur une seule ligne (retour CEO 23/07/2026 :
          réduire la hauteur du Hero) — date en pastille blanche, "Bonsoir"
          en foncé, uniquement le prénom en blanc et gros, icône jour/nuit
          réelle (plus d'emoji). */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        {dateStr && (
          <span style={{ background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", borderRadius: "8px", padding: "3px 9px", color: "#080812", fontSize: "10px", fontWeight: "800", letterSpacing: "0.5px", textTransform: "uppercase" }}>{dateStr}</span>
        )}
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "5px" }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}><IconSalutation heure={heure}/></span>
          <span style={{ color: "#080812", fontSize: "12.5px", fontWeight: "700" }}>{greetingTexte(heure)},</span>
          <span style={{ color: "#fff", fontSize: "20px", fontWeight: "900", letterSpacing: "-0.3px" }}>{nomAffiche}</span>
        </span>
      </div>
      <h1 style={{ color: "#080812", fontSize: "22px", fontWeight: "900", margin: "0 0 14px", lineHeight: 1.25, letterSpacing: "-0.3px", maxWidth: "300px" }}>{HEADLINE[statut]}</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" }}>
        {/* Retiré une fois vérifiée (retour Bryan 25/07/2026) — le Hero
            n'affiche que des actions réelles, pas un statut déjà réglé.
            identite_verifiee passe à true dès la soumission du document
            (auto-vérifié, voir supabase/migrations/
            20260724000013_citoyen_verification_identite.sql), donc ce badge
            disparaît dès que le citoyen a soumis sa pièce. */}
        {!identiteVerifiee && (
          <div onClick={() => router.push("/compte/verification-identite")} style={{ ...badgeStyle, cursor: "pointer" }}>
            <span style={{ color: "#080812" }}>{Ic.Info()}</span>
            <span style={{ color: "#080812", fontSize: "12.5px", fontWeight: "700", flex: 1 }}>Identité à vérifier</span>
            {Ic.Chev()}
          </div>
        )}
        {/* Sans RDV en retard ni RDV à venir, le badge devient un vrai CTA
            vers la recherche générale plutôt qu'un texte mort renvoyant
            vers un espace Mes RDV vide (retour Bryan 29/07/2026) — le Hero
            reste dynamique, jamais un état statique sans action possible.
            Message adapté à l'historique réel du citoyen : un compte qui
            n'a encore jamais pris de RDV (aDejaEuRdv=false) n'a pas la même
            invite qu'un citoyen déjà actif qui n'a simplement plus rien de
            prévu pour l'instant — jamais le même texte générique pour les
            deux, aucune donnée inventée dans les deux cas (juste le vrai
            historique). */}
        <div onClick={() => router.push(rdvEnRetard || prochainRdv ? "/mes-rdv" : "/recherche")} style={{ ...badgeStyle, cursor: "pointer" }}>
          <span style={{ color: "#080812" }}>{Ic.Cal()}</span>
          <span style={{ color: "#080812", fontSize: "12.5px", fontWeight: "700", flex: 1 }}>
            {rdvEnRetard
              ? "Rendez-vous manqué à traiter"
              : prochainRdv
              ? `RDV ${parseDateLocale(prochainRdv.date_rdv).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}${prochainRdv.heure_rdv ? ` · ${prochainRdv.heure_rdv}` : ""}`
              : aDejaEuRdv
              ? "Votre prochaine réservation vous attend"
              : "Faites votre première réservation"}
          </span>
          {!rdvEnRetard && prochainRdv && (
            <span style={{ background: "#ef4444", color: "#fff", fontSize: "9px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>À venir</span>
          )}
          {Ic.Chev()}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PLACEHOLDER ROTATIF — barre de recherche Accueil (retour CEO 23/07/2026)
// ============================================================
const SEARCH_PLACEHOLDERS = [
  "Rechercher une institution",
  "Trouver un professionnel",
  "Planifier un rendez-vous",
  "Hôpitaux, mairies, banques...",
  "Trouver une ambassade",
];

function SearchPlaceholder({ color }: { color: string }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(p => (p + 1) % SEARCH_PLACEHOLDERS.length); setVisible(true); }, 300);
    }, 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ flex: 1, overflow: "hidden" }}>
      <span style={{ display: "inline-block", color, fontSize: "14.5px", transition: "opacity 0.3s ease, transform 0.3s ease", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)" }}>
        {SEARCH_PLACEHOLDERS[idx]}
      </span>
    </div>
  );
}

// ============================================================
// SECTION ABOUT + VIDEO YELEN224
// ============================================================
function AboutYelen({ isDark, t1, t2, brd }: { isDark: boolean; t1: string; t2: string; brd: string }) {
  const [playing, setPlaying] = useState(false);
  const VIDEO_ID = "3pvKVLhRcpo";
  return (
    <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${brd}`, background: isDark ? "#1C1C1E" : "#FFFFFF" }}>
      <div style={{ padding: "18px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
          </div>
          <div>
            <div style={{ fontSize: "9px", fontWeight: "700", color: t2, letterSpacing: "1.2px", textTransform: "uppercase" }}>Toujours à vos côtés</div>
            <div style={{ fontSize: "16px", fontWeight: "900", color: t1, letterSpacing: "-0.3px" }}>YELEN224 — La lumière numérique</div>
          </div>
        </div>
        <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
          {!playing ? (
            <div onClick={() => setPlaying(true)} style={{ position: "relative", width: "100%", height: "100%", cursor: "pointer" }}>
              <img src={`https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg`} alt="YELEN224" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`; }}/>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.5))" }}/>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "62px", height: "62px", borderRadius: "50%", background: "rgba(245,166,35,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(245,166,35,0.25)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#080812" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <iframe src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`} allow="autoplay; encrypted-media" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} title="YELEN224"/>
          )}
        </div>
        <p style={{ fontSize: "12px", color: t2, lineHeight: 1.6, marginTop: "12px", marginBottom: 0 }}>YELEN224 connecte chaque citoyen guinéen aux services publics et privés — hôpitaux, mairies, banques, ambassades — en Guinée et dans la diaspora.</p>
      </div>
    </div>
  );
}

// ============================================================
// POURQUOI YELEN — façon "Why Booking.com?" (retour Bryan 25/07/2026),
// scroll horizontal, cartes façon carrousel. Illustrations originales
// (pas des line-icons Feather comme le dashboard institution — la home
// citoyen utilise déjà des emoji/couleurs ailleurs, ex. CTAPrestataire
// ci-dessous) : petites scènes à deux couleurs, dans la palette Yelen,
// pour un rendu "vraie illustration" plutôt qu'un pictogramme plat.
// Uniquement pour les citoyens connectés — remplace CTAPrestataire dans
// ce cas (un citoyen déjà inscrit n'a pas besoin d'être invité à
// s'inscrire comme institution).
// ============================================================
const POURQUOI_YELEN = [
  {
    titre: "Zéro file d'attente",
    texte: "Réservez votre créneau à l'avance et présentez-vous directement à l'heure prévue.",
    bg: "#FFF4E0",
    illu: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="15" fill="#F5A623"/>
        <path d="M20 12v8l6 4" stroke="#080812" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="20" cy="20" r="17.5" stroke="#F5A623" strokeWidth="1.5" strokeOpacity="0.35"/>
      </svg>
    ),
  },
  {
    titre: "Rappels automatiques",
    texte: "Des notifications avant votre rendez-vous — vous ne l'oublierez pas.",
    bg: "#E8F0FF",
    illu: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M20 8c-5 0-8 4-8 9v5l-2.5 4h21L28 22v-5c0-5-3-9-8-9z" fill="#3B82F6"/>
        <path d="M17 30a3 3 0 0 0 6 0" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round"/>
        <circle cx="27" cy="10" r="3.5" fill="#EF4444"/>
      </svg>
    ),
  },
  {
    titre: "Établissements vérifiés",
    texte: "Chaque badge \"vérifié\" est accordé après contrôle réel des documents.",
    bg: "#E6F9EF",
    illu: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M20 6l11 4v9c0 8-4.5 13.5-11 15-6.5-1.5-11-7-11-15v-9z" fill="#22C55E"/>
        <path d="M14.5 20l4 4 8-8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    titre: "100% gratuit pour vous",
    texte: "Créer un compte et réserver un rendez-vous ne coûte jamais rien sur Yelen.",
    bg: "#F3E8FF",
    illu: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="7" y="14" width="26" height="18" rx="4" fill="#A855F7"/>
        <rect x="7" y="14" width="26" height="6" rx="3" fill="#080812" fillOpacity="0.15"/>
        <circle cx="27" cy="23" r="3" fill="#fff"/>
      </svg>
    ),
  },
  {
    titre: "Tout centralisé",
    texte: "Rendez-vous, documents et QR codes accessibles à tout moment dans un seul espace.",
    bg: "#FFE9E9",
    illu: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M6 14a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#F87171"/>
        <rect x="12" y="18" width="16" height="2.4" rx="1.2" fill="#fff" fillOpacity="0.8"/>
        <rect x="12" y="23" width="10" height="2.4" rx="1.2" fill="#fff" fillOpacity="0.8"/>
      </svg>
    ),
  },
];

function PourquoiYelen({ isDark, t1, t2, card, brd }: { isDark: boolean; t1: string; t2: string; card: string; brd: string }) {
  return (
    <div>
      <div style={{ color: t1, fontSize: "17px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "12px", padding: "0 16px" }}>Pourquoi Yelen ?</div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", padding: "0 16px 4px", scrollSnapType: "x proximity" }}>
        {POURQUOI_YELEN.map(item => (
          <div key={item.titre} style={{ flexShrink: 0, width: "168px", scrollSnapAlign: "start", background: card, border: `1px solid ${brd}`, borderRadius: "18px", padding: "16px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: isDark ? "rgba(255,255,255,0.06)" : item.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
              {item.illu}
            </div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "6px", lineHeight: 1.3 }}>{item.titre}</div>
            <div style={{ color: t2, fontSize: "11.5px", lineHeight: 1.55 }}>{item.texte}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CTA PRESTATAIRE
// ============================================================
function CTAPrestataire({ isDark, t1, t2, brd }: { isDark: boolean; t1: string; t2: string; brd: string }) {
  return (
    <Link href="/institution/inscription" style={{ textDecoration: "none", display: "block" }}>
      <div style={{ borderRadius: "20px", overflow: "hidden", position: "relative", background: "linear-gradient(135deg,#F5A623 0%,#E8960A 60%,#C8740A 100%)", boxShadow: "0 4px 14px rgba(245,166,35,0.15)" }}>
        <div style={{ height: "4px", background: "linear-gradient(90deg,#CE1126 33.3%,#FCD20F 33.3% 66.6%,#009A44 66.6%)" }}/>
        <div style={{ padding: "22px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
            </div>
            <div>
              <div style={{ color: "#080812", fontSize: "17px", fontWeight: "900", marginBottom: "4px" }}>Rejoignez Yelen224</div>
              <div style={{ color: "rgba(8,8,18,0.6)", fontSize: "12px", fontWeight: "600" }}>Plateforme officielle de prise de RDV</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
            {[
              { icon: "🏥", text: "Hôpitaux · Cliniques · Pharmacies" },
              { icon: "🏛️", text: "Mairies · Ministères · Ambassades" },
              { icon: "🏦", text: "Banques · Assurances · ONG" },
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "rgba(0,0,0,0.1)", borderRadius: "12px" }}>
                <span style={{ fontSize: "18px" }}>{a.icon}</span>
                <div style={{ color: "#080812", fontSize: "12px", fontWeight: "700" }}>{a.text}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: "#080812", color: "#F5A623", fontWeight: "800", fontSize: "14px", padding: "15px", borderRadius: "14px" }} className="tap">
            Inscrire mon institution →
          </div>
        </div>
      </div>
    </Link>
  );
}

// NotifPanel déplacé vers components/NotifPanel.tsx (20/07/2026) — un
// fichier de route ("page.tsx") ne peut exporter que des noms réservés
// par Next.js App Router (default, metadata, ...), pas un composant
// arbitraire ; nécessaire pour le partager avec
// app/dashboard/dashboard-client.tsx (header unifié, chantier "Yelen
// Assistant").

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function YelenApp() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const [tab, setTab]               = useState<Tab>("accueil");
  const [carteOpen, setCarteOpen]   = useState(false);
  const [notifOpen, setNotifOpen]   = useState(false);
  const [comptOuvert, setComptOuvert] = useState<Record<string, boolean>>({}); // sections "Mon compte" dépliées
  // Bandeau "identité non vérifiée" (chantier Status Hero, 23/07/2026,
  // décision Bryan) — état local volontairement non persisté : masqué au
  // clic sur le X pour la session en cours, réapparaît naturellement à la
  // prochaine arrivée sur l'écran (remontage du composant, ex. retour d'une
  // autre route) tant que l'identité n'est pas vérifiée.
  const [bandeauIdentiteFerme, setBandeauIdentiteFerme] = useState(false);

  // ── Biométrie ──
  const [bioOptInOpen, setBioOptInOpen] = useState(false);   // modal d'opt-in
  const [bioAuthOpen, setBioAuthOpen]   = useState(false);   // modal d'auth WebAuthn
  const [bioOk, setBioOk]               = useState(false);   // auth réussie
  const [logoutOpen, setLogoutOpen]     = useState(false);   // flux de déconnexion
  const [menuOpen, setMenuOpen]         = useState(false);   // menu engagement (ex-logo Accueil)
  const [rechercheOpen, setRechercheOpen] = useState(false); // hub recherche "Mon Compte" (overlay, pas une route)

  // Onglet "Offres" (26/07/2026) — chargement paresseux au premier accès à
  // l'onglet, pas au montage de la page (pas de coût si le citoyen n'ouvre
  // jamais cet onglet).
  const [offresList, setOffresList]       = useState<Offre[]>([]);
  const [offresLoaded, setOffresLoaded]   = useState(false);
  // Distinct de offresLoaded (mis à true au lancement du fetch, pas à sa
  // résolution) — sans ça, l'état vide illustré s'affichait une fraction
  // de seconde à chaque premier chargement, avant l'arrivée des données
  // (retour Bryan 26/07/2026, analyse conversion : "juste créé un écran").
  const [offresRecues, setOffresRecues]   = useState(false);
  const [offreCatFilter, setOffreCatFilter] = useState("");
  const [offreSearchQuery, setOffreSearchQuery] = useState("");
  const offreSearchRef = useRef<HTMLInputElement>(null);
  const [offrePlaceholderIdx, setOffrePlaceholderIdx] = useState(0);
  // Panneau de recherche Offres (retour Bryan 26/07/2026 : "le clic sur la
  // recherche ouvre un panneau rempli avec des suggestions, consultées
  // récemment, etc.") — visible tant que le champ est vide et focus,
  // disparaît dès qu'une frappe démarre (le feed filtré en direct prend
  // le relais, déjà en place plus bas).
  const [offreRechPanelOuvert, setOffreRechPanelOuvert] = useState(false);
  const [offreRechRecentes, setOffreRechRecentes] = useState<string[]>([]);
  const [offreConsulteesIds, setOffreConsulteesIds] = useState<string[]>([]);

  // Onglet "Communauté" (27/07/2026) — chargement paresseux au premier
  // accès à l'onglet, même convention que Offres. Identité de l'auteur
  // (nom/photo/membre depuis/vérifié) réutilise directement userName/
  // userPhoto/userCreeLe/identiteVerifiee déjà chargés au montage —
  // aucun second fetch de profil nécessaire ici, contrairement à l'ancien
  // écran externe /communaute qui n'y avait pas accès.
  const COMMUNAUTE_PAGE_SIZE = 15;
  const COMMUNAUTE_MAX_IMAGES = 4;
  const [communauteLoaded, setCommunauteLoaded] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postLikes, setPostLikes] = useState<Record<string, { count: number; likedByMoi: boolean }>>({});
  const [postCommentCounts, setPostCommentCounts] = useState<Record<string, number>>({});
  const [postCommentsOuvertId, setPostCommentsOuvertId] = useState<string | null>(null);
  const [postCommentaires, setPostCommentaires] = useState<Record<string, Commentaire[]>>({});
  const [postCommentDraft, setPostCommentDraft] = useState("");
  const [composerOuvert, setComposerOuvert] = useState(false);
  const [composerTexte, setComposerTexte] = useState("");
  const [composerFichiers, setComposerFichiers] = useState<File[]>([]);
  const [composerEnvoi, setComposerEnvoi] = useState(false);
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  // Popup profil auteur (27/07/2026) — un seul composant pour "l'auteur
  // d'un autre post" et "mon propre compte" (estMoi dérivé à l'affichage,
  // jamais un second compte).
  const [profilAuteurPost, setProfilAuteurPost] = useState<Post | null>(null);
  // Catégorie obligatoire à la publication + filtre illustré en haut du
  // fil (retour Bryan 27/07/2026) — même liste des deux côtés
  // (lib/communauteCategories.ts).
  const [composerCategorie, setComposerCategorie] = useState<string | null>(null);
  const [communauteCatFiltre, setCommunauteCatFiltre] = useState<string>("");
  // Signalement d'une publication ou d'un auteur — réutilise la table
  // signalements existante (voir SignalerCommunauteModal.tsx).
  const [signalementCible, setSignalementCible] = useState<{ type: "post" | "auteur"; id: string; label: string } | null>(null);
  const [signalementEnvoye, setSignalementEnvoye] = useState(false);
  // Menu d'aide du header Communauté (FAQ/Contact/Éducation) — retour
  // Bryan 27/07/2026.
  const [communauteAideOuvert, setCommunauteAideOuvert] = useState(false);
  // Statut de mes publications (retour Bryan 27/07/2026) — utilise la
  // policy posts_own_read (auteur_id = auth.uid(), tous statuts), jamais
  // exposé aux autres citoyens.
  const [mesPublications, setMesPublications] = useState<{ id: string; statut: string; contenu: string | null; created_at: string; motif_refus: string | null }[]>([]);
  const [mesPublicationsLoaded, setMesPublicationsLoaded] = useState(false);
  const [mesPublicationsOuvert, setMesPublicationsOuvert] = useState(false);
  const mesPubEnAttente = mesPublications.filter(p => p.statut === "en_attente_validation").length;
  useEffect(() => {
    if (tab !== "offres") return;
    const iv = setInterval(() => setOffrePlaceholderIdx(i => i + 1), 3000);
    return () => clearInterval(iv);
  }, [tab]);
  const [selectedOffre, setSelectedOffre] = useState<Offre | null>(null);
  const [offreVedetteIdx, setOffreVedetteIdx] = useState(0);
  const offreVedetteRef = useRef<HTMLDivElement>(null);
  const [citoyenInterets, setCitoyenInterets] = useState<string[]>([]);
  const [interetsLoaded, setInteretsLoaded] = useState(false);

  const [userId, setUserId]         = useState<string | null>(null);
  const [userName, setUserName]     = useState("");
  const [userPhone, setUserPhone]   = useState("");
  const [userPhoto, setUserPhoto]   = useState<string | null>(null);
  const [userVille, setUserVille]   = useState("");
  const [userCreeLe, setUserCreeLe] = useState<string | null>(null);
  const [userNom, setUserNom]       = useState("");
  const [userSexe, setUserSexe]     = useState<string | null>(null);
  const [identiteVerifiee, setIdentiteVerifiee] = useState(false);
  const [rdvs, setRdvs]             = useState<RDV[]>([]);
  const tendances = useMemo(() => deriverTendancesCitoyen(rdvs.map(r => ({
    institutionId: r.institution_id ?? null,
    institutionNom: r.institution_name ?? null,
    secteur: r.institution_secteur ?? null,
    dateRdv: r.date_rdv,
  }))), [rdvs]);
  const [demarchesEnCours, setDemarchesEnCours] = useState<DemarcheRappel[]>([]);
  const rappelsDemarches = useMemo(() => deriverRappelsDemarches(demarchesEnCours), [demarchesEnCours]);
  // Tuiles "dépenses à venir" ajoutées à "Continuez votre exploration"
  // (retour Bryan 29/07/2026) — une tuile par dépense réellement planifiée
  // (lib/depenses.ts, date_depense future dans citoyen_depenses), jamais une
  // icône générique "Mes dépenses". Retrait indépendant par tuile (X sur
  // l'une n'affecte pas les autres) ; la section entière disparaît quand
  // établissements récents ET dépenses à venir sont tous les deux vides.
  const [depensesAVenir, setDepensesAVenir] = useState<{ id: string; categorie: CategorieDepenseId; montant: number; description: string | null; date_depense: string }[]>([]);
  const [depensesMasquees, setDepensesMasquees] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("yelen224_depenses_evenements_masques");
      setDepensesMasquees(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);
  const depensesTiles = useMemo(() => depensesAVenir
    .filter(d => !depensesMasquees.includes(d.id))
    .map(d => {
      const couleur = COULEUR_CATEGORIE_DEPENSE[d.categorie];
      return {
        key: `depense-${d.id}`,
        href: "/menu/depenses",
        titre: formatGNF(d.montant),
        sousTexte: `${d.description || CATEGORIE_LABEL_DEPENSE[d.categorie]} · ${texteEcheanceCourt(d.date_depense)}`,
        accentColor: couleur,
        icon: (
          <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: `${couleur}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: couleur }}/>
          </div>
        ),
        onDismiss: () => {
          const next = [...depensesMasquees, d.id];
          try { localStorage.setItem("yelen224_depenses_evenements_masques", JSON.stringify(next)); } catch {}
          setDepensesMasquees(next);
        },
      };
    }), [depensesAVenir, depensesMasquees]);
  const [insts, setInsts]           = useState<Inst[]>([]);
  const instsAffiches = useMemo(() => priveligierSecteur(insts, tendances.secteurTop), [insts, tendances.secteurTop]);
  const [mapInsts, setMapInsts]     = useState<Inst[]>([]);
  const [mapLoaded, setMapLoaded]   = useState(false);
  const [msgCount, setMsg]          = useState(0);
  const [stats, setStats]           = useState({ i: 0, c: 0 });
  const [now, setNow]               = useState<Date | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [userLat, setUserLat]       = useState<number | null>(null);
  const [userLng, setUserLng]       = useState<number | null>(null);
  const [ready, setReady]           = useState(false);
  const [scrollPct, setScrollPct]   = useState(0);
  const [scrollThumbH, setScrollThumbH] = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  // Restaure le dernier onglet actif — sans ça, "Retour" depuis un écran
  // ouvert depuis l'onglet Compte (ou Recherche/RDV) revient toujours sur
  // Accueil : ce composant est démonté par la navigation vers /compte/*,
  // le state React `tab` est perdu, et le remontage au retour repart de
  // la valeur par défaut "accueil".
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(YELEN224_LAST_TAB_KEY); } catch {}
    if (saved === "accueil" || saved === "offres" || saved === "rdv" || saved === "communaute" || saved === "compte") {
      setTab(saved);
    }
  }, []);

  // Chargement de l'onglet Offres — uniquement des offres de partenaires
  // validés (jamais d'institutions ni d'annonces institutionnelles sur cet
  // écran, décision CEO 26/07/2026 : Offres ≠ Institutions).
  useEffect(() => {
    if (tab !== "offres" || offresLoaded) return;
    setOffresLoaded(true);
    (async () => {
      const { data: offresData } = await supabase
        .from("offres")
        .select("id,titre,description_courte,description_longue,categorie,genre,partenaire_nom,partenaire_logo,cta_label,cta_url,epingle,date_expiration,nb_clics,faits,avantages,limites,institutions(moyenne_avis,nb_avis)")
        .eq("statut", "publiee")
        .or(`date_expiration.is.null,date_expiration.gt.${new Date().toISOString()}`)
        .order("epingle", { ascending: false })
        .order("ordre", { ascending: true });
      setOffresList((offresData as unknown as Offre[]) || []);
      setOffresRecues(true);
    })();
  }, [tab, offresLoaded]);

  // Personnalisation du feed Offres par centre d'intérêt déclaré
  // (users.centres_interet, /menu/interets) — donnée déjà collectée mais
  // jamais exploitée ici avant ce chantier (retour Bryan 26/07/2026,
  // analyse conversion). Chargée une fois, dès qu'on entre sur Offres OU
  // Communauté (réutilisée par le popup "mon profil" de ce dernier).
  useEffect(() => {
    if ((tab !== "offres" && tab !== "communaute") || interetsLoaded || !userId) return;
    setInteretsLoaded(true);
    (async () => {
      const { data } = await supabase.from("users").select("centres_interet").eq("id", userId).maybeSingle();
      setCitoyenInterets((data?.centres_interet as string[] | null) || []);
    })();
  }, [tab, interetsLoaded, userId]);

  // Rouvre le menu engagement au retour depuis un écran /menu/* — ce
  // composant est démonté par la navigation vers ces routes (menuOpen
  // repart de false au remontage), donc un simple router.back() y
  // renverrait sur l'Accueil normal au lieu du menu d'où l'utilisateur
  // venait. Lecture directe de location.search (pas useSearchParams) pour
  // éviter la contrainte de frontière Suspense au prerendering.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("menu") === "1") {
      setMenuOpen(true);
      router.replace("/", { scroll: false });
    }
  }, []);

  function changeTab(t: Tab) {
    setTab(t);
    try { sessionStorage.setItem(YELEN224_LAST_TAB_KEY, t); } catch {}
  }

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); }, () => {}, { timeout: 5000 });
    }
    // Indicateur de position de scroll — barre verticale sur le bord droit
    // de l'écran (standard iOS/Android natif), remplace l'ancienne ligne
    // horizontale sous le header (retour CEO 23/07/2026 : "les standards
    // internationaux utilisent une ligne verticale à droite"). Visible
    // uniquement pendant le défilement, puis s'estompe après une pause
    // (même comportement que la scrollbar native).
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
      clearInterval(tick);
      window.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, []);

  // Extrait de l'effet de montage pour être rappelable depuis le geste
  // tirer-pour-rafraîchir (retour CEO 23/07/2026) — logique de chargement
  // inchangée, uniquement isolée dans une fonction nommée.
  const loadDashboardData = useCallback(async (id: string | null) => {
    try {
      const [iR, uR] = await Promise.allSettled([
        ft(supabase.from("institutions").select("*", { count: "exact", head: true })),
        ft(supabase.from("users").select("*", { count: "exact", head: true })),
      ]);
      setStats({
        i: iR.status === "fulfilled" && iR.value ? (iR.value as any).count || 0 : 0,
        c: uR.status === "fulfilled" && uR.value ? (uR.value as any).count || 0 : 0,
      });

      const iD = await ft(supabase.from("institutions").select("id,name,category,secteur,ville,quartier,adresse,latitude,longitude,phone,logo,moyenne_avis,nb_avis,badge_verifie,disponibilites").not("name", "is", null).order("created_at", { ascending: false }).limit(20), 6000);
      if (iD && (iD as any).data) {
        const rows = (iD as any).data as Inst[];
        setMapInsts(rows.filter(r => r.latitude && r.longitude));
        if (!id) setInsts(rows.slice(0, 5));
      }
      // Distingue "encore en train de charger" de "chargé mais vide" —
      // avant ce correctif, une carte vide (aucune institution avec
      // latitude/longitude — actuellement TOUJOURS le cas, aucun écran
      // du produit ne permet encore de renseigner ces champs, voir
      // CLAUDE.md) affichait "Chargement..." indéfiniment, signalé par
      // Bryan le 20/07/2026 comme un écran bloqué/blanc.
      setMapLoaded(true);

      if (id) {
        // `name` retiré : colonne inexistante sur `users` (même bug que
        // dashboard-client.tsx, corrigé le 17/07/2026) — la faisait échouer
        // toute la requête, userName restait "" en permanence, donc la carte
        // YelenID et le "Bonjour" affichaient un nom vide/caché.
        // `cree_le` → `created_at` : même classe de bug, colonne renommée
        // en base après l'audit du 07/07/2026, jamais répercutée ici
        // (corrigé le 18/07/2026, diagnostic SQL confirmé par Bryan).
        const uD = await ft(supabase.from("users").select("prenom,nom,phone,photo_url,ville,created_at,identite_verifiee,sexe").eq("id", id).maybeSingle(), 5000);
        if (uD && (uD as any).data) {
          const r = (uD as any).data;
          const p = (r.prenom || "").trim(), n = (r.nom || "").trim();
          setUserName(p ? `${p} ${n}`.trim() : r.phone || "Citoyen");
          setUserNom(n);
          setUserSexe(r.sexe || null);
          setUserPhone(r.phone || "");
          setUserPhoto(r.photo_url || null);
          setUserCreeLe(r.created_at || null);
          setIdentiteVerifiee(!!r.identite_verifiee);
          const villeCitoyen = (r.ville || "").trim();
          setUserVille(villeCitoyen);

          // Établissements "près de vous" — uniquement ceux de la même ville
          // que le citoyen (décision produit du 17/07/2026). Sans ville
          // renseignée, on ne devine rien : le bloc invite à la définir.
          if (villeCitoyen) {
            const vD = await ft(supabase.from("institutions").select("id,name,category,secteur,ville,quartier,adresse,latitude,longitude,phone,logo,moyenne_avis,nb_avis,badge_verifie,disponibilites").eq("ville", villeCitoyen).not("name", "is", null).order("moyenne_avis", { ascending: false }).limit(12), 6000);
            setInsts(vD && (vD as any).data ? (vD as any).data : []);
          } else {
            setInsts([]);
          }
        }

        // Pas de .limit() ici — la carte YelenID (RDV Total / Score de
        // présence) et l'onglet RDV (stats Total/À venir/Terminés)
        // dépendent tous les deux de compter le VRAI total du citoyen ;
        // une limite à 10 faussait ces chiffres pour tout citoyen ayant
        // plus de 10 RDV (signalé par Bryan le 20/07/2026 — "les données
        // étaient cachées", pas un problème de mise en page de la carte).
        const rD = await ft(supabase.from("rdv").select("id,date_rdv,heure_rdv,statut,objet,institution_id,presence,presence_status").eq("citoyen_id", id).order("date_rdv", { ascending: false }), 5000);
        if (rD && (rD as any).data) {
          const rows = (rD as any).data as any[];
          const ids = [...new Set(rows.map((r: any) => r.institution_id).filter(Boolean))];
          let m: Record<string, string> = {};
          let secteurParId: Record<string, string | null> = {};
          if (ids.length) {
            const nD = await ft(supabase.from("institutions").select("id,name,secteur").in("id", ids), 4000);
            if (nD && (nD as any).data) (nD as any).data.forEach((x: any) => { m[x.id] = x.name || "Institution"; secteurParId[x.id] = x.secteur || null; });
          }
          setRdvs(rows.map((r: any) => ({ ...r, institution_name: m[r.institution_id] || "Institution", institution_secteur: secteurParId[r.institution_id] || null })));
        }

        // "Vos démarches en cours" (Accueil) — même requête que
        // app/compte/mes-demarches/mes-demarches-client.tsx (charger()),
        // limitée aux démarches actives, pour proposer des rappels sans
        // dupliquer d'écran ni de logique de calcul de retard.
        try {
          const dD = await ft(supabase.from("citoyen_demarches").select("id,titre,date_cible,institutions(name),etapes:citoyen_demarche_etapes(libelle,date_echeance,fait,ordre)").eq("citoyen_id", id).eq("statut", "en_cours").order("created_at", { ascending: false }).limit(20), 5000);
          const dRows = dD && (dD as any).data ? (dD as any).data as any[] : [];
          setDemarchesEnCours(dRows.map((d: any) => ({
            id: d.id, titre: d.titre, institutionNom: d.institutions?.name ?? null,
            dateCible: d.date_cible ?? null, etapes: d.etapes ?? [],
          })));
        } catch { setDemarchesEnCours([]); }

        // Dépenses planifiées (date future, "Mes dépenses" > Planifier une
        // dépense) — chacune devient sa propre tuile réelle dans "Continuez
        // votre exploration", jamais une icône générique.
        try {
          const todayISO = new Date().toISOString().slice(0, 10);
          const dpD = await ft(supabase.from("citoyen_depenses").select("id,categorie,montant,description,date_depense").eq("citoyen_id", id).gt("date_depense", todayISO).order("date_depense", { ascending: true }).limit(8), 4000);
          setDepensesAVenir(dpD && (dpD as any).data ? (dpD as any).data : []);
        } catch { setDepensesAVenir([]); }

        try {
          const nD = await ft(supabase.from("notifications").select("*", { count: "exact", head: true }).eq("destinataire_id", id).eq("destinataire_type", "citoyen").eq("lu", false), 4000);
          if (nD) setNotifCount((nD as any).count || 0);
        } catch { setNotifCount(0); }
        try {
          const mD = await ft(supabase.from("messages").select("*", { count: "exact", head: true }).eq("destinataire_citoyen_id", id).eq("lu", false), 4000);
          if (mD) setMsg((mD as any).count || 0);
        } catch {}
      }
    } catch (e) { console.error("load error", e); setMapLoaded(true); }
  }, []);

  const handleRefresh = useCallback(async () => {
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    await loadDashboardData(id);
  }, [loadDashboardData]);

  // Pull-to-refresh de l'onglet Offres — même requête que le chargement
  // initial (useEffect ci-dessous), rejouée à la demande sans dépendre du
  // flag offresLoaded (qui ne sert qu'à éviter un double fetch au montage).
  const handleRefreshOffres = useCallback(async () => {
    const { data: offresData } = await supabase
      .from("offres")
      .select("id,titre,description_courte,description_longue,categorie,genre,partenaire_nom,partenaire_logo,cta_label,cta_url,epingle,date_expiration,nb_clics,faits,avantages,limites,institutions(moyenne_avis,nb_avis)")
      .eq("statut", "publiee")
      .or(`date_expiration.is.null,date_expiration.gt.${new Date().toISOString()}`)
      .order("epingle", { ascending: false })
      .order("ordre", { ascending: true });
    setOffresList((offresData as unknown as Offre[]) || []);
  }, []);

  // Ouvre la fiche détail ET enregistre l'offre dans "consultées
  // récemment" (panneau de recherche Offres) — un seul point d'entrée
  // plutôt que dupliquer l'appel localStorage à chaque site d'ouverture.
  const ouvrirOffre = useCallback((o: Offre) => {
    enregistrerOffreConsultee(o.id);
    setSelectedOffre(o);
  }, []);

  // Charge les réactions (likes/commentaires) des posts visibles — jamais
  // un chiffre inventé, dérivé des lignes réelles de post_likes/post_comments.
  const chargerReactionsPosts = useCallback(async (ids: string[], moi: string | null) => {
    if (ids.length === 0) return;
    const { data: likeRows } = await supabase.from("post_likes").select("post_id, citoyen_id").in("post_id", ids);
    const nextLikes: Record<string, { count: number; likedByMoi: boolean }> = {};
    for (const id of ids) nextLikes[id] = { count: 0, likedByMoi: false };
    for (const row of likeRows ?? []) {
      const bucket = nextLikes[row.post_id] ?? { count: 0, likedByMoi: false };
      bucket.count += 1;
      if (moi && row.citoyen_id === moi) bucket.likedByMoi = true;
      nextLikes[row.post_id] = bucket;
    }
    setPostLikes(prev => ({ ...prev, ...nextLikes }));

    const { data: commentRows } = await supabase.from("post_comments").select("post_id").in("post_id", ids);
    const nextCounts: Record<string, number> = {};
    for (const id of ids) nextCounts[id] = 0;
    for (const row of commentRows ?? []) nextCounts[row.post_id] = (nextCounts[row.post_id] ?? 0) + 1;
    setPostCommentCounts(prev => ({ ...prev, ...nextCounts }));
  }, []);

  const chargerFilCommunaute = useCallback(async (depuis: number, moi: string | null, categorieFiltre?: string) => {
    let q = supabase
      .from("posts")
      .select("id, auteur_id, categorie, author_nom, author_photo_url, author_verifie, author_membre_depuis, contenu, images, nb_partages, created_at")
      .eq("statut", "publiee");
    if (categorieFiltre) q = q.eq("categorie", categorieFiltre);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .range(depuis, depuis + COMMUNAUTE_PAGE_SIZE - 1);
    if (error) return [];
    const rows = (data ?? []) as Post[];
    if (rows.length > 0) void chargerReactionsPosts(rows.map(r => r.id), moi);
    return rows;
  }, [chargerReactionsPosts]);

  useEffect(() => {
    if (tab !== "communaute" || communauteLoaded) return;
    setCommunauteLoaded(true);
    (async () => {
      const rows = await chargerFilCommunaute(0, userId, communauteCatFiltre);
      setPosts(rows);
      setPostsHasMore(rows.length === COMMUNAUTE_PAGE_SIZE);
    })();
  }, [tab, communauteLoaded, userId, communauteCatFiltre, chargerFilCommunaute]);

  const rafraichirCommunaute = useCallback(async () => {
    const rows = await chargerFilCommunaute(0, userId, communauteCatFiltre);
    setPosts(rows);
    setPostsHasMore(rows.length === COMMUNAUTE_PAGE_SIZE);
  }, [chargerFilCommunaute, userId, communauteCatFiltre]);

  useEffect(() => {
    if (tab !== "communaute" || mesPublicationsLoaded || !userId) return;
    setMesPublicationsLoaded(true);
    (async () => {
      const { data } = await supabase.from("posts").select("id, statut, contenu, created_at, motif_refus").eq("auteur_id", userId).order("created_at", { ascending: false });
      setMesPublications(data ?? []);
    })();
  }, [tab, mesPublicationsLoaded, userId]);

  // Changer le filtre catégorie recharge le fil depuis le début — le
  // filtre s'applique côté requête (pagination serveur), pas un simple
  // filtre client comme sur Offres.
  function choisirCategorieFiltre(cat: string) {
    const next = communauteCatFiltre === cat ? "" : cat;
    setCommunauteCatFiltre(next);
    setPosts([]);
    setPostsHasMore(true);
    (async () => {
      const rows = await chargerFilCommunaute(0, userId, next);
      setPosts(rows);
      setPostsHasMore(rows.length === COMMUNAUTE_PAGE_SIZE);
    })();
  }

  async function chargerPlusPosts() {
    if (postsLoadingMore || !postsHasMore) return;
    setPostsLoadingMore(true);
    const rows = await chargerFilCommunaute(posts.length, userId, communauteCatFiltre);
    setPosts(prev => [...prev, ...rows]);
    setPostsHasMore(rows.length === COMMUNAUTE_PAGE_SIZE);
    setPostsLoadingMore(false);
  }

  async function togglePostLike(postId: string) {
    if (!userId) return;
    const etat = postLikes[postId] ?? { count: 0, likedByMoi: false };
    setPostLikes(prev => ({ ...prev, [postId]: { count: etat.count + (etat.likedByMoi ? -1 : 1), likedByMoi: !etat.likedByMoi } }));
    if (etat.likedByMoi) {
      const { error } = await supabase.from("post_likes").delete().match({ post_id: postId, citoyen_id: userId });
      if (error) setPostLikes(prev => ({ ...prev, [postId]: etat }));
    } else {
      const { error } = await supabase.from("post_likes").insert({ post_id: postId, citoyen_id: userId });
      if (error) setPostLikes(prev => ({ ...prev, [postId]: etat }));
    }
  }

  async function ouvrirPostCommentaires(postId: string) {
    if (postCommentsOuvertId === postId) { setPostCommentsOuvertId(null); return; }
    setPostCommentsOuvertId(postId);
    setPostCommentDraft("");
    if (!postCommentaires[postId]) {
      const { data } = await supabase.from("post_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
      setPostCommentaires(prev => ({ ...prev, [postId]: (data as Commentaire[]) ?? [] }));
    }
  }

  async function envoyerPostCommentaire(postId: string) {
    const contenu = postCommentDraft.trim();
    if (!contenu || !userId) return;
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, citoyen_id: userId, citoyen_nom: userName || "Membre Yelen", citoyen_photo_url: userPhoto, contenu })
      .select()
      .single();
    if (error) return;
    setPostCommentaires(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), data as Commentaire] }));
    setPostCommentCounts(prev => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
    setPostCommentDraft("");
  }

  async function partagerPost(post: Post) {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: "Yelen Community", text: post.contenu ?? undefined, url });
      else if (navigator.clipboard) await navigator.clipboard.writeText(url);
    } catch { /* partage annulé par l'utilisateur — rien à faire */ }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, nb_partages: p.nb_partages + 1 } : p));
    fetch(`/api/citoyen/posts/${post.id}/partager`, { method: "POST" }).catch(() => {});
  }

  function choisirFichiersPost(fichiers: FileList | null) {
    if (!fichiers) return;
    const nouveaux = Array.from(fichiers).filter(f => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024);
    setComposerFichiers(prev => [...prev, ...nouveaux].slice(0, COMMUNAUTE_MAX_IMAGES));
  }

  async function publierPost() {
    const contenu = composerTexte.trim();
    if ((!contenu && composerFichiers.length === 0) || !composerCategorie) return;
    setComposerEnvoi(true);
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) { setComposerEnvoi(false); return; }

    try {
      const images: string[] = [];
      for (const fichier of composerFichiers) {
        const form = new FormData();
        form.append("accessToken", accessToken);
        form.append("file", fichier);
        const res = await fetch("/api/citoyen/posts/media", { method: "POST", body: form });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.url) throw new Error(j?.error || "Échec de l'envoi d'une image");
        images.push(j.url);
      }
      const res = await fetch("/api/citoyen/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, contenu, images, categorie: composerCategorie }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Échec de la publication");
      setComposerTexte(""); setComposerFichiers([]); setComposerOuvert(false); setComposerCategorie(null);
      if (userId) {
        const { data: mesPubFraiches } = await supabase.from("posts").select("id, statut, contenu, created_at, motif_refus").eq("auteur_id", userId).order("created_at", { ascending: false });
        setMesPublications(mesPubFraiches ?? []);
      }
    } catch {
      // Erreur silencieuse ici volontairement simple (pas de toast dédié
      // sur cet onglet) — le bouton Publier redevient actif, l'utilisateur
      // peut réessayer.
    } finally {
      setComposerEnvoi(false);
    }
  }

  useEffect(() => {
    try {
      const done = localStorage.getItem("yelen224_onboarding_done");
      if (!done) { router.replace("/onboarding"); return; }
    } catch {}
    setReady(true);

    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    setUserId(id);

    if (id) {
      // Chantier "Yelen Assistant" (20/07/2026), Lot D — abonnement push
      // best-effort, une fois par chargement. souscrirePush() réutilise
      // l'abonnement existant s'il y en a déjà un (idempotent), et ne
      // redemande jamais la permission si déjà refusée par le navigateur.
      // Insert direct (RLS push_subs_citoyen_own autorise le citoyen sur sa
      // propre ligne, pas besoin de route serveur ici).
      (async () => {
        const sub = await souscrirePush();
        if (!sub) return;
        await supabase.from("push_subscriptions").upsert({
          destinataire_id: id, destinataire_type: "citoyen",
          endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: sub.userAgent,
        }, { onConflict: "endpoint" });
      })();

      // Logique biométrie opt-in / auth
      const bioRegistered = localStorage.getItem("yelen224_bio_registered") === "1";
      const bioIgnored    = localStorage.getItem("yelen224_bio_ignored") === "1";
      const lastBio       = localStorage.getItem("yelen224_last_bio");
      const bioExpired    = !lastBio || (Date.now() - parseInt(lastBio)) > 30 * 60 * 1000; // 30min

      if (!bioRegistered && !bioIgnored) {
        // Première fois : proposer d'activer
        setBioOptInOpen(true);
      } else if (bioRegistered && bioExpired) {
        // Déjà enregistré, session expirée : s'authentifier
        setBioAuthOpen(true);
      } else {
        // Session encore valide ou biométrie ignorée
        setBioOk(true);
      }
    }

    loadDashboardData(id);
  }, [router, loadDashboardData]);

  if (!ready) return null;

  const initials = userName.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2) || "C";
  const prenom = userName.split(" ")[0] || "Citoyen";
  // rdvs est chargé trié par date_rdv DESCENDANT (loadDashboardData) — un
  // simple .find() y renvoyait donc le RDV valide le plus ÉLOIGNÉ dans le
  // temps (ex. 1 août) plutôt que le plus proche (ex. 30 juillet), tant que
  // les deux passaient le filtre (retour Bryan 29/07/2026, Hero affichait
  // le mauvais "prochain"). Tri ascendant explicite + exclusion des RDV
  // déjà "en retard" aujourd'hui (badge séparé, rdvEnRetard ci-dessous) et
  // des RDV "absent" pour ne garder que de vrais RDV encore à venir.
  const prochainRdv = rdvs
    .filter(r => r.statut !== "annule" && r.statut !== "refuse"
      && !rdvJourneeDejaPassee(r.date_rdv)
      && !rdvEstEnRetard(r.date_rdv, r.heure_rdv || "00:00")
      && !rdvEstAbsent(r.date_rdv, r.statut, r.presence, r.presence_status))
    .sort((a, b) => (a.date_rdv + (a.heure_rdv || "")).localeCompare(b.date_rdv + (b.heure_rdv || "")))[0];
  // RDV "en retard" = date/heure passée, jamais pris en charge (ni annulé ni
  // honoré) — même règle que l'onglet RDV (rdvEnRetard, ligne ~1479), reprise
  // ici pour piloter l'état du Hero (chantier "Status Hero", 23/07/2026).
  // Exclut désormais les RDV déjà marqués "absent" par l'établissement
  // (rdvEstAbsent) — avant ce correctif, le Hero restait bloqué sur
  // "Rendez-vous manqué à traiter" indéfiniment même une fois l'absence
  // actée côté institution (retour Bryan 29/07/2026).
  const rdvEnRetard = rdvs.find(r => r.statut === "en_attente" && r.presence_status !== "present" && rdvEstEnRetard(r.date_rdv, r.heure_rdv || "00:00") && !rdvEstAbsent(r.date_rdv, r.statut, r.presence, r.presence_status));
  const timeStr = now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "––:––:––";
  const dateStr = now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "";

  const catMeta: Record<string, { color: string; bg: string; label: string }> = {
    "Hopital / Clinique":      { color: "#ef4444", bg: "rgba(239,68,68,0.1)",   label: "Santé" },
    "Ecole / Universite":      { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  label: "Éducation" },
    "Mairie / Administration": { color: "#F5A623", bg: "rgba(245,166,35,0.1)",  label: "Admin" },
    "Banque / Microfinance":   { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   label: "Banque" },
    "Pharmacie":               { color: "#a855f7", bg: "rgba(168,85,247,0.1)",  label: "Pharmacie" },
    "Cabinet medical":         { color: "#f97316", bg: "rgba(249,115,22,0.1)",  label: "Médecin" },
    "Tribunal / Justice":      { color: "#f43f5e", bg: "rgba(244,63,94,0.1)",   label: "Justice" },
    "Transport / Logistique":  { color: "#06b6d4", bg: "rgba(6,182,212,0.1)",   label: "Transport" },
    "ONG / Association":       { color: "#14b8a6", bg: "rgba(20,184,166,0.1)",  label: "ONG" },
  };

  // Structure "Mon compte" (décision CEO, 18/07/2026) — 5 sections type
  // Apple ID/Google Account/Uber Account plutôt qu'une liste plate. Les
  // items pointant vers /compte/... sont des écrans neufs volontairement
  // vides pour ce lot (structure d'abord, contenu réel la semaine
  // suivante) ; les autres réutilisent des écrans déjà fonctionnels —
  // aucun écran existant n'a été supprimé, seuls les liens du menu ont
  // été réorganisés.
  const SECTIONS_COMPTE = [
    { titre: "Profil", items: [
      { l: "Informations personnelles", h: "/compte/informations-personnelles", i: Ic.Doc() },
      { l: "Vérification d'identité", h: "/compte/verification-identite",   i: Ic.Shield() },
      { l: "Documents personnels",    h: "/compte/documents-personnels",   i: Ic.Doc() },
      { l: "Carte Yelen",             h: "/compte/carte-yelen",            i: Ic.Pay() },
      { l: "Tableau de bord",         h: "/dashboard",                     i: Ic.Home() },
      { l: "Éducation",               h: "/education",                     i: Ic.Globe() },
      { l: "Langue",                  h: "/compte/langue",                 i: Ic.Globe() },
    ]},
    { titre: "Mon Activité", items: [
      { l: "Activités passées",      h: "/compte/activites",              i: Ic.Clock() },
      { l: "Mes démarches",          h: "/compte/mes-demarches",          i: Ic.Doc() },
      { l: "Mes rendez-vous",         h: "/mes-rdv",                       i: Ic.Cal() },
      { l: "Messagerie",              h: "/messagerie/citoyen",            i: Ic.Msg(false, msgCount) },
      { l: "Mes avis",                h: "/compte/mes-avis",               i: Ic.Star(true) },
      { l: "Mes établissements favoris", h: "/compte/favoris",             i: Ic.Star() },
      { l: "Mes paiements",           h: "/compte/paiements",              i: Ic.Pay() },
      { l: "Mes remboursements",      h: "/compte/remboursements",         i: Ic.Pay() },
      { l: "Mes réservations payantes", h: "/compte/reservations-payantes", i: Ic.QR() },
      { l: "Mes documents",           h: "/compte/documents-telecharges",  i: Ic.Doc() },
      { l: "Historique des connexions", h: "/compte/historique-connexions", i: Ic.Clock() },
    ]},
    { titre: "Aide et support", items: [
      { l: "Centre d'aide",           h: "/compte/aide",                   i: Ic.Info() },
      { l: "FAQ",                     h: "/faq",                           i: Ic.Info() },
      { l: "Contacter Yelen",         h: "/contact",                       i: Ic.Globe() },
      { l: "Signaler un problème",    h: "/signalement",                   i: Ic.Info() },
      { l: "État des services",       h: "/compte/etat-services",          i: Ic.Check() },
      { l: "Suggestions",             h: "/compte/suggestions",            i: Ic.Info() },
      { l: "Tutoriels",               h: "/compte/tutoriels",              i: Ic.Info() },
    ]},
    { titre: "Mentions légales", items: [
      { l: "Conditions d'utilisation", h: "/cgu",                          i: Ic.Info() },
      { l: "Politique de confidentialité", h: "/confidentialite",          i: Ic.Lock() },
      { l: "À propos de Yelen",       h: "/compte/a-propos",               i: Ic.Info() },
      { l: "Version",                 h: "/compte/version",                i: Ic.Info() },
      { l: "Gestion des consentements", h: "/compte/consentements",        i: Ic.Check() },
      { l: "Licences",                h: "/compte/licences",               i: Ic.Doc() },
    ]},
  ];

  // 5 actions les plus utilisées, à plat (pas groupées par section) —
  // seules celles-là restent visibles sans clic en haut de l'onglet
  // Compte (retour direct de Bryan le 18/07/2026 : le menu par section
  // devenait trop long avec 29 écrans au total). Chaque section
  // ci-dessus reste repliée (nom + flèche uniquement) et se déplie
  // entièrement au clic — ces items y restent aussi, pas de suppression.
  const ACTIONS_RAPIDES_COMPTE = [
    { l: "Mes rendez-vous", h: "/mes-rdv",             i: Ic.Cal() },
    { l: "Mon QR Code",     h: "/mon-qr",               i: Ic.QR() },
    { l: "Messagerie",      h: "/messagerie/citoyen",   i: Ic.Msg(false, msgCount) },
    { l: "Dashboard",       h: "/dashboard",             i: Ic.Home() },
    { l: "Paramètres",      h: "/compte/parametres",   i: Ic.Settings() },
  ];

  // Plus de minHeight:100svh forcé (retour Bryan 29/07/2026) — sur un écran
  // au contenu court (invité non connecté, etc.), ce minimum étirait ce
  // conteneur jusqu'au bas du viewport et laissait un grand espace vide
  // (fond de page) entre la fin du vrai contenu et le menu fixe du bas. Le
  // conteneur épouse désormais sa hauteur réelle ; le menu du bas reste
  // ancré au viewport (position:fixed), indépendant de cette hauteur. Sans
  // impact sur les écrans à contenu long (RDV, Offres...) dont le contenu
  // dépassait déjà 100svh.
  return (
    <div style={{ backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif", color: t1, overflowX: "hidden", paddingBottom: "calc(84px + env(safe-area-inset-bottom))" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{max-width:100vw;background:${bg};-webkit-text-size-adjust:100%}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideLeft{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes notifIn{from{opacity:0;transform:translateY(-10px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes pingRing{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.5);opacity:0}}
        @keyframes shimmer{0%{opacity:0.4}50%{opacity:1}100%{opacity:0.4}}
        @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        .scr{animation:fadeUp 0.25s ease}
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        a,.tap,button{-webkit-tap-highlight-color:transparent !important}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        .map-wrap *{pointer-events:auto !important}
        .map-wrap{pointer-events:auto !important}
      `}</style>

      {/* ── OPT-IN BIOMÉTRIE — Proposé à l'utilisateur, non bloquant ── */}
      {bioOptInOpen && userId && (
        <BiometrieOptInModal
          prenom={prenom}
          isDark={isDark} card={card} t1={t1} t2={t2} brd={brd}
          onActivate={() => {
            setBioOptInOpen(false);
            setBioAuthOpen(true); // Lancer l'enregistrement WebAuthn
          }}
          onIgnore={() => {
            try { localStorage.setItem("yelen224_bio_ignored", "1"); } catch {}
            setBioOptInOpen(false);
            setBioOk(true);
          }}
        />
      )}

      {/* ── AUTH BIOMÉTRIE — WebAuthn réel ── */}
      {bioAuthOpen && userId && (
        <>
          <style>{`@keyframes pingRing { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }`}</style>
          <BiometrieModal
            prenom={prenom}
            isDark={isDark} card={card} t1={t1} t2={t2} brd={brd}
            userId={userId}
            onSuccess={() => {
              try { localStorage.setItem("yelen224_last_bio", String(Date.now())); } catch {}
              setBioOk(true);
              setBioAuthOpen(false);
            }}
            onClose={() => {
              // L'utilisateur préfère le PIN — laisser passer
              setBioOk(true);
              setBioAuthOpen(false);
            }}
          />
        </>
      )}

      {logoutOpen && (
        <LogoutFlow
          onClose={() => setLogoutOpen(false)}
          redirectTo="/login?logged_out=1"
          copy={CITOYEN_LOGOUT_COPY}
        />
      )}

      {menuOpen && <CitoyenMenu isDark={isDark} onClose={() => setMenuOpen(false)} onOpenCompte={() => { setMenuOpen(false); changeTab("compte"); }} userId={userId} userName={userName} userPhoto={userPhoto} initials={initials} identiteVerifiee={identiteVerifiee} />}

      {notifOpen && <NotifPanel onClose={() => { setNotifOpen(false); setNotifCount(0); }} isDark={isDark} bg={bg} t1={t1} t2={t2} t3={t3} card={card} card2={card2} brd={brd} userId={userId} userName={userName}/>}

      {profilAuteurPost && (
        <ProfilAuteurOverlay
          post={profilAuteurPost}
          estMoi={profilAuteurPost.auteur_id === userId}
          citoyenInterets={citoyenInterets}
          isDark={isDark} bg={bg} card={card} card2={card2} t1={t1} t2={t2} t3={t3} brd={brd}
          onClose={() => setProfilAuteurPost(null)}
        />
      )}
      {signalementCible && (
        <SignalerCommunauteModal
          cible={signalementCible}
          citoyenId={userId}
          isDark={isDark} card={card} t1={t1} t2={t2} brd={brd}
          onClose={() => setSignalementCible(null)}
          onEnvoye={() => { setSignalementCible(null); setSignalementEnvoye(true); setTimeout(() => setSignalementEnvoye(false), 3000); }}
        />
      )}
      {signalementEnvoye && (
        <div style={{ position: "fixed", bottom: "calc(90px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", background: "#1C1C1E", color: "#fff", padding: "12px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, zIndex: 2000, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", textAlign: "center" }}>
          Signalement envoyé — merci.
        </div>
      )}

      {mesPublicationsOuvert && (
        <MesPublicationsOverlay
          publications={mesPublications}
          bg={bg} card={card} card2={card2} t1={t1} t2={t2} t3={t3} brd={brd}
          onClose={() => setMesPublicationsOuvert(false)}
        />
      )}

      {composerOuvert && (
        <CreerPostOverlay
          userName={userName} userPhoto={userPhoto}
          texte={composerTexte} setTexte={setComposerTexte}
          fichiers={composerFichiers} setFichiers={setComposerFichiers}
          categorie={composerCategorie} setCategorie={setComposerCategorie}
          envoi={composerEnvoi}
          fileInputRef={composerFileInputRef}
          onChoisirFichiers={choisirFichiersPost}
          onPublier={publierPost}
          onFermer={() => { setComposerOuvert(false); setComposerTexte(""); setComposerFichiers([]); setComposerCategorie(null); }}
          isDark={isDark} bg={bg} card={card} card2={card2} t1={t1} t2={t2} brd={brd}
        />
      )}

      {rechercheOpen && <CompteRechercheOverlay onClose={() => setRechercheOpen(false)}/>}

      {/* ══════════════════════════════════════════════════════
          HEADER — un seul et même bandeau doré fixe pour les 4 onglets
          (Accueil/Recherche/RDV/Compte), façon Booking : jamais transparent,
          jamais masqué au scroll, toujours peint derrière la barre de statut
          (paddingTop safe-area). Unifié le 22/07/2026 — l'ancien header
          Accueil (transparent sur le hero, masqué au scroll) donnait
          l'impression que "tout l'écran bougeait" au lieu d'un bandeau fixe
          type app native, contrairement aux 3 autres onglets qui utilisaient
          déjà ce bandeau plein. Accueil garde le logo seul (pas de titre),
          les 3 autres gardent leur titre — même fond partout.
      ══════════════════════════════════════════════════════ */}
      {(() => {
        // Fond uni sur Accueil/Compte (retour CEO 23/07/2026) — le hero et
        // la carte identité juste en dessous ont chacun leur propre dégradé
        // recalculé sur leur propre hauteur ; répéter ce même dégradé sur
        // le header (hauteur bien plus petite) donnait une couleur
        // différente pile à la jonction, visible comme une ligne. Une
        // couleur unie correspondant au tout début du dégradé (#F5A623,
        // le stop à 0%) se raccorde sans coupure — le header ne redevient
        // perceptible comme bandeau distinct que lorsque le bloc du dessous
        // défile sous lui.
        // Header Communauté entièrement neutre (retour Bryan 27/07/2026 :
        // "retire complètement le header Yelen [doré], fond blanc") —
        // seul onglet avec les autres Offres à sortir du dégradé doré par
        // défaut.
        const hBg     = tab === "communaute" ? (isDark ? bg : "#fff") : isDark ? bg : (tab === "accueil" || tab === "compte") ? "#F5A623" : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
        const hText   = tab === "communaute" ? t1 : isDark ? t1 : "#080812";
        // Chip translucide neutre au lieu d'un fond doré plein — retour CEO
        // 23/07/2026 : "le doré partout cache l'image de marque", à réserver
        // aux CTA et à l'état actif, façon DoorDash. Même traitement que les
        // pastilles heure/ville du hero (rgba(0,0,0,0.15)).
        const hChip   = isDark ? card2 : "rgba(0,0,0,0.14)";
        const hIcon   = isDark ? hText : "#fff";
        const hBrd    = isDark ? brd : "rgba(255,255,255,0.18)";
        const hShadow = isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)";
        return (
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, paddingTop: "env(safe-area-inset-top)", background: hBg, borderBottom: isDark ? `1px solid ${brd}` : "none" }}>
          <div style={{ padding: tab === "accueil" ? "10px 18px" : "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {tab === "offres" ? (
              // Header dédié à l'onglet Offres (retour CEO 26/07/2026) —
              // aucune icône, uniquement une barre de recherche pleine
              // largeur sur fond blanc, filtre les offres par titre/nom de
              // partenaire (offreSearchQuery, voir calcul offresFiltrees).
              (() => {
                // Suggestions réelles (jamais inventées) : catégories et
                // partenaires effectivement présents dans les offres
                // chargées — l'espace réservé tourne toutes les 3s
                // (n'apparaît de toute façon que si le champ est vide).
                const suggestionsBase = Array.from(new Set([
                  ...offresList.map(o => OFFRE_CAT_LABELS[o.categorie] || o.categorie),
                  ...offresList.map(o => o.partenaire_nom),
                ]));
                const placeholder = suggestionsBase.length > 0
                  ? `Essayez "${suggestionsBase[offrePlaceholderIdx % suggestionsBase.length]}"…`
                  : "Rechercher une offre, un partenaire…";
                function ouvrirRecherche() {
                  setOffreRechRecentes(lireOffreRecherchesRecentes());
                  setOffreConsulteesIds(lireOffresConsulteesIds());
                  setOffreRechPanelOuvert(true);
                }
                return (
                <div style={{ position: "relative", flex: 1 }}>
                  <style>{`
                    @keyframes offreSparklePulse { 0%,100% { transform: translateY(-50%) scale(1); } 50% { transform: translateY(-50%) scale(1.12); } }
                    @keyframes offreSparkleGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(245,166,35,0.35); } 50% { box-shadow: 0 0 0 6px rgba(245,166,35,0); } }
                    @keyframes offreSparkleShimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
                    @media (prefers-reduced-motion: reduce) { .offre-sparkle-btn { animation: none !important; } }
                  `}</style>
                  {/* Bouton, pas un input : ouvre systématiquement le
                      panneau plein écran (retour Bryan 26/07/2026 — le
                      dropdown précédent "gate l'expérience"), la vraie
                      saisie vit dans ce panneau, même convention que
                      CompteRechercheOverlay/OffreFicheOverlay.
                      Icône EN TANT QU'ENFANT FLEX du bouton (pas un span
                      positionné en absolu à côté avec un padding calculé à
                      la main) — l'ancienne version se chevauchait avec le
                      texte sur certains rendus de <button> natif (retour
                      Bryan : "icônes et texte mélangés"), un flex row est
                      structurellement impossible à faire chevaucher. */}
                  <button
                    onClick={ouvrirRecherche}
                    className="tap"
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      width: "100%", margin: 0,
                      padding: "11px 40px 11px 14px", background: "#fff", border: "none", borderRadius: "14px",
                      fontFamily: "inherit", fontSize: "14px", lineHeight: "normal",
                      textAlign: "left", cursor: "pointer",
                      appearance: "none", WebkitAppearance: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.3" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <span style={{ color: offreSearchQuery ? "#080812" : "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {offreSearchQuery || placeholder}
                    </span>
                  </button>
                  {offreSearchQuery ? (
                    <button
                      onClick={() => setOffreSearchQuery("")}
                      aria-label="Effacer la recherche"
                      className="tap"
                      style={{
                        position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                        width: "26px", height: "26px", borderRadius: "50%", border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812",
                        boxShadow: "0 2px 6px rgba(245,166,35,0.35)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  ) : (
                    // Étincelle animée façon Gemini — invite au tap sur la
                    // recherche, purement une affordance visuelle, aucune
                    // fonctionnalité IA derrière.
                    <button
                      onClick={ouvrirRecherche}
                      aria-label="Rechercher"
                      className="offre-sparkle-btn tap"
                      style={{
                        position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                        width: "26px", height: "26px", borderRadius: "50%", border: "none", cursor: "pointer",
                        background: "linear-gradient(90deg,#F5A623,#2563EB,#9333EA,#F5A623)",
                        backgroundSize: "300% 100%",
                        animation: "offreSparklePulse 2.2s ease-in-out infinite, offreSparkleGlow 2.2s ease-in-out infinite, offreSparkleShimmer 3s linear infinite",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
                    </button>
                  )}
                </div>
                );
              })()
            ) : tab === "accueil" ? (
              // Menu engagement (ex-logo) — retour CEO 25/07/2026 : le logo
              // seul n'incitait à rien, ce bouton ouvre désormais le menu
              // Calculatrice/Leçons d'argent/Vos tendances/Parrainage/
              // Nouveautés (components/CitoyenMenu.tsx), conçu pour donner
              // des raisons d'ouvrir Yelen en dehors d'un RDV.
              <button onClick={() => setMenuOpen(true)} className="tap" style={{ width: "50px", height: "50px", flexShrink: 0, background: "none", border: "none", padding: 0, margin: 0, display: "flex", alignItems: "center", justifyContent: "flex-start", cursor: "pointer", color: hText }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/>
                </svg>
              </button>
            ) : (
              <div style={{ color: hText, fontSize: "16px", fontWeight: "800", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tab === "rdv" ? "Mes réservations" : tab === "communaute" ? "Communauté" : (prenom || "Mon compte")}
              </div>
            )}
            {tab !== "offres" && tab !== "communaute" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "10px" }}>
                {/* Hub de recherche "Mon Compte" (overlay, 26/07/2026) —
                    accessible depuis les 4 onglets, pas seulement Compte. */}
                <button onClick={() => setRechercheOpen(true)} className="tap" style={{ width: tab === "accueil" ? "38px" : "36px", height: tab === "accueil" ? "38px" : "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hIcon }}>
                  {Ic.Search()}
                </button>
                <button onClick={() => { setNotifOpen(o => !o); if (!notifOpen) setNotifCount(0); }} className="tap" style={{ position: "relative", width: tab === "accueil" ? "38px" : "36px", height: tab === "accueil" ? "38px" : "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hIcon }}>
                  {Ic.Bell(notifCount > 0, notifCount || undefined)}
                </button>
                {tab !== "accueil" && (
                  <Link href="/faq" className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", color: hIcon, textDecoration: "none", flexShrink: 0 }}>
                    {Ic.Headset()}
                  </Link>
                )}
                <button onClick={() => router.push("/messagerie/citoyen")} className="tap" style={{ width: tab === "accueil" ? "38px" : "36px", height: tab === "accueil" ? "38px" : "36px", borderRadius: "50%", background: hChip, border: `1px solid ${hBrd}`, boxShadow: hShadow, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: hIcon }}>
                  {Ic.Msg(false, msgCount || undefined)}
                </button>
              </div>
            )}
            {tab === "communaute" && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "10px" }}>
                {/* Statut de mes publications (retour Bryan 27/07/2026) —
                    visible seulement si j'ai au moins une publication en
                    attente/refusée, sinon aucun encombrement inutile. */}
                {mesPubEnAttente > 0 && (
                  <button
                    onClick={() => setMesPublicationsOuvert(true)}
                    className="tap"
                    style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "20px", padding: "7px 12px", cursor: "pointer" }}
                  >
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F5A623", flexShrink: 0 }} />
                    <span style={{ color: "#C8740A", fontSize: "12px", fontWeight: 800, whiteSpace: "nowrap" }}>{mesPubEnAttente} en attente</span>
                  </button>
                )}
                {/* "⋮" — FAQ/Contact/Éducation, agrandi et en couleur foncée
                    (retour Bryan 27/07/2026 : le vert n'était pas assez
                    visible), remplace la rangée d'icônes standard. */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setCommunauteAideOuvert(o => !o)}
                    aria-label="Aide"
                    className="tap"
                    style={{ width: "42px", height: "42px", borderRadius: "50%", background: isDark ? card2 : "#1C1C1E", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="12" cy="19" r="1.9" /></svg>
                  </button>
                  {communauteAideOuvert && (
                    <>
                      <div onClick={() => setCommunauteAideOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                      <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100, background: card, border: `1px solid ${brd}`, borderRadius: "14px", boxShadow: "0 12px 32px rgba(0,0,0,0.2)", padding: "6px", minWidth: "190px" }}>
                        {[
                          { label: "FAQ", href: "/faq" },
                          { label: "Contact", href: "/contact" },
                          { label: "Éducation financière", href: "/menu/lecons-argent" },
                        ].map(item => (
                          <Link key={item.href} href={item.href} onClick={() => setCommunauteAideOuvert(false)} className="tap" style={{ display: "block", padding: "10px 12px", borderRadius: "9px", color: t1, fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>
        );
      })()}

      {/* Indicateur de position de scroll — barre verticale sur le bord
          droit de l'écran, façon scrollbar native iOS/Android (retour CEO
          23/07/2026 : standard international, remplace l'ancienne ligne
          horizontale sous le header). Indépendante du header/nav
          (position:fixed), estompée hors défilement. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 76px)",
          bottom: "calc(env(safe-area-inset-bottom) + 74px)",
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

      {/* ===================================================== */}
      {/* TAB ACCUEIL */}
      {/* ===================================================== */}
      {tab === "accueil" && (
        <PullToRefresh onRefresh={handleRefresh} isDark={isDark}>
        <div className="scr">
          {/* HERO — le contenu (date/titre/badges) est en flux normal avec un
              paddingTop réservant la hauteur du header fixe (logo+icônes+
              safe-area), au lieu d'un ancrage bottom:0 : garantit qu'aucun
              texte ne peut jamais se retrouver caché sous le header, quelle
              que soit la longueur du message qui tourne (signalé par le CEO
              le 23/07/2026 — le header opaque masquait la date sur certains
              messages). Le bloc grandit avec le contenu (minHeight en
              plancher) au lieu d'une hauteur fixe. */}
          <div style={{ position: "relative", minHeight: "300px", background: "#F5A623", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "260px", height: "260px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }}/>
            <div style={{ position: "absolute", bottom: "-40px", left: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(0,0,0,0.06)", pointerEvents: "none" }}/>

            <div style={{ paddingTop: "calc(78px + env(safe-area-inset-top))", paddingLeft: "20px", paddingRight: "20px", paddingBottom: "24px" }}>
              {userId ? (
                <StatusHero prenom={prenom} nom={userNom} sexe={userSexe} dateStr={now ? dateStr : ""} identiteVerifiee={identiteVerifiee} rdvEnRetard={rdvEnRetard} prochainRdv={prochainRdv} aDejaEuRdv={rdvs.length > 0} router={router}/>
              ) : (
                <>
                  <div style={{ color: "rgba(8,8,18,0.5)", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", marginBottom: "8px", textTransform: "uppercase" }}>{now ? dateStr : "Chargement..."}</div>
                  <HeroTitre prenom={prenom}/>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <div style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(8px)", borderRadius: "20px", padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span style={{ color: "#080812", fontSize: "13px", fontWeight: "800", fontVariantNumeric: "tabular-nums" }}>{now ? timeStr : "––:––:––"}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Link href="/inscription" style={{ background: "#080812", color: "#F5A623", fontWeight: "800", fontSize: "13px", padding: "9px 18px", borderRadius: "20px", textDecoration: "none" }}>S'inscrire</Link>
                      <Link href="/login" style={{ background: "rgba(0,0,0,0.15)", color: "#080812", fontWeight: "700", fontSize: "13px", padding: "9px 16px", borderRadius: "20px", textDecoration: "none" }}>Connexion</Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Établissements récemment consultés — avant la barre de
              recherche (retour Bryan 25/07/2026), pour proposer la reprise
              avant même une nouvelle recherche. Rendu conditionnel interne
              (retourne null si aucun historique, sans laisser d'espace vide). */}
          <InstitutionsRecentesSection isDark={isDark} t1={t1} t2={t2} card={card} brd={brd} extraTiles={depensesTiles}/>

          {/* BARRE RECHERCHE — refonte "app-like" (retour CEO 23/07/2026) :
              plus de bordure façon champ de formulaire, une seule surface
              blanche flottante (élévation par ombre uniquement), hauteur et
              rayon fixes façon Stripe, éléments secondaires (icône, bouton
              rond) en gris neutre pour que le champ se lise comme une
              action unique plutôt qu'un assemblage de plusieurs zones. */}
          <div style={{ padding: "14px 16px 0" }}>
            <Link href="/recherche" className="tap" style={{ textDecoration: "none", display: "block" }}>
              <div style={{ background: isDark ? "#1C1C1E" : "#fff", borderRadius: "20px", height: "56px", padding: "0 14px", display: "flex", alignItems: "center", gap: "12px", boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 4px 16px rgba(0,0,0,0.08)" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: card2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: t2 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </div>
                <SearchPlaceholder color={t2}/>
                <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: card2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: t2 }}>{Ic.Chev()}</div>
              </div>
            </Link>
          </div>

          <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: "22px" }}>

            {userId && (
              <>
                <QuickActions router={router} t1={t1} t2={t2} card={card} brd={brd} isDark={isDark}/>
                <RappelsDemarches rappels={rappelsDemarches} t1={t1} t2={t2} card={card} brd={brd}/>
                <SuggestionsIntelligentes rdvs={rdvs} insts={insts} userLat={userLat} userLng={userLng} tendances={tendances} t1={t1} t2={t2} t3={t3} card={card} brd={brd} isDark={isDark} router={router}/>
              </>
            )}

            {/* STATS */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {[{ v: stats.i || "...", l: "Institutions", c: "#F5A623" }, { v: stats.c || "...", l: "Citoyens", c: "#34C759" }, { v: "54+", l: "Pays", c: "#007AFF" }].map(s => (
                <div key={s.l} style={{ backgroundColor: card, borderRadius: "14px", padding: "14px 10px", textAlign: "center", border: `1px solid ${brd}` }}>
                  <div style={{ color: s.c, fontSize: "19px", fontWeight: "900", letterSpacing: "-0.5px", lineHeight: 1 }}>{s.v}</div>
                  <div style={{ color: t2, fontSize: "11px", marginTop: "4px", fontWeight: "500" }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* SERVICES */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ color: t1, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px" }}>Services</span>
                <Link href="/recherche" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Tout voir</Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Santé",      href: "/recherche?categorie=Hopital",  grad: "linear-gradient(135deg,#FF6B6B,#FF3B30)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg> },
                  { label: "Éducation", href: "/recherche?categorie=Ecole",    grad: "linear-gradient(135deg,#4A90E2,#007AFF)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3L2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><path d="M2 13l10 6 10-6"/></svg> },
                  { label: "Admin.",    href: "/recherche?categorie=Mairie",   grad: "linear-gradient(135deg,#F5A623,#C8940A)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg> },
                  { label: "Banque",    href: "/recherche?categorie=Banque",   grad: "linear-gradient(135deg,#34C759,#27A84A)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> },
                  { label: "Ambassades",href: "/ambassades",                    grad: "linear-gradient(135deg,#8B5CF6,#6D28D9)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
                  { label: "Justice",   href: "/recherche?categorie=Tribunal",  grad: "linear-gradient(135deg,#FF9500,#E07800)", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> },
                ].map(cat => (
                  <Link key={cat.label} href={cat.href} className="tap" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: cat.grad, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>{cat.icon}</div>
                    <span style={{ color: t1, fontSize: "11px", fontWeight: "700", textAlign: "center", lineHeight: 1.2 }}>{cat.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* BANNIÈRE VALEUR (non connecté) */}
            {!userId && (
              <div style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", border: `1px solid ${brd}` }}>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ color: t1, fontSize: "18px", fontWeight: "900", marginBottom: "6px" }}>Yelen224 — Votre temps est précieux</div>
                  <div style={{ color: t2, fontSize: "13px" }}>La plateforme officielle de la Guinée numérique</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { icon: "⚡", titre: "Gagnez du temps", sous: "Fini les files d'attente. Vos démarches depuis votre mobile." },
                    { icon: "🔗", titre: "Tout centralisé", sous: "Un seul compte pour accéder à des centaines de services." },
                    { icon: "🔐", titre: "100% Sécurisé", sous: "Vos données sont protégées. Chiffrement AES-256 bancaire." },
                  ].map(v => (
                    <div key={v.titre} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px", backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: "12px" }}>
                      <span style={{ fontSize: "24px" }}>{v.icon}</span>
                      <div>
                        <div style={{ color: t1, fontSize: "14px", fontWeight: "700", marginBottom: "2px" }}>{v.titre}</div>
                        <div style={{ color: t2, fontSize: "12px" }}>{v.sous}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                  <Link href="/inscription" style={{ flex: 1, display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "15px", padding: "15px", borderRadius: "14px", textDecoration: "none", textAlign: "center" }}>Créer mon compte</Link>
                  <Link href="/login" style={{ flex: 1, display: "block", backgroundColor: card2, color: t1, fontWeight: "600", fontSize: "15px", padding: "15px", borderRadius: "14px", textDecoration: "none", textAlign: "center", border: `1px solid ${brd}` }}>Se connecter</Link>
                </div>
              </div>
            )}

            {/* CARTE */}
            <div style={{ margin: "0 -16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "3px", height: "18px", background: "#F5A623", borderRadius: "2px" }}/>
                  <div style={{ color: t1, fontSize: "17px", fontWeight: "800", letterSpacing: "-0.3px" }}>Carte des prestataires</div>
                </div>
                <button onClick={() => setCarteOpen(true)} style={{ display: "flex", alignItems: "center", gap: "5px", color: "#F5A623", fontSize: "13px", fontWeight: "700", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", cursor: "pointer", padding: "6px 12px", borderRadius: "20px" }} className="tap">
                  {Ic.Expand()} Agrandir
                </button>
              </div>
              <div className="map-wrap" style={{ height: "240px", position: "relative", zIndex: 0, isolation: "isolate" }}>
                {mapInsts.length > 0 ? <CarteMapHome institutions={mapInsts as any}/> : (
                  <div style={{ height: "100%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "8px", padding: "16px", textAlign: "center" }}>
                    {Ic.Map()}
                    <span style={{ color: t3, fontSize: "13px" }}>{mapLoaded ? "Aucun établissement localisé sur la carte pour l'instant." : "Chargement de la carte..."}</span>
                  </div>
                )}
                <button onClick={e => { e.stopPropagation(); setCarteOpen(true); }} style={{ position: "absolute", bottom: "10px", right: "10px", backgroundColor: isDark ? "rgba(10,10,15,0.88)" : "rgba(255,255,255,0.92)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "20px", padding: "7px 14px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "#F5A623", fontSize: "12px", fontWeight: "700", backdropFilter: "blur(8px)", zIndex: 10 }} className="tap">
                  {Ic.Expand()} Plein écran
                </button>
              </div>
            </div>

            {/* ÉTABLISSEMENTS PRÈS DE VOUS */}
            {(userId ? true : insts.length > 0) && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ color: t1, fontSize: "17px", fontWeight: "800", letterSpacing: "-0.3px" }}>Établissements près de vous</div>
                  <Link href="/recherche" style={{ color: "#F5A623", fontSize: "13px", fontWeight: "700", textDecoration: "none" }}>Voir tout</Link>
                </div>

                {userId && !userVille ? (
                  <div style={{ backgroundColor: card, borderRadius: "20px", padding: "28px 20px", textAlign: "center", border: `1px solid ${brd}` }}>
                    <div style={{ color: "#F5A623", display: "flex", justifyContent: "center", marginBottom: "10px" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Ajoutez votre ville</div>
                    <div style={{ color: t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>Renseignez votre ville pour découvrir les établissements disponibles près de chez vous.</div>
                    <button onClick={() => router.push("/profil")} className="tap" style={{ background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                      Choisir ma ville
                    </button>
                  </div>
                ) : userId && userVille && insts.length === 0 ? (
                  <div style={{ backgroundColor: card, borderRadius: "20px", padding: "28px 20px", textAlign: "center", border: `1px solid ${brd}` }}>
                    <div style={{ color: "#F5A623", display: "flex", justifyContent: "center", marginBottom: "10px" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg></div>
                    <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Pas encore d'établissement à {userVille}</div>
                    <div style={{ color: t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>Yelen224 arrive progressivement dans toutes les préfectures. Aidez-nous à le faire connaître autour de vous.</div>
                    <button onClick={handleShareYelen} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>
                      Partager Yelen224
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "12px", overflowX: "auto", margin: "0 -16px", padding: "2px 16px 8px" }}>
                    {instsAffiches.map(inst => {
                      const cm = catMeta[inst.category || ""] || { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", label: inst.category || "Autre" };
                      const initials = inst.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
                      return (
                        <Link key={inst.id} href={`/institution/${inst.id}`} className="tap" style={{ textDecoration: "none", flex: "0 0 auto", width: "168px" }}>
                          <div style={{ backgroundColor: card, borderRadius: "18px", border: `1px solid ${brd}`, overflow: "hidden" }}>
                            <div style={{ height: "108px", position: "relative", background: `linear-gradient(135deg,${cm.color}33,${cm.color}0d)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {inst.logo
                                ? <img src={inst.logo} alt={inst.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                                : <span style={{ color: cm.color, fontSize: "30px", fontWeight: "900" }}>{initials || "?"}</span>}
                              {inst.badge_verifie && (
                                <span style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(34,197,94,0.9)", color: "#fff", fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>✓</span>
                              )}
                            </div>
                            <div style={{ padding: "10px 12px 12px" }}>
                              <div style={{ color: t1, fontSize: "13px", fontWeight: "800", letterSpacing: "-0.1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst.name}</div>
                              <div style={{ color: t3, fontSize: "10.5px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cm.label}{inst.ville ? ` · ${inst.ville}` : ""}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "7px" }}>
                                <span style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700" }}>⭐ {(inst.moyenne_avis || 0).toFixed(1)}</span>
                                <span style={{ color: t3, fontSize: "10px" }}>({inst.nb_avis || 0} avis)</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Invisible pour un citoyen déjà connecté (retour Bryan
                25/07/2026) — inutile d'inviter à s'inscrire quelqu'un déjà
                inscrit. À la place : "Pourquoi Yelen ?", façon "Why
                Booking.com?". */}
            {userId ? (
              <PourquoiYelen isDark={isDark} t1={t1} t2={t2} card={card} brd={brd}/>
            ) : (
              <CTAPrestataire isDark={isDark} t1={t1} t2={t2} brd={brd}/>
            )}
            <AboutYelen isDark={isDark} t1={t1} t2={t2} brd={brd}/>

            {/* FOOTER — déplacé depuis la fiche institution (chantier
                "Conditions & Informations" 24/07/2026), à la place du bloc
                "STORE BUTTONS" (badges App Store/Google Play non
                fonctionnels, "Bientôt sur mobile" — retirés). */}
            <div style={{ padding: "16px", backgroundColor: card, borderRadius: "16px", border: `1px solid ${brd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", gap: "1px" }}>
                  <div style={{ width: "14px", height: "9px", backgroundColor: "#CE1126", borderRadius: "2px 0 0 2px" }}/>
                  <div style={{ width: "14px", height: "9px", backgroundColor: "#FCD20F" }}/>
                  <div style={{ width: "14px", height: "9px", backgroundColor: "#009A44", borderRadius: "0 2px 2px 0" }}/>
                </div>
                <span style={{ color: t3, fontSize: "10px", marginLeft: "8px", fontWeight: "700" }}>YELEN224 · République de Guinée</span>
              </div>
              <div style={{ textAlign: "center", marginBottom: "10px" }}>
                <a href="https://sempya224.com" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <span style={{ backgroundColor: "#FE2C55", color: "#fff", fontSize: "10px", fontWeight: "800", padding: "3px 10px", borderRadius: "7px", letterSpacing: "0.5px" }}>SEMPYA224</span>
                </a>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
                <Link href="/cgu" style={{ color: t3, fontSize: "11px", textDecoration: "none" }}>CGU</Link>
                <Link href="/confidentialite" style={{ color: t3, fontSize: "11px", textDecoration: "none" }}>Confidentialité</Link>
                <Link href="/contact" style={{ color: t3, fontSize: "11px", textDecoration: "none" }}>Contact</Link>
              </div>
            </div>

            <div style={{ height: "8px" }}/>
          </div>
        </div>
        </PullToRefresh>
      )}

      {/* ===================================================== */}
      {/* TAB OFFRES — programme de partenariat Yelen (chantier 26/07/2026,
          décision CEO). Uniquement des offres de partenaires validés,
          JAMAIS d'institutions ni d'annonces institutionnelles sur cet
          écran (Offres ≠ Institutions). Design volontairement plus premium
          que les autres onglets — écran stratégique pour attirer des
          entreprises partenaires, référence MoneyLion (cartes pleine
          couleur par marque). ===== */}
      {/* ===================================================== */}
      {tab === "offres" && (() => {
        const offresCats = Array.from(new Set(offresList.map(o => o.categorie)));
        const q = offreSearchQuery.trim().toLowerCase();
        const offresFiltrees = offresList
          .filter(o => !offreCatFilter || o.categorie === offreCatFilter)
          .filter(o => !q || o.titre.toLowerCase().includes(q) || o.partenaire_nom.toLowerCase().includes(q));
        // Structuration façon feed (retour CEO 26/07/2026) : les offres les
        // plus consultées (nb_clics réel, épinglées départagées en premier)
        // en tête, limitées à 5, ligne horizontale. Le reste alterne 3
        // offres verticales / 5 horizontales jusqu'à épuisement — jamais un
        // classement inventé, uniquement nb_clics + epingle déjà en base.
        const populaires = [...offresFiltrees]
          .sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (b.nb_clics || 0) - (a.nb_clics || 0))
          .slice(0, 5);
        const populairesIds = new Set(populaires.map(o => o.id));
        // Personnalisation par centre d'intérêt déclaré (retour Bryan
        // 26/07/2026, analyse conversion) : les offres dont la catégorie
        // correspond à un intérêt du citoyen remontent en premier dans le
        // reste du feed — jamais dans "Offres populaires" au-dessus, qui
        // reste une preuve sociale honnête basée sur nb_clics réel, pas
        // une recommandation personnalisée.
        const correspondInteret = (o: Offre) => (OFFRE_CATEGORIE_VERS_INTERETS[o.categorie] || []).some(id => citoyenInterets.includes(id));
        const reste = offresFiltrees
          .filter(o => !populairesIds.has(o.id))
          .slice()
          .sort((a, b) => (correspondInteret(b) ? 1 : 0) - (correspondInteret(a) ? 1 : 0));
        const groupes: { type: "h" | "v"; items: typeof reste }[] = [];
        { let i = 0, horizontal = false;
          while (i < reste.length) {
            const taille = horizontal ? 5 : 3;
            groupes.push({ type: horizontal ? "h" : "v", items: reste.slice(i, i + taille) });
            i += taille; horizontal = !horizontal;
          }
        }
        return (
        <PullToRefresh onRefresh={handleRefreshOffres} isDark={isDark}>
        <div className="scr" style={{ padding: "calc(76px + env(safe-area-inset-top)) 16px 0" }}>

          {/* En-tête premium — distingue visuellement cet onglet du reste de l'app */}
          <div style={{ marginBottom: "18px" }}>
            <h1 style={{ color: t1, fontSize: "22px", fontWeight: 900, margin: "0 0 4px", letterSpacing: "-0.4px" }}>Offres Yelen</h1>
            <p style={{ color: t2, fontSize: "13px", margin: 0 }}>Avantages exclusifs de nos partenaires vérifiés.</p>
          </div>

          {/* Chips catégories — dérivées des offres publiées, jamais une liste codée en dur */}
          {offresCats.length > 0 && (
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px", marginBottom: "20px" }}>
              <button onClick={() => setOffreCatFilter("")} className="tap" style={{ padding: "7px 14px", borderRadius: "20px", border: "none", flexShrink: 0, background: !offreCatFilter ? "linear-gradient(135deg,#F5A623,#C8940A)" : card, color: !offreCatFilter ? "#080812" : t2, fontSize: "12px", fontWeight: !offreCatFilter ? 800 : 600, cursor: "pointer" }}>
                Tout
              </button>
              {offresCats.map(c => (
                <button key={c} onClick={() => setOffreCatFilter(offreCatFilter === c ? "" : c)} className="tap" style={{ padding: "7px 14px", borderRadius: "20px", border: "none", flexShrink: 0, background: offreCatFilter === c ? "linear-gradient(135deg,#F5A623,#C8940A)" : card, color: offreCatFilter === c ? "#080812" : t2, fontSize: "12px", fontWeight: offreCatFilter === c ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {OFFRE_CAT_LABELS[c] || c}
                </button>
              ))}
            </div>
          )}

          {/* Bandeau Yelen Rewards — reprend le langage visuel propriétaire
              "Yelen = lumière" déjà établi sur /menu/recompenses (noyau +
              rayons, doré en clair, neutre sombre en dark — jamais de fond
              noir dédié), plutôt qu'inventer une palette promo à part.
              Aucun chiffre de solde affiché ici (cet écran ne charge pas
              les données de récompenses) : copie honnête, sans statistique
              inventée. */}
          <Link
            href="/menu/recompenses"
            className="tap offre-reward-bandeau"
            style={{
              display: "flex", alignItems: "center", gap: "12px", position: "relative", overflow: "hidden",
              borderRadius: "16px", padding: "12px 14px", marginBottom: "20px", textDecoration: "none",
              background: isDark ? "linear-gradient(135deg,#2B2560,#17171C)" : "linear-gradient(135deg,#FFE9BE,#F5A623)",
              boxShadow: isDark ? "0 6px 16px rgba(0,0,0,0.3)" : "0 6px 16px rgba(245,166,35,0.22)",
            }}
          >
            <style>{`
              @keyframes offreRewardShimmer { from { transform: translateX(-130%) skewX(-12deg); } to { transform: translateX(230%) skewX(-12deg); } }
              @keyframes offreRewardBadgePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
              @keyframes offreRewardChevron { 0%,100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
              .offre-reward-bandeau .offre-reward-shine { animation: offreRewardShimmer 2s ease-in-out infinite; }
              .offre-reward-bandeau .offre-reward-badge { animation: offreRewardBadgePulse 1.8s ease-in-out infinite; }
              .offre-reward-bandeau .offre-reward-chev { animation: offreRewardChevron 1.1s ease-in-out infinite; }
              @media (prefers-reduced-motion: reduce) {
                .offre-reward-bandeau .offre-reward-shine, .offre-reward-bandeau .offre-reward-badge,
                .offre-reward-bandeau .offre-reward-chev { animation: none !important; }
              }
            `}</style>

            <div className="offre-reward-shine" style={{ position: "absolute", top: 0, left: 0, width: "35%", height: "100%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)", pointerEvents: "none" }} />

            <div className="offre-reward-badge" style={{ width: "38px", height: "38px", borderRadius: "11px", flexShrink: 0, position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "rgba(245,166,35,0.18)" : "rgba(255,255,255,0.55)" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill={isDark ? "#F5A623" : "#5C3D00"}><path d="M12 3c.8 4.4 2.8 6.4 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.6 6.2-2.6 7-7z" /></svg>
            </div>

            <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
              <div style={{ color: isDark ? "#fff" : "#1C1300", fontSize: "13.5px", fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Yelen Rewards
              </div>
              <div style={{ color: isDark ? "rgba(255,255,255,0.7)" : "rgba(28,19,0,0.65)", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Des récompenses réelles à débloquer
              </div>
            </div>

            <div className="offre-reward-chev" style={{ width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "rgba(245,166,35,0.18)" : "rgba(8,8,18,0.1)", color: isDark ? "#FFC65C" : "#5C3D00" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </div>
          </Link>

          {!offresRecues ? (
            <YelenLoaderEcran label="Chargement des offres…" />
          ) : offresFiltrees.length === 0 ? (
            (() => {
              const filtreActif = !!q || !!offreCatFilter;
              return (
                <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "40px 24px", textAlign: "center", marginBottom: "24px", animation: "fadeUp 0.3s ease" }}>
                  <svg width="88" height="88" viewBox="0 0 88 88" fill="none" style={{ margin: "0 auto 18px" }}>
                    <circle cx="44" cy="44" r="44" fill={isDark ? "rgba(245,166,35,0.08)" : "rgba(245,166,35,0.08)"} />
                    {filtreActif ? (
                      <>
                        <circle cx="38" cy="38" r="16" stroke="#F5A623" strokeWidth="3.5" fill="none" />
                        <line x1="49" y1="49" x2="61" y2="61" stroke="#F5A623" strokeWidth="3.5" strokeLinecap="round" />
                        <line x1="32" y1="38" x2="44" y2="38" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" />
                      </>
                    ) : (
                      <>
                        <rect x="26" y="30" width="36" height="26" rx="6" stroke="#F5A623" strokeWidth="3.5" fill="none" />
                        <path d="M26 38h36" stroke="#F5A623" strokeWidth="3.5" />
                        <circle cx="44" cy="47" r="4.5" stroke="#F5A623" strokeWidth="3" fill="none" />
                      </>
                    )}
                  </svg>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>
                    {filtreActif ? "Aucune offre trouvée" : "Aucune offre partenaire pour le moment"}
                  </div>
                  <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.6, marginBottom: filtreActif ? "18px" : 0, maxWidth: "260px", marginLeft: "auto", marginRight: "auto" }}>
                    {filtreActif
                      ? "Essayez un autre mot-clé ou changez de catégorie."
                      : "Nos établissements partenaires n'ont pas encore publié d'offre. Revenez bientôt."}
                  </div>
                  {filtreActif && (
                    <button
                      onClick={() => { setOffreSearchQuery(""); setOffreCatFilter(""); }}
                      className="tap"
                      style={{ marginTop: "18px", padding: "10px 22px", background: "linear-gradient(135deg,#F5A623,#C8940A)", borderRadius: "12px", border: "none", color: "#080812", fontWeight: 800, fontSize: "13px", cursor: "pointer" }}
                    >
                      Voir toutes les offres
                    </button>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              {populaires.length > 0 && (
                <div style={{ marginBottom: "28px" }}>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: 900, marginBottom: "10px" }}>Offres populaires</div>
                  <div
                    ref={offreVedetteRef}
                    onScroll={e => {
                      const el = e.currentTarget;
                      const cardW = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 12 : 1;
                      setOffreVedetteIdx(Math.round(el.scrollLeft / cardW));
                    }}
                    style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "6px", scrollSnapType: "x mandatory" }}
                  >
                    {populaires.map((o, i) => (
                      <OffreTuile key={o.id} offre={o} onOpen={() => ouvrirOffre(o)} variant="populaire"
                        card={card} t1={t1} t2={t2} t3={t3} brd={brd} isDark={isDark} style={i}/>
                    ))}
                  </div>
                  {populaires.length > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "10px" }}>
                      {populaires.map((_, i) => (
                        <div key={i} style={{
                          width: i === offreVedetteIdx ? "16px" : "6px", height: "6px", borderRadius: "3px",
                          background: i === offreVedetteIdx ? "#F5A623" : brd, transition: "all 0.2s ease",
                        }}/>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {groupes.map((g, gi) => {
                // Mélange des bandeaux promo entre les groupes d'offres (un
                // par groupe, tant qu'il en reste) — certains embarqués dans
                // la ligne horizontale, d'autres posés après un groupe
                // vertical, jamais tous au même endroit (retour Bryan
                // 26/07/2026). Le carrousel de fin d'écran, lui, reste fixe
                // et affiche toujours les 4.
                const bandeau = gi < PROMO_BANDEAUX.length ? PROMO_BANDEAUX[gi] : null;
                return (
                  <div key={gi} style={{ marginBottom: "24px" }}>
                    {g.type === "h" ? (
                      <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "6px" }}>
                        {g.items.map((o, i) => (
                          <OffreTuile key={o.id} offre={o} onOpen={() => ouvrirOffre(o)} variant="horizontale"
                            card={card} t1={t1} t2={t2} t3={t3} brd={brd} isDark={isDark} style={i}/>
                        ))}
                        {bandeau && (
                          <div style={{ width: "82vw", maxWidth: "320px", flexShrink: 0 }}>
                            <PromoBandeauDepuisSpec spec={bandeau} isDark={isDark} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                          {g.items.map((o, i) => (
                            <OffreTuile key={o.id} offre={o} onOpen={() => ouvrirOffre(o)}
                              card={card} t1={t1} t2={t2} t3={t3} brd={brd} isDark={isDark} style={i}/>
                          ))}
                        </div>
                        {bandeau && (
                          <div style={{ marginTop: "14px" }}>
                            <PromoBandeauDepuisSpec spec={bandeau} isDark={isDark} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Bandeaux promo de fin d'écran — carrousel horizontal FIXE (les
              4, toujours dans cet ordre), indépendant du mélange déjà
              inséré entre les groupes d'offres ci-dessus (retour Bryan
              26/07/2026 : "en gardant celle en fin d'écran fixe"). */}
          <div style={{ marginTop: "8px" }}>
            <div style={{ color: t2, fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>
              À découvrir aussi sur Yelen
            </div>
            <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "6px", scrollSnapType: "x mandatory" }}>
              {PROMO_BANDEAUX.map(spec => (
                <div key={spec.href} style={{ width: "82vw", maxWidth: "320px", flexShrink: 0, scrollSnapAlign: "start" }}>
                  <PromoBandeauDepuisSpec spec={spec} isDark={isDark} />
                </div>
              ))}
            </div>
          </div>

          {selectedOffre && (
            <OffreFicheOverlay
              offre={selectedOffre}
              onClose={() => setSelectedOffre(null)}
              isDark={isDark} bg={bg} card={card} card2={card2} t1={t1} t2={t2} t3={t3} brd={brd}
              populaire={[...offresList].sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (b.nb_clics || 0) - (a.nb_clics || 0)).slice(0, 5).some(o => o.id === selectedOffre.id)}
            />
          )}

          {/* Panneau de recherche plein écran — même convention que
              CompteRechercheOverlay/OffreFicheOverlay (header + X), pas un
              dropdown qui "gate l'expérience" (retour Bryan 26/07/2026).
              Résultats affichés en lignes horizontales façon recherche
              musicale (pochette/logo + titre + partenaire), dès qu'une
              frappe trouve une correspondance réelle. */}
          {offreRechPanelOuvert && (() => {
            const suggestionsPanel = Array.from(new Set([
              ...offresList.map(o => OFFRE_CAT_LABELS[o.categorie] || o.categorie),
              ...offresList.map(o => o.partenaire_nom),
            ])).slice(0, 8);
            const offresConsultees = offreConsulteesIds
              .map(id => offresList.find(o => o.id === id))
              .filter((o): o is Offre => !!o);
            const qPanel = offreSearchQuery.trim().toLowerCase();
            const resultats = qPanel
              ? offresList.filter(o => o.titre.toLowerCase().includes(qPanel) || o.partenaire_nom.toLowerCase().includes(qPanel))
              : [];
            function choisirRecherche(q: string) {
              setOffreSearchQuery(q);
              enregistrerOffreRechercheRecente(q);
            }
            function choisirResultat(o: Offre) {
              enregistrerOffreRechercheRecente(offreSearchQuery);
              ouvrirOffre(o);
              setOffreRechPanelOuvert(false);
            }
            return (
              <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
                <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
                  <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
                    <span />
                    <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Recherche</div>
                    <button
                      onClick={() => setOffreRechPanelOuvert(false)}
                      className="tap"
                      aria-label="Fermer"
                      style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </header>

                <main style={{ flex: 1, overflowY: "auto", padding: "16px 20px", width: "100%", maxWidth: "640px", margin: "0 auto", boxSizing: "border-box" }}>
                  <div style={{ position: "relative", marginBottom: "20px" }}>
                    <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3, display: "flex", pointerEvents: "none" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                    </span>
                    <input
                      ref={offreSearchRef}
                      autoFocus
                      value={offreSearchQuery}
                      onChange={e => setOffreSearchQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && offreSearchQuery.trim()) enregistrerOffreRechercheRecente(offreSearchQuery); }}
                      placeholder="Rechercher une offre, un partenaire…"
                      style={{ width: "100%", padding: "13px 16px 13px 42px", background: card, border: `1px solid ${brd}`, borderRadius: "14px", fontSize: "15px", color: t1, outline: "none", boxSizing: "border-box" }}
                    />
                    {offreSearchQuery && (
                      <button
                        onClick={() => { setOffreSearchQuery(""); offreSearchRef.current?.focus(); }}
                        aria-label="Effacer la recherche"
                        className="tap"
                        style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", borderRadius: "50%", border: "none", cursor: "pointer", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>

                  {qPanel ? (
                    resultats.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {resultats.map(o => (
                          <button
                            key={o.id}
                            onClick={() => choisirResultat(o)}
                            className="tap"
                            style={{ display: "flex", alignItems: "center", gap: "12px", background: "none", border: "none", padding: "8px 4px", cursor: "pointer", textAlign: "left", width: "100%" }}
                          >
                            <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, overflow: "hidden", background: offreGradient(o.partenaire_nom), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                              {o.partenaire_logo ? (
                                <img src={o.partenaire_logo} alt={o.partenaire_nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <span style={{ color: "#fff", fontWeight: 900, fontSize: "14px" }}>{o.partenaire_nom.slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: t1, fontSize: "14px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.titre}</div>
                              <div style={{ color: t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.partenaire_nom}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "40px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                          <IllustrationRechercheVide isDark={isDark} />
                        </div>
                        <div style={{ color: t1, fontSize: "13px", fontWeight: 800, marginBottom: "3px" }}>Aucun résultat</div>
                        <div style={{ color: t2, fontSize: "11.5px" }}>Essayez un autre mot-clé ou partenaire.</div>
                      </div>
                    )
                  ) : (
                    <>
                      {offreRechRecentes.length === 0 && offresConsultees.length === 0 && suggestionsPanel.length === 0 && (
                        <div style={{ textAlign: "center", padding: "40px 10px" }}>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                            <IllustrationRechercheVide isDark={isDark} />
                          </div>
                          <div style={{ color: t1, fontSize: "13px", fontWeight: 800, marginBottom: "3px" }}>Recherchez une offre</div>
                          <div style={{ color: t2, fontSize: "11.5px" }}>Par titre, partenaire ou catégorie.</div>
                        </div>
                      )}

                      {offreRechRecentes.length > 0 && (
                        <div style={{ marginBottom: "20px" }}>
                          <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Recherches récentes</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {offreRechRecentes.map(rq => (
                              <div key={rq} style={{ display: "flex", alignItems: "center", gap: "6px", background: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "7px 7px 7px 14px" }}>
                                <button onClick={() => choisirRecherche(rq)} className="tap" style={{ background: "none", border: "none", color: t1, fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: 0 }}>{rq}</button>
                                <button
                                  onClick={() => setOffreRechRecentes(retirerOffreRechercheRecente(rq))}
                                  aria-label="Retirer"
                                  className="tap"
                                  style={{ width: "20px", height: "20px", borderRadius: "50%", border: "none", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {offresConsultees.length > 0 && (
                        <div style={{ marginBottom: "20px" }}>
                          <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Consultées récemment</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {offresConsultees.map(o => (
                              <button
                                key={o.id}
                                onClick={() => choisirResultat(o)}
                                className="tap"
                                style={{ display: "flex", alignItems: "center", gap: "12px", background: "none", border: "none", padding: "8px 4px", cursor: "pointer", textAlign: "left", width: "100%" }}
                              >
                                <div style={{ width: "40px", height: "40px", borderRadius: "11px", flexShrink: 0, overflow: "hidden", background: offreGradient(o.partenaire_nom), display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {o.partenaire_logo ? (
                                    <img src={o.partenaire_logo} alt={o.partenaire_nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : (
                                    <span style={{ color: "#fff", fontWeight: 900, fontSize: "12px" }}>{o.partenaire_nom.slice(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ color: t1, fontSize: "13.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.titre}</div>
                                  <div style={{ color: t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.partenaire_nom}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {suggestionsPanel.length > 0 && (
                        <div>
                          <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "10px" }}>Suggestions</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {suggestionsPanel.map(s => (
                              <button key={s} onClick={() => choisirRecherche(s)} className="tap" style={{ background: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "7px 14px", color: t1, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </main>
              </div>
            );
          })()}
        </div>
        </PullToRefresh>
        );
      })()}

      {/* ===================================================== */}
      {/* TAB RDV */}
      {/* ===================================================== */}
      {tab === "rdv" && (() => {
        // !rdvJourneeDejaPassee : même filtre que app/mes-rdv/page.tsx::rdvsAvenir
        // — sans cette exclusion, un RDV ancien jamais traité par
        // l'établissement pouvait s'afficher comme "Prochain rendez-vous" à
        // la place du vrai prochain (retour Bryan 29/07/2026).
        const rdvAVenir = rdvs.filter(r => (r.statut === "en_attente" || r.statut === "confirme") && !rdvJourneeDejaPassee(r.date_rdv));
        const rdvTermines = rdvs.filter(r => r.statut === "termine");
        const rdvAVenirTries = [...rdvAVenir].sort((a, b) => (a.date_rdv + (a.heure_rdv || "")).localeCompare(b.date_rdv + (b.heure_rdv || "")));
        // Mis en avant explicite du prochain RDV et du RDV en retard (2
        // cartes distinctes, avec infos complètes) — demandé par Bryan le
        // 20/07/2026, cet écran est le plus visité côté citoyen.
        const rdvEnRetard = rdvAVenirTries.find(r => r.statut === "en_attente" && r.presence_status !== "present" && rdvEstEnRetard(r.date_rdv, r.heure_rdv || "00:00") && !rdvEstAbsent(r.date_rdv, r.statut, r.presence, r.presence_status));
        // !rdvEstEnRetard(...) en plus de l'exclusion de rdvEnRetard (retour
        // Bryan 29/07/2026) — un RDV du jour dont l'heure précise est déjà
        // passée (ex. 10:30 alors qu'il est 19h) ne doit jamais devenir
        // "prochain" juste parce qu'il n'a pas été détecté "en retard" (ex.
        // presence_status déjà "present" mais statut pas encore mis à jour
        // côté établissement) — rdvJourneeDejaPassee() ne suffit pas seule,
        // elle n'exclut que les jours entièrement passés.
        const prochain = rdvAVenirTries.find(r => r.id !== rdvEnRetard?.id && !rdvEstEnRetard(r.date_rdv, r.heure_rdv || "00:00"));
        return (
        <div className="scr" style={{ padding: "calc(76px + env(safe-area-inset-top)) 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "16px" }}>
            <Link href="/recherche" style={{ width: "36px", height: "36px", backgroundColor: "#F5A623", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", textDecoration: "none" }} className="tap">{Ic.Plus()}</Link>
          </div>
          {!userId ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Connectez-vous</div>
              <div style={{ color: t2, fontSize: "14px", marginBottom: "20px" }}>Gérez vos rendez-vous depuis votre compte.</div>
              <Link href="/login" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Se connecter</Link>
            </div>
          ) : rdvs.length === 0 ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📅</div>
              <div style={{ color: t1, fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Aucun rendez-vous</div>
              <Link href="/recherche" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Trouver une institution</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* STATS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
                {[
                  { n: rdvs.length,        l: "Total",     c: "#3b82f6" },
                  { n: rdvAVenir.length,   l: "À venir",   c: "#F5A623" },
                  { n: rdvTermines.length, l: "Terminés",  c: "#22c55e" },
                ].map(s => (
                  <div key={s.l} style={{ backgroundColor: card, borderRadius: "16px", padding: "14px 8px", textAlign: "center", border: `1px solid ${brd}` }}>
                    <div style={{ color: s.c, fontSize: "22px", fontWeight: "900", lineHeight: 1 }}>{s.n}</div>
                    <div style={{ color: t3, fontSize: "10px", fontWeight: "700", marginTop: "4px", letterSpacing: "0.02em" }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* RDV EN RETARD — prioritaire, affiché avant le prochain */}
              {rdvEnRetard && (
                <div onClick={() => router.push("/mes-rdv")} className="tap" style={{ backgroundColor: card, borderRadius: "16px", padding: "15px", border: "1.5px solid rgba(239,68,68,0.4)", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ color: "#ef4444", fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rendez-vous en retard</div>
                    <span style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>En retard</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", fontWeight: "800", fontSize: "14px", flexShrink: 0 }}>
                      {(rdvEnRetard.institution_name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "14px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rdvEnRetard.institution_name}</div>
                      {rdvEnRetard.objet && <div style={{ color: t2, fontSize: "12px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rdvEnRetard.objet}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "12px", marginTop: "2px" }}>{Ic.Clock()}<span>{parseDateLocale(rdvEnRetard.date_rdv).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{rdvEnRetard.heure_rdv && ` · ${rdvEnRetard.heure_rdv}`}</span></div>
                    </div>
                    {Ic.Chev()}
                  </div>
                  <div style={{ color: "#ef4444", fontSize: "11px", lineHeight: 1.5, marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
                    Ce rendez-vous a dépassé l'heure prévue sans confirmation de votre présence. Contactez l'établissement si vous êtes toujours sur place.
                  </div>
                </div>
              )}

              {/* PROCHAIN RDV */}
              {prochain && (
                <div onClick={() => router.push("/mes-rdv")} className="tap" style={{ backgroundColor: card, borderRadius: "16px", padding: "15px", border: `1px solid ${brd}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ color: t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.08em" }}>Prochain rendez-vous</div>
                    <span style={{ backgroundColor: stInfo(prochain.statut).bg, color: stInfo(prochain.statut).c, fontSize: "9px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{stInfo(prochain.statut).l}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: "rgba(245,166,35,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5A623", fontWeight: "800", fontSize: "14px", flexShrink: 0 }}>
                      {(prochain.institution_name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "14px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prochain.institution_name}</div>
                      {prochain.objet && <div style={{ color: t2, fontSize: "12px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prochain.objet}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: t2, fontSize: "12px", marginTop: "2px" }}>{Ic.Clock()}<span>{parseDateLocale(prochain.date_rdv).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{prochain.heure_rdv && ` · ${prochain.heure_rdv}`}</span></div>
                    </div>
                    {Ic.Chev()}
                  </div>
                </div>
              )}

              {/* CTA — VERS L'ESPACE MES RDV */}
              <div style={{ background: isDark ? "linear-gradient(135deg,rgba(245,166,35,0.12),rgba(245,166,35,0.03))" : "linear-gradient(135deg,rgba(245,166,35,0.08),rgba(245,166,35,0.02))", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "20px", padding: "22px 20px" }}>
                <div style={{ width: "46px", height: "46px", borderRadius: "14px", background: "linear-gradient(135deg,#F5A623,#C8940A)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div style={{ color: t1, fontSize: "17px", fontWeight: "800", marginBottom: "6px", letterSpacing: "-0.2px" }}>Gérez vos rendez-vous</div>
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>Confirmation, annulation, report et avis — tout se passe dans votre espace Mes RDV.</div>
                <button onClick={() => router.push("/mes-rdv")} className="tap" style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  Ouvrir Mes RDV
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.8" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ===================================================== */}
      {/* TAB COMMUNAUTÉ (27/07/2026) — espace communautaire pro façon
          LinkedIn, remplace le slot "Mes démarches" du menu fixe (resté
          accessible via le carrousel Accueil et le menu Compte). Onglet
          interne comme Offres, pas une route externe : état persistant,
          pas de bouton retour, switch instantané via la barre du bas. */}
      {/* ===================================================== */}
      {tab === "communaute" && (
        <PullToRefresh onRefresh={rafraichirCommunaute} isDark={isDark}>
        <div className="scr" style={{ padding: "calc(76px + env(safe-area-inset-top)) 16px 0" }}>

          <div style={{ marginBottom: "18px" }}>
            <h1 style={{ color: t1, fontSize: "22px", fontWeight: 900, margin: "0 0 4px", letterSpacing: "-0.4px" }}>Fil d&apos;actualité</h1>
            <p style={{ color: t2, fontSize: "13px", margin: 0 }}>Idées, expériences et opportunités entre professionnels Yelen.</p>
          </div>

          {/* Catégories illustrées — filtre du fil (retour Bryan
              27/07/2026), même liste que le composeur. */}
          <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "6px", marginBottom: "20px" }}>
            {POST_CATEGORIES.map(cat => (
              <CategorieChip key={cat} categorie={cat} actif={communauteCatFiltre === cat} onClick={() => choisirCategorieFiltre(cat)} texteCouleur={t2} />
            ))}
          </div>

          {identiteVerifiee ? (
            <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "14px", marginBottom: "20px" }}>
              <button onClick={() => setComposerOuvert(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                <CommunauteAvatar nom={userName} photo={userPhoto} taille={36} />
                <span style={{ flex: 1, color: t2, fontSize: "13.5px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "20px", padding: "10px 16px" }}>
                  Partager une idée, une expérience…
                </span>
              </button>
            </div>
          ) : (
            <div style={{ background: isDark ? "rgba(37,99,235,0.08)" : "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "14px", padding: "14px 16px", marginBottom: "20px" }}>
              <div style={{ color: "#2563EB", fontSize: "12.5px", fontWeight: 800, marginBottom: "4px" }}>Identité non vérifiée</div>
              <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>Vous pouvez liker, commenter et partager. Vérifiez votre identité Yelen pour publier vos propres idées.</div>
            </div>
          )}

          {!communauteLoaded || (posts.length === 0 && postsLoadingMore) ? (
            <YelenLoaderEcran label="Chargement du fil…" />
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><CommunauteEmptyIllustration /></div>
              <div style={{ color: t1, fontSize: "14px", fontWeight: 800, marginBottom: "4px" }}>Aucune publication pour l&apos;instant</div>
              <div style={{ color: t2, fontSize: "12.5px" }}>Soyez parmi les premiers à partager avec la communauté Yelen.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  isDark={isDark} card={card} t1={t1} t2={t2} t3={t3} brd={brd}
                  liked={postLikes[post.id]?.likedByMoi ?? false}
                  likeCount={postLikes[post.id]?.count ?? 0}
                  commentCount={postCommentCounts[post.id] ?? 0}
                  onToggleLike={() => togglePostLike(post.id)}
                  onPartager={() => partagerPost(post)}
                  commentsOuverts={postCommentsOuvertId === post.id}
                  onToggleComments={() => ouvrirPostCommentaires(post.id)}
                  commentairesListe={postCommentaires[post.id]}
                  commentDraft={postCommentsOuvertId === post.id ? postCommentDraft : ""}
                  onChangeCommentDraft={setPostCommentDraft}
                  onSubmitComment={() => envoyerPostCommentaire(post.id)}
                  onOpenAuteur={() => setProfilAuteurPost(post)}
                  onSignalerPost={() => setSignalementCible({ type: "post", id: post.id, label: post.author_nom })}
                  onSignalerAuteur={() => setSignalementCible({ type: "auteur", id: post.auteur_id, label: post.author_nom })}
                />
              ))}

              {postsHasMore && (
                <button onClick={chargerPlusPosts} disabled={postsLoadingMore} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: card, border: `1px solid ${brd}`, borderRadius: "12px", padding: "13px", color: t1, fontSize: "13px", fontWeight: 700, cursor: postsLoadingMore ? "default" : "pointer" }}>
                  {postsLoadingMore ? <YelenLoader size={15} color={t1} /> : "Charger plus"}
                </button>
              )}
            </div>
          )}
        </div>
        </PullToRefresh>
      )}

      {/* ===================================================== */}
      {/* TAB COMPTE */}
      {/* ===================================================== */}
      {tab === "compte" && (
        <div className="scr" style={{ padding: "calc(60px + env(safe-area-inset-top)) 16px 0" }}>
          {!userId ? (
            <div style={{ backgroundColor: card, borderRadius: "20px", padding: "32px 20px", textAlign: "center" }}>
              <div style={{ width: "70px", height: "70px", borderRadius: "50%", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: t1 }}>{Ic.User()}</div>
              <div style={{ color: t1, fontSize: "18px", fontWeight: "700", marginBottom: "6px" }}>Non connecté</div>
              <div style={{ color: t2, fontSize: "14px", marginBottom: "20px" }}>Créez un compte pour accéder à tous les services.</div>
              <Link href="/inscription" style={{ display: "block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none", marginBottom: "10px" }}>Créer un compte</Link>
              <Link href="/login" style={{ display: "block", backgroundColor: card2, color: t1, fontWeight: "600", fontSize: "15px", padding: "14px", borderRadius: "12px", textDecoration: "none" }}>Se connecter</Link>
            </div>
          ) : (
            <div>
              {/* BANDEAU IDENTITÉ NON VÉRIFIÉE — décision Bryan 23/07/2026 :
                  dismissible (X) mais réapparaît à la prochaine arrivée sur
                  l'écran tant que l'identité n'est pas vérifiée (voir
                  bandeauIdentiteFerme, non persisté). */}
              {!identiteVerifiee && !bandeauIdentiteFerme && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "14px", padding: "12px 14px", marginBottom: "12px" }}>
                  <span style={{ color: "#F5A623", flexShrink: 0 }}>{Ic.Info()}</span>
                  <Link href="/compte/verification-identite" style={{ flex: 1, minWidth: 0, color: t1, fontSize: "12.5px", fontWeight: "700", textDecoration: "none", lineHeight: 1.4 }}>
                    Vérifiez votre identité pour sécuriser votre compte et activer le badge "Vérifié".
                  </Link>
                  <button onClick={() => setBandeauIdentiteFerme(true)} className="tap" style={{ background: "none", border: "none", padding: "4px", cursor: "pointer", color: t2, flexShrink: 0 }}>{Ic.X()}</button>
                </div>
              )}

              {/* CARTE IDENTITÉ FUSIONNÉE — combine l'ancienne carte Accueil
                  (stats RDV/score présence) et l'ancienne carte Compte
                  (Niveau du compte/Membre depuis). Un seul CTA "Modifier mon
                  profil" (Mes RDV et Mon QR Code restent dans Actions
                  rapides ci-dessous). */}
              <CarteIdentiteCompte
                userId={userId}
                userName={userName}
                userPhone={userPhone}
                userPhoto={userPhoto}
                initials={initials}
                rdvs={rdvs}
                userCreeLe={userCreeLe}
                identiteVerifiee={identiteVerifiee}
                router={router}
              />

              {/* BOUTON BIOMÉTRIE — fonctionnel dès aujourd'hui (WebAuthn
                  réel), laissé ici en accès rapide. La section Personal
                  Information ci-dessous référence aussi /compte/biometrie
                  (encore vide) : ce bouton restera la voie d'activation
                  réelle jusqu'à ce que cet écran reçoive son contenu. */}
              <button
                onClick={() => {
                  const isRegistered = localStorage.getItem("yelen224_bio_registered") === "1";
                  if (isRegistered) {
                    setBioAuthOpen(true);
                  } else {
                    setBioOptInOpen(true);
                  }
                }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "14px 16px", cursor: "pointer", marginBottom: "12px" }}
                className="tap"
              >
                <div style={{ width: "40px", height: "40px", borderRadius: "12px", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t1} strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                    <path d="M8 11a4 4 0 0 0 8 0"/>
                    <path d="M12 18v4"/>
                    <path d="M4 15.5A9 9 0 0 0 20 15"/>
                  </svg>
                </div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: "700" }}>
                    {localStorage.getItem("yelen224_bio_registered") === "1" ? "Biométrie active" : "Activer la biométrie"}
                  </div>
                  <div style={{ color: t2, fontSize: "12px" }}>
                    {localStorage.getItem("yelen224_bio_registered") === "1" ? "Empreinte / Face ID configuré" : "Connexion rapide par empreinte ou Face ID"}
                  </div>
                </div>
                <span style={{
                  background: localStorage.getItem("yelen224_bio_registered") === "1" ? "rgba(34,197,94,0.12)" : "rgba(142,142,147,0.1)",
                  color: localStorage.getItem("yelen224_bio_registered") === "1" ? "#22c55e" : t3,
                  fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px"
                }}>
                  {localStorage.getItem("yelen224_bio_registered") === "1" ? "ON" : "OFF"}
                </span>
              </button>

              {/* ACTIONS RAPIDES — 5 écrans les plus utilisés, à plat,
                  visibles sans clic (retour direct de Bryan le 18/07/2026 :
                  le menu par section devenait trop long avec 29 écrans). */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ color: t3, fontSize: "12px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "4px" }}>Actions rapides</div>
                <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden" }}>
                  {ACTIONS_RAPIDES_COMPTE.map((item, i, arr) => (
                    <Link key={item.l} href={item.h} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", textDecoration: "none", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", color: t2 }}>{item.i}</div>
                      <span style={{ color: t1, fontSize: "15px", flex: 1 }}>{item.l}</span>
                      {Ic.Chev()}
                    </Link>
                  ))}
                </div>
              </div>

              {/* 5 SECTIONS — Personal Information / Manage Account / Mon
                  Activité / Help & Support / Legal (décision CEO 18/07/2026).
                  Repliées par défaut : juste le nom + une flèche vers le bas
                  pour signaler que c'est cliquable. Le clic déplie la liste
                  complète de la section (pas un sous-ensemble). */}
              {SECTIONS_COMPTE.map(sec => {
                const ouvert = comptOuvert[sec.titre] === true;
                return (
                  <div key={sec.titre} style={{ marginBottom: "16px" }}>
                    <button
                      onClick={() => setComptOuvert(prev => ({ ...prev, [sec.titre]: !ouvert }))}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", padding: "14px 16px", backgroundColor: card, border: `1px solid ${ouvert ? "rgba(245,166,35,0.35)" : "transparent"}`, borderRadius: "16px", cursor: "pointer" }}
                      className="tap"
                    >
                      <span style={{ color: t1, fontSize: "15px", fontWeight: "700" }}>{sec.titre}</span>
                      <span style={{ display: "inline-flex", color: ouvert ? "#F5A623" : t2, transform: ouvert ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.2s" }}>{Ic.Chev()}</span>
                    </button>
                    {ouvert && (
                      <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden", marginTop: "8px" }}>
                        {sec.items.map((item, i, arr) => (
                          <Link key={item.l} href={item.h} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", textDecoration: "none", borderBottom: i < arr.length - 1 ? `1px solid ${brd}` : "none" }} className="tap">
                            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: card2, display: "flex", alignItems: "center", justifyContent: "center", color: t2 }}>{item.i}</div>
                            <span style={{ color: t1, fontSize: "15px", flex: 1 }}>{item.l}</span>
                            {Ic.Chev()}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={() => setLogoutOpen(true)} style={{ width: "100%", backgroundColor: "rgba(255,59,48,0.1)", border: "none", borderRadius: "14px", padding: "15px", color: "#FF3B30", fontSize: "15px", fontWeight: "600", cursor: "pointer" }} className="tap">Déconnexion</button>

              {/* FOOTER — pied de l'onglet Compte (retour Bryan 18/07/2026 :
                  l'app a atteint un niveau plus abouti, mérite une signature) */}
              <div style={{ textAlign: "center", padding: "24px 0 4px" }}>
                <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700" }}>© {new Date().getFullYear()} Yelen — Sempya224</div>
                <div style={{ color: t3, fontSize: "11px", marginTop: "3px" }}>Version {YELEN_APP_VERSION}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARTE PLEIN ÉCRAN */}
      {carteOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: bg, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", backgroundColor: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${brd}`, flexShrink: 0 }}>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "700" }}>Carte des prestataires</div>
            <button onClick={() => setCarteOpen(false)} style={{ background: card2, border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }} className="tap">{Ic.X()}</button>
          </div>
          <div className="map-wrap" style={{ flex: 1, overflow: "hidden" }}>
            {mapInsts.length > 0 ? <CarteMapHome institutions={mapInsts as any}/> : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t3, padding: "16px", textAlign: "center" }}>
                {mapLoaded ? "Aucun établissement localisé sur la carte pour l'instant." : "Chargement..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MON ASSISTANT — bandeau tirable, uniquement onglet Accueil pour ce
          MVP (voir CLAUDE.md /chantier-mon-assistant). Sous la nav du bas
          en z-index (90 < 100), jamais par-dessus le header. */}
      {tab === "accueil" && <MonAssistant userId={userId}/>}

      {/* NAVIGATION BAS — boutons ronds flottants (façon Uber Eats/standard
          "floating tab bar"), pas de bandeau plein largeur ni de libellés :
          l'onglet actif se distingue par un fond doré plein, les autres par
          un simple cercle carte/bordure. Espacement fixe par rapport aux
          bords et à la zone barre d'accueil du téléphone (retour CEO
          23/07/2026). */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: `10px 10px calc(2px + env(safe-area-inset-bottom))`, background: isDark ? "rgba(10,10,15,0.85)" : "rgba(255,255,255,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderTop: `1px solid ${brd}` }}>
        {([
          { key: "accueil",    label: "Accueil",       r: () => Ic.Home() },
          { key: "rdv",        label: "RDV",           r: () => Ic.Cal() },
          { key: "offres",     label: "Offres",        r: () => Ic.Tag(), center: true },
          { key: "communaute", label: "Communauté",    r: () => Ic.Community() },
          { key: "compte",     label: "Compte",        r: () => Ic.User() },
        ] as { key: string; label: string; r: () => any; center?: boolean; href?: string }[]).map(item => {
          const active = tab === item.key;
          // Les icônes Ic.* se dorent déjà elles-mêmes quand on leur passe
          // `true` — sur un fond doré plein (onglet actif), ça donnait une
          // icône dorée invisible sur fond doré. On leur passe donc toujours
          // `false` et on laisse `currentColor` suivre le `color` du bouton.
          const size = item.center ? 62 : 50;
          return (
            <button
              key={item.key}
              onClick={() => item.href ? router.push(item.href) : changeTab(item.key as Tab)}
              aria-label={item.label}
              style={{
                width: `${size}px`, height: `${size}px`, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: item.center ? "#F5A623" : (active ? "#F5A623" : (isDark ? card2 : "#fff")),
                border: (item.center || active) ? "none" : `1px solid ${brd}`,
                boxShadow: (item.center || active) ? "0 4px 16px rgba(245,166,35,0.4)" : "0 4px 14px rgba(0,0,0,0.12)",
                color: (item.center || active) ? "#080812" : t1,
                transform: item.center ? "translateY(-14px)" : "none",
                cursor: "pointer", transition: "all 0.15s",
              }}
              className="tap"
            >
              {item.r()}
            </button>
          );
        })}
      </nav>
    </div>
  );
}