"use client";

// Onglet Disponibilités — porté depuis l'ancienne route séparée
// app/institution/disponibilites/page.tsx (thème @/lib/theme, clair/sombre)
// vers les tokens C.* du dashboard institution, cohérent avec le reste de
// l'interface. Logique de génération de créneaux inchangée : même colonne
// institutions.disponibilites (tableau de chaînes "Abbrev HH:MM"), même
// mécanisme de sauvegarde.
//
// Redesign v2 : conteneur borné en largeur (maxWidth) pour rester premium
// sur grand écran PC — sans ce plafond, la barre de sauvegarde s'étirait
// sur toute la largeur du contenu, amateur au-delà de ~800px. Bandeau
// d'état remplacé par une barre de statut unique (anneau de progression +
// pastille "configuré / non configuré"), et la sauvegarde n'est active
// que si les réglages diffèrent de ce qui est enregistré en base.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "../theme";

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

// Anneau de progression compact — jours actifs / 7.
function DaysRing({ value, max, size = 46 }: { value: number; max: number; size?: number }) {
  const { theme } = useTheme();
  const C = T[theme];
  const pct = max > 0 ? value / max : 0;
  const r = (size - 5) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct === 0 ? C.t3 : pct < 1 ? C.gold : C.green;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.bg3} strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${pct * circ} ${circ - pct * circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.t1, fontSize: "12px", fontWeight: "900" }}>{value}</span>
      </div>
    </div>
  );
}

export function DisponibilitesTab({ disponibilites, onSaved, access = "full" }: { disponibilites: unknown; onSaved: () => void; access?: "full" | "read" }) {
  const readOnly = access === "read";
  const { theme } = useTheme();
  const C = T[theme];
  const params = useParams<{ id: string }>();
  const instId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [rules, setRules] = useState<Record<DayKey, DayRule>>(() => parseToRules(disponibilites));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<DayKey | null>(null);

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

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Disponibilités</h1>
        <p style={{ color: C.t2, fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Configurez vos jours et heures d'ouverture. Les citoyens pourront réserver uniquement sur ces créneaux.
        </p>

        {/* Barre de statut — remplace les 2 cartes brutes par un seul
            bandeau lisible : anneau jours actifs, total créneaux, pastille
            d'état de la configuration. */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "16px 18px", marginBottom: "18px" }}>
          <DaysRing value={activeDays} max={7} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: "900", letterSpacing: "-0.3px" }}>
              {totalSlots} <span style={{ color: C.t3, fontSize: "12px", fontWeight: "700" }}>créneaux / semaine</span>
            </div>
            <div style={{ color: C.t3, fontSize: "11.5px", marginTop: "2px" }}>{activeDays} jour{activeDays > 1 ? "s" : ""} sur 7 configuré{activeDays > 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: statusBg, border: `1px solid ${statusColor}30`, borderRadius: "20px", padding: "5px 11px", flexShrink: 0 }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: statusColor, flexShrink: 0 }}/>
            <span style={{ color: statusColor, fontSize: "10.5px", fontWeight: "800", whiteSpace: "nowrap" }}>{statusLabel}</span>
          </div>
        </div>

        <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "16px 18px", marginBottom: "18px" }}>
          <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Capacité par créneau</div>
          <p style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.5, margin: "0 0 12px" }}>Nombre de citoyens que vous pouvez recevoir au même horaire. Au-delà, un créneau affiche "Complet" côté citoyen.</p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="number" min={1} value={capacite} onChange={e => setCapacite(e.target.value)} disabled={readOnly} style={{ width: "80px", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "10px", padding: "9px 12px", fontSize: "13px", color: C.t1, fontWeight: "700", opacity: readOnly ? 0.6 : 1 }}/>
            <span style={{ color: C.t3, fontSize: "12px" }}>personne{Number(capacite) > 1 ? "s" : ""} / créneau</span>
            {!readOnly && capacite !== capaciteSaved && (
              <button onClick={handleSaveCapacite} disabled={capaciteSaving} className="tap" style={{ marginLeft: "auto", backgroundColor: C.gold, color: "#000", border: "none", borderRadius: "10px", padding: "8px 16px", fontWeight: "800", fontSize: "12.5px", cursor: "pointer" }}>
                {capaciteSaving ? "…" : "Enregistrer"}
              </button>
            )}
          </div>
          {capaciteError && <div style={{ color: C.red, fontSize: "11.5px", fontWeight: "700", marginTop: "8px" }}>{capaciteError}</div>}
        </div>

        {error && (
          <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}25`, borderLeft: `3px solid ${C.red}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
            <p style={{ color: C.red, fontSize: "13px", margin: 0, fontWeight: "600" }}>{error}</p>
          </div>
        )}
        {saveMsg && (
          <div style={{ backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
            <p style={{ color: C.green, fontSize: "13px", margin: 0, fontWeight: "600" }}>{saveMsg}</p>
          </div>
        )}

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
      </div>

      {/* Barre de sauvegarde — sticky, mais bornée à la même largeur max
          que le contenu : sur PC elle ne s'étire plus sur toute la
          largeur du panneau, elle reste alignée sous le contenu. Absente
          en lecture seule (agent) — l'écriture est de toute façon rejetée
          côté serveur (disponibilites.write, lib/institutionPermissions.ts). */}
      {!readOnly && <div className="dispo-save-bar" style={{ position: "sticky", bottom: "76px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", paddingTop: "14px" }}>
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
                  <div style={{ width: "13px", height: "13px", border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "currentColor", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}/>
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
      </div>}

      <style>{`
        @media (min-width: 1024px) {
          .dispo-save-bar { bottom: 0; }
        }
      `}</style>
    </div>
  );
}
