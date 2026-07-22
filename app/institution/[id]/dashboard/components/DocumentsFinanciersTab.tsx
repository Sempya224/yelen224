"use client";

// Documents financiers du comptable — factures/reçus/avoirs/justificatifs/
// bordereaux uploadés à la main, même table que l'espace de travail
// (documents_travail) mais route et onglet dédiés (le comptable n'a pas
// accès à l'espace de travail).
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { CATEGORIES_DOCUMENT_TRAVAIL, CATEGORIES_FINANCIERES, type CategorieDocumentTravail } from "@/lib/documentsTravail";

type DocumentFinancier = {
  id: string; nom: string; description: string | null; categorie: CategorieDocumentTravail;
  taille: number; type_mime: string; membre_id: string; uploaded_at: string;
};

const LABELS = new Map(CATEGORIES_DOCUMENT_TRAVAIL.map(c => [c.value, c.label]));

function formatTaille(o: number): string {
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }

export function DocumentsFinanciersTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [documents, setDocuments] = useState<DocumentFinancier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categorie, setCategorie] = useState<CategorieDocumentTravail>("facture");
  const [nomFichier, setNomFichier] = useState<File | null>(null);
  const nomFichierInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/documents-financiers");
    const j = await res.json().catch(() => null);
    setDocuments(res.ok ? (j?.documents ?? []) : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  async function upload() {
    if (!nomFichier) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", nomFichier);
    fd.append("categorie", categorie);
    const res = await fetch("/api/institution/documents-financiers", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setUploading(false);
    if (!res.ok) { onToast(j?.error || "Erreur d'envoi", C.red); return; }
    onToast("Document ajouté", C.green);
    setShowUpload(false); setNomFichier(null);
    load();
  }

  async function telecharger(id: string) {
    const res = await fetch(`/api/institution/documents-financiers?download=${id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast("Erreur de téléchargement", C.red); return; }
    window.open(j.url, "_blank");
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/institution/documents-financiers?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    onToast("Document supprimé", C.orange);
    load();
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Documents financiers</h1>
        <button onClick={() => setShowUpload(true)} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "9px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Ajouter</button>
      </div>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Factures, reçus, avoirs, justificatifs, bordereaux.</p>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/></div>
      ) : documents.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "40px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucun document pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {documents.map(d => (
            <div key={d.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</div>
                <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>{LABELS.get(d.categorie) ?? d.categorie} · {formatTaille(d.taille)} · {formatDate(d.uploaded_at)}</div>
              </div>
              <button onClick={() => telecharger(d.id)} className="tap" style={{ width: "32px", height: "32px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button onClick={() => supprimer(d.id)} className="tap" style={{ width: "32px", height: "32px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <div className="doc-fin-overlay" onClick={() => setShowUpload(false)} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <style>{`
            @media(min-width:1024px){
              .doc-fin-overlay{align-items:center!important}
              .doc-fin-panel{max-width:520px!important;border-radius:20px!important}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="doc-fin-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px" }}>
            <div style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "14px" }}>Ajouter un document</div>
            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Catégorie</label>
            <select value={categorie} onChange={e => setCategorie(e.target.value as CategorieDocumentTravail)} style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px", fontSize: "13px", color: C.t1, marginBottom: "12px" }}>
              {CATEGORIES_FINANCIERES.map(v => <option key={v} value={v}>{LABELS.get(v)}</option>)}
            </select>
            <label style={{ display: "block", color: C.t3, fontSize: "10px", fontWeight: "800", textTransform: "uppercase", marginBottom: "6px" }}>Fichier</label>
            <input ref={nomFichierInputRef} type="file" onChange={e => setNomFichier(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
            <button
              type="button"
              onClick={() => nomFichierInputRef.current?.click()}
              className="tap"
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: C.bg3, border: `1.5px dashed ${C.border2}`, color: C.t1, fontWeight: "700", fontSize: "13px", padding: "12px", borderRadius: "10px", cursor: "pointer", marginBottom: "8px" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              {nomFichier ? "Changer le fichier" : "Ajouter un fichier"}
            </button>
            {nomFichier && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <div style={{ flex: 1, color: C.t2, fontSize: "12px", wordBreak: "break-all" }}>{nomFichier.name}</div>
                <button
                  type="button"
                  onClick={() => { setNomFichier(null); if (nomFichierInputRef.current) nomFichierInputRef.current.value = ""; }}
                  className="tap"
                  aria-label="Retirer le fichier"
                  style={{ width: "24px", height: "24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "50%", cursor: "pointer" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button onClick={() => setShowUpload(false)} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t2, fontWeight: "700", fontSize: "13px", padding: "13px", borderRadius: "10px", cursor: "pointer" }}>Annuler</button>
              <button onClick={upload} disabled={uploading || !nomFichier} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "13px", padding: "13px", borderRadius: "10px", border: "none", cursor: "pointer", opacity: uploading || !nomFichier ? 0.5 : 1 }}>{uploading ? "…" : "Envoyer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
