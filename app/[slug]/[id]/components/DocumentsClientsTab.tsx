"use client";

// Documents clients — refonte case management (Lots 2-3, décision CEO
// 09/08/2026, niveau "Enterprise/US" déjà établi sur SignalementsTab.tsx/
// ClockInShiftTab.tsx dans cette même session). Remplace la liste plate à
// bouton télécharger unique par une vraie boîte de réception (KPI,
// recherche, filtres, tableau/cards) + fiche (infos + historique d'audit
// document_events + workflow Commencer la vérification/Valider/Refuser/
// Archiver, Lot 3). Aucune permission distincte à gérer ici : le tab
// "documents-clients" n'a que 2 niveaux (full/none, pas de "read"), donc
// tout rôle qui voit cet écran peut agir — le serveur reste seul juge
// réel via can(role, "documents_clients.verify"/"archive"). Patterns
// (KpiCard/Sparkline/Delta, bottom-sheet/dialogue centré, polling
// silencieux, illustrations d'état vide sur mesure, modales d'action)
// répliqués localement à l'identique de SignalementsTab.tsx — aucune
// librairie de charts, convention confirmée du projet.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "./FormField";
import {
  DOCUMENT_STATUT_LABELS, DOCUMENT_TRANSITIONS,
  DOCUMENT_MOTIFS_REFUS, DOCUMENT_MOTIF_REFUS_LABELS,
  type DocumentStatut, type DocumentMotifRefus,
} from "@/lib/citoyenDocumentsConstants";

const inputStyle = (C: ThemeTokens): React.CSSProperties => ({
  width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "10px 14px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit",
});
const labelStyle = (C: ThemeTokens): React.CSSProperties => ({
  color: C.t3, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em",
  display: "block", marginBottom: "6px", fontWeight: "700",
});

// ── Types ────────────────────────────────────────────────────────────────
type Sens = "demande" | "envoi";
type DocumentClient = {
  id: string; citoyen_id: string; citoyen_nom: string; rdv_id: string;
  sens: Sens; type: string; label: string; description: string | null;
  statut: DocumentStatut; taille: number | null; type_mime: string | null;
  created_at: string; traite_le: string | null; date_limite: string | null;
  motif_refus: string | null; motif_refus_detail: string | null;
  remplace_document_id: string | null; demande_par_membre_id: string | null;
  rdv: { date_rdv: string; objet: string | null } | null;
};
type DocumentEventRow = {
  id: string; audit_id: string; type: string; acteur_type: string; membre_nom: string | null;
  commentaire: string | null; created_at: string;
};
type DocumentDetail = { document: DocumentClient; events: DocumentEventRow[] };
type Membre = { id: string; prenom: string; nom: string };
type ClientRdv = { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string };
type Client = { id: string; nom: string; phone: string; rdv: ClientRdv[] };

// ── Constantes métier ───────────────────────────────────────────────────
const TYPES_DEMANDE = [
  { value: "piece_identite", label: "Pièce d'identité" },
  { value: "justificatif", label: "Justificatif" },
  { value: "autre", label: "Autre document" },
];
const TYPES_ENVOI = [
  { value: "facture", label: "Facture" },
  { value: "recu", label: "Reçu" },
  { value: "rapport", label: "Rapport" },
  { value: "autre", label: "Autre document" },
];
const TOUS_TYPES = [...TYPES_DEMANDE, ...TYPES_ENVOI.filter(t => !TYPES_DEMANDE.some(d => d.value === t.value))];
function typeLabel(v: string): string { return TOUS_TYPES.find(t => t.value === v)?.label || v; }

function DOC_STATUT_CFG(C: ThemeTokens): Record<DocumentStatut, { label: string; color: string; bg: string }> {
  return {
    en_attente: { label: DOCUMENT_STATUT_LABELS.en_attente, color: C.gold, bg: `${C.gold}15` },
    recu: { label: DOCUMENT_STATUT_LABELS.recu, color: C.blue, bg: C.blueL },
    a_verifier: { label: DOCUMENT_STATUT_LABELS.a_verifier, color: C.gold, bg: `${C.gold}15` },
    valide: { label: DOCUMENT_STATUT_LABELS.valide, color: C.green, bg: C.greenL },
    refuse: { label: DOCUMENT_STATUT_LABELS.refuse, color: C.red, bg: C.redL },
    archive: { label: DOCUMENT_STATUT_LABELS.archive, color: C.t2, bg: C.bg3 },
    disponible: { label: DOCUMENT_STATUT_LABELS.disponible, color: C.green, bg: C.greenL },
  };
}

const EVENT_LABELS: Record<string, string> = {
  created: "a créé ce document",
  verification_started: "a commencé la vérification",
  uploaded: "a téléversé le document",
  viewed: "a consulté le document",
  downloaded: "a téléchargé le document",
  validated: "a validé le document",
  rejected: "a refusé le document",
  archived: "a archivé le document",
};

function formatTaille(o: number | null): string {
  if (!o) return "";
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / (1024 * 1024)).toFixed(1)} Mo`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function ilYA(depuis: Date, maintenant: number): string {
  const s = Math.max(0, Math.floor((maintenant - depuis.getTime()) / 1000));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)}h`;
}

// ── Petits composants locaux (répliqués de SignalementsTab.tsx) ────────
function DocSparkline({ serie, color }: { serie: number[]; color: string }) {
  if (serie.length < 2) return null;
  const max = Math.max(...serie, 1);
  const points = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * 100;
    const y = 28 - (v / max) * 24 - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: "100%", height: "28px", display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function DocDelta({ delta, C }: { delta: number | null; C: ThemeTokens }) {
  if (delta === null) return <span style={{ color: C.t3, fontSize: "10px" }}>Pas de comparaison</span>;
  if (delta === 0) return <span style={{ color: C.t3, fontSize: "10px", fontWeight: 700 }}>= vs hier</span>;
  const positif = delta > 0;
  return <span style={{ color: positif ? C.green : C.red, fontSize: "10px", fontWeight: 700 }}>{positif ? "+" : ""}{delta} vs hier</span>;
}
function DocKpiCard({ label, icon, color, value, delta, serie, C }: {
  label: string; icon: React.ReactNode; color: string; value: string; delta: number | null; serie: number[]; C: ThemeTokens;
}) {
  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <DocDelta delta={delta} C={C}/>
      {serie.some(v => v > 0) && <DocSparkline serie={serie} color={color}/>}
    </Card>
  );
}

// Illustrations sur mesure Yelen pour les états vides — même langage que
// SignalementsTab.tsx/ClockInShiftTab.tsx : trait, un seul accent doré,
// jamais de fond noir. Une liste vide de documents est une bonne nouvelle
// (rien en attente/à traiter), le message doit le refléter.
function IllustrationDocuments({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="26" y="30" width="34" height="44" rx="4" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M33 42h20M33 50h20M33 58h14" stroke={C.border2} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="62" r="14" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M62 62l4 4 8-8" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationATraiter({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M30 44l6-16a3 3 0 0 1 3-2h18a3 3 0 0 1 3 2l6 16" stroke={C.t3} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M26 44h14l4 8h8l4-8h14v20a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V44z" fill={C.bgCard} stroke={C.t3} strokeWidth="2" strokeLinejoin="round"/>
      <circle cx="70" cy="30" r="11" fill={C.bgCard} stroke={C.gold} strokeWidth="2"/>
      <path d="M65 30l3.5 3.5L75 26" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationEnAttente({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="48" cy="48" r="27" stroke={C.border2} strokeWidth="2" strokeDasharray="3 6"/>
      <circle cx="48" cy="48" r="17" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M48 40v9l7 4" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationTraites({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M39 55l-5 15 14-7 14 7-5-15" stroke={C.t3} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx="48" cy="40" r="18" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M48 32l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" fill={C.gold}/>
    </svg>
  );
}
function IllustrationExpirent({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="26" y="28" width="44" height="40" rx="6" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M26 38h44" stroke={C.t3} strokeWidth="2"/>
      <path d="M35 24v8M61 24v8" stroke={C.t3} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="68" cy="62" r="13" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M68 56v7l4 3" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DocEmptyState({ C, illustration, titre, texte, cta }: {
  C: ThemeTokens; illustration: React.ReactNode; titre: string; texte: string; cta?: { label: string; onClick: () => void };
}) {
  return (
    <Card tokens={toCardTokens(C)} padding="44px 20px" style={{ textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>{illustration}</div>
      <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "340px", margin: "0 auto" }}>{texte}</div>
      {cta && (
        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ marginTop: "18px" }} onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </Card>
  );
}

type FiltreRapide = "tous" | "a_traiter" | "en_attente" | "traites" | "expirent";
const FILTRE_RAPIDE_VIDE: Record<Exclude<FiltreRapide, "tous">, { illustration: (C: ThemeTokens) => React.ReactNode; titre: string; texte: string }> = {
  a_traiter: {
    illustration: (C) => <IllustrationATraiter C={C}/>,
    titre: "Aucun document à traiter",
    texte: "Tous les documents reçus ont déjà été examinés par votre équipe.",
  },
  en_attente: {
    illustration: (C) => <IllustrationEnAttente C={C}/>,
    titre: "Aucune demande en attente",
    texte: "Aucun document n'attend actuellement de réponse d'un citoyen.",
  },
  traites: {
    illustration: (C) => <IllustrationTraites C={C}/>,
    titre: "Aucun document traité",
    texte: "Les documents validés, refusés, archivés ou envoyés apparaîtront ici.",
  },
  expirent: {
    illustration: (C) => <IllustrationExpirent C={C}/>,
    titre: "Aucune échéance proche",
    texte: "Aucune demande de document n'approche de sa date limite.",
  },
};

function Ic_Dots({ C }: { C: ThemeTokens }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>; }

// Modale d'action (Lot 3) — même convention bottom-sheet/dialogue centré
// que le reste du dashboard, miroir de SigModal (SignalementsTab.tsx).
function DocModal({ C, titre, onClose, children }: { C: ThemeTokens; titre: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`@media(min-width:640px){.doc-modal-panel{align-self:center!important;border-radius:20px!important}}`}</style>
      <div onClick={e => e.stopPropagation()} className="doc-modal-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px 20px calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "440px", border: `1px solid ${C.border2}`, animation: "slideUp 0.25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: 0 }}>{titre}</h3>
          <button onClick={onClose} aria-label="Fermer" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function docConfirmBtnStyle(C: ThemeTokens, disabled: boolean): React.CSSProperties {
  return { width: "100%", height: "40px", backgroundColor: disabled ? C.bg3 : C.gold, border: "none", borderRadius: "12px", padding: "0 16px", color: disabled ? C.t3 : "#000", fontSize: "13px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" };
}
function DocBtnLoading({ C }: { C: ThemeTokens }) {
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}><YelenLoader size={14} color={C.t3}/></span>;
}

export function DocumentsClientsTab({ instId, onToast, active = true }: { instId: string; onToast: (msg: string, color?: string) => void; active?: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [documents, setDocuments] = useState<DocumentClient[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const [recherche, setRecherche] = useState("");
  const [filtreRapide, setFiltreRapide] = useState<FiltreRapide>("tous");
  const [filtresAvances, setFiltresAvances] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [filtreClient, setFiltreClient] = useState("");
  const [filtreDemandeur, setFiltreDemandeur] = useState("");
  const [filtreDateDebut, setFiltreDateDebut] = useState("");
  const [filtreDateFin, setFiltreDateFin] = useState("");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [activeModal, setActiveModal] = useState<null | "valider" | "refuser" | "archiver">(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [verifierSaving, setVerifierSaving] = useState(false);
  const [formMotifRefus, setFormMotifRefus] = useState<DocumentMotifRefus | "">("");
  const [formMotifRefusDetail, setFormMotifRefusDetail] = useState("");

  const [vue, setVue] = useState<"liste" | "creation">("liste");
  const [etapeCreation, setEtapeCreation] = useState<"form" | "verify" | "succes">("form");
  const [sending, setSending] = useState(false);
  const [creError, setCreError] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [rdvId, setRdvId] = useState("");
  const [sens, setSens] = useState<Sens>("demande");
  const [type, setType] = useState("piece_identite");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [dateLimite, setDateLimite] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const fichierInputRef = useRef<HTMLInputElement>(null);

  // Aperçu sécurisé (Lot 4) — images uniquement, un seul chargement par
  // document ouvert (previewFetchedRef évite de re-logger un événement
  // 'viewed' à chaque rafraîchissement silencieux de la fiche après une
  // action, seulement à la première ouverture réelle).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewFetchedRef = useRef<string | null>(null);

  const chargerListe = useCallback(async (avecSpinner: boolean) => {
    if (avecSpinner) setLoading(true);
    try {
      const res = await fetch("/api/institution/documents-citoyen");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.documents) setDocuments(json.documents);
      setLastSync(new Date());
    } catch {}
    if (avecSpinner) setLoading(false);
  }, []);

  const chargerMembres = useCallback(async () => {
    const res = await fetch("/api/institution/membres");
    const json = await res.json().catch(() => null);
    if (res.ok && json?.membres) setMembres(json.membres);
  }, []);

  useEffect(() => { queueMicrotask(() => { chargerListe(true); chargerMembres(); }); }, [chargerListe, chargerMembres, instId]);

  // Polling "Live" 30s — jamais setLoading(true) ici (bug déjà corrigé une
  // fois cette session sur Équipe/ClockInShift : ça remplaçait tout
  // l'écran, tableau + filtres + fiche ouverte, à chaque tick).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => chargerListe(false), 30000);
    return () => clearInterval(id);
  }, [active, chargerListe]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!openMenuId) return;
    const fermer = () => setOpenMenuId(null);
    window.addEventListener("click", fermer);
    return () => window.removeEventListener("click", fermer);
  }, [openMenuId]);

  const chargerDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/institution/documents-citoyen/${id}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.document) setDetail(json);
    } catch {}
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (!selectedId) { setDetail(null); previewFetchedRef.current = null; setPreviewUrl(null); return; }
      chargerDetail(selectedId);
    });
  }, [selectedId, chargerDetail]);

  // Aperçu sécurisé (Lot 4, brief §8) — uniquement pour les images
  // (jpeg/png), un document en attente n'a pas encore de fichier. URL
  // signée 60s via ?preview=, jamais une URL publique directe.
  useEffect(() => {
    if (!detail) return;
    const doc = detail.document;
    if (previewFetchedRef.current === doc.id) return;
    previewFetchedRef.current = doc.id;
    const estImage = doc.type_mime === "image/jpeg" || doc.type_mime === "image/png";
    queueMicrotask(() => {
      if (doc.statut === "en_attente" || !estImage) { setPreviewUrl(null); return; }
      setPreviewLoading(true);
      fetch(`/api/institution/documents-citoyen?preview=${doc.id}`)
        .then(res => res.json())
        .then(json => { if (json?.url) setPreviewUrl(json.url); })
        .catch(() => {})
        .finally(() => setPreviewLoading(false));
    });
  }, [detail]);

  // Workflow (Lot 3) — POST .../[id]/actions déjà prêt depuis le Lot 1
  // (lib/citoyenDocuments.ts, transitions validées serveur via
  // DOCUMENT_TRANSITIONS). Cette fonction ne fait qu'appeler la route,
  // jamais d'écriture directe.
  async function appelerAction(action: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!selectedId) return false;
    setModalSaving(true); setModalError("");
    try {
      const res = await fetch(`/api/institution/documents-citoyen/${selectedId}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { setModalError(json?.error || "Erreur lors de l'action."); setModalSaving(false); return false; }
      setModalSaving(false);
      setActiveModal(null);
      await chargerDetail(selectedId);
      chargerListe(false);
      return true;
    } catch {
      setModalError("Erreur réseau."); setModalSaving(false); return false;
    }
  }

  async function commencerVerification() {
    if (!selectedId) return;
    setVerifierSaving(true);
    const res = await fetch(`/api/institution/documents-citoyen/${selectedId}/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verifier" }),
    });
    const json = await res.json().catch(() => null);
    setVerifierSaving(false);
    if (!res.ok || !json?.ok) { onToast(json?.error || "Erreur lors de l'action.", C.red); return; }
    await chargerDetail(selectedId);
    chargerListe(false);
  }

  function membreNom(id: string | null): string {
    if (!id) return "—";
    const m = membres.find(x => x.id === id);
    return m ? `${m.prenom} ${m.nom}` : "—";
  }

  // ── KPI ─────────────────────────────────────────────────────────────
  const dans3Jours = new Date(); dans3Jours.setDate(dans3Jours.getDate() + 3);
  const estATraiter = (d: DocumentClient) => d.statut === "recu" || d.statut === "a_verifier";
  const estEnAttente = (d: DocumentClient) => d.statut === "en_attente";
  const estTraite = (d: DocumentClient) => d.statut === "valide" || d.statut === "refuse" || d.statut === "archive" || d.statut === "disponible";
  const estExpireBientot = (d: DocumentClient) => d.statut === "en_attente" && !!d.date_limite && new Date(d.date_limite) <= dans3Jours;

  const kpiATraiter = documents.filter(estATraiter).length;
  const kpiEnAttente = documents.filter(estEnAttente).length;
  const kpiRecus = documents.filter(d => d.sens === "demande" && d.statut !== "en_attente").length;
  const kpiExpirent = documents.filter(estExpireBientot).length;

  // Tendance 8 jours = nouveaux documents créés par jour correspondant au
  // filtre (pas un historique reconstruit de statut journalier — même
  // limitation déjà documentée pour Signalements/Employés ailleurs sur ce
  // dashboard).
  function serieCreation(filtre: (d: DocumentClient) => boolean): number[] {
    const jours: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const jour = new Date(); jour.setDate(jour.getDate() - i);
      const jourStr = jour.toISOString().slice(0, 10);
      jours.push(documents.filter(d => filtre(d) && d.created_at.slice(0, 10) === jourStr).length);
    }
    return jours;
  }
  function deltaCreationJour(filtre: (d: DocumentClient) => boolean): number {
    const hier = new Date(); hier.setDate(hier.getDate() - 1);
    const avantHier = new Date(); avantHier.setDate(avantHier.getDate() - 2);
    const hierStr = hier.toISOString().slice(0, 10);
    const avantHierStr = avantHier.toISOString().slice(0, 10);
    return documents.filter(d => filtre(d) && d.created_at.slice(0, 10) === hierStr).length
      - documents.filter(d => filtre(d) && d.created_at.slice(0, 10) === avantHierStr).length;
  }

  // ── Filtrage liste ──────────────────────────────────────────────────
  const listeFiltree = documents.filter(d => {
    if (filtreRapide === "a_traiter" && !estATraiter(d)) return false;
    if (filtreRapide === "en_attente" && !estEnAttente(d)) return false;
    if (filtreRapide === "traites" && !estTraite(d)) return false;
    if (filtreRapide === "expirent" && !estExpireBientot(d)) return false;
    if (filtreStatut && d.statut !== filtreStatut) return false;
    if (filtreType && d.type !== filtreType) return false;
    if (filtreClient && d.citoyen_id !== filtreClient) return false;
    if (filtreDemandeur && d.demande_par_membre_id !== filtreDemandeur) return false;
    if (filtreDateDebut && d.created_at.slice(0, 10) < filtreDateDebut) return false;
    if (filtreDateFin && d.created_at.slice(0, 10) > filtreDateFin) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const hay = `${d.label} ${d.citoyen_nom} ${typeLabel(d.type)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filtresAnnexesActifs = !!recherche.trim() || !!filtreStatut || !!filtreType || !!filtreClient || !!filtreDemandeur || !!filtreDateDebut || !!filtreDateFin;
  const filtreVideCfg = !filtresAnnexesActifs && filtreRapide !== "tous" ? FILTRE_RAPIDE_VIDE[filtreRapide] : null;

  function exporterCsv() {
    const lignes = [
      ["Document", "Type", "Client", "Statut", "Créé le"],
      ...listeFiltree.map(d => [d.label, typeLabel(d.type), d.citoyen_nom, DOC_STATUT_CFG(C)[d.statut]?.label ?? d.statut, formatDate(d.created_at)]),
    ];
    const csv = lignes.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `documents-clients-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function telecharger(id: string) {
    const res = await fetch(`/api/institution/documents-citoyen?download=${id}`);
    const j = await res.json().catch(() => null);
    if (!res.ok) { onToast("Erreur de téléchargement", C.red); return; }
    window.open(j.url, "_blank");
  }

  // ── Création (Lot 4) — flux plein écran avec étape de vérification,
  // même pattern que la création Signalements. Logique métier inchangée
  // (mêmes champs/route), seule la présentation change.
  async function ouvrirCreation() {
    setVue("creation"); setEtapeCreation("form"); setCreError("");
    if (clients.length === 0) {
      const res = await fetch("/api/institution/documents-citoyen/clients");
      const j = await res.json().catch(() => null);
      if (res.ok) setClients(j?.clients ?? []);
    }
  }
  function resetCreation() {
    setVue("liste"); setEtapeCreation("form"); setCreError("");
    setClientId(""); setRdvId(""); setLabel(""); setDescription(""); setDateLimite(""); setFichier(null); setClientQuery(""); setSens("demande");
  }
  const clientsFiltres = clients.filter(c => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return true;
    return c.nom.toLowerCase().includes(q) || c.phone.includes(q);
  });
  const clientSelectionne = clients.find(c => c.id === clientId) ?? null;
  const rdvSelectionne = clientSelectionne?.rdv.find(r => r.id === rdvId) ?? null;
  useEffect(() => { queueMicrotask(() => setType(sens === "demande" ? "piece_identite" : "facture")); }, [sens]);

  function validerEtapeForm() {
    setCreError("");
    if (!clientId) { setCreError("Sélectionnez un client."); return; }
    if (!rdvId) { setCreError("Sélectionnez le rendez-vous concerné."); return; }
    if (!label.trim()) { setCreError("Le libellé est requis."); return; }
    if (sens === "envoi" && !fichier) { setCreError("Ajoutez le fichier à envoyer."); return; }
    setEtapeCreation("verify");
  }

  async function confirmerCreation() {
    setSending(true); setCreError("");
    const fd = new FormData();
    fd.append("citoyenId", clientId);
    fd.append("rdvId", rdvId);
    fd.append("type", type);
    fd.append("label", label.trim());
    if (description.trim()) fd.append("description", description.trim());
    if (sens === "demande" && dateLimite) fd.append("dateLimite", dateLimite);
    if (fichier) fd.append("file", fichier);

    const res = await fetch("/api/institution/documents-citoyen", { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) { setCreError(j?.error || "Erreur d'envoi. Réessayez."); return; }
    setEtapeCreation("succes");
    chargerListe(false);
  }

  // ─────────────────────────────────────────────────────────────────────
  // VUE CRÉATION — plein écran avec étape de vérification (Lot 4, même
  // pattern que la création Signalements)
  // ─────────────────────────────────────────────────────────────────────
  if (vue === "creation") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: C.bg, overflowY: "auto" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: C.bg, borderBottom: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: 0 }}>{sens === "demande" ? "Nouvelle demande de document" : "Nouvel envoi de document"}</h2>
          <button onClick={resetCreation} aria-label="Fermer" className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 20px 60px" }}>
          {etapeCreation === "form" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <label style={labelStyle(C)}>Type d&apos;échange</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["demande", "envoi"] as Sens[]).map(s => (
                    <button key={s} onClick={() => setSens(s)} className="tap" style={{ flex: 1, padding: "11px", borderRadius: "10px", border: `1.5px solid ${sens === s ? C.gold : C.border2}`, background: sens === s ? `${C.gold}15` : C.bgCard, color: sens === s ? C.gold : C.t2, fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>
                      {s === "demande" ? "Demander un document" : "Envoyer un document"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <FormField C={C} label="Client" required value={clientId ? clientSelectionne?.nom ?? "" : clientQuery} onChange={v => { setClientQuery(v); setClientId(""); setRdvId(""); }} placeholder="Rechercher un client (nom, téléphone)…" name="client"/>
                {!clientId && clientQuery.trim() && (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", marginTop: "6px", maxHeight: "160px", overflowY: "auto" }}>
                    {clientsFiltres.length === 0 ? (
                      <div style={{ padding: "10px", color: C.t3, fontSize: "12px" }}>Aucun client trouvé.</div>
                    ) : clientsFiltres.map(c => (
                      <div key={c.id} onClick={() => setClientId(c.id)} className="tap" style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", color: C.t1, fontSize: "12.5px" }}>{c.nom} <span style={{ color: C.t3 }}>· {c.phone}</span></div>
                    ))}
                  </div>
                )}
              </div>

              {clientSelectionne && (
                <div>
                  <label style={labelStyle(C)}>Rendez-vous concerné *</label>
                  <select value={rdvId} onChange={e => setRdvId(e.target.value)} style={inputStyle(C)}>
                    <option value="">Sélectionner un RDV…</option>
                    {clientSelectionne.rdv.map(r => (
                      <option key={r.id} value={r.id}>{formatDate(r.date_rdv)} {r.heure_rdv} — {r.objet || "RDV général"} ({r.statut})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle(C)}>Type de document</label>
                <select value={type} onChange={e => setType(e.target.value)} style={inputStyle(C)}>
                  {(sens === "demande" ? TYPES_DEMANDE : TYPES_ENVOI).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <FormField C={C} label="Libellé" required value={label} onChange={setLabel} placeholder={sens === "demande" ? "Ex. Pièce d'identité du responsable" : "Ex. Facture consultation du 12/07"} maxLength={100} name="label"/>
              </div>

              <div>
                <label style={labelStyle(C)}>{sens === "demande" ? "Message pour le citoyen (optionnel)" : "Note interne (optionnel)"}</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle(C), resize: "none", lineHeight: 1.6 }} placeholder={sens === "demande" ? "Expliquez au citoyen pourquoi ce document est demandé — ce message lui est visible." : ""}/>
                {sens === "demande" && <p style={{ color: C.t3, fontSize: "11px", marginTop: "4px" }}>Ce message est visible par le citoyen dans son espace Yelen.</p>}
              </div>

              {sens === "demande" && (
                <div>
                  <label style={labelStyle(C)}>Date limite de réponse (optionnel)</label>
                  <input type="date" value={dateLimite} onChange={e => setDateLimite(e.target.value)} style={inputStyle(C)}/>
                </div>
              )}

              {sens === "envoi" && (
                <div>
                  <label style={labelStyle(C)}>Fichier (PDF, JPG, PNG) *</label>
                  {fichier ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ flex: 1, color: C.t2, fontSize: "12px", wordBreak: "break-all" }}>{fichier.name}</div>
                      <button type="button" onClick={() => { setFichier(null); if (fichierInputRef.current) fichierInputRef.current.value = ""; }} className="tap" aria-label="Retirer le fichier" style={{ width: "24px", height: "24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "50%", cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fichierInputRef.current?.click()} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", backgroundColor: C.bgCard, border: `1.5px dashed ${C.border2}`, color: C.t1, fontWeight: "700", fontSize: "13px", padding: "14px", borderRadius: "10px", cursor: "pointer" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                      Ajouter un fichier
                    </button>
                  )}
                  <input ref={fichierInputRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFichier(e.target.files?.[0] ?? null)} style={{ display: "none" }}/>
                </div>
              )}

              {creError && <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "12px 16px", color: C.red, fontSize: "13px" }}>{creError}</div>}

              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={validerEtapeForm}>
                Continuer
              </Button>
            </div>
          )}

          {etapeCreation === "verify" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ color: C.t2, fontSize: "13px", margin: 0 }}>Vérifiez les informations avant l&apos;envoi définitif.</p>
              <Card tokens={toCardTokens(C)} padding="16px 18px" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Client</div>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>{clientSelectionne?.nom}</div>
                </div>
                {rdvSelectionne && (
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Rendez-vous</div>
                    <div style={{ color: C.t1, fontSize: "13px" }}>{formatDate(rdvSelectionne.date_rdv)} {rdvSelectionne.heure_rdv} — {rdvSelectionne.objet || "RDV général"}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Document</div>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>{label}</div>
                  <div style={{ color: C.t3, fontSize: "11.5px" }}>{typeLabel(type)}</div>
                </div>
                {description.trim() && (
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>{sens === "demande" ? "Message pour le citoyen" : "Note interne"}</div>
                    <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>{description}</div>
                  </div>
                )}
                {sens === "demande" && dateLimite && (
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Date limite</div>
                    <div style={{ color: C.t1, fontSize: "13px" }}>{formatDate(dateLimite)}</div>
                  </div>
                )}
                {sens === "envoi" && fichier && (
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Fichier</div>
                    <div style={{ color: C.t2, fontSize: "12.5px", wordBreak: "break-all" }}>{fichier.name}</div>
                  </div>
                )}
              </Card>

              <div style={{ color: C.t3, fontSize: "10.5px", lineHeight: 1.5 }}>
                En confirmant, vous engagez votre établissement à assurer la sécurité et la confidentialité de ce document conformément aux conditions d&apos;utilisation Yelen.
              </div>

              {creError && <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "12px 16px", color: C.red, fontSize: "13px" }}>{creError}</div>}

              <div style={{ display: "flex", gap: "10px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setEtapeCreation("form")}>Modifier</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} loading={sending} onClick={confirmerCreation}>
                  {sens === "demande" ? "Envoyer la demande" : "Envoyer le document"}
                </Button>
              </div>
            </div>
          )}

          {etapeCreation === "succes" && (
            <div style={{ textAlign: "center", padding: "40px 10px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: "0 0 4px" }}>{sens === "demande" ? "Demande envoyée" : "Document envoyé"}</p>
              <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 24px" }}>{sens === "demande" ? "Le citoyen recevra une notification pour y répondre." : "Le citoyen peut désormais le consulter."}</p>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ padding: "0 28px" }} onClick={resetCreation}>Retour à la liste</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        @media(max-width:759px){ .doc-table{ display:none!important } }
        @media(min-width:760px){ .doc-cards{ display:none!important } }
        @media(min-width:1024px){
          .doc-fiche-overlay{align-items:center!important}
          .doc-fiche-panel{max-width:640px!important;border-radius:20px!important;max-height:86svh!important}
          .doc-fiche-grip{display:none!important}
          .doc-fiche-close-x{display:flex!important}
        }
        @media(min-width:1024px){
          .doc-clients-overlay{align-items:center!important}
          .doc-clients-panel{max-width:520px!important;border-radius:20px!important}
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
        <div>
          <h1 className="yelen-h2" style={{ color: C.t1, marginBottom: "4px" }}>Documents clients</h1>
          <p style={{ color: C.t2, fontSize: "12.5px", marginBottom: "6px" }}>Documents échangés avec vos citoyens et nécessitant une action ou un suivi.</p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.green, fontSize: "10.5px", fontWeight: 800 }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.green, boxShadow: `0 0 0 3px ${C.green}25` }}/>
              Live
            </span>
            {lastSync && <span style={{ color: C.t3, fontSize: "10.5px" }}>Dernière synchronisation : {ilYA(lastSync, maintenant)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={exporterCsv}>Exporter CSV</Button>
          <Button
            tokens={toUiTokens(C)} className="tap"
            variant="secondary"
            size="sm"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
            onClick={() => chargerListe(true)}
          >
            Actualiser
          </Button>
          <Button
            tokens={toUiTokens(C)} className="tap"
            variant="primary"
            size="sm"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
            onClick={ouvrirCreation}
          >
            Nouveau
          </Button>
        </div>
      </div>

      {/* KPI exécutifs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        <DocKpiCard label="À traiter" color={C.gold} value={String(kpiATraiter)} delta={deltaCreationJour(estATraiter)} serie={serieCreation(estATraiter)} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>}/>
        <DocKpiCard label="En attente" color={C.blue} value={String(kpiEnAttente)} delta={deltaCreationJour(estEnAttente)} serie={serieCreation(estEnAttente)} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}/>
        <DocKpiCard label="Reçus" color={C.green} value={String(kpiRecus)} delta={deltaCreationJour(d => d.sens === "demande" && d.statut !== "en_attente")} serie={serieCreation(d => d.sens === "demande" && d.statut !== "en_attente")} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
        <DocKpiCard label="Expirent bientôt" color={C.red} value={String(kpiExpirent)} delta={null} serie={[]} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}/>
      </div>

      {/* Recherche + filtres */}
      <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un document, un client, un type…" aria-label="Rechercher un document" style={{ ...inputStyle(C), marginBottom: "10px" }}/>
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px", overflowX: "auto" }}>
        {([
          { key: "tous", label: "Tous" },
          { key: "a_traiter", label: "À traiter" },
          { key: "en_attente", label: "En attente" },
          { key: "traites", label: "Traités" },
          { key: "expirent", label: "Expirent bientôt" },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltreRapide(f.key)} className="tap" style={{ backgroundColor: filtreRapide === f.key ? C.gold : C.bg3, color: filtreRapide === f.key ? "#000" : C.t2, border: `1px solid ${filtreRapide === f.key ? C.gold : C.border}`, fontWeight: 700, fontSize: "11.5px", padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap" }}>{f.label}</button>
        ))}
        <button onClick={() => setFiltresAvances(v => !v)} className="tap" style={{ backgroundColor: filtresAvances ? `${C.gold}15` : C.bg3, color: filtresAvances ? C.gold : C.t2, border: `1px solid ${filtresAvances ? C.gold + "50" : C.border}`, fontWeight: 700, fontSize: "11.5px", padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap" }}>Filtres avancés</button>
      </div>
      {filtresAvances && (
        <Card tokens={toCardTokens(C)} padding="12px" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "14px" }}>
          <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} aria-label="Filtrer par statut" style={inputStyle(C)}>
            <option value="">Tous statuts</option>
            {(Object.keys(DOCUMENT_STATUT_LABELS) as DocumentStatut[]).map(s => <option key={s} value={s}>{DOCUMENT_STATUT_LABELS[s]}</option>)}
          </select>
          <select value={filtreType} onChange={e => setFiltreType(e.target.value)} aria-label="Filtrer par type de document" style={inputStyle(C)}>
            <option value="">Tous types</option>
            {TOUS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filtreClient} onChange={e => setFiltreClient(e.target.value)} aria-label="Filtrer par client" style={inputStyle(C)}>
            <option value="">Tous les clients</option>
            {[...new Map(documents.map(d => [d.citoyen_id, d.citoyen_nom])).entries()].map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
          <select value={filtreDemandeur} onChange={e => setFiltreDemandeur(e.target.value)} aria-label="Filtrer par demandeur" style={inputStyle(C)}>
            <option value="">Tous les demandeurs</option>
            {membres.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          <input type="date" value={filtreDateDebut} onChange={e => setFiltreDateDebut(e.target.value)} aria-label="Date de création — à partir de" style={inputStyle(C)}/>
          <input type="date" value={filtreDateFin} onChange={e => setFiltreDateFin(e.target.value)} aria-label="Date de création — jusqu'au" style={inputStyle(C)}/>
        </Card>
      )}

      {/* Liste */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><YelenLoader size={32}/></div>
      ) : documents.length === 0 ? (
        <DocEmptyState C={C} illustration={<IllustrationDocuments C={C}/>}
          titre="Aucun document échangé pour l'instant"
          texte="Les documents demandés à vos citoyens, ou envoyés par votre établissement (factures, reçus, rapports), apparaîtront ici."
          cta={{ label: "+ Nouveau document", onClick: ouvrirCreation }}/>
      ) : listeFiltree.length === 0 && filtreVideCfg ? (
        <DocEmptyState C={C} illustration={filtreVideCfg.illustration(C)} titre={filtreVideCfg.titre} texte={filtreVideCfg.texte}/>
      ) : listeFiltree.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="32px" style={{ textAlign: "center", color: C.t2, fontSize: "13px" }}>
          Aucun document ne correspond à ces critères.
        </Card>
      ) : (
        <>
          {/* Desktop : tableau */}
          <div className="doc-table" style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: "14px", backgroundColor: C.bgCard }}>
            <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Document", "Client", "Contexte", "Statut", "Créé", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listeFiltree.map((d, i, arr) => {
                  const cfg = DOC_STATUT_CFG(C)[d.statut];
                  const peutTelecharger = d.statut !== "en_attente";
                  return (
                    <tr key={d.id} onClick={() => setSelectedId(d.id)} role="button" tabIndex={0} aria-label={`Voir les détails de ${d.label}`} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(d.id); } }} className="tap" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                      <td style={{ padding: "12px 14px", maxWidth: "220px" }}>
                        <div style={{ color: C.t1, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
                        <div style={{ color: C.t3, fontSize: "11px" }}>{typeLabel(d.type)}</div>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{d.citoyen_nom}</td>
                      <td style={{ padding: "12px 14px", color: C.t3, whiteSpace: "nowrap" }}>{d.rdv?.date_rdv ? `RDV du ${formatDate(d.rdv.date_rdv)}` : "—"}</td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{cfg.label}</span>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.t3, whiteSpace: "nowrap" }}>{formatDate(d.created_at)}</td>
                      <td style={{ padding: "12px 14px", position: "relative" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setOpenMenuId(openMenuId === d.id ? null : d.id)} aria-label="Actions" aria-haspopup="menu" aria-expanded={openMenuId === d.id} className="tap" style={{ width: "28px", height: "28px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Ic_Dots C={C}/>
                        </button>
                        {openMenuId === d.id && (
                          <div style={{ position: "absolute", right: "14px", top: "100%", zIndex: 10, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", overflow: "hidden", minWidth: "160px" }}>
                            <button onClick={() => { setOpenMenuId(null); setSelectedId(d.id); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", backgroundColor: "transparent", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Voir les détails</button>
                            {peutTelecharger && (
                              <button onClick={() => { setOpenMenuId(null); telecharger(d.id); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", backgroundColor: "transparent", border: "none", borderTop: `1px solid ${C.border}`, color: C.t1, fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>Télécharger</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : cards */}
          <div className="doc-cards" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {listeFiltree.map(d => {
              const cfg = DOC_STATUT_CFG(C)[d.statut];
              return (
                <Card key={d.id} tokens={toCardTokens(C)} padding="14px 16px" onClick={() => setSelectedId(d.id)} role="button" tabIndex={0} aria-label={`Voir les détails de ${d.label}`} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(d.id); } }} className="tap">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ color: C.t3, fontSize: "10.5px" }}>{typeLabel(d.type)}</span>
                    <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px" }}>{cfg.label}</span>
                  </div>
                  <p style={{ color: C.t1, fontSize: "14px", fontWeight: 700, margin: "0 0 3px" }}>{d.label}</p>
                  <p style={{ color: C.t2, fontSize: "12px", margin: "0 0 8px" }}>{d.citoyen_nom}{d.taille ? ` · ${formatTaille(d.taille)}` : ""}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: C.t3, fontSize: "11px" }}>{formatDate(d.created_at)}</span>
                    <span style={{ color: C.gold, fontSize: "11.5px", fontWeight: 700 }}>Ouvrir</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ── FICHE (infos + historique + workflow) ── */}
      {selectedId && (
        <div className="doc-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => setSelectedId(null)}>
          <div onClick={e => e.stopPropagation()} className="doc-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
            <div className="doc-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
            <button onClick={() => setSelectedId(null)} aria-label="Fermer" className="doc-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {loadingDetail || !detail ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><YelenLoader size={28}/></div>
            ) : (() => {
              const doc = detail.document;
              const cfg = DOC_STATUT_CFG(C)[doc.statut];
              const peutTelecharger = doc.statut !== "en_attente";
              return (
                <>
                  <div style={{ marginBottom: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{cfg.label}</span>
                      <span style={{ color: C.t3, fontSize: "11px" }}>{doc.sens === "demande" ? "Demande" : "Envoi"}</span>
                    </div>
                    <h2 style={{ color: C.t1, fontSize: "17px", fontWeight: 800, margin: "0 0 2px" }}>{doc.label}</h2>
                    <p style={{ color: C.t2, fontSize: "12.5px", margin: 0 }}>{doc.citoyen_nom}</p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div>
                      <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Informations</div>
                      <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12.5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Type</span><span style={{ color: C.t1, fontWeight: 700 }}>{typeLabel(doc.type)}</span></div>
                        {doc.taille != null && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Taille</span><span style={{ color: C.t1 }}>{formatTaille(doc.taille)}</span></div>}
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Créé le</span><span style={{ color: C.t1 }}>{formatDateHeure(doc.created_at)}</span></div>
                        {doc.traite_le && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Traité le</span><span style={{ color: C.t1 }}>{formatDateHeure(doc.traite_le)}</span></div>}
                        {doc.date_limite && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Date limite</span><span style={{ color: C.t1 }}>{formatDate(doc.date_limite)}</span></div>}
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Demandé par</span><span style={{ color: C.t1, fontWeight: 700 }}>{membreNom(doc.demande_par_membre_id)}</span></div>
                        {doc.rdv?.date_rdv && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Rendez-vous</span><span style={{ color: C.t1 }}>{formatDate(doc.rdv.date_rdv)}</span></div>}
                      </div>
                    </div>

                    {doc.description && (
                      <div>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Description</div>
                        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.7, backgroundColor: C.bg3, borderRadius: "10px", padding: "12px 14px", margin: 0 }}>{doc.description}</p>
                      </div>
                    )}

                    {doc.statut === "refuse" && doc.motif_refus && (
                      <div>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Motif du refus</div>
                        <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "12px 14px" }}>
                          <p style={{ color: C.red, fontWeight: 700, fontSize: "12.5px", margin: "0 0 4px" }}>{doc.motif_refus}</p>
                          {doc.motif_refus_detail && <p style={{ color: C.t2, fontSize: "12px", margin: 0, lineHeight: 1.6 }}>{doc.motif_refus_detail}</p>}
                        </div>
                      </div>
                    )}

                    {peutTelecharger && (
                      <div>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Aperçu</div>
                        {previewLoading ? (
                          <div style={{ display: "flex", justifyContent: "center", padding: "20px", backgroundColor: C.bg3, borderRadius: "12px" }}><YelenLoader size={20}/></div>
                        ) : previewUrl ? (
                          <div style={{ width: "100%", height: "220px", borderRadius: "12px", overflow: "hidden", backgroundColor: C.bg3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {/* IMG-EXCEPTION: reason=URL signée Supabase Storage à expiration 60s (bucket privé documents-citoyens), non couverte par next.config.ts remotePatterns (restreint à /storage/v1/object/public/**) — court-vécue et régénérée à chaque ouverture, aucun gain de cache réel, même raisonnement que l'exception URL externe déjà actée pour mon-qr | reviewed=2026-08-09 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewUrl} alt={doc.label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}/>
                          </div>
                        ) : (
                          <div style={{ padding: "16px", backgroundColor: C.bg3, borderRadius: "12px", border: `1px dashed ${C.border2}`, textAlign: "center", color: C.t3, fontSize: "12px" }}>
                            Aperçu non disponible pour ce type de fichier — téléchargez-le pour le consulter.
                          </div>
                        )}
                      </div>
                    )}

                    {peutTelecharger && (
                      <Button
                        tokens={toUiTokens(C)} className="tap"
                        variant="primary"
                        size="md"
                        fullWidth
                        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                        onClick={() => telecharger(doc.id)}
                      >
                        Télécharger le document
                      </Button>
                    )}

                    {(() => {
                      const transitions = DOCUMENT_TRANSITIONS[doc.statut];
                      const montrerVerifier = transitions.includes("a_verifier");
                      const montrerValider = transitions.includes("valide");
                      const montrerRefuser = transitions.includes("refuse");
                      const montrerArchiver = transitions.includes("archive");
                      if (!montrerVerifier && !montrerValider && !montrerRefuser && !montrerArchiver) return null;
                      return (
                        <div>
                          <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Actions</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {montrerVerifier && (
                              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth style={{ justifyContent: "flex-start", color: C.blue }} loading={verifierSaving} onClick={commencerVerification}>
                                Commencer la vérification
                              </Button>
                            )}
                            {montrerValider && (
                              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth style={{ justifyContent: "flex-start", color: C.green }} onClick={() => setActiveModal("valider")}>Valider</Button>
                            )}
                            {montrerRefuser && (
                              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth style={{ justifyContent: "flex-start", color: C.red }} onClick={() => { setFormMotifRefus(""); setFormMotifRefusDetail(""); setActiveModal("refuser"); }}>Refuser</Button>
                            )}
                            {montrerArchiver && (
                              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth style={{ justifyContent: "flex-start" }} onClick={() => setActiveModal("archiver")}>Archiver</Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                      <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Historique</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {detail.events.map(ev => (
                          <div key={ev.id} style={{ display: "flex", gap: "10px" }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "5px", flexShrink: 0 }}/>
                            <div>
                              <p style={{ color: C.t1, fontSize: "12px", margin: "0 0 2px" }}>
                                <strong>{ev.acteur_type === "citoyen" ? doc.citoyen_nom : ev.membre_nom || "Membre"}</strong> {EVENT_LABELS[ev.type] || ev.type}
                              </p>
                              <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>{formatDateHeure(ev.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Modales de workflow (Lot 3) ── */}
      {activeModal === "valider" && (
        <DocModal C={C} titre="Valider le document" onClose={() => setActiveModal(null)}>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "16px" }}>Ce document sera marqué comme validé et restera consultable par votre équipe.</p>
          {modalError && <p style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>{modalError}</p>}
          <button onClick={() => appelerAction("valider", {})} disabled={modalSaving} className="tap" style={docConfirmBtnStyle(C, modalSaving)}>{modalSaving ? <DocBtnLoading C={C}/> : "Valider"}</button>
        </DocModal>
      )}

      {activeModal === "refuser" && (
        <DocModal C={C} titre="Refuser le document" onClose={() => setActiveModal(null)}>
          <label style={labelStyle(C)}>Motif du refus *</label>
          <select value={formMotifRefus} onChange={e => setFormMotifRefus(e.target.value as DocumentMotifRefus)} style={{ ...inputStyle(C), marginBottom: "12px" }}>
            <option value="">Sélectionner…</option>
            {DOCUMENT_MOTIFS_REFUS.map(m => <option key={m} value={m}>{DOCUMENT_MOTIF_REFUS_LABELS[m]}</option>)}
          </select>
          {formMotifRefus === "autre" && (
            <>
              <label style={labelStyle(C)}>Explication *</label>
              <textarea value={formMotifRefusDetail} onChange={e => setFormMotifRefusDetail(e.target.value)} rows={3} style={{ ...inputStyle(C), resize: "none", marginBottom: "14px" }} placeholder="Précisez la raison du refus…"/>
            </>
          )}
          {modalError && <p style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>{modalError}</p>}
          <button
            onClick={() => formMotifRefus && appelerAction("refuser", { motifRefus: formMotifRefus, motifRefusDetail: formMotifRefusDetail.trim() || null })}
            disabled={modalSaving || !formMotifRefus || (formMotifRefus === "autre" && !formMotifRefusDetail.trim())}
            className="tap" style={{ ...docConfirmBtnStyle(C, modalSaving || !formMotifRefus || (formMotifRefus === "autre" && !formMotifRefusDetail.trim())), backgroundColor: modalSaving || !formMotifRefus ? C.bg3 : C.red, color: modalSaving || !formMotifRefus ? C.t3 : "#fff" }}
          >
            {modalSaving ? <DocBtnLoading C={C}/> : "Refuser le document"}
          </button>
        </DocModal>
      )}

      {activeModal === "archiver" && (
        <DocModal C={C} titre="Archiver le document" onClose={() => setActiveModal(null)}>
          <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "16px" }}>Ce document sera archivé. Il reste consultable mais sort des files actives.</p>
          {modalError && <p style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>{modalError}</p>}
          <div style={{ display: "flex", gap: "10px" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Annuler</Button>
            <button onClick={() => appelerAction("archiver", {})} disabled={modalSaving} className="tap" style={{ ...docConfirmBtnStyle(C, modalSaving), flex: 1 }}>{modalSaving ? <DocBtnLoading C={C}/> : "Confirmer l'archivage"}</button>
          </div>
        </DocModal>
      )}

    </div>
  );
}
