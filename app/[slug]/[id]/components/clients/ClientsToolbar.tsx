"use client";

// Barre d'outils « Mes clients » (refonte UI 20/10/2026) : recherche,
// segments, compteur. Les segments sont des TRIS (`sortBy`), pas des
// filtres : ils réordonnent la liste sans la réduire — d'où le
// `radiogroup` (un seul actif, flèches qui sélectionnent) plutôt que des
// onglets de panneaux distincts.
import { useEffect, useRef } from "react";
import type { ThemeTokens } from "../../theme";

export type Segment<K extends string> = { key: K; label: string; count?: number };

export function ClientsToolbar<K extends string>({ C, search, onSearch, segments, active, onActive, total, resetVisible, onReset }: {
  C: ThemeTokens; search: string; onSearch: (v: string) => void;
  segments: Segment<K>[]; active: K; onActive: (k: K) => void;
  total: number; resetVisible: boolean; onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const radios = useRef<Record<string, HTMLButtonElement | null>>({});

  // Raccourci « / » : focus la recherche, sauf pendant une saisie ou si
  // l'écran est masqué (workspace persistant : offsetParent === null).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const el = inputRef.current;
      if (!el || el.offsetParent === null) return;
      e.preventDefault();
      el.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const suiv = e.key === "ArrowRight" || e.key === "ArrowDown";
    const prec = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!suiv && !prec) return;
    e.preventDefault();
    const k = segments[(i + (suiv ? 1 : -1) + segments.length) % segments.length].key;
    onActive(k);
    radios.current[k]?.focus();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
      <div style={{ position: "relative", width: "360px", maxWidth: "100%" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: "11px", top: "10px" }}>
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          ref={inputRef} type="text" aria-label="Rechercher un client" value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher un client (nom, téléphone)…"
          style={{ width: "100%", height: "36px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "14px", padding: "0 34px 0 34px" }}
        />
        {search && (
          <button onClick={() => { onSearch(""); inputRef.current?.focus(); }} aria-label="Effacer la recherche" className="tap" style={{ position: "absolute", right: "6px", top: "6px", width: "24px", height: "24px", border: "none", background: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Ordre d'affichage des clients" style={{ display: "inline-flex", gap: "2px", padding: "2px", backgroundColor: C.bg3, borderRadius: "10px", overflowX: "auto", maxWidth: "100%" }}>
        {segments.map((s, i) => {
          const on = s.key === active;
          return (
            <button
              key={s.key} ref={el => { radios.current[s.key] = el; }}
              role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              onClick={() => onActive(s.key)} onKeyDown={e => onKeyDown(e, i)}
              style={{
                flexShrink: 0, height: "30px", padding: "0 12px", border: "none", borderRadius: "8px", cursor: "pointer",
                backgroundColor: on ? C.bgCard : "transparent", color: on ? C.t1 : C.t2,
                fontSize: "13px", fontWeight: on ? 600 : 500, whiteSpace: "nowrap",
                boxShadow: on ? `inset 0 -2px 0 ${C.gold}` : "none",
                display: "inline-flex", alignItems: "center", gap: "6px",
              }}
            >
              {s.label}
              {s.count !== undefined && <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>}
            </button>
          );
        })}
      </div>

      {resetVisible && (
        <button onClick={onReset} className="tap" style={{ background: "none", border: "none", cursor: "pointer", color: C.t2, fontSize: "13px", fontWeight: 600, padding: "4px 6px" }}>Réinitialiser</button>
      )}
      <span aria-live="polite" style={{ marginLeft: "auto", color: C.t3, fontSize: "13px" }}>{total} client{total > 1 ? "s" : ""}</span>
    </div>
  );
}
