"use client";

// Documents financiers — "Financial Document Center" (refonte niveau US,
// brief CEO 06/08/2026, instruction #11). Périmètre fonctionnel INCHANGÉ :
// même table (documents_travail, filtrée aux 5 catégories financières),
// même bucket Storage privé "documents-travail", mêmes routes API — aucun
// champ, aucune colonne, aucune fonctionnalité nouvelle. Uniquement la
// présentation change.
//
// Le brief mockait des colonnes/KPI qui n'existent pas dans le modèle réel
// (Montant, Citoyen, Statut valide/en attente/annulé, "documents archivés")
// — documents_travail est une bibliothèque de fichiers uploadés à la main
// par le staff, sans montant, sans lien citoyen, sans workflow de
// validation/archivage. Plutôt que d'inventer ces données (interdit par le
// protocole projet), substitutions honnêtes faites sur des champs réels :
// - "Montant" → Taille du fichier (déjà en base, déjà pertinent pour un
//   document).
// - "Citoyen" → "Ajouté par" (membre_id → nom, même pattern que
//   espace-travail/components/DocumentsSection.tsx).
// - "Statut" (vert/orange/rouge/bleu) → badge de Type/catégorie coloré
//   (donnée réelle categorie, pas un état inventé).
// - KPI "En attente" → "Cette semaine" (documents ajoutés sur 7 jours,
//   réel). KPI "Archivés" → "Catégories utilisées" (x/5 catégories
//   financières réellement représentées, réel).
// - "Référence" → code d'affichage dérivé de l'id réel du document
//   (DOC-XXXXXXXX), jamais stocké, purement une mise en forme de la clé
//   déjà existante — pas une nouvelle donnée métier.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { CATEGORIES_DOCUMENT_TRAVAIL, CATEGORIES_FINANCIERES, type CategorieDocumentTravail } from "@/lib/documentsTravail";
import { YelenLoader } from "@/components/YelenLoader";

type DocumentFinancier = {
  id: string; nom: string; description: string | null; categorie: CategorieDocumentTravail;
  taille: number; type_mime: string; membre_id: string; uploaded_at: string;
};
type Membre = { id: string; prenom: string; nom: string };

const LABELS = new Map(CATEGORIES_DOCUMENT_TRAVAIL.map(c => [c.value, c.label]));

const BADGE_COULEUR: Record<string, (C: ThemeTokens) => string> = {
  facture: C => C.blue,
  recu: C => C.green,
  avoir: C => C.orange,
  bordereau: C => C.purple,
  justificatif: C => C.teal,
};

const ONGLETS: { id: string; label: string; categorie: CategorieDocumentTravail | null }[] = [
  { id: "tous", label: "Tous", categorie: null },
  { id: "facture", label: "Factures", categorie: "facture" },
  { id: "recu", label: "Reçus", categorie: "recu" },
  { id: "avoir", label: "Avoirs", categorie: "avoir" },
  { id: "justificatif", label: "Justificatifs", categorie: "justificatif" },
  { id: "bordereau", label: "Bordereaux", categorie: "bordereau" },
];

function formatTaille(o: number): string {
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}
function formatDate(iso: string): string { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }); }
function formatDateHeure(iso: string): string { return formatDate(iso) + " à " + new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
function refCourte(id: string): string { return "DOC-" + id.replace(/-/g, "").slice(0, 8).toUpperCase(); }
function nomMembre(membreId: string, membres: Membre[]): string {
  const m = membres.find(m => m.id === membreId);
  return m ? `${m.prenom} ${m.nom}` : "—";
}

// ── Icône de fichier (SVG trait, jamais d'emoji — /regles-ux-ui) ──
function IconFichier({ mime, color }: { mime: string; color: string }) {
  if (mime.startsWith("image/")) {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  }
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function couleurMime(mime: string, C: ThemeTokens): string {
  if (mime === "application/pdf") return C.red;
  if (mime.includes("word")) return C.blue;
  if (mime.includes("sheet") || mime.includes("excel")) return C.green;
  if (mime.startsWith("image/")) return C.purple;
  return C.t3;
}

// ── KPI documentaires (§5) — 4 cartes, réelles, jamais nulles/inventées ──
function KpiCard({ label, valeur, color, C }: { label: string; valeur: string; color: string; C: ThemeTokens }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{label}</div>
      <div style={{ color, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.4px" }}>{valeur}</div>
    </div>
  );
}

// ── Empty state premium (§8) ──
function EmptyState({ onRefresh, C }: { onRefresh: () => void; C: ThemeTokens }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "18px", padding: "48px 24px", textAlign: "center" }}>
      <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${C.gold}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
      </div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "8px" }}>Aucun document financier disponible</div>
      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.7, maxWidth: "340px", margin: "0 auto 18px" }}>
        Les documents générés automatiquement apparaîtront ici. Vous pourrez ensuite les rechercher, les consulter, les imprimer ou les télécharger.
      </div>
      <button onClick={onRefresh} className="tap" style={{ backgroundColor: C.bg3, border: `1px solid ${C.border2}`, color: C.t1, fontWeight: "700", fontSize: "12.5px", padding: "10px 18px", borderRadius: "10px", cursor: "pointer" }}>Actualiser</button>
    </div>
  );
}

export function DocumentsFinanciersTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [documents, setDocuments] = useState<DocumentFinancier[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [moiId, setMoiId] = useState<string | null>(null);
  const [moiRole, setMoiRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ongletActif, setOngletActif] = useState("tous");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categorie, setCategorie] = useState<CategorieDocumentTravail>("facture");
  const [nomFichier, setNomFichier] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const nomFichierInputRef = useRef<HTMLInputElement>(null);
  const iframeImpressionRef = useRef<HTMLIFrameElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/institution/documents-financiers");
    const j = await res.json().catch(() => null);
    setDocuments(res.ok ? (j?.documents ?? []) : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [instId]);

  useEffect(() => {
    fetch("/api/institution/membres").then(res => res.ok ? res.json() : null).then(j => {
      if (!j) return;
      setMembres(j.membres ?? []);
      setMoiId(j.membreId ?? null);
      setMoiRole(j.role ?? null);
    });
  }, [instId]);

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

  async function obtenirUrlSignee(id: string): Promise<string | null> {
    const res = await fetch(`/api/institution/documents-financiers?download=${id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast("Erreur de téléchargement", C.red); return null; }
    return j.url as string;
  }

  async function voir(d: DocumentFinancier) {
    setBusyId(d.id);
    const url = await obtenirUrlSignee(d.id);
    setBusyId(null);
    if (url) window.open(url, "_blank");
  }

  // Téléchargement forcé — l'URL Storage étant cross-origin, un simple
  // <a download> serait ignoré par le navigateur ; on récupère les octets
  // et on force via un blob local.
  async function telecharger(d: DocumentFinancier) {
    setBusyId(d.id);
    const url = await obtenirUrlSignee(d.id);
    if (!url) { setBusyId(null); return; }
    const blob = await fetch(url).then(r => r.blob()).catch(() => null);
    setBusyId(null);
    if (!blob) { onToast("Erreur de téléchargement", C.red); return; }
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl; a.download = d.nom;
    a.click();
    URL.revokeObjectURL(objUrl);
  }

  async function imprimerDocument(d: DocumentFinancier) {
    setBusyId(d.id);
    const url = await obtenirUrlSignee(d.id);
    setBusyId(null);
    if (!url || !iframeImpressionRef.current) return;
    const iframe = iframeImpressionRef.current;
    iframe.onload = () => { try { iframe.contentWindow?.print(); } catch { onToast("Impossible d'imprimer ce document", C.red); } };
    iframe.src = url;
  }

  async function supprimer(id: string) {
    const res = await fetch(`/api/institution/documents-financiers?id=${id}`, { method: "DELETE" });
    if (!res.ok) { onToast("Erreur de suppression", C.red); return; }
    onToast("Document supprimé", C.orange);
    load();
  }

  function peutSupprimer(d: DocumentFinancier): boolean {
    return moiRole === "admin" || d.membre_id === moiId;
  }

  const filtres = useMemo(() => {
    const onglet = ONGLETS.find(o => o.id === ongletActif) ?? ONGLETS[0];
    const q = search.trim().toLowerCase();
    return documents
      .filter(d => onglet.categorie === null || d.categorie === onglet.categorie)
      .filter(d => !q || d.nom.toLowerCase().includes(q) || (LABELS.get(d.categorie) ?? "").toLowerCase().includes(q) || refCourte(d.id).toLowerCase().includes(q) || nomMembre(d.membre_id, membres).toLowerCase().includes(q));
  }, [documents, ongletActif, search, membres]);

  const kpis = useMemo(() => {
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const il7j = new Date(now.getTime() - 7 * 86400000);
    const ceMois = documents.filter(d => new Date(d.uploaded_at) >= debutMois).length;
    const cetteSemaine = documents.filter(d => new Date(d.uploaded_at) >= il7j).length;
    const categoriesUtilisees = new Set(documents.map(d => d.categorie)).size;
    return { total: documents.length, ceMois, cetteSemaine, categoriesUtilisees };
  }, [documents]);

  const dernierDocument = documents[0] ?? null;

  function exporterCsv() {
    const header = ["Document", "Type", "Référence", "Ajouté par", "Taille", "Date"];
    const rows = filtres.map(d => [d.nom, LABELS.get(d.categorie) ?? d.categorie, refCourte(d.id), nomMembre(d.membre_id, membres), formatTaille(d.taille), formatDate(d.uploaded_at)]);
    const csv = "﻿" + [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `documents-financiers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div id="print-area-docfin" style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        @media print {
          body > *:not(#print-area-docfin) { display: none !important; }
          .no-print { display: none !important; }
        }
        @media(min-width:1024px){
          .docfin-row{display:grid!important;grid-template-columns:2.2fr 1fr 1fr 1fr 0.9fr 1fr auto;align-items:center;gap:12px;padding:12px 16px!important}
          .docfin-desktop-only{display:block!important}
          .docfin-mobile-only{display:none!important}
          .docfin-row-actions{margin-top:0!important;justify-content:flex-end!important}
        }
      `}</style>
      {/* iframe cachée pour l'impression par document (§7), jamais affichée */}
      <iframe ref={iframeImpressionRef} style={{ display: "none" }} title="Impression document"/>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "6px" }}>
        <div>
          <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "6px" }}>Documents financiers</h1>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5, maxWidth: "440px" }}>Centralisez tous les documents financiers générés par votre établissement.</p>
          <p style={{ color: C.t3, fontSize: "11.5px", marginTop: "4px", fontWeight: 600 }}>Factures · Reçus · Avoirs · Bordereaux · Justificatifs</p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => setShowUpload(true)} className="tap" style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.goldD})`, color: "#000", fontWeight: "800", fontSize: "12px", padding: "10px 14px", borderRadius: "10px", border: "none", cursor: "pointer" }}>+ Ajouter</button>
          <button onClick={exporterCsv} disabled={filtres.length === 0} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 13px", fontSize: "12px", fontWeight: "700", color: C.t2, cursor: filtres.length === 0 ? "not-allowed" : "pointer", opacity: filtres.length === 0 ? 0.5 : 1 }}>Exporter</button>
          <button onClick={() => window.print()} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 13px", fontSize: "12px", fontWeight: "700", color: C.t2, cursor: "pointer" }}>Imprimer</button>
        </div>
      </div>

      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "12px 16px", margin: "14px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800" }}>{kpis.total} document{kpis.total > 1 ? "s" : ""}</span>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: "600" }}>
          {dernierDocument ? <>Dernière mise à jour · {formatDateHeure(dernierDocument.uploaded_at)}</> : "Aucune mise à jour pour l'instant"}
        </span>
      </div>

      {/* KPI documentaires (§5) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <KpiCard label="Documents" valeur={String(kpis.total)} color={C.t1} C={C}/>
        <KpiCard label="Ce mois" valeur={String(kpis.ceMois)} color={C.gold} C={C}/>
        <KpiCard label="Cette semaine" valeur={String(kpis.cetteSemaine)} color={C.blue} C={C}/>
        <KpiCard label="Catégories utilisées" valeur={`${kpis.categoriesUtilisees}/${CATEGORIES_FINANCIERES.length}`} color={C.purple} C={C}/>
      </div>

      {/* Recherche (§3) + filtres (§4) */}
      <div className="no-print" style={{ position: "relative", marginBottom: "10px" }}>
        <div style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: C.t3, pointerEvents: "none" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un document, une référence, un ajout par…" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "11px 12px 11px 36px", fontSize: "13px", color: C.t1, boxSizing: "border-box" }}/>
      </div>
      <div className="no-print" style={{ display: "flex", gap: "7px", marginBottom: "16px", overflowX: "auto" }}>
        {ONGLETS.map(o => (
          <button key={o.id} onClick={() => setOngletActif(o.id)} className="tap" style={{ flexShrink: 0, backgroundColor: ongletActif === o.id ? `${C.gold}15` : C.bgCard, border: `1px solid ${ongletActif === o.id ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "7px 13px", color: ongletActif === o.id ? C.gold : C.t2, fontSize: "11.5px", fontWeight: ongletActif === o.id ? 800 : 600, cursor: "pointer", transition: "all 0.15s ease" }}>
            {o.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}><YelenLoader size={28}/></div>
      ) : documents.length === 0 ? (
        <EmptyState onRefresh={load} C={C}/>
      ) : filtres.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "32px 20px", textAlign: "center", color: C.t2, fontSize: "13px" }}>Aucun résultat pour cette recherche/filtre.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="no-print docfin-row" style={{ display: "none", padding: "0 16px" }}>
            {["Document", "Type", "Référence", "Ajouté par", "Taille", "Date", ""].map(h => (
              <span key={h} style={{ color: C.t3, fontSize: "9.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3px" }}>{h}</span>
            ))}
          </div>
          {filtres.map(d => {
            const couleurType = (BADGE_COULEUR[d.categorie] ?? (() => C.t3))(C);
            const auteur = nomMembre(d.membre_id, membres);
            const occupe = busyId === d.id;
            return (
              <div key={d.id} className="docfin-row" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", transition: "box-shadow 0.15s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <div style={{ width: "34px", height: "34px", borderRadius: "9px", backgroundColor: `${couleurMime(d.type_mime, C)}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IconFichier mime={d.type_mime} color={couleurMime(d.type_mime, C)}/>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nom}</div>
                    <div className="docfin-mobile-only" style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>{formatTaille(d.taille)}</div>
                  </div>
                </div>

                <div style={{ marginTop: "8px" }}>
                  <span style={{ color: couleurType, fontSize: "10px", fontWeight: "800", backgroundColor: `${couleurType}15`, padding: "3px 9px", borderRadius: "20px", whiteSpace: "nowrap" }}>{LABELS.get(d.categorie) ?? d.categorie}</span>
                </div>

                <div style={{ color: C.t2, fontSize: "11px", fontWeight: "700", marginTop: "8px", fontFamily: "monospace" }}>{refCourte(d.id)}</div>

                <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "600", marginTop: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auteur}</div>

                <div className="docfin-desktop-only" style={{ display: "none", color: C.t2, fontSize: "11.5px", marginTop: "8px" }}>{formatTaille(d.taille)}</div>

                <div style={{ color: C.t3, fontSize: "11px", marginTop: "8px", whiteSpace: "nowrap" }}>{formatDate(d.uploaded_at)}</div>

                <div className="docfin-row-actions" style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                  <button onClick={() => voir(d)} disabled={occupe} className="tap" aria-label="Voir" title="Voir" style={{ width: "32px", height: "32px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {occupe ? <YelenLoader size={13}/> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                  <button onClick={() => telecharger(d)} disabled={occupe} className="tap" aria-label="Télécharger" title="Télécharger" style={{ width: "32px", height: "32px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                  <button onClick={() => imprimerDocument(d)} disabled={occupe} className="tap" aria-label="Imprimer" title="Imprimer" style={{ width: "32px", height: "32px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  </button>
                  {peutSupprimer(d) && (
                    <button onClick={() => supprimer(d.id)} className="tap" aria-label="Supprimer" title="Supprimer" style={{ width: "32px", height: "32px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
