"use client";

// Onglet "Mes offres" — gestion des offres du partenaire (chantier
// 26/07/2026). Accessible uniquement une fois institutions.
// partenaire_statut='approuve' (filtré côté nav dans page.tsx). Chaque
// offre est rédigée ici par le partenaire, jamais par Yelen — la
// modération admin (app/admin/offres) décide de la publication.
// Lot design 26/07/2026 : ajout des lignes de faits (clé/valeur, carte
// citoyenne) et des listes avantages/limites (onglets Pros/Cons de la
// fiche détail) — cf. migration 20260726000011_offres_faits_avantages.
// Refonte "centre de pilotage" (01/08/2026, cahier des charges CEO) : KPI,
// filtres/recherche, cartes avec menu d'actions, partage social vers
// /offres/[id] (page publique + image OG dynamique, même outillage que
// /institution/[id]) — patterns repris de ServicesTab.tsx (KpiCard,
// ServiceActionsMenu, barre de filtres) et MesClientsTab.tsx (badge statut
// en pilule), pas de nouveau style inventé.
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { supabase } from "@/lib/supabase";
import { T, type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { HelpCenterGuide } from "./HelpCenterGuide";
import { Card } from "@/components/ui/Card";
import { OFFRE_GENRES, OFFRE_GENRE_LABELS, OFFRE_GENRE_COULEURS, type OffreGenre } from "@/lib/offresCategories";
import { APP_URL } from "@/lib/config";
import { MesOffresPerformanceChart, type LignePerf } from "./MesOffresPerformanceChart";
import { OffreFicheContenu } from "@/components/OffreFicheOverlay";
import { MesOffresTable } from "./MesOffresTable";
import { FormField } from "./FormField";
import { MesOffresTopOffres, MesOffresActivite } from "./MesOffresAnalytics";
import {
  OffersHeader, OffersTabs, OffersSummary, OffersToolbar, OffersSkeleton, OffresStyles,
  type OffersKpi,
} from "./MesOffresUi";
import { MesOffresIntro } from "./MesOffresIntro";
import { MesOffresOffreDetail } from "./MesOffresOffreDetail";

const OFFRES_INTRO_VUE_KEY = "yelen224_offres_intro_vue";

export type Fait = { label: string; valeur: string };

export type Offre = {
  id: string; titre: string; description_courte: string; description_longue: string;
  categorie: string; genre: string; partenaire_nom: string; partenaire_logo: string | null; image_url: string | null; cta_label: string | null; cta_url: string | null;
  statut: string; motif_refus: string | null; nb_clics: number; created_at: string; soumis_le: string | null;
  valide_le: string | null; date_expiration: string | null; mis_a_jour_le: string;
  faits: Fait[]; avantages: string[]; limites: string[];
};

export const CATEGORIES = [
  { key: "telecom_media",  label: "Télécom & Média" },
  { key: "commerce_pme",   label: "Commerce & PME" },
  { key: "service_public", label: "Services publics" },
  { key: "evenement",      label: "Événements" },
  { key: "autre",          label: "Autre" },
];

const MAX_FAITS = 4;

const EMPTY_FORM = {
  titre: "", description_courte: "", description_longue: "", categorie: CATEGORIES[0].key,
  genre: OFFRE_GENRES[0] as string,
  image_url: null as string | null,
  cta_label: "", cta_url: "",
  // Date au format AAAA-MM-JJ (valeur d'un <input type="date">), vide =
  // pas d'expiration. Convertie en fin de journée ISO à la soumission
  // (submitForm) — "valable jusqu'au 31 août" doit couvrir toute la
  // journée du 31, pas s'arrêter à son tout début.
  date_expiration: "",
  faits: [] as Fait[], avantages: [] as string[], limites: [] as string[],
};

// Delta réel — jamais un pourcentage inventé (aucun historique de statuts
// n'est conservé, "vs mois dernier" serait fabriqué). "+N cette semaine"
// est calculable honnêtement depuis created_at, affiché seulement si N>0
// (pas de "+0" qui n'apporte rien).
function debutSemaine(): Date {
  const now = new Date();
  const jour = now.getDay(); // 0=dimanche..6=samedi
  const diffLundi = jour === 0 ? 6 : jour - 1;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffLundi);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Illustration sur mesure Yelen pour l'état vide (aucune offre publiée) —
// même langage que les illustrations Clock In Shift
// (ClockInShiftTab.tsx) : trait fin, un seul accent doré, fond doux, pas
// d'icône Feather isolée. Un ticket/coupon avec un badge pourcentage.
function IllustrationOffres({ C }: { C: ThemeTokens }) {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill={`${C.gold}0a`}/>
      <path d="M24 38a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v3a4 4 0 0 0 0 8v3a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4v-3a4 4 0 0 0 0-8z" fill={C.bgCard} stroke={C.t3} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M42 36v20" stroke={C.border2} strokeWidth="2" strokeDasharray="3 4"/>
      <circle cx="70" cy="62" r="12" fill={C.bgCard} stroke={C.gold} strokeWidth="2.2"/>
      <path d="M66 66l8-8M66.5 59h.01M73.5 65h.01" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Défini au niveau module (pas à l'intérieur de MesOffresTab) — un
// composant défini à l'intérieur d'un composant parent perd le focus de
// ses inputs à chaque frappe (React démonte/remonte le sous-arbre), même
// gotcha déjà rencontré sur le Journal d'activité (CLAUDE.md).
function FormSection({ numero, icon, titre, description, children }: { numero: number; icon: React.ReactNode; titre: string; description?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ marginBottom: "36px", paddingBottom: "36px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: `linear-gradient(135deg,${C.gold},${C.goldD})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#080812", fontSize: "14px", fontWeight: 800 }}>{numero}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ color: C.gold, flexShrink: 0 }}>{icon}</div>
          <div style={{ color: C.t1, fontSize: "17px", fontWeight: 800, letterSpacing: "-0.2px" }}>{titre}</div>
        </div>
      </div>
      {description && <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, marginBottom: "16px", marginLeft: "46px" }}>{description}</div>}
      <div style={{ marginLeft: "46px" }}>{children}</div>
    </div>
  );
}

// Chips au lieu de <select> natifs (retour Bryan 04/08/2026 : "encore
// amateur") — un <select> système ne se démarque jamais visuellement,
// jamais vu dans un produit soigné (DoorDash, Stripe...). Défini au
// niveau module comme FormSection ci-dessus.
function ChipSelect({ options, value, onChange }: { options: { key: string; label: string; color?: string }[]; value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
      {options.map(o => {
        const active = value === o.key;
        const color = o.color || C.gold;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} className="tap"
            style={{ padding: "8px 14px", borderRadius: "20px", border: `1.5px solid ${active ? color : C.border}`, background: active ? `${color}18` : C.bgCard2, color: active ? color : C.t2, fontSize: "12.5px", fontWeight: active ? 800 : 600, cursor: "pointer" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const STATUT_FILTRES = [
  { key: "toutes",                label: "Toutes" },
  { key: "publiee",               label: "Publiées" },
  { key: "en_attente_validation", label: "En attente" },
  { key: "brouillon",             label: "Brouillons" },
  { key: "refusee",               label: "Refusées" },
  { key: "suspendue",             label: "Suspendues" },
  { key: "archivee",              label: "Archivées" },
] as const;

export function MesOffresTab({ instId, onToast, access }: {
  instId: string; onToast: (msg: string, color?: string) => void; access: "full" | "read";
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [items, setItems] = useState<Offre[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [avantageDraft, setAvantageDraft] = useState("");
  const [limiteDraft, setLimiteDraft] = useState("");
  const [statutFiltre, setStatutFiltre] = useState<typeof STATUT_FILTRES[number]["key"]>("toutes");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [vuesParJour, setVuesParJour] = useState<LignePerf[]>([]);
  const [vuesParOffre, setVuesParOffre] = useState<Record<string, { vues: number; clics: number }>>({});
  const [instName, setInstName] = useState("");
  const [instLogo, setInstLogo] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [offresTab, setOffresTab] = useState<"offres" | "performance" | "activite">("offres");

  // Pop de valeur "Mes offres" — montré une seule fois par navigateur
  // (retour Bryan 04/08/2026), réouvrable à tout moment via l'icône info
  // du titre. try/catch : localStorage peut échouer (navigation privée),
  // ne doit jamais bloquer l'affichage de l'écran dans ce cas — on montre
  // simplement le pop à chaque fois plutôt que de planter.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        if (!localStorage.getItem(OFFRES_INTRO_VUE_KEY)) {
          setIntroOpen(true);
          localStorage.setItem(OFFRES_INTRO_VUE_KEY, "1");
        }
      } catch {
        setIntroOpen(true);
      }
    });
  }, []);

  // Nom/logo de l'institution — pour l'aperçu en direct du formulaire de
  // création (même valeur que celle écrite côté serveur dans
  // partenaire_nom/partenaire_logo à la création réelle de l'offre,
  // app/api/institution/offres/route.ts). Lecture publique (policy
  // institutions statut='validee'), pas besoin d'une route dédiée.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("institutions").select("name,logo").eq("id", instId).maybeSingle();
      if (data) { setInstName(data.name ?? ""); setInstLogo(data.logo ?? null); }
    })();
  }, [instId]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const p = new URLSearchParams(window.location.search).get("offres");
        if (p === "performance" || p === "activite") setOffresTab(p);
      } catch {}
    });
  }, []);

  function changerOffresTab(k: string) {
    const key = k === "performance" || k === "activite" ? k : "offres";
    setOffresTab(key);
    try {
      const u = new URL(window.location.href);
      if (key === "offres") u.searchParams.delete("offres"); else u.searchParams.set("offres", key);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {}
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/institution/offres`).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setLoadError(!res || !res.ok);
    setItems(res?.ok ? (j ?? []) : []);
    setLoading(false);
  }, []);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/institution/offres/vues`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) {
        setVuesParJour(j.parJour ?? []);
        setVuesParOffre(j.parOffre ?? {});
      }
    })();
  }, []);

  function openCreate() { setEditingId(null); setImageFile(null); setForm(EMPTY_FORM); setFormOpen(true); }
  function openEdit(o: Offre) {
    setEditingId(o.id);
    setImageFile(null);
    setForm({
      titre: o.titre, description_courte: o.description_courte, description_longue: o.description_longue,
      categorie: o.categorie, genre: o.genre || OFFRE_GENRES[0], image_url: o.image_url, cta_label: o.cta_label || "", cta_url: o.cta_url || "",
      date_expiration: o.date_expiration ? o.date_expiration.slice(0, 10) : "",
      faits: o.faits || [], avantages: o.avantages || [], limites: o.limites || [],
    });
    setFormOpen(true);
  }

  // Dupliquer — pré-remplit le formulaire en mode création (jamais un
  // second appel API tant que "Enregistrer"/"Soumettre" n'est pas cliqué).
  function dupliquer(o: Offre) {
    setEditingId(null);
    setImageFile(null);
    setForm({
      titre: `${o.titre} (copie)`, description_courte: o.description_courte, description_longue: o.description_longue,
      categorie: o.categorie, genre: o.genre || OFFRE_GENRES[0], image_url: o.image_url, cta_label: o.cta_label || "", cta_url: o.cta_url || "",
      // Jamais la même expiration qu'une offre déjà existante — une copie
      // pourrait sinon hériter d'une date déjà dépassée, sans que
      // l'institution s'en rende compte avant de soumettre.
      date_expiration: "",
      faits: o.faits || [], avantages: o.avantages || [], limites: o.limites || [],
    });
    setFormOpen(true);
  }

  function handleImageSelect(file: File) {
    setImageFile(file);
    setForm(f => ({ ...f, image_url: URL.createObjectURL(file) }));
  }
  function handleImageRemove() {
    setImageFile(null);
    setForm(f => ({ ...f, image_url: null }));
  }

  async function submitForm(soumettre: boolean) {
    setSaving(true);
    // L'échec de l'upload de la photo (ex. bucket Storage pas encore créé)
    // ne doit jamais bloquer l'enregistrement du reste de l'offre — la
    // photo reste optionnelle, retour Bryan 04/08/2026. form.image_url
    // vaut ici une URL blob: locale (URL.createObjectURL) tant que le
    // fichier n'est pas réellement envoyé : ne jamais l'enregistrer telle
    // quelle en base (lien mort après fermeture de l'onglet).
    let imageUrl = imageFile ? null : form.image_url;
    let avertissementImage = false;
    if (imageFile) {
      const fd = new FormData();
      fd.append("file", imageFile);
      const upRes = await fetch("/api/institution/offres/media", { method: "POST", body: fd });
      const upJ = await upRes.json().catch(() => null);
      if (upRes.ok) {
        imageUrl = upJ.url;
      } else {
        avertissementImage = true;
      }
    }
    // "Valable jusqu'au 31 août" doit couvrir toute la journée du 31, pas
    // s'arrêter à son tout début (minuit) — converti en fin de journée.
    const dateExpiration = form.date_expiration ? new Date(`${form.date_expiration}T23:59:59`).toISOString() : null;
    const body: Record<string, unknown> = { ...form, image_url: imageUrl, date_expiration: dateExpiration };
    if (soumettre) body.action = "soumettre";
    const res = editingId
      ? await fetch(`/api/institution/offres/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/institution/offres`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { onToast(j?.error || "Cette offre n'a pas pu être enregistrée.", C.red); return; }
    if (soumettre && !editingId && j?.id) {
      await fetch(`/api/institution/offres/${j.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "soumettre" }) });
    }
    setFormOpen(false);
    setImageFile(null);
    if (avertissementImage) {
      onToast("Enregistré, mais la photo n'a pas pu être envoyée — réessayez plus tard.", C.orange);
    } else {
      onToast(soumettre ? "Offre soumise à la modération Yelen" : "Brouillon enregistré", C.green);
    }
    load();
  }

  async function action(id: string, act: "suspendre" | "archiver" | "soumettre") {
    setBusyId(id);
    setMenuOpenId(null);
    const res = await fetch(`/api/institution/offres/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: act }) });
    setBusyId(null);
    if (res.ok) { onToast("Mise à jour effectuée", C.green); load(); }
  }

  async function supprimer(id: string) {
    setBusyId(id);
    setMenuOpenId(null);
    const res = await fetch(`/api/institution/offres/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) setItems(prev => prev.filter(o => o.id !== id));
  }

  async function partager(o: Offre) {
    setMenuOpenId(null);
    const url = `${APP_URL}/offres/${o.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: o.titre, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); onToast("Lien copié.", C.green); } catch {}
    }
  }

  function previsualiser(o: Offre) {
    setMenuOpenId(null);
    window.open(`${APP_URL}/offres/${o.id}`, "_blank", "noopener,noreferrer");
  }

  function addFait() {
    if (form.faits.length >= MAX_FAITS) return;
    setForm(f => ({ ...f, faits: [...f.faits, { label: "", valeur: "" }] }));
  }
  function updateFait(i: number, key: "label" | "valeur", value: string) {
    setForm(f => ({ ...f, faits: f.faits.map((ft, idx) => idx === i ? { ...ft, [key]: value } : ft) }));
  }
  function removeFait(i: number) {
    setForm(f => ({ ...f, faits: f.faits.filter((_, idx) => idx !== i) }));
  }
  function addAvantage() {
    if (!avantageDraft.trim()) return;
    setForm(f => ({ ...f, avantages: [...f.avantages, avantageDraft.trim()] }));
    setAvantageDraft("");
  }
  function addLimite() {
    if (!limiteDraft.trim()) return;
    setForm(f => ({ ...f, limites: [...f.limites, limiteDraft.trim()] }));
    setLimiteDraft("");
  }

  const STATUT_INFO: Record<string, { label: string; color: string; bg: string }> = {
    brouillon:             { label: "Brouillon",       color: C.t2,     bg: C.bg3 },
    en_attente_validation: { label: "En attente",       color: C.orange, bg: C.orangeL },
    publiee:               { label: "Publiée",         color: C.green,  bg: C.greenL },
    refusee:               { label: "Refusée",         color: C.red,    bg: C.redL },
    suspendue:             { label: "Suspendue",       color: C.orange, bg: C.orangeL },
    archivee:              { label: "Archivée",        color: C.t3,     bg: C.bg3 },
  };

  const inputStyle = { width: "100%", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 13px", color: C.t1, fontSize: "13px", marginBottom: "12px" };
  const labelStyle = { color: C.t2, fontSize: "11.5px", fontWeight: 700, marginBottom: "5px", display: "block" };

  const debutSem = debutSemaine();
  const creesCetteSemaine = (statut: string) => items.filter(o => o.statut === statut && new Date(o.created_at) >= debutSem).length;
  const kpis = {
    publiees:   items.filter(o => o.statut === "publiee").length,
    enAttente:  items.filter(o => o.statut === "en_attente_validation").length,
    brouillons: items.filter(o => o.statut === "brouillon").length,
    refusees:   items.filter(o => o.statut === "refusee").length,
    archivees:  items.filter(o => o.statut === "archivee").length,
    clics:      items.reduce((s, o) => s + (o.nb_clics || 0), 0),
  };
  const deltas = {
    publiees:   creesCetteSemaine("publiee"),
    enAttente:  creesCetteSemaine("en_attente_validation"),
    brouillons: creesCetteSemaine("brouillon"),
    refusees:   creesCetteSemaine("refusee"),
    archivees:  creesCetteSemaine("archivee"),
  };
  // Vues cette semaine — vrai delta semaine vs semaine précédente (jamais
  // un pourcentage inventé), calculable depuis offre_vues (Lot infra
  // vues/clics). vuesParJour contient 30 entrées triées du plus ancien au
  // plus récent.
  const vuesSemaine = vuesParJour.slice(-7).reduce((s, d) => s + d.vues, 0);
  const vuesSemainePrecedente = vuesParJour.slice(-14, -7).reduce((s, d) => s + d.vues, 0);
  const deltaVues = vuesSemaine - vuesSemainePrecedente;

  const basculerStatut = (k: typeof STATUT_FILTRES[number]["key"]) => setStatutFiltre(statutFiltre === k ? "toutes" : k);
  const semaine = (n: number) => (n > 0 ? `+${n} cette semaine` : undefined);
  const kpiItems: OffersKpi[] = [
    { key: "publiee", label: "Publiées", value: kpis.publiees, dot: C.green, sub: semaine(deltas.publiees), active: statutFiltre === "publiee", onClick: () => basculerStatut("publiee") },
    { key: "en_attente", label: "En attente", value: kpis.enAttente, dot: C.orange, sub: semaine(deltas.enAttente), active: statutFiltre === "en_attente_validation", onClick: () => basculerStatut("en_attente_validation") },
    { key: "brouillon", label: "Brouillons", value: kpis.brouillons, dot: C.t2, sub: semaine(deltas.brouillons), active: statutFiltre === "brouillon", onClick: () => basculerStatut("brouillon") },
    { key: "refusee", label: "Refusées", value: kpis.refusees, dot: C.red, sub: semaine(deltas.refusees), active: statutFiltre === "refusee", onClick: () => basculerStatut("refusee") },
    { key: "archivee", label: "Archivées", value: kpis.archivees, dot: C.t3, sub: semaine(deltas.archivees), active: statutFiltre === "archivee", onClick: () => basculerStatut("archivee") },
    { key: "clics", label: "Clics totaux", value: kpis.clics },
    { key: "vues", label: "Vues cette semaine", value: vuesSemaine, delta: deltaVues, deltaLabel: "vs semaine dernière", sub: deltaVues !== 0 ? "vs semaine dernière" : undefined },
  ];
  const filtreActif = statutFiltre !== "toutes" || search.trim() !== "";
  function reinitialiserFiltres() { setStatutFiltre("toutes"); setSearch(""); }

  const selected = items.find(o => o.id === selectedId) ?? items[0] ?? null;

  const q = search.trim().toLowerCase();
  const visibleItems = items.filter(o => {
    if (statutFiltre !== "toutes" && o.statut !== statutFiltre) return false;
    if (!q) return true;
    const genreLabel = OFFRE_GENRE_LABELS[o.genre as OffreGenre] || o.genre;
    const statutLabel = STATUT_INFO[o.statut]?.label || o.statut;
    return o.titre.toLowerCase().includes(q) || o.categorie.toLowerCase().includes(q) || genreLabel.toLowerCase().includes(q) || statutLabel.toLowerCase().includes(q);
  });

  // Sensation de progression (retour Bryan 04/08/2026) — basée sur les
  // mêmes 4 champs que la condition disabled du bouton "Soumettre à
  // Yelen" plus bas, jamais une estimation différente/inventée.
  const CHAMPS_REQUIS = [form.titre, form.description_courte, form.description_longue, form.cta_url];
  const champsCompletes = CHAMPS_REQUIS.filter(Boolean).length;
  const champsRequisTotal = CHAMPS_REQUIS.length;

  // Aperçu en direct du formulaire — construit à partir de l'état `form`
  // en cours de saisie (pas d'une offre déjà enregistrée), avec des
  // valeurs de repli lisibles tant que les champs sont vides. Uniquement
  // visible dans le pop plein écran de création/édition, jamais sur
  // l'écran principal.
  const draftOffre = {
    id: editingId ?? "draft",
    titre: form.titre.trim() || "Titre de votre offre",
    description_courte: form.description_courte.trim() || "Résumé affiché sur la carte",
    description_longue: form.description_longue.trim() || "Décrivez ici votre offre en détail pour que le citoyen comprenne pourquoi elle est intéressante.",
    categorie: form.categorie,
    genre: form.genre,
    partenaire_nom: instName || "Votre établissement",
    partenaire_logo: instLogo,
    image_url: form.image_url,
    cta_label: form.cta_label || null,
    cta_url: form.cta_url || null,
    date_expiration: form.date_expiration ? new Date(`${form.date_expiration}T23:59:59`).toISOString() : null,
    nb_clics: 0,
    faits: form.faits.filter(f => f.label || f.valeur),
    avantages: form.avantages,
    limites: form.limites,
  };

  return (
    <div className="ofx-page">
      <OffresStyles C={C}/>
      <style>{`
        .offres-perf-row{display:flex;flex-direction:column;gap:16px;margin-bottom:16px}
        .offres-perf-col-left{flex:1;min-width:0}
        .offres-perf-col-right{width:100%}
        @media(min-width:1024px){
          .offres-perf-row{flex-direction:row;align-items:flex-start}
          .offres-perf-col-right{width:320px;flex-shrink:0}
        }
        .offre-form-layout{display:flex;flex-direction:column;gap:24px}
        .offre-form-fields{flex:1;min-width:0}
        .offre-form-preview{width:100%}
        @media(min-width:1024px){
          .offre-form-layout{flex-direction:row;align-items:flex-start}
          .offre-form-preview{width:360px;flex-shrink:0;position:sticky;top:20px}
        }
      `}</style>

      <OffersHeader C={C} canCreate={access === "full"} onCreate={openCreate}
        titleExtras={
          <>
            <button onClick={() => setIntroOpen(true)} className="ofx-btn tap" title="Pourquoi publier des offres ?" aria-label="Pourquoi publier des offres ?" style={{ width: "22px", height: "22px", borderRadius: "50%", background: C.bgCard2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer", flexShrink: 0 }}>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </button>
            <HelpCenterGuide tab="mes-offres" />
          </>
        }/>

      {formOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: C.bg, display: "flex", flexDirection: "column" }}>
          <header style={{ flexShrink: 0, background: `${C.bgCard}F5`, backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setFormOpen(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: C.bgCard2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.t1, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 800 }}>{editingId ? "Modifier l'offre" : "Nouvelle offre"}</div>
              <div/>
            </div>
            <div style={{ height: "3px", background: C.border, borderRadius: "2px", overflow: "hidden", margin: "0 0 10px" }}>
              <div style={{ height: "100%", width: `${(champsCompletes / champsRequisTotal) * 100}%`, background: C.gold, borderRadius: "2px", transition: "width 0.2s ease" }}/>
            </div>
          </header>

          <main style={{ flex: 1, overflowY: "auto", padding: "24px 20px 24px" }}>
            <div style={{ maxWidth: "1100px", margin: "0 auto" }} className="offre-form-layout">
              <div className="offre-form-fields">
                <FormSection
                  numero={1}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
                  titre="Présentez votre offre"
                  description="C'est ce que le citoyen voit en premier dans son fil Yelen — choisissez un titre clair et concret."
                >
                  <label style={labelStyle}>Photo de l&apos;offre</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: C.bgCard2, border: `1px dashed ${C.border2}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer", marginBottom: "12px" }}>
                    {form.image_url ? (
                      // IMG-EXCEPTION: reason=form.image_url vaut une URL blob: locale (URL.createObjectURL) tant que le fichier n'est pas envoyé, non fetchable par l'optimiseur next/image | reviewed=2026-08-08
                      // eslint-disable-next-line @next/next/no-img-element
                      <div style={{ width: "64px", height: "42px", borderRadius: "7px", overflow: "hidden", flexShrink: 0 }}><img src={form.image_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt=""/></div>
                    ) : (
                      <div style={{ width: "64px", height: "42px", borderRadius: "7px", backgroundColor: `${C.gold}0A`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: form.image_url ? C.green : C.t1, fontSize: "12.5px", fontWeight: 700 }}>{form.image_url ? "Photo sélectionnée" : "Ajouter une photo"}</div>
                      <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>JPG, PNG — max 10 Mo. Une vraie photo rend votre offre bien plus attractive.</div>
                    </div>
                    {form.image_url && <button onClick={e => { e.preventDefault(); handleImageRemove(); }} style={{ background: "none", border: "none", color: C.red, fontSize: "18px", cursor: "pointer" }}>×</button>}
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} style={{ display: "none" }}/>
                  </label>

                  <div style={{ marginBottom: "12px" }}>
                    <FormField C={C} label="Titre de l'offre" required placeholder="Ex : -20% sur votre première consultation" value={form.titre} onChange={v => setForm(f => ({ ...f, titre: v }))} name="titre"/>
                  </div>
                  <label style={labelStyle}>Genre d&apos;offre</label>
                  <ChipSelect
                    options={OFFRE_GENRES.map(g => ({ key: g, label: OFFRE_GENRE_LABELS[g], color: OFFRE_GENRE_COULEURS[g]?.bg }))}
                    value={form.genre}
                    onChange={v => setForm(f => ({ ...f, genre: v }))}
                  />
                  <label style={labelStyle}>Catégorie</label>
                  <ChipSelect
                    options={CATEGORIES.map(c => ({ key: c.key, label: c.label }))}
                    value={form.categorie}
                    onChange={v => setForm(f => ({ ...f, categorie: v }))}
                  />
                  <div style={{ marginBottom: "12px" }}>
                    <FormField C={C} label="Résumé (affiché sur la carte)" required placeholder="Ex : Valable jusqu'au 31 août, dans la limite des places" value={form.description_courte} onChange={v => setForm(f => ({ ...f, description_courte: v }))} name="descriptionCourte"/>
                  </div>
                  <label style={labelStyle}>Date d&apos;expiration (optionnelle)</label>
                  <input type="date" min={new Date().toISOString().slice(0, 10)} style={inputStyle} value={form.date_expiration} onChange={e => setForm(f => ({ ...f, date_expiration: e.target.value }))}/>
                </FormSection>

                <FormSection
                  numero={2}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
                  titre="Ce que le citoyen doit retenir"
                  description={`Jusqu'à ${MAX_FAITS} informations clés, affichées en mini-tableau — donnez des repères concrets, pas juste un chiffre brut.`}
                >
                  {form.faits.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <input placeholder={`Ex : "Frais d'inscription"`} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={f.label} onChange={e => updateFait(i, "label", e.target.value)}/>
                      <input placeholder={`Ex : "8 000 GNF"`} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={f.valeur} onChange={e => updateFait(i, "valeur", e.target.value)}/>
                      <button onClick={() => removeFait(i)} style={{ background: C.redL, border: `1px solid ${C.red}30`, color: C.red, borderRadius: "8px", padding: "0 12px", cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                  {form.faits.length < MAX_FAITS && (
                    <button onClick={addFait} style={{ background: "none", border: `1px dashed ${C.border}`, color: C.t2, fontSize: "12px", fontWeight: 700, padding: "8px", borderRadius: "8px", cursor: "pointer", width: "100%" }}>
                      + Ajouter une ligne de fait
                    </button>
                  )}
                </FormSection>

                <FormSection
                  numero={3}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>}
                  titre="Pourquoi choisir cette offre"
                  description="Aidez le citoyen à se décider en un coup d'œil — un avantage ou une limite par ligne."
                >
                  <label style={labelStyle}>Avantages</label>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={avantageDraft} onChange={e => setAvantageDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAvantage(); } }}/>
                    <button onClick={addAvantage} style={{ background: C.greenL, border: `1px solid ${C.green}30`, color: C.green, borderRadius: "8px", padding: "0 14px", cursor: "pointer", fontWeight: 700 }}>+</button>
                  </div>
                  {form.avantages.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                      {form.avantages.map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgCard2, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: C.t1 }}>
                          <span>{a}</span>
                          <button onClick={() => setForm(f => ({ ...f, avantages: f.avantages.filter((_, idx) => idx !== i) }))} style={{ background: "none", border: "none", color: C.t2, cursor: "pointer" }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label style={labelStyle}>Limites</label>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} value={limiteDraft} onChange={e => setLimiteDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLimite(); } }}/>
                    <button onClick={addLimite} style={{ background: C.orangeL, border: `1px solid ${C.orange}30`, color: C.orange, borderRadius: "8px", padding: "0 14px", cursor: "pointer", fontWeight: 700 }}>+</button>
                  </div>
                  {form.limites.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {form.limites.map((l, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgCard2, borderRadius: "8px", padding: "7px 10px", fontSize: "12.5px", color: C.t1 }}>
                          <span>{l}</span>
                          <button onClick={() => setForm(f => ({ ...f, limites: f.limites.filter((_, idx) => idx !== i) }))} style={{ background: "none", border: "none", color: C.t2, cursor: "pointer" }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </FormSection>

                <FormSection
                  numero={4}
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>}
                  titre="Passer à l'action"
                  description="Ce qui se passe quand le citoyen clique pour en savoir plus."
                >
                  <label style={labelStyle}>Description complète <span style={{ color: C.red }}>*</span></label>
                  <textarea placeholder="Expliquez les conditions, la démarche à suivre, tout ce qui aide le citoyen à comprendre l'offre." style={{ ...inputStyle, minHeight: "90px", resize: "vertical" as const }} value={form.description_longue} onChange={e => setForm(f => ({ ...f, description_longue: e.target.value }))}/>
                  <div style={{ marginBottom: "12px" }}>
                    <FormField C={C} label="Texte du bouton d'action" placeholder="Ex : Profiter de l'offre" value={form.cta_label} onChange={v => setForm(f => ({ ...f, cta_label: v }))} name="ctaLabel"/>
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <FormField C={C} label="Lien externe (site, formulaire, page dédiée…)" required placeholder="https://…" value={form.cta_url} onChange={v => setForm(f => ({ ...f, cta_url: v }))} name="ctaUrl"/>
                  </div>
                </FormSection>
              </div>

              <div className="offre-form-preview">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <span style={{ position: "relative", width: "8px", height: "8px", borderRadius: "50%", background: C.green, flexShrink: 0 }}>
                    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.green, animation: "ping 1.6s ease-out infinite" }}/>
                  </span>
                  <div style={{ color: C.t1, fontSize: "15px", fontWeight: 800 }}>Aperçu en direct</div>
                </div>
                <Card tokens={toCardTokens(C)} padding="24px">
                  <div style={{ width: "270px", maxWidth: "100%", margin: "0 auto", height: "500px", borderRadius: "38px", border: `8px solid ${theme === "dark" ? "#000" : "#1a1a1a"}`, overflow: "hidden", position: "relative", background: C.bg, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
                    <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "90px", height: "18px", background: theme === "dark" ? "#000" : "#1a1a1a", borderRadius: "0 0 12px 12px", zIndex: 2 }}/>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", paddingTop: "18px" }}>
                      <OffreFicheContenu offre={draftOffre} isDark={theme === "dark"} card={C.bgCard} t1={C.t1} t2={C.t2} t3={C.t3} brd={C.border} populaire={false}/>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </main>

          <footer style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.bgCard, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", gap: "10px", maxWidth: "1100px", margin: "0 auto" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" disabled={!form.titre} loading={saving} onClick={() => submitForm(false)}>
                Enregistrer en brouillon
              </Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" disabled={champsCompletes < champsRequisTotal} loading={saving} onClick={() => submitForm(true)}>
                {`Soumettre à Yelen${champsCompletes < champsRequisTotal ? ` (${champsCompletes}/${champsRequisTotal})` : ""}`}
              </Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="ghost" size="md" onClick={() => setFormOpen(false)}>Annuler</Button>
            </div>
          </footer>
        </div>
      )}

      {loading ? (
        <OffersSkeleton C={C}/>
      ) : loadError && items.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="32px" style={{ textAlign: "center" }}>
          <div role="alert" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Impossible de charger les offres</div>
          <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Vérifiez votre connexion puis réessayez.</div>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={load}>Réessayer</Button>
        </Card>
      ) : items.length === 0 ? (
        <Card tokens={toCardTokens(C)} padding="44px 24px" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><IllustrationOffres C={C}/></div>
          <div style={{ color: C.t1, fontSize: "16px", fontWeight: 600, marginBottom: "6px" }}>Aucune offre pour le moment</div>
          <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, maxWidth: "380px", margin: "0 auto 20px" }}>Une offre publiée devient visible par tous les utilisateurs de Yelen : remise, avantage, ou service mis en avant. Yelen valide chaque offre avant publication.</div>
          {access === "full" && (
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={openCreate}>Nouvelle offre</Button>
          )}
        </Card>
      ) : (
        <>
          <OffersTabs C={C} active={offresTab} onChange={changerOffresTab}
            tabs={[{ key: "offres", label: "Offres", count: items.length }, { key: "performance", label: "Performance" }, { key: "activite", label: "Activité et modération" }]}/>

          {offresTab === "offres" && (
            <div role="tabpanel" id="ofx-panel-offres" aria-labelledby="ofx-tab-offres">
              <OffersSummary C={C} items={kpiItems}/>
              <OffersToolbar C={C} active={!formOpen} search={search} onSearch={setSearch}
                statuts={STATUT_FILTRES.map(s => ({ key: s.key, label: s.label, count: s.key === "toutes" ? items.length : items.filter(o => o.statut === s.key).length }))}
                statutActif={statutFiltre}
                onStatut={k => { const f = STATUT_FILTRES.find(x => x.key === k); if (f) setStatutFiltre(f.key); }}
                total={visibleItems.length} filtreActif={filtreActif} onReset={reinitialiserFiltres}/>
              {visibleItems.length === 0 ? (
                <Card tokens={toCardTokens(C)} padding="32px" style={{ textAlign: "center" }}>
                  <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Aucun résultat</div>
                  <div style={{ color: C.t2, fontSize: "13px", marginBottom: "14px" }}>Aucune offre ne correspond à ces critères.</div>
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={reinitialiserFiltres}>Réinitialiser les filtres</Button>
                </Card>
              ) : (
                <MesOffresTable
                  items={visibleItems}
                  access={access}
                  busyId={busyId}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  vuesParOffre={vuesParOffre}
                  onSelect={id => { setSelectedId(id); setDetailOpen(true); }}
                  onEdit={o => { setMenuOpenId(null); openEdit(o); }}
                  onPreview={previsualiser}
                  onShare={partager}
                  onDuplicate={dupliquer}
                  onSuspendre={id => action(id, "suspendre")}
                  onRepublier={id => action(id, "soumettre")}
                  onArchiver={id => action(id, "archiver")}
                  onSupprimer={supprimer}
                />
              )}
            </div>
          )}

          {offresTab === "performance" && (
            <div role="tabpanel" id="ofx-panel-performance" aria-labelledby="ofx-tab-performance" className="offres-perf-row">
              <div className="offres-perf-col-left"><MesOffresPerformanceChart parJour={vuesParJour}/></div>
              <div className="offres-perf-col-right"><MesOffresTopOffres items={items} vuesParOffre={vuesParOffre}/></div>
            </div>
          )}

          {offresTab === "activite" && (
            <div role="tabpanel" id="ofx-panel-activite" aria-labelledby="ofx-tab-activite">
              <MesOffresActivite items={items}/>
            </div>
          )}
        </>
      )}

      {introOpen && (
        <MesOffresIntro
          onClose={() => setIntroOpen(false)}
          onCreer={() => { setIntroOpen(false); openCreate(); }}
        />
      )}

      {detailOpen && selected && (
        <MesOffresOffreDetail
          offre={selected}
          vues={vuesParOffre[selected.id]?.vues ?? 0}
          busy={busyId === selected.id}
          onClose={() => setDetailOpen(false)}
          onEdit={() => { setDetailOpen(false); openEdit(selected); }}
          onShare={() => partager(selected)}
          onPreview={() => previsualiser(selected)}
          onSuspendre={() => action(selected.id, "suspendre")}
          onRepublier={() => action(selected.id, "soumettre")}
          onArchiver={() => action(selected.id, "archiver")}
          onSupprimer={() => { setDetailOpen(false); supprimer(selected.id); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}
