"use client";

// Barre d'outils unique des rendez-vous (refonte UI 20/10/2026, étape 2).
// Fusionne les 8 pastilles de statut, la recherche, la date, le service et le
// tri. Aucun état ici : layout.tsx garde rdvFilter, rdvSearch, rdvDateFilter,
// rdvServiceFilter, rdvSort, rdvFiltersOpen et leurs setters.
import { type ThemeTokens } from "../../theme";
import { ClockSearchField, ComboField, DateField, FilterChips } from "../ClockInShiftUi";

export type StatutSegment = { key: string; label: string; count: number; alerte?: boolean };
export type TriRdv = "prochain" | "recent" | "ancien";

const TRIS: { value: TriRdv; label: string }[] = [
  { value: "prochain", label: "Prochain d'abord" },
  { value: "recent", label: "Plus récent" },
  { value: "ancien", label: "Plus ancien" },
];

export function AppointmentsToolbar({ C, segments, statut, onStatut, search, onSearch, date, onDate, service, onService, serviceOptions, filtersOpen, onToggleFilters, sort, onSort, total, onReset }: {
  C: ThemeTokens; segments: StatutSegment[]; statut: string; onStatut: (k: string) => void;
  search: string; onSearch: (v: string) => void; date: string; onDate: (v: string) => void;
  service: string; onService: (v: string) => void; serviceOptions: string[];
  filtersOpen: boolean; onToggleFilters: () => void; sort: TriRdv; onSort: (v: TriRdv) => void; total: number; onReset: () => void;
}) {
  const nbFiltres = (date ? 1 : 0) + (service ? 1 : 0);
  const statutActif = segments.find(s => s.key === statut);
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (statut !== "tous" && statutActif) chips.push({ key: "statut", label: statutActif.label, onRemove: () => onStatut("tous") });
  if (search.trim()) chips.push({ key: "q", label: `« ${search.trim()} »`, onRemove: () => onSearch("") });
  if (date) chips.push({ key: "date", label: new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }), onRemove: () => onDate("") });
  if (service) chips.push({ key: "service", label: service, onRemove: () => onService("") });
  const aFiltre = chips.length > 0;

  return (
    <div style={{ marginBottom: "16px" }}>
      <style>{`
        .apt-seg{display:none}
        .apt-segmenu{display:block;width:220px;max-width:100%;margin-bottom:12px}
        .apt-extra{display:${filtersOpen ? "flex" : "none"};align-items:center;gap:10px;flex-wrap:wrap}
        .apt-filtres{display:inline-flex}
        @media(min-width:1280px){
          .apt-seg{display:flex}
          .apt-segmenu{display:none}
          .apt-extra{display:flex}
          .apt-filtres{display:none}
        }
        .apt-segbtn:focus-visible,.apt-tb:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      `}</style>

      <div className="apt-seg" role="group" aria-label="Filtrer par statut" style={{ gap: "2px", overflowX: "auto", borderBottom: `1px solid ${C.border}`, marginBottom: "12px" }}>
        {segments.map(sg => {
          const on = sg.key === statut;
          return (
            <button key={sg.key} type="button" aria-pressed={on} onClick={() => onStatut(sg.key)} className="apt-segbtn tap"
              style={{ height: "38px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: "-1px", color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {sg.label}
              {sg.alerte && sg.count > 0 && <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.red }}/>}
              <span style={{ color: sg.alerte && sg.count > 0 ? C.red : C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{sg.count}</span>
            </button>
          );
        })}
      </div>
      <div className="apt-segmenu">
        <ComboField C={C} id="apt-statut" compact sansAucun valeur={statut} onChange={onStatut} options={segments.map(sg => ({ value: sg.key, label: `${sg.label} (${sg.count})` }))}/>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <ClockSearchField C={C} value={search} onChange={onSearch} width={320} label="Rechercher un rendez-vous" placeholder="Rechercher un rendez-vous, un client, un service…"/>
        <button type="button" className="apt-tb apt-filtres tap" aria-expanded={filtersOpen} onClick={onToggleFilters}
          style={{ height: "34px", padding: "0 12px", alignItems: "center", gap: "6px", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "12.5px", fontWeight: 500, cursor: "pointer" }}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filtres
          {nbFiltres > 0 && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{nbFiltres}</span>}
        </button>
        <div className="apt-extra">
          <div style={{ position: "relative", width: "190px" }}>
            <DateField C={C} id="apt-date" value={date} onChange={onDate} vide="Choisir une date"/>
            {date && (
              <button type="button" className="apt-tb tap" aria-label="Effacer la date" onClick={() => onDate("")}
                style={{ position: "absolute", right: "6px", top: "7px", zIndex: 2, width: "26px", height: "26px", background: "none", border: "none", borderRadius: "6px", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          <div style={{ width: "210px" }}>
            <ComboField C={C} id="apt-service" valeur={service} onChange={onService} aucunLabel="Tous les services" options={serviceOptions.map(s => ({ value: s, label: s }))}/>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span aria-live="polite" style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{total} rendez-vous</span>
          {aFiltre && <button type="button" className="apt-tb tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: C.t2, fontSize: "13px" }}>Trier :</span>
            <div style={{ width: "170px" }}><ComboField C={C} id="apt-tri" compact sansAucun valeur={sort} onChange={v => onSort(v as TriRdv)} options={TRIS}/></div>
          </div>
        </div>
      </div>
      <FilterChips C={C} chips={chips}/>
    </div>
  );
}
