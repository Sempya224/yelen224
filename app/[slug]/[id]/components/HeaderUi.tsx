"use client";

// Briques présentationnelles du header (étape 2, 20/10/2026). Aucune donnée
// ni handler ici : layout.tsx garde tout l'état et construit les props.
import { type ThemeTokens } from "../theme";

export function HeaderStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .hdr-crumb{display:none}
      .hdr-plus{display:none}
      .hdr-sys-d{display:none}
      .hdr-ico{transition:background-color .12s}
      .hdr-ico:hover{background-color:${C.bg3}!important}
      .hdr-ico:focus-visible,.hdr-btn:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .hdr-search-field{width:320px}
      @media(min-width:1024px){
        .hdr-crumb{display:flex}
        .hdr-mobile-id{display:none!important}
        .hdr-sys-m{display:none}
        .hdr-sys-d{display:flex}
        .header-search-icon-mobile{width:36px!important;height:36px!important}
      }
      /* Repli par largeur (≥1024 px seulement) : recherche 320 → 240 px → icône ;
         Scanner libellé → icône ; Feedback / Recommandations / Actualiser → « Plus ».
         Les icônes à badge ou indicateur ne disparaissent jamais. */
      @media(min-width:1024px) and (max-width:1399px){.hdr-search-field{width:240px}}
      @media(min-width:1024px) and (max-width:1179px){
        .header-search-desktop{display:none!important}
        .header-search-icon-mobile{display:flex!important}
      }
      @media(min-width:1024px) and (max-width:1279px){
        .hdr-collapsible{display:none!important}
        .hdr-scan-lbl{display:none}
        .hdr-plus{display:flex}
      }
      @media(prefers-reduced-motion:reduce){.hdr-ico{transition:none!important}}
    `}</style>
  );
}

export function Breadcrumbs({ C, crumbs }: { C: ThemeTokens; crumbs: string[] }) {
  if (crumbs.length === 0) return <div className="hdr-crumb" style={{ flex: 1 }}/>;
  return (
    <nav aria-label="Fil d'Ariane" className="hdr-crumb" style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>
        {crumbs.map((c, i) => {
          const dernier = i === crumbs.length - 1;
          return (
            <li key={`${c}-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexShrink: dernier ? 1 : 0 }}>
              {i > 0 && <span aria-hidden="true" style={{ color: C.t3, fontSize: "14px" }}>/</span>}
              <span aria-current={dernier ? "page" : undefined} title={c} style={{ color: dernier ? C.t1 : C.t3, fontSize: "14px", fontWeight: dernier ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function KbdChip({ C, mac }: { C: ThemeTokens; mac: boolean }) {
  return (
    <kbd aria-hidden="true" title="Ctrl K / ⌘ K" style={{ fontFamily: "inherit", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "5px", padding: "1px 5px", backgroundColor: C.bgCard2, flexShrink: 0, lineHeight: 1.4 }}>{mac ? "⌘ K" : "Ctrl K"}</kbd>
  );
}
