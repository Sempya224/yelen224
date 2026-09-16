import type { Viewport } from "next";

// Layout minimal, sans chrome dashboard — même principe que
// app/clock/[slug]/layout.tsx (portail employé Clock In Shift), la seule
// route déjà isolée du même genre dans ce projet. Impératif technique, pas
// esthétique : app/[slug]/[id]/layout.tsx monte tout le dashboard avant
// `{children}` (voir docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md, §3) —
// YELEN Accueil doit donc vivre hors de cet arbre.
export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function CheckInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
