import type { Metadata } from "next";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ScrollProgress } from "./components/ScrollProgress";
import "./help-center.css";

// Yelen Provider Help Center — Couche publique (scaffolding, 22/09/2026).
// Route indépendante du dashboard (app/[slug]/[id]/) : aucune session,
// aucun TabKey, aucun rôle requis pour charger quoi que ce soit ici
// (principe 9, docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md).
// Light-only V1 — voir help-center.css.
//
// Header extrait en Client Component (30/09/2026, retour Bryan : "pareil
// pour Help Center côté institution") — détecte une session institution
// (JWT httpOnly, voir Header.tsx::useInstitutionAccount) pour remplacer le
// logo par "Retour au tableau de bord" + nom de l'institution, même
// principe que app/(legal)/_components/LegalHeader.tsx. Un visiteur garde
// le header d'origine, identique à avant.

export const metadata: Metadata = {
  title: { default: "Centre d'aide prestataires", template: "%s | Centre d'aide prestataires Yelen" },
  description: "Réponses vérifiées pour gérer votre établissement sur Yelen224 : rendez-vous, équipe, sécurité, facturation.",
};

export default function GuidePrestataireLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hc">
      <a href="#hc-content" className="hc-skip-link">Aller au contenu</a>

      <ScrollProgress />

      <Header/>

      <main id="hc-content" className="hc-shell">
        {children}
      </main>

      <Footer />
    </div>
  );
}
