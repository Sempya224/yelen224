"use client";

// Agenda de l'espace de travail — V3 "centre temporel du travail" (refonte
// visuelle CEO, 20/09/2026) + refonte de l'architecture des popups (CEO,
// 20/09/2026, audit complet en amont — voir échange avec Bryan). Fusionne
// toujours les RDV existants (lecture seule) avec les événements internes
// (CRUD) via /api/institution/agenda — endpoints inchangés, seule
// l'interaction change.
//
// Flux volontairement séquentiel (jamais de modal dans un modal, item 10 du
// brief popups) : clic événement → EventDetailsPanel (détails d'abord,
// item 8) → "Modifier" → EventForm (même composant que "création", deux
// modes) ; "…" → EventActionsMenu → "Supprimer" ferme le drawer AVANT
// d'ouvrir la confirmation (ConfirmModal partagé). Conflit horaire vérifié
// juste avant l'enregistrement (fetch dédié du jour ciblé — le jour visé
// par le formulaire n'est pas forcément dans la plage déjà chargée à
// l'écran) ; modifications non enregistrées gardées par une confirmation
// dédiée plutôt qu'une fermeture silencieuse.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { YelenLoader } from "@/components/YelenLoader";
import {
  type Evenement, type Membre, TYPES, toISODate, typeColor, typeLabel, IconUser,
  useDialogA11y, MemberPicker, DatePicker, TimePicker, EventDetailsPanel,
} from "./AgendaOverlays";

type RdvItem = { id: string; objet: string | null; date_rdv: string; heure_rdv: string; statut: string; citoyen_nom: string; citoyen_phone: string | null };

// Même palette que stColor() dans MesClientsTab.tsx, réduite aux valeurs
// réelles de l'enum statut_rdv (pas de présence ici, voir CLAUDE.md /schema).
function statutRdvInfo(statut: string, C: ThemeTokens): { c: string; bg: string; l: string } {
  switch (statut) {
    case "confirme": return { c: C.green, bg: C.greenL, l: "Confirmé" };
    case "en_attente": return { c: C.gold, bg: `${C.gold}20`, l: "En attente" };
    case "nouveau": return { c: C.gold, bg: `${C.gold}20`, l: "Nouveau" };
    case "refuse": return { c: C.red, bg: C.redL, l: "Refusé" };
    case "annule": return { c: C.red, bg: C.redL, l: "Annulé" };
    case "termine": return { c: C.purple, bg: C.purpleL, l: "Terminé" };
    default: return { c: C.t2, bg: C.bg3, l: statut };
  }
}

function nomMembre(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : null;
}

// Permissions par rôle ("chacun ne gère que le sien", validé par Bryan) —
// même règle que côté serveur (agenda/route.ts) : admin gère tout, un
// non-admin ne gère que ce qu'il a créé ou ce qui lui est assigné. Détermine
// aussi si "Modifier"/"…" apparaissent dans EventDetailsPanel — un membre
// sans droit n'atteint donc plus jamais le formulaire d'édition (avant :
// formulaire ouvert quand même, en lecture seule avec bandeau).
function peutGerer(e: Evenement, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return e.cree_par_membre_id === moiId || e.membre_id === moiId;
}

const HOUR_START = 7;
const HOUR_END = 19;
const HOUR_HEIGHT = 52;
const DAY_LETTERS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

function startOfWeek(d: Date): Date {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}

function timeToMinutes(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function formatHourLabel(h: number): string { return `${String(h).padStart(2, "0")}:00`; }

// "14 – 20 septembre 2026" quand la semaine reste dans le même mois/année,
// sinon un format explicite des deux bornes ("28 sept. – 4 oct. 2026").
function formatWeekLabel(days: Date[]): string {
  const start = days[0], end = days[6];
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const mois = start.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `${start.getDate()} – ${end.getDate()} ${mois}`;
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
  return `${startLabel} – ${endLabel}${sameYear ? ` ${end.getFullYear()}` : ""}`;
}

type FormValues = { titre: string; description: string; type: string; date: string; heure_debut: string; heure_fin: string; membre_id: string };
type FormState = { mode: "create" | "edit"; id?: string; values: FormValues; initial: string };
type FormStep = "form" | "unsaved" | "conflict";
type ConflictInfo = { titre: string; heure_debut: string | null; heure_fin: string | null };

function snapshotValues(v: FormValues): string { return JSON.stringify(v); }

export function AgendaSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [view, setView] = useState<"mois" | "semaine">("semaine");
  const [refDate, setRefDate] = useState(new Date());
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [rdvs, setRdvs] = useState<RdvItem[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rdvDetail, setRdvDetail] = useState<RdvItem | null>(null);
  const [sendingRappel, setSendingRappel] = useState(false);

  // Système V3 d'overlays événement : détails → modifier/supprimer, jamais
  // deux niveaux ouverts en même temps (voir en-tête du fichier).
  const [detailsEvent, setDetailsEvent] = useState<Evenement | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formStep, setFormStep] = useState<FormStep>("form");
  const [conflictItem, setConflictItem] = useState<ConflictInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Evenement | null>(null);
  const [saving, setSaving] = useState(false);

  const storageKey = `yelen224_agenda_state_${instId}`;

  // Vue + date sélectionnée conservées après navigation/rafraîchissement
  // (item 9 du brief V3) — lues une fois au montage, jamais côté serveur
  // (évite tout risque de mismatch d'hydratation).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { view?: string; date?: string };
      if (saved.view === "mois" || saved.view === "semaine") setView(saved.view);
      if (saved.date) { const d = new Date(saved.date); if (!isNaN(d.getTime())) setRefDate(d); }
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ view, date: toISODate(refDate) })); } catch {}
  }, [view, refDate, storageKey]);

  // Ligne d'heure actuelle — se déplace sans nécessiter de rafraîchissement
  // manuel de la page.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const rangeDays = useMemo(() => {
    const start = view === "semaine" ? startOfWeek(refDate) : startOfMonthGrid(refDate);
    const count = view === "semaine" ? 7 : 42;
    return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view, refDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const dateFrom = toISODate(rangeDays[0]);
    const dateTo = toISODate(rangeDays[rangeDays.length - 1]);
    const res = await fetch(`/api/institution/agenda?date_from=${dateFrom}&date_to=${dateTo}`);
    if (!res.ok) { setLoadError(true); setEvenements([]); setRdvs([]); setLoading(false); return; }
    const j = await res.json().catch(() => null);
    setEvenements(j?.evenements ?? []);
    setRdvs(j?.rdv ?? []);
    setLoading(false);
  }, [rangeDays]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/institution/membres").then(res => res.ok ? res.json() : null).then(j => {
      if (!j) return;
      setMembres(j.membres ?? []);
      setMoiId(j.membreId ?? null);
      setMoiRole(j.role ?? null);
    });
  }, [instId]);

  function itemsForDay(iso: string) {
    return {
      events: evenements.filter(e => e.date === iso),
      rdv: rdvs.filter(r => r.date_rdv === iso),
    };
  }

  // setState fonctionnel (pas de lecture directe de refDate) pour rester
  // stable via useCallback — nécessaire pour le raccourci clavier ci-dessous
  // (sinon la fermeture capturerait une refDate périmée entre deux appuis).
  const navigate = useCallback((dir: 1 | -1) => {
    setRefDate(d => {
      const nd = new Date(d);
      if (view === "semaine") nd.setDate(nd.getDate() + dir * 7);
      else nd.setMonth(nd.getMonth() + dir);
      return nd;
    });
  }, [view]);

  const goToday = useCallback(() => setRefDate(new Date()), []);

  // Navigation clavier (item 9 du brief V3) — ignorée si un champ de saisie
  // a le focus ou si un overlay est ouvert, pour ne jamais interférer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (form || detailsEvent || rdvDetail || deleteTarget) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key.toLowerCase() === "t") goToday();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, detailsEvent, rdvDetail, deleteTarget, navigate, goToday]);

  // ───────────────────────────────────────────────────────────────────────
  // Formulaire événement (création/édition) — état levé au niveau de la
  // section (pas local à EventForm) pour pouvoir masquer/rouvrir le
  // formulaire autour d'une confirmation (conflit, modifications non
  // enregistrées) sans jamais superposer deux dialogues.
  // ───────────────────────────────────────────────────────────────────────
  function openCreateForm(date: string, heure_debut = "09:00") {
    const values: FormValues = { titre: "", description: "", type: "rappel", date, heure_debut, heure_fin: "", membre_id: "" };
    setForm({ mode: "create", values, initial: snapshotValues(values) });
    setFormStep("form");
  }

  function openEditForm(ev: Evenement) {
    const values: FormValues = { titre: ev.titre, description: ev.description || "", type: ev.type, date: ev.date, heure_debut: ev.heure_debut || "09:00", heure_fin: ev.heure_fin || "", membre_id: ev.membre_id || "" };
    setForm({ mode: "edit", id: ev.id, values, initial: snapshotValues(values) });
    setFormStep("form");
  }

  function updateFormValues(patch: Partial<FormValues>) {
    setForm(f => f ? { ...f, values: { ...f.values, ...patch } } : f);
  }

  function isFormDirty(f: FormState): boolean {
    return snapshotValues(f.values) !== f.initial;
  }

  function requestCloseForm() {
    if (form && isFormDirty(form)) { setFormStep("unsaved"); return; }
    setForm(null);
  }

  function discardForm() { setForm(null); setFormStep("form"); setConflictItem(null); }
  function resumeForm() { setFormStep("form"); }

  // Conflit horaire (item 9 du brief popups) — le jour visé par le
  // formulaire n'est pas forcément dans `rangeDays` déjà chargé à l'écran
  // (ex. "+ Planifier" ouvre toujours "aujourd'hui" quel que soit le mois
  // affiché) : requête dédiée sur ce seul jour pour une vérification fiable.
  // Durée RDV non stockée en base (voir CLAUDE.md /schema) — 30 min par
  // défaut, uniquement pour cette vérification, jamais affichée comme un
  // fait ailleurs dans l'Agenda.
  async function findConflict(values: FormValues, excludeId?: string): Promise<ConflictInfo | null> {
    if (!values.heure_debut) return null;
    const res = await fetch(`/api/institution/agenda?date_from=${values.date}&date_to=${values.date}`);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j) return null;
    const newStart = timeToMinutes(values.heure_debut);
    const newEnd = values.heure_fin ? timeToMinutes(values.heure_fin) : newStart + 30;
    for (const e of (j.evenements ?? []) as Evenement[]) {
      if (e.id === excludeId || !e.heure_debut) continue;
      const s = timeToMinutes(e.heure_debut);
      const en = e.heure_fin ? timeToMinutes(e.heure_fin) : s + 30;
      if (newStart < en && s < newEnd) return { titre: e.titre, heure_debut: e.heure_debut, heure_fin: e.heure_fin };
    }
    for (const r of (j.rdv ?? []) as RdvItem[]) {
      const s = timeToMinutes(r.heure_rdv);
      const en = s + 30;
      if (newStart < en && s < newEnd) return { titre: `RDV — ${r.citoyen_nom}`, heure_debut: r.heure_rdv, heure_fin: null };
    }
    return null;
  }

  async function performSave(f: FormState) {
    setSaving(true);
    const payload = { titre: f.values.titre.trim(), description: f.values.description || null, type: f.values.type, date: f.values.date, heure_debut: f.values.heure_debut || null, heure_fin: f.values.heure_fin || null, membre_id: f.values.membre_id || null };
    const isEdit = f.mode === "edit";
    const res = await fetch("/api/institution/agenda", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { id: f.id, ...payload } : payload),
    });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    setForm(null); setFormStep("form"); setConflictItem(null);
    onToast(isEdit ? "Événement modifié" : "Événement ajouté", C.green);
    load();
  }

  async function handleSaveClick() {
    if (!form) return;
    setSaving(true);
    const conflict = await findConflict(form.values, form.id);
    if (conflict) { setSaving(false); setConflictItem(conflict); setFormStep("conflict"); return; }
    await performSave(form);
  }

  async function handleContinueDespiteConflict() {
    if (form) await performSave(form);
  }

  function requestDelete(ev: Evenement) {
    setDetailsEvent(null); // ferme le drawer avant la confirmation — jamais un modal dans un modal
    setDeleteTarget(ev);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/institution/agenda?id=${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    onToast("Événement supprimé", C.orange);
    load();
  }

  function handleWeekColumnClick(iso: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawHour = HOUR_START + y / HOUR_HEIGHT;
    const hour = Math.max(HOUR_START, Math.min(HOUR_END, Math.round(rawHour * 2) / 2));
    const hh = Math.floor(hour).toString().padStart(2, "0");
    const mm = hour % 1 === 0.5 ? "30" : "00";
    openCreateForm(iso, `${hh}:${mm}`);
  }

  const todayIso = toISODate(new Date());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowInHourRange = nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60;
  const nowTop = ((nowMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={goToday} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "11px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>Aujourd&apos;hui</button>
          <button onClick={() => navigate(-1)} aria-label="Période précédente" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: C.t2 }}>‹</button>
          <button onClick={() => navigate(1)} aria-label="Période suivante" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: C.t2 }}>›</button>
          <span style={{ fontSize: "14px", fontWeight: "800", marginLeft: "4px", textTransform: "capitalize" }}>
            {view === "mois" ? refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : formatWeekLabel(rangeDays)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", gap: "4px", backgroundColor: C.bg3, borderRadius: "10px", padding: "3px" }}>
            {(["semaine", "mois"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ background: view === v ? C.bgCard : "transparent", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "11.5px", fontWeight: "700", color: view === v ? C.gold : C.t2, cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
            ))}
          </div>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => openCreateForm(toISODate(new Date()))}>+ Planifier un événement</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
        {[{ l: "RDV", c: C.blue }, { l: "Rappel", c: C.gold }, { l: "Réunion", c: C.purple }, { l: "Bloqué", c: C.red }, { l: "Autre", c: C.teal }].map(item => (
          <div key={item.l} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: item.c }}/>
            <span style={{ fontSize: "10px", color: C.t3, fontWeight: "600" }}>{item.l}</span>
          </div>
        ))}
      </div>

      {loadError && !loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "700", color: C.red }}>Impossible de charger l&apos;agenda.</span>
          <button onClick={load} style={{ background: "none", border: "none", color: C.red, fontSize: "12px", fontWeight: "800", cursor: "pointer", textDecoration: "underline" }}>Réessayer</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : view === "mois" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "4px" }}>
            {DAY_LETTERS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: "9.5px", fontWeight: "800", color: C.t3, padding: "4px 0", letterSpacing: "0.4px" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" }}>
            {rangeDays.map(day => {
              const iso = toISODate(day);
              const { events, rdv } = itemsForDay(iso);
              const all = [...rdv.map(r => ({ id: r.id, titre: `RDV · ${r.citoyen_nom}`, color: C.blue })), ...events.map(e => ({ id: e.id, titre: `${typeLabel(e.type)} · ${e.titre}`, color: typeColor(e.type, C) }))];
              const isToday = iso === todayIso;
              const inMonth = day.getMonth() === refDate.getMonth();
              return (
                <div key={iso} onClick={() => setSelectedDay(iso)} style={{ minHeight: "68px", backgroundColor: isToday ? `${C.gold}0D` : C.bgCard, borderRadius: "10px", border: `1px solid ${isToday ? C.gold + "50" : C.border}`, padding: "5px", cursor: "pointer", opacity: inMonth ? 1 : 0.4 }}>
                  <div style={{ fontSize: "10.5px", fontWeight: isToday ? "900" : "700", color: isToday ? C.gold : C.t2, marginBottom: "3px" }}>{day.getDate()}</div>
                  {all.length === 0 ? (
                    <div style={{ fontSize: "8px", color: C.t3 }}>—</div>
                  ) : (
                    <>
                      {all.slice(0, 2).map(it => (
                        <div key={it.id} style={{ fontSize: "8.5px", color: "#fff", backgroundColor: it.color, borderRadius: "4px", padding: "1px 4px", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.titre}</div>
                      ))}
                      {all.length > 2 && <div style={{ fontSize: "8px", color: C.t3 }}>+{all.length - 2}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
          <div style={{ width: "46px", flexShrink: 0, paddingTop: "26px" }}>
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
              <div key={i} style={{ height: `${HOUR_HEIGHT}px`, fontSize: "9px", color: C.t3, textAlign: "right", paddingRight: "6px", transform: "translateY(-6px)" }}>{formatHourLabel(HOUR_START + i)}</div>
            ))}
          </div>
          {rangeDays.map(day => {
            const iso = toISODate(day);
            const { events, rdv } = itemsForDay(iso);
            const isToday = iso === todayIso;
            const isEmpty = events.length === 0 && rdv.length === 0;
            return (
              <div key={iso} style={{ flex: "1 0 100px", minWidth: "100px", borderLeft: `1px solid ${C.border}`, backgroundColor: isToday ? `${C.gold}08` : undefined }}>
                <div style={{ height: "26px", textAlign: "center", fontSize: "9.5px", fontWeight: isToday ? "900" : "700", color: isToday ? C.gold : C.t2, letterSpacing: "0.3px" }}>
                  {DAY_LETTERS[(day.getDay() + 6) % 7]} {day.getDate()}
                </div>
                <div onClick={e => handleWeekColumnClick(iso, e)} style={{ position: "relative", height: `${(HOUR_END - HOUR_START) * HOUR_HEIGHT}px`, cursor: "pointer" }}>
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div key={i} style={{ position: "absolute", top: `${i * HOUR_HEIGHT}px`, left: 0, right: 0, borderTop: `1px solid ${C.border}` }}/>
                  ))}

                  {isToday && nowInHourRange && (
                    <div style={{ position: "absolute", top: `${nowTop}px`, left: 0, right: 0, zIndex: 5, pointerEvents: "none", display: "flex", alignItems: "center" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.gold, marginLeft: "-3px", flexShrink: 0 }}/>
                      <div style={{ flex: 1, height: "1.5px", backgroundColor: C.gold }}/>
                    </div>
                  )}

                  {isEmpty && !loadError && (
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)", textAlign: "center", pointerEvents: "none" }}>
                      <div style={{ fontSize: "9.5px", color: C.t3, fontWeight: "600" }}>Aucun événement</div>
                      {isToday && (
                        <button onClick={e => { e.stopPropagation(); openCreateForm(iso); }} style={{ pointerEvents: "auto", marginTop: "4px", background: "none", border: "none", color: C.gold, fontSize: "9.5px", fontWeight: "800", cursor: "pointer" }}>+ Planifier</button>
                      )}
                    </div>
                  )}

                  {rdv.map(r => {
                    const startMin = timeToMinutes(r.heure_rdv) - HOUR_START * 60;
                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(HOUR_HEIGHT * 0.5, 54);
                    return (
                      <div key={r.id} role="button" tabIndex={0} onClick={e => { e.stopPropagation(); setRdvDetail(r); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setRdvDetail(r); } }} style={{ position: "absolute", top: `${top}px`, left: "3px", right: "3px", height: `${height}px`, backgroundColor: `${C.blue}15`, borderLeft: `3px solid ${C.blue}`, borderRadius: "6px", border: `1px solid ${C.blue}30`, padding: "5px 7px", overflow: "hidden", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                          <span style={{ fontSize: "7.5px", fontWeight: "800", color: C.blue, textTransform: "uppercase", letterSpacing: "0.3px", backgroundColor: `${C.blue}20`, padding: "1px 5px", borderRadius: "4px" }}>RDV</span>
                          <span style={{ fontSize: "8px", fontWeight: "700", color: C.t2 }}>{r.heure_rdv}</span>
                        </div>
                        <div style={{ fontSize: "9.5px", fontWeight: "700", color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.objet || "RDV général"}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "8px", color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <IconUser color={C.t3}/>{r.citoyen_nom}
                        </div>
                      </div>
                    );
                  })}
                  {events.map(e => {
                    const startMin = timeToMinutes(e.heure_debut || "09:00") - HOUR_START * 60;
                    const endMin = e.heure_fin ? timeToMinutes(e.heure_fin) - HOUR_START * 60 : startMin + 30;
                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 54);
                    const assigne = nomMembre(e.membre_id, membres);
                    const color = typeColor(e.type, C);
                    return (
                      <div key={e.id} role="button" tabIndex={0} onClick={ev => { ev.stopPropagation(); setDetailsEvent(e); }} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.stopPropagation(); setDetailsEvent(e); } }} style={{ position: "absolute", top: `${top}px`, left: "3px", right: "3px", height: `${height}px`, backgroundColor: `${color}15`, borderLeft: `3px solid ${color}`, borderRadius: "6px", border: `1px solid ${color}30`, padding: "5px 7px", overflow: "hidden", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                          <span style={{ fontSize: "7.5px", fontWeight: "800", color, textTransform: "uppercase", letterSpacing: "0.3px", backgroundColor: `${color}20`, padding: "1px 5px", borderRadius: "4px" }}>{typeLabel(e.type)}</span>
                          <span style={{ fontSize: "8px", fontWeight: "700", color: C.t2 }}>{e.heure_debut || "—"}{e.heure_fin ? ` – ${e.heure_fin}` : ""}</span>
                        </div>
                        <div style={{ fontSize: "9.5px", fontWeight: "700", color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.titre}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "8px", color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <IconUser color={C.t3}/>{assigne || "Non assigné"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Récapitulatif d'un jour (vue mois) — popup centré PC, plus une
          zone ajoutée sous la grille (invisible sans scroller, retour
          Bryan 20/09/2026). */}
      {selectedDay && (() => {
        const { events, rdv } = itemsForDay(selectedDay);
        return (
          <DayDetailsDialog
            C={C} date={selectedDay} events={events} rdv={rdv} membres={membres}
            onClose={() => setSelectedDay(null)}
            onSelectRdv={r => { setSelectedDay(null); setRdvDetail(r); }}
            onSelectEvent={e => { setSelectedDay(null); setDetailsEvent(e); }}
            onPlanifier={() => { const d = selectedDay; setSelectedDay(null); openCreateForm(d); }}
          />
        );
      })()}

      {/* C — Consultation d'un événement, avant toute édition (item 8). */}
      {detailsEvent && (
        <EventDetailsPanel
          open={!!detailsEvent}
          onClose={() => setDetailsEvent(null)}
          evenement={detailsEvent}
          membres={membres}
          peutGerer={peutGerer(detailsEvent, moiId, moiRole)}
          onEdit={() => { const ev = detailsEvent; setDetailsEvent(null); openEditForm(ev); }}
          onDeleteRequest={() => requestDelete(detailsEvent)}
          C={C}
        />
      )}

      {/* B — Création / édition (même composant, deux modes). */}
      {form && formStep === "form" && (
        <EventForm C={C} form={form} onChange={updateFormValues} onRequestClose={requestCloseForm} onSave={handleSaveClick} saving={saving} membres={membres}/>
      )}

      {form && formStep === "unsaved" && (
        <ConfirmModal
          open onClose={resumeForm} onConfirm={discardForm} tokens={toUiTokens(C)} level={1} danger
          title="Modifications non enregistrées ?"
          description="Vos modifications seront perdues si vous quittez maintenant."
          confirmLabel="Quitter sans enregistrer" cancelLabel="Continuer l'édition"
        />
      )}

      {form && formStep === "conflict" && conflictItem && (
        <ConfirmModal
          open onClose={() => setFormStep("form")} onConfirm={handleContinueDespiteConflict} tokens={toUiTokens(C)} level={1}
          title="Cet horaire est déjà occupé"
          description={`${conflictItem.heure_debut ?? ""}${conflictItem.heure_fin ? ` – ${conflictItem.heure_fin}` : ""} · ${conflictItem.titre}`}
          confirmLabel="Continuer quand même" cancelLabel="Modifier l'horaire"
        />
      )}

      {/* Suppression — confirmation dédiée, jamais immédiate (item 5). */}
      {deleteTarget && (
        <ConfirmModal
          open onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} tokens={toUiTokens(C)} level={1} danger
          title="Supprimer cet événement ?"
          consequences={[`« ${deleteTarget.titre} »`, `${new Date(`${deleteTarget.date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}${deleteTarget.heure_debut ? ` · ${deleteTarget.heure_debut}` : ""}`]}
          reversible={false}
          confirmLabel="Supprimer" cancelLabel="Annuler"
        />
      )}

      {rdvDetail && (
        <RdvDetailModal
          C={C}
          rdv={rdvDetail}
          sending={sendingRappel}
          onClose={() => setRdvDetail(null)}
          onEnvoyerRappel={async () => {
            setSendingRappel(true);
            const res = await fetch("/api/institution/rdv-historique", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rdv_id: rdvDetail.id }),
            });
            setSendingRappel(false);
            if (!res.ok) { onToast("Erreur d'envoi", C.red); return; }
            onToast("Rappel envoyé", C.gold);
          }}
        />
      )}
    </div>
  );
}

// Récapitulatif d'un jour (clic sur une case de la vue mois) — popup
// centré PC (retour Bryan 20/09/2026 : l'ancienne version s'ajoutait sous
// la grille, invisible tant qu'on ne scrollait pas). Mêmes conventions que
// EventForm/RdvDetailModal ci-dessous : pas de logique mobile.
function DayDetailsDialog({ C, date, events, rdv, membres, onClose, onSelectRdv, onSelectEvent, onPlanifier }: {
  C: ThemeTokens; date: string; events: Evenement[]; rdv: RdvItem[]; membres: Membre[];
  onClose: () => void; onSelectRdv: (r: RdvItem) => void; onSelectEvent: (e: Evenement) => void; onPlanifier: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onClose);
  const isEmpty = events.length === 0 && rdv.length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "24px", width: "100%", maxWidth: "440px", maxHeight: "80vh", overflowY: "auto", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <span style={{ fontSize: "15px", fontWeight: "800", color: C.t1, textTransform: "capitalize" }}>{new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, display: "flex", padding: "4px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {isEmpty ? (
          <div style={{ textAlign: "center", padding: "16px 0 4px" }}>
            <div style={{ fontSize: "12.5px", color: C.t3, marginBottom: "16px" }}>Aucun événement prévu ce jour.</div>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={onPlanifier}>+ Planifier un événement</Button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "16px" }}>
              {rdv.map(r => (
                <div key={r.id} onClick={() => onSelectRdv(r)} style={{ display: "flex", gap: "8px", padding: "8px 0", fontSize: "12.5px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.blue, fontWeight: "700", width: "42px", flexShrink: 0 }}>{r.heure_rdv}</span>
                  <span style={{ color: C.t2 }}>RDV — {r.citoyen_nom} · {r.objet || "RDV général"}</span>
                </div>
              ))}
              {events.map(e => {
                const assigne = nomMembre(e.membre_id, membres);
                const color = typeColor(e.type, C);
                return (
                  <div key={e.id} onClick={() => onSelectEvent(e)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", fontSize: "12.5px", cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color, fontWeight: "700", width: "42px", flexShrink: 0 }}>{e.heure_debut || "—"}</span>
                    <span style={{ color, fontSize: "9.5px", fontWeight: "800", backgroundColor: `${color}15`, padding: "1px 6px", borderRadius: "20px", flexShrink: 0 }}>{typeLabel(e.type)}</span>
                    <span style={{ color: C.t1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titre}</span>
                    {assigne && <span style={{ color: C.gold, fontSize: "10.5px", fontWeight: "700", flexShrink: 0 }}>· {assigne}</span>}
                  </div>
                );
              })}
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" fullWidth onClick={onPlanifier}>+ Planifier un événement</Button>
          </>
        )}
      </div>
    </div>
  );
}

function inputStyle(C: ThemeTokens): React.CSSProperties {
  return { width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "8px", color: C.t1, boxSizing: "border-box", fontFamily: "inherit" };
}

function fieldBtnStyle(C: ThemeTokens): React.CSSProperties {
  return { textAlign: "left", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 12px", fontSize: "12px", color: C.t1, cursor: "pointer", fontFamily: "inherit" };
}

// B — Formulaire de création/édition (EventForm, item 4 : même composant,
// deux modes, jamais deux formulaires différents). Popovers Date/Heure/
// Membre rendus en dehors du fond de la boîte de dialogue (fragment séparé)
// pour qu'un clic dedans ne remonte jamais jusqu'au backdrop et ne ferme
// jamais le formulaire par erreur.
function EventForm({ C, form, onChange, onRequestClose, onSave, saving, membres }: {
  C: ThemeTokens; form: FormState; onChange: (patch: Partial<FormValues>) => void; onRequestClose: () => void;
  onSave: () => void; saving: boolean; membres: Membre[];
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onRequestClose);

  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const heureDebutBtnRef = useRef<HTMLButtonElement>(null);
  const heureFinBtnRef = useRef<HTMLButtonElement>(null);
  const membreBtnRef = useRef<HTMLButtonElement>(null);
  const [openPicker, setOpenPicker] = useState<"date" | "hd" | "hf" | "membre" | null>(null);

  const v = form.values;
  const assigneLabel = v.membre_id ? (membres.find(m => m.id === v.membre_id) ? `${membres.find(m => m.id === v.membre_id)!.prenom} ${membres.find(m => m.id === v.membre_id)!.nom}` : "Non assigné") : "Non assigné";

  return (
    <>
      {/* PC-first (retour Bryan 20/09/2026) : Espace de travail est un
          outil de bureau, jamais un bottom sheet mobile ici — dialogue
          centré unique, aucune logique responsive. */}
      <div
        onClick={() => { if (openPicker) { setOpenPicker(null); return; } onRequestClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      >
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "18px", padding: "24px", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
          <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "14px" }}>{form.mode === "edit" ? "Modifier l'événement" : "Nouvel événement"}</div>

          <input value={v.titre} onChange={e => onChange({ titre: e.target.value })} placeholder="Titre" style={inputStyle(C)}/>
          <textarea value={v.description} onChange={e => onChange({ description: e.target.value })} placeholder="Description (optionnel)" rows={2} style={{ ...inputStyle(C), resize: "none" }}/>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <select value={v.type} onChange={e => onChange({ type: e.target.value })} style={inputStyle(C)}>
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button ref={dateBtnRef} onClick={() => setOpenPicker(p => p === "date" ? null : "date")} style={fieldBtnStyle(C)}>
              {new Date(`${v.date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <button ref={heureDebutBtnRef} onClick={() => setOpenPicker(p => p === "hd" ? null : "hd")} style={fieldBtnStyle(C)}>{v.heure_debut || "Heure de début"}</button>
            <button ref={heureFinBtnRef} onClick={() => setOpenPicker(p => p === "hf" ? null : "hf")} style={fieldBtnStyle(C)}>{v.heure_fin || "Heure de fin (optionnel)"}</button>
          </div>

          <button ref={membreBtnRef} onClick={() => setOpenPicker(p => p === "membre" ? null : "membre")} style={{ ...fieldBtnStyle(C), width: "100%", marginBottom: "14px" }}>Assigné à — {assigneLabel}</button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onRequestClose}>Annuler</Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!v.titre.trim() || !v.heure_debut} loading={saving} onClick={onSave}>Enregistrer</Button>
          </div>
        </div>
      </div>

      <DatePicker open={openPicker === "date"} onClose={() => setOpenPicker(null)} anchorRef={dateBtnRef} tokens={C} value={v.date} onSelect={d => onChange({ date: d })}/>
      <TimePicker open={openPicker === "hd"} onClose={() => setOpenPicker(null)} anchorRef={heureDebutBtnRef} tokens={C} value={v.heure_debut} onSelect={t => onChange({ heure_debut: t })}/>
      <TimePicker open={openPicker === "hf"} onClose={() => setOpenPicker(null)} anchorRef={heureFinBtnRef} tokens={C} value={v.heure_fin} onSelect={t => onChange({ heure_fin: t })}/>
      <MemberPicker open={openPicker === "membre"} onClose={() => setOpenPicker(null)} anchorRef={membreBtnRef} tokens={C} membres={membres} value={v.membre_id || null} onSelect={id => onChange({ membre_id: id || "" })}/>
    </>
  );
}

function RdvDetailModal({ C, rdv, sending, onClose, onEnvoyerRappel }: {
  C: ThemeTokens; rdv: RdvItem; sending: boolean; onClose: () => void; onEnvoyerRappel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, onClose);
  const sc = statutRdvInfo(rdv.statut, C);

  function copyPhone() {
    if (!rdv.citoyen_phone) return;
    navigator.clipboard.writeText(rdv.citoyen_phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    // PC-first (retour Bryan 20/09/2026) : dialogue centré unique, aucun
    // bottom sheet mobile ici — Espace de travail est un outil de bureau.
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px", padding: "24px", width: "100%", maxWidth: "420px", maxHeight: "88vh", overflowY: "auto", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", outline: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.blue}30, ${C.blue}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "800", color: C.blue, flexShrink: 0 }}>
            {rdv.citoyen_nom.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "17px", fontWeight: "800" }}>{rdv.citoyen_nom}</div>
            {rdv.citoyen_phone && <div style={{ color: C.t3, fontSize: "12px" }}>{rdv.citoyen_phone}</div>}
          </div>
          {rdv.citoyen_phone && (
            <button onClick={copyPhone} className="tap" style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }} title="Copier le numéro">
              {copied
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
            </button>
          )}
          {rdv.citoyen_phone && (
            <a href={`tel:${rdv.citoyen_phone}`} style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </a>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <span style={{ backgroundColor: sc.bg, color: sc.c, fontSize: "10px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px" }}>{sc.l}</span>
          <span style={{ color: C.t3, fontSize: "12px" }}>{new Date(`${rdv.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à {rdv.heure_rdv}</span>
        </div>

        <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", marginBottom: "20px" }}>
          <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Objet</div>
          <div style={{ color: C.t1, fontSize: "13px" }}>{rdv.objet || "RDV général"}</div>
        </div>

        <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth loading={sending} style={{ color: C.gold, border: `1px solid ${C.gold}40`, marginBottom: "8px" }} onClick={onEnvoyerRappel}>Envoyer un rappel</Button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
      </div>
    </div>
  );
}
