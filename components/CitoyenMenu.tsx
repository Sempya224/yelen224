"use client";

import Link from "next/link";
import Image from "next/image";
import { formatYelenId } from "@/lib/citoyenIdentite";

// Menu plein écran ouvert depuis l'onglet Accueil (remplace le logo Yelen,
// chantier "engagement" du 25/07/2026 — voir CLAUDE.md). Bandeau identité en
// haut (nom + Id Yelen, retour CEO 25/07/2026, façon capture de référence) +
// 5 entrées avec illustrations sur mesure (badges deux tons, pas de simple
// icône trait grise — retour CEO explicite : "pas classique"). Contenu de
// chaque écran encore vide, chantier séparé, un écran à la fois. Monté/
// démonté conditionnellement par le parent (pas de prop "open" booléenne) —
// même convention que LogoutFlow.
const P = { display: "block" };

const MenuIc = {
  Close: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Chev:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
  Check: () => <svg style={P} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

// Illustrations "badge" deux tons (fond pastel + forme pleine), 56px,
// façon Cash App — chaque item a sa propre couleur, pas un simple pictogramme
// gris répété. Formes construites en pur SVG, aucun asset externe.
export const Badge = {
  Calc: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#E0E7FF"/>
      <rect x="17" y="12" width="22" height="32" rx="5" fill="#4F46E5"/>
      <rect x="21" y="16" width="14" height="8" rx="2" fill="#C7D2FE"/>
      <circle cx="22.5" cy="30" r="2.1" fill="#C7D2FE"/><circle cx="28" cy="30" r="2.1" fill="#C7D2FE"/><circle cx="33.5" cy="30" r="2.1" fill="#C7D2FE"/>
      <circle cx="22.5" cy="36.5" r="2.1" fill="#C7D2FE"/><circle cx="28" cy="36.5" r="2.1" fill="#C7D2FE"/><circle cx="33.5" cy="36.5" r="2.1" fill="#C7D2FE"/>
    </svg>
  ),
  Book: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#DCFCE7"/>
      <path d="M28 20c-2.8-2.4-6.6-3.4-10-2.8v18c3.4-.6 7.2.4 10 2.8V20z" fill="#16A34A"/>
      <path d="M28 20c2.8-2.4 6.6-3.4 10-2.8v18c-3.4-.6-7.2.4-10 2.8V20z" fill="#15803D"/>
      <circle cx="38" cy="16" r="5.5" fill="#F5A623"/>
      <text x="38" y="19" fontSize="7" fontWeight="800" fill="#fff" textAnchor="middle">$</text>
    </svg>
  ),
  Trend: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#EDE9FE"/>
      <rect x="16" y="30" width="6" height="12" rx="1.5" fill="#C4B5FD"/>
      <rect x="25" y="24" width="6" height="18" rx="1.5" fill="#A78BFA"/>
      <rect x="34" y="16" width="6" height="26" rx="1.5" fill="#7C3AED"/>
      <path d="M16 22l7-6 6 4 8-9" stroke="#F5A623" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M31 11h6v6" stroke="#F5A623" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Gift: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FFE4E6"/>
      <rect x="16" y="26" width="24" height="16" rx="2" fill="#E11D48"/>
      <rect x="14" y="20" width="28" height="8" rx="2" fill="#FB7185"/>
      <rect x="26" y="20" width="4" height="22" fill="#FFE4E6"/>
      <path d="M28 20c0-4-3.5-7-7-6.5-3 .4-3.6 4.5 0 5.5 2.5.7 5.3.9 7 1z" fill="#FB7185"/>
      <path d="M28 20c0-4 3.5-7 7-6.5 3 .4 3.6 4.5 0 5.5-2.5.7-5.3.9-7 1z" fill="#E11D48"/>
    </svg>
  ),
  Spark: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FEF3C7"/>
      <path d="M29 13c1 5.5 3.5 8 9 9-5.5 1-8 3.5-9 9-1-5.5-3.5-8-9-9 5.5-1 8-3.5 9-9z" fill="#F5A623"/>
      <path d="M17 30c.6 3 2 4.4 5 5-3 .6-4.4 2-5 5-.6-3-2-4.4-5-5 3-.6 4.4-2 5-5z" fill="#E8960A"/>
    </svg>
  ),
  // Cible — "vos centres d'intérêt" pointent l'app vers ce qui compte pour
  // ce citoyen précis, retour CEO 25/07/2026 : "chaque utilisateur doit
  // avoir sa propre expérience".
  Target: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#CFFAFE"/>
      <circle cx="28" cy="28" r="14" fill="none" stroke="#0891B2" strokeWidth="3"/>
      <circle cx="28" cy="28" r="8" fill="none" stroke="#0891B2" strokeWidth="3"/>
      <circle cx="28" cy="28" r="3" fill="#0891B2"/>
    </svg>
  ),
  // Portefeuille — "Mes dépenses" (retour CEO 25/07/2026, façon MoneyLion) :
  // RDV payants + dépenses ajoutées par le citoyen.
  Wallet: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FFEDD5"/>
      <rect x="13" y="17" width="30" height="22" rx="4" fill="#EA580C"/>
      <path d="M13 23h30" stroke="#FFEDD5" strokeWidth="1.6"/>
      <circle cx="35" cy="29" r="3" fill="#FFEDD5"/>
    </svg>
  ),
  // Trophée — "Yelen Rewards" (chantier points, 26/07/2026) : accent doré
  // Yelen plutôt qu'une couleur pastel arbitraire, puisqu'il s'agit
  // directement de la monnaie de marque, pas d'un thème décoratif de plus.
  Trophy: () => (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="28" fill="#FEF3C7"/>
      <path d="M20 16h16v9c0 4.4-3.6 8-8 8s-8-3.6-8-8v-9z" fill="#F5A623"/>
      <path d="M20 18h-4c0 4 2 7 4.6 7.6" fill="none" stroke="#E8960A" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M36 18h4c0 4-2 7-4.6 7.6" fill="none" stroke="#E8960A" strokeWidth="2.4" strokeLinecap="round"/>
      <rect x="25" y="32" width="6" height="6" fill="#E8960A"/>
      <rect x="19" y="38" width="18" height="4" rx="1.5" fill="#C8740A"/>
    </svg>
  ),
};

export const ITEMS: { label: string; href: string; badge: () => React.ReactNode }[] = [
  { label: "Vos centres d'intérêt", href: "/menu/interets",     badge: Badge.Target },
  { label: "Mes dépenses",     href: "/menu/depenses",      badge: Badge.Wallet },
  { label: "Calculatrice",     href: "/menu/calculatrice",  badge: Badge.Calc },
  { label: "Leçons d'argent",  href: "/menu/lecons-argent", badge: Badge.Book },
  { label: "Vos tendances",    href: "/menu/vos-tendances", badge: Badge.Trend },
  { label: "Parrainage",       href: "/menu/parrainage",    badge: Badge.Gift },
  { label: "Yelen Rewards",    href: "/menu/recompenses",   badge: Badge.Trophy },
  { label: "Nouveautés Yelen", href: "/menu/nouveautes",    badge: Badge.Spark },
];
// ⚠️ ITEMS/Badge ci-dessus restent utilisés tels quels par
// components/CompteRechercheOverlay.tsx (hub de recherche "Mon Compte",
// contexte différent) — jamais y toucher pour ce chantier V2, qui ne
// change QUE le rendu propre à CitoyenMenu ci-dessous.

// Refonte V2 (retour Bryan 28/08/2026) — les badges "Cash App" deux tons
// ci-dessus donnaient une impression de liste de fonctionnalités
// décorée ; V2 vise un menu éditorial façon Apple/Revolut : glyphes trait
// monochromes homogènes (un seul langage visuel, jamais une couleur par
// item), regroupés par intention plutôt qu'empilés dans l'ordre
// historique. #F5A623 reste l'unique accent (anneau de l'avatar, chevron
// du profil) — jamais une couleur par ligne.
const LineIc = {
  Target: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>,
  Wallet: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/><circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none"/></svg>,
  Calc: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8"/><circle cx="8.3" cy="12.2" r=".6" fill="currentColor" stroke="none"/><circle cx="12" cy="12.2" r=".6" fill="currentColor" stroke="none"/><circle cx="15.7" cy="12.2" r=".6" fill="currentColor" stroke="none"/><circle cx="8.3" cy="16" r=".6" fill="currentColor" stroke="none"/><circle cx="12" cy="16" r=".6" fill="currentColor" stroke="none"/><circle cx="15.7" cy="16" r=".6" fill="currentColor" stroke="none"/></svg>,
  Book: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Trend: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>,
  Gift: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M12 8c-2 0-3.5-1-3.5-2.5S9.5 3 11 3c1.5 0 1 3 1 5zM12 8c2 0 3.5-1 3.5-2.5S14.5 3 13 3c-1.5 0-1 3-1 5z"/></svg>,
  Trophy: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 1.5 4.5 4 5M17 6h3a1 1 0 0 1 1 1c0 2.5-1.5 4.5-4 5"/></svg>,
  Spark: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>,
};

const SECTIONS: { title: string; items: { label: string; href: string; icon: keyof typeof LineIc }[] }[] = [
  { title: "Votre espace", items: [
    { label: "Vos centres d'intérêt", href: "/menu/interets",     icon: "Target" },
    { label: "Mes dépenses",          href: "/menu/depenses",     icon: "Wallet" },
    { label: "Calculatrice",          href: "/menu/calculatrice", icon: "Calc" },
    { label: "Leçons d'argent",       href: "/menu/lecons-argent",icon: "Book" },
    { label: "Vos tendances",         href: "/menu/vos-tendances",icon: "Trend" },
  ]},
  { title: "Yelen", items: [
    { label: "Parrainage",       href: "/menu/parrainage",  icon: "Gift" },
    { label: "Yelen Rewards",    href: "/menu/recompenses", icon: "Trophy" },
    { label: "Nouveautés Yelen", href: "/menu/nouveautes",  icon: "Spark" },
  ]},
];

export function CitoyenMenu({
  isDark, onClose, onOpenCompte, userId, userName, userPhoto, initials, identiteVerifiee,
}: {
  isDark: boolean;
  onClose: () => void;
  onOpenCompte: () => void;
  userId: string | null;
  userName: string;
  userPhoto: string | null;
  initials: string;
  identiteVerifiee: boolean;
}) {
  const bg     = isDark ? "#0A0A0F" : "#F9F9FB";
  const t1     = isDark ? "#FFFFFF" : "#0d0d1a";
  const t2     = isDark ? "#8E8E93" : "#6C6C70";
  const brd    = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const iconBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const yelenId = userId ? formatYelenId(userId) : "YL-????-????";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: bg, display: "flex", flexDirection: "column", overflow: "hidden", animation: "menuFadeIn 0.2s ease", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        @keyframes menuFadeIn{from{opacity:0}to{opacity:1}}
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
      `}</style>

      {/* En-tête V2 (retour Bryan 28/08/2026) — remplace le bandeau doré
          plein écran/glow décoratif par un accès profil compact et neutre :
          "conserver l'accès en haut, mais le rendre moins massif". Le seul
          accent restant est #F5A623 (anneau de l'avatar, chevron) — plus de
          fond plein coloré. `flexShrink: 0` conservé : reste fixe, seul le
          bloc de sections en dessous défile. */}
      <div style={{ flexShrink: 0, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 16px 0" }}>
          <button onClick={onClose} aria-label="Fermer" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: iconBg, border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer" }}>
            {MenuIc.Close()}
          </button>
        </div>

        <button onClick={onOpenCompte} className="tap" style={{ display: "flex", width: "100%", alignItems: "center", gap: "12px", padding: "8px 16px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: "44px", height: "44px", position: "relative", borderRadius: "50%", overflow: "hidden", backgroundColor: iconBg, border: "1.5px solid #F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "800", color: t1 }}>
              {userPhoto ? <Image src={userPhoto} alt="" fill sizes="44px" style={{ objectFit: "cover" }}/> : initials}
            </div>
            {identiteVerifiee && (
              <div style={{ position: "absolute", bottom: "-1px", right: "-1px", width: "15px", height: "15px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${bg}` }}>
                {MenuIc.Check()}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: t1, fontSize: "15.5px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName || "Mon compte"}</div>
            <div style={{ fontFamily: "monospace", fontSize: "11px", color: t2, fontWeight: "600", letterSpacing: "0.4px", marginTop: "1px" }}>{yelenId}</div>
          </div>
          <span style={{ color: "#F5A623", flexShrink: 0 }}>{MenuIc.Chev()}</span>
        </button>
        <div style={{ height: "1px", background: brd, margin: "0 16px" }}/>
      </div>

      {/* Sections regroupées par intention (retour Bryan 28/08/2026) —
          "Votre espace" / "Yelen", plus une pile plate de 8 lignes
          identiques. Pas de carte englobante : liste à plat sur le fond de
          l'écran, séparateurs très fins entre lignes uniquement (jamais
          entre sections, l'espacement + le libellé suffisent à distinguer
          les groupes — "beaucoup plus de respiration" du brief). */}
      <div style={{ flex: 1, overflowY: "auto", overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "4px 16px 40px" }}>
          {SECTIONS.map((section, si) => (
            <div key={section.title} style={{ marginTop: si === 0 ? "16px" : "30px" }}>
              <div style={{ color: t2, fontSize: "11px", fontWeight: "700", letterSpacing: "0.6px", textTransform: "uppercase", padding: "0 2px 6px" }}>{section.title}</div>
              <div>
                {section.items.map((item, i) => (
                  <Link key={item.href} href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 2px", textDecoration: "none", borderBottom: i < section.items.length - 1 ? `1px solid ${brd}` : "none" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: t1 }}>
                      {LineIc[item.icon]()}
                    </div>
                    <span style={{ color: t1, fontSize: "14.5px", fontWeight: "600", flex: 1 }}>{item.label}</span>
                    <span style={{ color: t2, opacity: 0.7 }}>{MenuIc.Chev()}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
