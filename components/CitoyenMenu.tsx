"use client";

import Link from "next/link";
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
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const yelenId = userId ? formatYelenId(userId) : "YL-????-????";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: bg, overflowY: "auto", animation: "menuFadeIn 0.2s ease", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        @keyframes menuFadeIn{from{opacity:0}to{opacity:1}}
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
      `}</style>

      {/* Bandeau = header du menu (retour CEO 25/07/2026 : le X séparé
          au-dessus d'une carte identique aux autres cartes de l'app ne se
          distinguait pas — ici c'est un vrai bandeau propre à cet espace).
          Fond doré Yelen (même dégradé que CompteHeader/CarteIdentiteCompte,
          retour CEO 25/07/2026 : cohérence de marque) en mode clair, neutre
          en mode sombre (même logique que le reste de l'app). Tape dessus →
          onglet Compte (pas l'écran profil séparé), le X ferme le menu. */}
      <div style={{ position: "relative", background: isDark ? bg : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)", borderRadius: "0 0 28px 28px", paddingTop: "env(safe-area-inset-top)", overflow: "hidden", borderBottom: isDark ? `1px solid ${brd}` : "none" }}>
        <div style={{ position: "absolute", top: "-60px", right: "-40px", width: "200px", height: "200px", borderRadius: "50%", background: isDark ? "radial-gradient(circle,rgba(245,166,35,0.16) 0%,transparent 70%)" : "radial-gradient(circle,rgba(0,0,0,0.05) 0%,transparent 70%)", pointerEvents: "none" }}/>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 4px", position: "relative" }}>
          <span style={{ fontSize: "10px", fontWeight: "800", color: isDark ? "#F5A623" : "rgba(8,8,18,0.55)", letterSpacing: "1.5px" }}>CONÇU POUR VOUS</span>
          <button onClick={onClose} className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "rgba(0,0,0,0.14)", border: isDark ? `1px solid ${brd}` : "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
            {MenuIc.Close()}
          </button>
        </div>

        <button onClick={onOpenCompte} className="tap" style={{ display: "flex", width: "100%", alignItems: "center", gap: "12px", padding: "10px 16px 22px", background: "none", border: "none", cursor: "pointer", position: "relative", textAlign: "left" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: "50px", height: "50px", borderRadius: "50%", overflow: "hidden", backgroundColor: isDark ? "#2C2C2E" : "rgba(0,0,0,0.14)", backdropFilter: isDark ? undefined : "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", fontWeight: "800", color: isDark ? "#fff" : "#080812" }}>
              {userPhoto ? <img src={userPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : initials}
            </div>
            {identiteVerifiee && (
              <div style={{ position: "absolute", bottom: "-2px", right: "-2px", width: "17px", height: "17px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", border: isDark ? "2px solid #1C1C1E" : "2px solid #E8960A" }}>
                {MenuIc.Check()}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: isDark ? "#fff" : "#080812", fontSize: "17px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName || "Mon compte"}</div>
            <div style={{ fontFamily: "monospace", fontSize: "12px", color: isDark ? "#8E8E93" : "rgba(8,8,18,0.6)", fontWeight: "600", letterSpacing: "0.5px", marginTop: "2px" }}>{yelenId}</div>
          </div>
          <span style={{ color: isDark ? "#8E8E93" : "rgba(8,8,18,0.5)", flexShrink: 0 }}>{MenuIc.Chev()}</span>
        </button>
      </div>

      <div style={{ padding: "16px 16px 40px" }}>
        <div style={{ backgroundColor: card, borderRadius: "16px", overflow: "hidden" }}>
          {ITEMS.map((item, i) => (
            <Link key={item.href} href={item.href} className="tap" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "10px 14px", textDecoration: "none", borderBottom: i < ITEMS.length - 1 ? `1px solid ${brd}` : "none" }}>
              <div style={{ flexShrink: 0, lineHeight: 0 }}>{item.badge()}</div>
              <span style={{ color: t1, fontSize: "15px", fontWeight: "600", flex: 1 }}>{item.label}</span>
              <span style={{ color: t2 }}>{MenuIc.Chev()}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
