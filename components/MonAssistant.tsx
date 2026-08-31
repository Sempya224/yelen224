"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { T } from "@/lib/theme";
import {
  calculerMinutesAvantRdv, determinerEtat, messageProchainRdv,
  MESSAGE_AVIS_ATTENTE, MESSAGE_ANNONCE, MESSAGE_VIDE,
  MESSAGE_DOCUMENT_ATTENTE, MESSAGE_DEMARCHE_RETARD, MESSAGE_DEMARCHE_ECHEANCE,
} from "@/lib/assistantMessages";
import { CarteInstitutionCard, type Institution, type CategorieById, type CategorieOption } from "@/app/recherche/shared";
import { ParcoursYelenBandeau } from "@/components/ParcoursYelenBandeau";

// ============================================================
// "Mon Assistant" — bandeau tirable (bottom sheet), écran Accueil citoyen.
// Voir CLAUDE.md /chantier-mon-assistant pour le brief produit complet.
//
// Mécanique de glissement écrite à la main (pointer events) — aucune
// librairie de gestes n'existe dans ce projet (vérifié, package.json).
// Le `<div>` racine garde une position fixe (bottom = hauteur nav +
// safe-area), sa `height` anime entre COLLAPSED_H et une hauteur max
// plafonnée sous le header (calc CSS, jamais de z-index seul) — z-index
// 90, sous la nav du bas (100) et le header (100), donc jamais par-dessus.
// ============================================================

type InstitutionLite = { id: string; name: string; category: string; logo: string | null } | null;
type RdvLite = { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string; institutions: InstitutionLite };
type AnnonceLite = { id: string; titre: string; contenu: string; type: string; format: string | null; media_urls: string[] | null; image_url: string | null; created_at: string; date_expiration: string | null; institutions: InstitutionLite };
// Étendu le 24/08/2026 (au-delà de {id, titre}) pour la carte moderne
// DemarcheCarteAssistant — champs déjà fournis par GET /api/citoyen/assistant
// (voir app/api/citoyen/assistant/route.ts::demarcheVersCarte).
type DemarcheLite = {
  id: string; titre: string; sousTexte: string;
  priorite: "faible" | "normale" | "importante" | "urgente";
  categorie: "personnel" | "professionnel" | null;
  institutionNom: string | null;
  etapesFaites: number; etapesTotal: number;
};
type DocumentAttenteLite = { id: string; label: string; institutions: InstitutionLite };
// Section "découverte" ajoutée le 23/08/2026 (retour Bryan, brief complet
// dans le message — Nouveau sur Yelen / Recommandé pour vous / Vos
// favoris / Bandeau Offres), refondue le même jour (2e retour Bryan :
// rendu jugé "nul", à présenter "comme sur le sheet de la carte") — les 3
// rails réutilisent désormais CarteInstitutionCard telle quelle
// (app/recherche/shared.tsx, même carte que le sheet de la Vue Carte),
// jamais une 2e version dupliquée. Colonnes `institutions` élargies pour
// fournir tous les champs qu'exige ce composant partagé ; GET
// /api/citoyen/favoris étendu en conséquence (additif uniquement, voir
// route.ts) pour le rail "Vos favoris".
//
// ⚠️ Bug corrigé au passage (retour Bryan) : le code lisait la réponse de
// GET /api/citoyen/favoris comme un tableau brut (`Array.isArray(json)`)
// alors que la route renvoie `{ success, favoris: [...] }` — la liste
// était donc toujours vide et affichait "Aucun favori" même quand un
// favori existait réellement (même bug présent, non corrigé ici, dans
// app/page.tsx onglet Communauté — hors périmètre de cette demande).
type FavoriApi = {
  institution_id: string; name: string; category: string | null; secteur: string | null;
  ville: string | null; quartier: string | null; logo: string | null; banniere: string | null;
  badge_verifie: boolean; description: string | null; statut: string; adresse: string | null;
  phone: string | null; horaires: unknown; activite_categorie_id: string | null;
  moyenne_avis: number | null; nb_avis: number | null; latitude: number | null; longitude: number | null;
};
const COLS_INSTITUTION_DECOUVERTE = "id,name,category,secteur,ville,quartier,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,activite_categorie_id,moyenne_avis,nb_avis,created_at";

const COLLAPSED_H = 68;
// Hauteur réelle de la <nav> bas (app/page.tsx) avant safe-area : paddingTop
// 10 + bouton rond 50 + paddingBottom 2 = 62. Valeur précédente (78)
// surestimée — le panneau flottait ~16px au-dessus de la nav, laissant
// voir le fond de la page entre les deux (retour Bryan 23/08/2026 :
// "l'utilisateur ne doit pas voir que le sheet est coupé").
const NAV_H = 62;
const HEADER_CLEARANCE = 110; // marge de sécurité sous le header pour le calc CSS du max-height
const DRAG_SNAP_RATIO = 0.35; // fraction de la course pour basculer d'état au relâchement

const Ic = {
  Grip:     () => <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "currentColor", opacity: 0.35, margin: "0 auto" }}/>,
  Cal:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Star:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Announce: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h1l3.6 5.4a1 1 0 0 0 1.7-.9L9.5 14H17a4 4 0 0 0 0-8H4a1 1 0 0 0-1 1z"/><path d="M15 6v12"/></svg>,
  Doc:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Sparkle:  ({ size = 40 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"/><circle cx="12" cy="12" r="3"/></svg>,
  Chev:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  X:        () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const ASSISTANT_DISMISS_KEY = "yelen224_assistant_dismissed_until";

function InstitutionAvatar({ logo, name, size = 22 }: { logo: string | null | undefined; name: string; size?: number }) {
  const initiales = name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
  if (logo) {
    return (
      <div style={{ position: "relative", width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
        <Image src={logo} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: size * 0.4, fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {initiales}
    </div>
  );
}

// Ligne de liste unifiée (23/08/2026, refonte visuelle "Mon Assistant" —
// présentation uniquement, aucune donnée/règle/route touchée) — les 5
// sections à base de liste (RDV, documents, avis, démarches) partageaient
// la même structure copiée-collée avec des détails divergents (tailles
// d'icône, présence ou non d'un chevron, flèche texte "→" ad hoc sur la
// ligne "Avis"). Un seul composant, mêmes props que les usages précédents,
// chevron systématique (affordance de clic cohérente sur toutes les
// lignes, cf. règle UX "toute action cliquable a une affordance visible").
function Ligne({
  onClick, rowBg, rowBorder, iconBg, iconColor, icon, titre, sousTitre, sousTitreColor, t1, t3,
}: {
  onClick: () => void;
  rowBg: string; rowBorder?: string;
  iconBg: string; iconColor: string; icon: React.ReactNode;
  titre: string; sousTitre: string; sousTitreColor: string;
  t1: string; t3: string;
}) {
  return (
    <button onClick={onClick} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", background: rowBg, border: rowBorder ? `1px solid ${rowBorder}` : "none", borderRadius: "16px", padding: "13px 14px", cursor: "pointer" }}>
      <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titre}</div>
        <div style={{ color: sousTitreColor, fontSize: "12px", fontWeight: "700", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sousTitre}</div>
      </div>
      <div style={{ color: t3, flexShrink: 0, opacity: 0.7 }}><Ic.Chev/></div>
    </button>
  );
}

// Carte démarche modernisée (24/08/2026) — même langage visuel que
// DemarcheCarte (app/compte/mes-demarches/mes-demarches-client.tsx) :
// coins carrés, pas de barre colorée à gauche, point de priorité,
// catégorie/établissement, chevron. Remplace ici l'usage générique de
// `Ligne` pour la section "Démarches à surveiller" uniquement — les
// autres sections (RDV, avis, documents) gardent `Ligne`, hors périmètre
// de cette demande.
function DemarcheCarteAssistant({ d, enRetard, onOpen, t1, t2, t3, card, brd }: {
  d: DemarcheLite; enRetard: boolean; onOpen: () => void;
  t1: string; t2: string; t3: string; card: string; brd: string;
}) {
  const prioriteCouleur = d.priorite === "urgente" ? "#ef4444" : d.priorite === "importante" ? "#F5A623" : null;
  return (
    <button onClick={onOpen} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", background: card, border: `1px solid ${brd}`, borderRadius: "0px", padding: "12px 14px", cursor: "pointer" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
          {prioriteCouleur && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: prioriteCouleur, flexShrink: 0 }}/>}
          <span style={{ color: enRetard ? "#ef4444" : "#F5A623", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{enRetard ? "En retard" : "Bientôt"}</span>
        </div>
        <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.titre}</div>
        {(d.categorie || d.institutionNom) && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px", overflow: "hidden" }}>
            {d.categorie && <span style={{ color: d.categorie === "professionnel" ? "#3b82f6" : t2, background: d.categorie === "professionnel" ? "rgba(59,130,246,0.1)" : brd, fontSize: "9.5px", fontWeight: 700, padding: "2px 7px", borderRadius: "20px", flexShrink: 0 }}>{d.categorie === "professionnel" ? "Pro" : "Perso"}</span>}
            {d.institutionNom && <span style={{ color: t2, fontSize: "10.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.institutionNom}</span>}
          </div>
        )}
        <div style={{ color: t2, fontSize: "11px", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.sousTexte}</div>
      </div>
      <div style={{ color: t3, flexShrink: 0 }}><Ic.Chev/></div>
    </button>
  );
}

function formatDateCourte(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const demain = new Date(aujourdhui); demain.setDate(demain.getDate() + 1);
  if (d.getTime() === aujourdhui.getTime()) return "aujourd'hui";
  if (d.getTime() === demain.getTime()) return "demain";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Rail horizontal partagé par les 3 sections découverte — même convention
// de bleed (-16px, même padding que le reste du panneau) que "Pourquoi
// Yelen ?" de app/page.tsx. Cartes larges (260px, cf. CARTE_INSTITUTION_W)
// car elles hébergent désormais CarteInstitutionCard telle quelle.
function RailDecouverte({ titre, t1, children }: { titre: string; t1: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: t1, fontSize: "14px", fontWeight: "900", marginBottom: "10px" }}>{titre}</div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px" }}>
        {children}
      </div>
    </div>
  );
}

// Largeur de carte identique au rail "Vos favoris" du sheet de la Vue
// Carte (app/recherche/shared.tsx, SheetSection horizontal) — même
// composant, même gabarit, pour ne jamais avoir 2 rendus différents pour
// la même carte institution.
const CARTE_INSTITUTION_W = 260;

export function MonAssistant({ userId }: { userId: string | null }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const card  = isDark ? "#17171C" : "#FFFFFF";
  const card2 = isDark ? "#232328" : "#F2F2F5";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#9999A6" : "#5A5A63";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  // Palette du composant partagé CarteInstitutionCard (app/recherche/shared.tsx)
  // — mêmes tokens que /recherche et le sheet de la Vue Carte, pour un rendu
  // strictement identique.
  const C = T[isDark ? "dark" : "light"];

  const [upcoming, setUpcoming] = useState<RdvLite[]>([]);
  const [avisAttente, setAvisAttente] = useState<RdvLite[]>([]);
  const [annonces, setAnnonces] = useState<AnnonceLite[]>([]);
  const [demarchesEnRetard, setDemarchesEnRetard] = useState<DemarcheLite[]>([]);
  const [demarchesEcheanceProche, setDemarchesEcheanceProche] = useState<DemarcheLite[]>([]);
  const [documentsAttente, setDocumentsAttente] = useState<DocumentAttenteLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Sections découverte (23/08/2026) — chargées à part, indépendamment de
  // `loaded` (données/agrégat métier existant, jamais bloqué par elles ni
  // l'inverse). favorisInsts reste `null` tant que non chargé, pour ne
  // jamais flasher un état "aucun favori" avant la vraie réponse.
  const [nouveautes, setNouveautes] = useState<Institution[]>([]);
  const [recommandes, setRecommandes] = useState<Institution[]>([]);
  const [favorisInsts, setFavorisInsts] = useState<Institution[] | null>(null);
  const [categorieById, setCategorieById] = useState<CategorieById>({});
  const [expanded, setExpanded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // X + popup explicatif (retour Bryan 23/07/2026) — fermer n'efface pas
  // définitivement le bandeau, ça ouvre d'abord un message expliquant sa
  // valeur ; seul le bouton "Masquer 24h" du popup le cache réellement,
  // et seulement temporairement (localStorage, pas de compte à rebours
  // serveur nécessaire pour ce genre de préférence purement locale).
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ASSISTANT_DISMISS_KEY);
      if (raw) setDismissedUntil(Number(raw) || 0);
    } catch {}
  }, []);

  function handleMasquer24h() {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try { localStorage.setItem(ASSISTANT_DISMISS_KEY, String(until)); } catch {}
    setDismissedUntil(until);
    setShowInfoPopup(false);
  }

  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<{ startY: number; startH: number } | null>(null);

  const charger = useCallback(async () => {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/citoyen/assistant", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setUpcoming(json.upcoming ?? []);
        setAvisAttente(json.avisAttente ?? []);
        setAnnonces(json.annonces ?? []);
        setDemarchesEnRetard(json.demarchesEnRetard ?? []);
        setDemarchesEcheanceProche(json.demarchesEcheanceProche ?? []);
        setDocumentsAttente(json.documentsAttente ?? []);
      }
    } catch {}
    setLoaded(true);
  }, [userId]);

  useEffect(() => { void charger(); }, [charger]);

  // Catégories réelles (activite_categories, lecture publique déjà ouverte
  // en RLS) — même requête que RechercheInner.tsx, chargée une fois, pour
  // résoudre le badge de catégorie de CarteInstitutionCard exactement comme
  // partout ailleurs dans le produit (jamais le champ legacy `secteur` seul).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("activite_categories").select("id,code,label").eq("actif", true).order("ordre");
      const categories = (data as CategorieOption[] | null) ?? [];
      setCategorieById(Object.fromEntries(categories.map(c => [c.id, { code: c.code, label: c.label }])));
    })();
  }, []);

  // Sections découverte (23/08/2026) — requêtes autonomes, aucune
  // dépendance sur l'état de l'onglet Communauté (chargé uniquement à sa
  // propre visite ailleurs dans app/page.tsx, jamais garanti sur Accueil).
  // "Nouveau sur Yelen" : institutions validées créées dans les 30
  // derniers jours (jamais "les 10 plus récentes" sans seuil de fraîcheur
  // réel, sinon la section resterait remplie même sans vraie nouveauté).
  // "Recommandé pour vous" : même filtre ville que app/page.tsx (insts),
  // exclut les favoris déjà connus. "Vos favoris" : même route que le fil
  // Communauté (GET /api/citoyen/favoris), étendue pour fournir tous les
  // champs de CarteInstitutionCard.
  const chargerDecouverte = useCallback(async () => {
    if (!userId) return;
    try {
      const seuilNouveaute = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: { session } } = await supabase.auth.getSession();

      const [nouveautesRes, userRes, favorisJson] = await Promise.all([
        supabase.from("institutions").select(COLS_INSTITUTION_DECOUVERTE).eq("statut", "validee").not("name", "is", null).gte("created_at", seuilNouveaute).order("created_at", { ascending: false }).limit(10),
        supabase.from("users").select("ville").eq("id", userId).maybeSingle(),
        session?.access_token
          ? fetch("/api/citoyen/favoris", { headers: { Authorization: `Bearer ${session.access_token}` } }).then(r => (r.ok ? r.json() : null))
          : Promise.resolve(null),
      ]);

      setNouveautes((nouveautesRes.data as Institution[] | null) ?? []);

      const favorisListe: Institution[] = (favorisJson?.success && Array.isArray(favorisJson.favoris))
        ? (favorisJson.favoris as FavoriApi[]).map((f): Institution => ({
            id: f.institution_id, name: f.name, category: f.category ?? "", secteur: f.secteur,
            ville: f.ville ?? "", quartier: f.quartier ?? "", moyenne_avis: f.moyenne_avis ?? 0, nb_avis: f.nb_avis ?? 0,
            logo: f.logo, banniere: f.banniere, badge_verifie: f.badge_verifie, description: f.description,
            statut: f.statut, adresse: f.adresse, latitude: f.latitude ?? 0, longitude: f.longitude ?? 0,
            phone: f.phone, disponibilites: null, horaires: f.horaires, activite_categorie_id: f.activite_categorie_id,
          }))
        : [];
      setFavorisInsts(favorisListe);
      const favorisIds = new Set(favorisListe.map(f => f.id));

      const ville = (userRes.data?.ville || "").trim();
      if (ville) {
        const { data: recoRows } = await supabase.from("institutions").select(COLS_INSTITUTION_DECOUVERTE).eq("ville", ville).not("name", "is", null).order("moyenne_avis", { ascending: false }).limit(10);
        setRecommandes(((recoRows as Institution[] | null) ?? []).filter(i => !favorisIds.has(i.id)));
      } else {
        setRecommandes([]);
      }
    } catch {
      setFavorisInsts(prev => prev ?? []);
    }
  }, [userId]);

  useEffect(() => { void chargerDecouverte(); }, [chargerDecouverte]);

  const favorisIdsSet = useMemo(() => new Set((favorisInsts ?? []).map(f => f.id)), [favorisInsts]);

  // Ajout/retrait favori depuis Mon Assistant — même écriture directe (RLS
  // auth.uid()=citoyen_id) que RechercheInner.tsx::handleToggleFavoriCarte,
  // pas de nouvelle route. Optimiste, reverté si l'écriture échoue.
  const handleToggleFavori = useCallback(async (inst: Institution) => {
    if (!userId) return;
    const estFavori = favorisIdsSet.has(inst.id);
    if (estFavori) {
      setFavorisInsts(prev => (prev ?? []).filter(f => f.id !== inst.id));
      const { error } = await supabase.from("citoyen_favoris").delete().eq("citoyen_id", userId).eq("institution_id", inst.id);
      if (error) setFavorisInsts(prev => [...(prev ?? []), inst]);
    } else {
      setFavorisInsts(prev => [inst, ...(prev ?? [])]);
      const { error } = await supabase.from("citoyen_favoris").insert({ citoyen_id: userId, institution_id: inst.id });
      if (error) {
        setFavorisInsts(prev => (prev ?? []).filter(f => f.id !== inst.id));
      } else {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          fetch("/api/citoyen/favoris", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ institutionId: inst.id }),
          }).catch(() => {});
        });
      }
    }
  }, [userId, favorisIdsSet]);

  // Recalcule le message contextuel toutes les 30s (pas de refetch réseau)
  // — même pattern que JournalTab.tsx côté institution — pour que le
  // message change à l'approche du RDV sans dépendre du Realtime (Realtime
  // live hors scope de ce lot, voir plan).
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const setPanelHeight = (h: number, animate: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animate ? "height 0.32s cubic-bezier(0.16,1,0.3,1)" : "none";
    el.style.height = `${h}px`;
  };

  const getMaxH = () => {
    if (typeof window === "undefined") return 400;
    return Math.max(COLLAPSED_H, window.innerHeight - HEADER_CLEARANCE - NAV_H);
  };

  useEffect(() => {
    setPanelHeight(expanded ? getMaxH() : COLLAPSED_H, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = panelRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = { startY: e.clientY, startH: el.getBoundingClientRect().height };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = dragging.current.startY - e.clientY; // tirer vers le haut = positif
    const h = Math.min(getMaxH(), Math.max(COLLAPSED_H, dragging.current.startH + delta));
    setPanelHeight(h, false);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    const el = panelRef.current;
    const currentH = el ? el.getBoundingClientRect().height : COLLAPSED_H;
    const maxH = getMaxH();
    const seuil = COLLAPSED_H + (maxH - COLLAPSED_H) * DRAG_SNAP_RATIO;
    dragging.current = null;
    setExpanded(currentH >= seuil);
  };
  const onGripTap = () => setExpanded((v) => !v);

  if (!userId || !loaded) return null;
  if (dismissedUntil > nowTick) return null;

  // ── Message contextuel de la position réduite ──
  const now = new Date(nowTick);
  let sommaire = MESSAGE_VIDE;
  if (upcoming.length > 0 && upcoming[0].institutions) {
    const r = upcoming[0];
    const etat = determinerEtat(calculerMinutesAvantRdv({ dateRdv: r.date_rdv, heureRdv: r.heure_rdv, institutionNom: r.institutions!.name }, now), formatDateCourte(r.date_rdv) === "aujourd'hui");
    sommaire = messageProchainRdv(etat, { dateRdv: r.date_rdv, heureRdv: r.heure_rdv, institutionNom: r.institutions!.name }, formatDateCourte(r.date_rdv));
  } else if (documentsAttente.length > 0) {
    sommaire = MESSAGE_DOCUMENT_ATTENTE(documentsAttente.length);
  } else if (demarchesEnRetard.length > 0) {
    sommaire = MESSAGE_DEMARCHE_RETARD(demarchesEnRetard.length);
  } else if (avisAttente.length > 0) {
    sommaire = MESSAGE_AVIS_ATTENTE(avisAttente.length);
  } else if (demarchesEcheanceProche.length > 0) {
    sommaire = MESSAGE_DEMARCHE_ECHEANCE(demarchesEcheanceProche.length);
  } else if (annonces.length > 0) {
    sommaire = MESSAGE_ANNONCE(annonces.length);
  }

  const rien = upcoming.length === 0 && avisAttente.length === 0 && annonces.length === 0
    && demarchesEnRetard.length === 0 && demarchesEcheanceProche.length === 0 && documentsAttente.length === 0;

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: 0, right: 0,
        bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))`,
        height: `${COLLAPSED_H}px`,
        maxHeight: `calc(100svh - ${HEADER_CLEARANCE}px - ${NAV_H}px)`,
        zIndex: 90,
        background: card,
        borderTop: `1px solid ${brd}`,
        borderRadius: "18px 18px 0 0",
        boxShadow: isDark ? "0 -6px 24px rgba(0,0,0,0.35)" : "0 -6px 24px rgba(0,0,0,0.10)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        touchAction: "none",
      }}
    >
      {/* Poignée — tap ou glisser (pointer events) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onGripTap}
        style={{ flexShrink: 0, padding: "10px 16px 8px", cursor: "grab", color: t2 }}
      >
        <Ic.Grip/>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#F5A623", color: "#080812", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ic.Sparkle size={18}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.4px", textTransform: "uppercase" }}>Mon Assistant</div>
            <div style={{ color: t1, fontSize: "14px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "1px" }}>{sommaire}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setShowInfoPopup(true); }} aria-label="À propos de Mon Assistant" className="tap" style={{ width: "28px", height: "28px", borderRadius: "50%", background: card2, border: "none", cursor: "pointer", color: t2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic.X/></button>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: card2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ transform: expanded ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.25s", color: t2, display: "flex" }}><Ic.Chev/></div>
          </div>
        </div>
      </div>

      {/* Popup explicatif — ouvert par le X, explique la valeur avant de
          proposer de masquer (retour Bryan 23/07/2026). Rendu via portail
          dans document.body : le panneau racine de Mon Assistant est en
          position:fixed avec son propre z-index (90), ce qui crée un
          contexte d'empilement local — un enfant fixed à l'intérieur ne
          peut jamais dépasser visuellement la nav du bas (z-index 100,
          en dehors de ce contexte) même avec un z-index élevé sur lui-même.
          Le portail sort le popup de ce contexte, comme les autres modales
          de l'app (BiometrieModal, NotifPanel, LogoutFlow) qui n'ont pas
          ce problème car rendues directement au niveau de HomePage. */}
      {showInfoPopup && createPortal(
        <div onClick={() => setShowInfoPopup(false)} style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: card, borderRadius: "24px 24px 0 0", padding: "28px 20px calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "480px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#080812" }}>
              <Ic.Sparkle size={28}/>
            </div>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "800", textAlign: "center", marginBottom: "8px" }}>Mon Assistant</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, textAlign: "center", marginBottom: "22px" }}>
              C&apos;est votre assistant personnel pour ne rien manquer sur Yelen : rappels de rendez-vous, documents à fournir, avis à laisser et démarches à surveiller — au bon moment, sans avoir à y penser.
            </div>
            <button onClick={() => setShowInfoPopup(false)} className="tap" style={{ width: "100%", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "12px", border: "none", cursor: "pointer", marginBottom: "10px" }}>Compris, le garder affiché</button>
            <button onClick={handleMasquer24h} className="tap" style={{ width: "100%", background: "none", color: t2, fontWeight: "700", fontSize: "13px", padding: "10px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Masquer pendant 24h</button>
          </div>
        </div>,
        document.body
      )}

      {/* Contenu déplié — scrollable, jamais responsable de la hauteur du panneau */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 20px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* "Votre parcours Yelen" — en haut du contenu du sheet (décision
            CEO, brief §3). Composant partagé (components/ParcoursYelenBandeau.tsx,
            retour Bryan 27/08/2026) — même instance de code que sur
            l'Accueil, gère son propre fetch/état/fermeture session. */}
        <ParcoursYelenBandeau userId={userId}/>

        {rien ? (
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#F5A623", color: "#080812", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Ic.Sparkle size={30}/>
            </div>
            <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Mon Assistant est prêt</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "280px", margin: "0 auto" }}>
              Dès votre premier rendez-vous, cet espace vous guidera avant, pendant et après — rappels, préparation, et demandes d&apos;avis, au bon moment.
            </div>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Section titre="Prochains rendez-vous" t2={t2}>
                {upcoming.map((r) => (
                  <Ligne
                    key={r.id}
                    onClick={() => router.push("/mes-rdv")}
                    rowBg={card2} iconBg={card} iconColor="#F5A623" icon={<Ic.Cal/>}
                    titre={r.institutions?.name ?? "Institution"}
                    sousTitre={`${formatDateCourte(r.date_rdv)} · ${r.heure_rdv?.slice(0, 5)}`}
                    sousTitreColor={t2} t1={t1} t3={t3}
                  />
                ))}
              </Section>
            )}

            {documentsAttente.length > 0 && (
              <Section titre="Documents à fournir" t2={t2}>
                {documentsAttente.map((d) => (
                  <Ligne
                    key={d.id}
                    onClick={() => router.push("/compte/documents-telecharges")}
                    rowBg="rgba(239,68,68,0.06)" rowBorder="rgba(239,68,68,0.2)" iconBg="rgba(239,68,68,0.12)" iconColor="#ef4444" icon={<Ic.Doc/>}
                    titre={d.label}
                    sousTitre={`${d.institutions?.name ?? "Établissement"} attend ce document`}
                    sousTitreColor={t2} t1={t1} t3={t3}
                  />
                ))}
              </Section>
            )}

            {avisAttente.length > 0 && (
              <Section titre="Avis à laisser" t2={t2}>
                {avisAttente.map((r) => (
                  <Ligne
                    key={r.id}
                    onClick={() => router.push("/compte/mes-avis")}
                    rowBg={card2} iconBg={card} iconColor="#F5A623" icon={<Ic.Star/>}
                    titre={r.institutions?.name ?? "Institution"}
                    sousTitre="Donnez votre avis"
                    sousTitreColor="#F5A623" t1={t1} t3={t3}
                  />
                ))}
              </Section>
            )}

            {(demarchesEnRetard.length > 0 || demarchesEcheanceProche.length > 0) && (
              <Section titre="Démarches à surveiller" t2={t2}>
                {demarchesEnRetard.map((d) => (
                  <DemarcheCarteAssistant
                    key={d.id} d={d} enRetard
                    onOpen={() => router.push(`/compte/mes-demarches?id=${d.id}`)}
                    t1={t1} t2={t2} t3={t3} card={card} brd={brd}
                  />
                ))}
                {demarchesEcheanceProche.map((d) => (
                  <DemarcheCarteAssistant
                    key={d.id} d={d} enRetard={false}
                    onOpen={() => router.push(`/compte/mes-demarches?id=${d.id}`)}
                    t1={t1} t2={t2} t3={t3} card={card} brd={brd}
                  />
                ))}
              </Section>
            )}

            {annonces.length > 0 && (
              <Section titre="Annonces des établissements" t2={t2}>
                {annonces.map((a) => {
                  const nomInst = a.institutions?.name ?? "Institution";
                  const video = !a.image_url && a.format === "video" && a.media_urls?.[0];
                  return (
                    <button key={a.id} onClick={() => a.institutions && router.push(`/institution/${a.institutions.id}`)} className="tap" style={{ width: "100%", textAlign: "left", background: card2, border: `1px solid ${brd}`, borderRadius: "16px", overflow: "hidden", cursor: "pointer", padding: 0 }}>
                      {a.image_url ? (
                        <div style={{ width: "100%", height: "130px", position: "relative", overflow: "hidden", background: card }}>
                          <Image src={a.image_url} alt="" fill sizes="(min-width: 640px) 400px, 92vw" style={{ objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}/>
                        </div>
                      ) : video ? (
                        <div style={{ width: "100%", height: "150px", overflow: "hidden", background: "#000" }}>
                          <video src={video} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline preload="metadata"/>
                        </div>
                      ) : null}
                      <div style={{ padding: "13px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                          <InstitutionAvatar logo={a.institutions?.logo} name={nomInst} size={24}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: t1, fontSize: "12px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nomInst}</div>
                          </div>
                          <span style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "8px", flexShrink: 0 }}>Annonce</span>
                        </div>
                        <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px" }}>{a.titre}</div>
                        <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.contenu}</div>
                      </div>
                    </button>
                  );
                })}
              </Section>
            )}
          </>
        )}

        {/* Sections découverte (23/08/2026) — après les actions du compte
            (contenu ci-dessus, ou l'état "rien" si aucune), toujours
            visibles indépendamment de `rien` : la découverte de l'app n'a
            pas de raison de dépendre des rappels personnels du moment.
            Les 3 rails réutilisent CarteInstitutionCard (hideCover +
            richDetails, comme le rail "Vos favoris" du sheet de la Vue
            Carte) — même carte, même photo/badge vérifié/note/Ouvert-
            Fermé/description/boutons partout dans le produit. */}
        {nouveautes.length > 0 && (
          <RailDecouverte titre="Nouveau sur Yelen" t1={t1}>
            {nouveautes.map(n => (
              <div key={n.id} style={{ width: `${CARTE_INSTITUTION_W}px`, flexShrink: 0 }}>
                <CarteInstitutionCard inst={n} C={C as typeof T["dark"]} t2={t2} citoyenGeoloc={null} estFavori={favorisIdsSet.has(n.id)} onToggleFavori={e => { e.stopPropagation(); void handleToggleFavori(n); }} onSelect={() => router.push(`/institution/${n.id}`)} categorieById={categorieById} richDetails hideCover/>
              </div>
            ))}
          </RailDecouverte>
        )}

        {recommandes.length > 0 && (
          <RailDecouverte titre="Recommandé pour vous" t1={t1}>
            {recommandes.map(r => (
              <div key={r.id} style={{ width: `${CARTE_INSTITUTION_W}px`, flexShrink: 0 }}>
                <CarteInstitutionCard inst={r} C={C as typeof T["dark"]} t2={t2} citoyenGeoloc={null} estFavori={favorisIdsSet.has(r.id)} onToggleFavori={e => { e.stopPropagation(); void handleToggleFavori(r); }} onSelect={() => router.push(`/institution/${r.id}`)} categorieById={categorieById} richDetails hideCover/>
              </div>
            ))}
          </RailDecouverte>
        )}

        {favorisInsts !== null && (
          <RailDecouverte titre="Vos favoris" t1={t1}>
            {favorisInsts.length > 0 ? (
              favorisInsts.map(f => (
                <div key={f.id} style={{ width: `${CARTE_INSTITUTION_W}px`, flexShrink: 0 }}>
                  <CarteInstitutionCard inst={f} C={C as typeof T["dark"]} t2={t2} citoyenGeoloc={null} estFavori onToggleFavori={e => { e.stopPropagation(); void handleToggleFavori(f); }} onSelect={() => router.push(`/institution/${f.id}`)} categorieById={categorieById} richDetails hideCover/>
                </div>
              ))
            ) : (
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "10px", background: card2, borderRadius: "14px", padding: "12px 14px", maxWidth: "260px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: card, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Star/></div>
                <div style={{ color: t2, fontSize: "12px", fontWeight: "700" }}>Aucun favori pour l&apos;instant</div>
              </div>
            )}
          </RailDecouverte>
        )}
      </div>
    </div>
  );
}

function Section({ titre, t2, children }: { titre: string; t2: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: t2, fontSize: "11px", fontWeight: "800", letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: "8px" }}>{titre}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{children}</div>
    </div>
  );
}
