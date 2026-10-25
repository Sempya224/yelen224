"use client";

// Grille et barre d'outils de l'Agenda (refonte UI 20/10/2026) : composants
// purement présentationnels. AgendaSection.tsx garde le chargement, la
// navigation de période, les formulaires et toute la logique d'événements ;
// ici on ne fait que dessiner ce qu'on nous passe (semaine, mois, légende).
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../../theme";
import { type Evenement, typeColor, typeLabel, toISODate, IconUser } from "./AgendaOverlays";
import { heureAmPm } from "@/lib/heure";

export type RdvLite = { id: string; objet: string | null; date_rdv: string; heure_rdv: string; statut: string; citoyen_nom: string; citoyen_phone: string | null };

export const AGENDA_HOUR_H = 52;
const HEURES = 24;
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const hhmm = (t: string | null | undefined): string => (t ? t.slice(0, 5) : "");
// hhmm reste le format de CALCUL (minutesDe). Tout ce qui s'affiche passe par
// affHeure : 12 h AM/PM via lib/heure.ts.
const affHeure = (t: string | null | undefined): string => (t ? heureAmPm(t) || t.slice(0, 5) : "");
function minutesDe(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

export function AgendaStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .agx-grid{display:grid;grid-template-columns:56px repeat(7,minmax(0,1fr));min-width:720px}
      .agx-ev:focus-visible,.agx-btn:focus-visible,.agx-cell:focus-visible{outline:2px solid ${C.gold};outline-offset:1px}
      .agx-ev:hover{filter:brightness(.98)}
      .agx-cell:hover{background-color:${C.bgCard2}}
      @media(prefers-reduced-motion:reduce){.agx-ev,.agx-btn{transition:none!important}}
    `}</style>
  );
}

// ── Légende (statique : aucune logique de filtre par type n'existe) ──────
const LEGENDE = (C: ThemeTokens) => [
  { l: "RDV", c: C.blue }, { l: "Rappel", c: C.gold }, { l: "Réunion", c: C.purple }, { l: "Bloqué", c: C.red }, { l: "Autre", c: C.teal },
];

export function AgendaToolbar({ C, libelle, view, onView, onToday, onPrev, onNext, onNew }: {
  C: ThemeTokens; libelle: string; view: "semaine" | "mois"; onView: (v: "semaine" | "mois") => void;
  onToday: () => void; onPrev: () => void; onNext: () => void; onNew: () => void;
}) {
  const ui = toUiTokens(C);
  const carre: React.CSSProperties = { width: "34px", height: "34px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer" };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 16px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={onToday}>Aujourd&apos;hui</Button>
        <div style={{ display: "inline-flex", gap: "4px" }}>
          <button type="button" className="agx-btn tap" aria-label="Période précédente" onClick={onPrev} style={carre}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <button type="button" className="agx-btn tap" aria-label="Période suivante" onClick={onNext} style={carre}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
        <span aria-live="polite" style={{ color: C.t1, fontSize: "16px", fontWeight: 600, textTransform: "capitalize" }}>{libelle}</span>
        <div role="group" aria-label="Vue" style={{ display: "inline-flex", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden", backgroundColor: C.bgCard }}>
          {(["semaine", "mois"] as const).map((v, i) => {
            const on = view === v;
            return (
              <button key={v} type="button" aria-pressed={on} onClick={() => onView(v)} className="agx-btn tap"
                style={{ height: "34px", padding: "0 14px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: on ? C.bg3 : "transparent", color: on ? C.t1 : C.t2, fontSize: "13px", fontWeight: on ? 600 : 500, cursor: "pointer", textTransform: "capitalize", boxShadow: on ? `inset 0 -2px 0 ${C.gold}` : "none" }}>{v}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px" }}>
        <ul aria-label="Légende des types" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", listStyle: "none", margin: 0, padding: 0 }}>
          {LEGENDE(C).map(it => (
            <li key={it.l} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px" }}>
              <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: it.c }}/>{it.l}
            </li>
          ))}
        </ul>
        <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onNew}
          icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>
          Planifier un événement
        </Button>
      </div>
    </div>
  );
}

// ── Semaine ──────────────────────────────────────────────────────────────
type Bloc = {
  key: string; kind: "rdv" | "event"; start: number; end: number; couleur: string; typeLibelle: string;
  titre: string; personne: string | null; heure: string; onOpen: () => void;
};
type Place = { bloc: Bloc; col: number; cols: number };

function disposer(blocs: Bloc[]): Place[] {
  const tries = [...blocs].sort((a, b) => a.start - b.start || a.end - b.end);
  const places: Place[] = [];
  let groupe: Place[] = [];
  let finGroupe = -1;
  const clore = () => { const cols = Math.max(1, ...groupe.map(p => p.col + 1)); groupe.forEach(p => { p.cols = cols; }); places.push(...groupe); groupe = []; };
  for (const b of tries) {
    if (groupe.length > 0 && b.start >= finGroupe) { clore(); finGroupe = -1; }
    const occupees = new Set(groupe.filter(p => p.bloc.end > b.start).map(p => p.col));
    let col = 0; while (occupees.has(col)) col++;
    groupe.push({ bloc: b, col, cols: 1 });
    finGroupe = Math.max(finGroupe, b.end);
  }
  if (groupe.length > 0) clore();
  return places;
}

export function AgendaWeekGrid({ C, days, itemsForDay, personne, todayIso, now, onColumnClick, onOpenEvent, onOpenRdv, hauteur }: {
  C: ThemeTokens; days: Date[]; itemsForDay: (iso: string) => { events: Evenement[]; rdv: RdvLite[] };
  personne: (e: Evenement) => string | null; todayIso: string; now: Date;
  onColumnClick: (iso: string, e: ReactMouseEvent<HTMLDivElement>) => void; onOpenEvent: (e: Evenement) => void; onOpenRdv: (r: RdvLite) => void; hauteur: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Au montage : on amène l'heure courante (ou 07:00) dans la fenêtre visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maintenant = new Date();
    const cible = Math.max(0, (days.some(d => toISODate(d) === toISODate(maintenant)) ? maintenant.getHours() * 60 + maintenant.getMinutes() - 60 : 7 * 60));
    el.scrollTop = (cible / 60) * AGENDA_HOUR_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const total = HEURES * AGENDA_HOUR_H;
  const ouvrir = (fn: () => void) => ({
    onClick: (e: ReactMouseEvent) => { e.stopPropagation(); fn(); },
    onKeyDown: (e: ReactKeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); fn(); } },
  });

  return (
    <div ref={scrollRef} style={{ height: hauteur, minHeight: "420px", overflow: "auto", border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard }}>
      <div className="agx-grid">
        {/* en-têtes (collants en haut) */}
        <div style={{ position: "sticky", top: 0, left: 0, zIndex: 5, backgroundColor: C.bgCard, borderBottom: `1px solid ${C.border}`, height: "52px" }}/>
        {days.map((day, i) => {
          const iso = toISODate(day);
          const auj = iso === todayIso;
          return (
            <div key={iso} style={{ position: "sticky", top: 0, zIndex: 4, backgroundColor: C.bgCard, borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, height: "52px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px" }}>
              <span style={{ color: auj ? C.t1 : C.t2, fontSize: "12px", fontWeight: 500 }}>{JOURS_COURTS[i]}</span>
              <span aria-label={day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                style={{ minWidth: "26px", height: "26px", padding: "0 6px", borderRadius: "13px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 600, fontVariantNumeric: "tabular-nums", backgroundColor: auj ? C.gold : "transparent", color: auj ? "#000" : C.t1 }}>{day.getDate()}</span>
            </div>
          );
        })}

        {/* colonne des heures (collante à gauche) */}
        <div style={{ position: "sticky", left: 0, zIndex: 3, backgroundColor: C.bgCard, height: `${total}px` }}>
          {Array.from({ length: HEURES }, (_, h) => (
            <div key={h} style={{ position: "absolute", top: `${h * AGENDA_HOUR_H}px`, right: "8px", transform: h === 0 ? "none" : "translateY(-7px)", color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{String(h).padStart(2, "0")}:00</div>
          ))}
        </div>

        {days.map(day => {
          const iso = toISODate(day);
          const auj = iso === todayIso;
          const { events, rdv } = itemsForDay(iso);
          const blocs: Bloc[] = [
            ...rdv.map<Bloc>(r => {
              const s = minutesDe(hhmm(r.heure_rdv));
              return { key: `r-${r.id}`, kind: "rdv", start: s, end: s + 30, couleur: C.blue, typeLibelle: "RDV", titre: r.objet || "RDV général", personne: r.citoyen_nom, heure: affHeure(r.heure_rdv), onOpen: () => onOpenRdv(r) };
            }),
            ...events.map<Bloc>(e => {
              const s = minutesDe(hhmm(e.heure_debut) || "09:00");
              const f = e.heure_fin ? minutesDe(hhmm(e.heure_fin)) : s + 30;
              return { key: `e-${e.id}`, kind: "event", start: s, end: Math.max(f, s + 15), couleur: typeColor(e.type, C), typeLibelle: typeLabel(e.type), titre: e.titre, personne: personne(e), heure: `${affHeure(e.heure_debut) || "—"}${e.heure_fin ? `–${affHeure(e.heure_fin)}` : ""}`, onOpen: () => onOpenEvent(e) };
            }),
          ];
          return (
            <div key={iso} onClick={e => onColumnClick(iso, e)} style={{ position: "relative", height: `${total}px`, borderLeft: `1px solid ${C.border}`, backgroundColor: auj ? `${C.gold}0a` : undefined, cursor: "pointer" }}>
              {Array.from({ length: HEURES }, (_, h) => (
                <div key={h} style={{ position: "absolute", top: `${h * AGENDA_HOUR_H}px`, left: 0, right: 0, borderTop: `1px solid ${C.border}`, opacity: 0.7 }}/>
              ))}
              {auj && (
                <div aria-hidden="true" style={{ position: "absolute", top: `${(nowMin / 60) * AGENDA_HOUR_H}px`, left: 0, right: 0, zIndex: 2, pointerEvents: "none", display: "flex", alignItems: "center" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.gold, marginLeft: "-4px", flexShrink: 0 }}/>
                  <span style={{ flex: 1, height: "2px", backgroundColor: C.gold }}/>
                </div>
              )}
              {disposer(blocs).map(({ bloc: b, col, cols }) => {
                const top = (b.start / 60) * AGENDA_HOUR_H;
                const h = Math.max(((b.end - b.start) / 60) * AGENDA_HOUR_H, 26);
                const infobulle = `${b.titre} — ${b.typeLibelle} ${b.heure}${b.personne ? ` · ${b.personne}` : ""}`;
                return (
                  <div key={b.key} role="button" tabIndex={0} title={infobulle} aria-label={infobulle} className="agx-ev" {...ouvrir(b.onOpen)}
                    style={{ position: "absolute", top: `${top}px`, height: `${h - 2}px`, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, zIndex: 1, boxSizing: "border-box", overflow: "hidden", cursor: "pointer", padding: "3px 6px", borderRadius: "6px", backgroundColor: `${b.couleur}1a`, border: `1px solid ${b.couleur}33`, borderLeft: `3px solid ${b.couleur}` }}>
                    <div style={{ color: C.t2, fontSize: "11.5px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.heure} · {b.typeLibelle}</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{b.titre}</div>
                    {h >= 62 && b.personne && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: C.t3, fontSize: "11.5px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <IconUser color={C.t3}/>{b.personne}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mois ─────────────────────────────────────────────────────────────────
export function AgendaMonthGrid({ C, days, refMonth, itemsForDay, todayIso, onDay }: {
  C: ThemeTokens; days: Date[]; refMonth: number; itemsForDay: (iso: string) => { events: Evenement[]; rdv: RdvLite[] }; todayIso: string; onDay: (iso: string) => void;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden", backgroundColor: C.bgCard }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: `1px solid ${C.border}` }}>
        {JOURS_COURTS.map(j => <div key={j} style={{ textAlign: "center", padding: "8px 0", color: C.t2, fontSize: "12px", fontWeight: 500 }}>{j}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {days.map((day, i) => {
          const iso = toISODate(day);
          const auj = iso === todayIso;
          const { events, rdv } = itemsForDay(iso);
          const tous = [
            ...rdv.map(r => ({ id: `r-${r.id}`, texte: `${affHeure(r.heure_rdv)} RDV · ${r.citoyen_nom}`, couleur: C.blue })),
            ...events.map(e => ({ id: `e-${e.id}`, texte: `${affHeure(e.heure_debut)} ${typeLabel(e.type)} · ${e.titre}`.trim(), couleur: typeColor(e.type, C) })),
          ];
          return (
            <div key={iso} role="button" tabIndex={0} className="agx-cell" onClick={() => onDay(iso)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDay(iso); } }}
              aria-label={`${day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}, ${tous.length} événement${tous.length > 1 ? "s" : ""}`}
              style={{ minHeight: "104px", padding: "6px", cursor: "pointer", borderTop: i >= 7 ? `1px solid ${C.border}` : "none", borderLeft: i % 7 > 0 ? `1px solid ${C.border}` : "none", backgroundColor: auj ? `${C.gold}0a` : undefined, opacity: day.getMonth() === refMonth ? 1 : 0.55, minWidth: 0 }}>
              <span style={{ minWidth: "24px", height: "24px", padding: "0 5px", borderRadius: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums", backgroundColor: auj ? C.gold : "transparent", color: auj ? "#000" : C.t1 }}>{day.getDate()}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                {tous.slice(0, 3).map(it => (
                  <div key={it.id} title={it.texte} style={{ fontSize: "12px", color: C.t1, padding: "1px 5px", borderRadius: "4px", borderLeft: `3px solid ${it.couleur}`, backgroundColor: `${it.couleur}1a`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.texte}</div>
                ))}
                {tous.length > 3 && <div style={{ fontSize: "12px", color: C.t2, paddingLeft: "2px" }}>+{tous.length - 3} de plus</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

