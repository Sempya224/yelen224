"use client";

// Search Overlay (décision CEO 08/08/2026) — refonte complète de la
// recherche de l'écran /recherche. Au clic sur la barre de recherche
// (n'importe quel onglet), ouverture de cet overlay plein écran plutôt
// qu'un simple champ + dropdown. Structure reprise de
// components/CompteRechercheOverlay.tsx (référence explicite de Bryan,
// "les pop-ups principaux de page.ts") : position:fixed inset:0, fade-in,
// header sticky 3 colonnes avec X circulaire.
//
// Décisions actées avec Bryan avant construction (08/08/2026) :
// - "Recherches populaires" : vrai suivi construit (table recherches_populaires,
//   migration 20260808000001, API app/api/citoyen/recherche/populaire) —
//   section vide tant qu'aucune recherche réelle n'a été effectuée depuis
//   le déploiement, jamais un terme fabriqué en fallback.
// - Recherche vocale : bouton présent dans le header mais non cliquable
//   ("Bientôt disponible") — vraie intégration Web Speech reportée.
// - Correction de fautes : floue côté client (lib/rechercheFuzzy.ts,
//   Levenshtein), sur les institutions déjà chargées par cet overlay —
//   aucune migration pg_trgm.
// - Illustrations : compositions géométriques/abstraites (cercles, icônes
//   trait, couleurs déjà établies via lib/activiteVisuels.tsx) — pas de
//   personnages dessinés à la main, décision déjà actée pour le Hero
//   carrousel (même session), reconduite ici. Exception : variante
//   "aucun-resultat" — illustration Yelen dédiée depuis le 09/09/2026
//   (même décision Bryan que RechercheInner.tsx le 07/09/2026),
//   public/illustrations/recherche-overlay-aucun-resultat.png. Les 3
//   autres variantes (premiere-fois/favori-vide/historique-vide) restent
//   en SVG géométrique.
//
// Toutes les données sont réelles : institutions déjà validées (fetch
// propre à cet overlay, pas de doublon avec la grille du parent qui reste
// filtrée par les chips catégorie), offres publiées, services flattenés
// depuis institutions.services (jsonb), favoris réels, établissements
// récemment consultés (lib/institutionsRecentes.ts), recommandations
// dérivées de lib/citoyenTendances.ts (déjà calculées côté parent, passées
// en prop).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { T } from "@/lib/theme";
import { parseHoraires, isOuvertNow } from "@/lib/horaires";
import { correspondApproximativement } from "@/lib/rechercheFuzzy";
import { institutionsRecentes, type InstitutionRecente } from "@/lib/institutionsRecentes";
import { VILLES_GUINEE } from "@/lib/villes";
import {
  type Institution, type CategorieOption, type CategorieById, categorieVisuel,
  CarteInstitutionCard, InstitutionLogo, type TypeIdentite, typeIdentite, scorePertinence, parseLocalisationRequete,
} from "./shared";
import { ACTIVITE_CATEGORIE_COLORS, ACTIVITE_CATEGORIE_SHORT, ActiviteCategorieIcon } from "@/lib/activiteVisuels";

const RECENT_KEY = "yelen224_recherche_institutions_recentes";
const RECENT_MAX = 8;
const POPULAIRE_MIN_LEN = 2;

function lireRecherchesRecentes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function enregistrerRechercheRecente(q: string) {
  if (typeof window === "undefined") return;
  const propre = q.trim();
  if (propre.length < POPULAIRE_MIN_LEN) return;
  try {
    const next = [propre, ...lireRecherchesRecentes().filter(x => x.toLowerCase() !== propre.toLowerCase())].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}
function retirerRechercheRecente(q: string): string[] {
  if (typeof window === "undefined") return [];
  const next = lireRecherchesRecentes().filter(x => x !== q);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  return next;
}

type ServiceResultat = { instId: string; instName: string; instLogo: string | null; instActiviteCategorieId: string | null; nom: string; prix: number | null; duree_minutes: number | null };
type OffreResultat = { id: string; titre: string; description_courte: string | null; image_url: string | null; partenaire_nom: string | null; partenaire_logo: string | null };
type TermePopulaire = { terme_affichage: string; nb_recherches: number };

const Ic = {
  Close:  () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  CloseSm:() => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Filter: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/></svg>,
  Mic:    () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>,
  Clock:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  Trend:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Chev:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>,
};

// Illustration de section — noyau + rayons/formes géométriques, palette
// dérivée du gradient déjà associé à la catégorie/thématique plutôt qu'une
// couleur inventée. Un seul composant paramétrable pour les 4 états vides
// (loupe/carte, citoyen+étincelle, étoile vide, horloge) au lieu de 4
// fichiers séparés.
function IllustrationEtat({ variante }: { variante: "aucun-resultat" | "premiere-fois" | "favori-vide" | "historique-vide" }) {
  const commonCircle = <circle cx="60" cy="60" r="58" fill="rgba(245,166,35,0.08)"/>;
  if (variante === "aucun-resultat") {
    return (
      <Image
        src="/illustrations/recherche-overlay-aucun-resultat.png"
        alt="Aucun résultat trouvé"
        width={1536} height={1024}
        style={{ width: "180px", maxWidth: "100%", height: "auto", display: "block" }}
      />
    );
  }
  if (variante === "premiere-fois") {
    return (
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        {commonCircle}
        <circle cx="60" cy="48" r="16" fill="#F5A623"/>
        <path d="M34 92c4-18 14-26 26-26s22 8 26 26" stroke="#F5A623" strokeWidth="6" strokeLinecap="round" fill="none"/>
        <path d="M92 30l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#F5A623"/>
      </svg>
    );
  }
  if (variante === "favori-vide") {
    return (
      <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="48" fill="rgba(245,166,35,0.08)"/>
        <path d="M50 30l6.5 13.5L71 45.5l-10.5 10 2.5 14.5L50 63l-13 7 2.5-14.5L29 45.5l14.5-2z" fill="none" stroke="#F5A623" strokeWidth="2.5" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" fill="rgba(245,166,35,0.08)"/>
      <circle cx="50" cy="52" r="22" fill="none" stroke="#F5A623" strokeWidth="3.5"/>
      <path d="M50 40v13l9 6" stroke="#F5A623" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Surlignage de la correspondance recherchée en doré Yelen (retour Bryan
// 28/08/2026, capture à l'appui : "No" tapé, "Tech[no]logie" doit ressortir
// en accent). Correspondance exacte insensible à la casse uniquement —
// si le résultat vient d'une correspondance floue (typo tolérée par
// correspondApproximativement), aucun segment ne matche exactement et le
// texte reste affiché tel quel, jamais un surlignage approximatif/deviné.
function surlignerCorrespondance(texte: string, requete: string): React.ReactNode {
  const q = requete.trim();
  if (!q) return texte;
  const idx = texte.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return texte;
  return (
    <>
      {texte.slice(0, idx)}
      <span style={{ color: "#F5A623" }}>{texte.slice(idx, idx + q.length)}</span>
      {texte.slice(idx + q.length)}
    </>
  );
}

function EtatVide({ variante, titre, description, C, t2, enfants }: {
  variante: "aucun-resultat" | "premiere-fois"; titre: string; description: string;
  C: typeof T["dark"]; t2: string; enfants?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><IllustrationEtat variante={variante}/></div>
      <div style={{ color: C.text, fontSize: "15px", fontWeight: "900", marginBottom: "6px" }}>{titre}</div>
      <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.55, maxWidth: "300px", margin: "0 auto", marginBottom: enfants ? "18px" : 0 }}>{description}</div>
      {enfants}
    </div>
  );
}

export function RechercheOverlay({
  onClose, onCommitSearch, onApplyCategorie, C, citoyenId, citoyenGeoloc,
  favorisIdsSet, onToggleFavori, secteurTopLabel, citoyenVille,
}: {
  onClose: () => void;
  onCommitSearch: (query: string) => void;
  onApplyCategorie: (categoryKey: string) => void;
  C: typeof T["dark"]; isDark: boolean;
  citoyenId: string | null;
  citoyenGeoloc: { lat: number; lng: number } | null;
  favorisIdsSet: Set<string>;
  onToggleFavori: (inst: Institution) => void;
  secteurTopLabel: string | null;
  // Lot C (28/08/2026, brief Search §9) — pour la section idle "Populaires
  // près de vous", même proxy ville que RechercheInner.tsx (aucune
  // institution n'a de vraies coordonnées GPS à ce jour, voir
  // CLAUDE.md /backlog-produit).
  citoyenVille: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const t2 = C.textSubtle;
  const brd = C.borderCard;

  const [query, setQuery] = useState("");
  const [queryDebounced, setQueryDebounced] = useState("");
  const [recherchesRecentes, setRecherchesRecentes] = useState<string[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [offres, setOffres] = useState<OffreResultat[]>([]);
  const [populaires, setPopulaires] = useState<TermePopulaire[]>([]);
  const [recentesInst, setRecentesInst] = useState<InstitutionRecente[]>([]);
  const [showFiltres, setShowFiltres] = useState(false);
  const [filtreVille, setFiltreVille] = useState("");
  // Défaut "pertinence" (Lot B, 28/08/2026) — même hiérarchie que
  // RechercheInner.tsx, voir shared.tsx::scorePertinence.
  const [triPar, setTriPar] = useState<"pertinence"|"note"|"avis"|"nom">("pertinence");
  const [filtreVerifie, setFiltreVerifie] = useState(false);
  const [filtreOuvert, setFiltreOuvert] = useState(false);
  const [filtreDispo, setFiltreDispo] = useState(false);
  const [filtreFavoris, setFiltreFavoris] = useState(false);
  // Filtre Type (Lot A, 28/08/2026) — même filtre que RechercheInner.tsx,
  // dupliqué ici comme le reste du panneau filtres (déjà dupliqué entre les
  // deux fichiers, voir en-tête de fichier).
  const [filtreType, setFiltreType] = useState<TypeIdentite | "">("");
  const [chargement, setChargement] = useState(true);
  const [categories, setCategories] = useState<CategorieOption[]>([]);
  const categorieById = useMemo<CategorieById>(
    () => Object.fromEntries(categories.map(c => [c.id, { code: c.code, label: c.label }])),
    [categories]
  );

  const nbFiltresActifs = [filtreVille, filtreVerifie, filtreOuvert, filtreDispo, filtreFavoris, filtreType].filter(Boolean).length;

  // Focus + clavier immédiat à l'ouverture (retour Bryan : "le clavier
  // s'ouvre automatiquement, le curseur est directement placé").
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setRecherchesRecentes(lireRecherchesRecentes());
    setRecentesInst(institutionsRecentes());
  }, []);

  // Debounce léger (200ms) — la comparaison floue tourne sur toutes les
  // institutions déjà chargées à chaque frappe, inutile de la relancer à
  // chaque caractère tapé rapidement.
  useEffect(() => {
    const t = setTimeout(() => setQueryDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Un seul chargement à l'ouverture — institutions (toutes, non filtrées
  // par les chips catégorie de la grille sous-jacente) + offres publiées.
  // Recherche/typo-tolérance ensuite 100% côté client (lib/rechercheFuzzy.ts).
  useEffect(() => {
    (async () => {
      const [{ data: instData }, { data: offresData }, { data: popData }, { data: catData }] = await Promise.all([
        supabase.from("institutions")
          .select("id,name,category,secteur,ville,quartier,moyenne_avis,nb_avis,logo,banniere,badge_verifie,description,statut,adresse,latitude,longitude,phone,disponibilites,horaires,services,activite_categorie_id,statut_juridique,created_at")
          .eq("statut", "validee")
          .limit(300),
        supabase.from("offres")
          .select("id,titre,description_courte,image_url,partenaire_nom,partenaire_logo")
          .eq("statut", "publiee")
          .or(`date_expiration.is.null,date_expiration.gt.${new Date().toISOString()}`)
          .limit(60),
        fetch("/api/citoyen/recherche/populaire").then(r => r.ok ? r.json() : { termes: [] }).catch(() => ({ termes: [] })),
        // Chantier "Recherche & catégories" (21/08/2026) — même 15
        // catégories que RechercheInner.tsx, fetch propre à cet overlay
        // (même discipline que les institutions ci-dessus, jamais un
        // partage d'état avec le parent — voir en-tête de fichier).
        supabase.from("activite_categories").select("id,code,label").eq("actif", true).order("ordre"),
      ]);
      setInstitutions((instData as Institution[]) || []);
      setOffres((offresData as OffreResultat[]) || []);
      setPopulaires(popData?.termes || []);
      setCategories((catData as CategorieOption[]) || []);
      setChargement(false);
    })();
  }, []);

  const requeteActive = queryDebounced.trim().length > 0;

  // Résultats "Établissements" — correspondance floue sur nom/ville/secteur,
  // puis filtres avancés (vérifié/ouvert/dispo/favoris) appliqués par-dessus.
  // Localisation en langage naturel (Lot D, 28/08/2026) — même parsing que
  // RechercheInner.tsx, appliqué ici sur la comparaison floue plutôt qu'un
  // filtre SQL (cet overlay filtre 100% côté client, voir en-tête de fichier).
  const localisation = useMemo(() => parseLocalisationRequete(queryDebounced, VILLES_GUINEE), [queryDebounced]);
  const etablissementsTrouves = useMemo(() => {
    if (!requeteActive) return [];
    const termeRecherche = localisation.ville ? localisation.motsCles : queryDebounced;
    let res = termeRecherche ? institutions.filter(inst =>
      correspondApproximativement(termeRecherche, inst.name) ||
      correspondApproximativement(termeRecherche, inst.ville || "") ||
      correspondApproximativement(termeRecherche, categorieVisuel(inst, categorieById).short)
    ) : institutions.slice();
    if (localisation.ville && !filtreVille) res = res.filter(i => (i.ville || "").toLowerCase() === localisation.ville!.toLowerCase());
    if (filtreVille) res = res.filter(i => (i.ville || "").toLowerCase().includes(filtreVille.toLowerCase()));
    if (filtreVerifie) res = res.filter(i => i.badge_verifie);
    if (filtreFavoris) res = res.filter(i => favorisIdsSet.has(i.id));
    if (filtreDispo) res = res.filter(i => i.disponibilites && (Array.isArray(i.disponibilites) ? (i.disponibilites as unknown[]).length > 0 : true));
    if (filtreOuvert) res = res.filter(i => isOuvertNow(parseHoraires(i.horaires)).ouvert);
    if (filtreType) res = res.filter(i => typeIdentite(i) === filtreType);
    if (triPar === "pertinence") res.sort((a, b) => scorePertinence(b, { search: termeRecherche, citoyenGeoloc }) - scorePertinence(a, { search: termeRecherche, citoyenGeoloc }));
    else if (triPar === "note") res.sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0));
    else if (triPar === "avis") res.sort((a, b) => (b.nb_avis || 0) - (a.nb_avis || 0));
    else res.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return res;
  }, [requeteActive, queryDebounced, institutions, filtreVille, filtreVerifie, filtreFavoris, filtreDispo, filtreOuvert, filtreType, triPar, favorisIdsSet, categorieById, citoyenGeoloc, localisation]);

  // "Services" — flattening de institutions.services (jsonb), pas de table
  // dédiée (confirmé par audit). Chaque résultat pointe vers la fiche de
  // l'établissement porteur.
  const servicesTrouves = useMemo((): ServiceResultat[] => {
    if (!requeteActive) return [];
    const out: ServiceResultat[] = [];
    for (const inst of institutions) {
      const services = (inst as unknown as { services?: unknown }).services;
      if (!Array.isArray(services)) continue;
      for (const s of services as Array<{ nom?: string; prix?: number; duree_minutes?: number }>) {
        if (!s?.nom) continue;
        if (correspondApproximativement(queryDebounced, s.nom)) {
          out.push({ instId: inst.id, instName: inst.name, instLogo: inst.logo, instActiviteCategorieId: inst.activite_categorie_id ?? null, nom: s.nom, prix: s.prix ?? null, duree_minutes: s.duree_minutes ?? null });
        }
      }
    }
    return out.slice(0, 12);
  }, [requeteActive, queryDebounced, institutions]);

  const categoriesTrouvees = useMemo(() => {
    if (!requeteActive) return [];
    return categories.filter(c => correspondApproximativement(queryDebounced, ACTIVITE_CATEGORIE_SHORT[c.code] ?? c.label));
  }, [requeteActive, queryDebounced, categories]);

  const offresTrouvees = useMemo(() => {
    if (!requeteActive) return [];
    return offres.filter(o => correspondApproximativement(queryDebounced, o.titre) || (o.partenaire_nom && correspondApproximativement(queryDebounced, o.partenaire_nom)));
  }, [requeteActive, queryDebounced, offres]);

  // Recommandations — même signal que le rail "Recommandé pour vous" du
  // Hero (secteur le plus fréquenté, lib/citoyenTendances.ts côté parent),
  // dédupliquées des établissements déjà remontés dans les résultats
  // directs pour ne jamais montrer deux fois la même carte.
  const recommandations = useMemo(() => {
    if (!requeteActive || !secteurTopLabel) return [];
    const dejaVus = new Set(etablissementsTrouves.map(i => i.id));
    return institutions.filter(i => i.secteur === secteurTopLabel && !dejaVus.has(i.id)).slice(0, 6);
  }, [requeteActive, secteurTopLabel, institutions, etablissementsTrouves]);

  const favorisInsts = useMemo(() => institutions.filter(i => favorisIdsSet.has(i.id)).slice(0, 10), [institutions, favorisIdsSet]);

  // Sections de découverte de l'état idle "Que recherchez-vous ?" (Lot C,
  // 28/08/2026, brief Search §9) — mêmes signaux réels que les rails de
  // RechercheInner.tsx (§3 du chantier précédent), recalculés ici sur le
  // vivier propre à cet overlay plutôt que dupliqué depuis le parent (voir
  // en-tête de fichier : "pas de doublon avec la grille du parent").
  const idlePresDeChezVous = useMemo(() => {
    if (!citoyenVille) return [];
    return institutions.filter(i => i.ville === citoyenVille).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)).slice(0, 8);
  }, [institutions, citoyenVille]);
  const idleNouvelles = useMemo(() => [...institutions].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 8), [institutions]);
  const idleMieuxNotees = useMemo(() => [...institutions].filter(i => i.nb_avis > 0).sort((a, b) => b.moyenne_avis - a.moyenne_avis).slice(0, 8), [institutions]);
  const idleVerifiees = useMemo(() => [...institutions].filter(i => i.badge_verifie).sort((a, b) => (b.moyenne_avis || 0) - (a.moyenne_avis || 0)).slice(0, 8), [institutions]);
  const idleRecommandees = useMemo(() => {
    if (!secteurTopLabel) return [];
    return institutions.filter(i => i.secteur === secteurTopLabel).slice(0, 8);
  }, [institutions, secteurTopLabel]);

  const aDesResultats = etablissementsTrouves.length > 0 || servicesTrouves.length > 0 || categoriesTrouvees.length > 0 || offresTrouvees.length > 0 || recommandations.length > 0;
  const premiereFois = !requeteActive && recherchesRecentes.length === 0 && recentesInst.length === 0 && favorisInsts.length === 0;

  const commit = useCallback((q: string) => {
    const propre = q.trim();
    if (propre.length >= POPULAIRE_MIN_LEN) {
      enregistrerRechercheRecente(propre);
      setRecherchesRecentes(lireRecherchesRecentes());
      fetch("/api/citoyen/recherche/populaire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ terme: propre }) }).catch(() => {});
    }
    onCommitSearch(propre);
  }, [onCommitSearch]);

  const meilleuresNotes = useMemo(() => [...institutions].filter(i => i.nb_avis > 0).sort((a, b) => b.moyenne_avis - a.moyenne_avis).slice(0, 6), [institutions]);

  // Recherches récentes filtrées par ce qui est tapé (retour Bryan
  // 28/08/2026, référence capture : taper "t" garde les recherches
  // récentes contenant "t" visibles au-dessus des résultats live, plutôt
  // que de les faire disparaître dès la première lettre tapée).
  const recherchesRecentesFiltrees = useMemo(() => {
    if (!requeteActive) return [];
    const q = queryDebounced.trim().toLowerCase();
    return recherchesRecentes.filter(r => r.toLowerCase().includes(q));
  }, [requeteActive, recherchesRecentes, queryDebounced]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: C.pageBg, overflowY: "auto", animation: "rechercheOverlayFadeIn 0.2s ease", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      <style>{`
        @keyframes rechercheOverlayFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes rechercheCardUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .ro-card{animation:rechercheCardUp 0.25s ease}
        .ro-tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer;touch-action:manipulation}
        .ro-tap:active{opacity:0.7;transform:scale(0.97)}
        .ro-input{outline:none}
        .ro-input:focus{outline:none}
      `}</style>

      {/* Header — X, recherche premium, filtre avancé, micro (architecture
          prévue, non actif pour l'instant : décision Bryan 08/08/2026). */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: C.pageBg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={onClose} aria-label="Fermer" className="ro-tap" style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0, background: C.sectionAlt, border: `1px solid ${brd}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Ic.Close()}
          </button>
          {/* Taille alignée sur la barre pilule façon Facebook de
              ChercherCommunauteOverlay.tsx (retour Bryan 09/09/2026) —
              même padding/radius/police, pas de bordure colorée au focus. */}
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#F5A623", pointerEvents: "none" }}>{Ic.Search()}</div>
            <input
              ref={inputRef}
              className="ro-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commit(query); }}
              placeholder="Institution, service, ville…"
              style={{ width: "100%", background: C.sectionAlt, border: "none", borderRadius: "22px", padding: "12px 38px 12px 40px", fontSize: "14.5px", color: C.text, fontWeight: 500, boxSizing: "border-box" }}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Effacer" className="ro-tap" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "50%", background: C.borderCard, border: "none", color: t2, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>{Ic.CloseSm()}</button>
            )}
          </div>
          <button onClick={() => setShowFiltres(v => !v)} aria-label="Filtres avancés" className="ro-tap" style={{ width: "36px", height: "36px", borderRadius: "12px", flexShrink: 0, background: nbFiltresActifs > 0 ? "#F5A623" : C.sectionAlt, border: `1px solid ${brd}`, color: nbFiltresActifs > 0 ? "#080812" : C.text, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            {Ic.Filter()}
            {nbFiltresActifs > 0 && <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "14px", height: "14px", borderRadius: "50%", background: "#080812", color: "#F5A623", fontSize: "8px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${C.pageBg}` }}>{nbFiltresActifs}</span>}
          </button>
          <button disabled aria-label="Recherche vocale — bientôt disponible" title="Bientôt disponible" className="ro-tap" style={{ width: "36px", height: "36px", borderRadius: "12px", flexShrink: 0, background: C.sectionAlt, border: `1px solid ${brd}`, color: t2, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5, cursor: "default" }}>
            {Ic.Mic()}
          </button>
        </div>

        {showFiltres && (
          <div style={{ margin: "0 16px 12px", background: C.cardBg, border: "1px solid rgba(245,166,35,0.12)", borderRadius: "16px", padding: "16px", animation: "slideDown 0.2s ease" }}>
            <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Filtres avancés</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
              <div>
                <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>Ville</div>
                <select value={filtreVille} onChange={e => setFiltreVille(e.target.value)} style={{ width: "100%", padding: "9px 10px", background: C.sectionAlt, border: `1px solid ${brd}`, borderRadius: "10px", fontSize: "12px", color: C.text, fontWeight: "600" }}>
                  <option value="">Toutes les villes</option>
                  {VILLES_GUINEE.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>Trier par</div>
                <select value={triPar} onChange={e => setTriPar(e.target.value as "pertinence"|"note"|"avis"|"nom")} style={{ width: "100%", padding: "9px 10px", background: C.sectionAlt, border: `1px solid ${brd}`, borderRadius: "10px", fontSize: "12px", color: C.text, fontWeight: "600" }}>
                  <option value="pertinence">Pertinence</option>
                  <option value="note">Meilleure note</option>
                  <option value="avis">Plus d&apos;avis</option>
                  <option value="nom">Alphabétique</option>
                </select>
              </div>
            </div>
            {/* Filtre Type — même chips que RechercheInner.tsx (Lot A, 28/08/2026) */}
            <div style={{ marginBottom: "10px" }}>
              <div style={{ color: t2, fontSize: "9px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {([
                  { k: "", l: "Tous" },
                  { k: "institution", l: "Institutions" },
                  { k: "entreprise", l: "Entreprises" },
                  { k: "profession", l: "Professionnels" },
                ] as { k: TypeIdentite | ""; l: string }[]).map(opt => (
                  <button key={opt.k || "tous"} onClick={() => setFiltreType(opt.k)} className="ro-tap" style={{ padding: "7px 12px", borderRadius: "20px", border: `1px solid ${filtreType === opt.k ? "#F5A623" : brd}`, background: C.sectionAlt, color: filtreType === opt.k ? "#F5A623" : t2, fontSize: "11px", fontWeight: filtreType === opt.k ? "800" : "600", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { label: "Institutions vérifiées uniquement", val: filtreVerifie, set: () => setFiltreVerifie(v => !v), path: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
                { label: "Ouvert maintenant", val: filtreOuvert, set: () => setFiltreOuvert(v => !v), path: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
                { label: "Avec créneaux disponibles", val: filtreDispo, set: () => setFiltreDispo(v => !v), path: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
                { label: "Mes favoris uniquement", val: filtreFavoris, set: () => setFiltreFavoris(v => !v), path: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" },
              ].map(f => (
                <button key={f.label} onClick={f.set} className="ro-tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: C.sectionAlt, border: `1px solid ${f.val ? "#F5A623" : brd}`, borderRadius: "10px", cursor: "pointer" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "5px", background: f.val ? "#F5A623" : "transparent", border: `2px solid ${f.val ? "#F5A623" : brd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                    {f.val && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={f.val ? "#F5A623" : t2} strokeWidth="2" strokeLinecap="round"><path d={f.path}/></svg>
                  <span style={{ color: f.val ? C.text : t2, fontSize: "12px", fontWeight: f.val ? "700" : "500", flex: 1, textAlign: "left" }}>{f.label}</span>
                </button>
              ))}
            </div>
            {nbFiltresActifs > 0 && (
              <button onClick={() => { setFiltreVille(""); setFiltreVerifie(false); setFiltreOuvert(false); setFiltreDispo(false); setFiltreFavoris(false); setFiltreType(""); }} className="ro-tap" style={{ width: "100%", marginTop: "10px", padding: "9px", background: "none", border: "1px dashed rgba(245,166,35,0.2)", borderRadius: "10px", color: t2, fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>
                Réinitialiser ({nbFiltresActifs} filtre{nbFiltresActifs > 1 ? "s" : ""})
              </button>
            )}
          </div>
        )}
      </div>

      <main style={{ padding: "16px 16px 60px" }}>
        {chargement ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[...Array(4)].map((_, i) => <div key={i} style={{ height: "64px", borderRadius: "16px", background: C.sectionAlt }} className="skel"/>)}
          </div>
        ) : requeteActive ? (
          !aDesResultats ? (
            <EtatVide
              variante="aucun-resultat" C={C} t2={t2}
              titre="C'est tout pour cette recherche"
              description={`Nous n'avons trouvé aucun établissement correspondant à « ${queryDebounced.trim()} ».`}
              enfants={
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "260px", margin: "0 auto" }}>
                    <button onClick={() => setQuery("")} className="ro-tap" style={{ padding: "11px", borderRadius: "12px", border: "none", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "13px" }}>Explorer les catégories</button>
                    {meilleuresNotes.length > 0 && (
                      <button onClick={() => commit("")} className="ro-tap" style={{ padding: "11px", borderRadius: "12px", border: `1px solid ${brd}`, background: "none", color: C.text, fontWeight: "700", fontSize: "13px" }}>Voir les établissements populaires</button>
                    )}
                  </div>
                  {/* CTA illustré (décision Bryan 09/09/2026) — même action
                      que "Explorer les catégories" ci-dessus (setQuery("")
                      révèle l'état idle, où la grille Catégories est
                      affichée en dernier, voir plus bas dans ce fichier),
                      juste une porte d'entrée visuelle plus grande vers le
                      même endroit. */}
                  <button onClick={() => setQuery("")} className="ro-tap" style={{ display: "block", width: "100%", border: "none", background: "none", padding: 0, marginTop: "20px", borderRadius: "20px", overflow: "hidden", cursor: "pointer" }}>
                    <Image
                      src="/illustrations/recherche-explorer-categories-cta.png"
                      alt="Explorer les catégories"
                      width={1536} height={1024}
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                  </button>
                </>
              }
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
              {recherchesRecentesFiltrees.length > 0 && (
                <section>
                  <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "10px" }}>Recherches récentes</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {recherchesRecentesFiltrees.map(q => (
                      <div key={q} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 2px" }}>
                        <span style={{ color: t2, flexShrink: 0 }}>{Ic.Clock()}</span>
                        <button onClick={() => commit(q)} className="ro-tap" style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: C.text, fontSize: "13.5px", fontWeight: "600", cursor: "pointer", padding: 0 }}>{surlignerCorrespondance(q, queryDebounced)}</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {etablissementsTrouves.length > 0 && (
                <SectionResultats titre="Établissements" C={C} t2={t2} onVoirTout={() => commit(query)} labelVoirTout="Voir tout">
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {etablissementsTrouves.slice(0, 6).map(inst => (
                      <div key={inst.id} className="ro-card"><CarteInstitutionCard inst={inst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => { commit(query); window.location.href = `/institution/${inst.id}?source=yelen_search`; }} categorieById={categorieById}/></div>
                    ))}
                  </div>
                </SectionResultats>
              )}

              {servicesTrouves.length > 0 && (
                <SectionResultats titre="Services" C={C} t2={t2}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {servicesTrouves.map((s, i) => (
                      <a key={`${s.instId}-${i}`} href={`/institution/${s.instId}?source=yelen_search`} onClick={() => commit(query)} className="ro-tap ro-card" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: C.cardBg, borderRadius: "14px", textDecoration: "none" }}>
                        <InstitutionLogo inst={{ id: s.instId, name: s.instName, activite_categorie_id: s.instActiviteCategorieId, logo: s.instLogo } as Institution} size={38} categorieById={categorieById}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nom}</div>
                          <div style={{ color: t2, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.instName}{s.duree_minutes ? ` · ${s.duree_minutes} min` : ""}</div>
                        </div>
                        {s.prix != null && <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: "800", flexShrink: 0 }}>{s.prix.toLocaleString("fr-FR")} GNF</div>}
                      </a>
                    ))}
                  </div>
                </SectionResultats>
              )}

              {categoriesTrouvees.length > 0 && (
                <SectionResultats titre="Catégories" C={C} t2={t2} onVoirTout={() => onApplyCategorie(categoriesTrouvees[0].code)} labelVoirTout="Explorer">
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {categoriesTrouvees.map(cat => (
                      <button key={cat.id} onClick={() => onApplyCategorie(cat.code)} className="ro-tap ro-card" style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", borderRadius: "20px", border: `1px solid ${brd}`, background: C.cardBg, cursor: "pointer" }}>
                        <ActiviteCategorieIcon code={cat.code} color="#F5A623" size={14}/>
                        <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "800" }}>{surlignerCorrespondance(ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label, queryDebounced)}</span>
                      </button>
                    ))}
                  </div>
                </SectionResultats>
              )}

              {/* Localisation (retour Bryan 28/08/2026) — confirmation
                  visible qu'une vraie préfecture (lib/villes.ts) a été
                  reconnue dans la requête ("Dabola", "Hôtel à Dabola"), même
                  logique que RechercheInner.tsx/fetchInstitutions. Les
                  résultats "Établissements" ci-dessus sont déjà filtrés par
                  cette ville (voir etablissementsTrouves) — ce chip rend le
                  filtre explicite/persistant (setFiltreVille) plutôt que de
                  rester une déduction invisible. */}
              {localisation.ville && (
                <SectionResultats titre="Localisation" C={C} t2={t2}>
                  <button onClick={() => setFiltreVille(localisation.ville!)} className="ro-tap ro-card" style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", borderRadius: "20px", border: `1px solid ${brd}`, background: C.cardBg, cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: "800" }}>{localisation.ville}</span>
                  </button>
                </SectionResultats>
              )}

              {offresTrouvees.length > 0 && (
                <SectionResultats titre="Offres" C={C} t2={t2}>
                  <div className="no-scroll" style={{ overflowX: "auto" }}>
                    <div style={{ display: "flex", gap: "10px", width: "max-content" }}>
                      {offresTrouvees.slice(0, 8).map(o => (
                        <a key={o.id} href={`/offres/${o.id}`} className="ro-tap ro-card" style={{ width: "180px", flexShrink: 0, textDecoration: "none", background: C.cardBg, borderRadius: "16px", overflow: "hidden" }}>
                          {o.image_url && <div style={{ height: "90px", position: "relative", background: C.sectionAlt }}><Image src={o.image_url} alt="" fill sizes="180px" style={{ objectFit: "cover" }}/></div>}
                          <div style={{ padding: "10px" }}>
                            <div style={{ color: C.text, fontSize: "12.5px", fontWeight: "800", lineHeight: 1.3, marginBottom: "4px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{o.titre}</div>
                            {o.partenaire_nom && <div style={{ color: t2, fontSize: "10.5px" }}>{o.partenaire_nom}</div>}
                            <div style={{ marginTop: "8px", color: "#F5A623", fontSize: "11px", fontWeight: "800" }}>Découvrir →</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </SectionResultats>
              )}

              {recommandations.length > 0 && (
                <SectionResultats titre="Recommandations" sousTitre={secteurTopLabel ? `Basé sur vos rendez-vous en ${secteurTopLabel.toLowerCase()}` : undefined} C={C} t2={t2}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {recommandations.map(inst => (
                      <div key={inst.id} className="ro-card"><CarteInstitutionCard inst={inst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => { commit(query); window.location.href = `/institution/${inst.id}?source=yelen_search`; }} categorieById={categorieById}/></div>
                    ))}
                  </div>
                </SectionResultats>
              )}
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
            {/* Bandeau "Que recherchez-vous ?" (Lot C, 28/08/2026, brief
                Search §9) — n'occulte plus les sections de découverte
                ci-dessous (comportement précédent : premiereFois cachait
                Catégories/rails, contraire au brief qui veut Catégories +
                rails visibles dès l'ouverture de Search, même pour un
                citoyen sans historique). Simple bandeau d'accueil, pas un
                état exclusif. */}
            {premiereFois && (
              <div style={{ textAlign: "center", padding: "8px 4px 0" }}>
                <div style={{ color: C.text, fontSize: "15px", fontWeight: "900", marginBottom: "4px" }}>Que recherchez-vous ?</div>
                <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>Une institution, un service, une entreprise ou un professionnel.</div>
              </div>
            )}
            {recherchesRecentes.length > 0 && (
              <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>Recherches récentes</div>
                  <button onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecherchesRecentes([]); }} className="ro-tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: 0 }}>Tout effacer</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {recherchesRecentes.map(q => (
                    <div key={q} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 2px" }}>
                      <span style={{ color: t2, flexShrink: 0 }}>{Ic.Clock()}</span>
                      <button onClick={() => { setQuery(q); }} className="ro-tap" style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: C.text, fontSize: "13.5px", fontWeight: "600", cursor: "pointer", padding: 0 }}>{q}</button>
                      <button onClick={() => setRecherchesRecentes(retirerRechercheRecente(q))} aria-label="Retirer" className="ro-tap" style={{ background: "none", border: "none", color: t2, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>{Ic.CloseSm()}</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {populaires.length > 0 && (
              <section>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "10px" }}>Recherches populaires</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {populaires.map(p => (
                    <button key={p.terme_affichage} onClick={() => setQuery(p.terme_affichage)} className="ro-tap" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "20px", border: `1px solid ${brd}`, background: C.cardBg, cursor: "pointer" }}>
                      <span style={{ color: "#F5A623" }}>{Ic.Trend()}</span>
                      <span style={{ color: C.text, fontSize: "12.5px", fontWeight: "700" }}>{p.terme_affichage}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {recentesInst.length > 0 && (
              <section>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "10px" }}>Récemment consultés</div>
                <div className="no-scroll" style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", gap: "10px", width: "max-content" }}>
                    {recentesInst.map(inst => (
                      <a key={inst.id} href={`/institution/${inst.id}?source=yelen_search`} className="ro-tap" style={{ width: "84px", flexShrink: 0, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                        <InstitutionLogo inst={inst as unknown as Institution} size={56} categorieById={categorieById}/>
                        <span style={{ color: C.text, fontSize: "10.5px", fontWeight: "700", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{inst.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Sections de découverte idle (Lot C, 28/08/2026, brief Search
                §9) — ordre : Populaires près de vous → Nouveau sur Yelen →
                Les mieux notées → Vérifiés → Recommandé pour vous. Jamais
                affichées vides, même horizontal scroll compact que les
                autres rails du produit (CarteInstitutionCard hideCover). */}
            {[
              { titre: "Populaires près de vous", sousTitre: citoyenVille ? `À ${citoyenVille}` : undefined, items: idlePresDeChezVous },
              { titre: "Nouveau sur Yelen", items: idleNouvelles },
              { titre: "Les mieux notées", items: idleMieuxNotees },
              { titre: "Établissements vérifiés", sousTitre: "Identité et activité confirmées par Yelen", items: idleVerifiees },
              { titre: "Recommandé pour vous", sousTitre: secteurTopLabel ? `Basé sur vos rendez-vous en ${secteurTopLabel.toLowerCase()}` : undefined, items: idleRecommandees },
            ].filter(s => s.items.length > 0).map(s => (
              <section key={s.titre}>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>{s.titre}</div>
                {s.sousTitre && <div style={{ color: t2, fontSize: "11px", marginTop: "1px", marginBottom: "10px" }}>{s.sousTitre}</div>}
                <div className="no-scroll" style={{ overflowX: "auto", marginTop: s.sousTitre ? 0 : "10px" }}>
                  <div style={{ display: "flex", gap: "10px", width: "max-content" }}>
                    {s.items.map(inst => (
                      <div key={inst.id} style={{ width: "260px", flexShrink: 0 }}>
                        <CarteInstitutionCard inst={inst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} hideCover estFavori={favorisIdsSet.has(inst.id)} onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => { window.location.href = `/institution/${inst.id}?source=yelen_search`; }} categorieById={categorieById}/>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}

            {favorisInsts.length > 0 && (
              <section>
                <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "10px" }}>Vos favoris</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {favorisInsts.slice(0, 4).map(inst => (
                    <CarteInstitutionCard key={inst.id} inst={inst} C={C} t2={t2} citoyenGeoloc={citoyenGeoloc} estFavori onToggleFavori={e => { e.stopPropagation(); onToggleFavori(inst); }} onSelect={() => { window.location.href = `/institution/${inst.id}?source=yelen_search`; }} categorieById={categorieById}/>
                  ))}
                </div>
              </section>
            )}

            {/* Catégories — déplacées en toute fin de l'état idle (retour
                Bryan 28/08/2026 : les rails de contenu réel doivent primer,
                la grille de catégories reste utile mais en dernier recours,
                pas la première chose vue en ouvrant Search). */}
            <section>
              <div style={{ color: C.text, fontSize: "14px", fontWeight: "800", marginBottom: "10px" }}>Catégories</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                {categories.map(cat => {
                  const color = ACTIVITE_CATEGORIE_COLORS[cat.code] ?? "#9C9CA8";
                  return (
                    <button key={cat.id} onClick={() => onApplyCategorie(cat.code)} className="ro-tap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "16px 8px", borderRadius: "16px", border: `1px solid ${brd}`, background: C.cardBg, cursor: "pointer" }}>
                      <div style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ActiviteCategorieIcon code={cat.code} color={color} size={22}/>
                      </div>
                      <span style={{ color: C.text, fontSize: "11.5px", fontWeight: "800", textAlign: "center" }}>{ACTIVITE_CATEGORIE_SHORT[cat.code] ?? cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {!citoyenId && (
              <div style={{ textAlign: "center", padding: "8px 20px", color: t2, fontSize: "11.5px", lineHeight: 1.5 }}>
                Connectez-vous pour retrouver vos favoris et vos recommandations personnalisées.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SectionResultats({ titre, sousTitre, onVoirTout, labelVoirTout, C, t2, children }: {
  titre: string; sousTitre?: string; onVoirTout?: () => void; labelVoirTout?: string;
  C: typeof T["dark"]; t2: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
        <div>
          <div style={{ color: C.text, fontSize: "14px", fontWeight: "800" }}>{titre}</div>
          {sousTitre && <div style={{ color: t2, fontSize: "11px", marginTop: "1px" }}>{sousTitre}</div>}
        </div>
        {onVoirTout && (
          <button onClick={onVoirTout} className="ro-tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: 0, flexShrink: 0, display: "flex", alignItems: "center", gap: "3px" }}>
            {labelVoirTout} {Ic.Chev()}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
