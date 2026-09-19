import type { Viewport } from "next";

// Override du themeColor global (app/layout.tsx, doré #F5A623 pour tout le
// site) — uniquement pour le portail public /clock/[slug] : demande Bryan
// 10/09/2026, barre de statut mobile neutre/blanche sur cet écran précis,
// pas une décision produit qui s'applique au reste de l'app. page.tsx est
// "use client" (impossible d'y exporter viewport directement, doit passer
// par un layout serveur).
export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function ClockSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
