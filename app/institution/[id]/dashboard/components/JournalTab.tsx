"use client";

// Journal d'activité — traçabilité par membre (migration 20260715000001).
// Visible uniquement par le rôle admin. Refonte niveau audit-log
// professionnel (15/07/2026) : timeline groupée par jour, filtres
// catégorie/membre/date, fiche détail, export CSV. Passe UX/UI 24/07/2026 :
// icônes SVG (jamais d'emoji, règle système — voir CLAUDE.md
// /chantier-design), typographie relevée pour une audience professionnelle,
// fiche détail adaptée desktop (même convention que .client-fiche-* dans
// MesClientsTab.tsx : bottom sheet mobile, dialogue centré ≥1024px).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { MEMBRE_ROLES, ROLE_LABELS } from "@/lib/institutionPermissions";
import { scoreRisque, type RisqueJournal } from "@/lib/journalTaxonomie";

type Entree = {
  id: string; audit_id: string; membre_id: string | null; membre_nom: string; action: string;
  categorie: string; niveau: string;
  cible_table: string; cible_id: string | null;
  details: Record<string, unknown>;
  ancienne_valeur: Record<string, unknown> | null;
  nouvelle_valeur: Record<string, unknown> | null;
  ip: string | null; user_agent: string | null; navigateur: string | null; os: string | null; plateforme: string;
  created_at: string;
};

type MembreEquipe = { id: string; prenom: string; nom: string; role?: string };

type Stats = {
  actions_aujourdhui: number; actions_semaine: number; membres_actifs: number;
  connexions: number; alertes_securite: number; actions_critiques: number;
  exportations: number; derniere_synchronisation: string | null;
};

type Resume = { phrases: string[]; critiques: number; a_surveiller: number; hors_horaires: number };

// Bibliothèque d'icônes locale (traits Feather-style, cohérente avec le
// reste du dashboard — cf. MesClientsTab.tsx, ServicesTab.tsx). Aucun
// emoji nulle part sur Yelen : règle système, pas une préférence de goût.
type IconKey = "check" | "x" | "flag" | "user" | "edit" | "bell" | "file" | "trash" | "calendar" | "plus" | "key" | "dot" | "copy" | "share" | "inbox" | "eye" | "search" | "chevronDown" | "spark";

function Icon({ name, size = 14, color }: { name: IconKey; size?: number; color: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const, stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "check": return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case "x": return <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case "flag": return <svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
    case "user": return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "edit": return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>;
    case "bell": return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case "file": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case "trash": return <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "plus": return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case "key": return <svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.777 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m3-3l3 3-3.5 3.5m-3-3L21 4"/></svg>;
    case "copy": return <svg {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
    case "share": return <svg {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
    case "inbox": return <svg {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case "eye": return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case "chevronDown": return <svg {...p}><polyline points="6 9 12 15 18 9"/></svg>;
    case "spark": return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case "dot": default: return <svg {...p}><circle cx="12" cy="12" r="4" fill={color} stroke="none"/></svg>;
  }
}

const ACTION_META: Record<string, { label: string; iconKey: IconKey; couleur: (C: ThemeTokens) => string }> = {
  rdv_accepte:          { label: "a accepté un rendez-vous",        iconKey: "check", couleur: C => C.green },
  rdv_refuse:           { label: "a refusé un rendez-vous",         iconKey: "x", couleur: C => C.red },
  rdv_termine:          { label: "a marqué un rendez-vous terminé", iconKey: "flag", couleur: C => C.purple },
  rdv_absent:           { label: "a marqué un client absent",       iconKey: "user", couleur: C => C.orange },
  note_client_modifiee: { label: "a modifié une note client",       iconKey: "edit", couleur: C => C.blue },
  suivi_rdv_modifie:    { label: "a modifié le suivi d'un RDV",     iconKey: "edit", couleur: C => C.blue },
  rappel_envoye:        { label: "a envoyé un rappel client",       iconKey: "bell", couleur: C => C.gold },
  document_ajoute:      { label: "a ajouté un document",            iconKey: "file", couleur: C => C.green },
  document_supprime:    { label: "a supprimé un document",          iconKey: "trash", couleur: C => C.red },
  tache_creee:          { label: "a créé une tâche",                iconKey: "check", couleur: C => C.teal },
  tache_modifiee:       { label: "a modifié une tâche",             iconKey: "edit", couleur: C => C.teal },
  tache_supprimee:      { label: "a supprimé une tâche",            iconKey: "trash", couleur: C => C.red },
  evenement_cree:       { label: "a créé un événement d'agenda",    iconKey: "calendar", couleur: C => C.orange },
  evenement_modifie:    { label: "a modifié un événement d'agenda", iconKey: "edit", couleur: C => C.orange },
  evenement_supprime:   { label: "a supprimé un événement d'agenda",iconKey: "trash", couleur: C => C.red },
  membre_cree:          { label: "a créé un membre",                iconKey: "plus", couleur: C => C.gold },
  membre_modifie:       { label: "a modifié un membre",             iconKey: "edit", couleur: C => C.gold },
  membre_supprime:      { label: "a supprimé un membre",            iconKey: "trash", couleur: C => C.red },
  pin_change_personnel: { label: "a changé son PIN",                iconKey: "key", couleur: C => C.t2 },
  projet_cree:          { label: "a créé un projet",                iconKey: "plus", couleur: C => C.purple },
  projet_modifie:       { label: "a modifié un projet",             iconKey: "edit", couleur: C => C.purple },
  projet_supprime:      { label: "a supprimé un projet",            iconKey: "trash", couleur: C => C.red },
  note_creee:           { label: "a créé une note",                 iconKey: "plus", couleur: C => C.teal },
  note_modifiee:        { label: "a modifié une note",              iconKey: "edit", couleur: C => C.teal },
  note_supprimee:       { label: "a supprimé une note",             iconKey: "trash", couleur: C => C.red },
  export_journal:       { label: "a exporté le journal d'activité", iconKey: "file", couleur: C => C.t2 },
  message_envoye:       { label: "a envoyé un message au client",   iconKey: "share", couleur: C => C.blue },
  message_recu:         { label: "a envoyé un message à l'institution", iconKey: "share", couleur: C => C.blue },
};

const CATEGORIES = [
  { value: "rdv", label: "Rendez-vous" },
  { value: "clients", label: "Clients" },
  { value: "documents", label: "Documents" },
  { value: "taches", label: "Tâches" },
  { value: "agenda", label: "Agenda" },
  { value: "equipe", label: "Équipe" },
  { value: "projets", label: "Projets" },
  { value: "notes", label: "Notes" },
  { value: "communication", label: "Communication" },
  { value: "paiements", label: "Paiements" },
  { value: "compte", label: "Compte" },
  { value: "authentification", label: "Connexion" },
  { value: "journal", label: "Journal" },
] as const;

const NIVEAUX = [
  { value: "info", label: "Information", couleur: (C: ThemeTokens) => C.t2 },
  { value: "succes", label: "Succès", couleur: (C: ThemeTokens) => C.green },
  { value: "attention", label: "Attention", couleur: (C: ThemeTokens) => C.orange },
  { value: "erreur", label: "Erreur", couleur: (C: ThemeTokens) => C.red },
  { value: "critique", label: "Critique", couleur: (C: ThemeTokens) => C.red },
] as const;

const PLATEFORMES = [
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
  { value: "tablette", label: "Tablette" },
  { value: "api", label: "API" },
] as const;

const LIMIT = 50;

const RISQUE_META: Record<RisqueJournal, { label: string; couleur: (C: ThemeTokens) => string }> = {
  vert: { label: "Normal", couleur: C => C.green },
  orange: { label: "À surveiller", couleur: C => C.orange },
  rouge: { label: "Critique", couleur: C => C.red },
};

// Style de chip unifié — un seul endroit qui décide de l'apparence
// sélectionné/non-sélectionné, pour ne plus jamais retomber sur un état
// "sélectionné" à peine visible (bordure/texte identiques, seul le fond
// changeait légèrement — signalé et corrigé le 24/07/2026).
function chipStyle(C: ThemeTokens, selected: boolean, accent: string): React.CSSProperties {
  return {
    flexShrink: 0,
    backgroundColor: selected ? `${accent}1F` : C.bgCard,
    border: `1.5px solid ${selected ? accent : C.border}`,
    borderRadius: "20px",
    padding: "8px 15px",
    color: selected ? accent : C.t2,
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function meta(action: string) {
  return ACTION_META[action] ?? { label: action, iconKey: "dot" as const, couleur: (C: ThemeTokens) => C.t3 };
}

// Libellé de ligne — pour message_envoye, interpole le nom du client
// destinataire (stocké dans details.client_nom depuis le 18/07/2026) pour
// qu'on sache À QUI exactement un message a été envoyé, pas seulement
// "au client" de façon générique. Retombe sur le libellé générique pour
// les entrées antérieures à cet ajout (details.client_nom absent).
function libelleLigne(e: Entree): string {
  if (e.action === "message_envoye") {
    const nom = typeof e.details?.client_nom === "string" ? e.details.client_nom : null;
    if (nom) return `a envoyé un message à ${nom}`;
  }
  return meta(e.action).label;
}

function libelleJour(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const hier = new Date(); hier.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Aujourd'hui";
  if (sameDay(d, hier)) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function ilYA(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function isoJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function initiales(nom: string): string {
  return nom.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function JournalTab({ instId, onToast }: { instId: string; onToast: (msg: string, color?: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [categorie, setCategorie] = useState<string>("");
  const [membreFiltre, setMembreFiltre] = useState<string>("");
  const [niveau, setNiveau] = useState<string>("");
  const [plateforme, setPlateforme] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Entree | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [membresEquipe, setMembresEquipe] = useState<MembreEquipe[]>([]);
  const [contexteAvant, setContexteAvant] = useState<Entree[]>([]);
  const [contexteApres, setContexteApres] = useState<Entree[]>([]);
  const [contexteLoading, setContexteLoading] = useState(false);
  const [echangesClient, setEchangesClient] = useState<Entree[]>([]);
  const [ouvertCategorie, setOuvertCategorie] = useState(false);
  const [ouvertNiveau, setOuvertNiveau] = useState(false);
  const [ouvertPlateforme, setOuvertPlateforme] = useState(false);
  const [ouvertRole, setOuvertRole] = useState(false);
  const [ouvertMembre, setOuvertMembre] = useState(false);
  const [ouvertExport, setOuvertExport] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (categorie) params.set("categorie", categorie);
    if (membreFiltre) params.set("membre_id", membreFiltre);
    if (niveau) params.set("niveau", niveau);
    if (plateforme) params.set("plateforme", plateforme);
    if (role) params.set("role", role);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", String(LIMIT));
    params.set("offset", String(offset));
    const res = await fetch(`/api/institution/journal?${params.toString()}`);
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const j = await res.json().catch(() => null);
    if (!res.ok) onToast(j?.error || "Erreur de chargement", C.red);
    setEntrees(res.ok ? (j?.entrees ?? []) : []);
    setTotal(res.ok ? (j?.total ?? 0) : 0);
    setLoading(false);
  }, [dateFrom, dateTo, categorie, membreFiltre, niveau, plateforme, role, q, offset, onToast, C.red]);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/institution/journal/stats");
    if (!res.ok) return;
    const j = await res.json().catch(() => null);
    if (j) setStats(j);
  }, []);

  const loadResume = useCallback(async () => {
    const res = await fetch("/api/institution/journal/resume");
    if (!res.ok) return;
    const j = await res.json().catch(() => null);
    if (j) setResume(j);
  }, []);

  useEffect(() => {
    if (!selected) { setContexteAvant([]); setContexteApres([]); return; }
    setContexteLoading(true);
    fetch(`/api/institution/journal/contexte?entry_id=${selected.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { setContexteAvant(j?.avant ?? []); setContexteApres(j?.apres ?? []); })
      .catch(() => { setContexteAvant([]); setContexteApres([]); })
      .finally(() => setContexteLoading(false));
  }, [selected]);

  // Échanges avec ce client — répond à "quand est le retour de ce
  // client, avec son nom" (signalé le 18/07/2026) : contrairement à
  // "Événements liés" (chronologie ±3 de TOUTE l'institution, Lot E), ce
  // fil est filtré sur le même client (cible_id) et la catégorie
  // communication, pour voir directement l'aller-retour message envoyé /
  // réponse reçue avec ce client précis.
  useEffect(() => {
    const estMessage = selected?.action === "message_envoye" || selected?.action === "message_recu";
    if (!estMessage || !selected?.cible_id) { setEchangesClient([]); return; }
    const params = new URLSearchParams({ cible_ids: selected.cible_id, categorie: "communication", limit: "20" });
    fetch(`/api/institution/journal?${params.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => setEchangesClient((j?.entrees ?? []).slice().reverse()))
      .catch(() => setEchangesClient([]));
  }, [selected]);

  useEffect(() => { load(); }, [load, instId]);
  useEffect(() => { loadStats(); }, [loadStats, instId]);
  useEffect(() => { loadResume(); }, [loadResume, instId]);
  // Auto-refresh — filet de sécurité périodique (même pattern que
  // loadData() dans page.tsx). journal_activite n'a aucune policy RLS, le
  // canal Realtime du dashboard (page.tsx, table rdv/avis) ne peut donc
  // pas s'y abonner depuis le client anon — sans ce filet, une nouvelle
  // action n'apparaissait qu'après un rechargement complet du navigateur
  // (signalé le 18/07/2026). Suspendu pendant qu'une fiche détail est
  // ouverte pour ne pas perturber la lecture du contexte affiché.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!selected) { load(); loadStats(); loadResume(); }
    }, 30000);
    return () => clearInterval(interval);
  }, [load, loadStats, loadResume, selected]);
  useEffect(() => {
    fetch("/api/institution/membres")
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.membres) setMembresEquipe(j.membres); })
      .catch(() => {});
  }, [instId]);

  function filtrerAujourdhui() {
    const t = isoJour(new Date());
    setDateFrom(t); setDateTo(t); setOffset(0);
  }
  function filtrerHier() {
    const h = new Date(); h.setDate(h.getDate() - 1);
    const t = isoJour(h);
    setDateFrom(t); setDateTo(t); setOffset(0);
  }
  function filtrer7Jours() {
    setDateFrom(isoJour(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
    setDateTo(isoJour(new Date())); setOffset(0);
  }
  function filtrer30Jours() {
    setDateFrom(isoJour(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    setDateTo(isoJour(new Date())); setOffset(0);
  }
  function filtrerToutesDates() {
    setDateFrom(""); setDateTo(""); setOffset(0);
  }
  function filtrerConnexions() {
    filtrerAujourdhui();
    setCategorie("authentification");
  }
  function filtrerExports() {
    filtrer7Jours();
    setCategorie("journal");
  }
  function appliquerCategorie(v: string) { setCategorie(v); setOffset(0); }
  function appliquerNiveau(v: string) { setNiveau(v); setOffset(0); }
  function appliquerPlateforme(v: string) { setPlateforme(v); setOffset(0); }
  function appliquerRole(v: string) { setRole(v); setOffset(0); }
  function appliquerMembre(v: string) { setMembreFiltre(v); setOffset(0); }
  function appliquerRecherche() { setQ(qDraft); setOffset(0); }
  function effacerRecherche() { setQDraft(""); setQ(""); setOffset(0); }

  const groupes = useMemo(() => {
    const map = new Map<string, Entree[]>();
    for (const e of entrees) {
      const key = libelleJour(e.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()];
  }, [entrees]);

  const roleParMembre = useMemo(() => {
    const m = new Map<string, string>();
    membresEquipe.forEach(mm => { if (mm.role) m.set(mm.id, mm.role); });
    return m;
  }, [membresEquipe]);

  function roleLabelDe(e: Entree): string | null {
    const r = e.membre_id ? roleParMembre.get(e.membre_id) : undefined;
    return r && r in ROLE_LABELS ? ROLE_LABELS[r as keyof typeof ROLE_LABELS] : null;
  }

  function copierId(e: Entree) {
    navigator.clipboard?.writeText(e.audit_id)
      .then(() => onToast("Référence copiée", C.green))
      .catch(() => onToast("Impossible de copier", C.red));
  }

  async function partager(e: Entree) {
    const texte = `${e.membre_nom} ${meta(e.action).label} — ${e.audit_id} (${new Date(e.created_at).toLocaleString("fr-FR")})`;
    if (navigator.share) {
      try { await navigator.share({ text: texte }); } catch { /* annulé par l'utilisateur, rien à faire */ }
    } else {
      navigator.clipboard?.writeText(texte)
        .then(() => onToast("Résumé copié", C.green))
        .catch(() => onToast("Impossible de copier", C.red));
    }
  }

  // Export serveur (Lot G, export enrichi) — remplace l'ancien export
  // 100% client qui n'exportait que la page affichée (LIMIT=50) : la
  // route /api/institution/journal/export applique les mêmes filtres que
  // load() mais retourne TOUTES les lignes correspondantes (jusqu'à 5000).
  async function exporterServeur(format: "csv" | "xlsx" | "json" | "pdf" | "signe") {
    setOuvertExport(false);
    setExportEnCours(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (categorie) params.set("categorie", categorie);
    if (membreFiltre) params.set("membre_id", membreFiltre);
    if (niveau) params.set("niveau", niveau);
    if (plateforme) params.set("plateforme", plateforme);
    if (role) params.set("role", role);
    if (q.trim()) params.set("q", q.trim());
    params.set("format", format);
    try {
      const res = await fetch(`/api/institution/journal/export?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        onToast(j?.error || "Erreur lors de l'export", C.red);
        return;
      }
      const empreinte = res.headers.get("X-Empreinte-Sha256");
      const tronque = res.headers.get("X-Export-Tronque") === "true";
      const disposition = res.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `journal_activite.${format === "signe" ? "xlsx" : format}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      a.click(); URL.revokeObjectURL(url);
      const suffixe = tronque ? " (tronqué aux 5000 entrées les plus récentes — affinez les filtres pour un extrait complet)" : "";
      onToast(empreinte ? `Rapport signé exporté — empreinte SHA-256 : ${empreinte.slice(0, 16)}…${suffixe}` : `Export réussi${suffixe}`, tronque ? C.orange : C.green);
      loadStats();
    } catch {
      onToast("Erreur réseau lors de l'export", C.red);
    } finally {
      setExportEnCours(false);
    }
  }

  // Badge "Client" — distingue visuellement les actions liées à un
  // citoyen (messagerie) des activités internes entre membres (RDV,
  // tâches, équipe...), signalé le 18/07/2026. Toujours le même texte
  // "Client", coloré selon le sens : jaune quand l'institution écrit au
  // client, bleu quand le client écrit à l'institution. Affiché partout
  // où une entrée message_envoye/message_recu apparaît (timeline, fiche
  // détail, Événements liés, Échanges avec ce client).
  function ClientBadge({ action }: { action: string }) {
    if (action !== "message_envoye" && action !== "message_recu") return null;
    const couleur = action === "message_envoye" ? C.gold : C.blue;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", backgroundColor: `${couleur}20`, color: couleur, border: `1px solid ${couleur}50`, borderRadius: "6px", padding: "2px 7px", fontSize: "10.5px", fontWeight: "800", flexShrink: 0 }}>
        Client
      </span>
    );
  }

  // Bouton d'action circulaire (copier/partager) — affordance explicite
  // (fond + bordure visibles au repos, pas seulement le curseur souris qui
  // ne fonctionne de toute façon pas au doigt sur mobile).
  function ActionButton({ iconName, title, onClick }: { iconName: IconKey; title: string; onClick: (e: React.MouseEvent) => void }) {
    return (
      <button
        onClick={onClick}
        title={title}
        aria-label={title}
        className="tap"
        style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: C.bg3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
      >
        <Icon name={iconName} size={14} color={C.t2}/>
      </button>
    );
  }

  // Ligne de filtre repliable — n'affiche que l'option "Tous/Toutes" par
  // défaut (l'écran devenait trop long avant d'atteindre la timeline avec
  // les 5 lignes de filtres pleinement déployées, signalé le 24/07/2026).
  // Reste ouvert automatiquement si un filtre non-défaut est actif, pour ne
  // jamais masquer une sélection en cours.
  function VoirPlusBouton({ ouvert, onClick }: { ouvert: boolean; onClick: () => void }) {
    return (
      <button onClick={onClick} className="tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "4px", backgroundColor: "transparent", border: "none", padding: "8px 6px", color: C.gold, fontSize: "12.5px", fontWeight: "800", cursor: "pointer", whiteSpace: "nowrap" }}>
        {ouvert ? "Voir moins" : "Voir plus"}
        <span style={{ display: "flex", transform: ouvert ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
          <Icon name="chevronDown" size={13} color={C.gold}/>
        </span>
      </button>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "48px 16px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "28px", height: "28px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center" }}>
        <p style={{ color: C.t2, fontSize: "13px" }}>Cet écran est réservé aux administrateurs de l'institution.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", paddingBottom: "100px", animation: "fadeUp 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <h1 style={{ color: C.t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>Journal d'activité</h1>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setOuvertExport(o => !o)}
            disabled={exportEnCours}
            className="tap"
            style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "9px 14px", color: C.t2, fontSize: "12.5px", fontWeight: "700", cursor: exportEnCours ? "default" : "pointer", opacity: exportEnCours ? 0.6 : 1 }}
          >
            <Icon name="file" size={14} color={C.green}/>
            {exportEnCours ? "Export..." : "Exporter"}
            <Icon name="chevronDown" size={12} color={C.t2}/>
          </button>
          {ouvertExport && (
            <>
              <div onClick={() => setOuvertExport(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }}/>
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 11, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "6px", minWidth: "220px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
                {([
                  { format: "csv", label: "CSV" },
                  { format: "xlsx", label: "Excel (.xlsx)" },
                  { format: "json", label: "JSON" },
                  { format: "pdf", label: "PDF" },
                  { format: "signe", label: "Rapport signé (cachet + empreinte)" },
                ] as const).map(opt => (
                  <button
                    key={opt.format}
                    onClick={() => exporterServeur(opt.format)}
                    className="tap"
                    style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: "8px", padding: "10px 12px", color: C.t1, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p style={{ color: C.t2, fontSize: "13.5px", marginBottom: "14px" }}>Traçabilité complète : qui a fait quoi, et quand, pour toute l'équipe.</p>

      {resume && (
        <div style={{ backgroundColor: `${C.gold}0D`, border: `1px solid ${C.gold}30`, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: `${C.gold}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="spark" size={16} color={C.gold}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.6px", marginBottom: "5px" }}>RÉSUMÉ DU JOUR</div>
            {resume.phrases.map((phrase, i) => (
              <div key={i} style={{ color: C.t1, fontSize: "13.5px", fontWeight: 600, marginBottom: i < resume.phrases.length - 1 ? "3px" : 0 }}>{phrase}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px", marginBottom: "16px" }}>
        {([
          { label: "AUJOURD'HUI", valeur: stats?.actions_aujourdhui ?? total, couleur: C.gold, onClick: filtrerAujourdhui },
          { label: "CETTE SEMAINE", valeur: stats?.actions_semaine ?? total, couleur: C.blue, onClick: filtrer7Jours },
          { label: "MEMBRES ACTIFS", valeur: stats?.membres_actifs ?? membresEquipe.length, couleur: C.teal, onClick: null },
          { label: "CONNEXIONS AUJOURD'HUI", valeur: stats?.connexions ?? 0, couleur: C.purple, onClick: filtrerConnexions },
          { label: "ALERTES SÉCURITÉ (7J)", valeur: stats?.alertes_securite ?? 0, couleur: C.orange, onClick: null },
          { label: "ACTIONS CRITIQUES", valeur: stats?.actions_critiques ?? 0, couleur: C.red, onClick: null },
          { label: "EXPORTATIONS (7J)", valeur: stats?.exportations ?? 0, couleur: C.t2, onClick: filtrerExports },
          { label: "DERNIÈRE SYNCHRO", valeur: ilYA(stats?.derniere_synchronisation ?? null), couleur: C.green, onClick: () => { load(); loadStats(); loadResume(); } },
        ] as const).map((card, i) => (
          <div
            key={i}
            onClick={card.onClick ?? undefined}
            className={card.onClick ? "tap" : undefined}
            style={{
              backgroundColor: C.bgCard, borderRadius: "12px", padding: "13px",
              border: `1px solid ${C.border}`, textAlign: "center",
              cursor: card.onClick ? "pointer" : "default",
            }}
          >
            <div style={{ color: card.couleur, fontSize: typeof card.valeur === "number" ? "22px" : "14px", fontWeight: "900" }}>{card.valeur}</div>
            <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: "800", marginTop: "2px" }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <div style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <Icon name="search" size={15} color={C.t3}/>
          </div>
          <input
            type="text"
            value={qDraft}
            onChange={e => setQDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") appliquerRecherche(); }}
            placeholder="Rechercher : nom, référence, IP, cible..."
            style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "11px 38px 11px 38px", fontSize: "13.5px", color: C.t1 }}
          />
          {qDraft && (
            <button
              onClick={effacerRecherche}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
              style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Icon name="x" size={12} color={C.t2}/>
            </button>
          )}
        </div>
        <button onClick={appliquerRecherche} className="tap" style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: C.gold, border: "none", borderRadius: "10px", padding: "0 16px", color: "#fff", fontSize: "13px", fontWeight: "800", cursor: "pointer", flexShrink: 0 }}>
          <Icon name="search" size={14} color="#fff"/>
          Rechercher
        </button>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "8px", overflowX: "auto" }}>
        <button onClick={filtrerAujourdhui} style={chipStyle(C, false, C.gold)}>Aujourd'hui</button>
        <button onClick={filtrerHier} style={chipStyle(C, false, C.gold)}>Hier</button>
        <button onClick={filtrer7Jours} style={chipStyle(C, false, C.gold)}>7 jours</button>
        <button onClick={filtrer30Jours} style={chipStyle(C, false, C.gold)}>30 jours</button>
        <button onClick={filtrerToutesDates} style={chipStyle(C, !dateFrom && !dateTo, C.gold)}>Toutes dates</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        <div>
          <label style={{ display: "block", color: C.t2, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>Du (personnalisé)</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOffset(0); }} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 10px", fontSize: "13px", color: C.t1 }}/>
        </div>
        <div>
          <label style={{ display: "block", color: C.t2, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>Au (personnalisé)</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setOffset(0); }} style={{ width: "100%", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 10px", fontSize: "13px", color: C.t1 }}/>
        </div>
      </div>

      {(() => {
        const ouvert = ouvertCategorie || !!categorie;
        const visibles = ouvert ? CATEGORIES : [];
        return (
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px", overflowX: "auto" }}>
            <button onClick={() => appliquerCategorie("")} style={chipStyle(C, !categorie, C.gold)}>Toutes</button>
            {visibles.map(c => (
              <button key={c.value} onClick={() => appliquerCategorie(c.value)} style={chipStyle(C, categorie === c.value, C.gold)}>{c.label}</button>
            ))}
            <VoirPlusBouton ouvert={ouvert} onClick={() => setOuvertCategorie(o => !o)}/>
          </div>
        );
      })()}

      {(() => {
        const ouvert = ouvertNiveau || !!niveau;
        const visibles = ouvert ? NIVEAUX : [];
        return (
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px", overflowX: "auto" }}>
            <button onClick={() => appliquerNiveau("")} style={chipStyle(C, !niveau, C.gold)}>Tous niveaux</button>
            {visibles.map(n => (
              <button key={n.value} onClick={() => appliquerNiveau(n.value)} style={chipStyle(C, niveau === n.value, n.couleur(C))}>{n.label}</button>
            ))}
            <VoirPlusBouton ouvert={ouvert} onClick={() => setOuvertNiveau(o => !o)}/>
          </div>
        );
      })()}

      {(() => {
        const ouvert = ouvertPlateforme || !!plateforme;
        const visibles = ouvert ? PLATEFORMES : [];
        return (
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px", overflowX: "auto" }}>
            <button onClick={() => appliquerPlateforme("")} style={chipStyle(C, !plateforme, C.gold)}>Toutes plateformes</button>
            {visibles.map(p => (
              <button key={p.value} onClick={() => appliquerPlateforme(p.value)} style={chipStyle(C, plateforme === p.value, C.gold)}>{p.label}</button>
            ))}
            <VoirPlusBouton ouvert={ouvert} onClick={() => setOuvertPlateforme(o => !o)}/>
          </div>
        );
      })()}

      {(() => {
        const ouvert = ouvertRole || !!role;
        const visibles = ouvert ? MEMBRE_ROLES : [];
        return (
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px", overflowX: "auto" }}>
            <button onClick={() => appliquerRole("")} style={{ ...chipStyle(C, !role, C.gold), display: "flex", alignItems: "center", gap: "6px" }}>Tous rôles</button>
            {visibles.map(r => (
              <button key={r} onClick={() => appliquerRole(r)} style={{ ...chipStyle(C, role === r, C.gold), display: "flex", alignItems: "center", gap: "6px", padding: "6px 15px 6px 6px" }}>
                <span style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: role === r ? C.gold : `${C.gold}30`, color: role === r ? "#fff" : C.gold, fontSize: "10px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ROLE_LABELS[r][0]}</span>
                {ROLE_LABELS[r]}
              </button>
            ))}
            <VoirPlusBouton ouvert={ouvert} onClick={() => setOuvertRole(o => !o)}/>
          </div>
        );
      })()}

      {membresEquipe.length > 1 && (() => {
        const ouvert = ouvertMembre || !!membreFiltre;
        const visibles = ouvert ? membresEquipe : [];
        return (
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto" }}>
          <button onClick={() => appliquerMembre("")} style={chipStyle(C, !membreFiltre, C.gold)}>Tout le monde</button>
          {visibles.map(m => (
            <button key={m.id} onClick={() => appliquerMembre(m.id)} style={chipStyle(C, membreFiltre === m.id, C.gold)}>{m.prenom} {m.nom}</button>
          ))}
          <VoirPlusBouton ouvert={ouvert} onClick={() => setOuvertMembre(o => !o)}/>
        </div>
        );
      })()}

      {entrees.length === 0 ? (
        <div style={{ backgroundColor: C.bgCard, borderRadius: "14px", padding: "48px 20px", textAlign: "center", border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><Icon name="inbox" size={36} color={C.t3}/></div>
          <p style={{ color: C.t1, fontSize: "14px", fontWeight: "800", marginBottom: "4px" }}>{total === 0 ? "Aucune activité enregistrée pour l'instant" : "Aucun résultat pour ces filtres"}</p>
          <p style={{ color: C.t2, fontSize: "12.5px" }}>{total === 0 ? "Chaque action de votre équipe (RDV, documents, tâches...) apparaîtra ici automatiquement." : "Essayez d'élargir la période ou de changer de catégorie."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {groupes.map(([jour, items]) => (
            <div key={jour}>
              <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.6px", marginBottom: "8px", textTransform: "capitalize" as const }}>{jour}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {items.map(e => {
                  const m = meta(e.action);
                  const roleLabel = roleLabelDe(e);
                  const risque = scoreRisque(e.action, e.niveau, e.details || {});
                  return (
                    <div key={e.id} onClick={() => setSelected(e)} className="tap" style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", cursor: "pointer" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "50%", backgroundColor: `${m.couleur(C)}20`, color: m.couleur(C), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "900", flexShrink: 0 }}>{initiales(e.membre_nom)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", fontSize: "13.5px", color: C.t1, fontWeight: 600 }}>
                          <strong>{e.membre_nom}</strong>
                          {roleLabel && <span style={{ color: C.t2, fontWeight: 500 }}>· {roleLabel}</span>}
                          <ClientBadge action={e.action}/>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                          <Icon name={m.iconKey} size={13} color={m.couleur(C)}/>
                          <span style={{ fontSize: "13px", color: C.t2, fontWeight: 500 }}>{libelleLigne(e)}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                          <span style={{ color: C.t2, fontSize: "11.5px", fontWeight: 500 }}>{heure(e.created_at)} · {ilYA(e.created_at)}</span>
                          <span title={RISQUE_META[risque].label} style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: RISQUE_META[risque].couleur(C), flexShrink: 0 }}/>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                        <ActionButton iconName="eye" title="Voir les détails" onClick={ev => { ev.stopPropagation(); setSelected(e); }}/>
                        <ActionButton iconName="copy" title="Copier la référence" onClick={ev => { ev.stopPropagation(); copierId(e); }}/>
                        <ActionButton iconName="share" title="Partager" onClick={ev => { ev.stopPropagation(); partager(e); }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px" }}>
          <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>{`${Math.min(offset + 1, total)}–${Math.min(offset + LIMIT, total)} sur ${total}`}</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 14px", color: offset === 0 ? C.t3 : C.t1, fontSize: "12.5px", fontWeight: "700", cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.5 : 1 }}
            >Précédent</button>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
              style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 14px", color: offset + LIMIT >= total ? C.t3 : C.t1, fontSize: "12.5px", fontWeight: "700", cursor: offset + LIMIT >= total ? "default" : "pointer", opacity: offset + LIMIT >= total ? 0.5 : 1 }}
            >Suivant</button>
          </div>
        </div>
      )}

      {selected && (
        <div className="journal-fiche-overlay" onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <style>{`
            /* Fiche détail — bottom sheet mobile par défaut, dialogue centré
               ≥1024px (même convention que .client-fiche-* dans
               MesClientsTab.tsx : mobile-first, override desktop). */
            @media(min-width:1024px){
              .journal-fiche-overlay{align-items:center!important}
              .journal-fiche-panel{max-width:560px!important;border-radius:20px!important;max-height:86svh!important}
              .journal-fiche-grip{display:none!important}
              .journal-fiche-close-x{display:flex!important}
            }
          `}</style>
          <div onClick={e => e.stopPropagation()} className="journal-fiche-panel" style={{ position: "relative", backgroundColor: C.bgCard, borderRadius: "20px 20px 0 0", padding: "22px", width: "100%", maxWidth: "480px", maxHeight: "80svh", overflowY: "auto", border: `1px solid ${C.border2}` }}>
            <div className="journal-fiche-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 16px" }}/>
            <button onClick={() => setSelected(null)} className="journal-fiche-close-x tap" style={{ display: "none", position: "absolute", top: "16px", right: "16px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon name="x" size={14} color={C.t2}/>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "12px", backgroundColor: `${meta(selected.action).couleur(C)}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={meta(selected.action).iconKey} size={18} color={meta(selected.action).couleur(C)}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>{libelleLigne(selected)}</div>
                  <ClientBadge action={selected.action}/>
                </div>
                <div style={{ color: C.t2, fontSize: "12px", fontWeight: 500 }}>{new Date(selected.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</div>
              </div>
              {(() => {
                const risque = scoreRisque(selected.action, selected.niveau, selected.details || {});
                return (
                  <span style={{ display: "flex", alignItems: "center", gap: "5px", backgroundColor: `${RISQUE_META[risque].couleur(C)}18`, color: RISQUE_META[risque].couleur(C), borderRadius: "20px", padding: "5px 11px", fontSize: "11px", fontWeight: "800", flexShrink: 0 }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: RISQUE_META[risque].couleur(C) }}/>
                    {RISQUE_META[risque].label}
                  </span>
                );
              })()}
            </div>
            <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
              {[
                { label: "Référence", value: selected.audit_id },
                { label: "Membre", value: selected.membre_nom },
                { label: "Rôle", value: roleLabelDe(selected) ?? "—" },
                { label: "Cible", value: selected.cible_table },
                ...(Object.entries(selected.details || {}).map(([k, v]) => ({ label: k, value: String(v) }))),
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600, textTransform: "capitalize" }}>{row.label.replace(/_/g, " ")}</span>
                  <span style={{ color: C.t1, fontSize: "13px", fontWeight: "700", textAlign: "right", maxWidth: "60%", overflowWrap: "break-word" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {echangesClient.length > 0 && (() => {
              const clientNom = selected.action === "message_recu"
                ? selected.membre_nom
                : (typeof selected.details?.client_nom === "string" ? selected.details.client_nom : null);
              return (
                <>
                  <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.6px", margin: "14px 0 6px" }}>
                    ÉCHANGES AVEC {clientNom ? clientNom.toUpperCase() : "CE CLIENT"}
                  </div>
                  <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
                    {echangesClient.map((e, i, arr) => {
                      const estClient = e.action === "message_recu";
                      const estSelection = e.id === selected.id;
                      return (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <span style={{ color: C.t2, fontSize: "11px", fontWeight: 600, width: "82px", flexShrink: 0 }}>{new Date(e.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} {heure(e.created_at)}</span>
                          <ClientBadge action={e.action}/>
                          <span style={{ fontSize: "12.5px", color: estSelection ? C.gold : C.t1, fontWeight: estSelection ? 800 : 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {estClient ? "a répondu" : "a écrit un message"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {(selected.navigateur || selected.os || selected.ip) && (
              <>
                <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.6px", margin: "14px 0 6px" }}>CONTEXTE</div>
                <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
                  {[
                    { label: "Navigateur", value: selected.navigateur ?? "—" },
                    { label: "Système", value: selected.os ?? "—" },
                    { label: "Adresse IP", value: selected.ip ?? "—" },
                    { label: "Plateforme", value: selected.plateforme },
                  ].map((row, i, arr) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <span style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600 }}>{row.label}</span>
                      <span style={{ color: C.t1, fontSize: "13px", fontWeight: "700" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(selected.ancienne_valeur || selected.nouvelle_valeur) && (
              <>
                <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.6px", margin: "14px 0 6px" }}>DÉTAILS TECHNIQUES</div>
                <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>Avant</div>
                    {Object.entries(selected.ancienne_valeur || {}).map(([k, v]) => (
                      <div key={k} style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600, marginBottom: "2px" }}><span style={{ color: C.t2, fontWeight: 500 }}>{k.replace(/_/g, " ")} : </span>{String(v)}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: C.t2, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>Après</div>
                    {Object.entries(selected.nouvelle_valeur || {}).map(([k, v]) => (
                      <div key={k} style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600, marginBottom: "2px" }}><span style={{ color: C.t2, fontWeight: 500 }}>{k.replace(/_/g, " ")} : </span>{String(v)}</div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {contexteLoading && (
              <>
                <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.6px", margin: "14px 0 6px" }}>ÉVÉNEMENTS LIÉS</div>
                <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "24px", display: "flex", justifyContent: "center" }}>
                  <div style={{ width: "22px", height: "22px", border: `2px solid ${C.gold}20`, borderTopColor: C.gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                </div>
              </>
            )}

            {!contexteLoading && (contexteAvant.length > 0 || contexteApres.length > 0) && (
              <>
                <div style={{ color: C.t2, fontSize: "11.5px", fontWeight: "800", letterSpacing: "0.6px", margin: "14px 0 6px" }}>ÉVÉNEMENTS LIÉS</div>
                <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "12px" }}>
                  {[...contexteAvant, selected, ...contexteApres].map((e, i, arr) => {
                    const em = meta(e.action);
                    const estSelection = e.id === selected.id;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <span style={{ color: C.t2, fontSize: "11.5px", fontWeight: 600, width: "44px", flexShrink: 0 }}>{heure(e.created_at)}</span>
                        <Icon name={em.iconKey} size={13} color={em.couleur(C)}/>
                        <span style={{ fontSize: "12.5px", color: estSelection ? C.gold : C.t1, fontWeight: estSelection ? 800 : 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <strong>{e.membre_nom}</strong> {libelleLigne(e)}
                        </span>
                        <ClientBadge action={e.action}/>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <button onClick={() => copierId(selected)} className="tap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "11px", color: C.t1, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}><Icon name="copy" size={14} color={C.t2}/> Copier ID</button>
              <button onClick={() => partager(selected)} className="tap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "11px", color: C.t1, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}><Icon name="share" size={14} color={C.t2}/> Partager</button>
            </div>
            <button onClick={() => setSelected(null)} style={{ width: "100%", marginTop: "10px", background: "none", border: "none", color: C.t2, fontSize: "12.5px", fontWeight: 600, cursor: "pointer", padding: "8px" }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
