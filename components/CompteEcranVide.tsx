"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";

// En-tête partagé par tous les écrans "Mon Compte" (créés vides le
// 18/07/2026, contenu réel ajouté progressivement depuis). Retour (icône +
// texte) à gauche, titre au centre, "?" (aide → /faq) à droite — même
// action retour qu'utilisée sur la fiche établissement et le flux de prise
// de RDV (icône+libellé identiques partout où un retour est réellement
// nécessaire). Le header des onglets Accueil/Recherche/RDV/Compte dans
// app/page.tsx n'a lui plus de bouton retour — la barre du bas suffit déjà
// à naviguer entre onglets, contrairement à ces écrans internes. Palette
// identique à la carte "Mon compte" de page.tsx (bg/t1/t3/card2/brd), ces
// écrans en étant les enfants directs.
export function CompteHeader({ titre }: { titre: string }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  // Fond doré identique au hero de l'onglet Accueil (même dégradé), façon
  // Booking : le bandeau de couleur de marque s'étend derrière la barre de
  // statut du téléphone sur tous les écrans "Mon Compte" (CompteHeader est
  // le point d'entrée unique consommé par les ~29 écrans /compte/*).
  // Mode sombre volontairement laissé neutre, inchangé.
  const headerBg   = isDark ? bg : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
  const headerText = isDark ? t1 : "#080812";
  const headerSub  = isDark ? "rgba(255,255,255,0.55)" : "rgba(8,8,18,0.65)";
  // Boutons identiques à ceux du header de la fiche établissement / RDV
  // (fond doré plein, icône blanche, ombre) — même action retour partout.
  const chipBg     = isDark ? card2 : "#F5A623";
  const chipIcon   = isDark ? headerText : "#fff";
  const chipBrd    = isDark ? brd : "transparent";
  const chipShadow = isDark ? "none" : "0 2px 8px rgba(245,166,35,0.35)";

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 100, background: headerBg, borderBottom: isDark ? `1px solid ${brd}` : "none" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      {/* Grille 1fr/auto/1fr — le titre reste centré même si le bloc
          "Retour" (icône+texte) est plus large que le bouton "?" seul. */}
      <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
        <button onClick={() => router.back()} className="tap" style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: 0, cursor: "pointer", color: headerText, minWidth: 0 }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, flexShrink: 0 }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </div>
          <span style={{ color: headerSub, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap" }}>Retour</span>
        </button>
        <div style={{ color: headerText, fontSize: "16px", fontWeight: "800", minWidth: 0, maxWidth: "180px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</div>
        <Link href="/faq" className="tap" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, textDecoration: "none", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </Link>
      </div>
    </header>
  );
}

export function CompteEcranVide({ titre }: { titre: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg = isDark ? "#0A0A0F" : "#F2F2F7";
  const t3 = isDark ? "#636366" : "#AEAEB2";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <CompteHeader titre={titre}/>
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ color: t3, fontSize: "14px", fontWeight: "600" }}>Contenu à venir</div>
      </div>
    </div>
  );
}
