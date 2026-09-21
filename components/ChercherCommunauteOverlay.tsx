"use client";

// Recherche "Yelen Community" (brief Bryan 09/09/2026, architecture
// LinkedIn/Meta adaptée à Yelen, validée avant construction — livrée lot
// après lot).
//
// Lot 1 — États 1+2 : icône dans le header Communauté, écran dédié,
// recherches récentes (stockage local propre à Community, jamais partagé
// avec la recherche générale Yelen — RECENT_KEY distincte de celle de
// app/recherche/RechercheOverlay.tsx), suggestions par catégorie avec
// comptage réel de publications (jamais un nombre inventé).
//
// Lot 3 — État 3 (résultats) : onglets Tout/Publications/Professionnels/
// Entreprises. "Services" volontairement absent de ce lot (pointerait vers
// les offres/services d'institutions — territoire de la recherche générale
// Yelen, contraire à la règle explicite du brief : "Community ne doit pas
// devenir une deuxième recherche générale"). "Professionnels"/"Entreprises"
// scopés aux citoyens/institutions ayant déjà publié dans Community — jamais
// l'annuaire complet des utilisateurs Yelen (RLS `users` l'interdit de
// toute façon, voir app/api/citoyen/communaute/professionnels/route.ts).
// "Publications" réutilise PostCard tel quel (renderPost, fourni par
// app/page.tsx — jamais une seconde carte de post). Matching 100% côté
// client, déterministe (lib/rechercheFuzzy.ts, tolérance aux fautes) — pas
// de matching sémantique/hybride dans ce lot (romprait la philosophie
// zéro-LLM du projet, décision à part entière si un jour demandée).
//
// Hors périmètre de ce lot : État 4 (filtres catégorie/date/auteur/tri).
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { correspondApproximativement } from "@/lib/rechercheFuzzy";
import { CategorieBadge, Avatar, AvatarInstitution, BadgeVerifie, type Post } from "@/components/CommunautePostCard";
import { InstitutionBadgeVerifie } from "@/lib/institutionBadge";
import { POST_CATEGORIES, POST_CATEGORIE_LABELS, type PostCategorie } from "@/lib/communauteCategories";

const RECENT_KEY = "yelen224_communaute_recherches_recentes";
const RECENT_MAX = 8;
const TERME_MIN = 2;

type Professionnel = { id: string; nom: string; photo: string | null; verifie: boolean; membreDepuis: string; profession: string | null; ville: string | null };
type Entreprise = { id: string; name: string; logo: string | null; category: string | null; secteur: string | null; ville: string | null; badge_verifie: boolean };
type Onglet = "tout" | "publications" | "professionnels" | "entreprises";

// Recherche récente enrichie (retour Bryan 09/09/2026, référence Facebook) —
// un sujet/texte libre reste une simple ligne (horloge + texte), mais un
// professionnel/une entreprise déjà consulté garde sa photo + son nom, pas
// juste le texte tapé. `label` sert à la fois d'affichage et de clé de
// recherche/déduplication.
type RechercheRecente =
  | { type: "texte"; label: string }
  | { type: "professionnel"; id: string; label: string; photo: string | null; verifie: boolean; membreDepuis: string }
  | { type: "entreprise"; id: string; label: string; photo: string | null; verifie: boolean };

// Tolère l'ancien format (tableau de chaînes, avant ce chantier) — jamais
// perdre les recherches déjà enregistrées côté citoyen, converties à la
// volée en entrées "texte".
function lireRecherchesRecentes(): RechercheRecente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map((item: unknown): RechercheRecente | null =>
      typeof item === "string" ? { type: "texte", label: item }
      : item && typeof item === "object" && "type" in item ? item as RechercheRecente
      : null
    ).filter((x): x is RechercheRecente => x !== null);
  } catch { return []; }
}
function cleRecherche(item: RechercheRecente): string {
  return item.type === "texte" ? `texte:${item.label.toLowerCase()}` : `${item.type}:${item.id}`;
}
function enregistrerRechercheRecente(item: RechercheRecente) {
  if (typeof window === "undefined") return;
  if (item.type === "texte" && item.label.trim().length < TERME_MIN) return;
  try {
    const cle = cleRecherche(item);
    const next = [item, ...lireRecherchesRecentes().filter(x => cleRecherche(x) !== cle)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}
function retirerRechercheRecente(item: RechercheRecente): RechercheRecente[] {
  if (typeof window === "undefined") return [];
  const cle = cleRecherche(item);
  const next = lireRecherchesRecentes().filter(x => cleRecherche(x) !== cle);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

const Ic = {
  CloseSm:() => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Clock:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  Chev:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
};

function surligner(texte: string, requete: string): React.ReactNode {
  const q = requete.trim();
  if (!q) return texte;
  const idx = texte.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return texte;
  return <>{texte.slice(0, idx)}<span style={{ color: "#F5A623" }}>{texte.slice(idx, idx + q.length)}</span>{texte.slice(idx + q.length)}</>;
}

// Composants de ligne — sortis au niveau module (retour Bryan 09/09/2026,
// "l'image du profil ne reste pas fixe") : définis à l'intérieur du
// composant parent, ils étaient redéfinis à chaque frappe (nouvelle
// référence de fonction), React les traitait comme un nouveau type de
// composant et démontait/remontait l'avatar à chaque re-render — piège déjà
// documenté dans ce projet (CLAUDE.md, "composant défini dans un composant
// parent"). Toutes les dépendances externes passent maintenant en props.
function LignePro({ p, query, onSelect, t1, t2 }: { p: Professionnel; query: string; onSelect: () => void; t1: string; t2: string }) {
  return (
    <button onClick={onSelect} className="cc-tap" style={{ display: "flex", alignItems: "center", gap: "12px", background: "none", border: "none", padding: "8px 2px", cursor: "pointer", textAlign: "left", width: "100%" }}>
      <Avatar nom={p.nom} photo={p.photo} taille={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{surligner(p.nom, query)}</span>
        </div>
        {p.verifie && <BadgeVerifie/>}
        {/* "Professionnel" explicite en préfixe (jamais juste le nom) —
            différencie sans ambiguïté d'une Entreprise ci-dessous, même si
            la forme de l'avatar (cercle vs carré arrondi) le fait déjà. */}
        <div style={{ color: t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Professionnel{[p.profession, p.ville].filter(Boolean).length > 0 ? ` · ${[p.profession, p.ville].filter(Boolean).join(" · ")}` : ""}
        </div>
      </div>
    </button>
  );
}

function LigneEntreprise({ e, query, onSelect, t1, t2 }: { e: Entreprise; query: string; onSelect: () => void; t1: string; t2: string }) {
  return (
    <button onClick={onSelect} className="cc-tap" style={{ display: "flex", alignItems: "center", gap: "12px", background: "none", border: "none", padding: "8px 2px", cursor: "pointer", textAlign: "left", width: "100%" }}>
      <AvatarInstitution nom={e.name} logo={e.logo} taille={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{surligner(e.name, query)}</span>
          {e.badge_verifie && <InstitutionBadgeVerifie verifie taille={13} couleurTexte={t2}/>}
        </div>
        <div style={{ color: t2, fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Entreprise{[e.category, e.ville].filter(Boolean).length > 0 ? ` · ${[e.category, e.ville].filter(Boolean).join(" · ")}` : ""}
        </div>
      </div>
    </button>
  );
}

function LigneRecente({ item, onOuvrir, onRetirer, t1, t3 }: { item: RechercheRecente; onOuvrir: () => void; onRetirer?: () => void; t1: string; t3: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 2px" }}>
      {item.type === "texte" ? (
        <span style={{ color: t3, flexShrink: 0 }}>{Ic.Clock()}</span>
      ) : item.type === "professionnel" ? (
        <Avatar nom={item.label} photo={item.photo} taille={32}/>
      ) : (
        <AvatarInstitution nom={item.label} logo={item.photo} taille={32}/>
      )}
      <button onClick={onOuvrir} className="cc-tap" style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: t1, fontSize: "13.5px", fontWeight: 600, cursor: "pointer", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</button>
      {onRetirer && (
        <button onClick={onRetirer} aria-label="Retirer" className="cc-tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>{Ic.CloseSm()}</button>
      )}
    </div>
  );
}

export default function ChercherCommunauteOverlay({
  onClose, onApplyCategorie, onOpenInstitution, onOpenProfessionnel, renderPost,
  bg, card2, t1, t2, t3, brd,
}: {
  onClose: () => void;
  onApplyCategorie: (categorie: string) => void;
  onOpenInstitution: (id: string) => void;
  onOpenProfessionnel: (pro: Professionnel) => void;
  renderPost: (post: Post) => React.ReactNode;
  isDark: boolean; bg: string; card: string; card2: string; t1: string; t2: string; t3: string; brd: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [queryDebounced, setQueryDebounced] = useState("");
  const [committed, setCommitted] = useState(false);
  const [ongletResultat, setOngletResultat] = useState<Onglet>("tout");
  const [recherchesRecentes, setRecherchesRecentes] = useState<RechercheRecente[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});

  // Index résultats — chargé une seule fois à l'ouverture (même convention
  // que RechercheOverlay : jamais un partage d'état avec le fil du parent,
  // qui est paginé/filtré par onglet), filtré ensuite 100% côté client.
  const [postsIndex, setPostsIndex] = useState<Post[]>([]);
  const [professionnels, setProfessionnels] = useState<Professionnel[]>([]);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [chargementIndex, setChargementIndex] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { setRecherchesRecentes(lireRecherchesRecentes()); }, []);

  useEffect(() => {
    const t = setTimeout(() => setQueryDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Le champ vidé ramène toujours à l'état inactif (Recherches récentes +
  // "Que cherchez-vous ?"), même s'il y avait déjà des résultats commis.
  useEffect(() => { if (!query.trim()) setCommitted(false); }, [query]);

  // Garde d'annulation (retour Bryan 09/09/2026 : "la photo apparaît/
  // disparaît en moins de 2s") — sans elle, un remontage rapide de l'overlay
  // (StrictMode en dev, ou double-tap sur l'icône recherche avant que le
  // premier chargement finisse) pouvait faire résoudre un fetch obsolète
  // après le suivant et réécrire un état déjà à jour, provoquant ce flash.
  useEffect(() => {
    let annule = false;
    (async () => {
      const { data: postsData } = await supabase
        .from("posts")
        .select("id, auteur_id, auteur_type, institution_auteur_id, categorie, author_nom, author_photo_url, author_verifie, author_membre_depuis, contenu, images, nb_partages, created_at")
        .eq("statut", "publiee")
        .order("created_at", { ascending: false })
        .limit(300);
      if (annule) return;
      const rows = (postsData as Post[]) ?? [];
      setPostsIndex(rows);

      const instIds = [...new Set(rows.filter(p => p.auteur_type === "institution" && p.institution_auteur_id).map(p => p.institution_auteur_id as string))];
      if (instIds.length > 0) {
        const { data: instData } = await supabase.from("institutions").select("id, name, category, secteur, ville, logo, badge_verifie").in("id", instIds);
        if (annule) return;
        setEntreprises((instData as Entreprise[]) ?? []);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch("/api/citoyen/communaute/professionnels", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json().catch(() => null);
        if (!annule && res.ok && Array.isArray(j?.professionnels)) setProfessionnels(j.professionnels);
      }
      if (!annule) setChargementIndex(false);
    })();
    return () => { annule = true; };
  }, []);

  const requeteActive = queryDebounced.trim().length > 0;

  const suggestionsCategories = useMemo<PostCategorie[]>(() => {
    if (!requeteActive) return [];
    return POST_CATEGORIES.filter(c => correspondApproximativement(queryDebounced, POST_CATEGORIE_LABELS[c]));
  }, [requeteActive, queryDebounced]);

  // Comptage réel de publications par catégorie suggérée (jamais un chiffre
  // inventé) — une requête count() ciblée par catégorie qui matche.
  useEffect(() => {
    if (suggestionsCategories.length === 0) return;
    let annule = false;
    (async () => {
      const entries = await Promise.all(suggestionsCategories.map(async c => {
        const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("statut", "publiee").eq("categorie", c);
        return [c, count ?? 0] as const;
      }));
      if (!annule) setComptes(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { annule = true; };
  }, [suggestionsCategories]);

  const recherchesRecentesFiltrees = useMemo(() => {
    if (!requeteActive) return recherchesRecentes;
    const q = queryDebounced.trim().toLowerCase();
    return recherchesRecentes.filter(r => r.label.toLowerCase().includes(q));
  }, [requeteActive, recherchesRecentes, queryDebounced]);

  // Catégorie exacte correspondant à la requête commise (ex. tap sur une
  // suggestion, ou texte tapé identique à un libellé) — sert à affiner le
  // matching Publications (categorie exacte, en plus du texte libre) et à
  // proposer le lien "Voir dans le fil" vers le vrai filtre existant.
  const categorieExacte = useMemo<PostCategorie | null>(() => {
    const q = queryDebounced.trim().toLowerCase();
    if (!q) return null;
    return POST_CATEGORIES.find(c => POST_CATEGORIE_LABELS[c].toLowerCase() === q) ?? null;
  }, [queryDebounced]);

  // Non gatés sur `committed` — réutilisés à la fois pour les suggestions
  // en direct (extraits, non commis) et pour les résultats complets (une
  // fois commis), voir sections JSX ci-dessous (retour Bryan 09/09/2026 :
  // la recherche ne doit plus se limiter aux catégories pendant la frappe,
  // même logique que "For you" côté Facebook).
  const publicationsTrouvees = useMemo(() => {
    if (!requeteActive) return [];
    return postsIndex.filter(p =>
      p.categorie === categorieExacte ||
      correspondApproximativement(queryDebounced, p.contenu ?? "") ||
      correspondApproximativement(queryDebounced, p.author_nom)
    );
  }, [requeteActive, postsIndex, queryDebounced, categorieExacte]);

  const professionnelsTrouves = useMemo(() => {
    if (!requeteActive) return [];
    return professionnels.filter(p => correspondApproximativement(queryDebounced, p.nom) || (p.profession && correspondApproximativement(queryDebounced, p.profession)));
  }, [requeteActive, professionnels, queryDebounced]);

  const entreprisesTrouvees = useMemo(() => {
    if (!requeteActive) return [];
    return entreprises.filter(e => correspondApproximativement(queryDebounced, e.name) || (e.category && correspondApproximativement(queryDebounced, e.category)));
  }, [requeteActive, entreprises, queryDebounced]);

  const aDesResultats = publicationsTrouvees.length > 0 || professionnelsTrouves.length > 0 || entreprisesTrouvees.length > 0;

  function commit(q: string) {
    const propre = q.trim();
    if (propre.length < TERME_MIN) return;
    enregistrerRechercheRecente({ type: "texte", label: propre });
    setRecherchesRecentes(lireRecherchesRecentes());
    setQuery(propre);
    setOngletResultat("tout");
    setCommitted(true);
  }

  function commitCategorie(c: PostCategorie) {
    commit(POST_CATEGORIE_LABELS[c]);
  }

  const TABS: { key: Onglet; label: string }[] = [
    { key: "tout", label: "Tout" },
    { key: "publications", label: "Publications" },
    { key: "professionnels", label: "Professionnels" },
    { key: "entreprises", label: "Entreprises" },
  ];

  // Utilisé à la fois par les Suggestions (avant validation) et les
  // Résultats (onglet Professionnels/Entreprises) — un profil consulté
  // devient une recherche récente enrichie (photo + nom, voir
  // RechercheRecente), pas juste le texte tapé (retour Bryan 09/09/2026).
  function ouvrirProfessionnel(p: Professionnel) {
    enregistrerRechercheRecente({ type: "professionnel", id: p.id, label: p.nom, photo: p.photo, verifie: p.verifie, membreDepuis: p.membreDepuis });
    setRecherchesRecentes(lireRecherchesRecentes());
    onOpenProfessionnel(p);
  }

  function ouvrirEntreprise(e: Entreprise) {
    enregistrerRechercheRecente({ type: "entreprise", id: e.id, label: e.name, photo: e.logo, verifie: e.badge_verifie });
    setRecherchesRecentes(lireRecherchesRecentes());
    onOpenInstitution(e.id);
  }

  // Rejoue une recherche récente — un texte relance une recherche, un
  // professionnel/une entreprise rouvre directement son profil (retour
  // Bryan 09/09/2026, référence Facebook : "Recent" mêle sujets texte et
  // profils avec photo, pas une liste indifférenciée).
  function ouvrirRecente(item: RechercheRecente) {
    if (item.type === "texte") { commit(item.label); return; }
    if (item.type === "professionnel") {
      ouvrirProfessionnel({ id: item.id, nom: item.label, photo: item.photo, verifie: item.verifie, membreDepuis: item.membreDepuis, profession: null, ville: null });
      return;
    }
    ouvrirEntreprise({ id: item.id, name: item.label, logo: item.photo, category: null, secteur: null, ville: null, badge_verifie: item.verifie });
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes chercherCommunauteFadeIn{from{opacity:0}to{opacity:1}}
        .cc-tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer;touch-action:manipulation}
        .cc-tap:active{opacity:0.7;transform:scale(0.97)}
        .cc-input{outline:none}
        .cc-input:focus{outline:none}
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Même bouton retour exact que CompteHeader (components/CompteEcranVide.tsx)
              — aucun cercle/fond/bordure, juste le chevron (retour Bryan
              09/09/2026 : cohérence avec les ~29 headers /compte/*). */}
          <button onClick={onClose} aria-label="Retour" className="cc-tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", background: "none", border: "none", padding: "4px 6px 4px 0", cursor: "pointer", color: t1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          {/* Barre pilule façon Facebook (retour Bryan 09/09/2026) — pas de
              bordure colorée au focus, juste un fond plein arrondi. */}
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t2, pointerEvents: "none" }}>{Ic.Search()}</div>
            <input
              ref={inputRef}
              className="cc-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commit(query); }}
              placeholder="Rechercher dans Community"
              style={{ width: "100%", background: card2, border: "none", borderRadius: "22px", padding: "12px 38px 12px 40px", fontSize: "14.5px", color: t1, fontWeight: 500, boxSizing: "border-box" }}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Effacer" className="cc-tap" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "50%", background: brd, border: "none", color: t2, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>{Ic.CloseSm()}</button>
            )}
          </div>
        </div>

        {committed && requeteActive && (
          <div style={{ display: "flex", gap: "6px", overflowX: "auto", padding: "0 16px 12px" }}>
            {TABS.map(tb => (
              <button key={tb.key} onClick={() => setOngletResultat(tb.key)} className="cc-tap" style={{ flexShrink: 0, padding: "8px 14px", borderRadius: "20px", border: "none", background: ongletResultat === tb.key ? "#F5A623" : card2, color: ongletResultat === tb.key ? "#080812" : t2, fontSize: "12.5px", fontWeight: ongletResultat === tb.key ? 800 : 600, cursor: "pointer" }}>
                {tb.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 40px", width: "100%", maxWidth: "560px", margin: "0 auto", boxSizing: "border-box", animation: "chercherCommunauteFadeIn 0.2s ease" }}>
        {!committed && !requeteActive && recherchesRecentes.length > 0 && (
          <section style={{ marginBottom: "26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Recherches récentes</div>
              <button onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ } setRecherchesRecentes([]); }} className="cc-tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0 }}>Effacer</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recherchesRecentes.map(item => (
                <LigneRecente key={cleRecherche(item)} item={item} onOuvrir={() => ouvrirRecente(item)} onRetirer={() => setRecherchesRecentes(retirerRechercheRecente(item))} t1={t1} t3={t3}/>
              ))}
            </div>
          </section>
        )}

        {!committed && requeteActive && recherchesRecentesFiltrees.length > 0 && (
          <section style={{ marginBottom: "26px" }}>
            <div style={{ color: t1, fontSize: "14px", fontWeight: 800, marginBottom: "10px" }}>Recherches récentes</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recherchesRecentesFiltrees.map(item => (
                <LigneRecente key={cleRecherche(item)} item={item} onOuvrir={() => ouvrirRecente(item)} t1={t1} t3={t3}/>
              ))}
            </div>
          </section>
        )}

        {!committed && requeteActive && (
          <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ color: t1, fontSize: "14px", fontWeight: 800, marginBottom: "-10px" }}>Suggestions</div>

            {suggestionsCategories.length === 0 && professionnelsTrouves.length === 0 && entreprisesTrouvees.length === 0 ? (
              <button onClick={() => commit(query)} className="cc-tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", background: "none", border: "none", padding: "8px 2px", cursor: "pointer", textAlign: "left" }}>
                <span style={{ color: t3, flexShrink: 0 }}>{Ic.Search()}</span>
                <span style={{ color: t1, fontSize: "13.5px", fontWeight: 700 }}>Rechercher « {query.trim()} »</span>
              </button>
            ) : (
              <>
                {/* Profils avant les catégories (retour Bryan 09/09/2026 —
                    référence Facebook "For you") : Professionnels et
                    Entreprises visuellement différenciés (forme d'avatar +
                    préfixe explicite dans LignePro/LigneEntreprise), jamais
                    mélangés dans une même liste indifférenciée. */}
                {professionnelsTrouves.length > 0 && (
                  <div>
                    <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Professionnels</div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {professionnelsTrouves.slice(0, 4).map(p => <LignePro key={p.id} p={p} query={queryDebounced} onSelect={() => ouvrirProfessionnel(p)} t1={t1} t2={t2}/>)}
                    </div>
                  </div>
                )}

                {entreprisesTrouvees.length > 0 && (
                  <div>
                    <div style={{ color: t2, fontSize: "10.5px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px" }}>Entreprises</div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {entreprisesTrouvees.slice(0, 4).map(e => <LigneEntreprise key={e.id} e={e} query={queryDebounced} onSelect={() => ouvrirEntreprise(e)} t1={t1} t2={t2}/>)}
                    </div>
                  </div>
                )}

                {/* Sujets (catégories) — comptage réel, jamais un chiffre inventé. */}
                {suggestionsCategories.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {suggestionsCategories.map(c => {
                      const n = comptes[c] ?? 0;
                      return (
                        <button key={c} onClick={() => commitCategorie(c)} className="cc-tap" style={{ display: "flex", alignItems: "center", gap: "12px", background: "none", border: "none", padding: "8px 2px", cursor: "pointer", textAlign: "left" }}>
                          <CategorieBadge categorie={c} taille={40} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800 }}>{POST_CATEGORIE_LABELS[c]}</div>
                            <div style={{ color: t2, fontSize: "11.5px" }}>Sujet · {n} publication{n > 1 ? "s" : ""}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {committed && requeteActive && (
          chargementIndex ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[...Array(4)].map((_, i) => <div key={i} style={{ height: "56px", borderRadius: "14px", background: card2 }}/>)}
            </div>
          ) : !aDesResultats ? (
            <div style={{ textAlign: "center", padding: "24px 20px 40px" }}>
              <Image src="/illustrations/communaute-recherche-vide.png" alt="" width={1220} height={1124} style={{ width: "200px", maxWidth: "100%", height: "auto", margin: "0 auto 16px", display: "block" }}/>
              <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Aucun résultat</div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.55 }}>Rien ne correspond à « {queryDebounced.trim()} » dans Community pour l&apos;instant.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
              <div style={{ color: t2, fontSize: "12px" }}>Résultats pour « {queryDebounced.trim()} »</div>

              {categorieExacte && (
                <button onClick={() => { onApplyCategorie(categorieExacte); onClose(); }} className="cc-tap" style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: `1px solid ${brd}`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", alignSelf: "flex-start" }}>
                  <span style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: 800 }}>Voir dans le fil Communauté</span>
                  {Ic.Chev()}
                </button>
              )}

              {(ongletResultat === "tout" || ongletResultat === "publications") && publicationsTrouvees.length > 0 && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div>
                      <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Publications</div>
                      <div style={{ color: t2, fontSize: "11px", marginTop: "1px" }}>{publicationsTrouvees.length} résultat{publicationsTrouvees.length > 1 ? "s" : ""}</div>
                    </div>
                    {ongletResultat === "tout" && publicationsTrouvees.length > 3 && (
                      <button onClick={() => setOngletResultat("publications")} className="cc-tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "3px" }}>Voir tout {Ic.Chev()}</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "0 -16px" }}>
                    {(ongletResultat === "tout" ? publicationsTrouvees.slice(0, 3) : publicationsTrouvees).map(p => renderPost(p))}
                  </div>
                </section>
              )}

              {(ongletResultat === "tout" || ongletResultat === "professionnels") && professionnelsTrouves.length > 0 && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Professionnels</div>
                    {ongletResultat === "tout" && professionnelsTrouves.length > 3 && (
                      <button onClick={() => setOngletResultat("professionnels")} className="cc-tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "3px" }}>Voir tout {Ic.Chev()}</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(ongletResultat === "tout" ? professionnelsTrouves.slice(0, 3) : professionnelsTrouves).map(p => <LignePro key={p.id} p={p} query={queryDebounced} onSelect={() => ouvrirProfessionnel(p)} t1={t1} t2={t2}/>)}
                  </div>
                </section>
              )}

              {(ongletResultat === "tout" || ongletResultat === "entreprises") && entreprisesTrouvees.length > 0 && (
                <section>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>Entreprises</div>
                    {ongletResultat === "tout" && entreprisesTrouvees.length > 3 && (
                      <button onClick={() => setOngletResultat("entreprises")} className="cc-tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "3px" }}>Voir tout {Ic.Chev()}</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(ongletResultat === "tout" ? entreprisesTrouvees.slice(0, 3) : entreprisesTrouvees).map(e => <LigneEntreprise key={e.id} e={e} query={queryDebounced} onSelect={() => ouvrirEntreprise(e)} t1={t1} t2={t2}/>)}
                  </div>
                </section>
              )}
            </div>
          )
        )}

        {!committed && !requeteActive && recherchesRecentes.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Que cherchez-vous ?</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.55 }}>Un sujet, un professionnel ou une entreprise de la communauté Yelen.</div>
          </div>
        )}
      </main>
    </div>
  );
}
