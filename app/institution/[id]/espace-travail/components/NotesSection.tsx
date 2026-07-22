"use client";

// Onglet Notes de l'Espace de travail (spec CEO, 18/07/2026) — liste de
// cartes (titre, aperçu tronqué, dates), lecture ouverte à toute l'équipe,
// écriture réservée à l'auteur ou à un admin (décision Bryan/CEO). Même
// architecture visuelle que ProjetsSection.tsx.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../../dashboard/theme";
import { TYPES_NOTE } from "@/lib/projetsNotes";

type Note = { id: string; titre: string; contenu: string; type: string; membre_id: string | null; created_at: string; updated_at: string };
type Membre = { id: string; prenom: string; nom: string };

function typeColor(t: string, C: ThemeTokens): string {
  if (t === "rappel_admin") return C.red;
  if (t === "consigne_equipe") return C.purple;
  if (t === "idee_interne") return C.teal;
  if (t === "info_client") return C.blue;
  return C.gold;
}

function apercu(contenu: string): string {
  const clean = contenu.trim();
  return clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
}

export function NotesSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [notes, setNotes] = useState<Note[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Note | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/institution/notes");
    const j = await res.json().catch(() => null);
    setNotes(res.ok ? (j?.notes ?? []) : []);
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

  function nomAuteur(membreId: string | null): string {
    if (!membreId) return "Inconnu";
    const m = membres.find(m => m.id === membreId);
    return m ? `${m.prenom} ${m.nom}` : "Inconnu";
  }

  // Permissions : lecture ouverte à toute l'équipe, écriture réservée à
  // l'auteur ou à un admin (même règle que côté serveur, notes/route.ts).
  function peutGerer(n: Note): boolean {
    return moiRole === "admin" || n.membre_id === moiId;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <button onClick={() => setModal("new")} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "9px 16px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Note</button>
      </div>

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "24px", height: "24px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "espace-spin 0.8s linear infinite" }}/>
        </div>
      ) : notes.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", padding: "48px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>🗒️</div>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>Aucune note pour l'instant</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: "16px" }}>Consignez les infos importantes pour toute l'équipe.</p>
          <button onClick={() => setModal("new")} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Créer une note</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {notes.map(n => {
            const verrouille = !peutGerer(n);
            return (
              <div key={n.id} onClick={() => setModal(n)} style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border}`, borderLeft: `3px solid ${typeColor(n.type, C)}`, padding: "14px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: "800" }}>{n.titre}</span>
                  {verrouille && <span title="Seul l'auteur ou un administrateur peut modifier cette note" style={{ color: C.t3, fontSize: "11px", flexShrink: 0 }}>🔒</span>}
                </div>
                {n.contenu && <div style={{ color: C.t2, fontSize: "12px", marginBottom: "8px" }}>{apercu(n.contenu)}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: typeColor(n.type, C), fontSize: "9.5px", fontWeight: "800", backgroundColor: `${typeColor(n.type, C)}15`, padding: "2px 8px", borderRadius: "20px" }}>{TYPES_NOTE.find(t => t.value === n.type)?.label}</span>
                  <span style={{ color: C.goldD, fontSize: "10.5px", fontWeight: "700" }}>{nomAuteur(n.membre_id)}</span>
                  <span style={{ color: C.t3, fontSize: "10.5px" }}>Modifiée le {new Date(n.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <NoteModal
          key={modal === "new" ? "new" : modal.id}
          C={C}
          note={modal === "new" ? null : modal}
          readOnly={modal !== "new" && !peutGerer(modal)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

function NoteModal({ C, note, readOnly, onClose, onSaved, onToast }: {
  C: ThemeTokens; note: Note | null; readOnly?: boolean; onClose: () => void; onSaved: () => void; onToast: (msg: string, color?: string) => void;
}) {
  const [titre, setTitre] = useState(note?.titre || "");
  const [contenu, setContenu] = useState(note?.contenu || "");
  const [type, setType] = useState(note?.type || "info_importante");
  const [saving, setSaving] = useState(false);

  async function enregistrer() {
    if (!titre.trim()) return;
    setSaving(true);
    const body = { titre, contenu, type };
    const res = note
      ? await fetch("/api/institution/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: note.id, ...body }) })
      : await fetch("/api/institution/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { onToast("Erreur d'enregistrement", C.red); return; }
    onToast(note ? "Note modifiée" : "Note créée", C.green);
    onSaved();
  }

  async function supprimer() {
    if (!note) return;
    setSaving(true);
    await fetch(`/api/institution/notes?id=${note.id}`, { method: "DELETE" });
    setSaving(false);
    onToast("Note supprimée", C.orange);
    onSaved();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "20px", width: "100%", maxWidth: "500px", maxHeight: "88svh", overflowY: "auto" }}>
        <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "14px" }}>{note ? "Modifier la note" : "Nouvelle note"}</div>
        {readOnly && (
          <div style={{ backgroundColor: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", color: C.orange, fontWeight: "600", marginBottom: "12px" }}>
            🔒 Seul l'auteur ou un administrateur peut modifier cette note.
          </div>
        )}
        <input disabled={readOnly} value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "8px", color: C.t1, opacity: readOnly ? 0.6 : 1 }}/>
        <select disabled={readOnly} value={type} onChange={e => setType(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px", fontSize: "12px", color: C.t1, marginBottom: "8px", opacity: readOnly ? 0.6 : 1 }}>
          {TYPES_NOTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <textarea disabled={readOnly} value={contenu} onChange={e => setContenu(e.target.value)} placeholder="Contenu de la note…" rows={8} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", marginBottom: "16px", color: C.t1, resize: "vertical", opacity: readOnly ? 0.6 : 1 }}/>
        <div style={{ display: "grid", gridTemplateColumns: readOnly ? "1fr" : note ? "auto 1fr 1fr" : "1fr 1fr", gap: "8px" }}>
          {note && !readOnly && <button onClick={supprimer} disabled={saving} style={{ backgroundColor: C.redL, color: C.red, fontWeight: "700", fontSize: "12.5px", padding: "11px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Suppr.</button>}
          <button onClick={onClose} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>{readOnly ? "Fermer" : "Annuler"}</button>
          {!readOnly && (
            <button onClick={enregistrer} disabled={saving || !titre.trim()} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: saving || !titre.trim() ? 0.5 : 1 }}>
              {saving ? "…" : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
