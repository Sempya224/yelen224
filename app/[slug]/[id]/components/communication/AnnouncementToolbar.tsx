"use client";

// Barre d'outils de la liste d'annonces (refonte UI 20/10/2026) : recherche,
// statut en segments avec compteurs, format en menu déroulant, puce de
// filtre actif, compteur. Présentation pure — la logique de filtrage
// (`filtered`) reste dans CommunicationTab.
import { useEffect, useRef } from "react";
import type { ThemeTokens } from "../../theme";

export function AnnouncementToolbar({ C, search, onSearch, statuts, statut, onStatut, formats, format, onFormat, total, resetVisible, onReset }: {
  C: ThemeTokens; search: string; onSearch: (v: string) => void;
  statuts: { key: string; label: string; count: number }[]; statut: string; onStatut: (k: string) => void;
  formats: { key: string; label: string }[]; format: string; onFormat: (k: string) => void;
  total: number; resetVisible: boolean; onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const radios = useRef<Record<string, HTMLButtonElement | null>>({});

  // Raccourci « / » (ignoré pendant une saisie ou si l'écran est masqué —
  // workspace persistant : offsetParent === null).
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
    const k = statuts[(i + (suiv ? 1 : -1) + statuts.length) % statuts.length].key;
    onStatut(k);
    radios.current[k]?.focus();
  }

  const formatLabel = formats.find(f => f.key === format)?.label;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ position: "relative", width: "320px", maxWidth: "100%" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: "11px", top: "10px" }}>
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef} type="text" aria-label="Rechercher une annonce" value={search}
            onChange={e => onSearch(e.target.value)} placeholder="Rechercher une annonce…"
            style={{ width: "100%", height: "36px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "14px", padding: "0 34px" }}
          />
          {search && (
            <button onClick={() => { onSearch(""); inputRef.current?.focus(); }} aria-label="Effacer la recherche" className="tap" style={{ position: "absolute", right: "6px", top: "6px", width: "24px", height: "24px", border: "none", background: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <div role="radiogroup" aria-label="Filtrer par statut" style={{ display: "inline-flex", gap: "2px", padding: "2px", backgroundColor: C.bg3, borderRadius: "10px", overflowX: "auto", maxWidth: "100%" }}>
          {statuts.map((s, i) => {
            const on = s.key === statut;
            return (
              <button
                key={s.key} ref={el => { radios.current[s.key] = el; }}
                role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                onClick={() => onStatut(s.key)} onKeyDown={e => onKeyDown(e, i)}
                style={{ flexShrink: 0, height: "30px", padding: "0 12px", border: "none", borderRadius: "8px", cursor: "pointer", backgroundColor: on ? C.bgCard : "transparent", color: on ? C.t1 : C.t2, fontSize: "13px", fontWeight: on ? 600 : 500, whiteSpace: "nowrap", boxShadow: on ? `inset 0 -2px 0 ${C.gold}` : "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {s.label}
                <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
              </button>
            );
          })}
        </div>

        <select aria-label="Filtrer par format" value={format} onChange={e => onFormat(e.target.value)} style={{ height: "36px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t1, fontSize: "14px", padding: "0 12px" }}>
          {formats.map(f => <option key={f.key} value={f.key}>{f.key === "tous" ? "Tous les formats" : f.label}</option>)}
        </select>

        <span aria-live="polite" style={{ marginLeft: "auto", color: C.t3, fontSize: "13px" }}>{total} annonce{total > 1 ? "s" : ""}</span>
      </div>

      {resetVisible && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
          {format !== "tous" && formatLabel && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: C.bg3, color: C.t1, fontSize: "12px", fontWeight: 500, padding: "4px 6px 4px 10px", borderRadius: "14px" }}>
              Format : {formatLabel}
              <button onClick={() => onFormat("tous")} aria-label={`Retirer le filtre Format : ${formatLabel}`} style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, display: "flex", padding: "2px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          )}
          <button onClick={onReset} className="tap" style={{ background: "none", border: "none", cursor: "pointer", color: C.t2, fontSize: "13px", fontWeight: 600, padding: "4px 6px" }}>Réinitialiser</button>
        </div>
      )}
    </div>
  );
}
