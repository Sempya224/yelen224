"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { CompteRechercheOverlay } from "@/components/CompteRechercheOverlay";
import { YelenLoader } from "@/components/YelenLoader";

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
// `rightAction` (retour Bryan 24/08/2026, écran "Mon QR Code") : remplace
// le duo recherche/FAQ par une seule action personnalisée à droite —
// nécessaire ici plutôt qu'un simple ajout à côté, car "Mon QR Code" n'a
// besoin ni de la recherche compte ni du lien FAQ, juste d'un raccourci
// vers le Yelen ID. Optionnel, n'affecte aucun des autres écrans qui ne
// le passent pas.
// Indicateur de position de scroll — même implémentation que app/page.tsx
// (lignes ~2735-2758 et ~3919-3947, chantier Accueil du 23/07/2026 : "les
// standards internationaux utilisent une ligne verticale à droite"),
// reprise à l'identique ici plutôt que réinventée (retour Bryan
// 29/08/2026) : hauteur du trait proportionnelle à la portion de page
// réellement visible (viewport/hauteur totale), pas une taille fixe.
// Visible seulement pendant le défilement, s'estompe ~0.9s après l'arrêt
// (mêmes valeurs que page.tsx). Noir sur fond clair, doré sur fond sombre.
function ScrollPositionBar({ isDark }: { isDark: boolean }) {
  const [pct, setPct] = useState(0);
  const [thumbH, setThumbH] = useState(0);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const viewport = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const max = total - viewport;
      setPct(max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0);
      setThumbH(total > 0 ? Math.min(Math.max(viewport / total, 0.08), 1) : 1);
      setShown(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShown(false), 900);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div aria-hidden style={{
      position: "fixed", top: "calc(env(safe-area-inset-top) + 64px)", bottom: "env(safe-area-inset-bottom)",
      right: "3px", width: "3px", zIndex: 90, pointerEvents: "none",
      opacity: shown ? 1 : 0, transition: "opacity 0.4s ease",
    }}>
      <div style={{
        position: "absolute", top: `${pct * (1 - thumbH) * 100}%`, height: `${thumbH * 100}%`, width: "100%",
        borderRadius: "3px", background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)",
      }}/>
    </div>
  );
}

export function CompteHeader({ titre, fondNeutre, retourHref, onBackIntercept, rightAction }: {
  titre: string; fondNeutre?: boolean; retourHref?: string; onBackIntercept?: () => void;
  rightAction?: { icon: React.ReactNode; label: string; onClick: () => void };
}) {
  const router = useRouter();
  const [rechercheOpen, setRechercheOpen] = useState(false);
  // Ligne de séparation façon DoorDash (retour Bryan 29/08/2026) : invisible
  // tant que l'écran est en haut, n'apparaît qu'au scroll — jamais figée
  // comme avant. Bordure transparente plutôt que "none" pour ne jamais
  // faire varier la hauteur du header de 1px à l'apparition/disparition.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  // V2 (retour Bryan 28/08/2026, même traitement que components/CitoyenMenu.tsx)
  // — le bandeau doré plein #F5A623 (09/08/2026) est retiré : fond neutre
  // partout, sur les ~29 écrans "Mon Compte" comme sur les écrans /menu/*.
  // `fondNeutre` accepté pour compatibilité d'appel (aucun des ~29 sites
  // n'a besoin d'être modifié) mais n'a plus d'effet différenciant — le
  // header est désormais toujours dans cet état "neutre", qu'il soit
  // passé ou non.
  void fondNeutre;
  const headerBg   = bg;
  const headerText = t1;
  const chipBg     = card2;
  const chipIcon   = headerText;
  const chipBrd    = brd;
  const chipShadow = "none";

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 100, background: headerBg, borderBottom: `1px solid ${scrolled ? brd : "transparent"}`, transition: "border-color 0.15s ease", paddingTop: "env(safe-area-inset-top)" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <ScrollPositionBar isDark={isDark}/>
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
          {rightAction ? (
            <button onClick={rightAction.onClick} aria-label={rightAction.label} className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, flexShrink: 0, cursor: "pointer" }}>
              {rightAction.icon}
            </button>
          ) : (
            <>
              {/* Recherche compte (point d'entrée unique, 26/07/2026) —
                  overlay ouvert/fermé ici (pas une route, cf.
                  CompteRechercheOverlay), CompteHeader étant le header
                  partagé par tous les écrans /compte/* et /menu/*. */}
              <button onClick={() => setRechercheOpen(true)} className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, flexShrink: 0, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </button>
              <Link href="/faq" className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", background: chipBg, border: `1px solid ${chipBrd}`, boxShadow: chipShadow, display: "flex", alignItems: "center", justifyContent: "center", color: chipIcon, textDecoration: "none", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
              </Link>
            </>
          )}
        </div>
      </div>
      {rechercheOpen && <CompteRechercheOverlay onClose={() => setRechercheOpen(false)}/>}
    </header>
  );
}

// État de chargement partagé (retour Bryan 29/08/2026) — remplace le
// pattern jusque-là dupliqué individuellement sur chacun des ~29 écrans
// Compte (`if (loading) return <div centré><YelenLoader/></div>`, header
// absent pendant ce temps). Garde désormais le header réel visible (titre
// + bouton retour utilisable) pendant le chargement, seul le contenu en
// dessous est remplacé par le loader — mêmes props que CompteHeader pour
// rester un remplacement direct du même appel.
export function CompteLoadingScreen({ titre, fondNeutre, retourHref, onBackIntercept }: {
  titre: string; fondNeutre?: boolean; retourHref?: string; onBackIntercept?: () => void;
}) {
  const { theme } = useTheme();
  const bg = theme === "dark" ? "#0A0A0F" : "#F2F2F7";
  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg }}>
      <CompteHeader titre={titre} fondNeutre={fondNeutre} retourHref={retourHref} onBackIntercept={onBackIntercept}/>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "100px 0" }}>
        <YelenLoader size={40}/>
      </div>
    </div>
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
