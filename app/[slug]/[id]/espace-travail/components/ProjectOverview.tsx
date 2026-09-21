"use client";

// Project Overview (item 8/9 du brief V3 Projets, 20/09/2026) — page
// stratégique du projet, navigation locale interne à l'onglet Projets
// ("← Projets"), pas une route séparée. Sous-onglets propres au projet :
// Vue d'ensemble / Tâches / Documents / Timeline / Activité.
//
// "Même donnée, deux contextes" (item 11/12) : les tâches/documents
// affichés ici sont les VRAIES lignes de taches/documents_travail
// (filtrées par projet_id), jamais une copie — modifier une tâche ici la
// modifie aussi dans l'onglet Tâches, et réciproquement.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { YelenLoader } from "@/components/YelenLoader";
import type { ThemeTokens } from "../../theme";
import { toUiTokens } from "../../theme";
import { type Tache, statutColor as statutColorTache, prioriteColor as prioriteColorTache, echeanceLabel as echeanceLabelTache, estEnRetard } from "./TachesOverlays";
import { type DocumentTravail, fileTypeInfo, formatTaille, categorieLabel } from "./DocumentsOverlays";
import { AgendaPopover, useDialogA11y, MemberPicker } from "./AgendaOverlays";
import {
  type Projet, type Membre, type Milestone,
  statutColor, statutLabel, prioriteColor, prioriteLabel, santeInfo,
  nomMembre, peutGerer, computeProgress,
  ProjectStatusPicker, ProjectPriorityPicker, ProjectSantePicker, ProjectActionsMenu,
} from "./ProjetsOverlays";

type SubTab = "apercu" | "taches" | "documents" | "timeline" | "activite";
const SUBTABS: { value: SubTab; label: string }[] = [
  { value: "apercu", label: "Vue d'ensemble" },
  { value: "taches", label: "Tâches" },
  { value: "documents", label: "Documents" },
  { value: "timeline", label: "Timeline" },
  { value: "activite", label: "Activité" },
];

const ACTION_LABELS: Record<string, string> = {
  projet_cree: "a créé le projet",
  projet_modifie: "a modifié le projet",
  milestone_creee: "a ajouté une milestone",
  milestone_modifiee: "a modifié une milestone",
  milestone_supprimee: "a supprimé une milestone",
  tache_creee: "a créé une tâche",
  tache_modifiee: "a modifié une tâche",
  tache_supprimee: "a supprimé une tâche",
  document_ajoute: "a ajouté un document",
  document_supprime: "a supprimé un document",
};

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  if (j === 1) return "hier";
  return `il y a ${j} j`;
}

export function ProjectOverview({ projet, membres, moiId, moiRole, onBack, onToast, onProjetChange, onEdit, onDeleteRequest, C }: {
  projet: Projet; membres: Membre[]; moiId: string | null; moiRole: string | null;
  onBack: () => void; onToast: (msg: string, color?: string) => void; onProjetChange: () => void;
  onEdit: () => void; onDeleteRequest: () => void; C: ThemeTokens;
}) {
  const [subTab, setSubTab] = useState<SubTab>("apercu");
  const [taches, setTaches] = useState<Tache[]>([]);
  const [allTaches, setAllTaches] = useState<Tache[]>([]);
  const [documents, setDocuments] = useState<DocumentTravail[]>([]);
  const [allDocuments, setAllDocuments] = useState<DocumentTravail[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [activite, setActivite] = useState<{ membre_nom: string; action: string; created_at: string }[] | null>(null);

  const gerable = peutGerer(projet, moiId, moiRole);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const statutBtnRef = useRef<HTMLButtonElement>(null);
  const [statutOpen, setStatutOpen] = useState(false);
  const santeBtnRef = useRef<HTMLButtonElement>(null);
  const [santeOpen, setSanteOpen] = useState(false);
  const respBtnRef = useRef<HTMLButtonElement>(null);
  const [respOpen, setRespOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, tAllRes, dRes, dAllRes, mRes] = await Promise.all([
      fetch(`/api/institution/taches?projet_id=${projet.id}`),
      fetch("/api/institution/taches"),
      fetch(`/api/institution/documents-travail?projet_id=${projet.id}`),
      fetch("/api/institution/documents-travail"),
      fetch(`/api/institution/projets/milestones?projet_id=${projet.id}`),
    ]);
    const tJ = tRes.ok ? await tRes.json().catch(() => null) : null;
    const tAllJ = tAllRes.ok ? await tAllRes.json().catch(() => null) : null;
    const dJ = dRes.ok ? await dRes.json().catch(() => null) : null;
    const dAllJ = dAllRes.ok ? await dAllRes.json().catch(() => null) : null;
    const mJ = mRes.ok ? await mRes.json().catch(() => null) : null;
    setTaches(tJ?.taches ?? []);
    setAllTaches(tAllJ?.taches ?? []);
    setDocuments(dJ?.documents ?? []);
    setAllDocuments(dAllJ?.documents ?? []);
    setMilestones(mJ?.milestones ?? []);
    setLoading(false);
  }, [projet.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (subTab !== "activite" || activite !== null) return;
    fetch(`/api/institution/journal?cible_ids=${projet.id}&limit=50`).then(res => res.ok ? res.json() : null).then(j => {
      setActivite(j?.entrees ?? []);
    }).catch(() => setActivite([]));
  }, [subTab, activite, projet.id]);

  async function changerStatut(s: string) {
    await fetch("/api/institution/projets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projet.id, statut: s }) });
    onProjetChange();
  }
  async function changerSante(s: string | null) {
    await fetch("/api/institution/projets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projet.id, sante: s }) });
    onProjetChange();
  }
  async function changerResponsable(id: string | null) {
    await fetch("/api/institution/projets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: projet.id, responsable_membre_id: id }) });
    onProjetChange();
  }

  async function toggleTacheFait(t: Tache) {
    const nouveau = t.statut === "termine" ? "a_faire" : "termine";
    setTaches(prev => prev.map(x => x.id === t.id ? { ...x, statut: nouveau } : x));
    await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, statut: nouveau }) });
  }

  async function creerTacheRapide(titre: string) {
    if (!titre.trim()) return;
    const res = await fetch("/api/institution/taches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titre: titre.trim(), projet_id: projet.id }) });
    if (!res.ok) { onToast("Erreur d'ajout", C.red); return; }
    load();
  }
  async function associerTache(tacheId: string) {
    await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tacheId, projet_id: projet.id }) });
    load();
  }
  async function detacherTache(tacheId: string) {
    await fetch("/api/institution/taches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tacheId, projet_id: null }) });
    load();
  }
  async function associerDocument(docId: string) {
    await fetch("/api/institution/documents-travail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: docId, projet_id: projet.id }) });
    load();
  }
  async function detacherDocument(docId: string) {
    await fetch("/api/institution/documents-travail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: docId, projet_id: null }) });
    load();
  }

  async function ajouterMilestone(titre: string) {
    if (!titre.trim()) return;
    const res = await fetch("/api/institution/projets/milestones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projet_id: projet.id, titre: titre.trim() }) });
    if (!res.ok) { onToast("Erreur d'ajout", C.red); return; }
    load();
  }
  async function cyclerMilestone(m: Milestone) {
    const next = m.statut === "a_faire" ? "en_cours" : m.statut === "en_cours" ? "termine" : "a_faire";
    setMilestones(prev => prev.map(x => x.id === m.id ? { ...x, statut: next } : x));
    await fetch("/api/institution/projets/milestones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, statut: next }) });
  }
  async function supprimerMilestone(id: string) {
    setMilestones(prev => prev.filter(x => x.id !== id));
    await fetch(`/api/institution/projets/milestones?id=${id}`, { method: "DELETE" });
  }

  const progress = computeProgress(taches);
  const color = statutColor(projet.statut, C);
  const sante = santeInfo(projet.sante, C);
  const projetVide = taches.length === 0 && milestones.length === 0;
  const unlinkedTaches = allTaches.filter(t => !t.projet_id);
  const unlinkedDocs = allDocuments.filter(d => !d.projet_id);

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", marginBottom: "14px", padding: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Projets
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: C.t1 }}>{projet.nom}</div>
        {gerable && (
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onEdit}>Modifier</Button>
            <button ref={menuBtnRef} onClick={() => setMenuOpen(v => !v)} aria-label="Autres actions" style={{ width: "34px", height: "34px", borderRadius: "9px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t2, cursor: "pointer" }}>⋯</button>
            <ProjectActionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} tokens={C} onDelete={onDeleteRequest}/>
          </div>
        )}
      </div>
      {projet.description && <div style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>{projet.description}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button ref={statutBtnRef} onClick={() => gerable && setStatutOpen(v => !v)} disabled={!gerable} style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${color}15`, color, border: "none", fontSize: "11px", fontWeight: 800, padding: "4px 12px", borderRadius: "20px", cursor: gerable ? "pointer" : "default" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color }}/>{statutLabel(projet.statut)}
        </button>
        <ProjectStatusPicker open={statutOpen} onClose={() => setStatutOpen(false)} anchorRef={statutBtnRef} tokens={C} value={projet.statut} onSelect={changerStatut}/>

        <button ref={santeBtnRef} onClick={() => gerable && setSanteOpen(v => !v)} disabled={!gerable} style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: sante ? `${sante.color}15` : C.bg3, color: sante ? sante.color : C.t3, border: "none", fontSize: "11px", fontWeight: 800, padding: "4px 12px", borderRadius: "20px", cursor: gerable ? "pointer" : "default" }}>
          {sante && <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: sante.color }}/>}{sante ? sante.label : "Santé non renseignée"}
        </button>
        <ProjectSantePicker open={santeOpen} onClose={() => setSanteOpen(false)} anchorRef={santeBtnRef} tokens={C} value={projet.sante} onSelect={changerSante}/>

        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${prioriteColor(projet.priorite, C)}15`, color: prioriteColor(projet.priorite, C), fontSize: "11px", fontWeight: 800, padding: "4px 12px", borderRadius: "20px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: prioriteColor(projet.priorite, C) }}/>{prioriteLabel(projet.priorite)}
        </span>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto", borderBottom: `1px solid ${C.border}` }}>
        {SUBTABS.map(t => (
          <button key={t.value} onClick={() => setSubTab(t.value)} style={{ flexShrink: 0, background: "none", border: "none", borderBottom: `2px solid ${subTab === t.value ? C.gold : "transparent"}`, padding: "8px 10px", fontSize: "12.5px", fontWeight: subTab === t.value ? 800 : 600, color: subTab === t.value ? C.t1 : C.t3, cursor: "pointer" }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}><YelenLoader size={24}/></div>
      ) : subTab === "apercu" ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase" }}>Responsable</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
            <div>
              <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Responsable</div>
              <button ref={respBtnRef} onClick={() => gerable && setRespOpen(v => !v)} disabled={!gerable} style={{ background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: 700, cursor: gerable ? "pointer" : "default", padding: 0 }}>{nomMembre(projet.responsable_membre_id, membres) || "Non assigné"}</button>
              <MemberPicker open={respOpen} onClose={() => setRespOpen(false)} anchorRef={respBtnRef} tokens={C} membres={membres} value={projet.responsable_membre_id} onSelect={changerResponsable}/>
            </div>
            <div>
              <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Échéance</div>
              <div style={{ fontSize: "13px", color: C.t1, fontWeight: 700 }}>{projet.date_fin_prevue ? new Date(`${projet.date_fin_prevue}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Non définie"}</div>
            </div>
          </div>

          {projetVide ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "28px 20px", textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: C.t1, marginBottom: "4px" }}>Projet créé</div>
              <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Commencez par définir votre première étape.</p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setSubTab("apercu")}>+ Ajouter une milestone</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={() => setSubTab("taches")}>+ Ajouter une tâche</Button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Progression</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, height: "8px", borderRadius: "4px", backgroundColor: C.bg3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress.pct}%`, backgroundColor: C.gold, borderRadius: "4px" }}/>
                </div>
                <span style={{ fontSize: "13px", fontWeight: 800, color: C.t1 }}>{progress.pct}%</span>
              </div>
              <div style={{ fontSize: "11px", color: C.t3, marginTop: "6px" }}>{progress.termine}/{progress.total} tâches terminées{progress.enRetard > 0 ? ` · ${progress.enRetard} en retard` : ""}</div>
            </div>
          )}

          <MilestonesSection C={C} milestones={milestones} gerable={gerable} onAdd={ajouterMilestone} onCycle={cyclerMilestone} onDelete={supprimerMilestone}/>
        </div>
      ) : subTab === "taches" ? (
        <TachesTab C={C} taches={taches} unlinked={unlinkedTaches} gerable={gerable} onToggle={toggleTacheFait} onAdd={creerTacheRapide} onAssocier={associerTache} onDetacher={detacherTache}/>
      ) : subTab === "documents" ? (
        <DocumentsTab C={C} documents={documents} unlinked={unlinkedDocs} gerable={gerable} projetId={projet.id} onToast={onToast} onReload={load} onAssocier={associerDocument} onDetacher={detacherDocument}/>
      ) : subTab === "timeline" ? (
        <ProjectMilestoneTimeline C={C} projet={projet} milestones={milestones}/>
      ) : (
        <ActiviteTab C={C} entrees={activite}/>
      )}
    </div>
  );
}

function MilestonesSection({ C, milestones, gerable, onAdd, onCycle, onDelete }: {
  C: ThemeTokens; milestones: Milestone[]; gerable: boolean; onAdd: (t: string) => void; onCycle: (m: Milestone) => void; onDelete: (id: string) => void;
}) {
  const [newTitre, setNewTitre] = useState("");
  return (
    <div>
      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Milestones</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
        {milestones.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => gerable && onCycle(m)} disabled={!gerable} style={{ width: "18px", height: "18px", borderRadius: "50%", border: `1.5px solid ${m.statut === "termine" ? C.green : m.statut === "en_cours" ? C.gold : C.border2}`, backgroundColor: m.statut === "termine" ? C.green : m.statut === "en_cours" ? C.gold : "transparent", cursor: gerable ? "pointer" : "default", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {m.statut === "termine" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
            <span style={{ flex: 1, fontSize: "13px", color: m.statut === "termine" ? C.t3 : C.t1, fontWeight: m.statut === "en_cours" ? 700 : 500, textDecoration: m.statut === "termine" ? "line-through" : "none" }}>{m.titre}</span>
            {m.echeance && <span style={{ fontSize: "11px", color: C.t3, flexShrink: 0 }}>{new Date(`${m.echeance}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
            {gerable && (
              <button onClick={() => onDelete(m.id)} aria-label="Supprimer" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", flexShrink: 0, display: "flex" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        ))}
        {milestones.length === 0 && <div style={{ fontSize: "12px", color: C.t3 }}>Aucune milestone.</div>}
      </div>
      {gerable && (
        <div style={{ display: "flex", gap: "6px" }}>
          <input value={newTitre} onChange={e => setNewTitre(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(newTitre); setNewTitre(""); } }} placeholder="Ajouter une milestone…" style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 11px", fontSize: "12px", color: C.t1 }}/>
          <button onClick={() => { onAdd(newTitre); setNewTitre(""); }} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 14px", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+</button>
        </div>
      )}
    </div>
  );
}

function LinkPicker({ C, anchorRef, open, onClose, items, onSelect, emptyLabel }: {
  C: ThemeTokens; anchorRef: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; items: { id: string; label: string }[]; onSelect: (id: string) => void; emptyLabel: string;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={C} minWidth={220}>
      {items.length === 0 ? (
        <div style={{ padding: "8px 10px", fontSize: "11.5px", color: C.t3 }}>{emptyLabel}</div>
      ) : items.map(it => (
        <button key={it.id} onClick={() => { onSelect(it.id); onClose(); }} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", color: C.t1, cursor: "pointer" }}>{it.label}</button>
      ))}
    </AgendaPopover>
  );
}

function TachesTab({ C, taches, unlinked, gerable, onToggle, onAdd, onAssocier, onDetacher }: {
  C: ThemeTokens; taches: Tache[]; unlinked: Tache[]; gerable: boolean;
  onToggle: (t: Tache) => void; onAdd: (t: string) => void; onAssocier: (id: string) => void; onDetacher: (id: string) => void;
}) {
  const [newTitre, setNewTitre] = useState("");
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div>
      {taches.length === 0 ? (
        <div style={{ fontSize: "12.5px", color: C.t3, marginBottom: "14px" }}>Aucune tâche liée à ce projet pour l&apos;instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "14px" }}>
          {taches.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <button onClick={() => onToggle(t)} style={{ width: "17px", height: "17px", borderRadius: "5px", border: `1.5px solid ${t.statut === "termine" ? C.green : C.border2}`, backgroundColor: t.statut === "termine" ? C.green : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {t.statut === "termine" && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: prioriteColorTache(t.priorite, C), flexShrink: 0 }}/>
              <span style={{ flex: 1, fontSize: "13px", color: t.statut === "termine" ? C.t3 : C.t1, textDecoration: t.statut === "termine" ? "line-through" : "none" }}>{t.titre}</span>
              <span style={{ fontSize: "10.5px", fontWeight: estEnRetard(t) ? 800 : 600, color: estEnRetard(t) ? C.red : C.t3, flexShrink: 0 }}>{echeanceLabelTache(t)}</span>
              <span style={{ fontSize: "9.5px", fontWeight: 800, color: statutColorTache(t.statut, C), backgroundColor: `${statutColorTache(t.statut, C)}15`, padding: "2px 8px", borderRadius: "20px", flexShrink: 0 }}>{t.statut === "a_faire" ? "À faire" : t.statut === "en_cours" ? "En cours" : "Terminée"}</span>
              {gerable && <button onClick={() => onDetacher(t.id)} title="Détacher du projet" style={{ background: "none", border: "none", color: C.t3, fontSize: "11px", cursor: "pointer", flexShrink: 0 }}>Détacher</button>}
            </div>
          ))}
        </div>
      )}
      {gerable && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
          <input value={newTitre} onChange={e => setNewTitre(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(newTitre); setNewTitre(""); } }} placeholder="Ajouter une tâche…" style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 11px", fontSize: "12.5px", color: C.t1 }}/>
          <button onClick={() => { onAdd(newTitre); setNewTitre(""); }} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "9px 14px", color: C.t2, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+</button>
        </div>
      )}
      {gerable && (
        <>
          <button ref={linkBtnRef} onClick={() => setLinkOpen(v => !v)} style={{ background: "none", border: "none", color: C.gold, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Associer une tâche existante</button>
          <LinkPicker C={C} anchorRef={linkBtnRef} open={linkOpen} onClose={() => setLinkOpen(false)} items={unlinked.map(t => ({ id: t.id, label: t.titre }))} onSelect={onAssocier} emptyLabel="Aucune tâche non liée disponible."/>
        </>
      )}
    </div>
  );
}

function DocumentsTab({ C, documents, unlinked, gerable, projetId, onToast, onReload, onAssocier, onDetacher }: {
  C: ThemeTokens; documents: DocumentTravail[]; unlinked: DocumentTravail[]; gerable: boolean; projetId: string;
  onToast: (msg: string, color?: string) => void; onReload: () => void; onAssocier: (id: string) => void; onDetacher: (id: string) => void;
}) {
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("nom", file.name.replace(/\.[^/.]+$/, ""));
    fd.append("categorie", "autre");
    fd.append("projet_id", projetId);
    const res = await fetch("/api/institution/documents-travail", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) { onToast("Erreur d'envoi", C.red); return; }
    onToast("Document ajouté", C.green);
    onReload();
  }

  return (
    <div>
      {documents.length === 0 ? (
        <div style={{ fontSize: "12.5px", color: C.t3, marginBottom: "14px" }}>Aucun document lié à ce projet pour l&apos;instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "14px" }}>
          {documents.map(d => {
            const type = fileTypeInfo(d.type_mime, C);
            return (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "6px", backgroundColor: `${type.color}18`, color: type.color, fontSize: "7px", fontWeight: 800, flexShrink: 0 }}>{type.label}</span>
                <span style={{ flex: 1, fontSize: "13px", color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</span>
                <span style={{ fontSize: "10.5px", color: C.t3, flexShrink: 0 }}>{categorieLabel(d.categorie)}</span>
                <span style={{ fontSize: "10.5px", color: C.t3, flexShrink: 0 }}>{formatTaille(d.taille)}</span>
                {gerable && <button onClick={() => onDetacher(d.id)} title="Détacher du projet" style={{ background: "none", border: "none", color: C.t3, fontSize: "11px", cursor: "pointer", flexShrink: 0 }}>Détacher</button>}
              </div>
            );
          })}
        </div>
      )}
      {gerable && (
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" loading={uploading} onClick={() => fileInputRef.current?.click()}>+ Ajouter</Button>
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}/>
          <button ref={linkBtnRef} onClick={() => setLinkOpen(v => !v)} style={{ background: "none", border: "none", color: C.gold, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Associer un document existant</button>
          <LinkPicker C={C} anchorRef={linkBtnRef} open={linkOpen} onClose={() => setLinkOpen(false)} items={unlinked.map(d => ({ id: d.id, label: d.nom }))} onSelect={onAssocier} emptyLabel="Aucun document non lié disponible."/>
        </div>
      )}
    </div>
  );
}

function ProjectMilestoneTimeline({ C, projet, milestones }: { C: ThemeTokens; projet: Projet; milestones: Milestone[] }) {
  const withDates = milestones.filter(m => m.echeance);
  if (!projet.date_debut && !projet.date_fin_prevue && withDates.length === 0) {
    return <div style={{ fontSize: "12.5px", color: C.t3 }}>Aucune date définie pour ce projet ou ses milestones.</div>;
  }
  const dates = [
    ...(projet.date_debut ? [new Date(projet.date_debut).getTime()] : []),
    ...(projet.date_fin_prevue ? [new Date(projet.date_fin_prevue).getTime()] : []),
    ...withDates.map(m => new Date(m.echeance!).getTime()),
  ];
  const rangeStart = Math.min(...dates);
  const rangeEnd = Math.max(...dates, rangeStart + 30 * 86400000);
  const span = rangeEnd - rangeStart;

  return (
    <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, padding: "20px" }}>
      {projet.date_debut && projet.date_fin_prevue && (
        <div style={{ position: "relative", height: "28px", marginBottom: "20px" }}>
          <div style={{ position: "absolute", left: `${((new Date(projet.date_debut).getTime() - rangeStart) / span) * 100}%`, width: `${((new Date(projet.date_fin_prevue).getTime() - new Date(projet.date_debut).getTime()) / span) * 100}%`, height: "100%", backgroundColor: `${C.gold}20`, border: `1px solid ${C.gold}`, borderRadius: "6px" }}/>
        </div>
      )}
      <div style={{ position: "relative", height: `${Math.max(withDates.length, 1) * 34}px` }}>
        {withDates.map((m, i) => (
          <div key={m.id} style={{ position: "absolute", left: `${((new Date(m.echeance!).getTime() - rangeStart) / span) * 100}%`, top: `${i * 34}px`, display: "flex", alignItems: "center", gap: "6px", transform: "translateX(-50%)" }}>
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", backgroundColor: m.statut === "termine" ? C.green : C.gold, flexShrink: 0 }}/>
            <span style={{ fontSize: "11px", fontWeight: 700, color: C.t1, whiteSpace: "nowrap" }}>{m.titre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiviteTab({ C, entrees }: { C: ThemeTokens; entrees: { membre_nom: string; action: string; created_at: string }[] | null }) {
  if (entrees === null) return <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}><YelenLoader size={20}/></div>;
  if (entrees.length === 0) return <div style={{ fontSize: "12.5px", color: C.t3 }}>Aucune activité pour l&apos;instant.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {entrees.map((e, i) => (
        <div key={i} style={{ fontSize: "12.5px", color: C.t2 }}>
          <strong style={{ color: C.t1 }}>{e.membre_nom}</strong> {ACTION_LABELS[e.action] ?? e.action}
          <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>{relTime(e.created_at)}</div>
        </div>
      ))}
    </div>
  );
}
