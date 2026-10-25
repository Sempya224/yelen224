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
import { type DocumentTravail, categorieLabel, fileTypeLabel } from "./DocumentsOverlays";
import { NotesStyles, SaveIndicator, PropLabel, chipBtn } from "./NotesUi";
import { FileTypeIcon } from "./DocumentsUi";
import { TasksMessage } from "./TachesUi";
import { ClockStyles, champStyle } from "../../components/ClockInShiftUi";
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

  // Garde de sortie navigateur + raccourci Ctrl/Cmd+S (force l'enregistrement
  // immédiat, l'autosave reste le mécanisme normal).
  useEffect(() => {
    function avantFermeture(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ""; } }
    function raccourci(e: globalThis.KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty) doSave(); } }
    window.addEventListener("beforeunload", avantFermeture);
    window.addEventListener("keydown", raccourci);
    return () => { window.removeEventListener("beforeunload", avantFermeture); window.removeEventListener("keydown", raccourci); };
  });


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

  if (noteId !== "new" && !note && !persistedId) {
    return (
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <NotesStyles C={C}/>
        <TasksMessage C={C} titre="Note introuvable" texte="Cette note n'existe plus ou a été supprimée." action={{ label: "← Notes", onClick: onBack, primaire: true }}/>
      </div>
    );
  }

  const ui = toUiTokens(C);
  const projetNom = projetId ? (projets.find(p => p.id === projetId)?.nom ?? "Projet") : null;
  const chevron = <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto" }}>
      <ClockStyles C={C}/>
      <NotesStyles C={C}/>
      <div className="nt-top" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" aria-label="Retour à la liste des notes" onClick={requestBack}
            icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>}>Notes</Button>
          <span className="nt-crumb" style={{ color: C.t3, fontSize: "13px", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "340px" }}>Notes / <span style={{ color: C.t2 }}>{titre.trim() || "Nouvelle note"}</span></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <SaveIndicator C={C} status={status} dirty={dirty} savedAt={savedAt} onRetry={doSave}/>
          {gerable && persistedId && (
            <>
              <button ref={menuBtnRef} type="button" className="nt-btn tap" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)} aria-label="Autres actions"
                style={{ width: "32px", height: "32px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconMore color={C.t2}/>
              </button>
              <NoteActionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} tokens={C} onDuplicate={dupliquer} onDelete={() => { setMenuOpen(false); setDeleteConfirm(true); }}/>
            </>
          )}
        </div>
      </div>

      {status === "erreur" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", backgroundColor: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: "10px", padding: "10px 14px", marginBottom: "16px" }}>
          <span role="alert" style={{ fontSize: "13px", fontWeight: 500, color: C.red }}>L&apos;enregistrement a échoué. Votre contenu est conservé.</span>
          <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={doSave}>Réessayer</Button>
        </div>
      )}

      <input className="nt-title" aria-label="Titre de la note" value={titre} disabled={!gerable}
        onChange={e => { setTitre(e.target.value); scheduleSave(); }} placeholder="Titre de la note"
        style={{ width: "100%", boxSizing: "border-box", fontSize: "32px", fontWeight: 600, lineHeight: 1.25, color: C.t1, padding: "4px 0 6px", marginBottom: "6px", fontFamily: "inherit" }}/>

      {persistedId && note && (
        <div style={{ fontSize: "12px", color: C.t3, marginBottom: "16px", fontVariantNumeric: "tabular-nums" }}>Dernière modification : {new Date(note.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: "20px 28px", flexWrap: "wrap", marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <PropLabel C={C}>Type</PropLabel>
          <button ref={typeBtnRef} type="button" className="nt-btn tap" aria-haspopup="listbox" onClick={() => gerable && setTypeOpen(v => !v)} disabled={!gerable}
            style={{ ...chipBtn(C), backgroundColor: `${typeColor(type, C)}1c`, borderColor: `${typeColor(type, C)}40`, cursor: gerable ? "pointer" : "default" }}>
            <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: typeColor(type, C) }}/>{typeLabel(type)}{gerable && chevron}
          </button>
          <NoteTypePicker open={typeOpen} onClose={() => setTypeOpen(false)} anchorRef={typeBtnRef} tokens={C} value={type} onSelect={t => { setType(t); scheduleSave(); }}/>
        </div>

        <div>
          <PropLabel C={C}>Projet</PropLabel>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <button ref={projetBtnRef} type="button" className="nt-btn tap" onClick={() => gerable && setProjetOpen(v => !v)} disabled={!gerable} style={{ ...chipBtn(C, !projetId), color: projetId ? C.t1 : C.t2, cursor: gerable ? "pointer" : "default", maxWidth: "260px" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{projetNom ?? "+ Associer un projet"}</span>
            </button>
            {gerable && projetId && (
              <button type="button" className="nt-btn tap" aria-label="Retirer le projet associé" onClick={() => { setProjetId(null); scheduleSave(); }}
                style={{ width: "28px", height: "28px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          <ProjectLinkPicker open={projetOpen} onClose={() => setProjetOpen(false)} anchorRef={projetBtnRef} tokens={C} projets={projets} value={projetId} onSelect={id => { setProjetId(id); scheduleSave(); }}/>
        </div>

        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <PropLabel C={C}>Tags</PropLabel>
          <TagsEditor C={C} tags={tags} readOnly={!gerable} onChange={t => { setTags(t); scheduleSave(); }}/>
        </div>

        {gerable && !taskQuickOpen && (
          <div>
            <PropLabel C={C}>Tâche</PropLabel>
            <Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => { setTaskQuickTitre(titre); setTaskQuickOpen(true); }}
              icon={<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}>Créer une tâche</Button>
          </div>
        )}
      </div>

      {taskQuickOpen && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input className="cix-input" aria-label="Titre de la tâche" value={taskQuickTitre} onChange={e => setTaskQuickTitre(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); creerTacheLiee(); } if (e.key === "Escape") setTaskQuickOpen(false); }} placeholder="Titre de la tâche" autoFocus style={{ ...champStyle(C), flex: "1 1 240px", width: "auto" }}/>
          <Button tokens={ui} className="tap" variant="secondary" size="md" onClick={() => setTaskQuickOpen(false)}>Annuler</Button>
          <Button tokens={ui} className="tap" variant="primary" size="md" disabled={!taskQuickTitre.trim()} loading={taskQuickSaving} onClick={creerTacheLiee}>Créer</Button>
        </div>
      )}

      <div className="nt-zone" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", minHeight: "320px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "12px" }}>
        {blocks.length === 0 && (
          <div style={{ color: C.t3, fontSize: "15px", lineHeight: 1.6 }}>{gerable ? "Écrivez en ajoutant un bloc avec « + Ajouter un bloc »." : "Cette note est vide."}</div>
        )}
        {blocks.map(b => (
          <BlockRow key={b.id} C={C} block={b} readOnly={!gerable} onChange={patch => updateBlock(b.id, patch)} onDelete={() => removeBlock(b.id)}/>
        ))}
        {gerable && (
          <div style={{ marginTop: "auto", paddingTop: "8px" }}>
            <button ref={addBlockBtnRef} type="button" className="nt-btn tap" aria-haspopup="menu" aria-expanded={addBlockOpen} onClick={() => setAddBlockOpen(v => !v)} style={chipBtn(C, true)}>
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Ajouter un bloc
            </button>
            <BlockTypeMenu open={addBlockOpen} onClose={() => setAddBlockOpen(false)} anchorRef={addBlockBtnRef} tokens={C} onSelect={ajouterBloc}/>
          </div>
        )}
      </div>

      {documents.length > 0 && (gerable || documentIds.length > 0) && (
        <section aria-labelledby="note-docs-titre" style={{ marginTop: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
            <h2 id="note-docs-titre" style={{ margin: 0, color: C.t1, fontSize: "14px", fontWeight: 600 }}>Documents liés</h2>
            {gerable && (
              <>
                <button ref={docBtnRef} type="button" className="nt-btn tap" aria-haspopup="menu" aria-expanded={docOpen} onClick={() => setDocOpen(v => !v)} style={chipBtn(C)}>
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Lier un document
                </button>
                <DocumentLinkPicker open={docOpen} onClose={() => setDocOpen(false)} anchorRef={docBtnRef} tokens={C} documents={documents} value={documentIds} onToggle={id => { setDocumentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); scheduleSave(); }}/>
              </>
            )}
          </div>
          {documentIds.length === 0 ? (
            <div style={{ border: `1px dashed ${C.border2}`, borderRadius: "12px", padding: "24px 16px", textAlign: "center" }}>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, marginTop: "6px" }}>Aucun document lié</div>
              <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>Associez des contrats, factures ou rapports à cette note.</div>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard }}>
              {documentIds.map((id, i) => {
                const d = documents.find(x => x.id === id);
                if (!d) return null;
                return (
                  <li key={id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                    <FileTypeIcon C={C} type={fileTypeLabel(d.type_mime)} taille={32}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={d.nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</div>
                      <div style={{ color: C.t3, fontSize: "12px" }}>{categorieLabel(d.categorie)}</div>
                    </div>
                    {gerable && (
                      <button type="button" className="nt-btn tap" aria-label={`Délier ${d.nom}`} title="Délier" onClick={() => { setDocumentIds(prev => prev.filter(x => x !== id)); scheduleSave(); }}
                        style={{ width: "32px", height: "32px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {showLeaveConfirm && (
        <ConfirmModal open onClose={() => setShowLeaveConfirm(false)} onConfirm={confirmLeaveAndSave} tokens={ui} level={1}
          title="Modifications non enregistrées"
          description="Vous avez des modifications qui n'ont pas encore été enregistrées."
          confirmLabel="Quitter" cancelLabel="Rester"/>
      )}

      {deleteConfirm && (
        <ConfirmModal open onClose={() => setDeleteConfirm(false)} onConfirm={supprimer} tokens={ui} level={1} danger
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
    content = <input disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Titre" style={{ ...textStyle, fontSize: "20px", fontWeight: 600 }}/>;
  } else if (block.type === "sous_titre") {
    content = <input disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Sous-titre" style={{ ...textStyle, fontSize: "16px", fontWeight: 600 }}/>;
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
    content = <textarea disabled={readOnly} value={block.text || ""} onChange={e => onChange({ text: e.target.value })} placeholder="Écrire…" rows={Math.max(2, (block.text || "").split("\n").length)} style={{ ...textStyle, fontSize: "15px", lineHeight: 1.6 }}/>;
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
