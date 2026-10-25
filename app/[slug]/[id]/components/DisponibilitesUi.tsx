"use client";

// Composants de présentation de l'onglet Disponibilités (refonte "niveau US",
// 23/10/2026) : carte de jour, champ d'heure 12 h, modales Historique et
// Aperçu citoyen, barre d'enregistrement. Aucune logique métier ici : les
// règles, la génération de créneaux et les handlers d'enregistrement restent
// dans DisponibilitesTab.tsx / lib/disponibilites.ts. Le stockage reste
// "Abbrev HH:MM" en 24 h — la conversion 12 h <-> 24 h se fait uniquement à
// l'affichage et à la saisie (TimeField).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ThemeTokens } from "../theme";
import { toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { generateSlotsInRange, toISODate } from "@/lib/disponibilites";
import { FUSEAU_GUINEE, heureAmPm, heureDepuisHorodatage, jourConakry } from "@/lib/heure";

export type DayDuration = 15 | 30 | 45 | 60;
export type DayRuleView = { active: boolean; start: string; end: string; duration: DayDuration };

const DURATIONS: DayDuration[] = [15, 30, 45, 60];
const OUVERTURE_TOT = 6 * 60;       // avant 6:00 AM : horaire inhabituel
const FERMETURE_TARD = 22 * 60;     // après 10:00 PM : horaire inhabituel
const PREVIEW_COUNT = 8;
const APERCU_COUNT = 12;

export function toMin(v: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function toHHMM(t: number): string {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// "06:30" -> "6:30 AM" ; repli sur la valeur brute si le format est inconnu.
function h12(v: string): string {
  return heureAmPm(v) || v;
}

const NUM: CSSProperties = { fontVariantNumeric: "tabular-nums" };

// ── Styles partagés : mouvement réduit, cibles tactiles, texte masqué ──
export function DispoStyles() {
  return (
    <style>{`
      .dispo-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .dispo-anim{animation-duration:.15s}
      /* Barre de défilement toujours visible (modales Historique et Aperçu) :
         la règle globale la cache partout ailleurs dans le produit. */
      .dispo-scroll{scrollbar-width:thin;scrollbar-color:#000 rgba(128,128,128,.35)}
      .dispo-scroll::-webkit-scrollbar{display:block;width:8px}
      .dispo-scroll::-webkit-scrollbar-track{background:rgba(128,128,128,.35);border-radius:4px}
      .dispo-scroll::-webkit-scrollbar-thumb{background:#000;border-radius:4px}
      .dispo-switch,.dispo-radio,.dispo-chev{transition:background-color .14s ease,border-color .14s ease,color .14s ease}
      .dispo-knob{transition:left .14s ease}
      .dispo-root{--dispo-bar-offset:0px}
      .dispo-savebar{bottom:calc(16px + var(--dispo-bar-offset))}
      .dispo-layout{display:grid;grid-template-columns:1fr;gap:16px;align-items:start}
      @media(min-width:1280px){
        .dispo-layout{grid-template-columns:1fr 320px}
        .dispo-sidebar{position:sticky;top:16px}
      }
      @media(min-width:1024px){
        .dispo-fiche-overlay{align-items:center!important}
        .dispo-fiche-panel{max-width:520px!important;border-radius:16px!important;max-height:80svh!important}
      }
      @media(max-width:1023px){
        .dispo-root{--dispo-bar-offset:76px}
      }
      @media(max-width:767px){
        .dispo-hit{min-height:44px;min-width:44px}
        .dispo-select{min-height:44px}
      }
      @media(prefers-reduced-motion:reduce){
        .dispo-anim,.dispo-switch,.dispo-radio,.dispo-chev,.dispo-knob{animation:none!important;transition:none!important}
      }
    `}</style>
  );
}

// ── Champ d'heure 12 h (1-12 + minutes + AM/PM) — valeur stockée "HH:MM" 24 h ──
const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

// 12:00 AM = 00:00, 12:00 PM = 12:00, 1:00 PM = 13:00.
export function compose24(heure12: number, minutes: string, periode: "AM" | "PM"): string {
  const h24 = (heure12 % 12) + (periode === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${minutes}`;
}

function decompose24(value: string): { h: string; m: string; p: "AM" | "PM" | "" } {
  const mins = value ? toMin(value) : null;
  if (mins === null) return { h: "", m: "", p: "" };
  const h24 = Math.floor(mins / 60);
  return { h: String(h24 % 12 === 0 ? 12 : h24 % 12), m: String(mins % 60).padStart(2, "0"), p: h24 >= 12 ? "PM" : "AM" };
}

export function TimeField({ id, label, value, onChange, disabled, invalid, describedBy, C }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; invalid?: boolean; describedBy?: string; C: ThemeTokens;
}) {
  const cur = decompose24(value);
  const selectStyle: CSSProperties = {
    backgroundColor: C.bg3, border: `1px solid ${invalid ? C.red : C.border}`, borderRadius: "8px",
    padding: "9px 6px", color: C.t1, fontSize: "13px", opacity: disabled ? 0.6 : 1, flex: 1, minWidth: 0, ...NUM,
  };
  const emit = (h: string, m: string, p: "AM" | "PM" | "") =>
    onChange(compose24(Number(h || "12"), m || "00", p || "AM"));
  return (
    <div role="group" aria-label={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <select id={`${id}-h`} className="dispo-select yelen-focus-ring" aria-label={`${label} : heures`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={cur.h} onChange={e => emit(e.target.value, cur.m, cur.p)} disabled={disabled} style={selectStyle}>
        <option value="" disabled>--</option>
        {HOURS_12.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span aria-hidden style={{ color: C.t2, fontSize: "13px", flexShrink: 0 }}>:</span>
      <select className="dispo-select yelen-focus-ring" aria-label={`${label} : minutes`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={cur.m} onChange={e => emit(cur.h, e.target.value, cur.p)} disabled={disabled} style={selectStyle}>
        <option value="" disabled>--</option>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className="dispo-select yelen-focus-ring" aria-label={`${label} : AM ou PM`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        value={cur.p} onChange={e => emit(cur.h, cur.m, e.target.value === "PM" ? "PM" : "AM")} disabled={disabled} style={{ ...selectStyle, flex: "0 0 auto" }}>
        <option value="" disabled>--</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

function IconCheck({ color, size = 13 }: { color: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>;
}

function IconWarn({ color }: { color: string }) {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}

// Mini-timeline 00h -> 24h : segment ouvert surligné.
function DayTimeline({ r, C }: { r: DayRuleView; C: ThemeTokens }) {
  const s = toMin(r.start), e = toMin(r.end);
  const pct = (v: number) => (v / (24 * 60)) * 100;
  return (
    <div aria-hidden style={{ position: "relative", height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
      {r.active && s !== null && e !== null && e > s && (
        <div style={{ position: "absolute", left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%`, height: "100%", backgroundColor: C.gold, borderRadius: "3px" }}/>
      )}
    </div>
  );
}

function DurationRadios({ label, value, onChange, disabled, C }: {
  label: string; value: DayDuration; onChange: (d: DayDuration) => void; disabled?: boolean; C: ThemeTokens;
}) {
  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || disabled) return;
    e.preventDefault();
    onChange(DURATIONS[(i + step + DURATIONS.length) % DURATIONS.length]);
    const group = e.currentTarget.parentElement;
    const next = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[(i + step + DURATIONS.length) % DURATIONS.length];
    next?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: "6px" }}>
      {DURATIONS.map((dur, i) => {
        const actif = value === dur;
        return (
          <button key={dur} type="button" role="radio" aria-checked={actif} tabIndex={actif ? 0 : -1} disabled={disabled}
            onClick={() => onChange(dur)} onKeyDown={e => onKey(e, i)}
            className="dispo-radio dispo-hit yelen-focus-ring"
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px", backgroundColor: actif ? `${C.gold}1F` : C.bg3, border: `1px solid ${actif ? C.gold : C.border}`, borderRadius: "8px", padding: "8px 6px", color: actif ? C.t1 : C.t2, fontSize: "12.5px", fontWeight: actif ? 600 : 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, ...NUM }}>
            {actif && <IconCheck color={C.gold} size={12}/>}
            {dur} min
          </button>
        );
      })}
    </div>
  );
}

// Carte de jour : ligne repliée (interrupteur | zone de dépliage) + contenu.
// L'interrupteur et la zone de dépliage sont deux boutons distincts, jamais
// imbriqués.
export function DayCard({ id, label, rule, readOnly, expanded, onToggleExpand, onToggleActive, onRule, slots, C }: {
  id: string; label: string; rule: DayRuleView; readOnly: boolean; expanded: boolean;
  onToggleExpand: () => void; onToggleActive: () => void; onRule: (patch: Partial<DayRuleView>) => void;
  slots: number; C: ThemeTokens;
}) {
  const [showAll, setShowAll] = useState(false);
  const s = toMin(rule.start), e = toMin(rule.end);
  const ordreInvalide = rule.active && s !== null && e !== null && e <= s;
  const inhabituel = rule.active && s !== null && e !== null && e > s && (s < OUVERTURE_TOT || e > FERMETURE_TARD);
  const panelId = `${id}-panel`;
  const erreurId = `${id}-erreur`;

  const times = useMemo(() => {
    if (s === null || e === null || e <= s) return [];
    const out: string[] = [];
    for (let t = s; t + rule.duration <= e; t += rule.duration) out.push(toHHMM(t));
    return out;
  }, [s, e, rule.duration]);

  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${rule.active ? `${C.gold}40` : C.border}`, borderRadius: "12px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px 0 8px" }}>
        <button type="button" role="switch" aria-checked={rule.active} aria-label={`${label} : ${rule.active ? "ouvert" : "fermé"}`}
          disabled={readOnly} onClick={onToggleActive} className="dispo-hit yelen-focus-ring"
          style={{ background: "none", border: "none", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: readOnly ? "not-allowed" : "pointer", opacity: readOnly ? 0.6 : 1, flexShrink: 0, borderRadius: "10px" }}>
          <span className="dispo-switch" style={{ width: "40px", height: "24px", borderRadius: "12px", backgroundColor: rule.active ? C.gold : C.bg3, border: `1px solid ${rule.active ? C.gold : C.border2}`, position: "relative", display: "block", boxSizing: "border-box" }}>
            <span className="dispo-knob" style={{ position: "absolute", top: "2px", left: rule.active ? "18px" : "2px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: rule.active ? "#FFFFFF" : C.t2, boxShadow: rule.active ? "0 0 0 1px rgba(0,0,0,0.3)" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {rule.active && <IconCheck color="#000" size={10}/>}
            </span>
          </span>
        </button>
        <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={onToggleExpand}
          className="dispo-hit yelen-focus-ring"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", background: "none", border: "none", padding: "10px 8px", cursor: "pointer", textAlign: "left", borderRadius: "10px" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ color: rule.active ? C.t1 : C.t2, fontSize: "14px", fontWeight: 600 }}>{label}</span>
            {rule.active && rule.start && rule.end && (
              <span style={{ color: C.t2, fontSize: "12.5px", ...NUM }}>{h12(rule.start)} – {h12(rule.end)}</span>
            )}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            {inhabituel && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: C.t2, fontSize: "12px" }}><IconWarn color={C.gold}/>Horaire inhabituel</span>
            )}
            {ordreInvalide && <span style={{ color: C.red, fontSize: "12px", fontWeight: 600 }}>Horaires invalides</span>}
            {rule.active && slots > 0 && (
              <span style={{ border: `1px solid ${C.border2}`, color: C.t1, fontSize: "12px", padding: "2px 9px", borderRadius: "20px", ...NUM }}>{slots} créneau{slots > 1 ? "x" : ""}</span>
            )}
            {!rule.active && <span style={{ color: C.t2, fontSize: "12.5px" }}>Fermé</span>}
            <svg className="dispo-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth={2} aria-hidden style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform .14s ease" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </span>
        </button>
      </div>
      <div style={{ padding: "4px 16px 12px" }}><DayTimeline r={rule} C={C}/></div>

      {expanded && rule.active && (
        <div id={panelId} role="group" aria-label={`${label} : horaires`} style={{ padding: "14px 16px 16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
            <div>
              <label htmlFor={`${id}-start-h`} style={{ color: C.t2, fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "6px" }}>Ouverture</label>
              <TimeField id={`${id}-start`} label="Ouverture" value={rule.start} onChange={v => onRule({ start: v })} disabled={readOnly} invalid={ordreInvalide} describedBy={ordreInvalide ? erreurId : undefined} C={C}/>
            </div>
            <div>
              <label htmlFor={`${id}-end-h`} style={{ color: C.t2, fontSize: "12px", fontWeight: 500, display: "block", marginBottom: "6px" }}>Fermeture</label>
              <TimeField id={`${id}-end`} label="Fermeture" value={rule.end} onChange={v => onRule({ end: v })} disabled={readOnly} invalid={ordreInvalide} describedBy={ordreInvalide ? erreurId : undefined} C={C}/>
            </div>
          </div>
          {ordreInvalide && (
            <p id={erreurId} role="alert" style={{ color: C.red, fontSize: "12px", margin: "8px 0 0" }}>La fermeture doit être après l&apos;ouverture.</p>
          )}

          <div style={{ marginTop: "14px" }}>
            <div id={`${id}-duree`} style={{ color: C.t2, fontSize: "12px", fontWeight: 500, marginBottom: "6px" }}>Durée par rendez-vous</div>
            <DurationRadios label={`${label} : durée par rendez-vous`} value={rule.duration} onChange={d => onRule({ duration: d })} disabled={readOnly} C={C}/>
          </div>

          {times.length > 0 && (
            <div style={{ marginTop: "14px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 14px" }}>
              <p style={{ color: C.t2, fontSize: "12px", fontWeight: 600, margin: "0 0 8px", ...NUM }}>Aperçu : {times.length} créneau{times.length > 1 ? "x" : ""} généré{times.length > 1 ? "s" : ""}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                {(showAll ? times : times.slice(0, PREVIEW_COUNT)).map(h => (
                  <span key={h} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "3px 8px", fontSize: "12px", color: C.t1, ...NUM }}>{h12(h)}</span>
                ))}
                {times.length > PREVIEW_COUNT && (
                  <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll} className="dispo-hit yelen-focus-ring"
                    style={{ background: "none", border: "none", color: C.t1, fontSize: "12px", fontWeight: 600, textDecoration: "underline", cursor: "pointer", padding: "4px 6px", borderRadius: "6px" }}>
                    {showAll ? "Réduire" : `Voir tout (${times.length - PREVIEW_COUNT} autres)`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modales : role="dialog", aria-modal, piège à focus, Échap ──
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function DialogShell({ titleId, title, C, onClose, children }: {
  titleId: string; title: string; C: ThemeTokens; onClose: () => void; children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.preventDefault(); closeRef.current(); return; }
      if (ev.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { ev.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const actif = document.activeElement;
      if (ev.shiftKey && (actif === first || !panel.contains(actif))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && (actif === last || !panel.contains(actif))) { ev.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); precedent?.focus(); };
  }, []);

  return (
    <div className="dispo-fiche-overlay dispo-anim" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.15s ease" }} onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}
        className="dispo-fiche-panel dispo-scroll dispo-anim"
        style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "20px 20px 24px", width: "100%", maxWidth: "520px", maxHeight: "80svh", overflowY: "scroll", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.15s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
          <h2 id={titleId} style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="dispo-hit yelen-focus-ring"
            style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: "6px", borderRadius: "8px", display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Libellés de jour (fuseau Conakry) ──
const FORMAT_DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "long", year: "numeric" });

function ecartJours(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

// « Aujourd'hui », « Hier », sinon « 5 août 2026 ».
function libelleJour(valeur: Date, now: Date): string {
  const ecart = ecartJours(jourConakry(valeur), jourConakry(now));
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return "Hier";
  return FORMAT_DATE_LONGUE.format(valeur);
}

// « Aujourd'hui, 10:38 PM » / « 5 août, 10:38 PM » — en-tête de l'écran.
export function formatDateHeureCourt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ecart = ecartJours(jourConakry(d), jourConakry(new Date()));
  const jour = ecart === 0 ? "Aujourd'hui" : new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "short" }).format(d);
  return `${jour}, ${heureDepuisHorodatage(d)}`;
}

// ── Historique ──
type EntreeJournal = { id: string; membre_nom: string; action: string; created_at: string; details?: { nombreCreneaux?: unknown } | null };
type LigneHistorique = { cle: string; membre: string; action: string; heure: string; creneaux: number | null; count: number };

// Le journal « disponibilites » contient aussi les actions de pause des
// réservations ; toute autre action garde le libellé historique.
function libelleAction(action: string): string {
  if (action === "pause_reservations_activee") return "Pause des réservations activée";
  if (action === "pause_reservations_levee") return "Pause des réservations levée";
  return "Disponibilités modifiées";
}

function nombreCreneaux(e: EntreeJournal): number | null {
  const n = e.details?.nombreCreneaux;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function HistoriqueModal({ C, onClose }: { C: ThemeTokens; onClose: () => void }) {
  const [entrees, setEntrees] = useState<EntreeJournal[]>([]);
  const [etat, setEtat] = useState<"loading" | "ok" | "erreur">("loading");

  // L'état initial est déjà "loading" : seul « Réessayer » le réarme, en
  // incrémentant `tentative` (relance l'effet ci-dessous).
  const [tentative, setTentative] = useState(0);
  useEffect(() => {
    let annule = false;
    fetch("/api/institution/journal?categorie=disponibilites&limit=50")
      .then(r => (r.ok ? r.json().catch(() => null) : null))
      .catch(() => null)
      .then((j: { entrees?: EntreeJournal[] } | null) => {
        if (annule) return;
        if (!j || !Array.isArray(j.entrees)) { setEtat("erreur"); return; }
        setEntrees(j.entrees);
        setEtat("ok");
      });
    return () => { annule = true; };
  }, [tentative]);

  // Regroupement d'affichage : par jour, puis lignes identiques (même auteur,
  // même minute, même nombre de créneaux) fusionnées avec un compteur.
  const groupes = useMemo(() => {
    const now = new Date();
    const out: { jour: string; lignes: LigneHistorique[] }[] = [];
    for (const e of entrees) {
      const d = new Date(e.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const jour = libelleJour(d, now);
      const heure = heureDepuisHorodatage(d);
      const creneaux = nombreCreneaux(e);
      let g = out[out.length - 1];
      if (!g || g.jour !== jour) { g = { jour, lignes: [] }; out.push(g); }
      const prec = g.lignes[g.lignes.length - 1];
      if (prec && prec.membre === e.membre_nom && prec.action === e.action && prec.heure === heure && prec.creneaux === creneaux) prec.count += 1;
      else g.lignes.push({ cle: e.id, membre: e.membre_nom, action: e.action, heure, creneaux, count: 1 });
    }
    return out;
  }, [entrees]);

  return (
    <DialogShell titleId="dispo-historique-titre" title="Historique des modifications" C={C} onClose={onClose}>
      {etat === "loading" && <div role="status" aria-label="Chargement" style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={20}/></div>}
      {etat === "erreur" && (
        <div role="alert" style={{ padding: "8px 0" }}>
          <p style={{ color: C.t1, fontSize: "13px", fontWeight: 600, margin: "0 0 4px" }}>Historique indisponible</p>
          <p style={{ color: C.t2, fontSize: "12.5px", margin: "0 0 12px" }}>Impossible de charger les modifications pour l&apos;instant.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => { setEtat("loading"); setTentative(t => t + 1); }}>Réessayer</Button>
        </div>
      )}
      {etat === "ok" && groupes.length === 0 && <p style={{ color: C.t2, fontSize: "12.5px", margin: 0 }}>Aucune modification enregistrée.</p>}
      {etat === "ok" && groupes.map(g => (
        <section key={g.jour} aria-label={g.jour} style={{ marginBottom: "14px" }}>
          <h3 style={{ color: C.t2, fontSize: "12px", fontWeight: 600, margin: "0 0 6px" }}>{g.jour}</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
            {g.lignes.map(l => (
              <li key={l.cle} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 600 }}>
                  {libelleAction(l.action)}{l.count > 1 && <span style={{ color: C.t2, fontWeight: 500, ...NUM }}> ×{l.count}</span>}
                </div>
                <div style={{ color: C.t2, fontSize: "12px", marginTop: "2px", ...NUM }}>
                  {l.membre} · {l.heure}{l.creneaux !== null ? ` · ${l.creneaux.toLocaleString("fr-FR")} créneaux` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DialogShell>
  );
}

// ── Aperçu citoyen ──
const FORMAT_JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const FORMAT_JOUR_COMPLET = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

function dateDepuisISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function ApercuCitoyenModal({ C, disponibilites, onClose }: { C: ThemeTokens; disponibilites: unknown; onClose: () => void }) {
  const [deplies, setDeplies] = useState<Record<string, boolean>>({});
  const jours = useMemo(() => {
    const slots = generateSlotsInRange(disponibilites, 7);
    const aujourdhui = new Date(); const demain = new Date(); demain.setDate(aujourdhui.getDate() + 1);
    const isoAuj = toISODate(aujourdhui), isoDem = toISODate(demain);
    const out: { iso: string; libelle: string; complet: string; heures: string[] }[] = [];
    for (const s of slots) {
      let g = out[out.length - 1];
      if (!g || g.iso !== s.dateRdv) {
        const d = dateDepuisISO(s.dateRdv);
        g = { iso: s.dateRdv, libelle: s.dateRdv === isoAuj ? "Aujourd'hui" : s.dateRdv === isoDem ? "Demain" : FORMAT_JOUR_COURT.format(d), complet: FORMAT_JOUR_COMPLET.format(d), heures: [] };
        out.push(g);
      }
      g.heures.push(s.heureRdv);
    }
    return out;
  }, [disponibilites]);

  return (
    <DialogShell titleId="dispo-apercu-titre" title="Ce que voit un citoyen" C={C} onClose={onClose}>
      <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, margin: "0 0 14px" }}>Prochains créneaux réellement proposés à la réservation, sur les 7 prochains jours — même moteur que le formulaire de prise de rendez-vous.</p>
      {jours.length === 0 ? (
        <div>
          <p style={{ color: C.t1, fontSize: "13px", fontWeight: 600, margin: "0 0 4px" }}>Aucun créneau réservable sur les 7 prochains jours</p>
          <p style={{ color: C.t2, fontSize: "12.5px", margin: 0 }}>Vérifiez qu&apos;au moins un jour est ouvert et que la configuration est enregistrée.</p>
        </div>
      ) : jours.map(j => {
        const ouvert = deplies[j.iso] === true;
        const visibles = ouvert ? j.heures : j.heures.slice(0, APERCU_COUNT);
        return (
          <section key={j.iso} aria-label={j.complet} style={{ marginBottom: "16px" }}>
            <h3 title={j.complet} style={{ color: C.t1, fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>
              {j.libelle} <span style={{ color: C.t2, fontWeight: 500, ...NUM }}>· {j.heures.length} créneau{j.heures.length > 1 ? "x" : ""}</span>
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: "6px" }}>
              {visibles.map(h => (
                <span key={h} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 8px", fontSize: "12.5px", color: C.t1, textAlign: "center", ...NUM }}>{h12(h)}</span>
              ))}
            </div>
            {j.heures.length > APERCU_COUNT && (
              <button type="button" aria-expanded={ouvert} onClick={() => setDeplies(p => ({ ...p, [j.iso]: !ouvert }))} className="dispo-hit yelen-focus-ring"
                style={{ background: "none", border: "none", color: C.t1, fontSize: "12px", fontWeight: 600, textDecoration: "underline", cursor: "pointer", padding: "6px 2px", marginTop: "4px" }}>
                {ouvert ? "Réduire" : `Voir tout (${j.heures.length - APERCU_COUNT} autres)`}
              </button>
            )}
          </section>
        );
      })}
    </DialogShell>
  );
}

// ── Barre d'enregistrement ──
export type SaveBarStatus = "clean" | "dirty" | "saving" | "error";

export function SaveBarDispo({ status, joursModifies, totalSlots, capaciteEnAttente, onSave, onCancel, onHeight, C }: {
  status: SaveBarStatus; joursModifies: number; totalSlots: number; capaciteEnAttente: boolean;
  onSave: () => void; onCancel: () => void; onHeight: (px: number) => void; C: ThemeTokens;
}) {
  // La hauteur varie selon l'état (boutons, mention « Capacité enregistrée
  // séparément », retour à la ligne) : elle est mesurée et remontée pour que
  // l'écran réserve exactement cet espace en bas.
  const barRef = useRef<HTMLDivElement>(null);
  const propre = status === "clean";
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => onHeight(Math.ceil(el.getBoundingClientRect().height)));
    obs.observe(el);
    return () => { obs.disconnect(); onHeight(0); };
    // `status` : l'élément mesuré change (ligne compacte / barre pleine).
  }, [onHeight, propre]);
  const accent = status === "error" ? C.red : status === "clean" ? C.green : C.gold;
  const message = status === "clean" ? "Tout est à jour"
    : status === "saving" ? "Enregistrement…"
    : status === "error" ? "Échec de l'enregistrement"
    : `Modifications non enregistrées · ${joursModifies} jour${joursModifies > 1 ? "s" : ""} modifié${joursModifies > 1 ? "s" : ""}`;
  // « Tout est à jour » n'exige aucune action : ligne compacte, dans le flux
  // (jamais flottante, elle ne peut donc rien masquer). Les autres états
  // demandent une action : barre pleine, sticky, à la largeur de son contenu.
  if (status === "clean") {
    return (
      <div ref={barRef} style={{ marginTop: "20px", width: "fit-content", maxWidth: "100%", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "6px 12px" }}>
        <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", color: C.t1, fontSize: "12.5px", fontWeight: 600 }}>
          <IconCheck color={C.green} size={14}/>
          {message}
          <span style={{ color: C.t2, fontWeight: 400, ...NUM }}>
            · {totalSlots} créneau{totalSlots > 1 ? "x" : ""}{capaciteEnAttente ? " · Capacité enregistrée séparément (modification en attente)" : ""}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div ref={barRef} className="dispo-savebar dispo-anim" style={{ position: "sticky", zIndex: 50, marginTop: "20px", width: "fit-content", maxWidth: "100%", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderTop: `1px solid ${C.border2}`, borderLeft: `4px solid ${accent}`, borderRadius: "12px", padding: "10px 12px 10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", boxShadow: "0 -6px 16px rgba(0,0,0,0.12)" }}>
      <div role="status" aria-live="polite" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.t1, fontSize: "13px", fontWeight: 600 }}>
          {status === "saving"
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M21 12a9 9 0 1 1-6.2-8.55"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>
            : <span aria-hidden style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: accent }}/>}
          {message}
        </div>
        <div style={{ color: C.t2, fontSize: "12px", marginTop: "2px", ...NUM }}>
          {totalSlots} créneau{totalSlots > 1 ? "x" : ""} au total{capaciteEnAttente ? " · Capacité enregistrée séparément (modification en attente)" : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        {status !== "error" && (
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" disabled={status === "saving"} onClick={onCancel}>Annuler</Button>
        )}
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" loading={status === "saving"} onClick={onSave} title="Ctrl + S">
          {status === "saving" ? "Enregistrement…" : status === "error" ? "Réessayer" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
