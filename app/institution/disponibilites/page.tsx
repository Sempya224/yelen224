"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { T } from "@/lib/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type DayKey = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";
type DayRule = { active: boolean; start: string; end: string; duration: 15 | 30 | 45 | 60 };

const DAYS: Array<{ key: DayKey; label: string; abbrev: string; icon: string }> = [
  { key: "lundi",    label: "Lundi",    abbrev: "Lun", icon: "1" },
  { key: "mardi",    label: "Mardi",    abbrev: "Mar", icon: "2" },
  { key: "mercredi", label: "Mercredi", abbrev: "Mer", icon: "3" },
  { key: "jeudi",    label: "Jeudi",    abbrev: "Jeu", icon: "4" },
  { key: "vendredi", label: "Vendredi", abbrev: "Ven", icon: "5" },
  { key: "samedi",   label: "Samedi",   abbrev: "Sam", icon: "6" },
  { key: "dimanche", label: "Dimanche", abbrev: "Dim", icon: "7" },
];

const DURATIONS: Array<DayRule["duration"]> = [15, 30, 45, 60];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const deltas = times.slice(1).map((t, i) => t - times[i]).filter(t => [15,30,45,60].includes(t));
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InstitutionDisponibilitesPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const C = T[theme];
  const isDark = theme === "dark";

  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<DayKey, DayRule>>(emptyRules());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<DayKey | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("yelen224_institution_id");
    if (!id) { setLoadError("Session expirée."); setLoading(false); return; }
    setInstitutionId(id);

    supabase.from("institutions").select("id,name,disponibilites").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setLoadError("Institution introuvable."); setLoading(false); return; }
      setInstitutionName(String(data.name ?? ""));
      setRules(parseToRules(data.disponibilites));
      setLoading(false);
    });
  }, []);

  const totalSlots = useMemo(() => generateSlots(rules).length, [rules]);
  const activeDays = useMemo(() => DAYS.filter(d => rules[d.key].active).length, [rules]);

  const onToggle = (key: DayKey, active: boolean) => {
    setRules(prev => ({ ...prev, [key]: { ...prev[key], active } }));
    if (active && expandedDay !== key) setExpandedDay(key);
    if (!active && expandedDay === key) setExpandedDay(null);
  };

  const onRule = (key: DayKey, patch: Partial<DayRule>) =>
    setRules(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const handleSave = useCallback(async () => {
    if (!institutionId) return;
    setSaveMsg(null); setLoadError(null);
    for (const d of DAYS) {
      const r = rules[d.key];
      if (!r.active) continue;
      if (!r.start || !r.end) { setLoadError(`${d.label} : heure début et fin requises.`); return; }
      const s = toMin(r.start), e = toMin(r.end);
      if (s === null || e === null) { setLoadError(`${d.label} : format invalide.`); return; }
      if (e <= s) { setLoadError(`${d.label} : fin doit être après début.`); return; }
    }
    setSaving(true);
    const { error } = await supabase.from("institutions").update({ disponibilites: generateSlots(rules) }).eq("id", institutionId);
    setSaving(false);
    if (error) { setLoadError(error.message); return; }
    setSaveMsg("Disponibilités sauvegardées avec succès !");
    setTimeout(() => setSaveMsg(null), 4000);
  }, [institutionId, rules]);

  // ── Couleurs thème ──
  const bg      = isDark ? "#0D1117" : "#f8f8fb";
  const cardBg  = isDark ? "#161B22" : "#ffffff";
  const cardBrd = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const txt1    = isDark ? "#F0F6FC" : "#0d0d1a";
  const txt2    = isDark ? "#8B949E" : "#555";
  const txt3    = isDark ? "#6E7681" : "#888";
  const hdrBg   = isDark ? "rgba(10,12,18,0.98)" : "rgba(255,255,255,0.98)";
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "#f5f5f8";

  if (loading) return (
    <div style={{ minHeight: "100vh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "36px", height: "36px", border: `3px solid ${cardBrd}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: bg, color: txt1, fontFamily: "'Inter',-apple-system,sans-serif", transition: "background-color 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideDown{from{opacity:0;max-height:0}to{opacity:1;max-height:400px}}
        input[type=time]{color-scheme:${isDark ? "dark" : "light"}}
        select option{background:${isDark ? "#161B22" : "#fff"};color:${txt1}}
        .day-row:hover{border-color:rgba(245,166,35,0.3)!important}
        .day-row{transition:all 0.15s}
        .toggle-track{transition:background-color 0.2s}
        .toggle-thumb{transition:left 0.2s}
        .dur-btn:hover{border-color:rgba(245,166,35,0.5)!important}
        .dur-btn{transition:all 0.15s;cursor:pointer}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backgroundColor: hdrBg, borderBottom: `1px solid ${cardBrd}`, backdropFilter: "blur(20px)", padding: "0 24px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <div style={{ width: "34px", height: "34px", backgroundColor: "#F5A623", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </div>
            <div>
              <p style={{ color: isDark ? "#fff" : "#0d0d1a", fontSize: "14px", fontWeight: "800", margin: 0, lineHeight: 1 }}>YELEN224</p>
              <p style={{ color: "#F5A623", fontSize: "8px", margin: 0, letterSpacing: "1.5px", fontWeight: "600" }}>REPUBLIQUE DE GUINEE</p>
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ThemeToggle />
            <Link href="/institution/dashboard" style={{ fontSize: "13px", color: txt2, textDecoration: "none", padding: "7px 14px", borderRadius: "8px", border: `1px solid ${cardBrd}` }}>
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Titre */}
        <div style={{ marginBottom: "28px", animation: "fadeUp 0.3s ease" }}>
          <p style={{ color: "#F5A623", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px", fontWeight: "700" }}>
            Gestion des créneaux
          </p>
          <h1 style={{ color: txt1, fontSize: "26px", fontWeight: "900", margin: "0 0 6px", letterSpacing: "-0.5px" }}>
            Disponibilités
          </h1>
          <p style={{ color: txt2, fontSize: "13px", margin: 0 }}>
            Configurez vos jours et heures d'ouverture. Les citoyens pourront réserver uniquement sur ces créneaux.
          </p>
        </div>

        {/* ── STATS RÉSUMÉ ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Jours actifs", value: `${activeDays} / 7`, icon: "📅", color: "#F5A623" },
            { label: "Créneaux totaux", value: String(totalSlots), icon: "🕐", color: "#22c55e" },
            { label: "Institution", value: institutionName || "—", icon: "🏛️", color: "#3b82f6" },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: cardBg, border: `1px solid ${cardBrd}`, borderRadius: "14px", padding: "16px" }}>
              <div style={{ fontSize: "20px", marginBottom: "8px" }}>{s.icon}</div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: s.color, lineHeight: 1, marginBottom: "4px" }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: txt3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Erreur / Succès */}
        {loadError && (
          <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
            <p style={{ color: "#ef4444", fontSize: "13px", margin: 0 }}>⚠️ {loadError}</p>
          </div>
        )}
        {saveMsg && (
          <div style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" }}>
            <p style={{ color: "#22c55e", fontSize: "13px", margin: 0 }}>✅ {saveMsg}</p>
          </div>
        )}

        {/* ── JOURS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
          {DAYS.map((d, idx) => {
            const r = rules[d.key];
            const slots = countSlots(rules, d.key);
            const isExpanded = expandedDay === d.key || r.active;

            return (
              <div key={d.key} className="day-row" style={{ backgroundColor: cardBg, border: `1px solid ${r.active ? "rgba(245,166,35,0.25)" : cardBrd}`, borderLeft: `3px solid ${r.active ? "#F5A623" : "transparent"}`, borderRadius: "14px", overflow: "hidden", animation: `fadeUp 0.2s ease ${idx * 0.03}s both` }}>

                {/* En-tête du jour */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer" }} onClick={() => setExpandedDay(expandedDay === d.key ? null : d.key)}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    {/* Toggle */}
                    <div
                      className="toggle-track"
                      onClick={e => { e.stopPropagation(); onToggle(d.key, !r.active); }}
                      style={{ width: "42px", height: "24px", borderRadius: "12px", backgroundColor: r.active ? "#F5A623" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"), position: "relative", cursor: "pointer", flexShrink: 0 }}
                    >
                      <div className="toggle-thumb" style={{ position: "absolute", top: "3px", left: r.active ? "21px" : "3px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: r.active ? "#080812" : (isDark ? "#6E7681" : "#aaa") }} />
                    </div>

                    <div>
                      <span style={{ color: r.active ? txt1 : txt2, fontSize: "14px", fontWeight: "700" }}>{d.label}</span>
                      {r.active && r.start && r.end && (
                        <span style={{ marginLeft: "10px", color: txt3, fontSize: "12px" }}>{r.start} – {r.end}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {r.active && slots > 0 && (
                      <span style={{ backgroundColor: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)", color: "#F5A623", fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>
                        {slots} créneaux
                      </span>
                    )}
                    {!r.active && (
                      <span style={{ color: txt3, fontSize: "11px", fontStyle: "italic" }}>Fermé</span>
                    )}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={txt3} strokeWidth={2} style={{ transform: (isExpanded && expandedDay === d.key) ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>

                {/* Contenu expandé */}
                {r.active && (
                  <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${cardBrd}` }}>
                    <div style={{ paddingTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      {/* Début */}
                      <div>
                        <label style={{ color: txt3, fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "8px" }}>
                          Heure d'ouverture
                        </label>
                        <input
                          type="time"
                          value={r.start}
                          onChange={e => onRule(d.key, { start: e.target.value })}
                          style={{ width: "100%", backgroundColor: inputBg, border: `1px solid ${cardBrd}`, borderRadius: "10px", padding: "11px 14px", color: txt1, fontSize: "14px", fontFamily: "inherit", outline: "none" }}
                        />
                      </div>

                      {/* Fin */}
                      <div>
                        <label style={{ color: txt3, fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "8px" }}>
                          Heure de fermeture
                        </label>
                        <input
                          type="time"
                          value={r.end}
                          onChange={e => onRule(d.key, { end: e.target.value })}
                          style={{ width: "100%", backgroundColor: inputBg, border: `1px solid ${cardBrd}`, borderRadius: "10px", padding: "11px 14px", color: txt1, fontSize: "14px", fontFamily: "inherit", outline: "none" }}
                        />
                      </div>
                    </div>

                    {/* Durée RDV */}
                    <div style={{ marginTop: "14px" }}>
                      <label style={{ color: txt3, fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "10px" }}>
                        Durée par rendez-vous
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {DURATIONS.map(dur => (
                          <button
                            key={dur}
                            className="dur-btn"
                            onClick={() => onRule(d.key, { duration: dur })}
                            style={{ flex: 1, backgroundColor: r.duration === dur ? "rgba(245,166,35,0.12)" : inputBg, border: `1px solid ${r.duration === dur ? "rgba(245,166,35,0.4)" : cardBrd}`, borderRadius: "10px", padding: "10px 8px", color: r.duration === dur ? "#F5A623" : txt2, fontSize: "13px", fontWeight: r.duration === dur ? "800" : "500" }}
                          >
                            {dur} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aperçu créneaux */}
                    {r.start && r.end && slots > 0 && (
                      <div style={{ marginTop: "14px", backgroundColor: isDark ? "rgba(245,166,35,0.04)" : "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)", borderRadius: "10px", padding: "12px 14px" }}>
                        <p style={{ color: "#F5A623", fontSize: "11px", fontWeight: "700", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Aperçu — {slots} créneaux générés
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {(() => {
                            const s = toMin(r.start), e = toMin(r.end);
                            if (s === null || e === null) return null;
                            const preview: string[] = [];
                            for (let t = s; t + r.duration <= e && preview.length < 8; t += r.duration) preview.push(toHHMM(t));
                            return preview.map(h => (
                              <span key={h} style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${cardBrd}`, borderRadius: "8px", padding: "3px 8px", fontSize: "11px", color: txt2, fontWeight: "500" }}>{h}</span>
                            ));
                          })()}
                          {slots > 8 && <span style={{ color: txt3, fontSize: "11px", alignSelf: "center" }}>+{slots - 8} autres</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── BOUTON SAUVEGARDER ── */}
        <div style={{ position: "sticky", bottom: "24px" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: "100%", backgroundColor: saving ? (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)") : "#F5A623", color: saving ? txt3 : "#080812", border: "none", borderRadius: "14px", padding: "17px", fontSize: "15px", fontWeight: "800", cursor: saving ? "not-allowed" : "pointer", boxShadow: saving ? "none" : "0 4px 24px rgba(245,166,35,0.4)", transition: "all 0.2s", letterSpacing: "0.3px" }}
          >
            {saving ? "⏳ Sauvegarde en cours..." : `✅ Sauvegarder — ${totalSlots} créneaux`}
          </button>
        </div>
      </main>
    </div>
  );
}