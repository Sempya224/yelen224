"use client";

// Navigation du Centre légal Yelen — desktop : colonne permanente,
// réductible (retour Bryan 24/09/2026 : libérer de la place pour le
// contenu/Sommaire sans perdre l'accès à la liste de documents — un
// clic sur le chevron suffit à rouvrir) ; mobile : panneau déroulant
// (même contenu, deux présentations, jamais deux sources de données —
// voir lib/legalNav.ts). Le déclencheur mobile vit désormais dans
// LegalHeader (icône documents) pour éviter le double bandeau "nom du
// document" (bar + fil d'Ariane + titre de page, retour Bryan
// 23/09/2026) — état partagé via LegalMobileNavContext. LegalTableOfContents
// (Sommaire) n'a volontairement pas ce même repli — décision explicite,
// reste toujours visible en colonne sur desktop.
// "Votre espace" n'apparaît que pour un citoyen connecté (même détection
// que LegalHeader) et pointe vers la surface personnalisée déjà
// existante (/compte/confidentialite) — ce n'est jamais un document
// supplémentaire.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { LEGAL_NAV_GROUPS } from "@/lib/legalNav";
import { useLegalMobileNav } from "./LegalMobileNavContext";

const VOTRE_ESPACE_HREF = "/compte/confidentialite";
const SIDEBAR_REDUITE_KEY = "yelen224_legal_sidebar_reduite";

export function LegalSidebar() {
  const { theme } = useTheme();
  const C = T[theme];
  const pathname = usePathname();
  // Même arbitrage que LegalHeader : lu après montage uniquement pour
  // matcher le rendu serveur (pas de localStorage côté serveur) et
  // éviter un mismatch d'hydratation.
  const [connecte, setConnecte] = useState(false);
  const [reduite, setReduite] = useState(false);
  const { ouvert: mobileOuvert, setOuvert: setMobileOuvert } = useLegalMobileNav();

  useEffect(() => {
    try { setConnecte(!!localStorage.getItem(YELEN224_USER_ID_KEY)); } catch {}
    try { setReduite(localStorage.getItem(SIDEBAR_REDUITE_KEY) === "1"); } catch {}
  }, []);

  function toggleReduite() {
    setReduite(v => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_REDUITE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  function renderGroups() {
    return (
      <>
        {LEGAL_NAV_GROUPS.map(group => (
          <div key={group.titre} style={{ marginBottom: "20px" }}>
            <div style={{ color: C.textFaint, fontSize: "10px", fontWeight: "700", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "8px", padding: "0 8px" }}>{group.titre}</div>
            {group.items.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOuvert(false)}
                  style={{
                    display: "block", padding: "9px 12px", borderRadius: "8px", marginBottom: "2px",
                    fontSize: "13px", fontWeight: active ? 700 : 500,
                    color: active ? "#F5A623" : C.textSubtle,
                    backgroundColor: "transparent",
                    border: active ? "1px solid rgba(245,166,35,0.3)" : "1px solid transparent",
                    borderLeft: active ? "2px solid #F5A623" : "2px solid transparent",
                    textDecoration: "none",
                  }}
                >{item.label}</Link>
              );
            })}
          </div>
        ))}
        {connecte && (
          <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: `1px solid ${C.borderSubtle}` }}>
            <div style={{ color: C.textFaint, fontSize: "10px", fontWeight: "700", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "8px", padding: "0 8px" }}>Votre espace</div>
            <Link
              href={VOTRE_ESPACE_HREF}
              onClick={() => setMobileOuvert(false)}
              style={{ display: "block", padding: "9px 12px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, color: C.textSubtle, textDecoration: "none" }}
            >Légal &amp; confidentialité</Link>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <nav
        className="legal-sidebar-desktop"
        style={{
          width: reduite ? "44px" : "240px", flexShrink: 0,
          padding: reduite ? "24px 8px" : "24px 12px",
          borderRight: `1px solid ${C.borderSubtle}`,
          position: "sticky", top: "64px", alignSelf: "flex-start",
          maxHeight: "calc(100vh - 64px)", overflowY: "auto", overflowX: "hidden",
          transition: "width 0.16s ease, padding 0.16s ease",
        }}
      >
        <button
          type="button"
          onClick={toggleReduite}
          aria-label={reduite ? "Déplier la navigation du Centre légal" : "Réduire la navigation du Centre légal"}
          aria-expanded={!reduite}
          title={reduite ? "Déplier la navigation" : "Réduire la navigation"}
          style={{
            display: "flex", alignItems: "center", justifyContent: reduite ? "center" : "flex-end",
            width: "100%", padding: "6px", marginBottom: "16px",
            background: "none", border: "none", borderRadius: "6px",
            color: C.textFaint, cursor: "pointer", flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points={reduite ? "9 6 15 12 9 18" : "15 6 9 12 15 18"} />
          </svg>
        </button>
        {!reduite && renderGroups()}
      </nav>

      {mobileOuvert && (
        <div className="legal-sidebar-mobile" style={{ padding: "12px 16px", borderBottom: `1px solid ${C.borderSubtle}` }}>
          <div style={{ padding: "12px", borderRadius: "12px", border: `1px solid ${C.borderCard}`, backgroundColor: C.cardBg }}>
            {renderGroups()}
          </div>
        </div>
      )}
    </>
  );
}
