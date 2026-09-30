"use client";

// Shell partagé du Centre légal Yelen (chantier Legal Yelen — architecture
// globale de navigation, 23/09/2026). Route group `(legal)` : n'ajoute
// aucun segment d'URL, les 5 documents existants gardent leurs routes
// publiques exactes (/cgu, /confidentialite, /politique-cookies,
// /mentions-legales, /conditions-prestataires). Auto-hébergée Inter
// (Lot 1.5, 13/08/2026) — conservée ici, décision assumée de ne pas
// basculer le Centre légal sur la police de marque (Plus_Jakarta_Sans)
// dans ce chantier de navigation.
import { Inter } from "next/font/google";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { LegalHeader } from "./_components/LegalHeader";
import { LegalSidebar } from "./_components/LegalSidebar";
import { LegalFooter } from "./_components/LegalFooter";
import { LegalBreadcrumb } from "./_components/LegalBreadcrumb";
import { LegalScrollToTop } from "./_components/LegalScrollToTop";
import { LegalMobileNavProvider } from "./_components/LegalMobileNavContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-inter" });

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const C = T[theme];

  return (
    <div className={inter.variable} style={{ minHeight: "100vh", backgroundColor: C.cardBg, color: C.text, fontFamily: "var(--font-inter), -apple-system, sans-serif", transition: "background-color 0.3s ease, color 0.3s ease", display: "flex", flexDirection: "column" }}>
      <style>{`
        .legal-sidebar-mobile { display: none; }
        @media (max-width: 899px) {
          .legal-sidebar-desktop { display: none !important; }
          .legal-sidebar-mobile { display: block; }
          /* La ligne sidebar+contenu restait en row (défaut flex) sous
             899px : le menu déroulant mobile (largeur intrinsèque) et le
             contenu (flex:1) se retrouvaient côte à côte au lieu
             d'empilés, poussant tout l'article hors écran à droite. */
          .legal-content-row { flex-direction: column; }
        }
      `}</style>

      <LegalMobileNavProvider>
        <LegalHeader/>

        <div className="legal-content-row" style={{ flex: 1, display: "flex", width: "100%", maxWidth: "1280px", margin: "0 auto" }}>
          <LegalSidebar/>
          <main style={{ flex: 1, minWidth: 0 }}>
            <LegalBreadcrumb/>
            {children}
          </main>
        </div>
      </LegalMobileNavProvider>

      <LegalFooter/>
      <LegalScrollToTop/>
    </div>
  );
}
