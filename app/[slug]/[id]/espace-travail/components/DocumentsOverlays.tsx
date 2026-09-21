"use client";

// Système V3 d'overlays des Documents (refonte CEO, 20/09/2026) — building
// blocks partagés par DocumentsSection.tsx. Même architecture que
// AgendaOverlays.tsx/TachesOverlays.tsx (audit + validations Bryan,
// 20/09/2026) : détails avant édition, confirmation dédiée pour la
// suppression, popovers ancrés pour les actions rapides, PC-first sans
// aucune logique mobile.
//
// Réutilise `AgendaPopover`/`useDialogA11y` depuis AgendaOverlays.tsx —
// import en lecture seule, aucune modification de ce fichier.
//
// Pas de versioning, partage, déplacement ni corbeille : aucune de ces
// briques n'existe dans le modèle `documents_travail` (vérifié dans
// app/api/institution/documents-travail/route.ts) — le brief lui-même les
// rend conditionnelles ("si déjà présent/existant"), donc omises plutôt
// que simulées (item 13/15/21 du brief).
import { useEffect, useRef, useState, type RefObject } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import type { ThemeTokens } from "../../theme";
import { toUiTokens } from "../../theme";
import { AgendaPopover, useDialogA11y } from "./AgendaOverlays";
import { CATEGORIES_DOCUMENT_TRAVAIL } from "@/lib/documentsTravail";
import { type Projet } from "./ProjetsOverlays";

export { useDialogA11y };

// projet_id : V3 Projets (20/09/2026, validé avec Bryan) — liaison
// optionnelle, purement additive (aucun consommateur existant de ce type,
// DocumentsSection.tsx, n'a besoin d'y toucher).
export type DocumentTravail = { id: string; nom: string; description: string | null; categorie: string; taille: number | null; type_mime: string | null; membre_id: string | null; projet_id?: string | null; uploaded_at: string };
export type Membre = { id: string; prenom: string; nom: string };

export { CATEGORIES_DOCUMENT_TRAVAIL };

export function categorieLabel(c: string): string {
  return CATEGORIES_DOCUMENT_TRAVAIL.find(x => x.value === c)?.label ?? c;
}

export function formatTaille(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Étiquette de type — badge texte sobre plutôt que des émojis par type
// (interdits dans Yelen) ou une bibliothèque d'icônes par format. Mimes
// exacts uniquement (voir lib/documentsTravail.ts) — le cas CFB legacy
// (vieux .doc/.xls, voir lib/uploadSecurity.ts) ne peut pas être distingué
// de façon fiable côté client (l'extension réelle n'est stockée que dans
// le chemin Storage, jamais exposée à la liste) : badge générique "FILE"
// plutôt qu'une supposition fausse.
export function fileTypeLabel(mime: string | null): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOC";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "XLS";
  if (mime === "image/jpeg" || mime === "image/png") return "IMG";
  return "FILE";
}

export function fileTypeInfo(mime: string | null, C: ThemeTokens): { label: string; color: string } {
  const label = fileTypeLabel(mime);
  const color = label === "PDF" ? C.red : label === "DOC" ? C.blue : label === "XLS" ? C.green : label === "IMG" ? C.purple : C.t3;
  return { label, color };
}

export function isPreviewable(mime: string | null): "pdf" | "image" | null {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/png") return "image";
  return null;
}

export function nomMembre(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : null;
}

// Permissions par rôle ("chacun gère le sien", même règle que
// documents-travail/route.ts) : admin gère tout, un non-admin ne gère que
// ce qu'il a lui-même ajouté (un document n'a pas de notion d'assignation).
export function peutGerer(d: DocumentTravail, moiId: string | null, moiRole: string | null): boolean {
  if (moiRole === "admin") return true;
  if (!moiId) return false;
  return d.membre_id === moiId;
}

function IconMore({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
}

function rowStyle(tokens: ThemeTokens, active: boolean): React.CSSProperties {
  return { display: "block", width: "100%", textAlign: "left", background: active ? `${tokens.gold}18` : "none", border: "none", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: active ? 800 : 500, color: active ? tokens.goldD : tokens.t1, cursor: "pointer" };
}

// ─────────────────────────────────────────────────────────────────────────
// Changement rapide de catégorie (item 4/16) — popover court.
// ─────────────────────────────────────────────────────────────────────────
export function CategoryPicker({ open, onClose, anchorRef, tokens, value, onSelect }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; value: string; onSelect: (c: string) => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={160}>
      {CATEGORIES_DOCUMENT_TRAVAIL.map(c => (
        <button key={c.value} onClick={() => { onSelect(c.value); onClose(); }} style={rowStyle(tokens, c.value === value)}>{c.label}</button>
      ))}
    </AgendaPopover>
  );
}

export function DocumentActionsMenu({ open, onClose, anchorRef, tokens, peutGerer: gerable, onPreview, onDownload, onEdit, onDelete }: {
  open: boolean; onClose: () => void; anchorRef: RefObject<HTMLElement | null>; tokens: ThemeTokens; peutGerer: boolean;
  onPreview: () => void; onDownload: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <AgendaPopover open={open} onClose={onClose} anchorRef={anchorRef} tokens={tokens} minWidth={170}>
      <button onClick={() => { onClose(); onPreview(); }} style={rowStyle(tokens, false)}>Aperçu</button>
      <button onClick={() => { onClose(); onDownload(); }} style={rowStyle(tokens, false)}>Télécharger</button>
      {gerable && <button onClick={() => { onClose(); onEdit(); }} style={rowStyle(tokens, false)}>Modifier</button>}
      {gerable && <button onClick={() => { onClose(); onDelete(); }} style={{ ...rowStyle(tokens, false), color: tokens.red, fontWeight: 700 }}>Supprimer</button>}
    </AgendaPopover>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// C — Détails d'un document (item 12) : Drawer, jamais directement
// l'édition — la bibliothèque reste visible derrière.
// ─────────────────────────────────────────────────────────────────────────
export function DocumentDetailsPanel({ open, onClose, doc, membres, projets, peutGerer: gerable, onPreview, onDownload, onEdit, onDeleteRequest, C }: {
  open: boolean; onClose: () => void; doc: DocumentTravail | null; membres: Membre[]; projets: Projet[]; peutGerer: boolean;
  onPreview: () => void; onDownload: () => void; onEdit: () => void; onDeleteRequest: () => void; C: ThemeTokens;
}) {
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Drawer.tsx (primitive partagée Admin+Institution) ne gère pas Echap
  // nativement — ajouté ici, jamais dans le fichier partagé.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !e.defaultPrevented) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!doc) return null;
  const type = fileTypeInfo(doc.type_mime, C);
  const auteur = nomMembre(doc.membre_id, membres);
  const projet = doc.projet_id ? projets.find(p => p.id === doc.projet_id) : null;

  return (
    <Drawer open={open} onClose={onClose} title="Document" width="400px" tokens={{ surface: C.bgCard, border: C.border, text: C.t1, textMuted: C.t3, shadow: C.shadow }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "18px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "8px", backgroundColor: `${type.color}18`, color: type.color, fontSize: "9px", fontWeight: 800, flexShrink: 0 }}>{type.label}</span>
        <div style={{ fontSize: "16px", fontWeight: 800, color: C.t1, wordBreak: "break-word" }}>{doc.nom}</div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
        <span style={{ backgroundColor: `${type.color}15`, color: type.color, fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px" }}>{type.label}</span>
        <span style={{ backgroundColor: C.bg3, color: C.t2, fontSize: "10.5px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px" }}>{categorieLabel(doc.categorie)}</span>
      </div>

      {projet && (
        <>
          <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Projet</div>
          <div style={{ fontSize: "12.5px", color: C.goldD, fontWeight: 700, marginBottom: "16px" }}>{projet.nom}</div>
        </>
      )}

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Ajouté par</div>
      <div style={{ fontSize: "12.5px", color: C.t1, marginBottom: "16px" }}>{auteur || "—"}</div>

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Ajouté le</div>
      <div style={{ fontSize: "12.5px", color: C.t1, marginBottom: "16px" }}>{new Date(doc.uploaded_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>

      <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Taille</div>
      <div style={{ fontSize: "12.5px", color: C.t1, marginBottom: "16px" }}>{formatTaille(doc.taille)}</div>

      {doc.description && (
        <>
          <div style={{ fontSize: "9.5px", fontWeight: 800, color: C.t3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Description</div>
          <div style={{ fontSize: "13px", color: C.t2, lineHeight: 1.5, marginBottom: "16px" }}>{doc.description}</div>
        </>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={onPreview} style={{ flex: 1 }}>Aperçu</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onDownload} style={{ flex: 1 }}>Télécharger</Button>
        </div>
        {gerable && (
          <div style={{ display: "flex", gap: "8px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={onEdit} style={{ flex: 1 }}>Modifier</Button>
            <button ref={menuBtnRef} onClick={() => setMenuOpen(v => !v)} aria-label="Autres actions" style={{ width: "40px", height: "40px", borderRadius: "10px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IconMore color={C.t2}/>
            </button>
            <AgendaPopover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={menuBtnRef} tokens={C} minWidth={150}>
              <button onClick={() => { setMenuOpen(false); onDeleteRequest(); }} style={{ ...rowStyle(C, false), color: C.red, fontWeight: 700 }}>Supprimer</button>
            </AgendaPopover>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Preview (item 11) — PC-first, dialogue centré. PDF/images rendus
// réellement (via le visualiseur natif du navigateur pour le PDF, pas de
// pagination/zoom maison — brancherait PDF.js, hors périmètre de cette
// passe). DOCX/XLSX : jamais de faux aperçu, juste un fallback honnête.
// ─────────────────────────────────────────────────────────────────────────
export function DocumentPreviewDialog({ open, onClose, doc, C }: {
  open: boolean; onClose: () => void; doc: DocumentTravail | null; C: ThemeTokens;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, open, onClose);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !doc) { setUrl(null); setError(false); return; }
    const kind = isPreviewable(doc.type_mime);
    if (!kind) { setUrl(null); return; }
    setLoading(true); setError(false);
    fetch(`/api/institution/documents-travail?preview=${doc.id}`).then(res => res.ok ? res.json() : null).then(j => {
      if (j?.url) setUrl(j.url); else setError(true);
    }).catch(() => setError(true)).finally(() => setLoading(false));
  }, [open, doc]);

  async function download() {
    if (!doc) return;
    const res = await fetch(`/api/institution/documents-travail?download=${doc.id}`);
    const j = await res.json().catch(() => null);
    if (j?.url) window.open(j.url, "_blank");
  }

  if (!open || !doc) return null;
  const kind = isPreviewable(doc.type_mime);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, backgroundColor: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }} onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "16px", width: "100%", maxWidth: "820px", height: "82vh", display: "flex", flexDirection: "column", border: `1px solid ${C.border2}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", outline: "none", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: "13.5px", fontWeight: 800, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.nom}</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, display: "flex", padding: "4px", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.bg, overflow: "hidden" }}>
          {!kind ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: C.t2, marginBottom: "14px" }}>Aperçu indisponible pour ce type de fichier.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" onClick={download}>Télécharger le document</Button>
            </div>
          ) : loading ? (
            <span style={{ fontSize: "12px", color: C.t3 }}>Chargement de l&apos;aperçu…</span>
          ) : error || !url ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: C.red, marginBottom: "14px" }}>Impossible de charger l&apos;aperçu.</div>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={download}>Télécharger le document</Button>
            </div>
          ) : kind === "pdf" ? (
            <iframe src={url} title={doc.nom} style={{ width: "100%", height: "100%", border: "none" }}/>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- IMG-EXCEPTION: URL Storage signée courte-vécue, jamais un asset next/image | reviewed=2026-09-20
            <img src={url} alt={doc.nom} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}/>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 18px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={download}>Télécharger</Button>
        </div>
      </div>
    </div>
  );
}
