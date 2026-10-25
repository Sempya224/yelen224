"use client";

// Barre d'onglets soulignés (style Cloudflare/Stripe), partagée par Équipe
// & Accès et le Centre d'Analyse — composant de présentation pur : l'onglet
// actif et sa synchronisation avec l'URL (?subtab=) sont gérés par
// l'appelant. Fondu sur les bords quand la barre défile (petits écrans).
import { useEffect, useRef, useState } from "react";
import type { ThemeTokens } from "../../theme";

export type TeamTabItem<K extends string> = { key: K; label: string; count?: number };

export function TeamTabs<K extends string>({ C, tabs, active, onChange, trailing, idPrefix, ariaLabel = "Sections Équipe et accès" }: {
  C: ThemeTokens; tabs: TeamTabItem<K>[]; active: K; onChange: (key: K) => void; trailing?: React.ReactNode; idPrefix: string; ariaLabel?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fonduG, setFonduG] = useState(false);
  const [fonduD, setFonduD] = useState(false);

  function majFondus() {
    const el = scrollRef.current;
    if (!el) return;
    setFonduG(el.scrollLeft > 2);
    setFonduD(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }
  useEffect(() => {
    majFondus();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(majFondus);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const k = tabs[next].key;
    onChange(k);
    refs.current[k]?.focus();
  }

  const fondu = (cote: "left" | "right"): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 0, [cote]: 0, width: "24px", pointerEvents: "none",
    background: `linear-gradient(to ${cote === "left" ? "right" : "left"}, ${C.bg}, transparent)`,
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", borderBottom: `1px solid ${C.border}`, marginBottom: "20px" }}>
      <div style={{ position: "relative", minWidth: 0 }}>
        <div ref={scrollRef} onScroll={majFondus} role="tablist" aria-label={ariaLabel} style={{ display: "flex", gap: "4px", overflowX: "auto", scrollbarWidth: "none" }}>
          {tabs.map((t, i) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                ref={el => { refs.current[t.key] = el; }}
                role="tab"
                id={`${idPrefix}-tab-${t.key}`}
                aria-selected={isActive}
                aria-controls={`${idPrefix}-panel-${t.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChange(t.key)}
                onKeyDown={e => onKeyDown(e, i)}
                style={{
                  background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  padding: "10px 12px", marginBottom: "-1px", fontSize: "14px", fontWeight: isActive ? 600 : 500,
                  color: isActive ? C.t1 : C.t2,
                  borderBottom: `2px solid ${isActive ? C.gold : "transparent"}`,
                  display: "inline-flex", alignItems: "center", gap: "6px",
                }}
              >
                {t.label}
                {t.count !== undefined && (
                  <span style={{ fontSize: "12px", fontWeight: 600, color: C.t3, backgroundColor: C.bg3, borderRadius: "10px", padding: "1px 7px" }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
        {fonduG && <div aria-hidden="true" style={fondu("left")}/>}
        {fonduD && <div aria-hidden="true" style={fondu("right")}/>}
      </div>
      {trailing && <div style={{ flexShrink: 0, paddingBottom: "10px" }}>{trailing}</div>}
    </div>
  );
}
