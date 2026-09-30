"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { CategorieGrid } from "../CategorieGrid";

// "Catégories" — écran dédié façon Yelp ("Home services" : retour + titre
// + grille complète), ouvert depuis la tuile "Plus" de la grille "Que
// voulez-vous faire ?" sur l'écran principal (app/menu/projets/projets-client.tsx,
// qui n'affiche plus que 5 catégories + cette tuile). Le choix d'une
// catégorie ici ne rouvre pas son propre formulaire de création (éviterait
// de dupliquer ~90 lignes de formulaire) : il revient sur l'écran
// principal via `?secteur=`, qui rouvre la création pré-remplie (voir le
// useEffect dédié dans projets-client.tsx).
//
// Les 15 catégories réelles de Yelen (lib/activiteVisuels.tsx, mêmes que
// l'écran Recherche) — décision Bryan 27/09/2026, remplace les 9 SECTEURS
// institution utilisés dans une première version (voir migration
// 20260927000002_citoyen_projets_taxonomie_activites.sql).

export function CategoriesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombreCard = isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)";

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}`}</style>
      <CompteHeader titre="Catégories"/>
      <main style={{ padding: "16px 16px 100px" }}>
        <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "4px" }}>Que voulez-vous faire ?</div>
        <div style={{ color: t2, fontSize: "12.5px", marginBottom: "16px" }}>Veuillez sélectionner une catégorie</div>
        <CategorieGrid onSelect={(code) => router.push(`/menu/projets?secteur=${code}`)} card={card} brd={brd} t1={t1} t2={t2} ombreCard={ombreCard}/>
      </main>
    </div>
  );
}
