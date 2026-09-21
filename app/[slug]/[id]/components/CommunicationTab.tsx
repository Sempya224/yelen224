"use client";

// Onglet Communication — Annonces uniquement (08/08/2026 : Signalements
// extrait vers SignalementsTab.tsx, écran de premier niveau séparé dans le
// menu — les deux n'ont pas le même rôle, communication vers les citoyens
// vs support vers Yelen, ne devaient pas partager un même onglet).
//
// Annonces — refonte totale (spec CEO 20/07/2026, niveau Meta Business
// Suite/LinkedIn Company Manager). Écritures institution déplacées vers
// /api/institution/annonces (service_role) : `annonces` n'a aucune policy
// RLS d'écriture (voir migration 20260720000009_annonces_engagement.sql),
// les anciens writes directs depuis le navigateur étaient soit déjà
// bloqués soit une faille ouverte selon l'état réel des grants — corrigé
// une fois pour toutes en passant par la route. Engagement (portée/likes/
// commentaires/partages) vient des nouvelles tables annonce_vues/
// annonce_likes/annonce_commentaires, agrégé par cette même route — aucun
// chiffre fictif. Audience par type de citoyen (clients/patients/…)
// explicitement reportée (décision Bryan 20/07/2026) : aucune
// classification citoyen n'existe en base, seul `regions_cibles`
// (géographique) reste. Formats riches (carrousel/pdf/vidéo) : colonne
// `format`/`media_urls` posées par la migration, sélecteur et upload
// réels arrivent au lot suivant (formulaire de création) — cette passe
// couvre liste, KPI et filtres.
//
// Signalements — inchangé dans cette passe (écritures directes existantes
// conservées telles quelles, hors périmètre de ce chantier).
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLoader } from "@/components/YelenLoader";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { FormField } from "./FormField";

// Statistiques V2 (17/09/2026, brief CEO) — réponse de
// /api/institution/annonces/stats. "Clics"/"Ouvertures"/"Sources de
// découverte" hors périmètre (décision Bryan 17/09/2026) : nb_clics n'est
// jamais incrémenté pour les annonces, aucune colonne "source" n'existe.
type StatsPeriode = "7j" | "30j" | "90j" | "annee";
type StatsKpiEntry = { valeur: number; delta_pct: number | null };
type StatsAnnonceDetail = { id: string; titre: string; type: string; statut: string; vues: number; citoyens_touches: number; interactions: number; taux_interaction: number | null };
type StatsData = {
  bornes: { debut: string; fin: string };
  kpi: { vues: StatsKpiEntry; citoyens_touches: StatsKpiEntry; interactions: StatsKpiEntry; annonces_actives: { valeur: number }; taux_interaction: { valeur: number | null; delta_pct: number | null } };
  engagement: { likes: number; commentaires: number; partages: number };
  serie: { date: string; vues: number; citoyens_touches: number; interactions: number }[];
  annonces: StatsAnnonceDetail[];
  echantillon_suffisant: boolean;
};

type Annonce = {
  id: string;
  titre: string;
  contenu: string;
  type: string;
  statut: string;
  format: string;
  media_urls: string[] | null;
  date_expiration: string | null;
  date_publication: string | null;
  nb_vues: number;
  nb_clics: number;
  nb_partages: number;
  image_url: string | null;
  created_at: string;
  epingle: boolean;
  regions_cibles: string[] | null;
  portee: number;
  nb_likes: number;
  nb_commentaires: number;
};

const TYPES = (C: ThemeTokens) => [
  { id: "information", label: "Information",         color: C.blue,   desc: "Horaires, fermetures, changements" },
  { id: "offre",       label: "Offre / Promotion",    color: C.green,  desc: "Tarifs spéciaux, nouveaux services" },
  { id: "urgent",      label: "Urgent",               color: C.red,    desc: "Alerte, interruption de service" },
  { id: "evenement",   label: "Événement",            color: C.purple, desc: "Portes ouvertes, campagnes" },
  { id: "communique",  label: "Communiqué officiel",  color: C.gold,   desc: "Déclaration institutionnelle" },
];

// Badge de type (17/09/2026, retour Bryan) — neutre par défaut comme dans
// CollaborationTab.tsx, l'or plein Yelen réservé au seul type qui mérite
// vraiment l'attention (Urgent = alerte citoyenne). `t.color` reste utilisé
// tel quel ailleurs (sélection dans le picker, barres de répartition,
// liseré de carte) : ce sont des usages de catégorisation, pas des cadres
// de statut passifs.
function typeBadgeStyle(typeId: string, C: ThemeTokens): { bg: string; border: string; color: string } {
  if (typeId === "urgent") return { bg: C.gold, border: C.gold, color: "#080812" };
  return { bg: C.bg3, border: C.border2, color: C.t2 };
}

const REGIONS = [
  "Conakry", "Boké", "Kindia", "Mamou", "Labé", "Faranah", "Kankan", "Nzérékoré",
  "France", "États-Unis", "Belgique", "Canada", "Royaume-Uni", "Allemagne", "Espagne", "Maroc", "Sénégal",
];

const TEMPLATES: Record<string, { titre: string; contenu: string }[]> = {
  information: [
    { titre: "Fermeture exceptionnelle", contenu: "Nous vous informons que notre établissement sera fermé le [DATE] en raison de [MOTIF]. Nous vous prions de nous excuser pour la gêne occasionnée et restons disponibles par téléphone." },
    { titre: "Changement d'horaires", contenu: "À compter du [DATE], nos horaires d'ouverture seront modifiés comme suit : [NOUVEAUX HORAIRES]. Nous vous remercions de votre compréhension." },
    { titre: "Nouveau service disponible", contenu: "Nous avons le plaisir de vous annoncer la disponibilité d'un nouveau service : [NOM DU SERVICE]. Prenez rendez-vous dès maintenant sur Yelen224." },
  ],
  urgent: [
    { titre: "Interruption de service", contenu: "URGENT : En raison de [MOTIF], nos services sont temporairement indisponibles. Nous mettons tout en œuvre pour rétablir la situation dans les meilleurs délais. Merci de votre patience." },
    { titre: "Alerte importante", contenu: "INFORMATION URGENTE : [CONTENU DE L'ALERTE]. Pour toute urgence, contactez-nous au [NUMÉRO DE TÉLÉPHONE]." },
  ],
  evenement: [
    { titre: "Journée portes ouvertes", contenu: "Nous vous invitons à notre journée portes ouvertes le [DATE] de [HEURE DÉBUT] à [HEURE FIN]. Venez découvrir nos services, rencontrer nos équipes et bénéficier d'offres spéciales. Entrée libre !" },
    { titre: "Campagne gratuite", contenu: "À l'occasion de [ÉVÉNEMENT], nous organisons une campagne gratuite de [SERVICE] le [DATE] de [HEURE] à [HEURE]. Places limitées — réservez votre créneau dès maintenant." },
  ],
  offre: [
    { titre: "Offre spéciale", contenu: "OFFRE LIMITÉE : Du [DATE DÉBUT] au [DATE FIN], bénéficiez de [DESCRIPTION OFFRE]. Profitez-en dès maintenant en prenant rendez-vous sur Yelen224 !" },
    { titre: "Nouveau tarif préférentiel", contenu: "Nous avons le plaisir de vous proposer un nouveau tarif préférentiel pour [SERVICE] : [DÉTAILS TARIF]. Offre valable jusqu'au [DATE]." },
  ],
  communique: [
    { titre: "Communiqué officiel", contenu: "Par la présente, [NOM DE L'INSTITUTION] informe l'ensemble de ses clients et partenaires que [CONTENU DU COMMUNIQUÉ]. Pour toute information complémentaire, notre équipe reste à votre disposition." },
  ],
};

// Libellés alignés sur le repositionnement "canal d'information officiel"
// (17/09/2026, brief CEO) — "Active"/"Programmée" plutôt que "Publiée"/
// "Planifiée", cohérent avec le vocabulaire des KPI. Aucune valeur de
// `statut` en base ne change, uniquement l'affichage.
// Fonds neutres partout (17/09/2026, retour Bryan) — même traitement que
// CollaborationTab.tsx : plus aucun cadre en fond teinté par défaut, la
// vraie couleur Yelen (or plein) reste réservée à ce qui mérite vraiment
// l'attention (ex. le bandeau d'expiration plus bas). Aucun de ces 5
// statuts n'est un état d'erreur — rien ici ne justifie une couleur dédiée.
const STATUT_CFG = (C: ThemeTokens): Record<string, { label: string; color: string; bg: string }> => ({
  publiee:   { label: "Active",     color: C.t2, bg: C.bg3 },
  brouillon: { label: "Brouillon",  color: C.t2, bg: C.bg3 },
  planifiee: { label: "Programmée", color: C.t2, bg: C.bg3 },
  terminee:  { label: "Terminée",   color: C.t3, bg: C.bg3 },
  archivee:  { label: "Archivée",   color: C.t3, bg: C.bg3 },
});

const STATUT_FILTRES = [
  { key: "tous", label: "Toutes" },
  { key: "brouillon", label: "Brouillons" },
  { key: "planifiee", label: "Programmées" },
  { key: "publiee", label: "Actives" },
  { key: "terminee", label: "Terminées" },
  { key: "archivee", label: "Archivées" },
];

const FORMAT_LABELS: Record<string, string> = { image: "Image", carrousel: "Carrousel", pdf: "PDF", video: "Vidéo" };
const FORMAT_FILTRES = [
  { key: "tous", label: "Tous formats" },
  { key: "image", label: "Image" },
  { key: "carrousel", label: "Carrousel" },
  { key: "pdf", label: "PDF" },
  { key: "video", label: "Vidéo" },
];

function realStatut(a: Annonce): string {
  if (a.statut === "archivee") return "archivee";
  const isExpired = a.date_expiration ? new Date(a.date_expiration) < new Date() : false;
  return isExpired ? "terminee" : a.statut;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function fmtCompact(n: number): string {
  if (n >= 1000) { const v = n / 1000; return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`; }
  return String(n);
}

const inputStyle = (C: ThemeTokens): React.CSSProperties => ({
  width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "11px 14px", color: C.t1, fontSize: "14px", fontFamily: "inherit",
});
const labelStyle = (C: ThemeTokens): React.CSSProperties => ({
  color: C.t3, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em",
  display: "block", marginBottom: "7px", fontWeight: "600",
});

const PAGE_SIZE = 8;
const MAX_MEDIA_SIZE = 10 * 1024 * 1024; // cohérent avec MAX_DOCUMENT_SIZE (lib/documentsInstitution.ts)
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_CARROUSEL_IMAGES = 6;

const FORMATS = [
  { id: "image",     label: "Image",     desc: "Une photo de couverture" },
  { id: "carrousel", label: "Carrousel", desc: `Jusqu'à ${MAX_CARROUSEL_IMAGES} images` },
  { id: "pdf",       label: "PDF",       desc: "Un document à consulter" },
  { id: "video",     label: "Vidéo",     desc: "MP4 — 50 Mo max" },
];

function IconVoir({ color }: { color: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function IconStats({ color }: { color: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
function IconMenu({ color }: { color: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>;
}
function IconFormat({ format, color }: { format: string; color: string }) {
  if (format === "video") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
  if (format === "pdf") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  if (format === "carrousel") return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="6" width="14" height="14" rx="2"/><path d="M20 4v14"/></svg>;
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}

function Thumbnail({ a, C }: { a: Annonce; C: ThemeTokens }) {
  const videoSrc = a.format === "video" ? a.media_urls?.[0] : null;
  return (
    <div style={{ width: "132px", height: "96px", borderRadius: "14px", overflow: "hidden", flexShrink: 0, backgroundColor: C.bg3, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {a.image_url ? (
        <Image src={a.image_url} fill sizes="132px" style={{ objectFit: "cover" }} alt=""/>
      ) : videoSrc ? (
        <video src={videoSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline/>
      ) : (
        <IconFormat format={a.format} color={C.t3}/>
      )}
      {a.epingle && (
        <div style={{ position: "absolute", top: "6px", left: "6px", backgroundColor: C.gold, borderRadius: "6px", padding: "2px 6px", fontSize: "9px", fontWeight: "800", color: "#000" }}>ÉPINGLÉE</div>
      )}
      {a.format === "carrousel" && (a.media_urls?.length ?? 0) > 1 && (
        <div style={{ position: "absolute", top: "6px", right: "6px", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: "6px", padding: "2px 6px", fontSize: "9px", fontWeight: "800", color: "#fff" }}>×{a.media_urls!.length}</div>
      )}
    </div>
  );
}

function AnnonceImageCarousel({ images, height, dotActiveColor, dotInactiveColor = "rgba(255,255,255,0.45)" }:
  { images: string[]; height: number; dotActiveColor: string; dotInactiveColor?: string }) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  if (images.length === 0) return null;
  return (
    <div style={{ width: "100%", height: `${height}px`, position: "relative", overflow: "hidden" }}>
      <div
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current; if (!el) return;
          const idx = Math.round(el.scrollLeft / el.clientWidth);
          setActive(Math.max(0, Math.min(images.length - 1, idx)));
        }}
        style={{ display: "flex", width: "100%", height: "100%", overflowX: "auto", scrollSnapType: "x mandatory" }}
      >
        {images.map((url, i) => (
          <div key={i} style={{ position: "relative", width: "100%", height: "100%", flexShrink: 0, scrollSnapAlign: "start" }}>
            <Image src={url} alt="" fill sizes="100vw" style={{ objectFit: "cover" }}/>
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div style={{ position: "absolute", bottom: "8px", left: 0, right: 0, display: "flex", justifyContent: "center", gap: "5px" }}>
          {images.map((_, i) => (
            <span key={i} style={{
              width: i === active ? "7px" : "5.5px", height: i === active ? "7px" : "5.5px",
              borderRadius: "50%", backgroundColor: i === active ? dotActiveColor : dotInactiveColor,
              boxShadow: "0 1px 2px rgba(0,0,0,0.35)", transition: "width 0.15s, height 0.15s",
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

// Tuile KPI avec comparaison réelle (17/09/2026) — jamais un % fabriqué :
// deltaPct === null affiche "Pas encore assez de données" plutôt qu'un 0%
// qui laisserait croire à une stagnation mesurée.
function StatsKpiTile({ C, label, value, deltaPct, sub }: { C: ThemeTokens; label: string; value: string; deltaPct?: number | null; sub?: string }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
      <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 8px" }}>{label}</p>
      <p style={{ color: C.t1, fontSize: "24px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1 }}>{value}</p>
      {deltaPct !== undefined && (
        deltaPct === null ? (
          <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", margin: 0 }}>Pas encore assez de données</p>
        ) : (
          <p style={{ color: deltaPct >= 0 ? C.green : C.red, fontSize: "10.5px", fontWeight: "700", margin: 0 }}>{deltaPct >= 0 ? "+" : ""}{deltaPct.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % vs période précédente</p>
        )
      )}
      {sub && <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", margin: 0 }}>{sub}</p>}
    </div>
  );
}

// Graphique de tendance — même recette que GrowthChart de CommunauteProTab.tsx
// (polyline SVG manuelle), dupliqué ici volontairement : Communication et
// Yelen Community sont 2 fonctionnalités distinctes, pas de composant
// partagé entre elles par convention du projet.
function StatsTrendChart({ C, dates, values, color }: { C: ThemeTokens; dates: string[]; values: number[]; color: string }) {
  if (dates.length < 2) {
    return (
      <div style={{ textAlign: "center", padding: "30px 16px" }}>
        <p style={{ color: C.t1, fontSize: "13px", fontWeight: "800", margin: "0 0 4px" }}>Pas encore assez de données pour afficher une tendance</p>
        <p style={{ color: C.t2, fontSize: "12px", margin: 0 }}>Les performances apparaîtront ici dès que vos annonces auront généré suffisamment de consultations.</p>
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const w = 100, h = 40;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "150px", display: "block" }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", color: C.t3, fontSize: "10.5px", marginTop: "6px" }}>
        <span>{fmt(dates[0])}</span>
        <span>{fmt(dates[Math.floor(dates.length / 2)])}</span>
        <span>{fmt(dates[dates.length - 1])}</span>
      </div>
    </div>
  );
}

function AnnoncesSection({ instId, canPublish }: { instId: string; canPublish: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [institution, setInstitution] = useState<{ name: string; category: string; logo: string | null } | null>(null);
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [innerTab, setInnerTab] = useState<"liste" | "creer" | "stats">("liste");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [statutFiltre, setStatutFiltre] = useState("tous");
  const [formatFiltre, setFormatFiltre] = useState("tous");
  const [searchQ, setSearchQ] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statsPeriode, setStatsPeriode] = useState<StatsPeriode>("30j");
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsErreur, setStatsErreur] = useState(false);
  const [statsRecharge, setStatsRecharge] = useState(0);
  const [statsMetrique, setStatsMetrique] = useState<"vues" | "citoyens_touches" | "interactions">("vues");
  const [statsDrawerId, setStatsDrawerId] = useState<string | null>(null);
  const [editAnnonce, setEditAnnonce] = useState<Annonce | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  // Chaque item = soit un fichier déjà en ligne (édition, pas de `file`), soit
  // un nouveau fichier local pas encore uploadé (`file` présent, `url` = blob
  // local pour la preview). Au submit, seuls les items avec `file` sont
  // uploadés — les autres gardent leur URL existante telle quelle.
  const [carrouselItems, setCarrouselItems] = useState<{ url: string; file?: File; nom?: string }[]>([]);
  const [pdfItem, setPdfItem] = useState<{ url: string; file?: File; nom: string } | null>(null);
  const [videoItem, setVideoItem] = useState<{ url: string; file?: File; nom: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"dupliquer" | "brouillon" | null>(null);
  const [previewAnnonce, setPreviewAnnonce] = useState<Annonce | null>(null);
  const [statsAnnonce, setStatsAnnonce] = useState<Annonce | null>(null);
  const [page, setPage] = useState(1);
  // Capturé une fois au montage (pattern déjà utilisé par SignalementsTab.tsx)
  // plutôt qu'un Date.now() direct dans le corps du composant — la règle
  // react-hooks/purity du React Compiler interdit les appels impurs
  // pendant le rendu, sauf via une valeur initiale de useState.
  const [maintenantMs] = useState(() => Date.now());
  // Notification d'expiration (17/09/2026, brief CEO §17) — état purement
  // cosmétique (masquer une notif déjà vue), pas de statut serveur dédié :
  // même prudence localStorage try/catch que partout ailleurs dans le
  // projet (peut lever en navigation privée mobile).
  const [expirationsMasquees, setExpirationsMasquees] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`yelen224_annonces_expiration_vue_${instId}`);
      setExpirationsMasquees(raw ? JSON.parse(raw) : []);
    } catch { setExpirationsMasquees([]); }
  }, [instId]);
  const masquerExpiration = (id: string) => {
    setExpirationsMasquees(prev => {
      const next = [...prev, id];
      try { window.localStorage.setItem(`yelen224_annonces_expiration_vue_${instId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [form, setForm] = useState({
    titre: "", contenu: "", type: "information", format: "image", date_expiration: "", date_publication: "",
    statut: "publiee", epingle: false, regions_cibles: [] as string[],
  });

  const showNotif = (type: "success" | "error", msg: string) => { setNotif({ type, msg }); setTimeout(() => setNotif(null), 4000); };

  const fetchData = useCallback(async () => {
    const [instRes, annRes] = await Promise.all([
      supabase.from("institutions").select("name, category, logo").eq("id", instId).single(),
      fetch("/api/institution/annonces").then(r => r.json()).catch(() => ({ annonces: [] })),
    ]);
    setInstitution(instRes.data || null);
    setAnnonces(annRes.annonces || []);
    setLoading(false);
  }, [instId]);

  useEffect(() => { queueMicrotask(() => fetchData()); }, [fetchData]);
  useEffect(() => { setPage(1); }, [statutFiltre, formatFiltre, searchQ]);

  // Chargement paresseux (uniquement quand l'onglet Statistiques est actif)
  // — `async`/`try`/`catch` obligatoire, pas une chaîne `.then()` directe
  // dans l'effet (règle react-hooks/set-state-in-effect, voir
  // CommunauteProTab.tsx::chargerAudience pour le même correctif).
  const chargerStats = useCallback(async (annuleRef: { current: boolean }) => {
    setStatsLoading(true);
    setStatsErreur(false);
    try {
      const res = await fetch(`/api/institution/annonces/stats?periode=${statsPeriode}`);
      if (!res.ok) throw new Error("http_error");
      const j = await res.json();
      if (annuleRef.current) return;
      if (!j?.kpi) throw new Error("shape_error");
      setStatsData(j);
    } catch {
      if (!annuleRef.current) { setStatsData(null); setStatsErreur(true); }
    } finally {
      if (!annuleRef.current) setStatsLoading(false);
    }
  }, [statsPeriode]);

  useEffect(() => {
    if (innerTab !== "stats") return;
    const annuleRef = { current: false };
    chargerStats(annuleRef);
    return () => { annuleRef.current = true; };
  }, [innerTab, chargerStats, statsRecharge]);

  const handleCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleCarrousel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_CARROUSEL_IMAGES - carrouselItems.length);
    if (files.length === 0) return;
    const tropVolumineux = files.find(f => f.size > MAX_MEDIA_SIZE);
    if (tropVolumineux) { showNotif("error", `"${tropVolumineux.name}" dépasse 10 Mo.`); return; }
    setCarrouselItems(prev => [...prev, ...files.map(f => ({ url: URL.createObjectURL(f), file: f, nom: f.name }))]);
  };
  const removeCarrouselImage = (i: number) => {
    setCarrouselItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const handlePdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MEDIA_SIZE) { showNotif("error", "Le PDF dépasse 10 Mo."); return; }
    setPdfItem({ url: URL.createObjectURL(file), file, nom: file.name });
  };

  const handleVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE) { showNotif("error", "La vidéo dépasse 50 Mo."); return; }
    setVideoItem({ url: URL.createObjectURL(file), file, nom: file.name });
  };

  const loadTemplate = (t: { titre: string; contenu: string }) => {
    setForm(prev => ({ ...prev, titre: t.titre, contenu: t.contenu }));
    setShowTemplates(false);
  };

  // Création rapide (17/09/2026, brief CEO §19) — réutilise TYPES/TEMPLATES
  // déjà existants, aucune nouvelle donnée : présélectionne juste le type
  // (+ le premier modèle correspondant quand il y en a un pertinent) pour
  // sauter l'étape de choix du type.
  const ouvrirCreationRapide = (typeId: string, template?: { titre: string; contenu: string }) => {
    resetForm();
    setForm(prev => ({ ...prev, type: typeId, titre: template?.titre ?? "", contenu: template?.contenu ?? "" }));
    setInnerTab("creer");
    setCreateMenuOpen(false);
  };

  const loadEditForm = (a: Annonce) => {
    setForm({
      titre: a.titre, contenu: a.contenu, type: a.type, format: a.format,
      date_expiration: a.date_expiration ? a.date_expiration.slice(0, 10) : "",
      date_publication: a.date_publication ? a.date_publication.slice(0, 16) : "",
      statut: a.statut, epingle: a.epingle, regions_cibles: a.regions_cibles || [],
    });
    setCoverFile(null); setCoverPreview(a.format === "image" ? a.image_url : null);
    setCarrouselItems(a.format === "carrousel" ? (a.media_urls || []).map(url => ({ url, nom: url.split("/").pop() })) : []);
    setPdfItem(a.format === "pdf" && a.media_urls?.[0] ? { url: a.media_urls[0], nom: a.media_urls[0].split("/").pop() || "document.pdf" } : null);
    setVideoItem(a.format === "video" && a.media_urls?.[0] ? { url: a.media_urls[0], nom: a.media_urls[0].split("/").pop() || "video.mp4" } : null);
    setEditAnnonce(a);
    setInnerTab("creer");
  };

  const handleDuplicate = async (a: Annonce) => {
    await fetch("/api/institution/annonces", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titre: `[Copie] ${a.titre}`, contenu: a.contenu, type: a.type, statut: "brouillon",
        format: a.format, media_urls: a.media_urls, date_expiration: null, date_publication: null,
        image_url: a.image_url, epingle: false, regions_cibles: a.regions_cibles,
      }),
    });
    showNotif("success", "Annonce dupliquée en brouillon.");
    fetchData();
  };

  const handleArchive = async (a: Annonce) => {
    await fetch("/api/institution/annonces", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, statut: "archivee" }),
    });
    showNotif("success", "Annonce archivée.");
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/institution/annonces?id=${id}`, { method: "DELETE" });
    showNotif("success", "Annonce supprimée.");
    setDeleteId(null);
    fetchData();
  };

  const resetForm = () => {
    setForm({ titre: "", contenu: "", type: "information", format: "image", date_expiration: "", date_publication: "", statut: "publiee", epingle: false, regions_cibles: [] });
    setCoverFile(null);
    setCoverPreview(null);
    setCarrouselItems([]);
    setPdfItem(null);
    setVideoItem(null);
    setEditAnnonce(null);
    setShowTemplates(false);
  };

  // Upload via service_role (voir api/institution/annonces/media) — un upload
  // direct depuis le client échouait silencieusement : storage.objects n'a
  // aucune policy RLS pour les institutions (JWT custom, pas de session
  // Supabase Auth), donc `error` était systématiquement renvoyé et l'annonce
  // enregistrée sans image_url/media_urls. C'est pour ça que rien ne
  // s'affichait, ni côté institution ni sur la fiche publique.
  const uploadUn = async (file: File, prefix: string): Promise<string | null> => {
    const fd = new FormData();
    fd.append("prefix", prefix);
    fd.append("file", file);
    const res = await fetch("/api/institution/annonces/media", { method: "POST", body: fd });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.url ?? null;
  };

  const handleSubmit = async () => {
    if (!form.titre.trim() || !form.contenu.trim()) { showNotif("error", "Le titre et le contenu sont obligatoires."); return; }
    if (form.format === "carrousel" && carrouselItems.length === 0) { showNotif("error", "Ajoutez au moins une image au carrousel."); return; }
    if (form.format === "pdf" && !pdfItem) { showNotif("error", "Ajoutez un fichier PDF."); return; }
    if (form.format === "video" && !videoItem) { showNotif("error", "Ajoutez une vidéo."); return; }

    setSaving(true);
    try {
      let imageUrl: string | null = null;
      let mediaUrls: string[] | null = null;

      if (form.format === "image") {
        imageUrl = editAnnonce?.image_url || null;
        if (coverFile) {
          const uploaded = await uploadUn(coverFile, "cover");
          if (uploaded) imageUrl = uploaded;
        }
      } else if (form.format === "carrousel") {
        const urls: string[] = [];
        for (const item of carrouselItems) urls.push(item.file ? (await uploadUn(item.file, "carrousel")) ?? item.url : item.url);
        mediaUrls = urls;
        imageUrl = urls[0] ?? null;
      } else if (form.format === "pdf" && pdfItem) {
        const url = pdfItem.file ? (await uploadUn(pdfItem.file, "pdf")) ?? pdfItem.url : pdfItem.url;
        mediaUrls = [url];
      } else if (form.format === "video" && videoItem) {
        const url = videoItem.file ? (await uploadUn(videoItem.file, "video")) ?? videoItem.url : videoItem.url;
        mediaUrls = [url];
      }

      let finalStatut = form.statut;
      if (form.date_publication && new Date(form.date_publication) > new Date()) finalStatut = "planifiee";

      const payload = {
        titre: form.titre.trim(), contenu: form.contenu.trim(), type: form.type, format: form.format,
        statut: finalStatut, date_expiration: form.date_expiration || null, date_publication: form.date_publication || null,
        image_url: imageUrl, media_urls: mediaUrls, epingle: form.epingle, regions_cibles: form.regions_cibles.length > 0 ? form.regions_cibles : null,
      };

      const res = await fetch("/api/institution/annonces", {
        method: editAnnonce ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editAnnonce ? { id: editAnnonce.id, ...payload } : payload),
      });

      if (!res.ok) {
        showNotif("error", "Erreur lors de la sauvegarde.");
      } else {
        showNotif("success", editAnnonce ? "Annonce mise à jour." : finalStatut === "planifiee" ? "Annonce planifiée avec succès." : "Annonce publiée avec succès.");
        resetForm();
        setInnerTab("liste");
        fetchData();
      }
    } catch {
      showNotif("error", "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = annonces.filter(a => {
    if (statutFiltre !== "tous" && realStatut(a) !== statutFiltre) return false;
    if (formatFiltre !== "tous" && a.format !== formatFiltre) return false;
    if (searchQ && !a.titre.toLowerCase().includes(searchQ.toLowerCase()) && !a.contenu.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const kpi = {
    // Corrigé (17/09/2026) : comptait auparavant a.statut === "publiee" brut,
    // donc une annonce déjà expirée (date_expiration dépassée) restait
    // comptée comme active — realStatut() est la même fonction qui pilote
    // déjà les compteurs de filtres ci-dessous, désormais cohérente ici aussi.
    actives: annonces.filter(a => realStatut(a) === "publiee").length,
    portee: annonces.reduce((acc, a) => acc + (a.portee || 0), 0),
    vues: annonces.reduce((acc, a) => acc + (a.nb_vues || 0), 0),
    likes: annonces.reduce((acc, a) => acc + (a.nb_likes || 0), 0),
    commentaires: annonces.reduce((acc, a) => acc + (a.nb_commentaires || 0), 0),
    partages: annonces.reduce((acc, a) => acc + (a.nb_partages || 0), 0),
    clics: annonces.reduce((acc, a) => acc + (a.nb_clics || 0), 0),
  };
  const interactions = kpi.likes + kpi.commentaires + kpi.partages + kpi.clics;

  // Annonces venant d'expirer (17/09/2026, §17) — "venant" = dans les 14
  // derniers jours, pour éviter de rappeler indéfiniment une expiration
  // ancienne. Exclut les annonces déjà archivées manuellement (l'action
  // est alors déjà connue et traitée) et celles masquées par l'institution.
  const QUATORZE_JOURS_MS = 14 * 24 * 3600 * 1000;
  const annoncesRecemmentExpirees = annonces.filter(a => {
    if (a.statut === "archivee" || !a.date_expiration || expirationsMasquees.includes(a.id)) return false;
    const finMs = new Date(a.date_expiration).getTime();
    return finMs < maintenantMs && maintenantMs - finMs <= QUATORZE_JOURS_MS;
  });

  const getType = (id: string) => TYPES(C).find(t => t.id === id) || TYPES(C)[0];

  const pickerList = pickerMode === "brouillon" ? annonces.filter(a => a.statut === "brouillon") : annonces;

  if (loading) return (
    <div style={{ padding: "40px 16px", display: "flex", justifyContent: "center" }}>
      <YelenLoader size={32}/>
    </div>
  );

  return (
    <div>
      {notif && (
        <div style={{ position: "fixed", top: "70px", right: "16px", zIndex: 1000, backgroundColor: C.bgCard2, border: `1px solid ${notif.type === "success" ? C.green : C.red}40`, borderLeft: `4px solid ${notif.type === "success" ? C.green : C.red}`, borderRadius: "12px", padding: "14px 20px", animation: "slideDown 0.3s ease", maxWidth: "320px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          <p style={{ color: notif.type === "success" ? C.green : C.red, fontSize: "13px", margin: 0, fontWeight: "700" }}>{notif.msg}</p>
        </div>
      )}

      {deleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "16px", padding: "32px", maxWidth: "380px", width: "100%", textAlign: "center" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", backgroundColor: C.redL, border: `1px solid ${C.red}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
            </div>
            <h3 style={{ color: C.t1, fontSize: "16px", fontWeight: "800", margin: "0 0 8px" }}>Supprimer cette annonce ?</h3>
            <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 24px" }}>Cette action est irréversible.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => setDeleteId(null)}>Annuler</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" style={{ flex: 1 }} onClick={() => handleDelete(deleteId)}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}

      {pickerMode && (
        <div onClick={() => setPickerMode(null)} style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "22px", maxWidth: "440px", width: "100%", maxHeight: "76svh", overflowY: "auto" }}>
            <h3 style={{ color: C.t1, fontSize: "15px", fontWeight: "800", margin: "0 0 4px" }}>{pickerMode === "brouillon" ? "Reprendre un brouillon" : "Dupliquer une annonce"}</h3>
            <p style={{ color: C.t2, fontSize: "12px", margin: "0 0 16px" }}>{pickerMode === "brouillon" ? "Sélectionnez le brouillon à continuer." : "Sélectionnez l'annonce à dupliquer en brouillon."}</p>
            {pickerList.length === 0 ? (
              <p style={{ color: C.t3, fontSize: "13px", textAlign: "center", padding: "20px 0" }}>{pickerMode === "brouillon" ? "Aucun brouillon en attente." : "Aucune annonce à dupliquer."}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {pickerList.map(a => (
                  <button key={a.id} onClick={() => { if (pickerMode === "brouillon") loadEditForm(a); else handleDuplicate(a); setPickerMode(null); }} className="tap" style={{ textAlign: "left", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 12px", cursor: "pointer" }}>
                    <p style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", margin: "0 0 2px" }}>{a.titre}</p>
                    <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>{fmt(a.created_at)} · {STATUT_CFG(C)[realStatut(a)]?.label}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {previewAnnonce && (
        <div onClick={() => setPreviewAnnonce(null)} style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "420px", width: "100%" }}>
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${getType(previewAnnonce.type).color}40`, borderLeft: `4px solid ${getType(previewAnnonce.type).color}`, borderRadius: "14px", overflow: "hidden" }}>
              {(() => {
                const images = previewAnnonce.format === "carrousel" && previewAnnonce.media_urls?.length ? previewAnnonce.media_urls : previewAnnonce.image_url ? [previewAnnonce.image_url] : [];
                return images.length > 0 ? (
                  <AnnonceImageCarousel images={images} height={180} dotActiveColor={C.gold}/>
                ) : previewAnnonce.format === "video" && previewAnnonce.media_urls?.[0] ? (
                  <div style={{ width: "100%", height: "180px", overflow: "hidden", backgroundColor: "#000" }}><video src={previewAnnonce.media_urls[0]} style={{ width: "100%", height: "100%", objectFit: "cover" }} controls playsInline/></div>
                ) : null;
              })()}
              <div style={{ padding: "18px" }}>
                {previewAnnonce.epingle && <div style={{ marginBottom: "8px" }}><span style={{ color: C.gold, fontSize: "10.5px", fontWeight: "700" }}>ANNONCE ÉPINGLÉE</span></div>}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ width: "34px", height: "34px", position: "relative", borderRadius: "9px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                    {institution?.logo ? <Image src={institution.logo} fill sizes="34px" style={{ objectFit: "cover" }} alt=""/> : <span style={{ color: C.t2, fontSize: "13px", fontWeight: "800" }}>{institution?.name?.[0]?.toUpperCase() || "Y"}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", margin: 0 }}>{institution?.name || "Votre institution"}</p>
                    <p style={{ color: C.t3, fontSize: "10.5px", margin: "1px 0 0" }}>{fmt(previewAnnonce.created_at)}</p>
                  </div>
                  <span style={{ backgroundColor: typeBadgeStyle(previewAnnonce.type, C).bg, color: typeBadgeStyle(previewAnnonce.type, C).color, fontSize: "9.5px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{getType(previewAnnonce.type).label.toUpperCase()}</span>
                </div>
                <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 8px", lineHeight: 1.35 }}>{previewAnnonce.titre}</h3>
                <p style={{ color: C.t2, fontSize: "12.5px", margin: 0, lineHeight: 1.65 }}>{previewAnnonce.contenu}</p>
                {previewAnnonce.format === "pdf" && previewAnnonce.media_urls?.[0] && (
                  <a href={previewAnnonce.media_urls[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.red, fontSize: "12px", fontWeight: "700", textDecoration: "none", marginTop: "10px" }}>
                    <IconFormat format="pdf" color={C.red}/> Ouvrir le PDF
                  </a>
                )}
              </div>
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth style={{ marginTop: "10px" }} onClick={() => setPreviewAnnonce(null)}>Fermer l&apos;aperçu</Button>
          </div>
        </div>
      )}

      {statsAnnonce && (
        <div onClick={() => setStatsAnnonce(null)} style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "22px", maxWidth: "400px", width: "100%" }}>
            <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 3px" }}>Statistiques</h3>
            <p style={{ color: C.t2, fontSize: "12px", margin: "0 0 16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statsAnnonce.titre}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {[
                { label: "Portée", value: statsAnnonce.portee, color: C.blue },
                { label: "Vues", value: statsAnnonce.nb_vues, color: C.teal },
                { label: "Clics", value: statsAnnonce.nb_clics, color: C.orange },
                { label: "Likes", value: statsAnnonce.nb_likes, color: C.red },
                { label: "Commentaires", value: statsAnnonce.nb_commentaires, color: C.purple },
                { label: "Partages", value: statsAnnonce.nb_partages, color: C.green },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 10px", textAlign: "center" }}>
                  <p style={{ color: s.color, fontSize: "18px", fontWeight: "800", margin: "0 0 4px" }}>{s.value}</p>
                  <p style={{ color: C.t3, fontSize: "9px", fontWeight: "700", textTransform: "uppercase", margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: `${C.blue}0A`, border: `1px solid ${C.blue}25`, borderRadius: "10px", padding: "11px 13px", marginTop: "14px" }}>
              <p style={{ color: C.t2, fontSize: "11px", margin: 0, lineHeight: 1.6 }}>
                Pour protéger la vie privée de vos clients — conformément aux exigences de l&apos;État guinéen et aux réglementations internationales (RGPD et équivalents) — nous ne vous communiquons pas l&apos;identité des personnes ayant vu, aimé ou commenté cette annonce, uniquement les totaux ci-dessus. Nous travaillons activement sur une solution respectueuse de la vie privée pour vous offrir plus de détail, à la hauteur de votre établissement.
              </p>
            </div>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth style={{ marginTop: "10px" }} onClick={() => setStatsAnnonce(null)}>Fermer</Button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "0" }}>
          {[
            { id: "liste", label: `Annonces (${annonces.length})` },
            { id: "stats", label: "Statistiques" },
            ...(canPublish ? [{ id: "creer", label: editAnnonce ? "Modifier" : "Créer" }] : []),
          ].map(t => (
            <button key={t.id} onClick={() => { if (t.id !== "creer") resetForm(); setInnerTab(t.id as "liste" | "creer" | "stats"); }} className="tap" style={{ backgroundColor: innerTab === t.id ? C.gold : "transparent", border: "none", borderRadius: innerTab === t.id ? "10px" : 0, color: innerTab === t.id ? "#080812" : C.t3, fontSize: "12.5px", fontWeight: innerTab === t.id ? "700" : "500", padding: "10px 16px", cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
        {innerTab !== "creer" && canPublish && (
          <div style={{ position: "relative", display: "flex" }}>
            <button onClick={() => { resetForm(); setInnerTab("creer"); }} className="tap" style={{ height: "32px", backgroundColor: C.gold, color: "#000", border: "none", borderTopLeftRadius: "10px", borderBottomLeftRadius: "10px", padding: "0 16px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
              + Créer une annonce
            </button>
            <button onClick={() => setCreateMenuOpen(o => !o)} className="tap" style={{ height: "32px", backgroundColor: C.gold, color: "#000", border: "none", borderLeft: "1px solid rgba(0,0,0,0.15)", borderTopRightRadius: "10px", borderBottomRightRadius: "10px", padding: "0 10px", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {createMenuOpen && (
              <>
                <div onClick={() => setCreateMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", minWidth: "200px", overflow: "hidden" }}>
                  <button onClick={() => { resetForm(); setInnerTab("creer"); setCreateMenuOpen(false); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Nouvelle annonce</button>
                  <div style={{ height: "1px", backgroundColor: C.border }}/>
                  <button onClick={() => ouvrirCreationRapide("information", TEMPLATES.information[0])} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Fermeture / horaire exceptionnel</button>
                  <button onClick={() => ouvrirCreationRapide("offre", TEMPLATES.offre[0])} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Nouvelle promotion</button>
                  <div style={{ height: "1px", backgroundColor: C.border }}/>
                  <button onClick={() => { setPickerMode("dupliquer"); setCreateMenuOpen(false); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Dupliquer une annonce</button>
                  <div style={{ height: "1px", backgroundColor: C.border }}/>
                  <button onClick={() => { setPickerMode("brouillon"); setCreateMenuOpen(false); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Reprendre un brouillon</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {innerTab === "liste" && (
        <div>
          {annoncesRecemmentExpirees.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {annoncesRecemmentExpirees.map(a => (
                <div key={a.id} style={{ backgroundColor: `${C.gold}0f`, border: `1px solid ${C.gold}30`, borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <p style={{ color: C.t1, fontSize: "12.5px", fontWeight: 600, margin: 0, flex: 1, minWidth: "200px" }}>
                    Votre annonce « {a.titre} » est arrivée à expiration.
                  </p>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                    <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setStatsAnnonce(a)}>Voir les statistiques</Button>
                    <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => handleDuplicate(a)}>Republier</Button>
                    <button onClick={() => masquerExpiration(a.id)} aria-label="Masquer" className="tap" style={{ width: "24px", height: "24px", borderRadius: "50%", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "22px" }}>
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px", boxShadow: C.shadow }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
              </div>
              <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Annonces actives</p>
              <p style={{ color: C.t1, fontSize: "26px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1 }}>{kpi.actives}</p>
              <p style={{ color: C.t3, fontSize: "11px", fontWeight: "700", margin: 0 }}>{kpi.actives > 0 ? "Visibles actuellement sur votre fiche" : "Aucune annonce publiée"}</p>
            </div>

            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px", boxShadow: C.shadow }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Citoyens atteints</p>
              <p style={{ color: C.t1, fontSize: "26px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1 }}>{fmtCompact(kpi.portee)}</p>
              <p style={{ color: C.t3, fontSize: "11px", fontWeight: "700", margin: 0 }}>Toutes annonces confondues</p>
            </div>

            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px", boxShadow: C.shadow }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                <IconVoir color={C.t2}/>
              </div>
              <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Vues</p>
              <p style={{ color: C.t1, fontSize: "26px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1 }}>{fmtCompact(kpi.vues)}</p>
              <p style={{ color: C.t3, fontSize: "11px", fontWeight: "700", margin: 0 }}>Consultations de vos annonces</p>
            </div>

            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px", boxShadow: C.shadow }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </div>
              <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "700", textTransform: "uppercase", margin: "0 0 6px" }}>Interactions</p>
              <p style={{ color: C.t1, fontSize: "26px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1 }}>{fmtCompact(interactions)}</p>
              <p style={{ color: C.t3, fontSize: "10px", margin: 0 }}>{kpi.likes} likes · {kpi.commentaires} comm. · {kpi.partages} partages · {kpi.clics} clics</p>
            </div>
          </div>

          <div style={{ position: "relative", marginBottom: "14px" }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Rechercher une annonce…" style={{ ...inputStyle(C), paddingLeft: "36px" }}/>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>

          <div style={{ display: "flex", gap: "7px", marginBottom: "8px", overflowX: "auto" }}>
            {STATUT_FILTRES.map(s => {
              const active = statutFiltre === s.key;
              const count = s.key === "tous" ? annonces.length : annonces.filter(a => realStatut(a) === s.key).length;
              return (
                <button key={s.key} onClick={() => setStatutFiltre(s.key)} className="tap" style={{ flexShrink: 0, backgroundColor: active ? C.gold : C.bgCard, border: `1px solid ${active ? C.gold : C.border}`, borderRadius: "20px", padding: "7px 13px", color: active ? "#080812" : C.t2, fontSize: "11.5px", fontWeight: active ? 800 : 600, cursor: "pointer" }}>
                  {s.label} <span style={{ marginLeft: "4px", fontSize: "9.5px", opacity: 0.8 }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "7px", marginBottom: "18px", overflowX: "auto" }}>
            {FORMAT_FILTRES.map(f => {
              const active = formatFiltre === f.key;
              return (
                <button key={f.key} onClick={() => setFormatFiltre(f.key)} className="tap" style={{ flexShrink: 0, backgroundColor: active ? C.gold : C.bgCard, border: `1px solid ${active ? C.gold : C.border}`, borderRadius: "20px", padding: "6px 12px", color: active ? "#080812" : C.t3, fontSize: "11px", fontWeight: active ? 800 : 600, cursor: "pointer" }}>
                  {f.label}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "48px 20px", textAlign: "center" }}>
              <p style={{ color: C.t1, fontSize: "15px", fontWeight: "700", margin: "0 0 8px" }}>Aucune annonce trouvée</p>
              <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 20px" }}>Commencez à communiquer avec vos clients.</p>
              {canPublish && <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ padding: "0 22px" }} onClick={() => { resetForm(); setInnerTab("creer"); }}>Créer une annonce</Button>}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {paged.map(annonce => {
                  const t = getType(annonce.type);
                  const statCfg = STATUT_CFG(C)[realStatut(annonce)] || STATUT_CFG(C).publiee;
                  const menuOpen = menuOpenId === annonce.id;
                  return (
                    <div key={annonce.id} style={{ backgroundColor: C.bgCard, border: `1px solid ${annonce.epingle ? C.gold + "40" : C.border}`, borderLeft: `4px solid ${annonce.epingle ? C.gold : t.color}`, borderRadius: "18px", padding: "18px 20px", display: "flex", gap: "18px", flexWrap: "wrap", opacity: realStatut(annonce) === "terminee" || realStatut(annonce) === "archivee" ? 0.7 : 1, animation: "fadeUp 0.2s ease", boxShadow: C.shadow }}>
                      <Thumbnail a={annonce} C={C}/>

                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                          <span style={{ backgroundColor: typeBadgeStyle(annonce.type, C).bg, border: `1px solid ${typeBadgeStyle(annonce.type, C).border}`, color: typeBadgeStyle(annonce.type, C).color, fontSize: "9.5px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px" }}>{t.label.toUpperCase()}</span>
                          <span style={{ backgroundColor: statCfg.bg, color: statCfg.color, fontSize: "9.5px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>{statCfg.label}</span>
                          {annonce.regions_cibles && annonce.regions_cibles.length > 0 && <span style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, color: C.t3, fontSize: "9.5px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px" }}>{annonce.regions_cibles.length} région{annonce.regions_cibles.length > 1 ? "s" : ""}</span>}
                        </div>
                        <h3 style={{ color: C.t1, fontSize: "15px", fontWeight: "800", margin: "0 0 6px", lineHeight: 1.4 }}>{annonce.titre}</h3>
                        <p style={{ color: C.t2, fontSize: "12.5px", margin: "0 0 8px", lineHeight: 1.65, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{annonce.contenu}</p>
                        <p style={{ color: C.t3, fontSize: "10.5px", margin: "0 0 12px" }}>
                          {FORMAT_LABELS[annonce.format] || annonce.format}
                          {annonce.date_publication ? ` · Publié le ${fmt(annonce.date_publication)}` : ` · Créé le ${fmt(annonce.created_at)}`}
                          {annonce.date_publication && ` · ${new Date(annonce.date_publication).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                          {annonce.date_expiration && ` · Expire le ${fmt(annonce.date_expiration)}`}
                        </p>
                        {annonce.format === "pdf" && annonce.media_urls?.[0] && (
                          <a href={annonce.media_urls[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.red, fontSize: "11.5px", fontWeight: "700", textDecoration: "none", marginBottom: "12px" }}>
                            <IconFormat format="pdf" color={C.red}/> Ouvrir le PDF
                          </a>
                        )}
                        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                          <div><span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>{fmtCompact(annonce.portee)}</span><span style={{ color: C.t3, fontSize: "10px", marginLeft: "4px" }}>Portée</span></div>
                          <div><span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>{fmtCompact(annonce.nb_vues)}</span><span style={{ color: C.t3, fontSize: "10px", marginLeft: "4px" }}>Vues</span></div>
                          <div><span style={{ color: C.t1, fontSize: "13px", fontWeight: "800" }}>{fmtCompact(annonce.nb_likes + annonce.nb_commentaires + annonce.nb_partages)}</span><span style={{ color: C.t3, fontSize: "10px", marginLeft: "4px" }}>Interactions</span></div>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: "relative" }}>
                        <button onClick={() => setPreviewAnnonce(annonce)} className="tap" title="Voir" style={{ width: "34px", height: "34px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconVoir color={C.t2}/></button>
                        <button onClick={() => setStatsAnnonce(annonce)} className="tap" title="Statistiques" style={{ width: "34px", height: "34px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconStats color={C.t2}/></button>
                        {canPublish && <button onClick={() => setMenuOpenId(menuOpen ? null : annonce.id)} className="tap" title="Menu" style={{ width: "34px", height: "34px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><IconMenu color={C.t2}/></button>}
                        {canPublish && menuOpen && (
                          <>
                            <div onClick={() => setMenuOpenId(null)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
                            <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", minWidth: "170px", overflow: "hidden" }}>
                              <button onClick={() => { loadEditForm(annonce); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Modifier</button>
                              <div style={{ height: "1px", backgroundColor: C.border }}/>
                              <button onClick={() => { handleDuplicate(annonce); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Dupliquer</button>
                              <div style={{ height: "1px", backgroundColor: C.border }}/>
                              <button onClick={() => { loadEditForm(annonce); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Programmer</button>
                              <div style={{ height: "1px", backgroundColor: C.border }}/>
                              <button onClick={() => { handleArchive(annonce); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Archiver</button>
                              <div style={{ height: "1px", backgroundColor: C.border }}/>
                              <button onClick={() => { setDeleteId(annonce.id); setMenuOpenId(null); }} className="tap" style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", color: C.red, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Supprimer</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "18px" }}>
                  <span style={{ color: C.t3, fontSize: "11.5px" }}>Affichage {(pageSafe - 1) * PAGE_SIZE + 1} à {Math.min(pageSafe * PAGE_SIZE, filtered.length)} sur {filtered.length}</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSafe <= 1} className="tap" style={{ width: "30px", height: "30px", borderRadius: "8px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t2, cursor: pageSafe <= 1 ? "default" : "pointer", opacity: pageSafe <= 1 ? 0.4 : 1 }}>‹</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)} className="tap" style={{ minWidth: "30px", height: "30px", borderRadius: "8px", backgroundColor: p === pageSafe ? C.gold : C.bgCard, color: p === pageSafe ? "#000" : C.t2, border: `1px solid ${p === pageSafe ? C.gold : C.border}`, fontSize: "11.5px", fontWeight: p === pageSafe ? 800 : 600, cursor: "pointer" }}>{p}</button>
                    ))}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages} className="tap" style={{ width: "30px", height: "30px", borderRadius: "8px", border: `1px solid ${C.border}`, backgroundColor: C.bgCard, color: C.t2, cursor: pageSafe >= totalPages ? "default" : "pointer", opacity: pageSafe >= totalPages ? 0.4 : 1 }}>›</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {innerTab === "stats" && (
        <div style={{ animation: "fadeUp 0.2s ease" }}>
          {annonces.length === 0 ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "16px", padding: "48px 20px", textAlign: "center" }}>
              <p style={{ color: C.t1, fontSize: "15px", fontWeight: "700", margin: "0 0 8px" }}>Commencez à mesurer votre présence</p>
              <p style={{ color: C.t2, fontSize: "13px", margin: "0 0 20px" }}>Créez votre première annonce pour informer vos clients et commencer à mesurer sa portée.</p>
              {canPublish && <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ padding: "0 22px" }} onClick={() => { resetForm(); setInnerTab("creer"); }}>+ Créer une annonce</Button>}
            </div>
          ) : statsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "50px" }}><YelenLoader size={32}/></div>
          ) : statsErreur || !statsData ? (
            <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "36px 20px", textAlign: "center" }}>
              <p style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 6px" }}>Impossible de charger les statistiques.</p>
              <p style={{ color: C.t2, fontSize: "12.5px", margin: "0 0 18px" }}>Vérifiez votre connexion puis réessayez.</p>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" onClick={() => setStatsRecharge(k => k + 1)}>Réessayer</Button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
                <div>
                  <h3 style={{ color: C.t1, fontSize: "15px", fontWeight: "800", margin: "0 0 4px" }}>Statistiques</h3>
                  <p style={{ color: C.t2, fontSize: "12px", margin: 0, maxWidth: "440px", lineHeight: 1.5 }}>Mesurez la portée de vos annonces et comprenez comment les citoyens interagissent avec les informations publiées par votre établissement.</p>
                </div>
                <select value={statsPeriode} onChange={e => setStatsPeriode(e.target.value as StatsPeriode)} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 12px", color: C.t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                  <option value="7j">7 derniers jours</option>
                  <option value="30j">30 derniers jours</option>
                  <option value="90j">90 derniers jours</option>
                  <option value="annee">Cette année</option>
                </select>
              </div>

              {/* KPI */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "18px" }}>
                <StatsKpiTile C={C} label="Vues" value={statsData.kpi.vues.valeur.toLocaleString("fr-FR")} deltaPct={statsData.kpi.vues.delta_pct}/>
                <StatsKpiTile C={C} label="Citoyens touchés" value={statsData.kpi.citoyens_touches.valeur.toLocaleString("fr-FR")} deltaPct={statsData.kpi.citoyens_touches.delta_pct}/>
                <StatsKpiTile C={C} label="Interactions" value={statsData.kpi.interactions.valeur.toLocaleString("fr-FR")} deltaPct={statsData.kpi.interactions.delta_pct}/>
                <StatsKpiTile C={C} label="Annonces actives" value={String(statsData.kpi.annonces_actives.valeur)} sub="Visibles actuellement sur votre fiche"/>
                <StatsKpiTile C={C} label="Taux d'interaction"
                  value={statsData.kpi.taux_interaction.valeur !== null ? `${statsData.kpi.taux_interaction.valeur.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : "—"}
                  deltaPct={statsData.kpi.taux_interaction.valeur !== null ? statsData.kpi.taux_interaction.delta_pct : undefined}
                  sub={statsData.kpi.taux_interaction.valeur === null ? "Pas encore assez de données" : undefined}/>
              </div>

              {/* Évolution */}
              <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px", marginBottom: "18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
                  <div>
                    <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 2px" }}>Évolution de vos performances</h3>
                    <p style={{ color: C.t2, fontSize: "11.5px", margin: 0 }}>Suivez comment vos annonces sont vues et utilisées au fil du temps.</p>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {([{ k: "vues" as const, l: "Vues" }, { k: "citoyens_touches" as const, l: "Citoyens touchés" }, { k: "interactions" as const, l: "Interactions" }]).map(o => (
                      <button key={o.k} onClick={() => setStatsMetrique(o.k)} className="tap" style={{ backgroundColor: statsMetrique === o.k ? C.gold : C.bg3, color: statsMetrique === o.k ? "#080812" : C.t2, border: "none", borderRadius: "16px", padding: "5px 12px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>{o.l}</button>
                    ))}
                  </div>
                </div>
                <StatsTrendChart C={C} dates={statsData.serie.map(s => s.date)} values={statsData.serie.map(s => s[statsMetrique])} color={C.gold}/>
              </div>

              {/* Engagement */}
              <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px", marginBottom: "18px" }}>
                <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 4px" }}>Comment les citoyens réagissent</h3>
                <p style={{ color: C.t2, fontSize: "11.5px", margin: "0 0 16px" }}>Distingue ce qui est simplement vu de ce qui suscite une vraie réaction.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "14px" }}>
                  <div style={{ textAlign: "center" }}><p style={{ color: C.t1, fontSize: "20px", fontWeight: 800, margin: "0 0 4px" }}>{statsData.engagement.likes}</p><p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>J&apos;aime</p></div>
                  <div style={{ textAlign: "center" }}><p style={{ color: C.t1, fontSize: "20px", fontWeight: 800, margin: "0 0 4px" }}>{statsData.engagement.commentaires}</p><p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>Commentaires</p></div>
                  <div style={{ textAlign: "center" }}><p style={{ color: C.t1, fontSize: "20px", fontWeight: 800, margin: "0 0 4px" }}>{statsData.engagement.partages}</p><p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>Partages</p></div>
                </div>
              </div>

              {/* Insights — règles déterministes, zéro LLM, jamais sur un
                  échantillon trop faible (même discipline que
                  VueEnsembleView de CommunauteProTab.tsx). */}
              <div style={{ marginBottom: "18px" }}>
                <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 10px" }}>Ce que vos statistiques montrent</h3>
                {(() => {
                  const insights: string[] = [];
                  if (statsData.echantillon_suffisant && statsData.kpi.vues.valeur > 0) {
                    const top = [...statsData.annonces].filter(a => a.vues > 0).sort((a, b) => b.vues - a.vues)[0];
                    if (top) {
                      const part = Math.round((top.vues / statsData.kpi.vues.valeur) * 100);
                      if (part >= 30) insights.push(`« ${top.titre} » a généré ${part} % des vues de vos annonces sur cette période.`);
                    }
                  }
                  if (statsData.kpi.citoyens_touches.delta_pct !== null && statsData.kpi.citoyens_touches.delta_pct > 0) {
                    insights.push(`Votre audience progresse : vos annonces ont touché ${statsData.kpi.citoyens_touches.delta_pct.toFixed(0)} % de citoyens en plus que sur la période précédente.`);
                  }
                  if (insights.length === 0) {
                    return (
                      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", color: C.t2, fontSize: "12.5px", lineHeight: 1.6 }}>
                        Encore trop peu de données. Publiez quelques annonces pour que Yelen puisse identifier les tendances de votre audience.
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {insights.map((texte, i) => (
                        <div key={i} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                          <span style={{ color: C.t1, fontSize: "12.5px", lineHeight: 1.5 }}>{texte}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Top annonces — masqué tant que l'échantillon est trop
                  faible, jamais un classement sur 1-2 annonces. */}
              {statsData.echantillon_suffisant && statsData.annonces.filter(a => a.vues > 0).length >= 3 && (
                <div style={{ marginBottom: "18px" }}>
                  <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 10px" }}>Vos annonces les plus performantes</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
                    {([
                      { titre: "Plus vues", tri: (a: StatsAnnonceDetail, b: StatsAnnonceDetail) => b.vues - a.vues, valeur: (a: StatsAnnonceDetail) => `${a.vues} vues` },
                      { titre: "Plus d'interactions", tri: (a: StatsAnnonceDetail, b: StatsAnnonceDetail) => b.interactions - a.interactions, valeur: (a: StatsAnnonceDetail) => `${a.interactions} interactions` },
                      { titre: "Meilleur taux d'interaction", tri: (a: StatsAnnonceDetail, b: StatsAnnonceDetail) => (b.taux_interaction ?? 0) - (a.taux_interaction ?? 0), valeur: (a: StatsAnnonceDetail) => a.taux_interaction !== null ? `${a.taux_interaction.toFixed(1)} %` : "—" },
                    ]).map(col => (
                      <div key={col.titre} style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
                        <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", margin: "0 0 10px" }}>{col.titre}</p>
                        {[...statsData.annonces].filter(a => a.vues > 0).sort(col.tri).slice(0, 3).map((a, i) => (
                          <div key={a.id} onClick={() => setStatsDrawerId(a.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", cursor: "pointer" }}>
                            <span style={{ color: C.t3, fontSize: "10px", fontWeight: 800, width: "14px", flexShrink: 0 }}>{i + 1}</span>
                            <span style={{ flex: 1, minWidth: 0, color: C.t1, fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre}</span>
                            <span style={{ color: C.t2, fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>{col.valeur(a)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance de vos annonces */}
              <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: 0 }}>Performance de vos annonces</h3>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Annonce", "Type", "Vues", "Citoyens touchés", "Interactions", "Taux d'interaction", "Statut"].map(h => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left", color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {statsData.annonces.map((a, i) => {
                        const t = getType(a.type);
                        const statCfg = STATUT_CFG(C)[a.statut] ?? STATUT_CFG(C).publiee;
                        return (
                          <tr key={a.id} onClick={() => setStatsDrawerId(a.id)} className="tap" style={{ borderBottom: i < statsData.annonces.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                            <td style={{ padding: "11px 14px", color: C.t1, fontSize: "12.5px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre}</td>
                            <td style={{ padding: "11px 14px" }}><span style={{ backgroundColor: typeBadgeStyle(a.type, C).bg, color: typeBadgeStyle(a.type, C).color, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{t.label}</span></td>
                            <td style={{ padding: "11px 14px", color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{a.vues}</td>
                            <td style={{ padding: "11px 14px", color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{a.citoyens_touches}</td>
                            <td style={{ padding: "11px 14px", color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{a.interactions}</td>
                            <td style={{ padding: "11px 14px", color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{a.taux_interaction !== null ? `${a.taux_interaction.toFixed(1)} %` : "—"}</td>
                            <td style={{ padding: "11px 14px" }}><span style={{ backgroundColor: statCfg.bg, color: statCfg.color, fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{statCfg.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Drawer détail — desktop-first (panneau latéral), contenu déjà
              chargé (prop `annonces` + `statsData.annonces`), aucun nouvel
              appel réseau. "Historique de performance"/évolution propre à
              l'annonce volontairement absent de ce lot (aurait exigé un
              nouvel appel par annonce) — seules les métriques de la
              période sélectionnée globalement sont montrées ici. */}
          {statsDrawerId && statsData && (() => {
            const detail = statsData.annonces.find(a => a.id === statsDrawerId);
            const full = annonces.find(a => a.id === statsDrawerId);
            if (!detail || !full) return null;
            const statCfg = STATUT_CFG(C)[detail.statut] ?? STATUT_CFG(C).publiee;
            return (
              <div onClick={() => setStatsDrawerId(null)} style={{ position: "fixed", inset: 0, zIndex: 700, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "flex-end" }}>
                <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "420px", height: "100%", backgroundColor: C.bgCard, borderLeft: `1px solid ${C.border2}`, overflowY: "auto", padding: "22px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                    <span style={{ backgroundColor: statCfg.bg, color: statCfg.color, fontSize: "10.5px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>{statCfg.label}</span>
                    <button onClick={() => setStatsDrawerId(null)} aria-label="Fermer" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", cursor: "pointer", color: C.t2 }}>×</button>
                  </div>
                  <h3 style={{ color: C.t1, fontSize: "16px", fontWeight: "800", margin: "0 0 12px" }}>{full.titre}</h3>
                  <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.6, margin: "0 0 18px", whiteSpace: "pre-wrap" }}>{full.contenu}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "18px", fontSize: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Créée le</span><span style={{ color: C.t1 }}>{fmt(full.created_at)}</span></div>
                    {full.date_publication && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Publiée le</span><span style={{ color: C.t1 }}>{fmt(full.date_publication)}</span></div>}
                    {full.date_expiration && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.t3 }}>Visible jusqu&apos;au</span><span style={{ color: C.t1 }}>{fmt(full.date_expiration)}</span></div>}
                  </div>

                  <p style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", margin: "0 0 10px" }}>Performance sur la période sélectionnée</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginBottom: "20px" }}>
                    <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}><p style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: "0 0 2px" }}>{detail.vues}</p><p style={{ color: C.t3, fontSize: "10px", margin: 0 }}>Vues</p></div>
                    <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}><p style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: "0 0 2px" }}>{detail.citoyens_touches}</p><p style={{ color: C.t3, fontSize: "10px", margin: 0 }}>Citoyens touchés</p></div>
                    <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}><p style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: "0 0 2px" }}>{detail.interactions}</p><p style={{ color: C.t3, fontSize: "10px", margin: 0 }}>Interactions</p></div>
                    <div style={{ backgroundColor: C.bg3, borderRadius: "10px", padding: "10px", textAlign: "center" }}><p style={{ color: C.t1, fontSize: "16px", fontWeight: 800, margin: "0 0 2px" }}>{detail.taux_interaction !== null ? `${detail.taux_interaction.toFixed(1)} %` : "—"}</p><p style={{ color: C.t3, fontSize: "10px", margin: 0 }}>Taux d&apos;interaction</p></div>
                  </div>

                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={() => setStatsDrawerId(null)}>Fermer</Button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {innerTab === "creer" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px", alignItems: "flex-start", animation: "fadeUp 0.2s ease" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <h2 style={{ color: C.t1, fontSize: "17px", fontWeight: "800", margin: "0 0 4px" }}>{editAnnonce ? "Modifier l'annonce" : "Nouvelle annonce"}</h2>
              <p style={{ color: C.t2, fontSize: "12.5px", margin: 0 }}>{editAnnonce ? "Modifiez et republiez votre annonce." : "Votre annonce sera visible sur votre profil Yelen224."}</p>
            </div>

            <div>
              <label style={labelStyle(C)}>Type d&apos;annonce *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {TYPES(C).map(t => (
                  <div key={t.id} onClick={() => setForm(prev => ({ ...prev, type: t.id }))} className="tap" style={{ backgroundColor: form.type === t.id ? C.gold : C.bgCard, border: `2px solid ${form.type === t.id ? C.gold : C.border}`, borderRadius: "10px", padding: "10px 12px", cursor: "pointer" }}>
                    <p style={{ color: form.type === t.id ? "#080812" : C.t1, fontSize: "11.5px", fontWeight: "700", margin: "0 0 2px" }}>{t.label}</p>
                    <p style={{ color: form.type === t.id ? "rgba(8,8,18,0.68)" : C.t3, fontSize: "10px", margin: 0 }}>{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ ...labelStyle(C), marginBottom: 0 }}>Templates</label>
                <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" style={{ color: C.gold }} onClick={() => setShowTemplates(!showTemplates)}>{showTemplates ? "Fermer" : "Voir les templates"}</Button>
              </div>
              {showTemplates && (
                <div style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {(TEMPLATES[form.type] || []).map((tpl, i) => (
                    <button key={i} onClick={() => loadTemplate(tpl)} className="tap" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 11px", cursor: "pointer", textAlign: "left" }}>
                      <p style={{ color: C.t1, fontSize: "11.5px", fontWeight: "700", margin: "0 0 2px" }}>{tpl.titre}</p>
                      <p style={{ color: C.t3, fontSize: "10.5px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.contenu.slice(0, 70)}…</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle(C)}>Format *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {FORMATS.map(f => (
                  <div key={f.id} onClick={() => setForm(prev => ({ ...prev, format: f.id }))} className="tap" style={{ backgroundColor: form.format === f.id ? `${C.blue}15` : C.bgCard, border: `2px solid ${form.format === f.id ? C.blue : C.border}`, borderRadius: "10px", padding: "10px 12px", cursor: "pointer" }}>
                    <p style={{ color: form.format === f.id ? C.blue : C.t1, fontSize: "11.5px", fontWeight: "700", margin: "0 0 2px" }}>{f.label}</p>
                    <p style={{ color: C.t3, fontSize: "10px", margin: 0 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {form.format === "image" && (
              <div>
                <label style={labelStyle(C)}>Photo de couverture</label>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer" }}>
                  {coverPreview ? (
                    // IMG-EXCEPTION: reason=coverPreview vaut soit une URL blob: locale (nouvel upload) soit l'URL réelle en édition, non fetchable par l'optimiseur next/image dans le cas blob | reviewed=2026-08-08
                    // eslint-disable-next-line @next/next/no-img-element
                    <div style={{ width: "64px", height: "42px", borderRadius: "7px", overflow: "hidden", flexShrink: 0 }}><img src={coverPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt=""/></div>
                  ) : (
                    <div style={{ width: "64px", height: "42px", borderRadius: "7px", backgroundColor: `${C.gold}0A`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ color: coverPreview ? C.green : C.t1, fontSize: "12.5px", fontWeight: "600", margin: "0 0 2px" }}>{coverPreview ? "Image sélectionnée" : "Ajouter une image"}</p>
                    <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>JPG, PNG — max 10 Mo</p>
                  </div>
                  {coverPreview && <button onClick={e => { e.preventDefault(); setCoverFile(null); setCoverPreview(null); }} style={{ backgroundColor: "transparent", border: "none", color: C.red, fontSize: "16px", cursor: "pointer" }}>×</button>}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCover} style={{ display: "none" }}/>
                </label>
              </div>
            )}

            {form.format === "carrousel" && (
              <div>
                <label style={labelStyle(C)}>Images du carrousel * <span style={{ color: C.t3, textTransform: "none", letterSpacing: 0, fontWeight: "500" }}>({carrouselItems.length}/{MAX_CARROUSEL_IMAGES})</span></label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                  {carrouselItems.map((item, i) => (
                    <div key={i} style={{ position: "relative", width: "72px", height: "72px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                      {/* IMG-EXCEPTION: reason=item.url vaut soit une URL blob: locale (nouvel upload) soit l'URL réelle en édition, non fetchable par l'optimiseur next/image dans le cas blob | reviewed=2026-08-08 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt=""/>
                      <button onClick={() => removeCarrouselImage(i)} style={{ position: "absolute", top: "2px", right: "2px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.65)", border: "none", color: "#fff", fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  ))}
                  {carrouselItems.length < MAX_CARROUSEL_IMAGES && (
                    <label style={{ width: "72px", height: "72px", borderRadius: "10px", border: `1px dashed ${C.border2}`, backgroundColor: C.bgCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <input type="file" accept="image/*" multiple onChange={handleCarrousel} style={{ display: "none" }}/>
                    </label>
                  )}
                </div>
                <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>JPG, PNG — 10 Mo max par image</p>
              </div>
            )}

            {form.format === "pdf" && (
              <div>
                <label style={labelStyle(C)}>Document PDF *</label>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "7px", backgroundColor: `${C.red}0F`, border: `1px solid ${C.red}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IconFormat format="pdf" color={C.red}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: pdfItem ? C.green : C.t1, fontSize: "12.5px", fontWeight: "600", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdfItem ? pdfItem.nom : "Ajouter un PDF"}</p>
                    <p style={{ color: C.t3, fontSize: "10.5px", margin: 0 }}>PDF — max 10 Mo</p>
                  </div>
                  {pdfItem && <button onClick={e => { e.preventDefault(); setPdfItem(null); }} style={{ backgroundColor: "transparent", border: "none", color: C.red, fontSize: "16px", cursor: "pointer" }}>×</button>}
                  <input type="file" accept="application/pdf" onChange={handlePdf} style={{ display: "none" }}/>
                </label>
              </div>
            )}

            {form.format === "video" && (
              <div>
                <label style={labelStyle(C)}>Vidéo *</label>
                {videoItem ? (
                  <div style={{ position: "relative" }}>
                    <video src={videoItem.url} controls style={{ width: "100%", maxHeight: "180px", borderRadius: "10px", backgroundColor: "#000" }}/>
                    <Button tokens={toUiTokens(C)} className="tap" variant="danger-ghost" size="sm" style={{ marginTop: "8px", border: `1px solid ${C.border2}` }} onClick={() => setVideoItem(null)}>Retirer la vidéo</Button>
                  </div>
                ) : (
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "10px", padding: "20px", cursor: "pointer" }}>
                    <IconFormat format="video" color={C.t3}/>
                    <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "600" }}>Ajouter une vidéo</span>
                    <span style={{ color: C.t3, fontSize: "10.5px" }}>MP4 — max 50 Mo</span>
                    <input type="file" accept="video/*" onChange={handleVideoFile} style={{ display: "none" }}/>
                  </label>
                )}
              </div>
            )}

            <div>
              <FormField C={C} label="Titre" required value={form.titre} onChange={v => setForm(prev => ({ ...prev, titre: v }))} placeholder="Ex: Fermeture exceptionnelle le 28 mars" name="titre"/>
            </div>

            <div>
              <label style={labelStyle(C)}>Contenu *</label>
              <textarea value={form.contenu} onChange={e => setForm(prev => ({ ...prev, contenu: e.target.value }))} placeholder="Rédigez votre annonce officielle…" rows={5} style={{ ...inputStyle(C), resize: "none", lineHeight: 1.7 }}/>
              <p style={{ color: C.t3, fontSize: "10.5px", textAlign: "right", margin: "4px 0 0" }}>{form.contenu.length} caractères</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle(C)}>Date / heure de publication</label>
                <input type="datetime-local" value={form.date_publication} onChange={e => setForm(prev => ({ ...prev, date_publication: e.target.value }))} style={inputStyle(C)}/>
                <p style={{ color: C.t3, fontSize: "10.5px", margin: "4px 0 0" }}>Vide = publication immédiate</p>
              </div>
              <div>
                <label style={labelStyle(C)}>Date d&apos;expiration</label>
                <input type="date" value={form.date_expiration} onChange={e => setForm(prev => ({ ...prev, date_expiration: e.target.value }))} style={inputStyle(C)}/>
                <p style={{ color: C.t3, fontSize: "10.5px", margin: "4px 0 0" }}>Archivée après cette date</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle(C)}>Statut</label>
                <select value={form.statut} onChange={e => setForm(prev => ({ ...prev, statut: e.target.value }))} style={inputStyle(C)}>
                  <option value="publiee">Publier maintenant</option>
                  <option value="brouillon">Sauvegarder en brouillon</option>
                </select>
              </div>
              <div>
                <label style={labelStyle(C)}>Options</label>
                <div onClick={() => setForm(prev => ({ ...prev, epingle: !prev.epingle }))} className="tap" style={{ ...inputStyle(C), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: form.epingle ? `${C.gold}12` : C.bg3, borderColor: form.epingle ? `${C.gold}50` : C.border }}>
                  <span style={{ color: form.epingle ? C.gold : C.t2, fontSize: "13px" }}>Épingler en haut</span>
                  <div style={{ width: "34px", height: "19px", borderRadius: "10px", backgroundColor: form.epingle ? C.gold : C.border2, position: "relative", transition: "all 0.2s" }}>
                    <div style={{ position: "absolute", top: "2px", left: form.epingle ? "17px" : "2px", width: "15px", height: "15px", borderRadius: "50%", backgroundColor: form.epingle ? "#000" : C.t3, transition: "all 0.2s" }}/>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle(C)}>Ciblage par région / pays (optionnel)</label>
              <p style={{ color: C.t3, fontSize: "10.5px", margin: "0 0 10px" }}>Vide = visible partout.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {REGIONS.map(r => {
                  const selected = form.regions_cibles.includes(r);
                  return (
                    <button key={r} onClick={() => setForm(prev => ({ ...prev, regions_cibles: selected ? prev.regions_cibles.filter(x => x !== r) : [...prev.regions_cibles, r] }))} className="tap" style={{ backgroundColor: selected ? `${C.gold}15` : C.bgCard, border: `1px solid ${selected ? C.gold + "40" : C.border}`, borderRadius: "20px", padding: "5px 12px", color: selected ? C.gold : C.t3, fontSize: "11.5px", fontWeight: selected ? "700" : "500", cursor: "pointer" }}>
                      {selected ? "✓ " : ""}{r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ backgroundColor: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 14px" }}>
              <p style={{ color: C.t2, fontSize: "11.5px", margin: 0, lineHeight: 1.6 }}>Tout contenu faux, trompeur ou abusif entraîne la suspension immédiate du compte. Les annonces sont modérées par l&apos;équipe Yelen224.</p>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1 }} onClick={() => { resetForm(); setInnerTab("liste"); }}>Annuler</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" style={{ flex: 1, border: `1px solid ${C.gold}40`, color: C.gold }} disabled={saving} onClick={() => { setForm(prev => ({ ...prev, statut: "brouillon" })); setTimeout(handleSubmit, 0); }}>Brouillon</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" style={{ flex: 2 }} loading={saving} onClick={handleSubmit}>
                {form.date_publication && new Date(form.date_publication) > new Date() ? "Planifier" : editAnnonce ? "Mettre à jour" : "Publier maintenant"}
              </Button>
            </div>
          </div>

          <div style={{ position: "sticky", top: "16px" }}>
            <label style={labelStyle(C)}>Aperçu en temps réel</label>
            {!form.titre && !form.contenu && !coverPreview && carrouselItems.length === 0 && !pdfItem && !videoItem ? (
              <div style={{ backgroundColor: C.bgCard, border: `1px dashed ${C.border2}`, borderRadius: "14px", padding: "40px 20px", textAlign: "center" }}>
                <p style={{ color: C.t3, fontSize: "12.5px", margin: 0 }}>L&apos;aperçu apparaît ici en temps réel.</p>
              </div>
            ) : (
              <div style={{ backgroundColor: C.bgCard, border: `1px solid ${getType(form.type).color}40`, borderLeft: `4px solid ${getType(form.type).color}`, borderRadius: "14px", overflow: "hidden" }}>
                {form.format === "image" && coverPreview && (
                  <div style={{ width: "100%", height: "160px", overflow: "hidden" }}>
                    {/* IMG-EXCEPTION: reason=coverPreview vaut soit une URL blob: locale (nouvel upload) soit l'URL réelle en édition, non fetchable par l'optimiseur next/image dans le cas blob | reviewed=2026-08-08 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt=""/>
                  </div>
                )}
                {form.format === "carrousel" && carrouselItems.length > 0 && (
                  <AnnonceImageCarousel images={carrouselItems.map(i => i.url)} height={160} dotActiveColor={C.gold}/>
                )}
                {form.format === "pdf" && pdfItem && (
                  <div style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px", backgroundColor: C.bg3 }}>
                    <IconFormat format="pdf" color={C.red}/>
                    <span style={{ color: C.t1, fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pdfItem.nom}</span>
                  </div>
                )}
                {form.format === "video" && videoItem && <video src={videoItem.url} style={{ width: "100%", height: "160px", objectFit: "cover", backgroundColor: "#000" }}/>}
                <div style={{ padding: "16px" }}>
                  {form.epingle && <div style={{ marginBottom: "8px" }}><span style={{ color: C.gold, fontSize: "10.5px", fontWeight: "700" }}>ANNONCE ÉPINGLÉE</span></div>}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ position: "relative", width: "34px", height: "34px", borderRadius: "9px", backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}25`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      {institution?.logo ? <Image src={institution.logo} alt="" fill sizes="34px" style={{ objectFit: "cover" }}/> : <span style={{ color: C.gold, fontSize: "13px", fontWeight: "800" }}>{institution?.name?.[0]?.toUpperCase() || "Y"}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700", margin: 0 }}>{institution?.name || "Votre institution"}</p>
                      <p style={{ color: C.t3, fontSize: "10.5px", margin: "1px 0 0" }}>{institution?.category} — Maintenant</p>
                    </div>
                    <span style={{ backgroundColor: typeBadgeStyle(form.type, C).bg, color: typeBadgeStyle(form.type, C).color, fontSize: "9.5px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px" }}>{getType(form.type).label.toUpperCase()}</span>
                  </div>
                  {form.titre && <h3 style={{ color: C.t1, fontSize: "14px", fontWeight: "800", margin: "0 0 8px", lineHeight: 1.35 }}>{form.titre}</h3>}
                  {form.contenu && <p style={{ color: C.t2, fontSize: "12.5px", margin: "0 0 12px", lineHeight: 1.65 }}>{form.contenu.slice(0, 220)}{form.contenu.length > 220 ? "…" : ""}</p>}
                  {form.regions_cibles.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {form.regions_cibles.map(r => <span key={r} style={{ backgroundColor: `${C.gold}0F`, border: `1px solid ${C.gold}25`, color: C.gold, fontSize: "9.5px", fontWeight: "600", padding: "2px 7px", borderRadius: "20px" }}>{r}</span>)}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
                    <span style={{ color: C.t3, fontSize: "10.5px" }}>0 vue · 0 clic</span>
                    <span style={{ backgroundColor: form.date_publication && new Date(form.date_publication) > new Date() ? C.purpleL : C.greenL, color: form.date_publication && new Date(form.date_publication) > new Date() ? C.purple : C.green, fontSize: "9.5px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>
                      {form.date_publication && new Date(form.date_publication) > new Date() ? "PLANIFIÉE" : form.statut === "brouillon" ? "BROUILLON" : "PUBLIÉE"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CommunicationTab({ instId, canPublishAnnonce = true }: { instId: string; canPublishAnnonce?: boolean }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  return (
    <div style={{ padding: "16px", animation: "fadeUp 0.2s ease" }}>
      <h1 className="yelen-h2" style={{ color: C.t1, marginBottom: "6px" }}>Communication</h1>
      <p style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>Tenez vos clients informés des actualités et informations importantes de votre établissement.</p>

      <AnnoncesSection instId={instId} canPublish={canPublishAnnonce}/>
    </div>
  );
}
