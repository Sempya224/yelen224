"use client";

// Documents de travail internes — refonte 20/07/2026 : tableau dense
// triable (choix validé par Bryan, style "console de gestion documentaire"
// plutôt qu'une grille de vignettes) — colonnes Nom/Catégorie/Taille/
// Ajouté par/Date/Actions. Bucket Storage dédié "documents-travail"
// (privé), téléchargement uniquement via URL signée à courte durée de vie
// (jamais d'URL publique). Le flux d'upload s'arrête après sélection du
// fichier pour laisser nommer/annoter avant l'envoi réel.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../../dashboard/theme";
import { CATEGORIES_DOCUMENT_TRAVAIL, MAX_DOCUMENT_TRAVAIL_SIZE } from "@/lib/documentsTravail";

type Document = { id: string; nom: string; description: string | null; categorie: string; taille: number | null; type_mime: string | null; membre_id: string | null; uploaded_at: string };
type Membre = { id: string; prenom: string; nom: string };
type SortKey = "nom" | "categorie" | "taille" | "membre" | "date";

const COLONNES: { key: SortKey; label: string }[] = [
  { key: "nom", label: "Nom" },
  { key: "categorie", label: "Catégorie" },
  { key: "taille", label: "Taille" },
  { key: "membre", label: "Ajouté par" },
  { key: "date", label: "Date" },
];

function formatTaille(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileIcon(mime: string | null, C: ThemeTokens): { emoji: string; color: string } {
  if (!mime) return { emoji: "📄", color: C.t3 };
  if (mime === "application/pdf") return { emoji: "📕", color: C.red };
  if (mime.includes("word")) return { emoji: "📘", color: C.blue };
  if (mime.includes("sheet") || mime.includes("excel")) return { emoji: "📗", color: C.green };
  if (mime.startsWith("image/")) return { emoji: "🖼️", color: C.purple };
  return { emoji: "📄", color: C.t3 };
}

function nomMembre(membreId: string | null, membres: Membre[]): string | null {
  if (!membreId) return null;
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : null;
}

export function DocumentsSection({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<string>("tous");
  const [recherche, setRecherche] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/institution/documents-travail");
    const j = await res.json().catch(() => null);
    setDocuments(res.ok ? (j?.documents ?? []) : []);
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

  // Permissions par rôle ("chacun ne gère que le sien") — un document n'a
  // pas de notion d'assignation, seulement d'auteur (membre_id = uploadé
  // par, voir documents-travail/route.ts). Reflet côté client de la même
  // règle appliquée côté serveur.
  function peutSupprimer(d: Document): boolean {
    return moiRole === "admin" || d.membre_id === moiId;
  }

  function handleFileChosen(file: File) {
    if (file.size > MAX_DOCUMENT_TRAVAIL_SIZE) { onToast("Fichier trop volumineux (20 Mo max)", C.red); return; }
    setPendingFile(file);
  }

  async function telecharger(doc: Document) {
    const res = await fetch(`/api/institution/documents-travail?download=${doc.id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.url) { onToast("Erreur de téléchargement", C.red); return; }
    window.open(j.url, "_blank");
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/institution/documents-travail?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    setDocuments(prev => prev.filter(d => d.id !== id));
    onToast("Document supprimé", C.orange);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return; }
    setSortKey(key);
    setSortDir(key === "date" || key === "taille" ? "desc" : "asc");
  }

  const filteredSorted = useMemo(() => {
    const filtered = documents
      .filter(d => filtre === "tous" || d.categorie === filtre)
      .filter(d => !recherche.trim() || d.nom.toLowerCase().includes(recherche.trim().toLowerCase()));
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case "nom": return dir * a.nom.localeCompare(b.nom);
        case "categorie": return dir * a.categorie.localeCompare(b.categorie);
        case "taille": return dir * ((a.taille ?? 0) - (b.taille ?? 0));
        case "membre": return dir * (nomMembre(a.membre_id, membres) ?? "").localeCompare(nomMembre(b.membre_id, membres) ?? "");
        case "date": return dir * (new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
        default: return 0;
      }
    });
  }, [documents, filtre, recherche, sortKey, sortDir, membres]);

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <div style={{ flex: 1, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un document…" style={{ flex: 1, padding: "10px 0", fontSize: "13px", background: "transparent", border: "none", color: C.t1 }}/>
        </div>
        <button onClick={() => fileInput.current?.click()} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "0 18px", borderRadius: "10px", border: "none", cursor: "pointer", flexShrink: 0 }}>+ Ajouter</button>
        <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChosen(f); e.target.value = ""; }}/>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", overflowX: "auto" }}>
        <button onClick={() => setFiltre("tous")} style={{ flexShrink: 0, backgroundColor: filtre === "tous" ? `${C.gold}20` : C.bgCard, border: `1px solid ${filtre === "tous" ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "6px 12px", color: filtre === "tous" ? C.gold : C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>Tous</button>
        {CATEGORIES_DOCUMENT_TRAVAIL.map(c => (
          <button key={c.value} onClick={() => setFiltre(c.value)} style={{ flexShrink: 0, backgroundColor: filtre === c.value ? `${C.gold}20` : C.bgCard, border: `1px solid ${filtre === c.value ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "6px 12px", color: filtre === c.value ? C.gold : C.t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>{c.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "40px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "24px", height: "24px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "espace-spin 0.8s linear infinite" }}/>
        </div>
      ) : filteredSorted.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "16px", padding: "48px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>📁</div>
          <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>{documents.length === 0 ? "Aucun document pour l'instant" : "Aucun résultat"}</div>
          <p style={{ color: C.t3, fontSize: "12px", marginBottom: documents.length === 0 ? "16px" : "0" }}>
            {documents.length === 0 ? "Centralisez vos contrats, PV, modèles et factures ici." : "Essayez une autre recherche ou catégorie."}
          </p>
          {documents.length === 0 && (
            <button onClick={() => fileInput.current?.click()} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "10px 18px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Ajouter un document</button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: "auto", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px" }}>
          <div style={{ minWidth: "720px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 150px 100px 150px", gap: "8px", padding: "11px 16px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg3 }}>
              {COLONNES.map(col => (
                <div key={col.key} onClick={() => toggleSort(col.key)} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {col.label}
                  {sortKey === col.key && <span style={{ color: C.gold, fontSize: "9px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </div>
              ))}
              <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</div>
            </div>
            {filteredSorted.map((d, i, arr) => {
              const icon = fileIcon(d.type_mime, C);
              const auteur = nomMembre(d.membre_id, membres);
              return (
                <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 150px 100px 150px", gap: "8px", alignItems: "center", padding: "11px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
                    <span style={{ fontSize: "15px", flexShrink: 0 }}>{icon.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "12.5px", fontWeight: "700", color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</div>
                      {d.description && <div style={{ color: C.t3, fontSize: "10.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.description}</div>}
                    </div>
                  </div>
                  <span style={{ color: C.t2, fontSize: "11.5px" }}>{CATEGORIES_DOCUMENT_TRAVAIL.find(c => c.value === d.categorie)?.label}</span>
                  <span style={{ color: C.t3, fontSize: "11.5px" }}>{formatTaille(d.taille)}</span>
                  <span style={{ color: C.t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auteur || "—"}</span>
                  <span style={{ color: C.t3, fontSize: "11.5px" }}>{new Date(d.uploaded_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                    <button onClick={() => telecharger(d)} style={{ backgroundColor: `${C.blue}12`, border: `1px solid ${C.blue}30`, color: C.blue, fontSize: "10.5px", fontWeight: "700", padding: "6px 10px", borderRadius: "8px", cursor: "pointer", flexShrink: 0 }}>Télécharger</button>
                    {peutSupprimer(d) ? (
                      <button onClick={() => supprimer(d.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                      </button>
                    ) : (
                      <span title="Seul l'auteur ou un administrateur peut supprimer ce document" style={{ color: C.t3, fontSize: "12px", flexShrink: 0 }}>🔒</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingFile && (
        <UploadModal C={C} file={pendingFile} onClose={() => setPendingFile(null)} onUploaded={() => { setPendingFile(null); onToast("Document ajouté", C.green); load(); }} onToast={onToast}/>
      )}
    </div>
  );
}

function UploadModal({ C, file, onClose, onUploaded, onToast }: {
  C: ThemeTokens; file: File; onClose: () => void; onUploaded: () => void; onToast: (msg: string, color?: string) => void;
}) {
  const defaultNom = file.name.replace(/\.[^/.]+$/, "");
  const [nom, setNom] = useState(defaultNom);
  const [categorie, setCategorie] = useState<string>("autre");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  async function envoyer() {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("nom", nom.trim() || file.name);
    fd.append("categorie", categorie);
    fd.append("description", description);
    const res = await fetch("/api/institution/documents-travail", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setUploading(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    onUploaded();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "20px", width: "100%", maxWidth: "480px" }}>
        <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "4px" }}>Ajouter ce document</div>
        <div style={{ color: C.t3, fontSize: "11px", marginBottom: "14px" }}>{file.name} · {formatTaille(file.size)}</div>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Nom du document</div>
        <input value={nom} onChange={e => setNom(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", marginBottom: "10px", color: C.t1 }}/>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Catégorie</div>
        <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", marginBottom: "10px", color: C.t1 }}>
          {CATEGORIES_DOCUMENT_TRAVAIL.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", marginBottom: "5px" }}>Note (optionnel)</div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Ajouter une note sur ce document…" rows={3} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "12px", marginBottom: "16px", color: C.t1, resize: "none" }}/>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button onClick={onClose} disabled={uploading} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "12.5px", padding: "11px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
          <button onClick={envoyer} disabled={uploading || !nom.trim()} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12.5px", padding: "11px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: uploading || !nom.trim() ? 0.5 : 1 }}>
            {uploading ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
