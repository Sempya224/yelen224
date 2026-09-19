"use client";

// Tâches de l'espace de travail — liste groupée par statut (refonte
// 20/07/2026, niveau SaaS Enterprise, choix validé par Bryan : liste
// dense façon Asana/Linear plutôt que Kanban drag & drop). Sections
// repliables (À faire / En cours / Terminé), case à cocher pour basculer
// terminé/à faire, priorité/assigné/échéance visibles d'un coup d'œil.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { YelenLoader } from "@/components/YelenLoader";

type ChecklistItem = { label: string; fait: boolean };
type Tache = {
  id: string; titre: string; description: string | null; priorite: string; statut: string;
  echeance: string | null; checklist: ChecklistItem[]; citoyen_id: string | null; rdv_id: string | null;
  membre_id: string | null; cree_par_membre_id: string | null;
};
type Membre = { id: string; prenom: string; nom: string };

const COLONNES = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
] as const;

const PRIORITES = [
  { value: "basse", label: "Basse" },
  { value: "normale", label: "Normale" },
  { value: "haute", label: "Haute" },
] as const;

function prioriteColor(p: string, C: ThemeTokens): string {
  if (p === "haute") return C.red;
  if (p === "basse") return C.t3;
  return C.blue;
}

function estEnRetard(t: Tache): boolean {
  if (!t.echeance || t.statut === "termine") return false;
  return new Date(t.echeance) < new Date(new Date().toDateString());
}

function estAujourdhui(t: Tache): boolean {
  if (!t.echeance || t.statut === "termine") return false;
  return t.echeance === new Date().toISOString().slice(0, 10);
}

function initiales(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom.slice(0, 1)}${m.nom.slice(0, 1)}`.toUpperCase() : null;
}

// Permissions par rôle ("chacun ne gère que le sien", validé par Bryan) —
// même règle qu'appliquée côté serveur dans taches/route.ts : un admin
// gère tout, un non-admin ne gère que ce qu'il a créé ou ce qui lui est
// assigné.
function peutGerer(t: Tache, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return t.cree_par_membre_id === moiId || t.membre_id === moiId;
}

export function TachesSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [taches, setTaches] = useState<Tache[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [filtreMoi, setFiltreMoi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modalTache, setModalTache] = useState<Tache | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/institution/taches");
    const j = await res.json().catch(() => null);
    setTaches(res.ok ? (j?.taches ?? []) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, instId]);

  useEffect(() => {
    fetch("/api/institution/membres").then(res => res.ok ? res.json() : null).then(j => {
      if (!j) return;
      setMembres(j.membres ?? []);
      setMoiId(j.membreId ?? null);
      setMoiRole(j.role ?? null);
    });
  }, [instId]);

  const tachesAffichees = filtreMoi ? taches.filter(t => t.membre_id === moiId) : taches;

  async function changerStatut(id: string, statut: string) {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, statut } : t));
    const res = await fetch("/api/institution/taches", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, statut }),
    });
    if (!res.ok) { onToast("Erreur", C.red); load(); }
  }

  function toggleFait(t: Tache) {
    if (!peutGerer(t, moiId, moiRole)) return;
    changerStatut(t.id, t.statut === "termine" ? "a_faire" : "termine");
  }

  function toggleCollapse(col: string) {
    setCollapsed(prev => ({ ...prev, [col]: !prev[col] }));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        {moiId && (
          <div style={{ display: "flex", gap: "4px", backgroundColor: C.bg3, borderRadius: "10px", padding: "3px" }}>
            {[{ v: false, l: "Toute l'équipe" }, { v: true, l: "Mes tâches" }].map(opt => (
              <button key={String(opt.v)} onClick={() => setFiltreMoi(opt.v)} style={{ background: filtreMoi === opt.v ? C.bgCard : "transparent", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "11.5px", fontWeight: "700", color: filtreMoi === opt.v ? C.gold : C.t2, cursor: "pointer" }}>{opt.l}</button>
            ))}
          </div>
        )}
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setModalTache("new")}>+ Tâche</Button>
      </div>

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : tachesAffichees.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="48px 20px" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>✓</div>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucune tâche pour l&apos;instant</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Organisez le travail de l&apos;équipe au-delà des rendez-vous.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => setModalTache("new")}>+ Créer une tâche</Button>
        </Card>
      ) : (
        <Card tokens={toCardTokens(C)} noPadding>
          {COLONNES.map((col, colIdx) => {
            const items = tachesAffichees.filter(t => t.statut === col.value);
            const isCollapsed = !!collapsed[col.value];
            return (
              <div key={col.value} style={{ borderBottom: colIdx < COLONNES.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div onClick={() => toggleCollapse(col.value)} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "13px 16px", cursor: "pointer", backgroundColor: C.bg3 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round" style={{ transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.15s ease", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                  <span style={{ fontSize: "13px", fontWeight: "800", color: C.t1 }}>{col.label}</span>
                  <span style={{ backgroundColor: C.bgCard, color: C.t3, fontSize: "10px", fontWeight: "700", padding: "1px 8px", borderRadius: "20px" }}>{items.length}</span>
                </div>
                {!isCollapsed && (
                  items.length === 0 ? (
                    <div style={{ padding: "14px 16px", color: C.t3, fontSize: "11.5px" }}>Aucune tâche ici.</div>
                  ) : (
                    items.map((t, i) => {
                      const verrouille = !peutGerer(t, moiId, moiRole);
                      const fait = t.checklist.filter(c => c.fait).length;
                      const enRetard = estEnRetard(t);
                      const aujourdhui = estAujourdhui(t);
                      const init = initiales(t.membre_id, membres);
                      return (
                        <div key={t.id} onClick={() => setModalTache(t)} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                          <div onClick={e => { e.stopPropagation(); toggleFait(t); }} style={{ width: "18px", height: "18px", borderRadius: "5px", border: `1.5px solid ${t.statut === "termine" ? C.green : C.border2}`, backgroundColor: t.statut === "termine" ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: verrouille ? "default" : "pointer", opacity: verrouille ? 0.5 : 1 }}>
                            {t.statut === "termine" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                          <span style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: "600", color: t.statut === "termine" ? C.t3 : C.t1, textDecoration: t.statut === "termine" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titre}</span>
                          {(t.citoyen_id || t.rdv_id) && <span style={{ color: C.blue, fontSize: "9.5px", fontWeight: "700", flexShrink: 0 }}>Client lié</span>}
                          {t.checklist.length > 0 && <span style={{ color: C.t3, fontSize: "10px", flexShrink: 0 }}>{fait}/{t.checklist.length}</span>}
                          <span style={{ color: prioriteColor(t.priorite, C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${prioriteColor(t.priorite, C)}15`, padding: "2px 8px", borderRadius: "20px", flexShrink: 0, whiteSpace: "nowrap" }}>{PRIORITES.find(p => p.value === t.priorite)?.label}</span>
                          <span style={{ width: "22px", height: "22px", borderRadius: "50%", backgroundColor: init ? C.gold : C.bg3, color: init ? "#000" : C.t3, fontSize: "9px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{init || "—"}</span>
                          <span style={{ color: enRetard ? C.red : aujourdhui ? C.gold : C.t3, fontSize: "10.5px", fontWeight: enRetard || aujourdhui ? "800" : "600", flexShrink: 0, width: "56px", textAlign: "right" }}>
                            {t.echeance ? new Date(t.echeance).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"}
                          </span>
                          {verrouille && <span title="Vous ne pouvez pas modifier cet élément" style={{ color: C.t3, fontSize: "11px", flexShrink: 0 }}>🔒</span>}
                        </div>
                      );
                    })
                  )
                )}
              </div>
            );
          })}
        </Card>
      )}

      {modalTache && (
        <TaskModal
          key={modalTache === "new" ? "new" : modalTache.id}
          C={C}
          tache={modalTache === "new" ? null : modalTache}
          membres={membres}
          readOnly={modalTache !== "new" && !peutGerer(modalTache, moiId, moiRole)}
          onClose={() => setModalTache(null)}
          onSaved={() => { setModalTache(null); load(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function Field({ label, C, children }: { label: string; C: ThemeTokens; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>{label}</label>
      {children}
    </div>
  );
}

function TaskModal({ C, tache, membres, readOnly, onClose, onSaved, onToast }: {
  C: ThemeTokens; tache: Tache | null; membres: Membre[]; readOnly?: boolean; onClose: () => void; onSaved: () => void; onToast: (msg: string, color?: string) => void;
}) {
  const isNew = !tache;
  const [titre, setTitre] = useState(tache?.titre || "");
  const [description, setDescription] = useState(tache?.description || "");
  const [priorite, setPriorite] = useState(tache?.priorite || "normale");
  const [statut, setStatut] = useState(tache?.statut || "a_faire");
  const [echeance, setEcheance] = useState(tache?.echeance || "");
  const [membreId, setMembreId] = useState(tache?.membre_id || "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(tache?.checklist || []);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialSnapshot] = useState(() => JSON.stringify({ titre: tache?.titre || "", description: tache?.description || "", priorite: tache?.priorite || "normale", statut: tache?.statut || "a_faire", echeance: tache?.echeance || "", membreId: tache?.membre_id || "", checklist: tache?.checklist || [] }));

  const isDirty = JSON.stringify({ titre, description, priorite, statut, echeance, membreId, checklist }) !== initialSnapshot;
  const canSave = !!titre.trim() && (isNew || isDirty);
  const saveLabel = saving ? <YelenLoader size={12} color="#000"/> : isNew ? "Créer la tâche" : isDirty ? "Enregistrer les modifications" : "Aucune modification";

  function ajouterItem() {
    if (!newItem.trim()) return;
    setChecklist(prev => [...prev, { label: newItem.trim(), fait: false }]);
    setNewItem("");
  }

  async function enregistrer() {
    if (!canSave) return;
    setSaving(true);
    const body = { titre, description: description || null, priorite, echeance: echeance || null, membre_id: membreId || null, checklist, ...(tache ? { statut } : {}) };
    const res = tache
      ? await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tache.id, ...body }) })
      : await fetch("/api/institution/taches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    onToast(tache ? "Tâche modifiée" : "Tâche créée", C.green);
    onSaved();
  }

  async function supprimer() {
    if (!tache) return;
    setSaving(true);
    await fetch(`/api/institution/taches?id=${tache.id}`, { method: "DELETE" });
    setSaving(false);
    onToast("Tâche supprimée", C.orange);
    onSaved();
  }

  const faitCount = checklist.filter(c => c.fait).length;

  return (
    <div className="tache-modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <style>{`
        @media(min-width:1024px){
          .tache-modal-overlay{align-items:center!important}
          .tache-modal-panel{max-width:520px!important;border-radius:20px!important;max-height:86svh!important}
          .tache-modal-grip{display:none!important}
          .tache-modal-close-x{display:flex!important}
        }
        .tache-modal-input:focus{outline:none;border-color:${C.gold}!important;box-shadow:0 0 0 3px ${C.gold}22}
      `}</style>
      <div onClick={e => e.stopPropagation()} className="tache-modal-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 28px", width: "100%", maxWidth: "540px", maxHeight: "90svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div className="tache-modal-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 18px" }}/>
        <button onClick={onClose} className="tache-modal-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: `linear-gradient(135deg, ${C.gold}30, ${C.gold}10)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="8 12 11 15 16 9"/></svg>
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: C.t1 }}>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</div>
            <div style={{ fontSize: "11.5px", color: C.t3 }}>{tache ? "Ajustez les détails ou l'avancement" : "Ajoutez une action à suivre pour l'équipe"}</div>
          </div>
        </div>

        {readOnly && (
          <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", color: C.orange, fontWeight: "600", marginBottom: "14px" }}>
            🔒 Vous ne pouvez pas modifier cette tâche — elle n&apos;a été ni créée par vous, ni assignée à vous.
          </div>
        )}

        <Field label="Titre" C={C}>
          <input className="tache-modal-input" disabled={readOnly} value={titre} onChange={e => setTitre(e.target.value)} placeholder="Ex. Renouveler le contrat de maintenance" style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "10px", padding: "11px 13px", fontSize: "13.5px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
        </Field>
        <Field label="Description" C={C}>
          <textarea className="tache-modal-input" disabled={readOnly} value={description} onChange={e => setDescription(e.target.value)} placeholder="Détails, contexte, lien utile…" rows={2} style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "10px", padding: "11px 13px", fontSize: "12.5px", color: C.t1, resize: "none", opacity: readOnly ? 0.6 : 1 }}/>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: tache ? "1fr 1fr 1fr" : "1fr 1fr", gap: "10px" }}>
          <Field label="Priorité" C={C}>
            <select className="tache-modal-input" disabled={readOnly} value={priorite} onChange={e => setPriorite(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}>
              {PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Échéance" C={C}>
            <input className="tache-modal-input" disabled={readOnly} type="date" value={echeance} onChange={e => setEcheance(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
          </Field>
          {tache && (
            <Field label="Statut" C={C}>
              <select className="tache-modal-input" disabled={readOnly} value={statut} onChange={e => setStatut(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}>
                {COLONNES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          )}
        </div>

        <Field label="Assigné à" C={C}>
          <select className="tache-modal-input" disabled={readOnly} value={membreId} onChange={e => setMembreId(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "12.5px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}>
            <option value="">Non assigné</option>
            {membres.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
        </Field>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <label style={{ color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.6px" }}>Checklist</label>
          {checklist.length > 0 && <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700" }}>{faitCount}/{checklist.length}</span>}
        </div>
        {checklist.length > 0 && (
          <div style={{ height: "4px", borderRadius: "2px", backgroundColor: C.bg3, marginBottom: "10px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(faitCount / checklist.length) * 100}%`, backgroundColor: C.green, borderRadius: "2px" }}/>
          </div>
        )}
        {checklist.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div onClick={() => !readOnly && setChecklist(prev => prev.map((it, idx) => idx === i ? { ...it, fait: !it.fait } : it))} style={{ width: "17px", height: "17px", borderRadius: "5px", border: `1.5px solid ${item.fait ? C.green : C.border2}`, backgroundColor: item.fait ? C.green : "transparent", cursor: readOnly ? "default" : "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {item.fait && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <span style={{ flex: 1, fontSize: "12.5px", color: item.fait ? C.t3 : C.t1, textDecoration: item.fait ? "line-through" : "none" }}>{item.label}</span>
            {!readOnly && <button onClick={() => setChecklist(prev => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: "11px" }}>✕</button>}
          </div>
        ))}
        {!readOnly && (
          <div style={{ display: "flex", gap: "6px", marginTop: "8px", marginBottom: "18px" }}>
            <input className="tache-modal-input" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ajouterItem(); } }} placeholder="Ajouter un élément…" style={{ flex: 1, backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "12px", color: C.t1 }}/>
            <button onClick={ajouterItem} style={{ backgroundColor: C.bg3, border: `1.5px solid ${C.border2}`, borderRadius: "8px", padding: "9px 14px", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: readOnly ? "1fr" : tache ? "auto 1fr 1.4fr" : "1fr 1.4fr", gap: "8px", marginTop: "6px" }}>
          {tache && !readOnly && (
            <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" disabled={saving} onClick={supprimer}>Supprimer</Button>
          )}
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onClose}>{readOnly ? "Fermer" : "Annuler"}</Button>
          {!readOnly && (
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!canSave} loading={saving} onClick={enregistrer}>
              {saveLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
