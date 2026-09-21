"use client";

// Onglet Signalements — refonte case management (Lot 2, décision CEO
// 08/08/2026, niveau "Enterprise/US" déjà établi sur ClockInShiftTab.tsx/
// MesClientsTab.tsx dans cette même session). Remplace le formulaire de
// plainte d'origine par une vraie boîte de réception (KPI, recherche,
// filtres, tableau/cards) + fiche détail (infos/actions/pièces jointes/
// notes internes/timeline d'audit) + création avec étape de vérification.
// Toutes les routes API (Lot 1) existent déjà — ce lot est purement
// frontend. Patterns (KpiCard/Sparkline/Delta, bottom-sheet/dialogue
// centré, polling silencieux) répliqués localement à l'identique de
// ClockInShiftTab.tsx — aucune librairie de charts, aucun composant
// partagé exporté, convention confirmée du projet.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import {
  SIGNALEMENT_STATUTS, SIGNALEMENT_STATUT_LABELS,
  SIGNALEMENT_PRIORITES, SIGNALEMENT_PRIORITE_LABELS,
  SIGNALEMENT_RESOLUTION_ACTION_LABELS,
  SIGNALEMENT_MOTIFS_INSTITUTION,
  type SignalementStatut, type SignalementPriorite, type SignalementResolutionAction, type SignalementEscaladeNiveau,
} from "@/lib/signalementsConstants";

const inputStyle = (C: ThemeTokens): React.CSSProperties => ({
  width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "11px 14px", color: C.t1, fontSize: "14px", fontFamily: "inherit",
});
const labelStyle = (C: ThemeTokens): React.CSSProperties => ({
  color: C.t3, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em",
  display: "block", marginBottom: "7px", fontWeight: "600",
});

// ── Types ────────────────────────────────────────────────────────────────
type Signalement = {
  id: string;
  numero_public: string;
  motif: string;
  description: string | null;
  preuve_url: string | null;
  statut: SignalementStatut;
  priorite: SignalementPriorite;
  escalade_niveau: SignalementEscaladeNiveau;
  assigne_a_membre_id: string | null;
  created_at: string;
  citoyen_id: string;
  citoyen_name?: string;
  citoyen_phone?: string | null;
  // "institution" = déposé par vous, "citoyen" = déposé contre vous — la
  // liste inclut désormais les deux sens (chantier arbitrage Yelen,
  // 15/08/2026), auparavant l'institution n'avait qu'une notification.
  type_signaleur: "institution" | "citoyen";
};
type SignalementEventRow = {
  id: string; audit_id: string; type: string; acteur_type: string; membre_nom: string;
  ancienne_valeur: Record<string, unknown> | null; nouvelle_valeur: Record<string, unknown> | null;
  commentaire: string | null; created_at: string;
};
type SignalementNoteRow = { id: string; auteur_nom: string; contenu: string; created_at: string };
type SignalementAttachmentRow = { id: string; nom_original: string; type_mime: string; taille: number; ajoute_par_nom: string; created_at: string };
type SignalementDetail = {
  signalement: Signalement & {
    resolution_action: string | null; resolution_explication: string | null;
    doublon_de_signalement_id: string | null; resolu_le: string | null; cloture_le: string | null;
    incident_date: string | null; incident_heure: string | null;
  };
  events: SignalementEventRow[];
  attachments: SignalementAttachmentRow[];
  notes: SignalementNoteRow[] | null; // null = non autorisé (signalements.notes_read absent), distingué d'une liste vide
};
type Membre = { id: string; prenom: string; nom: string };
type CitoyenOption = { id: string; nom: string; phone: string; nb_rdv?: number; dernier_rdv?: string };
type RdvOption = { id: string; objet: string | null; date_rdv: string; heure_rdv: string; statut: string };

// ── Constantes métier ───────────────────────────────────────────────────
// Source unique désormais lib/signalementsConstants.ts (chantier RDV
// obligatoire, 15/08/2026) — le nom local MOTIFS_INSTITUTION est conservé
// pour ne pas toucher aux ~15 usages existants dans ce fichier.
const MOTIFS_INSTITUTION = SIGNALEMENT_MOTIFS_INSTITUTION;
function motifLabel(m: string) { return MOTIFS_INSTITUTION.find(x => x.value === m)?.label || m; }
function formatDateRdv(d: string) { return new Date(`${d}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); }

const SIG_STATUT_CFG = (C: ThemeTokens): Record<string, { label: string; color: string; bg: string }> =>
  Object.fromEntries(SIGNALEMENT_STATUTS.map(s => {
    const traite = s === "resolu" || s === "cloture";
    const ecarte = s === "rejete" || s === "doublon";
    const color = traite ? C.green : ecarte ? C.red : C.gold;
    return [s, { label: SIGNALEMENT_STATUT_LABELS[s], color, bg: traite ? C.greenL : ecarte ? C.redL : `${C.gold}15` }];
  }));

// Priorité — axe distinct du statut (brief §5) : le rouge n'est utilisé
// que pour "critique", jamais comme couleur dominante de tout l'écran.
function prioriteColor(p: SignalementPriorite, C: ThemeTokens): string {
  return p === "critique" ? C.red : p === "haute" ? C.orange : p === "faible" ? C.blue : C.t2;
}
function prioriteBg(p: SignalementPriorite, C: ThemeTokens): string {
  return p === "critique" ? C.redL : p === "haute" ? C.orangeL : p === "faible" ? C.blueL : C.bg3;
}

const EVENT_LABELS: Record<string, string> = {
  created: "a créé le signalement",
  assigned: "a assigné le cas",
  priority_changed: "a changé la priorité",
  status_changed: "a changé le statut",
  note_added: "a ajouté une note interne",
  attachment_added: "a ajouté une pièce jointe",
  resolved: "a résolu le cas",
  reopened: "a réouvert le cas",
  closed: "a clôturé le cas",
  escalated: "a escaladé le cas",
  marked_duplicate: "a marqué ce cas comme doublon",
};

function formatDateSig(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function formatDateHeureSig(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) + " à " + dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function ilYA(depuis: Date, maintenant: number): string {
  const s = Math.max(0, Math.floor((maintenant - depuis.getTime()) / 1000));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.floor(m / 60)}h`;
}

// ── Petits composants locaux (répliqués de ClockInShiftTab.tsx) ────────
function Ic_Chevron({ C }: { C: ThemeTokens }) { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>; }

// Illustration sur mesure Yelen pour l'état vide (aucun signalement créé) —
// même langage que ClockInShiftTab.tsx/MesOffresTab.tsx : trait, un seul
// accent doré, jamais de fond noir. Un bouclier + coche : une liste vide
// de signalements est une bonne nouvelle, pas une erreur — l'illustration
// et le message doivent le refléter, pas afficher un vide "cassé".
function IllustrationSignalements({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M48 22c8 5 16 6 16 6v20c0 14-9 21-16 26-7-5-16-12-16-26V28s8-1 16-6z" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <circle cx="48" cy="46" r="12" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M43 46l3.5 3.5L54 42" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Une illustration + un message par pilule de filtre rapide (Ouverts/En
// cours/Résolus/Rejetés) — un tableau vide filtré n'est pas la même
// situation qu'un compte tout neuf : chaque état a sa propre "bonne
// nouvelle" à formuler plutôt qu'un texte générique unique.
function IllustrationOuverts({ C }: { C: ThemeTokens }) {
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
function IllustrationEnCours({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <circle cx="48" cy="48" r="27" stroke={C.border2} strokeWidth="2" strokeDasharray="3 6"/>
      <circle cx="48" cy="48" r="17" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M48 40v9l7 4" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationResolus({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M39 55l-5 15 14-7 14 7-5-15" stroke={C.t3} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx="48" cy="40" r="18" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M48 32l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" fill={C.gold}/>
    </svg>
  );
}
function IllustrationRejetes({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <rect x="24" y="34" width="48" height="14" rx="4" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M28 48h40v20a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4V48z" fill={C.bgCard} stroke={C.t3} strokeWidth="2"/>
      <path d="M42 58h12" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

const FILTRE_RAPIDE_VIDE: Record<"ouverts" | "en_cours" | "resolus" | "rejetes", { illustration: (C: ThemeTokens) => React.ReactNode; titre: string; texte: string }> = {
  ouverts: {
    illustration: (C) => <IllustrationOuverts C={C}/>,
    titre: "Aucun cas à traiter",
    texte: "Tous les signalements ouverts ont été pris en charge par votre équipe.",
  },
  en_cours: {
    illustration: (C) => <IllustrationEnCours C={C}/>,
    titre: "Aucun cas en cours",
    texte: "Aucun signalement n'est actuellement en traitement actif.",
  },
  resolus: {
    illustration: (C) => <IllustrationResolus C={C}/>,
    titre: "Aucun cas résolu",
    texte: "Les signalements résolus ou clôturés par votre équipe apparaîtront ici.",
  },
  rejetes: {
    illustration: (C) => <IllustrationRejetes C={C}/>,
    titre: "Aucun cas rejeté",
    texte: "Les signalements rejetés ou identifiés comme doublons apparaîtront ici.",
  },
};

function SigEmptyState({ C, illustration, titre, texte, cta }: {
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

function SigSparkline({ serie, color }: { serie: number[]; color: string }) {
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
function SigDelta({ delta, C }: { delta: number | null; C: ThemeTokens }) {
  if (delta === null) return <span style={{ color: C.t3, fontSize: "10px" }}>Pas de comparaison</span>;
  if (delta === 0) return <span style={{ color: C.t3, fontSize: "10px", fontWeight: 700 }}>= vs hier</span>;
  const positif = delta > 0;
  return <span style={{ color: positif ? C.green : C.red, fontSize: "10px", fontWeight: 700 }}>{positif ? "+" : ""}{delta} vs hier</span>;
}
function SigKpiCard({ label, icon, color, value, delta, serie, C }: {
  label: string; icon: React.ReactNode; color: string; value: string; delta: number | null; serie: number[]; C: ThemeTokens;
}) {
  return (
    <Card tokens={toCardTokens(C)} padding="18px" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "9px", backgroundColor: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
        <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
      </div>
      <div style={{ color: C.t1, fontSize: "28px", fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <SigDelta delta={delta} C={C}/>
      {serie.some(v => v > 0) && <SigSparkline serie={serie} color={color}/>}
    </Card>
  );
}

function SigModal({ C, titre, onClose, children }: { C: ThemeTokens; titre: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`@media(min-width:640px){.sig-modal-panel{align-self:center!important;border-radius:20px!important}}`}</style>
      <div onClick={e => e.stopPropagation()} className="sig-modal-panel" style={{ backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px 20px calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "440px", border: `1px solid ${C.border2}`, animation: "slideUp 0.25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 style={{ color: C.t1, fontSize: "15px", fontWeight: 800, margin: 0 }}>{titre}</h3>
          <button onClick={onClose} className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SignalementsTab({ access = "full", active = true }: { instId: string; access?: "full" | "read"; active?: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  // Gate d'affichage UI seulement — le serveur reste seul juge réel
  // (signalements.write/manage/reopen/notes_write, vérifiées par can()
  // dans chaque route). Ce booléen évite juste de montrer des contrôles
  // évidemment interdits à un rôle "read".
  const canWrite = access !== "read";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vue, setVue] = useState<"liste" | "creation">("liste");
  const [signalements, setSignalements] = useState<Signalement[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [citoyens, setCitoyens] = useState<CitoyenOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());

  const [recherche, setRecherche] = useState("");
  const [filtreRapide, setFiltreRapide] = useState<"tous" | "ouverts" | "en_cours" | "resolus" | "rejetes">("tous");
  const [filtresAvances, setFiltresAvances] = useState(false);
  const [filtrePriorite, setFiltrePriorite] = useState("");
  const [filtreAssigne, setFiltreAssigne] = useState("");
  const [filtreMotif, setFiltreMotif] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SignalementDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Un seul type de modale reste possible côté institution (chantier
  // arbitrage Yelen, 15/08/2026) — voir app/admin/moderation.tsx (onglet
  // "Cas") pour les décisions (priorité/résolution/clôture/réouverture/
  // escalade/doublon), désormais réservées à Yelen.
  const [activeModal, setActiveModal] = useState<null | "assigner">(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const [formAssigne, setFormAssigne] = useState("");
  const [formNote, setFormNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [etapeCreation, setEtapeCreation] = useState<"identification" | "situation" | "verify" | "succes">("identification");
  const [creCitoyenId, setCreCitoyenId] = useState("");
  const [creCitoyenRecherche, setCreCitoyenRecherche] = useState("");
  const [creRdvId, setCreRdvId] = useState("");
  const [rdvsEligibles, setRdvsEligibles] = useState<RdvOption[]>([]);
  const [loadingRdvsEligibles, setLoadingRdvsEligibles] = useState(false);
  const [creMotif, setCreMotif] = useState("");
  const [creDescription, setCreDescription] = useState("");
  const [creIncidentDate, setCreIncidentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creIncidentHeure, setCreIncidentHeure] = useState(() => new Date().toTimeString().slice(0, 5));
  const [creFichiers, setCreFichiers] = useState<{ file: File; preview: string | null }[]>([]);
  const [creConfirme, setCreConfirme] = useState(false);
  const [creSaving, setCreSaving] = useState(false);
  const [creError, setCreError] = useState("");
  const [creNumeroPublic, setCreNumeroPublic] = useState("");
  const [creSignalementId, setCreSignalementId] = useState("");
  const MAX_PIECES_JOINTES = 5;

  // ── Chargement ──────────────────────────────────────────────────────
  const chargerListe = useCallback(async (avecSpinner: boolean) => {
    if (avecSpinner) setLoading(true);
    try {
      const res = await fetch("/api/institution/signalements");
      const json = await res.json().catch(() => null);
      if (res.ok && json?.signalements) setSignalements(json.signalements);
      setLastSync(new Date());
    } catch {}
    if (avecSpinner) setLoading(false);
  }, []);

  const chargerMembres = useCallback(async () => {
    const res = await fetch("/api/institution/membres");
    const json = await res.json().catch(() => null);
    if (res.ok && json?.membres) setMembres(json.membres);
  }, []);

  // Réutilise la route déjà correctement scopée (institution_id dérivé du
  // JWT, jamais du client) au lieu d'une requête directe côté navigateur :
  // `rdv` n'a de policy RLS que pour le citoyen (auth.uid() = citoyen_id),
  // aucune pour l'institution (auth JWT custom, pas de session Supabase
  // Auth) — la requête directe précédente ne renvoyait donc jamais aucun
  // résultat, bug réel signalé par Bryan le 09/08/2026.
  const chargerCitoyens = useCallback(async () => {
    const res = await fetch("/api/institution/clients");
    const json = await res.json().catch(() => null);
    if (res.ok && Array.isArray(json?.clients)) {
      setCitoyens(json.clients.map((c: { id: string; nom: string; phone: string; nb_rdv?: number; dernier_rdv?: string }) => ({ id: c.id, nom: c.nom, phone: c.phone, nb_rdv: c.nb_rdv, dernier_rdv: c.dernier_rdv })));
    }
  }, []);

  useEffect(() => { chargerListe(true); chargerMembres(); chargerCitoyens(); }, [chargerListe, chargerMembres, chargerCitoyens]);

  // RDV éligibles pour le citoyen choisi — rechargés à chaque changement,
  // le RDV précédemment sélectionné n'a aucune raison de rester valide pour
  // un autre citoyen.
  useEffect(() => {
    setCreRdvId(""); setRdvsEligibles([]);
    if (!creCitoyenId) return;
    setLoadingRdvsEligibles(true);
    fetch(`/api/institution/signalements/rdv-eligibles?citoyen_id=${creCitoyenId}`)
      .then(res => res.json())
      .then(json => { if (Array.isArray(json?.rdvs)) setRdvsEligibles(json.rdvs); })
      .catch(() => {})
      .finally(() => setLoadingRdvsEligibles(false));
  }, [creCitoyenId]);

  // Polling "Live" 30s — jamais setLoading(true) ici (bug déjà corrigé une
  // fois sur Équipe/ClockInShift cette session : ça remplaçait tout
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

  const chargerDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/institution/signalements/${id}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.signalement) setDetail(json);
    } catch {}
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    chargerDetail(selectedId);
  }, [selectedId, chargerDetail]);

  function membreNom(id: string | null): string {
    if (!id) return "—";
    const m = membres.find(x => x.id === id);
    return m ? `${m.prenom} ${m.nom}` : "—";
  }

  // ── KPI ─────────────────────────────────────────────────────────────
  const kpiOuverts = signalements.filter(s => s.statut === "nouveau" || s.statut === "a_traiter").length;
  const kpiPrioriteElevee = signalements.filter(s => s.priorite === "critique" || s.priorite === "haute").length;
  const kpiEnCours = signalements.filter(s => s.statut === "en_cours" || s.statut === "en_attente").length;
  const kpiResolus = signalements.filter(s => s.statut === "resolu" || s.statut === "cloture").length;

  // Tendance 8 jours = nouveaux cas créés par jour correspondant au filtre
  // (pas un historique reconstruit de statut journalier — cette donnée
  // n'existe pas, même limitation déjà documentée pour les KPI Employés
  // ailleurs sur ce dashboard). Valeur affichée en gros = compteur courant
  // réel, la sparkline montre juste le rythme de création récent.
  function serieCreation(filtre: (s: Signalement) => boolean): number[] {
    const jours: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const jour = new Date(); jour.setDate(jour.getDate() - i);
      const jourStr = jour.toISOString().slice(0, 10);
      jours.push(signalements.filter(s => filtre(s) && s.created_at.slice(0, 10) === jourStr).length);
    }
    return jours;
  }
  function deltaCreationJour(filtre: (s: Signalement) => boolean): number {
    const hier = new Date(); hier.setDate(hier.getDate() - 1);
    const avantHier = new Date(); avantHier.setDate(avantHier.getDate() - 2);
    const hierStr = hier.toISOString().slice(0, 10);
    const avantHierStr = avantHier.toISOString().slice(0, 10);
    return signalements.filter(s => filtre(s) && s.created_at.slice(0, 10) === hierStr).length
      - signalements.filter(s => filtre(s) && s.created_at.slice(0, 10) === avantHierStr).length;
  }

  // ── Filtrage liste ──────────────────────────────────────────────────
  const listeFiltree = signalements.filter(s => {
    if (filtreRapide === "ouverts" && s.statut !== "nouveau" && s.statut !== "a_traiter") return false;
    if (filtreRapide === "en_cours" && s.statut !== "en_cours" && s.statut !== "en_attente") return false;
    if (filtreRapide === "resolus" && s.statut !== "resolu" && s.statut !== "cloture") return false;
    if (filtreRapide === "rejetes" && s.statut !== "rejete" && s.statut !== "doublon") return false;
    if (filtrePriorite && s.priorite !== filtrePriorite) return false;
    if (filtreAssigne && s.assigne_a_membre_id !== filtreAssigne) return false;
    if (filtreMotif && s.motif !== filtreMotif) return false;
    if (recherche.trim()) {
      const q = recherche.trim().toLowerCase();
      const hay = `${s.numero_public} ${motifLabel(s.motif)} ${s.citoyen_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // N'attribue le message dédié d'une pilule (Ouverts/En cours/Résolus/
  // Rejetés) que si c'est réellement elle seule qui explique la liste
  // vide — recherche ou filtres avancés actifs retombent sur un texte
  // générique "aucun résultat", plus honnête pour un vide provoqué par
  // une saisie utilisateur transitoire.
  const filtreRapideExclusif = !recherche.trim() && !filtrePriorite && !filtreAssigne && !filtreMotif && filtreRapide !== "tous";
  const filtreVideCfg = filtreRapideExclusif ? FILTRE_RAPIDE_VIDE[filtreRapide] : null;

  function exporterCsv() {
    const lignes = [
      ["N°", "Motif", "Citoyen", "Priorité", "Statut", "Assigné", "Créé le"],
      ...listeFiltree.map(s => [
        s.numero_public, motifLabel(s.motif), s.citoyen_name ?? "",
        SIGNALEMENT_PRIORITE_LABELS[s.priorite], SIG_STATUT_CFG(C)[s.statut]?.label ?? s.statut,
        membreNom(s.assigne_a_membre_id), formatDateSig(s.created_at),
      ]),
    ];
    const csv = lignes.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `signalements-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Actions fiche ───────────────────────────────────────────────────
  async function appelerAction(action: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!selectedId) return false;
    setModalSaving(true); setModalError("");
    try {
      const res = await fetch(`/api/institution/signalements/${selectedId}/actions`, {
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

  async function ajouterNoteInterne() {
    if (!selectedId || !formNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/institution/signalements/${selectedId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu: formNote.trim() }),
      });
      if (res.ok) { setFormNote(""); await chargerDetail(selectedId); }
    } catch {}
    setSavingNote(false);
  }

  async function televerserPreuve(file: File) {
    if (!selectedId) return;
    const form = new FormData();
    form.set("file", file);
    await fetch(`/api/institution/signalements/${selectedId}/attachments`, { method: "POST", body: form });
    await chargerDetail(selectedId);
  }

  async function telechargerPreuve(attachmentId: string) {
    if (!selectedId) return;
    const res = await fetch(`/api/institution/signalements/${selectedId}/attachments?download=${attachmentId}`);
    const json = await res.json().catch(() => null);
    if (json?.url) window.open(json.url, "_blank");
  }

  // ── Création ────────────────────────────────────────────────────────
  function resetCreation() {
    setEtapeCreation("identification"); setCreCitoyenId(""); setCreCitoyenRecherche(""); setCreRdvId(""); setRdvsEligibles([]); setCreMotif(""); setCreDescription("");
    setCreIncidentDate(new Date().toISOString().slice(0, 10)); setCreIncidentHeure(new Date().toTimeString().slice(0, 5));
    setCreFichiers([]); setCreConfirme(false); setCreError(""); setCreNumeroPublic(""); setCreSignalementId("");
  }
  function validerEtapeIdentification() {
    setCreError("");
    if (!creCitoyenId) { setCreError("Sélectionnez un citoyen."); return; }
    if (!creMotif) { setCreError("Choisissez un motif de signalement."); return; }
    setEtapeCreation("situation");
  }
  function validerEtapeSituation() {
    setCreError("");
    if (!creDescription.trim() || creDescription.trim().length < 20) { setCreError("Décrivez le problème en au moins 20 caractères."); return; }
    if (creDescription.trim().length > 1000) { setCreError("Description limitée à 1000 caractères."); return; }
    if (!creIncidentDate) { setCreError("Indiquez la date de l'incident."); return; }
    setEtapeCreation("verify");
  }
  function ajouterFichiers(fichiers: FileList | null) {
    if (!fichiers) return;
    const nouveaux = Array.from(fichiers).slice(0, MAX_PIECES_JOINTES - creFichiers.length).map(file => ({
      file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setCreFichiers(prev => [...prev, ...nouveaux]);
  }
  function retirerFichier(index: number) {
    setCreFichiers(prev => prev.filter((_, i) => i !== index));
  }
  async function confirmerCreation() {
    if (!creConfirme) return;
    setCreSaving(true); setCreError("");
    try {
      const form = new FormData();
      form.set("citoyen_id", creCitoyenId);
      if (creRdvId) form.set("rdv_id", creRdvId);
      form.set("motif", creMotif);
      form.set("description", creDescription.trim());
      form.set("incident_date", creIncidentDate);
      if (creIncidentHeure) form.set("incident_heure", creIncidentHeure);
      creFichiers.forEach(f => form.append("files", f.file));
      const res = await fetch("/api/institution/signalements", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setCreError(json?.error || "Erreur lors de l'envoi. Réessayez."); setCreSaving(false); return; }
      setCreNumeroPublic(json.numeroPublic || "");
      setCreSignalementId(json.id || "");
      setEtapeCreation("succes");
      chargerListe(false);
    } catch {
      setCreError("Une erreur est survenue.");
    } finally {
      setCreSaving(false);
    }
  }

  const citoyenCree = citoyens.find(c => c.id === creCitoyenId);
  const rdvCree = rdvsEligibles.find(r => r.id === creRdvId);
  const citoyensTrouves = creCitoyenRecherche.trim().length > 0
    ? citoyens.filter(c => {
        const q = creCitoyenRecherche.trim().toLowerCase();
        return c.nom.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  // ─────────────────────────────────────────────────────────────────────
  // VUE CRÉATION — bottom-sheet mobile-first, dialogue centré ≥1024px
  // (convention .sig-fiche-* de la fiche détail plus bas dans ce même
  // fichier, dupliquée ici en .sig-creation-* — chantier RDV obligatoire +
  // PC, 15/08/2026).
  // ─────────────────────────────────────────────────────────────────────
  if (vue === "creation") {
    const etapeIndex = { identification: 0, situation: 1, verify: 2, succes: 3 }[etapeCreation];
    return (
      <>
        <style>{`
          @media(min-width:1024px){
            .sig-creation-overlay{align-items:center!important}
            .sig-creation-panel{max-width:760px!important;border-radius:20px!important;max-height:88svh!important}
            .sig-creation-grip{display:none!important}
            .sig-creation-close-x{display:flex!important}
          }
        `}</style>
        <div className="sig-creation-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => { resetCreation(); setVue("liste"); }}>
        <div onClick={e => e.stopPropagation()} className="sig-creation-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "92svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
          <div className="sig-creation-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
          <button onClick={() => { resetCreation(); setVue("liste"); }} className="sig-creation-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.t2 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          {etapeCreation !== "succes" && (
            <div style={{ marginBottom: "18px" }}>
              <h2 style={{ color: C.t1, fontSize: "17px", fontWeight: 800, margin: "0 0 3px" }}>Nouveau signalement</h2>
              <p style={{ color: C.t2, fontSize: "12.5px", margin: 0 }}>Signaler une situation concernant un citoyen.</p>
              <div style={{ display: "flex", gap: "5px", marginTop: "14px" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ height: "3px", flex: 1, borderRadius: "2px", backgroundColor: i <= etapeIndex ? C.gold : C.border }}/>
                ))}
              </div>
            </div>
          )}

          {etapeCreation === "identification" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ backgroundColor: `${C.gold}0f`, border: `1px solid ${C.gold}30`, borderRadius: "10px", padding: "12px 16px", fontSize: "12px", color: C.t2, lineHeight: 1.7 }}>
                <strong style={{ color: C.t1 }}>À savoir —</strong> votre signalement sera examiné par l&apos;équipe Yelen. Un signalement ne constitue pas automatiquement une sanction. Décrivez uniquement des faits précis et vérifiables.
              </div>

              <div>
                <label style={labelStyle(C)}>Citoyen concerné *</label>
                {citoyenCree ? (
                  <div style={{ backgroundColor: `${C.gold}0f`, border: `1px solid ${C.gold}40`, borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", color: C.t1, fontSize: "13.5px", fontWeight: 700 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {citoyenCree.nom}
                    </span>
                    <button onClick={() => { setCreCitoyenId(""); setCreCitoyenRecherche(""); }} className="tap" style={{ background: "none", border: "none", color: C.t3, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Changer</button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: "relative" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input value={creCitoyenRecherche} onChange={e => setCreCitoyenRecherche(e.target.value)} placeholder="Rechercher un nom ou un téléphone…" style={{ ...inputStyle(C), paddingLeft: "38px" }}/>
                    </div>
                    {creCitoyenRecherche.trim() && (
                      citoyensTrouves.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                          {citoyensTrouves.map(c => (
                            <div key={c.id} onClick={() => { setCreCitoyenId(c.id); }} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px", cursor: "pointer" }}>
                              <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 700 }}>{c.nom}</div>
                              <div style={{ color: C.t3, fontSize: "11px", marginTop: "2px" }}>
                                {c.phone}{typeof c.nb_rdv === "number" && ` · ${c.nb_rdv} rendez-vous`}{c.dernier_rdv && ` · Dernier : ${formatDateRdv(c.dernier_rdv)}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginTop: "8px" }}>
                          <p style={{ color: C.t1, fontSize: "13px", fontWeight: 700, margin: "0 0 4px" }}>Aucun citoyen trouvé</p>
                          <p style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6, margin: 0 }}>
                            Vérifiez le nom ou le numéro saisi. Un citoyen doit avoir une relation enregistrée avec votre établissement pour pouvoir faire l&apos;objet d&apos;un signalement.
                          </p>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>

              <div>
                <label style={labelStyle(C)}>Pourquoi souhaitez-vous effectuer ce signalement ? *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {MOTIFS_INSTITUTION.map(m => (
                    <div key={m.value} onClick={() => setCreMotif(m.value)} className="tap" style={{ backgroundColor: creMotif === m.value ? `${C.gold}12` : C.bgCard, border: `1px solid ${creMotif === m.value ? C.gold : C.border}`, borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, border: `2px solid ${creMotif === m.value ? C.gold : C.border2}`, backgroundColor: creMotif === m.value ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {creMotif === m.value && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#000" }}/>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "13px", fontWeight: "700", color: C.t1, margin: "0 0 2px" }}>{m.label}</p>
                        <p style={{ fontSize: "11px", color: C.t3, margin: 0 }}>{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {creError && <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "12px 16px", color: C.red, fontSize: "13px" }}>{creError}</div>}

              <div style={{ display: "flex", gap: "10px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => { resetCreation(); setVue("liste"); }}>Annuler</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} disabled={!creCitoyenId || !creMotif} onClick={validerEtapeIdentification}>Continuer →</Button>
              </div>
            </div>
          )}

          {etapeCreation === "situation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: 800, margin: "0 0 3px" }}>Décrivez la situation</h3>
                <p style={{ color: C.t2, fontSize: "12px", margin: 0 }}>Donnez uniquement les faits utiles à l&apos;examen du signalement.</p>
              </div>

              <div>
                <label style={labelStyle(C)}>Que s&apos;est-il passé ? * <span style={{ color: C.t3, textTransform: "none", letterSpacing: 0, fontWeight: "500" }}>(min. 20 caractères)</span></label>
                <textarea value={creDescription} onChange={e => setCreDescription(e.target.value.slice(0, 1000))} rows={4} placeholder="Décrivez précisément la situation…" style={{ ...inputStyle(C), resize: "none", lineHeight: 1.6 }}/>
                <p style={{ fontSize: "11px", color: creDescription.length >= 20 ? C.t3 : C.t3, marginTop: "4px", textAlign: "right" }}>{creDescription.length} / 1 000 caractères</p>
              </div>

              <div>
                <label style={labelStyle(C)}>Quand la situation s&apos;est-elle produite ? *</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="date" value={creIncidentDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setCreIncidentDate(e.target.value)} style={{ ...inputStyle(C), flex: 1 }}/>
                  <input type="time" value={creIncidentHeure} onChange={e => setCreIncidentHeure(e.target.value)} style={{ ...inputStyle(C), width: "120px" }}/>
                </div>
              </div>

              <div>
                <label style={labelStyle(C)}>Rendez-vous concerné</label>
                {loadingRdvsEligibles ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: C.t3, fontSize: "12.5px", padding: "10px 0" }}>
                    <YelenLoader size={14}/> Chargement des rendez-vous…
                  </div>
                ) : (
                  <select value={creRdvId} onChange={e => setCreRdvId(e.target.value)} style={{ ...inputStyle(C), color: creRdvId ? C.t1 : C.t3 }}>
                    <option value="">Aucun rendez-vous spécifique</option>
                    {rdvsEligibles.map(r => (
                      <option key={r.id} value={r.id}>{formatDateRdv(r.date_rdv)} à {r.heure_rdv?.slice(0, 5)} — {r.objet || "RDV général"}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={labelStyle(C)}>Ajouter un justificatif <span style={{ color: C.t3, textTransform: "none", letterSpacing: 0, fontWeight: "500" }}>(optionnel)</span></label>
                <p style={{ color: C.t3, fontSize: "11.5px", margin: "0 0 8px" }}>Photos, documents ou autres éléments utiles à l&apos;examen.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: creFichiers.length > 0 ? "10px" : 0 }}>
                  {creFichiers.map((f, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      {f.preview ? (
                        // IMG-EXCEPTION: reason=preview vaut une URL blob: locale (URL.createObjectURL), non fetchable par l'optimiseur next/image | reviewed=2026-09-16
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} style={{ height: "64px", width: "64px", borderRadius: "8px", objectFit: "cover", border: `1px solid ${C.border}` }} alt=""/>
                      ) : (
                        <div style={{ height: "64px", width: "64px", borderRadius: "8px", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: C.bg3 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                      )}
                      <button onClick={() => retirerFichier(i)} style={{ position: "absolute", top: "-7px", right: "-7px", backgroundColor: C.t1, border: "none", color: C.bgCard, width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  ))}
                </div>
                {creFichiers.length < MAX_PIECES_JOINTES && (
                  <button onClick={() => fileInputRef.current?.click()} className="tap" style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "10px", padding: "10px 16px", color: C.t2, fontSize: "12.5px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ajouter un fichier
                  </button>
                )}
                <p style={{ color: C.t3, fontSize: "10.5px", marginTop: "8px" }}>Formats acceptés : PDF, JPG, PNG — Taille maximale : 10 MB</p>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" multiple onChange={e => { ajouterFichiers(e.target.files); e.target.value = ""; }} style={{ display: "none" }}/>
              </div>

              {creError && <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "12px 16px", color: C.red, fontSize: "13px" }}>{creError}</div>}

              <div style={{ display: "flex", gap: "10px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setEtapeCreation("identification")}>Retour</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} onClick={validerEtapeSituation}>Continuer →</Button>
              </div>
            </div>
          )}

          {etapeCreation === "verify" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: 800, margin: "0 0 3px" }}>Vérifiez votre signalement</h3>
                <p style={{ color: C.t2, fontSize: "12px", margin: 0 }}>Dernière étape avant l&apos;envoi.</p>
              </div>
              <Card tokens={toCardTokens(C)} padding="16px 18px" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Citoyen</div>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>{citoyenCree?.nom}</div>
                </div>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Motif</div>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>{motifLabel(creMotif)}</div>
                </div>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Date</div>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>{formatDateRdv(creIncidentDate)}{creIncidentHeure && ` · ${creIncidentHeure}`}</div>
                </div>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Rendez-vous concerné</div>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 700 }}>
                    {rdvCree ? `${formatDateRdv(rdvCree.date_rdv)} à ${rdvCree.heure_rdv?.slice(0, 5)} — ${rdvCree.objet || "RDV général"}` : "Aucun rendez-vous spécifique"}
                  </div>
                </div>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Description</div>
                  <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6 }}>{creDescription}</div>
                </div>
                {creFichiers.length > 0 && (
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "6px" }}>Pièces jointes ({creFichiers.length})</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {creFichiers.map((f, i) => f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={f.preview} style={{ height: "56px", width: "56px", borderRadius: "8px", objectFit: "cover", border: `1px solid ${C.border}` }} alt=""/>
                      ) : (
                        <div key={i} style={{ color: C.t2, fontSize: "11px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px" }}>{f.file.name}</div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                <input type="checkbox" checked={creConfirme} onChange={e => setCreConfirme(e.target.checked)} style={{ marginTop: "2px", accentColor: C.gold, width: "16px", height: "16px", flexShrink: 0 }}/>
                <span style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6 }}>Je confirme que ce signalement décrit des faits réels et précis, au meilleur de ma connaissance.</span>
              </label>

              {creError && <div style={{ backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "10px", padding: "12px 16px", color: C.red, fontSize: "13px" }}>{creError}</div>}

              <div style={{ display: "flex", gap: "10px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setEtapeCreation("situation")}>Retour</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} disabled={!creConfirme} loading={creSaving} onClick={confirmerCreation}>Envoyer le signalement</Button>
              </div>
            </div>
          )}

          {etapeCreation === "succes" && (
            <div style={{ textAlign: "center", padding: "20px 10px 4px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: "0 0 4px" }}>Signalement envoyé</p>
              <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 20px", lineHeight: 1.6 }}>Votre signalement a bien été transmis à l&apos;équipe compétente pour examen.</p>
              <Card tokens={toCardTokens(C)} padding="14px 16px" style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left", marginBottom: "20px" }}>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Référence</div>
                  <div style={{ color: C.gold, fontSize: "14px", fontWeight: 700, fontFamily: "monospace" }}>{creNumeroPublic}</div>
                </div>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Citoyen</div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{citoyenCree?.nom}</div>
                </div>
                <div>
                  <div style={{ color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", marginBottom: "3px" }}>Motif</div>
                  <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700 }}>{motifLabel(creMotif)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.gold }}/>
                  <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: 700 }}>En cours d&apos;examen</span>
                </div>
              </Card>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => { resetCreation(); setVue("liste"); }}>Fermer</Button>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 1 }} onClick={() => { const id = creSignalementId; resetCreation(); setVue("liste"); if (id) setSelectedId(id); }}>Voir le signalement</Button>
              </div>
            </div>
          )}
        </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // VUE LISTE — boîte de réception
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <style>{`
        @media(max-width:759px){ .sig-table{ display:none!important } }
        @media(min-width:760px){ .sig-cards{ display:none!important } }
        @media(min-width:1024px){
          .sig-fiche-overlay{align-items:center!important}
          .sig-fiche-panel{max-width:920px!important;border-radius:20px!important;max-height:86svh!important}
          .sig-fiche-grip{display:none!important}
          .sig-fiche-close-x{display:flex!important}
          .sig-fiche-body{display:grid!important;grid-template-columns:1.1fr 1fr;gap:24px;align-items:start}
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
        <div>
          <h1 className="yelen-h2" style={{ color: C.t1, marginBottom: "4px" }}>Signalements</h1>
          <p style={{ color: C.t2, fontSize: "12.5px", marginBottom: "6px" }}>Gestion des cas de signalement — création, traitement, résolution.</p>
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
            tokens={toUiTokens(C)}
            className="tap"
            variant="secondary"
            size="sm"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>}
            onClick={() => chargerListe(true)}
          >
            Actualiser
          </Button>
          {canWrite && (
            <Button
              tokens={toUiTokens(C)}
              className="tap"
              variant="primary"
              size="sm"
              icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
              onClick={() => setVue("creation")}
            >
              Nouveau signalement
            </Button>
          )}
        </div>
      </div>

      {/* KPI exécutifs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        <SigKpiCard label="À traiter" color={C.gold} value={String(kpiOuverts)} delta={deltaCreationJour(s => s.statut === "nouveau" || s.statut === "a_traiter")} serie={serieCreation(s => s.statut === "nouveau" || s.statut === "a_traiter")} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>}/>
        <SigKpiCard label="Priorité élevée" color={C.red} value={String(kpiPrioriteElevee)} delta={deltaCreationJour(s => s.priorite === "critique" || s.priorite === "haute")} serie={serieCreation(s => s.priorite === "critique" || s.priorite === "haute")} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}/>
        <SigKpiCard label="En cours" color={C.blue} value={String(kpiEnCours)} delta={deltaCreationJour(s => s.statut === "en_cours" || s.statut === "en_attente")} serie={serieCreation(s => s.statut === "en_cours" || s.statut === "en_attente")} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}/>
        <SigKpiCard label="Résolus" color={C.green} value={String(kpiResolus)} delta={deltaCreationJour(s => s.statut === "resolu" || s.statut === "cloture")} serie={serieCreation(s => s.statut === "resolu" || s.statut === "cloture")} C={C}
          icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
      </div>

      {/* Recherche + filtres */}
      <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un numéro, un motif, un citoyen…" style={{ ...inputStyle(C), marginBottom: "10px" }}/>
      <div style={{ display: "flex", gap: "6px", marginBottom: "10px", overflowX: "auto" }}>
        {([
          { key: "tous", label: "Tous" },
          { key: "ouverts", label: "À traiter" },
          { key: "en_cours", label: "En cours" },
          { key: "resolus", label: "Résolus" },
          { key: "rejetes", label: "Rejetés" },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFiltreRapide(f.key)} className="tap" style={{ backgroundColor: filtreRapide === f.key ? C.gold : C.bg3, color: filtreRapide === f.key ? "#000" : C.t2, border: `1px solid ${filtreRapide === f.key ? C.gold : C.border}`, fontWeight: 700, fontSize: "11.5px", padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap" }}>{f.label}</button>
        ))}
        <button onClick={() => setFiltresAvances(v => !v)} className="tap" style={{ backgroundColor: filtresAvances ? `${C.gold}15` : C.bg3, color: filtresAvances ? C.gold : C.t2, border: `1px solid ${filtresAvances ? C.gold + "50" : C.border}`, fontWeight: 700, fontSize: "11.5px", padding: "7px 12px", borderRadius: "20px", cursor: "pointer", whiteSpace: "nowrap" }}>Filtres avancés</button>
      </div>
      {filtresAvances && (
        <Card tokens={toCardTokens(C)} padding="12px" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "14px" }}>
          <select value={filtrePriorite} onChange={e => setFiltrePriorite(e.target.value)} style={inputStyle(C)}>
            <option value="">Toutes priorités</option>
            {SIGNALEMENT_PRIORITES.map(p => <option key={p} value={p}>{SIGNALEMENT_PRIORITE_LABELS[p]}</option>)}
          </select>
          <select value={filtreAssigne} onChange={e => setFiltreAssigne(e.target.value)} style={inputStyle(C)}>
            <option value="">Tous les assignés</option>
            {membres.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          <select value={filtreMotif} onChange={e => setFiltreMotif(e.target.value)} style={inputStyle(C)}>
            <option value="">Tous les motifs</option>
            {MOTIFS_INSTITUTION.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Card>
      )}

      {/* Liste */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><YelenLoader size={32}/></div>
      ) : signalements.length === 0 ? (
        <SigEmptyState C={C} illustration={<IllustrationSignalements C={C}/>}
          titre="Rien à signaler pour l'instant"
          texte="Les signalements créés par votre équipe, ou remontés par un citoyen, apparaîtront ici avec leur historique de traitement complet."
          cta={canWrite ? { label: "+ Nouveau signalement", onClick: () => setVue("creation") } : undefined}/>
      ) : listeFiltree.length === 0 && filtreVideCfg ? (
        <SigEmptyState C={C} illustration={filtreVideCfg.illustration(C)} titre={filtreVideCfg.titre} texte={filtreVideCfg.texte}/>
      ) : listeFiltree.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="32px" style={{ textAlign: "center", color: C.t2, fontSize: "13px" }}>
          Aucun signalement ne correspond à ces critères.
        </Card>
      ) : (
        <>
          {/* Desktop : tableau */}
          <Card tokens={toCardTokens(C)} padding="0" className="sig-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["N°", "Sens", "Signalement", "Citoyen", "Priorité", "Statut", "Assigné", "Créé", ""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: C.t3, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listeFiltree.map((s, i, arr) => {
                  const cfg = SIG_STATUT_CFG(C)[s.statut];
                  const estime = s.statut === "cloture" || s.statut === "rejete" || s.statut === "doublon";
                  return (
                    <tr key={s.id} onClick={() => setSelectedId(s.id)} className="tap" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", opacity: estime ? 0.55 : 1 }}>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap", fontFamily: "monospace", color: C.t2, fontSize: "11px" }}>{s.numero_public}</td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ backgroundColor: s.type_signaleur === "citoyen" ? C.orangeL : C.bg3, color: s.type_signaleur === "citoyen" ? C.orange : C.t2, fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px" }}>{s.type_signaleur === "citoyen" ? "Contre vous" : "Déposé par vous"}</span>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.t1, fontWeight: 700, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{motifLabel(s.motif)}</td>
                      <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{s.citoyen_name || "—"}</td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ backgroundColor: prioriteBg(s.priorite, C), color: prioriteColor(s.priorite, C), fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{SIGNALEMENT_PRIORITE_LABELS[s.priorite]}</span>
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{cfg.label}</span>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.t2, whiteSpace: "nowrap" }}>{membreNom(s.assigne_a_membre_id)}</td>
                      <td style={{ padding: "12px 14px", color: C.t3, whiteSpace: "nowrap" }}>{formatDateSig(s.created_at)}</td>
                      <td style={{ padding: "12px 14px" }}><Ic_Chevron C={C}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile : cards */}
          <div className="sig-cards" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {listeFiltree.map(s => {
              const cfg = SIG_STATUT_CFG(C)[s.statut];
              const estime = s.statut === "cloture" || s.statut === "rejete" || s.statut === "doublon";
              return (
                <Card key={s.id} tokens={toCardTokens(C)} padding="14px 16px" onClick={() => setSelectedId(s.id)} className="tap" style={{ opacity: estime ? 0.6 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontFamily: "monospace", color: C.t3, fontSize: "10.5px" }}>{s.numero_public}</span>
                    <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px" }}>{cfg.label}</span>
                  </div>
                  <span style={{ display: "inline-block", backgroundColor: s.type_signaleur === "citoyen" ? C.orangeL : C.bg3, color: s.type_signaleur === "citoyen" ? C.orange : C.t2, fontSize: "9.5px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px", marginBottom: "6px" }}>{s.type_signaleur === "citoyen" ? "Contre vous" : "Déposé par vous"}</span>
                  <p style={{ color: C.t1, fontSize: "14px", fontWeight: 700, margin: "0 0 3px" }}>{motifLabel(s.motif)}</p>
                  <p style={{ color: C.t2, fontSize: "12px", margin: "0 0 8px" }}>{s.citoyen_name || "—"}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ backgroundColor: prioriteBg(s.priorite, C), color: prioriteColor(s.priorite, C), fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "20px" }}>{SIGNALEMENT_PRIORITE_LABELS[s.priorite]}</span>
                    <span style={{ color: C.t3, fontSize: "11px" }}>{formatDateSig(s.created_at)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ── FICHE DÉTAIL ── */}
      {selectedId && (
        <div className="sig-fiche-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => setSelectedId(null)}>
          <div onClick={e => e.stopPropagation()} className="sig-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "560px", maxHeight: "88svh", overflowY: "auto", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
            <div className="sig-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }}/>
            <button onClick={() => setSelectedId(null)} className="sig-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {loadingDetail || !detail ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><YelenLoader size={28}/></div>
            ) : (() => {
              const sig = detail.signalement;
              const cfg = SIG_STATUT_CFG(C)[sig.statut];
              return (
                <>
                  <div style={{ marginBottom: "18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "monospace", color: C.gold, fontSize: "13px", fontWeight: 800 }}>{sig.numero_public}</span>
                      <span style={{ backgroundColor: sig.type_signaleur === "citoyen" ? C.orangeL : C.bg3, color: sig.type_signaleur === "citoyen" ? C.orange : C.t2, fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{sig.type_signaleur === "citoyen" ? "Déposé contre vous" : "Déposé par vous"}</span>
                      <span style={{ backgroundColor: prioriteBg(sig.priorite, C), color: prioriteColor(sig.priorite, C), fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{SIGNALEMENT_PRIORITE_LABELS[sig.priorite]}</span>
                      <span style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "10.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "20px" }}>{cfg.label}</span>
                    </div>
                    <h2 style={{ color: C.t1, fontSize: "17px", fontWeight: 800, margin: 0 }}>{motifLabel(sig.motif)}</h2>
                  </div>

                  <div className="sig-fiche-body">
                    {/* Colonne gauche */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                      <div>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Informations du cas</div>
                        <div style={{ backgroundColor: C.bg3, borderRadius: "12px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12.5px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Citoyen</span><span style={{ color: C.t1, fontWeight: 700 }}>{sig.citoyen_name || "—"}</span></div>
                          {sig.citoyen_phone && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Téléphone</span><span style={{ color: C.t1 }}>{sig.citoyen_phone}</span></div>}
                          {sig.incident_date && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Date de l&apos;incident</span><span style={{ color: C.t1 }}>{formatDateRdv(sig.incident_date)}{sig.incident_heure && ` · ${sig.incident_heure.slice(0, 5)}`}</span></div>}
                          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Créé le</span><span style={{ color: C.t1 }}>{formatDateHeureSig(sig.created_at)}</span></div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Assigné à</span><span style={{ color: C.t1, fontWeight: 700 }}>{membreNom(sig.assigne_a_membre_id)}</span></div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Niveau</span><span style={{ color: C.t1 }}>{sig.escalade_niveau === "agent" ? "Agent" : sig.escalade_niveau === "superviseur" ? "Superviseur" : "Admin"}</span></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Description</div>
                        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.7, backgroundColor: C.bg3, borderRadius: "10px", padding: "12px 14px", margin: 0 }}>{sig.description || "—"}</p>
                      </div>

                      {sig.resolution_action && (
                        <div>
                          <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Résolution</div>
                          <div style={{ backgroundColor: C.greenL, border: `1px solid ${C.green}30`, borderRadius: "10px", padding: "12px 14px" }}>
                            <p style={{ color: C.green, fontWeight: 700, fontSize: "12.5px", margin: "0 0 4px" }}>{SIGNALEMENT_RESOLUTION_ACTION_LABELS[sig.resolution_action as SignalementResolutionAction] || sig.resolution_action}</p>
                            <p style={{ color: C.t2, fontSize: "12px", margin: 0, lineHeight: 1.6 }}>{sig.resolution_explication}</p>
                          </div>
                        </div>
                      )}

                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                          <span style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>Pièces jointes</span>
                          {canWrite && (
                            <label style={{ color: C.gold, fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                              + Ajouter
                              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) televerserPreuve(f); }}/>
                            </label>
                          )}
                        </div>
                        {sig.preuve_url && (
                          <Image src={sig.preuve_url} onClick={() => window.open(sig.preuve_url!, "_blank")} width={240} height={60} style={{ height: "60px", width: "auto", borderRadius: "8px", objectFit: "cover", cursor: "pointer", border: `1px solid ${C.border}`, marginBottom: "8px" }} alt="preuve historique"/>
                        )}
                        {detail.attachments.length === 0 && !sig.preuve_url ? (
                          <p style={{ color: C.t3, fontSize: "11.5px", margin: 0 }}>Aucune pièce jointe.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {detail.attachments.map(a => (
                              <button key={a.id} onClick={() => telechargerPreuve(a.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", height: "40px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0 12px", cursor: "pointer", textAlign: "left" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                <span style={{ color: C.t1, fontSize: "12px", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nom_original}</span>
                                <span style={{ color: C.t3, fontSize: "10.5px" }}>{a.ajoute_par_nom}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Colonne droite */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                      {canWrite && (
                        <div>
                          <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Actions</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <button onClick={() => { setFormAssigne(sig.assigne_a_membre_id || ""); setActiveModal("assigner"); }} className="tap" style={{ ...actionBtnStyle(C), color: C.t1 }}>Assigner</button>
                          </div>
                          <p style={{ color: C.t3, fontSize: "11px", lineHeight: 1.6, marginTop: "10px" }}>
                            Seule Yelen décide de l&apos;issue d&apos;un signalement (résolution, clôture, rejet…) — votre établissement peut assigner ce dossier en interne et y ajouter des notes/preuves, la décision sera transmise ici une fois rendue.
                          </p>
                          {modalError && !activeModal && <p style={{ color: C.red, fontSize: "11.5px", marginTop: "8px" }}>{modalError}</p>}
                        </div>
                      )}

                      {detail.notes !== null && (
                        <div>
                          <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Notes internes <span style={{ textTransform: "none", fontWeight: 500 }}>· jamais visibles du citoyen</span></div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
                            {detail.notes.length === 0 ? (
                              <p style={{ color: C.t3, fontSize: "11.5px", margin: 0 }}>Aucune note.</p>
                            ) : detail.notes.map(n => (
                              <div key={n.id} style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px 12px" }}>
                                <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, margin: "0 0 4px" }}>{n.contenu}</p>
                                <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>{n.auteur_nom} · {formatDateHeureSig(n.created_at)}</p>
                              </div>
                            ))}
                          </div>
                          {canWrite && (
                            <div style={{ display: "flex", gap: "8px" }}>
                              <input value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Ajouter une note interne…" style={{ ...inputStyle(C), fontSize: "12.5px", padding: "9px 12px" }}/>
                              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="sm" disabled={!formNote.trim()} loading={savingNote} onClick={ajouterNoteInterne}>Ajouter</Button>
                            </div>
                          )}
                        </div>
                      )}

                      <div>
                        <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Historique</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {detail.events.map(ev => (
                            <div key={ev.id} style={{ display: "flex", gap: "10px" }}>
                              <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.gold, marginTop: "5px", flexShrink: 0 }}/>
                              <div>
                                <p style={{ color: C.t1, fontSize: "12px", margin: "0 0 2px" }}><strong>{ev.membre_nom}</strong> {EVENT_LABELS[ev.type] || ev.type}{ev.commentaire ? ` — ${ev.commentaire}` : ""}</p>
                                <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>{formatDateHeureSig(ev.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Modale d'action — seule "assigner" reste possible côté
          institution (chantier arbitrage Yelen, 15/08/2026) ── */}
      {activeModal === "assigner" && (
        <SigModal C={C} titre="Assigner le cas" onClose={() => setActiveModal(null)}>
          <select value={formAssigne} onChange={e => setFormAssigne(e.target.value)} style={{ ...inputStyle(C), marginBottom: "14px" }}>
            <option value="">Sélectionner un membre…</option>
            {membres.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
          </select>
          {modalError && <p style={{ color: C.red, fontSize: "12px", marginBottom: "10px" }}>{modalError}</p>}
          <button onClick={() => formAssigne && appelerAction("assigner", { assigneAMembreId: formAssigne })} disabled={modalSaving || !formAssigne} className="tap" style={confirmBtnStyle(C, modalSaving || !formAssigne)}>{modalSaving ? <SigBtnLoading C={C}/> : "Assigner"}</button>
        </SigModal>
      )}
    </div>
  );
}

function actionBtnStyle(C: ThemeTokens): React.CSSProperties {
  return { textAlign: "left", height: "40px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
}
function confirmBtnStyle(C: ThemeTokens, disabled: boolean): React.CSSProperties {
  return { width: "100%", height: "40px", backgroundColor: disabled ? C.bg3 : C.gold, border: "none", borderRadius: "12px", padding: "0 16px", color: disabled ? C.t3 : "#000", fontSize: "13px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" };
}
function SigBtnLoading({ C }: { C: ThemeTokens }) {
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}><YelenLoader size={14} color={C.t3}/></span>;
}
