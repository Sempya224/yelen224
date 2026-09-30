"use client";

import { useEffect, useId, useRef, useState } from "react";
import { T, type ThemeTokens } from "../theme";
import { useTheme } from "@/components/ThemeProvider";
import type { TabKey } from "@/lib/institutionPermissions";
import { getGuidesForTab } from "@/lib/helpCenter/dashboardMapping";

// Aide contextuelle dashboard → Help Center public (chantier "Contextual
// Help", lot 24/09/2026 — docs/product/YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md
// §12). Aucune logique métier propre à un écran : consomme uniquement
// lib/helpCenter/dashboardMapping.ts (source de vérité) et construit l'URL
// déjà verrouillée de la route publique (§2, /guide-prestataire/[domaine]/[article])
// — aucun nouveau système de routing, aucune URL codée en dur par écran
// appelant. Se masque proprement (return null) si aucun guide n'existe
// encore pour ce TabKey : jamais un lien cassé, jamais un href="#".
//
// Nouvel onglet volontaire (target=_blank) : même convention que le lien
// "Support" du footer dashboard (layout.tsx) — la destination est publique,
// indépendante du dashboard (principe 9 de l'architecture), on ne fait
// jamais quitter le tableau de bord en cours.
export function HelpCenterGuide({ tab }: { tab: TabKey }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const guides = getGuidesForTab(tab);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Aucun guide associé à ce TabKey pour l'instant — masqué proprement,
  // jamais un lien mort (§7 du brief).
  if (guides.length === 0) return null;

  const iconGuide = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.4-1.1 1.9-1.7 2.7-.3.4-.3.8-.3 1.1" />
      <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
    </svg>
  );

  // Styles alignés sur components/ui/Button.tsx (variant="secondary" size="sm")
  // sans réutiliser le composant lui-même : le cas 1 guide doit rester un
  // vrai <a> sémantique (§8 du brief), pas un <button onClick> qui ouvrirait
  // la navigation via JS — Button ne rend qu'un <button>.
  const pillStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "6px",
    height: "32px", padding: "0 12px", borderRadius: "7px",
    border: `1px solid ${C.border2}`, backgroundColor: C.bgCard2,
    color: C.t1, fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
    textDecoration: "none", whiteSpace: "nowrap", cursor: "pointer",
  };

  // Un seul guide : lien direct, jamais un intermédiaire (§3 du brief).
  if (guides.length === 1) {
    const article = guides[0];
    return (
      <a
        href={`/guide-prestataire/${article.domaine}/${article.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="yelen-focus-ring"
        style={pillStyle}
        aria-label={`Consulter le guide Yelen : ${article.titre}`}
      >
        {iconGuide}
        Guide
      </a>
    );
  }

  // Plusieurs guides : jamais un choix arbitraire (§5 du brief) — popover
  // de sélection, chaque entrée reste un vrai lien.
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="yelen-focus-ring"
        style={pillStyle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(v => !v)}
      >
        {iconGuide}
        Guide
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Guides disponibles pour cet écran"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
            minWidth: "260px", maxWidth: "320px", backgroundColor: C.bgCard,
            border: `1px solid ${C.border2}`, borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "6px",
          }}
        >
          <div style={{ padding: "6px 8px", fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", color: C.t3 }}>
            Guides disponibles
          </div>
          {guides.map(article => (
            <a
              key={article.id}
              href={`/guide-prestataire/${article.domaine}/${article.id}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="yelen-focus-ring"
              style={{
                display: "block", padding: "8px", borderRadius: "8px",
                color: C.t1, fontSize: "12.5px", fontWeight: 600,
                textDecoration: "none", lineHeight: 1.35,
              }}
              onClick={() => setOpen(false)}
            >
              {article.titre}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
