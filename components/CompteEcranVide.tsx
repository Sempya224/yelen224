"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { CompteRechercheOverlay } from "@/components/CompteRechercheOverlay";

// En-tête partagé par tous les écrans "Mon Compte" (créés vides le
// 18/07/2026, contenu réel ajouté progressivement depuis). Retour (icône
// seule, sans libellé — convention Uber/Instagram, 24/07/2026) à gauche,
// titre au centre, "?" (aide → /faq) à droite — même action retour
// qu'utilisée sur la fiche établissement et le flux de prise de RDV. Le
// header des onglets Accueil/Recherche/RDV/Compte dans
// app/page.tsx n'a lui plus de bouton retour — la barre du bas suffit déjà
// à naviguer entre onglets, contrairement à ces écrans internes. Palette
// identique à la carte "Mon compte" de page.tsx (bg/t1/t3/card2/brd), ces
// écrans en étant les enfants directs.
// `retourHref` (retour CEO 25/07/2026) : destination fixe au lieu de
// router.back() — nécessaire pour les écrans /menu/* dont l'entrée
// d'historique précédente est "/" avec le menu FERMÉ (remontage complet
// de app/page.tsx) ; router.back() y renverrait donc l'utilisateur à
// l'Accueil normal au lieu de rouvrir le menu d'où il venait.
// `onBackIntercept` (retour CEO 25/07/2026, écran "Vos centres d'intérêt")
// : si fourni, le bouton retour appelle cette fonction à la place de la
// navigation habituelle — permet à un écran avec changements non
// enregistrés (ex. formulaire) de bloquer la sortie et proposer
// d'enregistrer avant de partir. Optionnel, n'affecte aucun des ~29
// autres écrans qui ne le passent pas.
export function CompteHeader({ titre, fondNeutre, retourHref, onBackIntercept }: { titre: string; fondNeutre?: boolean; retourHref?: string; onBackIntercept?: () => void }) {
  const router = useRouter();
  const [rechercheOpen, setRechercheOpen] = useState(false);
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
  // Mode sombre volontairement laissé neutre, inchangé. `fondNeutre` (retour
  // CEO 25/07/2026) retire ce bandeau doré pour les écrans du nouveau menu
  // engagement (/menu/*) — ces écrans ne sont pas rattachés à "Mon Compte".
  const headerBg   = (isDark || fondNeutre) ? bg : "linear-gradient(160deg,#F5A623 0%,#E8960A 45%,#C8740A 100%)";
  const headerText = (isDark || fondNeutre) ? t1 : "#080812";
  // Boutons identiques à ceux du header de la fiche établissement / RDV
  // (fond doré plein, icône blanche, ombre) — même action retour partout.
  // Chip translucide neutre au lieu d'un fond doré plein — retour CEO
  // 23/07/2026, même traitement que app/page.tsx.
  const chipBg     = (isDark || fondNeutre) ? card2 : "rgba(0,0,0,0.14)";
  const chipIcon   = (isDark || fondNeutre) ? headerText : "#fff";
  const chipBrd    = (isDark || fondNeutre) ? brd : "rgba(255,255,255,0.18)";
  const chipShadow = (isDark || fondNeutre) ? "none" : "0 1px 3px rgba(0,0,0,0.1)";

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 100, background: headerBg, borderBottom: (isDark || fondNeutre) ? `1px solid ${brd}` : "none", paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      {/* Grille 1fr/auto/1fr — garde le titre centré indépendamment de la
          largeur du chip retour à gauche vs. le bouton "?" à droite. */}
      <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
        <button onClick={() => onBackIntercept ? onBackIntercept() : (retourHref ? router.push(retourHref) : router.back())} className="tap" style={{ justifySelf: "start", display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: headerText, minWidth: 0 }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, flexShrink: 0 }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </div>
        </button>
        <div style={{ color: headerText, fontSize: "16px", fontWeight: "800", minWidth: 0, maxWidth: "180px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</div>
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Recherche compte (point d'entrée unique, 26/07/2026) — overlay
              ouvert/fermé ici (pas une route, cf. CompteRechercheOverlay),
              CompteHeader étant le header partagé par tous les écrans
              /compte/* et /menu/*. */}
          <button onClick={() => setRechercheOpen(true)} className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, flexShrink: 0, cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          <Link href="/faq" className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, textDecoration: "none", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
          </Link>
        </div>
      </div>
      {rechercheOpen && <CompteRechercheOverlay onClose={() => setRechercheOpen(false)}/>}
    </header>
  );
}

export function CompteEcranVide({ titre, fondNeutre, retourHref }: { titre: string; fondNeutre?: boolean; retourHref?: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg = isDark ? "#0A0A0F" : "#F2F2F7";
  const t3 = isDark ? "#636366" : "#AEAEB2";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <CompteHeader titre={titre} fondNeutre={fondNeutre} retourHref={retourHref}/>
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ color: t3, fontSize: "14px", fontWeight: "600" }}>Contenu à venir</div>
      </div>
    </div>
  );
}
