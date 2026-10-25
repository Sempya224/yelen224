"use client";

// Onglet Disponibilités — porté depuis l'ancienne route séparée
// app/institution/disponibilites/page.tsx (thème @/lib/theme, clair/sombre)
// vers les tokens C.* du dashboard institution. Logique de génération de
// créneaux inchangée : même colonne institutions.disponibilites (tableau de
// chaînes "Abbrev HH:MM", 24 h), même mécanisme de sauvegarde.
//
// Redesign v3 (05/08/2026, Mission 01 UX/UI Hardening) : pleine largeur,
// jours en contenu principal, Capacité par créneau en panneau latéral.
//
// Refonte "niveau US" (23/10/2026) : présentation extraite dans
// DisponibilitesUi.tsx (carte de jour, champ d'heure 12 h AM/PM, modales
// accessibles, barre d'enregistrement). Heures affichées et saisies en 12 h,
// stockage inchangé en HH:MM 24 h. Panneau latéral à droite dès 1280 px,
// dessous en dessous. Barre d'enregistrement sticky en bas de la page
// (l'ancien masquage au scroll est retiré : la barre reste toujours visible).
// La capacité garde son propre bouton Enregistrer (endpoint distinct,
// /api/institution/profile) et n'entre pas dans le compteur de jours modifiés.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpCenterGuide } from "./HelpCenterGuide";
import { PauseReservationsCard } from "./PauseReservationsCard";
import { heureAmPm } from "@/lib/heure";
import {
  ApercuCitoyenModal, DayCard, DispoStyles, HistoriqueModal, SaveBarDispo,
  formatDateHeureCourt, toHHMM, toMin, type DayDuration, type SaveBarStatus,
} from "./DisponibilitesUi";

type DayKey = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";
type DayRule = { active: boolean; start: string; end: string; duration: DayDuration };

const DAYS: Array<{ key: DayKey; label: string; abbrev: string }> = [
  { key: "lundi",    label: "Lundi",    abbrev: "Lun" },
  { key: "mardi",    label: "Mardi",    abbrev: "Mar" },
  { key: "mercredi", label: "Mercredi", abbrev: "Mer" },
  { key: "jeudi",    label: "Jeudi",    abbrev: "Jeu" },
  { key: "vendredi", label: "Vendredi", abbrev: "Ven" },
  { key: "samedi",   label: "Samedi",   abbrev: "Sam" },
  { key: "dimanche", label: "Dimanche", abbrev: "Dim" },
];

function emptyRules(): Record<DayKey, DayRule> {
  return DAYS.reduce((a, d) => ({ ...a, [d.key]: { active: false, start: "", end: "", duration: 30 } }), {} as Record<DayKey, DayRule>);
}

function parseToRules(raw: unknown): Record<DayKey, DayRule> {
  const rules = emptyRules();
  let list: unknown = raw;
  if (typeof raw === "string") { try { list = JSON.parse(raw); } catch { return rules; } }
  if (!Array.isArray(list)) return rules;

  const byDay: Partial<Record<DayKey, number[]>> = {};
  for (const item of list) {
    if (typeof item !== "string") continue;
    const m = /^([A-Za-z]{3})\s+(\d{2}:\d{2})$/.exec(item.trim());
    if (!m) continue;
    const mins = toMin(m[2]);
    if (mins === null) continue;
    const day = DAYS.find(d => d.abbrev.toLowerCase() === m[1].toLowerCase())?.key;
    if (!day) continue;
    byDay[day] = [...(byDay[day] ?? []), mins];
  }

  for (const d of DAYS) {
    const times = (byDay[d.key] ?? []).sort((a, b) => a - b);
    if (!times.length) continue;
    const deltas = times.slice(1).map((t, i) => t - times[i]).filter(t => [15, 30, 45, 60].includes(t));
    const freq = deltas.reduce((a, v) => { a[v] = (a[v] ?? 0) + 1; return a; }, {} as Record<number, number>);
    const dur = (Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 30)) as DayDuration;
    rules[d.key] = { active: true, start: toHHMM(times[0]), end: toHHMM(times[times.length - 1] + dur), duration: Number(dur) as DayDuration };
  }
  return rules;
}

function generateSlots(rules: Record<DayKey, DayRule>): string[] {
  const slots: string[] = [];
  for (const d of DAYS) {
    const r = rules[d.key];
    if (!r.active) continue;
    const s = toMin(r.start), e = toMin(r.end);
    if (s === null || e === null || e <= s) continue;
    for (let t = s; t + r.duration <= e; t += r.duration) slots.push(`${d.abbrev} ${toHHMM(t)}`);
  }
  return [...new Set(slots)].sort((a, b) => a.localeCompare(b));
}

function countSlots(rules: Record<DayKey, DayRule>, key: DayKey): number {
  const r = rules[key];
  if (!r.active) return 0;
  const s = toMin(r.start), e = toMin(r.end);
  if (s === null || e === null || e <= s) return 0;
  return Math.floor((e - s) / r.duration);
}

function ruleEqual(a: DayRule, b: DayRule): boolean {
  return a.active === b.active && a.start === b.start && a.end === b.end && a.duration === b.duration;
}

// Amplitude globale (première ouverture → dernière fermeture parmi les
// jours actifs) et durée moyenne des rendez-vous — purement dérivées des
// règles existantes, aucune nouvelle logique métier.
function computeAmplitude(rules: Record<DayKey, DayRule>): { start: string; end: string } | null {
  let minStart: number | null = null, maxEnd: number | null = null;
  for (const d of DAYS) {
    const r = rules[d.key];
    if (!r.active) continue;
    const s = toMin(r.start), e = toMin(r.end);
    if (s === null || e === null) continue;
    if (minStart === null || s < minStart) minStart = s;
    if (maxEnd === null || e > maxEnd) maxEnd = e;
  }
  if (minStart === null || maxEnd === null) return null;
  return { start: toHHMM(minStart), end: toHHMM(maxEnd) };
}
function computeAvgDuration(rules: Record<DayKey, DayRule>): number | null {
  const actives = DAYS.map(d => rules[d.key]).filter(r => r.active);
  if (actives.length === 0) return null;
  return Math.round(actives.reduce((s, r) => s + r.duration, 0) / actives.length);
}
type ConfigStatus = "vide" | "incomplet" | "erreur" | "valide";
function computeConfigStatus(rules: Record<DayKey, DayRule>): ConfigStatus {
  const actives = DAYS.map(d => rules[d.key]).filter(r => r.active);
  if (actives.length === 0) return "vide";
  for (const r of actives) {
    if (!r.start || !r.end) return "incomplet";
    const s = toMin(r.start), e = toMin(r.end);
    if (s === null || e === null || e <= s) return "erreur";
  }
  return "valide";
}

function h12(v: string): string {
  return heureAmPm(v) || v;
}

// Toast compact — coin supérieur droit, disparition automatique après 3 s.
function Toast({ message, color, onDismiss }: { message: string; color: string; onDismiss: () => void }) {
  const { theme } = useTheme();
  const C = T[theme];
  useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", top: "16px", right: "16px", zIndex: 1200, backgroundColor: C.bgCard2, border: `1px solid ${color}40`, borderRadius: "12px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", animation: "fadeIn 0.15s ease", maxWidth: "320px" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
      <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600 }}>{message}</span>
    </div>
  );
}

const NUM = { fontVariantNumeric: "tabular-nums" } as const;

function StepperButton({ label, onClick, disabled, children, C }: { label: string; onClick: () => void; disabled?: boolean; children: string; C: ThemeTokens }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="dispo-hit yelen-focus-ring"
      style={{ width: "36px", height: "36px", borderRadius: "8px", border: `1px solid ${C.border}`, backgroundColor: C.bg3, color: C.t1, fontSize: "16px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
      {children}
    </button>
  );
}

export function DisponibilitesTab({ disponibilites, modifieLe, modifieParNom, peutVoirHistorique, onSaved, access = "full", isHotel = false, onNavigate }: {
  disponibilites: unknown; modifieLe?: string | null; modifieParNom?: string | null; peutVoirHistorique?: boolean;
  onSaved: () => void; access?: "full" | "read"; isHotel?: boolean; onNavigate?: (tab: string) => void;
}) {
  const readOnly = access === "read";
  const { theme } = useTheme();
  const C = T[theme];
  const params = useParams<{ id: string }>();
  const instId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [rules, setRules] = useState<Record<DayKey, DayRule>>(() => parseToRules(disponibilites));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [hauteurBarre, setHauteurBarre] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<DayKey | null>(null);
  const [showHistorique, setShowHistorique] = useState(false);
  const [showApercu, setShowApercu] = useState(false);

  // Capacité par créneau (Lot B, refonte wizard RDV citoyen, 16/07/2026) —
  // combien de citoyens peuvent être reçus au même horaire. Chargée/enregistrée
  // indépendamment via /api/institution/profile (institutions.
  // capacite_par_creneau, migration 20260720000005) : réglage distinct des
  // jours/heures d'ouverture ci-dessus, pas de raison de coupler leur sauvegarde.
  const [capacite, setCapacite] = useState("1");
  const [capaciteSaved, setCapaciteSaved] = useState("1");
  const [capaciteSaving, setCapaciteSaving] = useState(false);
  const [capaciteError, setCapaciteError] = useState<string | null>(null);
  const [capaciteChargee, setCapaciteChargee] = useState(false);
  // Échec de chargement (réseau, HTTP, institution absente) : la valeur
  // affichée serait un défaut inventé, on verrouille donc toute édition.
  const [capaciteEchec, setCapaciteEchec] = useState(false);

  const chargerCapacite = useCallback(async () => {
    if (!instId) return;
    try {
      const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const j = res.ok ? await res.json().catch(() => null) : null;
      if (!j?.institution) { setCapaciteEchec(true); return; }
      const val = String(j.institution.capacite_par_creneau ?? 1);
      setCapacite(val);
      setCapaciteSaved(val);
    } catch {
      setCapaciteEchec(true);
    } finally {
      setCapaciteChargee(true);
    }
  }, [instId]);
  useEffect(() => { void chargerCapacite(); }, [chargerCapacite]);

  const handleSaveCapacite = useCallback(async () => {
    setCapaciteError(null);
    const n = Number(capacite);
    if (!Number.isInteger(n) || n < 1) { setCapaciteError("Entrez un nombre entier d'au moins 1."); return; }
    setCapaciteSaving(true);
    const res = await fetch("/api/institution/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capacite_par_creneau: n }),
    });
    setCapaciteSaving(false);
    if (!res.ok) { setCapaciteError("Erreur lors de l'enregistrement."); return; }
    setCapaciteSaved(String(n));
  }, [capacite]);

  const savedRules = useMemo(() => parseToRules(disponibilites), [disponibilites]);
  useEffect(() => { setRules(savedRules); }, [savedRules]);

  const totalSlots = useMemo(() => generateSlots(rules).length, [rules]);
  const activeDays = useMemo(() => DAYS.filter(d => rules[d.key].active).length, [rules]);
  const joursModifies = useMemo(() => DAYS.filter(d => !ruleEqual(rules[d.key], savedRules[d.key])).length, [rules, savedRules]);
  const isDirty = joursModifies > 0;

  const onToggle = (key: DayKey, active: boolean) => {
    if (readOnly) return;
    setSaveFailed(false);
    setRules(prev => ({ ...prev, [key]: { ...prev[key], active } }));
    if (active && expandedDay !== key) setExpandedDay(key);
    if (!active && expandedDay === key) setExpandedDay(null);
  };

  const onRule = (key: DayKey, patch: Partial<DayRule>) => {
    if (readOnly) return;
    setSaveFailed(false);
    setRules(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSave = useCallback(async () => {
    setError(null);
    setSaveMsg(null);
    setSaveFailed(false);
    for (const d of DAYS) {
      const r = rules[d.key];
      if (!r.active) continue;
      if (!r.start || !r.end) { setError(`${d.label} : heure de début et de fin requises.`); setSaveFailed(true); return; }
      const s = toMin(r.start), e = toMin(r.end);
      if (s === null || e === null) { setError(`${d.label} : format invalide.`); setSaveFailed(true); return; }
      if (e <= s) { setError(`${d.label} : l'heure de fin doit être après l'heure de début.`); setSaveFailed(true); return; }
    }
    setSaving(true);
    // Route serveur (service role + session JWT) — l'ancien .update() client
    // direct était bloqué silencieusement par RLS (aucune policy UPDATE sur
    // institutions), la sauvegarde ne persistait jamais.
    const res = await fetch("/api/institution/disponibilites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disponibilites: generateSlots(rules) }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error || "Erreur lors de l'enregistrement.");
      setSaveFailed(true);
      return;
    }
    setSaveMsg("Disponibilités enregistrées.");
    setTimeout(() => setSaveMsg(null), 3000);
    onSaved();
  }, [rules, onSaved]);

  const annulerModifications = useCallback(() => {
    setSaveFailed(false);
    setRules(savedRules);
  }, [savedRules]);

  // Avertit avant de quitter l'onglet/fenêtre tant que des jours modifiés ne
  // sont pas enregistrés. Ne couvre pas un changement d'onglet interne au
  // dashboard (état local du parent). Ctrl/Cmd + S enregistre.
  useEffect(() => {
    if (readOnly || !isDirty) return;
    const avant = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const raccourci = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!saving) void handleSave(); }
    };
    window.addEventListener("beforeunload", avant);
    window.addEventListener("keydown", raccourci);
    return () => { window.removeEventListener("beforeunload", avant); window.removeEventListener("keydown", raccourci); };
  }, [readOnly, isDirty, saving, handleSave]);

  const statusLabel = activeDays === 0 ? "Non configuré" : isDirty ? "Modifications en attente" : "Configuration active";
  const statusColor = activeDays === 0 ? C.t2 : isDirty ? C.gold : C.green;

  const amplitude = useMemo(() => computeAmplitude(rules), [rules]);
  const avgDuration = useMemo(() => computeAvgDuration(rules), [rules]);
  const configStatus = useMemo(() => computeConfigStatus(rules), [rules]);
  const capaciteHebdo = totalSlots * (Number(capaciteSaved) || 1);
  const configStatusLabel: Record<ConfigStatus, string> = { vide: "Aucun jour ouvert", incomplet: "Configuration incomplète", erreur: "Erreur dans les horaires", valide: "Configuration valide" };
  const configStatusColor: Record<ConfigStatus, string> = { vide: C.t2, incomplet: C.gold, erreur: C.red, valide: C.green };

  const kpis: { label: string; value: string; statut?: boolean }[] = [
    { label: "Jours ouverts", value: `${activeDays} / 7` },
    { label: "Créneaux générés", value: String(totalSlots) },
    { label: "Capacité hebdomadaire", value: `${capaciteHebdo.toLocaleString("fr-FR")} citoyens` },
    { label: "Durée moyenne", value: avgDuration ? `${avgDuration} min` : "—" },
    { label: "Amplitude", value: amplitude ? `${h12(amplitude.start)} → ${h12(amplitude.end)}` : "—" },
    { label: "Statut", value: configStatusLabel[configStatus], statut: true },
  ];

  const saveStatus: SaveBarStatus = saving ? "saving" : saveFailed ? "error" : isDirty ? "dirty" : "clean";
  const capaciteNum = Number(capacite);
  const capaciteDirty = capacite !== capaciteSaved;
  const capaciteVerrouillee = readOnly || !capaciteChargee || capaciteEchec;

  // Hôtellerie (retour Bryan 21/08/2026, docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md) —
  // ce concept (créneaux horaires + durée en minutes, pensé pour un RDV
  // classique) ne s'applique pas à une réservation de chambre/nuit. La
  // durée/unité de prix vit déjà par prestation dans ServicesHotelTab.tsx
  // ("Durée estimée", "Unité" incluant "par nuit") et les horaires
  // Ouvert/Fermé publics dans Profil Entreprise — écran gardé strictement
  // inchangé (hooks/logique intacts) pour les 14 autres secteurs, ce
  // rendu alternatif remplace juste le JSX final pour l'hôtel.
  if (isHotel) {
    return (
      <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
        <div style={{ maxWidth: "540px", margin: "40px auto 0", textAlign: "center" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "16px", backgroundColor: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M2 20h20"/><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M2 14h20"/></svg>
          </div>
          <h1 style={{ color: C.t1, fontSize: "18px", fontWeight: "800", letterSpacing: "-0.3px", marginBottom: "8px" }}>Ne s&apos;applique pas à votre établissement</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "22px" }}>
            Cet écran configure des créneaux horaires façon rendez-vous (durée en minutes) — pensé pour un hôpital, une mairie, une banque… Pour un hôtel, chaque chambre ou prestation a déjà son propre tarif, son unité (par nuit, par personne…) et ses horaires, réglés directement à sa création.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => onNavigate?.("services")}>
              Gérer chambres et prestations
            </Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => onNavigate?.("profil-entreprise")}>
              Horaires Ouvert / Fermé
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dispo-root" style={{ padding: "16px", paddingBottom: `max(100px, calc(${hauteurBarre + 16}px + var(--dispo-bar-offset)))`, animation: "fadeUp 0.15s ease" }}>
      <DispoStyles />
      {saveMsg && <Toast message={saveMsg} color={C.green} onDismiss={() => setSaveMsg(null)}/>}
      {error && <Toast message={error} color={C.red} onDismiss={() => setError(null)}/>}
      {showHistorique && <HistoriqueModal C={C} onClose={() => setShowHistorique(false)}/>}
      {showApercu && <ApercuCitoyenModal C={C} disponibilites={disponibilites} onClose={() => setShowApercu(false)}/>}

      {/* ── En-tête ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, letterSpacing: "-0.3px", margin: "0 0 6px" }}>Disponibilités</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, margin: "0 0 10px", maxWidth: "480px" }}>
            Définissez quand les citoyens peuvent réserver chez vous
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t1, fontSize: "12.5px", fontWeight: 600 }}>
              <span aria-hidden style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: statusColor }}/>
              {statusLabel}
            </span>
            {modifieLe && (
              <span style={{ color: C.t2, fontSize: "12px", ...NUM }}>
                Dernière modification : {formatDateHeureCourt(modifieLe)}{modifieParNom ? ` par ${modifieParNom}` : ""}
              </span>
            )}
          </div>
        </div>
        <div role="group" aria-label="Actions" style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <HelpCenterGuide tab="disponibilites" />
          {peutVoirHistorique && (
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              onClick={() => setShowHistorique(true)}>Historique</Button>
          )}
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
            onClick={() => setShowApercu(true)}>Aperçu citoyen</Button>
        </div>
      </div>

      <PauseReservationsCard C={C} access={access} />

      {/* KPI : 6 cartes homogènes, lecture immédiate de la configuration. */}
      <section aria-label="Indicateurs de configuration" style={{ marginBottom: "20px" }}>
        <h2 className="dispo-sr">Indicateurs de configuration</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
          {kpis.map(k => (
            <Card key={k.label} tokens={toCardTokens(C)} padding="14px">
              <div style={{ color: C.t2, fontSize: "12px" }}>{k.label}</div>
              {k.statut ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: configStatusColor[configStatus], fontSize: "14px", fontWeight: 600, marginTop: "6px" }}>
                  {configStatus === "valide"
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                  <span>{k.value}</span>
                </div>
              ) : (
                <div style={{ color: C.t1, fontSize: "20px", fontWeight: 600, letterSpacing: "-0.2px", marginTop: "4px", overflowWrap: "anywhere", ...NUM }}>{k.value}</div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Réciproque de la note "Horaires" de ProfilEntrepriseTab.tsx. Rendu
          hôtel exclu (retour anticipé ci-dessus). */}
      <div style={{ backgroundColor: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: 0 }}>
          Ces horaires déterminent ce que les citoyens peuvent réserver. Le badge Ouvert / Fermé de votre fiche publique se règle dans{" "}
          {onNavigate ? (
            <button type="button" onClick={() => onNavigate("profil-entreprise")} className="yelen-focus-ring"
              style={{ background: "none", border: "none", padding: 0, color: C.t1, fontSize: "inherit", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>Profil Entreprise</button>
          ) : "Profil Entreprise"}.
        </p>
      </div>

      <div className="dispo-layout">
        <section aria-label="Jours et horaires" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h2 style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>Jours et horaires</h2>
          {DAYS.map(d => (
            <DayCard key={d.key} id={`dispo-${d.key}`} label={d.label} rule={rules[d.key]} readOnly={readOnly}
              expanded={expandedDay === d.key} slots={countSlots(rules, d.key)} C={C}
              onToggleExpand={() => setExpandedDay(expandedDay === d.key ? null : d.key)}
              onToggleActive={() => onToggle(d.key, !rules[d.key].active)}
              onRule={patch => onRule(d.key, patch)}/>
          ))}
        </section>

        <div className="dispo-sidebar" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Card tokens={toCardTokens(C)} padding="18px">
            <section aria-label="Capacité par créneau">
              <h2 style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>Capacité par créneau</h2>
              <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, margin: "0 0 14px" }}>Nombre de citoyens que vous pouvez recevoir au même horaire</p>
              {!capaciteChargee ? (
                <div aria-busy="true" aria-label="Chargement de la capacité" style={{ height: "36px", width: "180px", borderRadius: "8px", backgroundColor: C.bg3 }}/>
              ) : capaciteEchec ? null : (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <StepperButton label="Diminuer la capacité" C={C} disabled={capaciteVerrouillee || !(capaciteNum > 1)} onClick={() => setCapacite(String(Math.max(1, (Number.isInteger(capaciteNum) ? capaciteNum : 1) - 1)))}>−</StepperButton>
                  <input type="number" min={1} inputMode="numeric" aria-label="Capacité par créneau" value={capacite} onChange={e => setCapacite(e.target.value)} disabled={capaciteVerrouillee} className="yelen-focus-ring dispo-select"
                    style={{ width: "64px", height: "36px", boxSizing: "border-box", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "0 8px", fontSize: "14px", color: C.t1, fontWeight: 600, textAlign: "center", opacity: capaciteVerrouillee ? 0.6 : 1, ...NUM }}/>
                  <StepperButton label="Augmenter la capacité" C={C} disabled={capaciteVerrouillee} onClick={() => setCapacite(String((Number.isInteger(capaciteNum) ? capaciteNum : 0) + 1))}>+</StepperButton>
                  <span style={{ color: C.t2, fontSize: "12.5px" }}>personne{capaciteNum > 1 ? "s" : ""} / créneau</span>
                </div>
              )}
              {capaciteEchec && (
                <div role="alert">
                  <p style={{ color: C.red, fontSize: "12.5px", fontWeight: 600, margin: "0 0 10px" }}>Capacité indisponible</p>
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => { setCapaciteEchec(false); setCapaciteChargee(false); void chargerCapacite(); }}>Réessayer</Button>
                </div>
              )}
              {!readOnly && capaciteDirty && (
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth disabled={capaciteVerrouillee} loading={capaciteSaving} onClick={() => void handleSaveCapacite()} style={{ marginTop: "12px" }}>
                  {capaciteSaving ? "Enregistrement…" : "Enregistrer"}
                </Button>
              )}
              {capaciteError && <div role="alert" style={{ color: C.red, fontSize: "12px", fontWeight: 600, marginTop: "8px" }}>{capaciteError}</div>}
            </section>
          </Card>
        </div>
      </div>

      {!readOnly && (
        <SaveBarDispo status={saveStatus} joursModifies={joursModifies} totalSlots={totalSlots} capaciteEnAttente={capaciteDirty}
          onSave={() => void handleSave()} onCancel={annulerModifications} onHeight={setHauteurBarre} C={C}/>
      )}
    </div>
  );
}
