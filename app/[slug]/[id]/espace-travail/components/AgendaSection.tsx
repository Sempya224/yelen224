"use client";

// Agenda de l'espace de travail — vraie grille calendrier (Mois + Semaine),
// niveau Google Calendar. Fusionne les RDV existants (lecture seule) avec
// les événements internes (CRUD) via /api/institution/agenda.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../../theme";
import { YelenLoader } from "@/components/YelenLoader";

type Evenement = { id: string; titre: string; description: string | null; type: string; date: string; date_originale: string; heure_debut: string | null; heure_fin: string | null; membre_id: string | null; cree_par_membre_id: string | null; recurrence: string; recurrence_fin: string | null };
type RdvItem = { id: string; objet: string | null; date_rdv: string; heure_rdv: string; statut: string; citoyen_nom: string; citoyen_phone: string | null };
type Membre = { id: string; prenom: string; nom: string };

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
// non-admin ne gère que ce qu'il a créé ou ce qui lui est assigné.
function peutGerer(e: Evenement, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return e.cree_par_membre_id === moiId || e.membre_id === moiId;
}

const TYPES = [
  { value: "rappel", label: "Rappel" },
  { value: "reunion", label: "Réunion" },
  { value: "bloque", label: "Bloqué" },
  { value: "autre", label: "Autre" },
] as const;

const HOUR_START = 7;
const HOUR_END = 19;
const HOUR_HEIGHT = 48;

function typeColor(type: string, C: ThemeTokens): string {
  if (type === "reunion") return C.purple;
  if (type === "bloque") return C.red;
  if (type === "autre") return C.teal;
  return C.gold;
}

function typeLabel(type: string): string {
  return TYPES.find(t => t.value === type)?.label ?? "Autre";
}

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

function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function timeToMinutes(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ date: string; heure_debut: string; evenement?: Evenement } | null>(null);
  const [rdvDetail, setRdvDetail] = useState<RdvItem | null>(null);
  const [sendingRappel, setSendingRappel] = useState(false);
  const [saving, setSaving] = useState(false);
  const weekColRef = useRef<HTMLDivElement>(null);

  const rangeDays = useMemo(() => {
    const start = view === "semaine" ? startOfWeek(refDate) : startOfMonthGrid(refDate);
    const count = view === "semaine" ? 7 : 42;
    return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view, refDate]);

  const load = useCallback(async () => {
    setLoading(true);
    const dateFrom = toISODate(rangeDays[0]);
    const dateTo = toISODate(rangeDays[rangeDays.length - 1]);
    const res = await fetch(`/api/institution/agenda?date_from=${dateFrom}&date_to=${dateTo}`);
    const j = await res.json().catch(() => null);
    setEvenements(res.ok ? (j?.evenements ?? []) : []);
    setRdvs(res.ok ? (j?.rdv ?? []) : []);
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

  function navigate(dir: 1 | -1) {
    const d = new Date(refDate);
    if (view === "semaine") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setRefDate(d);
  }

  function openCreateModal(iso: string, heure = "09:00") {
    setModal({ date: iso, heure_debut: heure });
  }

  function openEditModal(ev: Evenement) {
    setModal({ date: ev.date, heure_debut: ev.heure_debut || "09:00", evenement: ev });
  }

  function handleWeekColumnClick(iso: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawHour = HOUR_START + y / HOUR_HEIGHT;
    const hour = Math.max(HOUR_START, Math.min(HOUR_END, Math.round(rawHour * 2) / 2));
    const hh = Math.floor(hour).toString().padStart(2, "0");
    const mm = hour % 1 === 0.5 ? "30" : "00";
    openCreateModal(iso, `${hh}:${mm}`);
  }

  const totalEmpty = !loading && evenements.length === 0 && rdvs.length === 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={() => setRefDate(new Date())} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "11px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>Aujourd&apos;hui</button>
          <button onClick={() => navigate(-1)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: C.t2 }}>‹</button>
          <button onClick={() => navigate(1)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: C.t2 }}>›</button>
          <span style={{ fontSize: "13px", fontWeight: "700", marginLeft: "4px", textTransform: "capitalize" }}>
            {view === "mois" ? refDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : `${rangeDays[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${rangeDays[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: "4px", backgroundColor: C.bg3, borderRadius: "10px", padding: "3px" }}>
          {(["semaine", "mois"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? C.bgCard : "transparent", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "11.5px", fontWeight: "700", color: view === v ? C.gold : C.t2, cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
          ))}
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

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : totalEmpty ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", padding: "48px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>📅</div>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Votre agenda est vide</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Planifiez un rappel, une réunion ou bloquez du temps.</p>
          <button onClick={() => openCreateModal(toISODate(new Date()))} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Planifier un événement</button>
        </div>
      ) : view === "mois" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "4px" }}>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: "9.5px", fontWeight: "800", color: C.t3, padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px" }}>
            {rangeDays.map(day => {
              const iso = toISODate(day);
              const { events, rdv } = itemsForDay(iso);
              const all = [...rdv.map(r => ({ id: r.id, titre: `RDV · ${r.citoyen_nom}`, color: C.blue })), ...events.map(e => ({ id: e.id, titre: `${typeLabel(e.type)} · ${e.titre}`, color: typeColor(e.type, C) }))];
              const isToday = iso === toISODate(new Date());
              const inMonth = day.getMonth() === refDate.getMonth();
              return (
                <div key={iso} onClick={() => setSelectedDay(iso)} style={{ minHeight: "68px", backgroundColor: C.bgCard, borderRadius: "10px", border: `1px solid ${isToday ? C.gold + "50" : C.border}`, padding: "5px", cursor: "pointer", opacity: inMonth ? 1 : 0.4 }}>
                  <div style={{ fontSize: "10.5px", fontWeight: isToday ? "900" : "700", color: isToday ? C.gold : C.t2, marginBottom: "3px" }}>{day.getDate()}</div>
                  {all.slice(0, 2).map(it => (
                    <div key={it.id} style={{ fontSize: "8.5px", color: "#fff", backgroundColor: it.color, borderRadius: "4px", padding: "1px 4px", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.titre}</div>
                  ))}
                  {all.length > 2 && <div style={{ fontSize: "8px", color: C.t3 }}>+{all.length - 2}</div>}
                </div>
              );
            })}
          </div>

          {selectedDay && (() => {
            const { events, rdv } = itemsForDay(selectedDay);
            return (
              <div style={{ marginTop: "14px", backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "800", textTransform: "capitalize" }}>{new Date(selectedDay).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
                  <button onClick={() => openCreateModal(selectedDay)} style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>+ Ajouter</button>
                </div>
                {rdv.length === 0 && events.length === 0 && <div style={{ color: C.t3, fontSize: "12px" }}>Rien de prévu ce jour.</div>}
                {rdv.map(r => (
                  <div key={r.id} onClick={() => setRdvDetail(r)} style={{ display: "flex", gap: "8px", padding: "5px 0", fontSize: "12px", cursor: "pointer" }}>
                    <span style={{ color: C.blue, fontWeight: "700", width: "42px" }}>{r.heure_rdv}</span>
                    <span style={{ color: C.t2 }}>RDV — {r.citoyen_nom} · {r.objet || "RDV général"}</span>
                  </div>
                ))}
                {events.map(e => {
                  const assigne = nomMembre(e.membre_id, membres);
                  return (
                    <div key={e.id} onClick={() => openEditModal(e)} style={{ display: "flex", gap: "8px", padding: "5px 0", fontSize: "12px", cursor: "pointer" }}>
                      <span style={{ color: typeColor(e.type, C), fontWeight: "700", width: "42px" }}>{e.heure_debut || "—"}</span>
                      <span style={{ color: typeColor(e.type, C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${typeColor(e.type, C)}15`, padding: "1px 6px", borderRadius: "20px" }}>{typeLabel(e.type)}</span>
                      <span style={{ color: C.t1 }}>{e.titre}</span>
                      {assigne && <span style={{ color: C.gold, fontSize: "10.5px", fontWeight: "700" }}>· {assigne}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      ) : (
        <div style={{ display: "flex", overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
          <div style={{ width: "38px", flexShrink: 0, paddingTop: "26px" }}>
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
              <div key={i} style={{ height: `${HOUR_HEIGHT}px`, fontSize: "9px", color: C.t3, textAlign: "right", paddingRight: "4px", transform: "translateY(-6px)" }}>{HOUR_START + i}h</div>
            ))}
          </div>
          {rangeDays.map(day => {
            const iso = toISODate(day);
            const { events, rdv } = itemsForDay(iso);
            const isToday = iso === toISODate(new Date());
            return (
              <div key={iso} style={{ flex: "1 0 100px", minWidth: "100px", borderLeft: `1px solid ${C.border}` }}>
                <div style={{ height: "26px", textAlign: "center", fontSize: "9.5px", fontWeight: isToday ? "900" : "700", color: isToday ? C.gold : C.t2, textTransform: "capitalize" }}>
                  {day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                </div>
                <div ref={weekColRef} onClick={e => handleWeekColumnClick(iso, e)} style={{ position: "relative", height: `${(HOUR_END - HOUR_START) * HOUR_HEIGHT}px`, cursor: "pointer" }}>
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div key={i} style={{ position: "absolute", top: `${i * HOUR_HEIGHT}px`, left: 0, right: 0, borderTop: `1px solid ${C.border}` }}/>
                  ))}
                  {rdv.map(r => {
                    const startMin = timeToMinutes(r.heure_rdv) - HOUR_START * 60;
                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(HOUR_HEIGHT * 0.5, 54);
                    const isSelected = selectedEventId === r.id;
                    return (
                      <div key={r.id} onClick={e => { e.stopPropagation(); setSelectedEventId(r.id); setRdvDetail(r); }} style={{ position: "absolute", top: `${top}px`, left: "3px", right: "3px", height: `${height}px`, backgroundColor: `${C.blue}15`, borderLeft: `3px solid ${C.blue}`, borderRadius: "6px", border: `1px solid ${isSelected ? C.gold : C.blue + "30"}`, boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.18)" : "none", filter: isSelected ? "brightness(1.08)" : "none", padding: "5px 7px", overflow: "hidden", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                          <span style={{ fontSize: "7.5px", fontWeight: "900", color: C.blue, textTransform: "uppercase", letterSpacing: "0.3px", backgroundColor: `${C.blue}20`, padding: "1px 5px", borderRadius: "4px" }}>RDV</span>
                          <span style={{ fontSize: "8px", fontWeight: "700", color: C.t2 }}>{r.heure_rdv}</span>
                        </div>
                        <div style={{ fontSize: "9.5px", fontWeight: "700", color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.objet || "RDV général"}</div>
                        <div style={{ fontSize: "8px", color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.citoyen_nom}</div>
                      </div>
                    );
                  })}
                  {events.map(e => {
                    const startMin = timeToMinutes(e.heure_debut || "09:00") - HOUR_START * 60;
                    const endMin = e.heure_fin ? timeToMinutes(e.heure_fin) - HOUR_START * 60 : startMin + 30;
                    const top = (startMin / 60) * HOUR_HEIGHT;
                    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 54);
                    const isSelected = selectedEventId === e.id;
                    const assigne = nomMembre(e.membre_id, membres);
                    const color = typeColor(e.type, C);
                    return (
                      <div key={e.id} onClick={ev => { ev.stopPropagation(); setSelectedEventId(e.id); openEditModal(e); }} style={{ position: "absolute", top: `${top}px`, left: "3px", right: "3px", height: `${height}px`, backgroundColor: `${color}15`, borderLeft: `3px solid ${color}`, borderRadius: "6px", border: `1px solid ${isSelected ? C.gold : color + "30"}`, boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.18)" : "none", filter: isSelected ? "brightness(1.08)" : "none", padding: "5px 7px", overflow: "hidden", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                          <span style={{ fontSize: "7.5px", fontWeight: "900", color, textTransform: "uppercase", letterSpacing: "0.3px", backgroundColor: `${color}20`, padding: "1px 5px", borderRadius: "4px" }}>{typeLabel(e.type)}</span>
                          <span style={{ fontSize: "8px", fontWeight: "700", color: C.t2 }}>{e.heure_debut || "—"}</span>
                        </div>
                        <div style={{ fontSize: "9.5px", fontWeight: "700", color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.titre}</div>
                        <div style={{ fontSize: "8px", color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{assigne || "Non assigné"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <EventModal key={modal.evenement ? modal.evenement.id : "new"} C={C} modal={modal} saving={saving} membres={membres}
          readOnly={!!modal.evenement && !peutGerer(modal.evenement, moiId, moiRole)}
          onClose={() => setModal(null)}
          onDelete={modal.evenement && peutGerer(modal.evenement, moiId, moiRole) ? async () => {
            setSaving(true);
            await fetch(`/api/institution/agenda?id=${modal.evenement!.id}`, { method: "DELETE" });
            setSaving(false); setModal(null); onToast("Événement supprimé", C.orange); load();
          } : undefined}
          onSave={async (payload) => {
            setSaving(true);
            const isEdit = !!modal.evenement;
            const res = await fetch("/api/institution/agenda", {
              method: isEdit ? "PATCH" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(isEdit ? { id: modal.evenement!.id, ...payload } : payload),
            });
            setSaving(false);
            if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
            setModal(null); onToast(isEdit ? "Événement modifié" : "Événement ajouté", C.green); load();
          }}
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

function RdvDetailModal({ C, rdv, sending, onClose, onEnvoyerRappel }: {
  C: ThemeTokens; rdv: RdvItem; sending: boolean; onClose: () => void; onEnvoyerRappel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const sc = statutRdvInfo(rdv.statut, C);

  function copyPhone() {
    if (!rdv.citoyen_phone) return;
    navigator.clipboard.writeText(rdv.citoyen_phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="rdv-detail-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        /* Même convention que la fiche client de MesClientsTab.tsx —
           bottom sheet mobile, dialogue centré ≥1024px. */
        @media(min-width:1024px){
          .rdv-detail-overlay{align-items:center!important}
          .rdv-detail-panel{max-width:420px!important;border-radius:20px!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="rdv-detail-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: "480px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `linear-gradient(135deg, ${C.blue}30, ${C.blue}10)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "900", color: C.blue, flexShrink: 0 }}>
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
          <span style={{ color: C.t3, fontSize: "12px" }}>{new Date(rdv.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à {rdv.heure_rdv}</span>
        </div>

        <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", marginBottom: "20px" }}>
          <div style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Objet</div>
          <div style={{ color: C.t1, fontSize: "13px" }}>{rdv.objet || "RDV général"}</div>
        </div>

        <button onClick={onEnvoyerRappel} disabled={sending} className="tap" style={{ width: "100%", backgroundColor: C.bgCard, color: C.gold, fontSize: "13px", fontWeight: "800", padding: "13px", borderRadius: "12px", border: `1px solid ${C.gold}40`, cursor: "pointer", opacity: sending ? 0.6 : 1, marginBottom: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {sending ? <YelenLoader size={13} color={C.gold}/> : "Envoyer un rappel"}
        </button>
        <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", color: C.t3, fontSize: "12px", cursor: "pointer", padding: "8px" }}>Fermer</button>
      </div>
    </div>
  );
}

function EventModal({ C, modal, saving, membres, readOnly, onClose, onSave, onDelete }: {
  C: ThemeTokens; modal: { date: string; heure_debut: string; evenement?: Evenement }; saving: boolean; membres: Membre[]; readOnly?: boolean;
  onClose: () => void; onDelete?: () => void;
  onSave: (payload: { titre: string; description: string | null; type: string; date: string; heure_debut: string | null; heure_fin: string | null; membre_id: string | null }) => void;
}) {
  const ev = modal.evenement;
  const [titre, setTitre] = useState(ev?.titre || "");
  const [description, setDescription] = useState(ev?.description || "");
  const [type, setType] = useState(ev?.type || "rappel");
  const [date, setDate] = useState(ev?.date || modal.date);
  const [heureDebut, setHeureDebut] = useState(ev?.heure_debut || modal.heure_debut);
  const [heureFin, setHeureFin] = useState(ev?.heure_fin || "");
  const [membreId, setMembreId] = useState(ev?.membre_id || "");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "20px", width: "100%", maxWidth: "480px" }}>
        <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "14px" }}>{ev ? "Modifier l'événement" : "Nouvel événement"}</div>
        {readOnly && (
          <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", color: C.orange, fontWeight: "600", marginBottom: "12px" }}>
            🔒 Vous ne pouvez pas modifier cet événement — il n&apos;a été ni créé par vous, ni assigné à vous.
          </div>
        )}
        <input disabled={readOnly} value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "8px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
        <textarea disabled={readOnly} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optionnel)" rows={2} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", marginBottom: "8px", color: C.t1, resize: "none", opacity: readOnly ? 0.6 : 1 }}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
          <select disabled={readOnly} value={type} onChange={e => setType(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input disabled={readOnly} type="date" value={date} onChange={e => setDate(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
          <input disabled={readOnly} type="time" value={heureDebut} onChange={e => setHeureDebut(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
          <input disabled={readOnly} type="time" value={heureFin} onChange={e => setHeureFin(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
        </div>
        <select disabled={readOnly} value={membreId} onChange={e => setMembreId(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, marginBottom: "14px", opacity: readOnly ? 0.6 : 1 }}>
          <option value="">Assigné à — Non assigné</option>
          {membres.map(m => <option key={m.id} value={m.id}>Assigné à — {m.prenom} {m.nom}</option>)}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: readOnly ? "1fr" : onDelete ? "auto 1fr 1fr" : "1fr 1fr", gap: "8px" }}>
          {onDelete && <button onClick={onDelete} disabled={saving} style={{ backgroundColor: C.redL, color: C.red, fontWeight: "700", fontSize: "12.5px", padding: "11px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Suppr.</button>}
          <button onClick={onClose} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>{readOnly ? "Fermer" : "Annuler"}</button>
          {!readOnly && (
            <button onClick={() => onSave({ titre, description: description || null, type, date, heure_debut: heureDebut || null, heure_fin: heureFin || null, membre_id: membreId || null })} disabled={saving || !titre.trim()} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: saving || !titre.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {saving ? <YelenLoader size={12} color="#000"/> : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
