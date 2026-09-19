"use client";

// Onglet Projets de l'Espace de travail (spec CEO, 18/07/2026) — vue liste
// simple ("vue opérationnelle légère" demandée par le CEO), pas de Kanban.
// Même architecture visuelle que TachesSection.tsx (tokens C.*, modale
// bottom-sheet).
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toCardTokens, toUiTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { STATUTS_PROJET } from "@/lib/projetsNotes";
import { YelenLoader } from "@/components/YelenLoader";

type Projet = {
  id: string; nom: string; description: string | null; responsable_membre_id: string | null;
  date_debut: string | null; date_fin_prevue: string | null; statut: string; cree_par_membre_id: string | null;
};
type Membre = { id: string; prenom: string; nom: string };

function statutColor(s: string, C: ThemeTokens): string {
  if (s === "en_cours") return C.blue;
  if (s === "termine") return C.green;
  if (s === "bloque") return C.red;
  return C.t3;
}

function nomMembre(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : null;
}

// Permissions par rôle ("chacun ne gère que le sien", même règle que
// TachesSection.tsx / taches/route.ts) — reflet côté client de la règle
// appliquée côté serveur dans projets/route.ts.
function peutGerer(p: Projet, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return p.cree_par_membre_id === moiId || p.responsable_membre_id === moiId;
}

export function ProjetsSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [projets, setProjets] = useState<Projet[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Projet | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/institution/projets");
    const j = await res.json().catch(() => null);
    setProjets(res.ok ? (j?.projets ?? []) : []);
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setModal("new")}>+ Projet</Button>
      </div>

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <YelenLoader size={24}/>
        </div>
      ) : projets.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="48px 20px" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>📁</div>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucun projet pour l&apos;instant</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Suivez l&apos;avancement de vos initiatives internes.</p>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => setModal("new")}>+ Créer un projet</Button>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {projets.map(p => {
            const verrouille = !peutGerer(p, moiId, moiRole);
            const responsable = nomMembre(p.responsable_membre_id, membres);
            return (
              <div key={p.id} onClick={() => setModal(p)} style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, borderLeft: `3px solid ${statutColor(p.statut, C)}`, padding: "14px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: "800" }}>{p.nom}</span>
                  {verrouille && <span title="Vous ne pouvez pas modifier ce projet" style={{ color: C.t3, fontSize: "11px", flexShrink: 0 }}>🔒</span>}
                </div>
                {p.description && <div style={{ color: C.t2, fontSize: "12px", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: statutColor(p.statut, C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${statutColor(p.statut, C)}15`, padding: "2px 8px", borderRadius: "20px" }}>{STATUTS_PROJET.find(s => s.value === p.statut)?.label}</span>
                  {responsable && <span style={{ color: C.goldD, fontSize: "10.5px", fontWeight: "700" }}>{responsable}</span>}
                  {p.date_debut && <span style={{ color: C.t3, fontSize: "10.5px" }}>Début : {new Date(p.date_debut).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                  {p.date_fin_prevue && <span style={{ color: C.t3, fontSize: "10.5px" }}>Fin prévue : {new Date(p.date_fin_prevue).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ProjetModal
          key={modal === "new" ? "new" : modal.id}
          C={C}
          projet={modal === "new" ? null : modal}
          membres={membres}
          readOnly={modal !== "new" && !peutGerer(modal, moiId, moiRole)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function ProjetModal({ C, projet, membres, readOnly, onClose, onSaved, onToast }: {
  C: ThemeTokens; projet: Projet | null; membres: Membre[]; readOnly?: boolean; onClose: () => void; onSaved: () => void; onToast: (msg: string, color?: string) => void;
}) {
  const [nom, setNom] = useState(projet?.nom || "");
  const [description, setDescription] = useState(projet?.description || "");
  const [dateDebut, setDateDebut] = useState(projet?.date_debut || "");
  const [dateFinPrevue, setDateFinPrevue] = useState(projet?.date_fin_prevue || "");
  const [statut, setStatut] = useState(projet?.statut || "a_venir");
  const [responsableId, setResponsableId] = useState(projet?.responsable_membre_id || "");
  const [saving, setSaving] = useState(false);

  async function enregistrer() {
    if (!nom.trim()) return;
    setSaving(true);
    const body = { nom, description: description || null, date_debut: dateDebut || null, date_fin_prevue: dateFinPrevue || null, responsable_membre_id: responsableId || null, ...(projet ? { statut } : {}) };
    const res = projet
      ? await fetch("/api/institution/projets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projet.id, ...body }) })
      : await fetch("/api/institution/projets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    onToast(projet ? "Projet modifié" : "Projet créé", C.green);
    onSaved();
  }

  async function supprimer() {
    if (!projet) return;
    setSaving(true);
    await fetch(`/api/institution/projets?id=${projet.id}`, { method: "DELETE" });
    setSaving(false);
    onToast("Projet supprimé", C.orange);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "20px", width: "100%", maxWidth: "500px", maxHeight: "88svh", overflowY: "auto" }}>
        <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "14px" }}>{projet ? "Modifier le projet" : "Nouveau projet"}</div>
        {readOnly && (
          <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", color: C.orange, fontWeight: "600", marginBottom: "12px" }}>
            🔒 Vous ne pouvez pas modifier ce projet — il n&apos;a été ni créé par vous, ni assigné à vous comme responsable.
          </div>
        )}
        <input disabled={readOnly} value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du projet" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "8px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
        <textarea disabled={readOnly} value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optionnel)" rows={2} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", marginBottom: "8px", color: C.t1, resize: "none", opacity: readOnly ? 0.6 : 1 }}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
          <div>
            <label style={{ display: "block", color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>Début</label>
            <input disabled={readOnly} type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
          </div>
          <div>
            <label style={{ display: "block", color: C.t3, fontSize: "9.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>Fin prévue</label>
            <input disabled={readOnly} type="date" value={dateFinPrevue} onChange={e => setDateFinPrevue(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: projet ? "1fr 1fr" : "1fr", gap: "8px", marginBottom: "14px" }}>
          <select disabled={readOnly} value={responsableId} onChange={e => setResponsableId(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}>
            <option value="">Responsable — Non assigné</option>
            {membres.map(m => <option key={m.id} value={m.id}>Responsable — {m.prenom} {m.nom}</option>)}
          </select>
          {projet && (
            <select disabled={readOnly} value={statut} onChange={e => setStatut(e.target.value)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}>
              {STATUTS_PROJET.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: readOnly ? "1fr" : projet ? "auto 1fr 1fr" : "1fr 1fr", gap: "8px" }}>
          {projet && !readOnly && <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" disabled={saving} onClick={supprimer}>Suppr.</Button>}
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onClose}>{readOnly ? "Fermer" : "Annuler"}</Button>
          {!readOnly && (
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={!nom.trim()} loading={saving} onClick={enregistrer}>Enregistrer</Button>
          )}
        </div>
      </div>
    </div>
  );
}
