"use client";

// Onglet Disponibilités — porté depuis l'ancienne route séparée
// app/institution/disponibilites/page.tsx (thème @/lib/theme, clair/sombre)
// vers les tokens C.* du dashboard institution, cohérent avec le reste de
// l'interface. Logique de génération de créneaux inchangée : même colonne
// institutions.disponibilites (tableau de chaînes "Abbrev HH:MM"), même
// mécanisme de sauvegarde.
//
// Redesign v3 (05/08/2026, Mission 01 UX/UI Hardening) : le conteneur
// borné à 760px du redesign v2 laissait un vide énorme des deux côtés sur
// grand écran (le panneau du dashboard va jusqu'à 1280px, .yelen-page) —
// signalé par Bryan comme "pas au niveau US". Le contenu occupe désormais
// toute la largeur disponible, structuré en deux colonnes ≥1024px (liste
// des jours en contenu principal, Capacité par créneau en panneau latéral
// collant), même logique que la pleine largeur déjà utilisée sur
// ClockInShiftTab/EquipeTab. Bandeau d'état remplacé par une barre de
// statut unique (anneau de progression + pastille "configuré / non
// configuré"), et la sauvegarde n'est active que si les réglages
// diffèrent de ce qui est enregistré en base.
//
// Barre de sauvegarde du planning (05/08/2026, ajustement demandé par
// Bryan après un premier passage) : rattachée à l'intérieur du panneau
// latéral, juste sous la carte Capacité par créneau, pas sous la liste
// des jours ("le form"). ≥1024px elle redevient un bloc normal empilé
// sous Capacité — le panneau latéral entier (`.dispo-sidebar`) étant
// sticky, les deux restent visibles ensemble pendant qu'on scrolle la
// liste des jours. Sur mobile elle garde son ancien comportement collé en
// bas d'écran (position sticky, pas fixed — évite tout souci de
// containing block avec un ancêtre transformé), avec en plus un
// masquage/affichage au scroll (cachée en scrollant vers le bas, visible
// en remontant ou près du haut de page) pour ne jamais couvrir le contenu
// pendant la lecture.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { generateSlotsInRange } from "@/lib/disponibilites";

type DayKey = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";
type DayRule = { active: boolean; start: string; end: string; duration: 15 | 30 | 45 | 60 };

const DAYS: Array<{ key: DayKey; label: string; abbrev: string }> = [
  { key: "lundi",    label: "Lundi",    abbrev: "Lun" },
  { key: "mardi",    label: "Mardi",    abbrev: "Mar" },
  { key: "mercredi", label: "Mercredi", abbrev: "Mer" },
  { key: "jeudi",    label: "Jeudi",    abbrev: "Jeu" },
  { key: "vendredi", label: "Vendredi", abbrev: "Ven" },
  { key: "samedi",   label: "Samedi",   abbrev: "Sam" },
  { key: "dimanche", label: "Dimanche", abbrev: "Dim" },
];

const DURATIONS: Array<DayRule["duration"]> = [15, 30, 45, 60];

function toMin(v: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function toHHMM(t: number): string {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

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
    const dur = (Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 30)) as DayRule["duration"];
    rules[d.key] = { active: true, start: toHHMM(times[0]), end: toHHMM(times[times.length - 1] + dur), duration: Number(dur) as DayRule["duration"] };
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

function rulesEqual(a: Record<DayKey, DayRule>, b: Record<DayKey, DayRule>): boolean {
  return DAYS.every(d => {
    const ra = a[d.key], rb = b[d.key];
    return ra.active === rb.active && ra.start === rb.start && ra.end === rb.end && ra.duration === rb.duration;
  });
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
function formatDateHeureCourt(iso: string): string {
  const d = new Date(iso);
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const cible = new Date(d); cible.setHours(0, 0, 0, 0);
  const jour = cible.getTime() === aujourdhui.getTime() ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${jour}, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Toast compact (remplace les anciens bandeaux pleine-largeur) — coin
// supérieur droit, disparition automatique après 3s (déjà le délai utilisé
// par l'appelant via setTimeout, ce composant est juste l'affichage).
function Toast({ message, color, onDismiss }: { message: string; color: string; onDismiss: () => void }) {
  const { theme } = useTheme();
  const C = T[theme];
  useEffect(() => { const t = setTimeout(onDismiss, 3000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div style={{ position: "fixed", top: "16px", right: "16px", zIndex: 1200, backgroundColor: C.bgCard2, border: `1px solid ${color}40`, borderRadius: "12px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", animation: "fadeIn 0.2s ease", maxWidth: "320px" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{message}</span>
    </div>
  );
}

// Mini-timeline 06h→24h — barre horaire avec le segment ouvert surligné,
// lecture visuelle immédiate d'une journée sans ouvrir l'accordéon.
function DayTimeline({ r, C }: { r: DayRule; C: ThemeTokens }) {
  const DAY_START = 0, DAY_END = 24 * 60;
  const s = toMin(r.start), e = toMin(r.end);
  const pct = (v: number) => ((v - DAY_START) / (DAY_END - DAY_START)) * 100;
  return (
    <div style={{ position: "relative", height: "6px", borderRadius: "3px", backgroundColor: C.bg3, overflow: "hidden" }}>
      {r.active && s !== null && e !== null && e > s && (
        <div style={{ position: "absolute", left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%`, height: "100%", backgroundColor: C.gold, borderRadius: "3px" }}/>
      )}
    </div>
  );
}

function HistoriqueModal({ C, onClose }: { C: ThemeTokens; onClose: () => void }) {
  const [entrees, setEntrees] = useState<{ id: string; membre_nom: string; action: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let annule = false;
    fetch("/api/institution/journal?categorie=disponibilites&limit=15")
      .then(r => r.json()).catch(() => null)
      .then(j => { if (!annule) { setEntrees(j?.entrees ?? []); setLoading(false); } });
    return () => { annule = true; };
  }, []);
  return (
    <div className="dispo-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .dispo-fiche-overlay{align-items:center!important}
          .dispo-fiche-panel{max-width:480px!important;border-radius:20px!important;max-height:80svh!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="dispo-fiche-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: "480px", maxHeight: "80svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900", marginBottom: "14px" }}>Historique des modifications</div>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><YelenLoader size={20}/></div> : entrees.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "12.5px" }}>Aucune modification enregistrée pour l&apos;instant.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {entrees.map(e => (
              <div key={e.id} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
                <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>Disponibilités modifiées</div>
                <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>{e.membre_nom} · {formatDateHeureCourt(e.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "10px", marginTop: "10px" }}>Fermer</button>
      </div>
    </div>
  );
}

function ApercuCitoyenModal({ C, disponibilites, onClose }: { C: ThemeTokens; disponibilites: unknown; onClose: () => void }) {
  const slots = useMemo(() => generateSlotsInRange(disponibilites, 7).slice(0, 12), [disponibilites]);
  return (
    <div className="dispo-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .dispo-fiche-overlay{align-items:center!important}
          .dispo-fiche-panel{max-width:480px!important;border-radius:20px!important;max-height:80svh!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="dispo-fiche-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: "480px", maxHeight: "80svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div style={{ color: C.t1, fontSize: "16px", fontWeight: "900", marginBottom: "4px" }}>Ce que voit un citoyen</div>
        <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.5, marginBottom: "14px" }}>Prochains créneaux réellement proposés à la réservation, sur les 7 prochains jours — même moteur que le formulaire de prise de rendez-vous.</p>
        {slots.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "12.5px" }}>Aucun créneau à venir avec la configuration actuellement enregistrée.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {slots.map(s => (
              <div key={s.key} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "8px 12px" }}>
                <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>{new Date(s.dateRdv).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</div>
                <div style={{ color: C.gold, fontSize: "12px", fontWeight: "800" }}>{s.heureRdv}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "10px", marginTop: "14px" }}>Fermer</button>
      </div>
    </div>
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

  // Masquage/affichage au scroll de la barre de sauvegarde mobile (sticky
  // bas d'écran) — cachée en descendant pour ne pas couvrir le contenu
  // lu, réaffichée en remontant ou près du haut de page. Neutralisé
  // ≥1024px (transform:none!important dans le <style> plus bas), où la
  // barre est un bloc normal empilé sous Capacité par créneau.
  const [saveBarHidden, setSaveBarHidden] = useState(false);
  const lastScrollY = useRef(0);
  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - lastScrollY.current;
      if (y < 80) setSaveBarHidden(false);
      else if (diff > 6) setSaveBarHidden(true);
      else if (diff < -6) setSaveBarHidden(false);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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

  useEffect(() => {
    if (!instId) return;
    (async () => {
      const res = await fetch(`/api/institution/profile?institution_id=${instId}`);
      const j = res.ok ? await res.json().catch(() => null) : null;
      const val = String(j?.institution?.capacite_par_creneau ?? 1);
      setCapacite(val);
      setCapaciteSaved(val);
    })();
  }, [instId]);

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
  const isDirty = useMemo(() => !rulesEqual(rules, savedRules), [rules, savedRules]);

  const onToggle = (key: DayKey, active: boolean) => {
    if (readOnly) return;
    setRules(prev => ({ ...prev, [key]: { ...prev[key], active } }));
    if (active && expandedDay !== key) setExpandedDay(key);
    if (!active && expandedDay === key) setExpandedDay(null);
  };

  const onRule = (key: DayKey, patch: Partial<DayRule>) => {
    if (readOnly) return;
    setRules(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSave = useCallback(async () => {
    setError(null);
    setSaveMsg(null);
    for (const d of DAYS) {
      const r = rules[d.key];
      if (!r.active) continue;
      if (!r.start || !r.end) { setError(`${d.label} : heure début et fin requises.`); return; }
      const s = toMin(r.start), e = toMin(r.end);
      if (s === null || e === null) { setError(`${d.label} : format invalide.`); return; }
      if (e <= s) { setError(`${d.label} : fin doit être après début.`); return; }
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
      return;
    }
    setSaveMsg("Disponibilités enregistrées.");
    setTimeout(() => setSaveMsg(null), 3000);
    onSaved();
  }, [rules, onSaved]);

  const statusLabel = activeDays === 0 ? "Non configuré" : isDirty ? "Modifications en attente" : "Configuration active";
  const statusColor = activeDays === 0 ? C.t3 : isDirty ? C.gold : C.green;
  const statusBg = activeDays === 0 ? "rgba(153,153,179,0.1)" : isDirty ? `${C.gold}15` : C.greenL;

  const amplitude = useMemo(() => computeAmplitude(rules), [rules]);
  const avgDuration = useMemo(() => computeAvgDuration(rules), [rules]);
  const configStatus = useMemo(() => computeConfigStatus(rules), [rules]);
  const capaciteHebdo = totalSlots * (Number(capaciteSaved) || 1);
  const configStatusLabel: Record<ConfigStatus, string> = { vide: "Aucun jour ouvert", incomplet: "Configuration incomplète", erreur: "Erreur dans les horaires", valide: "Configuration valide" };
  const configStatusColor: Record<ConfigStatus, string> = { vide: C.t3, incomplet: C.gold, erreur: C.red, valide: C.green };

  const kpis: { label: string; value: string; color: string }[] = [
    { label: "Jours ouverts", value: `${activeDays} / 7`, color: C.t1 },
    { label: "Créneaux générés", value: String(totalSlots), color: C.t1 },
    { label: "Capacité hebdomadaire", value: `${capaciteHebdo.toLocaleString("fr-FR")} citoyens`, color: C.t1 },
    { label: "Durée moyenne", value: avgDuration ? `${avgDuration} min` : "—", color: C.t1 },
    { label: "Amplitude", value: amplitude ? `${amplitude.start} → ${amplitude.end}` : "—", color: C.t1 },
    { label: "Statut", value: configStatusLabel[configStatus], color: configStatusColor[configStatus] },
  ];

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
          <h1 style={{ color: C.t1, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px", marginBottom: "8px" }}>Ne s&apos;applique pas à votre établissement</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "22px" }}>
            Cet écran configure des créneaux horaires façon rendez-vous (durée en minutes) — pensé pour un hôpital, une mairie, une banque… Pour un hôtel, chaque chambre ou prestation a déjà son propre tarif, son unité (par nuit, par personne…) et ses horaires, réglés directement à sa création.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => onNavigate?.("services")} className="tap" style={{ backgroundColor: C.gold, color: "#000", border: "none", borderRadius: "10px", padding: "10px 18px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
              Gérer chambres & prestations
            </button>
            <button onClick={() => onNavigate?.("profil-entreprise")} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t1, borderRadius: "10px", padding: "10px 18px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
              Horaires Ouvert / Fermé
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      {saveMsg && <Toast message={saveMsg} color={C.green} onDismiss={() => setSaveMsg(null)}/>}
      {error && <Toast message={error} color={C.red} onDismiss={() => setError(null)}/>}
      {showHistorique && <HistoriqueModal C={C} onClose={() => setShowHistorique(false)}/>}
      {showApercu && <ApercuCitoyenModal C={C} disponibilites={disponibilites} onClose={() => setShowApercu(false)}/>}

      {/* ── Hero header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Disponibilités</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "8px", maxWidth: "480px" }}>
            Configurez vos jours et heures d&apos;ouverture. Les citoyens pourront réserver uniquement sur ces créneaux.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", backgroundColor: statusBg, border: `1px solid ${statusColor}30`, borderRadius: "20px", padding: "4px 10px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: statusColor }}/>
              <span style={{ color: statusColor, fontSize: "10.5px", fontWeight: "800" }}>{statusLabel}</span>
            </span>
            {modifieLe && (
              <span style={{ color: C.t3, fontSize: "10.5px" }}>
                Dernière modification : {formatDateHeureCourt(modifieLe)}{modifieParNom ? ` par ${modifieParNom}` : ""}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {peutVoirHistorique && (
            <button onClick={() => setShowHistorique(true)} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Historique
            </button>
          )}
          <button onClick={() => setShowApercu(true)} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Aperçu citoyen
          </button>
        </div>
      </div>

      {/* KPI exécutifs — remplace l'ancienne barre de statut unique (anneau
          + total + pastille) par 6 cartes homogènes, lecture immédiate de
          toute la configuration sans ouvrir une seule journée. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        {kpis.map(k => (
          <div key={k.label} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "14px", padding: "14px" }}>
            <div style={{ color: k.color, fontSize: "16px", fontWeight: "900", letterSpacing: "-0.2px" }}>{k.value}</div>
            <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "3px" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Corps : liste des jours en contenu principal, Capacité par
          créneau en panneau latéral collant ≥1024px — évite que le
          contenu principal reste borné/étroit alors que la page fait
          jusqu'à 1280px (.yelen-page), sans pour autant étirer une simple
          liste de 7 lignes sur toute la largeur. ── */}
      <div className="dispo-layout" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px", alignItems: "start" }}>
        <style>{`
          @media(min-width:1024px){
            .dispo-layout{grid-template-columns:1fr 320px!important}
            .dispo-sidebar{position:sticky;top:16px}
          }
        `}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {DAYS.map((d, idx) => {
            const r = rules[d.key];
            const slots = countSlots(rules, d.key);
            return (
              <div key={d.key} style={{ backgroundColor: C.bgCard, border: `1px solid ${r.active ? C.gold + "40" : C.border}`, borderLeft: `3px solid ${r.active ? C.gold : "transparent"}`, borderRadius: "14px", overflow: "hidden", animation: `fadeUp 0.2s ease ${idx * 0.03}s both` }}>
                <div onClick={() => setExpandedDay(expandedDay === d.key ? null : d.key)} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div onClick={e => { e.stopPropagation(); onToggle(d.key, !r.active); }} style={{ width: "40px", height: "23px", borderRadius: "12px", backgroundColor: r.active ? C.gold : C.bg3, position: "relative", cursor: readOnly ? "not-allowed" : "pointer", opacity: readOnly ? 0.6 : 1, flexShrink: 0, transition: "background-color 0.2s" }}>
                      <div style={{ position: "absolute", top: "3px", left: r.active ? "20px" : "3px", width: "17px", height: "17px", borderRadius: "50%", backgroundColor: r.active ? "#000" : C.t3, transition: "left 0.2s" }}/>
                    </div>
                    <div>
                      <span style={{ color: r.active ? C.t1 : C.t2, fontSize: "13px", fontWeight: "700" }}>{d.label}</span>
                      {r.active && r.start && r.end && <span style={{ marginLeft: "8px", color: C.t3, fontSize: "11px" }}>{r.start} – {r.end}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {r.active && slots > 0 && (
                      <span style={{ backgroundColor: `${C.gold}15`, border: `1px solid ${C.gold}30`, color: C.gold, fontSize: "10px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>{slots} créneaux</span>
                    )}
                    {!r.active && <span style={{ backgroundColor: "rgba(153,153,179,0.1)", border: `1px solid ${C.border2}`, color: C.t3, fontSize: "10px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>Fermé</span>}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth={2} style={{ transform: expandedDay === d.key ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>
                <div style={{ padding: "0 16px 12px" }}><DayTimeline r={r} C={C}/></div>

                {r.active && (
                  <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
                    <div style={{ paddingTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Ouverture</label>
                        <input type="time" value={r.start} onChange={e => onRule(d.key, { start: e.target.value })} disabled={readOnly} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", color: C.t1, fontSize: "13px", opacity: readOnly ? 0.6 : 1 }}/>
                      </div>
                      <div>
                        <label style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Fermeture</label>
                        <input type="time" value={r.end} onChange={e => onRule(d.key, { end: e.target.value })} disabled={readOnly} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", color: C.t1, fontSize: "13px", opacity: readOnly ? 0.6 : 1 }}/>
                      </div>
                    </div>

                    <div style={{ marginTop: "12px" }}>
                      <label style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "8px" }}>Durée par rendez-vous</label>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {DURATIONS.map(dur => (
                          <button key={dur} onClick={() => onRule(d.key, { duration: dur })} disabled={readOnly} className="tap" style={{ flex: 1, backgroundColor: r.duration === dur ? `${C.gold}15` : C.bg3, border: `1px solid ${r.duration === dur ? C.gold + "40" : C.border}`, borderRadius: "10px", padding: "9px 6px", color: r.duration === dur ? C.gold : C.t2, fontSize: "12px", fontWeight: r.duration === dur ? "800" : "500", cursor: readOnly ? "not-allowed" : "pointer", opacity: readOnly ? 0.6 : 1 }}>
                            {dur} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {r.start && r.end && slots > 0 && (
                      <div style={{ marginTop: "12px", backgroundColor: `${C.gold}0A`, border: `1px solid ${C.gold}25`, borderRadius: "10px", padding: "12px 14px" }}>
                        <p style={{ color: C.gold, fontSize: "10px", fontWeight: "700", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Aperçu — {slots} créneaux générés</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {(() => {
                            const s = toMin(r.start), e = toMin(r.end);
                            if (s === null || e === null) return null;
                            const preview: string[] = [];
                            for (let t = s; t + r.duration <= e && preview.length < 8; t += r.duration) preview.push(toHHMM(t));
                            return preview.map(h => (
                              <span key={h} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "3px 8px", fontSize: "11px", color: C.t2, fontWeight: "500" }}>{h}</span>
                            ));
                          })()}
                          {slots > 8 && <span style={{ color: C.t3, fontSize: "11px", alignSelf: "center" }}>+{slots - 8} autres</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="dispo-sidebar" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${C.gold}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: "800" }}>Capacité par créneau</div>
            </div>
            <p style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.5, margin: "0 0 14px" }}>Nombre de citoyens que vous pouvez recevoir au même horaire. Au-delà, un créneau affiche &quot;Complet&quot; côté citoyen.</p>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="number" min={1} value={capacite} onChange={e => setCapacite(e.target.value)} disabled={readOnly} style={{ width: "80px", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "9px 12px", fontSize: "13px", color: C.t1, fontWeight: "700", opacity: readOnly ? 0.6 : 1 }}/>
              <span style={{ color: C.t3, fontSize: "12px" }}>personne{Number(capacite) > 1 ? "s" : ""} / créneau</span>
            </div>
            {!readOnly && capacite !== capaciteSaved && (
              <button onClick={handleSaveCapacite} disabled={capaciteSaving} className="tap" style={{ width: "100%", marginTop: "12px", backgroundColor: C.gold, color: "#000", border: "none", borderRadius: "10px", padding: "10px 16px", fontWeight: "800", fontSize: "12.5px", cursor: "pointer" }}>
                {capaciteSaving ? "…" : "Enregistrer"}
              </button>
            )}
            {capaciteError && <div style={{ color: C.red, fontSize: "11.5px", fontWeight: "700", marginTop: "8px" }}>{capaciteError}</div>}
          </div>

          {!readOnly && (
            <div className={`dispo-save-bar${saveBarHidden ? " dispo-save-bar--hidden" : ""}`}>
              <div style={{ backgroundColor: `${C.bgCard2}F2`, backdropFilter: "blur(16px)", border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "10px", display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}>
                <div style={{ flex: 1, minWidth: 0, paddingLeft: "6px" }}>
                  <div style={{ color: isDirty ? C.gold : C.t2, fontSize: "11.5px", fontWeight: "700" }}>
                    {isDirty ? "Modifications non enregistrées" : "Tout est à jour"}
                  </div>
                  <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "1px" }}>{totalSlots} créneaux au total</div>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="tap"
                  style={{
                    backgroundColor: saving ? C.bg3 : isDirty ? C.gold : C.bg3,
                    color: saving ? C.t3 : isDirty ? "#000" : C.t3,
                    border: "none", borderRadius: "12px", padding: "12px 22px", fontSize: "13px", fontWeight: "800",
                    cursor: saving || !isDirty ? "not-allowed" : "pointer",
                    boxShadow: isDirty && !saving ? `0 4px 16px ${C.gold}40` : "none",
                    display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, transition: "all 0.2s",
                  }}
                >
                  {saving ? (
                    <>
                      <YelenLoader size={13} color={C.t3}/>
                      Sauvegarde…
                    </>
                  ) : isDirty ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Enregistrer
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Enregistré
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .dispo-save-bar{position:sticky;bottom:76px;z-index:900;transition:transform 0.25s ease;transform:translateY(0)}
        .dispo-save-bar.dispo-save-bar--hidden{transform:translateY(140%)}
        @media (min-width: 1024px) {
          .dispo-save-bar{position:static!important;transform:none!important;margin-top:0}
        }
      `}</style>
    </div>
  );
}
