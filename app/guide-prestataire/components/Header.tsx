"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HeaderSearch } from "./HeaderSearch";
import { HeaderMobileMenu } from "./HeaderMobileMenu";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useInstitutionAccount } from "./useInstitutionAccount";

const CHEVRON_LEFT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const PERSON_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
  </svg>
);

// Header du Centre d'aide prestataires — Guest/Authenticated (retour Bryan
// 30/09/2026 : "pareil pour Help Center côté institution", même traitement
// que app/(legal)/_components/LegalHeader.tsx). Sorti de layout.tsx (Server
// Component, ne peut pas détenir cet état) en un seul Client Component
// plutôt que plusieurs sous-composants séparés, pour ne faire qu'un seul
// appel à useInstitutionAccount() (évite 2 requêtes réseau dupliquées vers
// /api/institution/auth/me pour la même information).
export function Header() {
  const router = useRouter();
  const { role, nomCompte, dashboardHref } = useInstitutionAccount();

  function retourDashboard() {
    if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; }
    router.push(dashboardHref ?? "/guide-prestataire");
  }

  return (
    <header className="hc-header">
      {role === "institution" ? (
        <div className="hc-brand hc-brand--auth">
          <button type="button" onClick={retourDashboard} className="hc-back-pill">
            {CHEVRON_LEFT}
            <span className="hc-back-pill-text">Retour au tableau de bord</span>
          </button>
          {nomCompte && (
            <>
              <span className="hc-brand-sep" aria-hidden="true"/>
              <Link href="/guide-prestataire" className="hc-account-name">{nomCompte}</Link>
            </>
          )}
        </div>
      ) : (
        <Link href="/guide-prestataire" className="hc-brand">
          <span className="hc-brand-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1200" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </span>
          <span>
            <span className="hc-brand-title">YELEN224</span>
            <span className="hc-brand-sub">CENTRE D&apos;AIDE PRESTATAIRES</span>
          </span>
        </Link>
      )}

      <HeaderSearch/>

      <div className="hc-header-actions">
        <LanguageSwitcher/>
        {role === "institution" && (
          <Link href={dashboardHref ?? "/guide-prestataire"} aria-label="Mon tableau de bord Yelen" className="hc-avatar">
            {PERSON_ICON}
          </Link>
        )}
        <Link href="/contact" className="hc-contact-link hc-contact-link--header">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
          </svg>
          <span className="hc-contact-link-text">Contacter le support</span>
        </Link>
        <HeaderMobileMenu/>
      </div>
    </header>
  );
}
