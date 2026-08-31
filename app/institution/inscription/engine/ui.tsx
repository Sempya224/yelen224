"use client";

import { YelenLoader } from "@/components/YelenLoader";
import type { SignupThemeTokens } from "./theme";

// Atomes visuels partagés par toutes les étapes — un seul système de
// bouton/champ/erreur pour tout le moteur (règle Mission 01 : "un seul
// système" par type d'élément d'interface).

export function fieldLabelStyle(C: SignupThemeTokens): React.CSSProperties {
  return { color: C.dark2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: "8px" };
}

export function textInputStyle(C: SignupThemeTokens, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%", padding: "14px 16px", borderRadius: "12px",
    border: `1.5px solid ${C.border}`, backgroundColor: C.card,
    color: C.dark, fontSize: "15px", fontWeight: 600, transition: "all 0.2s",
    ...extra,
  };
}

// Bandeau d'erreur partagé par toutes les étapes du wizard. Coins
// volontairement carrés (retour CEO 20/08/2026, cohérence avec le style
// "Supabase Yelen" déjà en place ailleurs dans le produit) — jamais
// d'arrondi sur ce composant, contrairement aux cartes/champs autour de lui.
// actionLabel/onAction optionnels (retour CEO 20/08/2026, ReviewStep.tsx :
// une erreur qui nécessite de revenir à une étape antérieure — ex. code de
// vérification expiré — doit offrir un clic direct vers cette étape, pas
// seulement l'expliquer en obligeant plusieurs clics "Retour" successifs).
// Rétrocompatible : sans ces props, le rendu est strictement identique à
// avant pour tous les autres appels de ce composant.
export function ErrorBanner({ msg, C, actionLabel, onAction }: { msg: string; C: SignupThemeTokens; actionLabel?: string; onAction?: () => void }) {
  return (
    <div role="alert" aria-live="assertive" style={{ padding: "12px 16px", backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: 0, marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span style={{ color: C.red, fontSize: "13px", fontWeight: 600 }}>{msg}</span>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="signup-tap" style={{ marginTop: "8px", marginLeft: "26px", background: "none", border: "none", color: C.red, fontSize: "12.5px", fontWeight: 800, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, loading, loadingLabel, C, type = "button" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; loadingLabel?: string;
  C: SignupThemeTokens; type?: "button" | "submit";
}) {
  const isDisabled = Boolean(disabled || loading);
  // Gris neutre dédié à l'état désactivé du CTA — jamais C.gray3 (qui a une
  // teinte dorée, "#EDE8D8" en clair) : un bouton désactivé doit se lire
  // comme "inactif", pas comme "une variante approximative du doré Yelen".
  // Le SEUL doré de ce bouton, dans toute étape du parcours, est C.gold
  // (#F5A623) à l'état actif — jamais une autre valeur.
  const disabledBg = C.isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB";
  const disabledText = C.isDark ? "rgba(255,255,255,0.32)" : "#9CA3AF";
  return (
    <button type={type} onClick={onClick} disabled={isDisabled} className="signup-tap signup-cta"
      style={{
        width: "100%", padding: "16px", borderRadius: "14px", border: "none",
        background: isDisabled ? disabledBg : C.gold,
        color: isDisabled ? disabledText : "#111", fontSize: "16px", fontWeight: 800,
        cursor: isDisabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
        boxShadow: isDisabled ? "none" : `0 8px 24px ${C.gold}40`, transition: "all 0.2s",
      }}>
      {loading ? <><YelenLoader size={18} color={C.gray}/> {loadingLabel || "Chargement…"}</> : children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, C, ariaLabel }: { children: React.ReactNode; onClick: () => void; C: SignupThemeTokens; ariaLabel?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="signup-tap"
      style={{ background: "none", border: "none", color: C.gray, fontSize: "13.5px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", padding: "8px 0" }}>
      {children}
    </button>
  );
}

export function StepHeading({ title, subtitle, C }: { title: string; subtitle?: React.ReactNode; C: SignupThemeTokens }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h1 style={{ color: C.dark, fontSize: "24px", fontWeight: 900, letterSpacing: "-0.5px", marginBottom: subtitle ? "8px" : 0, lineHeight: 1.2 }}>{title}</h1>
      {subtitle && <p style={{ color: C.gray, fontSize: "14px", lineHeight: 1.55 }}>{subtitle}</p>}
    </div>
  );
}
