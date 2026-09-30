"use client";

// Sélecteur de langue du Centre légal (header + footer), façon DoorDash
// (retour Bryan 23/09/2026) — même principe que
// app/guide-prestataire/components/LanguageSwitcher.tsx : cosmétique et
// volontairement NON branché sur le cookie yelen224_locale/next-intl.
// Sur les 5 documents du Centre légal, seul Mentions légales a une vraie
// traduction anglaise (POC i18n, 23/09/2026) ; brancher ce sélecteur sur
// le vrai système changerait réellement cette seule page tout en restant
// sans effet (mensonger) sur les 4 autres. Français seul actif ;
// anglais/arabe "Bientôt disponible" — décision confirmée par Bryan.
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";

type LangCode = "fr" | "en" | "ar";

const LANGUAGES: { code: LangCode; label: string; comingSoon?: boolean }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English", comingSoon: true },
  { code: "ar", label: "العربية", comingSoon: true },
];

const ACTIVE: LangCode = "fr";

const GLOBE = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

// variant "pill" = compact, pour le header (comme le Help Center).
// variant "block" = ligne pleine largeur, pour le footer (comme le
// bloc "English (US)" du footer mobile DoorDash).
// forceTheme : pour les pages toujours claires indépendantes du thème
// global (ex. /contact, /ambassades — jamais de useTheme() chez elles) —
// évite un rendu thème sombre incohérent sur un fond blanc figé.
export function LegalLanguageSwitcher({ variant = "pill", forceTheme }: { variant?: "pill" | "block"; forceTheme?: "light" | "dark" }) {
  const { theme: themeCtx } = useTheme();
  const theme = forceTheme ?? themeCtx;
  const C = T[theme];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isBlock = variant === "block";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuPositionStyle: CSSProperties = isBlock ? { left: 0, right: 0 } : { right: 0 };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: isBlock ? "100%" : undefined, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choisir une langue"
        style={{
          display: "flex", alignItems: "center", gap: "8px", width: isBlock ? "100%" : undefined,
          justifyContent: isBlock ? "space-between" : "flex-start",
          height: isBlock ? "48px" : "36px",
          padding: isBlock ? "0 14px" : "0 10px 0 9px",
          borderRadius: isBlock ? "10px" : "999px",
          border: `1.5px solid ${C.borderCard}`,
          backgroundColor: isBlock ? C.cardBg : "transparent",
          color: C.text, fontWeight: 700, fontSize: isBlock ? "14px" : "12px",
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {GLOBE}
          {isBlock ? "Français" : "FR"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s ease", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Langues disponibles"
          style={{
            position: "absolute", top: "calc(100% + 8px)", ...menuPositionStyle,
            zIndex: 120, minWidth: "200px", margin: 0, padding: "6px", listStyle: "none",
            backgroundColor: C.cardBg, border: `1px solid ${C.borderCard}`, borderRadius: "12px",
            boxShadow: "0 12px 32px rgba(26,18,0,0.18)",
          }}
        >
          {LANGUAGES.map(l => (
            <li key={l.code} role="option" aria-selected={l.code === ACTIVE}>
              <button
                type="button"
                disabled={l.comingSoon}
                onClick={() => { if (!l.comingSoon) setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: "10px", width: "100%",
                  padding: "10px 12px", border: "none", borderRadius: "8px",
                  backgroundColor: "transparent", color: l.comingSoon ? C.textFaint : C.text,
                  fontSize: "13.5px", fontWeight: 600, textAlign: "left",
                  cursor: l.comingSoon ? "not-allowed" : "pointer",
                }}
              >
                <span lang={l.code} dir={l.code === "ar" ? "rtl" : undefined}>{l.label}</span>
                {l.comingSoon ? (
                  <span style={{ marginLeft: "auto", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: C.textFaint, backgroundColor: C.footerBg, border: `1px solid ${C.borderCard}`, borderRadius: "999px", padding: "3px 8px" }}>
                    Bientôt
                  </span>
                ) : l.code === ACTIVE ? (
                  <svg style={{ marginLeft: "auto", flexShrink: 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
