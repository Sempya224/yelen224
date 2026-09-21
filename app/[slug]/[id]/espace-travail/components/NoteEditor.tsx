"use client";

// Éditeur de note (item 5 du brief V3 Notes, 20/09/2026) — écran calme,
// contrôles discrets, éditeur par blocs (item 6), autosave réel (item 7,
// débounce + PATCH/POST existants, pas un faux "✓ Enregistré" cosmétique),
// garde "modifications non enregistrées" (item 8, jamais une perte
// silencieuse). Navigation locale ("← Notes"), pas une route séparée.
//
// Note "new" (jamais encore persistée) : POST déclenché par le premier
// autosave réussi (titre non vide) — la note ne "meurt" jamais dans un
// formulaire déconnecté de l'éditeur (même principe que Projets, item 15
// du brief Projets), création et rédaction sont un seul geste continu.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { ThemeTokens } from "../../theme";
import { toUiTokens } from "../../theme";
import { type Projet } from "./ProjetsOverlays";
import { type DocumentTravail } from "./DocumentsOverlays";
import {
  type Note, type Membre, type Block, type BlockType,
  typeColor, typeLabel, nomMembre, peutGerer,
  parseContenu, serializeBlocks, nouveauBloc,
  NoteTypePicker, BlockTypeMenu, ProjectLinkPicker, DocumentLinkPicker, NoteActionsMenu, TagsEditor,
} from "./NotesOverlays";

type SaveStatus = "attente" | "enregistrement" | "enregistre" | "erreur";
const AUTOSAVE_DELAY_MS = 1200;

function IconMore({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}

export function NoteEditor({ noteId, note, membres, projets, documents, moiId, moiRole, onBack, onCreated, onToast, onChanged, C }: {
  noteId: string | "new"; note: Note | null; membres: Membre[]; projets: Projet[]; documents: DocumentTravail[];
  moiId: string | null; moiRole: string | null; onBack: () => void; onCreated: (id: string) => void;
  onToast: (msg: string, color?: string) => void; onChanged: () => void; C: ThemeTokens;
}) {
  // Lazy init uniquement — ne se resynchronise jamais depuis `note` après
  // le montage, y compris quand `noteId` passe de "new" à un id réel après
  // le premier autosave (même instance de composant, pas de remount).
  const [titre, setTitre] = useState(() => note?.titre || "");
  const [blocks, setBlocks] = useState<Block[]>(() => note ? parseContenu(note.contenu) : []);
  const [type, setType] = useState(() => note?.type || "info_importante");
  const [tags, setTags] = useState<string[]>(() => note?.tags || []);
  const [projetId, setProjetId] = useState<string | null>(() => note?.projet_id ?? null);
  const [documentIds, setDocumentIds] = useState<string[]>(() => note?.document_ids || []);
  const [persistedId, setPersistedId] = useState<string | null>(note?.id ?? null);
  const [authorId] = useState<string | null>(() => note?.membre_id ?? moiId);

  const [status, setStatus] = useState<SaveStatus>("attente");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [taskQuickOpen, setTaskQuickOpen] = useState(false);
  const [taskQuickTitre, setTaskQuickTitre] = useState("");
  const [taskQuickSaving, setTaskQuickSaving] = useState(false);

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const typeBtnRef = useRef<HTMLButtonElement>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const projetBtnRef = useRef<HTMLButtonElement>(null);
  const [projetOpen, setProjetOpen] = useState(false);
  const docBtnRef = useRef<HTMLButtonElement>(null);
  const [docOpen, setDocOpen] = useState(false);
  const addBlockBtnRef = useRef<HTMLButtonElement>(null);
  const [addBlockOpen, setAddBlockOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ titre, blocks, type, tags, projetId, documentIds });
  stateRef.current = { titre, blocks, type, tags, projetId, documentIds };

  const gerable = moiRole === "admin" || authorId === moiId;

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function scheduleSave() {
    if (!gerable) return;
    setDirty(true);
    setStatus("attente");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { doSave(); }, AUTOSAVE_DELAY_MS);
  }

  async function doSave(): Promise<void> {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const s = stateRef.current;
    // Le titre reste obligatoire (item 4) — tant qu'il est vide, rien n'est
    // jamais envoyé au serveur (ni création, ni mise à jour).
    if (!s.titre.trim()) return;
    setStatus("enregistrement");
    const body = { titre: s.titre.trim(), contenu: serializeBlocks(s.blocks), type: s.type, tags: s.tags, projet_id: s.projetId, document_ids: s.documentIds };
    const res = persistedId
      ? await fetch("/api/institution/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: persistedId, ...body }) })
      : await fetch("/api/institution/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setStatus("erreur"); return; }
    if (!persistedId) {
      const j = await res.json().catch(() => null);
      if (j?.id) { setPersistedId(j.id); onCreated(j.id); }
    }
    setDirty(false);
    setStatus("enregistre");
    setSavedAt(new Date());
    onChanged();
  }

  function requestBack() {
    if (dirty) { setShowLeaveConfirm(true); return; }
    onBack();
  }
  async function confirmLeaveAndSave() {
    await doSave();
    setShowLeaveConfirm(false);
    onBack();
  }

  async function dupliquer() {
    const s = stateRef.current;
    const res = await fetch("/api/institution/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titre: `Copie de ${s.titre}`, contenu: serializeBlocks(s.blocks), type: s.type, tags: s.tags, projet_id: s.projetId, document_ids: s.documentIds }) });
    if (!res.ok) { onToast("Erreur de duplication", C.red); return; }
    const j = await res.json().catch(() => null);
    onToast("Note dupliquée", C.green);
    onChanged();
    if (j?.id) onCreated(j.id);
  }
  async function supprimer() {
    if (!persistedId) return;
    await fetch(`/api/institution/notes?id=${persistedId}`, { method: "DELETE" });
    onToast("Note supprimée", C.orange);
    onChanged();
    onBack();
  }

  // Connexion Notes → Tâches (item 12 du brief Notes, vérifiée comme
  // relation réelle à la revue finale du 20/09/2026, "Parcours 4") — crée
  // une vraie tâche dans le système, jamais une checklist isolée locale à
  // la note. Aucune colonne `note_id` sur `taches` (pas inventée) : le lien
  // qui subsiste est le projet de la note, hérité par la tâche si présent.
  async function creerTacheLiee() {
    if (!taskQuickTitre.trim()) return;
    setTaskQuickSaving(true);
    const res = await fetch("/api/institution/taches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titre: taskQuickTitre.trim(), projet_id: projetId }) });
    setTaskQuickSaving(false);
    if (!res.ok) { onToast("Erreur de création", C.red); return; }
    onToast("Tâche créée", C.green);
    setTaskQuickTitre("");
    setTaskQuickOpen(false);
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
    scheduleSave();
  }
  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
    scheduleSave();
  }
  function ajouterBloc(t: BlockType) {
    setBlocks(prev => [...prev, nouveauBloc(t)]);
    scheduleSave();
  }

  const statusLabel = status === "attente" ? (dirty ? "Modifications en attente…" : "") : status === "enregistrement" ? "Enregistrement…" : status === "erreur" ? "Erreur d'enregistrement" : savedAt ? `Enregistré à ${savedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <button onClick={requestBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: C.t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Notes
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: status === "erreur" ? C.red : C.t3, display: "flex", alignItems: "center", gap: "5px" }}>
            {status === "enregistre" && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            {statusLabel}
            {status === "erreur" && <button onClick={doSave} style={{ color: C.red, background: "none", border: "none", fontWeight: 800, cursor: "pointer", textDecoration: "underline", fontSize: "11px" }}>Réessayer</button>}
          </span>
          {gerable && persistedId && (
            <>
              <button ref={menuBtnRef} onClick={() => setMenuOpen(v => !v)} aria-label="Autres actions" style={{ width: "30px", height: "30px", borderRadius: "9px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconMore color={C.t2}/>
              </button>
              <NoteActionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} tokens={C} onDuplicate={dupliquer} onDelete={() => { setMenuOpen(false); setDeleteConfirm(true); }}/>
            </>
          )}
        </div>
      </div>

      <input
        value={titre}
        disabled={!gerable}
        onChange={e => { setTitre(e.target.value); scheduleSave(); }}
        placeholder="Titre de la note"
        style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: "22px", fontWeight: 800, color: C.t1, marginBottom: "6px", padding: 0 }}
      />

      {persistedId && note && (
        <div style={{ fontSize: "11px", color: C.t3, marginBottom: "12px" }}>Dernière modification : {new Date(note.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "16px", paddingBottom: "16px", borderBottom: `1px solid ${C.border}` }}>
        <button ref={typeBtnRef} onClick={() => gerable && setTypeOpen(v => !v)} disabled={!gerable} style={{ display: "inline-flex", alignItems: "center", gap: "5px", backgroundColor: `${typeColor(type, C)}15`, color: typeColor(type, C), border: "none", fontSize: "10.5px", fontWeight: 800, padding: "4px 10px", borderRadius: "20px", cursor: gerable ? "pointer" : "default" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: typeColor(type, C) }}/>{typeLabel(type)}
        </button>
        <NoteTypePicker open={typeOpen} onClose={() => setTypeOpen(false)} anchorRef={typeBtnRef} tokens={C} value={type} onSelect={t => { setType(t); scheduleSave(); }}/>

        <button ref={projetBtnRef} onClick={() => gerable && setProjetOpen(v => !v)} disabled={!gerable} style={{ background: "none", border: "none", color: projetId ? C.goldD : C.t3, fontSize: "11px", fontWeight: 700, cursor: gerable ? "pointer" : "default", padding: 0 }}>
          {projetId ? (projets.find(p => p.id === projetId)?.nom ?? "Projet") : "+ Associer un projet"}
        </button>
        <ProjectLinkPicker open={projetOpen} onClose={() => setProjetOpen(false)} anchorRef={projetBtnRef} tokens={C} projets={projets} value={projetId} onSelect={id => { setProjetId(id); scheduleSave(); }}/>

        <TagsEditor C={C} tags={tags} readOnly={!gerable} onChange={t => { setTags(t); scheduleSave(); }}/>

        {gerable && !taskQuickOpen && (
          <button onClick={() => { setTaskQuickTitre(titre); setTaskQuickOpen(true); }} style={{ background: "none", border: "none", color: C.gold, fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: 0 }}>+ Créer une tâche</button>
        )}
      </div>

      {taskQuickOpen && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
          <input value={taskQuickTitre} onChange={e => setTaskQuickTitre(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); creerTacheLiee(); } if (e.key === "Escape") setTaskQuickOpen(false); }} placeholder="Titre de la tâche" autoFocus style={{ flex: 1, backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "8px 11px", fontSize: "12.5px", color: C.t1 }}/>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setTaskQuickOpen(false)}>Annuler</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" disabled={!taskQuickTitre.trim()} loading={taskQuickSaving} onClick={creerTacheLiee}>Créer</Button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {blocks.map(b => (
          <BlockRow key={b.id} C={C} block={b} readOnly={!gerable} onChange={patch => updateBlock(b.id, patch)} onDelete={() => removeBlock(b.id)}/>
        ))}
      </div>

      {gerable && (
        <>
          <button ref={addBlockBtnRef} onClick={() => setAddBlockOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: `1px dashed ${C.border2}`, borderRadius: "8px", padding: "8px 12px", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Ajouter un bloc</button>
          <BlockTypeMenu open={addBlockOpen} onClose={() => setAddBlockOpen(false)} anchorRef={addBlockBtnRef} tokens={C} onSelect={ajouterBloc}/>
        </>
      )}

      {documents.length > 0 && (gerable || documentIds.length > 0) && (
        <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Documents liés</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
            {documentIds.map(id => { const d = documents.find(x => x.id === id); return d ? <div key={id} style={{ fontSize: "12.5px", color: C.t1 }}>{d.nom}</div> : null; })}
            {documentIds.length === 0 && <div style={{ fontSize: "12px", color: C.t3 }}>Aucun document lié.</div>}
          </div>
          {gerable && (
            <>
              <button ref={docBtnRef} onClick={() => setDocOpen(v => !v)} style={{ background: "none", border: "none", color: C.gold, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Lier un document</button>
              <DocumentLinkPicker open={docOpen} onClose={() => setDocOpen(false)} anchorRef={docBtnRef} tokens={C} documents={documents} value={documentIds} onToggle={id => { setDocumentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); scheduleSave(); }}/>
            </>
          )}
        </div>
      )}

      {showLeaveConfirm && (
        <ConfirmModal open onClose={() => setShowLeaveConfirm(false)} onConfirm={confirmLeaveAndSave} tokens={toUiTokens(C)} level={1}
          title="Modifications non enregistrées"
          description="Vous avez des modifications qui n'ont pas encore été enregistrées."
          confirmLabel="Quitter" cancelLabel="Rester"/>
      )}

      {deleteConfirm && (
        <ConfirmModal open onClose={() => setDeleteConfirm(false)} onConfirm={supprimer} tokens={toUiTokens(C)} level={1} danger
          title="Supprimer cette note ?"
          consequences={[`« ${titre} »`]}
          description="Cette action supprimera cette note selon les règles de conservation de votre espace."
          reversible={false}
          confirmLabel="Supprimer" cancelLabel="Annuler"/>
      )}
    </div>
  );
}

function BlockRow({ C, block, readOnly, onChange, onDelete }: {
  C: ThemeTokens; block: Block; readOnly: boolean; onChange: (patch: Partial<Block>) => void; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const textStyle: React.CSSProperties = { width: "100%", background: "none", border: "none", outline: "none", color: C.t1, resize: "none", fontFamily: "inherit", padding: 0 };

  let content: React.ReactNode;
  if (block.type === "titre") {
    content = <input disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Titre" style={{ ...textStyle, fontSize: "17px", fontWeight: 800 }}/>;
  } else if (block.type === "sous_titre") {
    content = <input disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Sous-titre" style={{ ...textStyle, fontSize: "14.5px", fontWeight: 700 }}/>;
  } else if (block.type === "citation") {
    content = (
      <div style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: "12px" }}>
        <textarea disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Citation" rows={2} style={{ ...textStyle, fontSize: "13.5px", fontStyle: "italic", color: C.t2 }}/>
      </div>
    );
  } else if (block.type === "separateur") {
    content = <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "6px 0" }}/>;
  } else if (block.type === "lien") {
    content = readOnly ? (
      <a href={block.url || "#"} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: "13px", fontWeight: 700 }}>{block.text || block.url}</a>
    ) : (
      <div style={{ display: "flex", gap: "8px" }}>
        <input value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Texte du lien" style={{ ...textStyle, flex: 1, backgroundColor: C.bg3, borderRadius: "6px", padding: "6px 8px", fontSize: "13px" }}/>
        <input value={block.url || ""} onChange={e => onChange({ url: e.target.value })} placeholder="https://…" style={{ ...textStyle, flex: 1, backgroundColor: C.bg3, borderRadius: "6px", padding: "6px 8px", fontSize: "13px" }}/>
      </div>
    );
  } else if (block.type === "liste" || block.type === "checklist") {
    const items = block.items || [];
    content = (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {block.type === "checklist" ? (
              <button disabled={readOnly} onClick={() => { const next = items.map((x, idx) => idx === i ? { ...x, fait: !x.fait } : x); onChange({ items: next }); }} style={{ width: "15px", height: "15px", borderRadius: "4px", border: `1.5px solid ${it.fait ? C.green : C.border2}`, backgroundColor: it.fait ? C.green : "transparent", flexShrink: 0, cursor: readOnly ? "default" : "pointer" }}/>
            ) : (
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: C.t3, flexShrink: 0 }}/>
            )}
            <input disabled={readOnly} value={it.text} onChange={e => { const next = items.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x); onChange({ items: next }); }} style={{ ...textStyle, fontSize: "13.5px", textDecoration: it.fait ? "line-through" : "none", color: it.fait ? C.t3 : C.t1 }}/>
            {!readOnly && (
              <button onClick={() => onChange({ items: items.filter((_, idx) => idx !== i) })} aria-label="Retirer" style={{ background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button onClick={() => onChange({ items: [...items, { text: "" }] })} style={{ alignSelf: "flex-start", background: "none", border: "none", color: C.t3, fontSize: "11.5px", cursor: "pointer" }}>+ Élément</button>
        )}
      </div>
    );
  } else {
    content = <textarea disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Écrire…" rows={Math.max(2, (block.text || "").split("\n").length)} style={{ ...textStyle, fontSize: "13.5px", lineHeight: 1.6 }}/>;
  }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
      {!readOnly && (
        <button onClick={onDelete} aria-label="Supprimer ce bloc" style={{ opacity: hover ? 1 : 0, transition: "opacity 0.15s ease", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", flexShrink: 0, marginTop: "3px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  );
}
