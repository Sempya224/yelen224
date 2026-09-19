"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { InstitutionsRecentesSection } from "@/components/InstitutionsRecentesSection";
import { ITEMS as MENU_ITEMS } from "@/components/CitoyenMenu";

// Hub de recherche interne à "Mon Compte" (décision CEO, 26/07/2026,
// inspiré du hub "Ask MoneyLion AI") — retrouver une action de son compte
// (démarches, avis, favoris, dépenses...), pas un établissement : la
// recherche d'institutions reste sur /recherche (onglet dédié, inchangé).
// Matching déterministe par mots-clés (zéro appel LLM, cf. CLAUDE.md
// "/stack-specifique") sur un registre statique combinant les 8 entrées du
// menu "conçu pour vous" (CitoyenMenu, badges réutilisés tels quels) et
// quelques écrans utiles de "Mon Activité".
//
// Overlay plein écran (pas une route) — retour Bryan 26/07/2026 : "un genre
// d'écran que tu peux ouvrir et fermer sans quitter ton écran", même
// convention que CitoyenMenu/NotifPanel/LogoutFlow (monté/démonté par le
// parent via un état booléen, fermeture par X, jamais par "retour").
// Deux points d'entrée : CompteHeader (icône loupe, tous les écrans
// /compte/* et /menu/*) et le header partagé des 4 onglets d'app/page.tsx.

const RECENT_KEY = "yelen224_compte_recherches";
const RECENT_MAX = 6;

function lireRecherchesRecentes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function enregistrerRechercheRecente(q: string) {
  if (typeof window === "undefined") return;
  const propre = q.trim();
  if (propre.length < 2) return;
  try {
    const next = [propre, ...lireRecherchesRecentes().filter(x => x.toLowerCase() !== propre.toLowerCase())].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function retirerRechercheRecente(q: string): string[] {
  if (typeof window === "undefined") return [];
  const next = lireRecherchesRecentes().filter(x => x !== q);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// Badges deux tons (fond pastel + glyphe plein, 56px) — même méthode que
// components/CitoyenMenu.tsx (Badge.*), nouvelles illustrations pour les
// écrans "Mon Activité" mis en avant ici.
const Badge = {
  Calendar: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#DBEAFE"/>
      <rect x="14" y="16" width="28" height="24" rx="4" fill="#2563EB"/>
      <rect x="14" y="16" width="28" height="7" rx="4" fill="#1D4ED8"/>
      <rect x="20" y="10" width="3" height="8" rx="1.5" fill="#1D4ED8"/>
      <rect x="33" y="10" width="3" height="8" rx="1.5" fill="#1D4ED8"/>
      <rect x="19" y="28" width="5" height="5" fill="#DBEAFE"/>
      <rect x="27" y="28" width="5" height="5" fill="#DBEAFE"/>
      <rect x="35" y="28" width="5" height="5" fill="#DBEAFE"/>
    </svg>
  ),
  Checklist: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#CCFBF1"/>
      <rect x="16" y="13" width="24" height="30" rx="4" fill="#0D9488"/>
      <path d="M21 22l2.5 2.5L28 20" stroke="#CCFBF1" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <rect x="30" y="20" width="6" height="2.6" rx="1.3" fill="#CCFBF1"/>
      <path d="M21 31l2.5 2.5L28 29" stroke="#CCFBF1" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <rect x="30" y="29" width="6" height="2.6" rx="1.3" fill="#CCFBF1"/>
    </svg>
  ),
  Star: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FCE7F3"/>
      <path d="M28 14l4.2 8.8 9.6 1.3-7 6.8 1.7 9.6L28 36l-8.5 4.5 1.7-9.6-7-6.8 9.6-1.3z" fill="#DB2777"/>
    </svg>
  ),
  Heart: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FEE2E2"/>
      <path d="M28 40s-13-8.1-13-17.3C15 17.9 18.8 14 23.3 14 25.6 14 27.4 15.1 28 16.7 28.6 15.1 30.4 14 32.7 14 37.2 14 41 17.9 41 22.7 41 31.9 28 40 28 40z" fill="#DC2626"/>
    </svg>
  ),
  History: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#E2E8F0"/>
      <circle cx="28" cy="29" r="13" fill="none" stroke="#475569" strokeWidth="3.2"/>
      <path d="M28 21v8l6 4" stroke="#475569" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M20 13l-4 4M36 13l4 4" stroke="#475569" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
  ),
  Chat: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#E0F2FE"/>
      <path d="M15 20a4 4 0 0 1 4-4h18a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H24l-7 6v-6h-2a4 4 0 0 1-4-4z" fill="#0284C7"/>
      <circle cx="22" cy="25" r="1.8" fill="#E0F2FE"/><circle cx="28" cy="25" r="1.8" fill="#E0F2FE"/><circle cx="34" cy="25" r="1.8" fill="#E0F2FE"/>
    </svg>
  ),
  // Complément (01/09/2026) — écrans Profil/Mon Activité/Aide et support de
  // l'onglet Compte (SECTIONS_COMPTE, app/page.tsx) qui n'étaient pas
  // couverts par ce registre. Mentions légales et Paramètres exclus
  // volontairement de cette recherche (retour Bryan 01/09/2026), déjà
  // accessibles depuis l'onglet Compte. Icônes volontairement simples (un
  // seul pictogramme trait, pas un dessin aussi détaillé que
  // Calendar/Checklist ci-dessus) et réutilisées entre plusieurs écrans
  // proches (ex. Info pour les écrans d'aide) — cohérent avec le fait que
  // la moitié de ces écrans n'apparaissent que dans la liste de résultats
  // (jamais dans la grille mise en avant), où le badge est affiché petit.
  Id: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#EDE9FE"/>
      <rect x="14" y="18" width="28" height="20" rx="4" fill="#7C3AED"/>
      <circle cx="22" cy="28" r="4" fill="#EDE9FE"/>
      <rect x="30" y="24" width="8" height="2.4" rx="1.2" fill="#EDE9FE"/>
      <rect x="30" y="29" width="8" height="2.4" rx="1.2" fill="#EDE9FE"/>
    </svg>
  ),
  Shield: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#DCFCE7"/>
      <path d="M28 13l11 4v9c0 9-5.5 14-11 16-5.5-2-11-7-11-16v-9z" fill="#16A34A"/>
      <path d="M22 28l4 4 8-8" stroke="#DCFCE7" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Globe: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#DBEAFE"/>
      <circle cx="28" cy="28" r="13" fill="none" stroke="#2563EB" strokeWidth="3"/>
      <ellipse cx="28" cy="28" rx="6" ry="13" fill="none" stroke="#2563EB" strokeWidth="2.4"/>
      <line x1="15" y1="28" x2="41" y2="28" stroke="#2563EB" strokeWidth="2.4"/>
    </svg>
  ),
  Pay: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#DCFCE7"/>
      <rect x="14" y="19" width="28" height="18" rx="4" fill="#16A34A"/>
      <rect x="14" y="24" width="28" height="4" fill="#DCFCE7"/>
    </svg>
  ),
  Doc: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FEF3C7"/>
      <path d="M20 14h11l7 7v21H20z" fill="#C8740A"/>
      <path d="M31 14v7h7" fill="#FEF3C7"/>
      <rect x="23" y="27" width="10" height="2.2" rx="1.1" fill="#FEF3C7"/>
      <rect x="23" y="32" width="10" height="2.2" rx="1.1" fill="#FEF3C7"/>
    </svg>
  ),
  Contact: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#E0F2FE"/>
      <path d="M17 30v-3a11 11 0 0 1 22 0v3" stroke="#0284C7" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <rect x="14" y="30" width="6" height="9" rx="2.5" fill="#0284C7"/>
      <rect x="36" y="30" width="6" height="9" rx="2.5" fill="#0284C7"/>
    </svg>
  ),
  Warning: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FEE2E2"/>
      <path d="M28 15l14 24H14z" fill="#DC2626"/>
      <rect x="26.3" y="26" width="3.4" height="8" rx="1.5" fill="#FEE2E2"/>
      <circle cx="28" cy="37" r="1.8" fill="#FEE2E2"/>
    </svg>
  ),
  Qr: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#E2E8F0"/>
      <rect x="16" y="16" width="9" height="9" fill="#475569"/>
      <rect x="31" y="16" width="9" height="9" fill="#475569"/>
      <rect x="16" y="31" width="9" height="9" fill="#475569"/>
      <rect x="31" y="31" width="4" height="4" fill="#475569"/>
      <rect x="37" y="37" width="3" height="3" fill="#475569"/>
    </svg>
  ),
  Info: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#E0F2FE"/>
      <circle cx="28" cy="19" r="2.6" fill="#0284C7"/>
      <rect x="25.5" y="25" width="5" height="14" rx="2.5" fill="#0284C7"/>
    </svg>
  ),
};

const Ic = {
  Search:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Close:       () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  CloseBig:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chev:        () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  SearchWhite: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  CtaIllustration: () => (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="32" fill="#FEF3C7"/>
      <path d="M18 46V26l14-9 14 9v20" fill="none" stroke="#C8740A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="24" y="32" width="6" height="14" fill="#F5A623"/>
      <rect x="34" y="32" width="6" height="14" fill="#F5A623"/>
      <circle cx="44" cy="20" r="8" fill="#fff" stroke="#C8740A" strokeWidth="2.6"/>
      <path d="M50 26l4 4" stroke="#C8740A" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  ),
};

type RegistryItem = { label: string; href: string; keywords: string[]; badge: () => React.ReactNode; section: string };

// Sections (retour Bryan 01/09/2026 — "structuré, pas tout listé en vrac") :
// même découpage que SECTIONS_COMPTE (app/page.tsx) plutôt qu'un
// regroupement inventé pour cette recherche, pour que "Explorer d'autres
// sujets" retrouve la même logique que l'onglet Compte. "Pour vous" reprend
// le menu conçu pour vous (CitoyenMenu). Ordre d'affichage = SECTION_ORDER
// ci-dessous, pas l'ordre de déclaration dans ce tableau.
const REGISTRY: RegistryItem[] = [
  ...MENU_ITEMS.map(it => ({ label: it.label, href: it.href, badge: it.badge, keywords: [it.label], section: "Pour vous" })),
  { label: "Mes rendez-vous",             href: "/mes-rdv",                badge: Badge.Calendar,  keywords: ["rdv", "rendez-vous", "reservation", "creneau"], section: "Mon activité" },
  { label: "Mes démarches",               href: "/compte/mes-demarches",   badge: Badge.Checklist, keywords: ["demarche", "dossier", "suivi", "checklist"], section: "Mon activité" },
  { label: "Mes avis",                    href: "/compte/mes-avis",        badge: Badge.Star,      keywords: ["avis", "note", "commentaire"], section: "Mon activité" },
  { label: "Mes établissements favoris",  href: "/compte/favoris",         badge: Badge.Heart,     keywords: ["favoris", "favori", "aime"], section: "Mon activité" },
  { label: "Activités passées",           href: "/compte/activites",       badge: Badge.History,   keywords: ["activite", "historique", "passe"], section: "Mon activité" },
  { label: "Messagerie",                  href: "/messagerie/citoyen",     badge: Badge.Chat,      keywords: ["message", "messagerie", "discussion"], section: "Mon activité" },

  // Complément (01/09/2026) — reste des 29 écrans de l'onglet Compte
  // (SECTIONS_COMPTE dans app/page.tsx + PARAMETRES_COMPTE/PARAMETRES_APPLICATION
  // dans app/compte/parametres/page.tsx), jusque-là absents de ce registre
  // donc introuvables depuis cette recherche. Biométrie/Appareils connectés/
  // Sessions volontairement exclus : écrans orphelins (CompteEcranVide vide,
  // aucun lien nulle part dans le produit à ce jour) — les ajouter ici les
  // rendrait atteignables alors qu'ils ne le sont depuis aucun autre écran.
  { label: "Informations personnelles",   href: "/compte/informations-personnelles", badge: Badge.Id,      keywords: ["profil", "nom", "prenom", "email", "telephone", "identite"], section: "Profil" },
  { label: "Vérification d'identité",     href: "/compte/verification-identite",     badge: Badge.Shield,  keywords: ["identite", "cin", "verification", "verifie"], section: "Profil" },
  { label: "Documents personnels",        href: "/compte/documents-personnels",      badge: Badge.Doc,     keywords: ["document", "piece", "fichier"], section: "Profil" },
  { label: "Carte Yelen",                 href: "/compte/carte-yelen",               badge: Badge.Id,      keywords: ["carte", "yelen224"], section: "Profil" },
  { label: "Éducation",                   href: "/education",                        badge: Badge.Globe,   keywords: ["education", "apprendre", "guide"], section: "Profil" },
  { label: "Langue",                      href: "/compte/langue",                    badge: Badge.Globe,   keywords: ["langue", "francais", "anglais", "arabe"], section: "Profil" },
  { label: "Parcours Yelen",              href: "/compte/parcours-yelen",            badge: Badge.Id,      keywords: ["parcours", "onboarding", "progression"], section: "Profil" },

  { label: "Mes paiements",               href: "/compte/paiements",                 badge: Badge.Pay,     keywords: ["paiement", "facture", "transaction"], section: "Mon activité" },
  { label: "Mes remboursements",          href: "/compte/remboursements",            badge: Badge.Pay,     keywords: ["remboursement", "rembourse"], section: "Mon activité" },
  { label: "Mes réservations payantes",   href: "/compte/reservations-payantes",     badge: Badge.Pay,     keywords: ["reservation", "paiement", "service payant"], section: "Mon activité" },
  { label: "Mes documents",               href: "/compte/documents-telecharges",     badge: Badge.Doc,     keywords: ["document", "telecharge", "fichier"], section: "Mon activité" },
  { label: "Historique des connexions",   href: "/compte/historique-connexions",     badge: Badge.History, keywords: ["connexion", "session", "historique", "appareil"], section: "Mon activité" },
  { label: "Mon QR code",                 href: "/mon-qr",                           badge: Badge.Qr,      keywords: ["qr", "code", "scan"], section: "Mon activité" },

  { label: "Centre d'aide",               href: "/compte/aide",                      badge: Badge.Info,    keywords: ["aide", "support", "assistance"], section: "Aide et support" },
  { label: "FAQ",                         href: "/faq",                              badge: Badge.Info,    keywords: ["question", "faq", "aide"], section: "Aide et support" },
  { label: "Contacter Yelen",             href: "/contact",                          badge: Badge.Contact, keywords: ["contact", "support", "ecrire"], section: "Aide et support" },
  { label: "Signaler un problème",        href: "/signalement",                      badge: Badge.Warning, keywords: ["signaler", "probleme", "bug", "plainte"], section: "Aide et support" },
  { label: "État des services",           href: "/compte/etat-services",             badge: Badge.Info,    keywords: ["etat", "service", "panne", "statut"], section: "Aide et support" },
  { label: "Suggestions",                 href: "/compte/suggestions",               badge: Badge.Info,    keywords: ["suggestion", "idee"], section: "Aide et support" },
  { label: "Tutoriels",                   href: "/compte/tutoriels",                 badge: Badge.Info,    keywords: ["tutoriel", "guide", "apprendre"], section: "Aide et support" },
  { label: "Envoyer un feedback",         href: "/compte/feedback",                  badge: Badge.Info,    keywords: ["feedback", "avis", "retour"], section: "Aide et support" },
];

// Mentions légales et Paramètres retirés de cette recherche (retour Bryan
// 01/09/2026) — ces écrans restent accessibles depuis l'onglet Compte
// (SECTIONS_COMPTE/app/page.tsx et app/compte/parametres/page.tsx), volontairement
// pas dupliqués ici.
const SECTION_ORDER = ["Pour vous", "Mon activité", "Profil", "Aide et support"];

// Sujets mis en avant dans la grille principale (façon "Borrow Money / Win
// Money" de la référence) — le reste du registre passe dans "Explorer
// d'autres sujets". Choix à valider avec Bryan, facile à ajuster (liste de
// hrefs uniquement).
const GRID_HREFS = ["/mes-rdv", "/compte/mes-demarches", "/compte/mes-avis", "/compte/favoris", "/menu/depenses", "/menu/interets"];

function chercherIndex(query: string): RegistryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return REGISTRY
    .map(item => {
      const label = item.label.toLowerCase();
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 60;
      else if (item.keywords.some(k => k.toLowerCase().includes(q))) score = 40;
      return { item, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

export function CompteRechercheOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => { setRecents(lireRecherchesRecentes()); }, []);

  const resultats = useMemo(() => chercherIndex(query), [query]);
  const rechercheActive = query.trim().length > 0;

  const grid = useMemo(() => GRID_HREFS.map(h => REGISTRY.find(r => r.href === h)).filter((r): r is RegistryItem => !!r), []);
  // Groupé par section (retour Bryan 01/09/2026 : "structuré, pas tout
  // listé en vrac") — même découpage que SECTIONS_COMPTE plutôt qu'un
  // unique fourre-tout de pills.
  const pillSections = useMemo(() => {
    const reste = REGISTRY.filter(r => !GRID_HREFS.includes(r.href));
    return SECTION_ORDER
      .map(section => ({ section, items: reste.filter(r => r.section === section) }))
      .filter(s => s.items.length > 0);
  }, []);

  function valider() {
    enregistrerRechercheRecente(query);
    setRecents(lireRecherchesRecentes());
  }

  function allerVersRecherchePrincipale() {
    const q = query.trim();
    if (q) enregistrerRechercheRecente(q);
    onClose();
    router.push(q ? `/recherche?q=${encodeURIComponent(q)}` : "/recherche");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: bg, overflowY: "auto", animation: "compteRechercheFadeIn 0.2s ease", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        @keyframes compteRechercheFadeIn{from{opacity:0}to{opacity:1}}
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        .cro-search-input:focus{outline:none}
      `}</style>

      {/* Overlay, pas une route : fermeture par X uniquement (retour Bryan
          26/07/2026), jamais de sémantique "retour". */}
      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <span/>
          <div style={{ color: t1, fontSize: "16px", fontWeight: "800", textAlign: "center" }}>Recherche</div>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            {Ic.CloseBig()}
          </button>
        </div>
      </header>

      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto" }}>

        {/* Barre de recherche */}
        <div style={{ position: "relative", marginBottom: "18px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3, pointerEvents: "none" }}>{Ic.Search()}</div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") valider(); }}
            placeholder="Démarches, avis, dépenses, leçons d'argent..."
            className="cro-search-input"
            style={{ width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fff", border: "none", borderRadius: "22px", padding: "12px 38px 12px 40px", color: t1, fontSize: "14.5px", fontWeight: 500, boxSizing: "border-box" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="tap" aria-label="Effacer" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", padding: 0 }}>{Ic.Close()}</button>
          )}
        </div>

        {rechercheActive ? (
          <>
            {resultats.length > 0 && (
              <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", overflow: "hidden", marginBottom: "16px" }}>
                {resultats.map((r, i) => (
                  <Link key={r.href} href={r.href} onClick={valider} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", textDecoration: "none", borderBottom: i < resultats.length - 1 ? `1px solid ${brd}` : "none" }}>
                    <div style={{ flexShrink: 0, width: "34px", height: "34px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ transform: "scale(0.61)" }}>{r.badge()}</div>
                    </div>
                    <span style={{ color: t1, fontSize: "14px", fontWeight: 700, flex: 1 }}>{r.label}</span>
                    <span style={{ color: t2 }}>{Ic.Chev()}</span>
                  </Link>
                ))}
              </div>
            )}

            {resultats.length === 0 && (
              <div style={{ textAlign: "center", padding: "8px 16px 24px" }}>
                <Image
                  src="/illustrations/compte-recherche-vide.png"
                  alt="Aucune action trouvée"
                  width={1024} height={1536}
                  style={{ width: "160px", maxWidth: "100%", height: "auto", margin: "0 auto 12px", display: "block" }}
                />
                <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5 }}>
                  Aucune action de votre compte ne correspond à « {query.trim()} ».
                </div>
              </div>
            )}

            {/* Tuile permanente vers la recherche principale — reste visible
                qu'il y ait des résultats ou non (décision Bryan). */}
            <button onClick={allerVersRecherchePrincipale} className="tap" style={{ display: "flex", width: "100%", alignItems: "center", gap: "12px", padding: "14px", backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", textAlign: "left", cursor: "pointer" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Ic.SearchWhite()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800 }}>Rechercher un établissement</div>
                <div style={{ color: t2, fontSize: "11.5px" }}>Hôpitaux, mairies, banques, ambassades…</div>
              </div>
              <span style={{ color: t2 }}>{Ic.Chev()}</span>
            </button>
          </>
        ) : (
          <>
            <div style={{ margin: "0 -16px" }}>
              <InstitutionsRecentesSection isDark={isDark} t1={t1} t2={t2} card={card} brd={brd}/>
            </div>

            {/* Gros CTA illustré, permanent — bifurcation explicite vers la
                recherche d'établissements. */}
            <div style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "20px", padding: "20px", marginTop: "18px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ flexShrink: 0 }}>{Ic.CtaIllustration()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: t1, fontSize: "15px", fontWeight: 900, marginBottom: "4px" }}>Besoin d&apos;un établissement ?</div>
                <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.4, marginBottom: "12px" }}>Hôpitaux, mairies, banques, ambassades et bien plus.</div>
                <button onClick={allerVersRecherchePrincipale} className="tap" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#F5A623", color: "#080812", fontWeight: 800, fontSize: "13px", padding: "10px 16px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                  Rechercher un établissement
                </button>
              </div>
            </div>

            {/* Grille de sujets */}
            <div style={{ color: t1, fontSize: "14px", fontWeight: 800, marginBottom: "12px" }}>Dans votre compte</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
              {grid.map(item => (
                <Link key={item.href} href={item.href} onClick={onClose} className="tap" style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px", textDecoration: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {item.badge()}
                  <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800, lineHeight: 1.25 }}>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Explorer d'autres sujets — groupé par section (Pour vous /
                Mon activité / Profil / Aide et support), pas un seul bloc
                de pills en vrac. */}
            <div style={{ color: t1, fontSize: "14px", fontWeight: 800, marginBottom: "14px" }}>Explorer d&apos;autres sujets</div>
            {pillSections.map(({ section, items }) => (
              <div key={section} style={{ marginBottom: "18px" }}>
                <div style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>{section}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {items.map(item => (
                    <Link key={item.href} href={item.href} onClick={onClose} className="tap" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#EBEBF0", color: t1, fontSize: "12.5px", fontWeight: 700, padding: "9px 14px", borderRadius: "20px", textDecoration: "none" }}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Recherches récentes */}
            {recents.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Recherches récentes</span>
                  <button onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecents([]); }} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>Tout effacer</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {recents.map(q => (
                    <div key={q} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 4px" }}>
                      <span style={{ color: t3, flexShrink: 0 }}>{Ic.Search()}</span>
                      <button onClick={() => setQuery(q)} className="tap" style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: t1, fontSize: "13.5px", fontWeight: 600, cursor: "pointer", padding: 0 }}>{q}</button>
                      <button onClick={() => setRecents(retirerRechercheRecente(q))} aria-label="Retirer" className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>{Ic.Close()}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
