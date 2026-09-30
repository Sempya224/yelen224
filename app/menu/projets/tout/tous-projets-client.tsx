"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen, ScrollPositionBarConteneur } from "@/components/CompteEcranVide";
import { PullToRefresh } from "@/components/PullToRefresh";
import { YelenLoader } from "@/components/YelenLoader";
import { ACTIVITE_CATEGORIE_SHORT } from "@/lib/activiteVisuels";
import {
  type Projet, type StatutProjet, type CategorieId, STATUT_LABEL, formatDateCourt, ProjetCarte, IllustrationProjetVide,
} from "../projets-client";

// "Tous les projets" — refonte centre de gestion (brief Bryan 28/09/2026,
// suite du Lot 1-3 "Mes projets"). Rôle distinct de l'écran principal :
// pas une répétition de la carte "À continuer" de l'accueil, mais l'espace
// où parcourir/filtrer/rechercher/gérer l'intégralité des projets.
//
// Lot 2 (retour Bryan) — le filtre secondaire n'est plus une carte injectée
// dans le contenu (casse la hiérarchie de l'écran) mais un vrai Bottom
// Sheet iOS (FiltreProjetsSheet ci-dessous), même famille de pattern que la
// fiche établissement de RechercheInner.tsx (fixed+flex-end+backdrop). Les
// filtres rapides du haut (Tout/À préparer/Planifié/En cours) s'appliquent
// immédiatement ; le sheet (Statut complet/Catégorie multi/Date cible/
// Progression/Tri) fonctionne en brouillon — rien n'est appliqué à l'écran
// tant que "Voir N projets" n'est pas confirmé, fermer par X/backdrop
// annule le brouillon. "+ Nouveau projet" relayé vers l'écran principal via
// `?nouveau=1` (voir projets-client.tsx) plutôt que de dupliquer tout le
// formulaire de création ici.

const STATUTS_ORDRE: StatutProjet[] = ["a_preparer", "planifie", "en_cours", "en_attente", "termine", "archive"];
// Raccourcis visibles en permanence en haut de l'écran (retour Bryan :
// "ne pas confondre filtre et navigation") — le reste des statuts
// (en_attente/termine/archive) reste accessible via la section Statut du
// Bottom Sheet uniquement.
const STATUT_RACCOURCIS: readonly StatutProjet[] = ["a_preparer", "planifie", "en_cours"];

type GroupeId = "continuer" | "a_venir" | "attente" | "termines" | "archives";
const GROUPES: { id: GroupeId; label: string; statuts: StatutProjet[] }[] = [
  { id: "continuer", label: "À continuer", statuts: ["a_preparer", "en_cours"] },
  { id: "a_venir",   label: "À venir",     statuts: ["planifie"] },
  { id: "attente",   label: "En attente",  statuts: ["en_attente"] },
  { id: "termines",  label: "Terminés",    statuts: ["termine"] },
  { id: "archives",  label: "Archivés",    statuts: ["archive"] },
];

type DateOption = "semaine" | "mois" | "30j" | "plus_tard" | "sans_date";
const DATE_OPTIONS: { val: DateOption; label: string }[] = [
  { val: "semaine",   label: "Cette semaine" },
  { val: "mois",      label: "Ce mois-ci" },
  { val: "30j",       label: "Les 30 prochains jours" },
  { val: "plus_tard", label: "Plus tard" },
  { val: "sans_date", label: "Sans date" },
];
// "Cette semaine" inclut volontairement les dates dépassées (échéance en
// retard = le plus urgent à voir) — simplification documentée plutôt qu'un
// 6e bucket "En retard" non demandé par le brief. "avant" (date choisie via
// le vrai sélecteur de date, cf. FiltreProjetsSheet) est géré à part : tant
// qu'aucune date n'est choisie, il ne filtre rien (pas de faux "0 résultat"
// pendant que l'utilisateur ouvre le picker).
function correspondDate(p: Projet, dateOpt: DateOption | "avant" | null, avantValue: string | null): boolean {
  if (!dateOpt) return true;
  if (dateOpt === "avant") {
    if (!avantValue) return true;
    if (!p.date_cible) return false;
    return new Date(p.date_cible).getTime() <= new Date(avantValue).getTime();
  }
  if (dateOpt === "sans_date") return !p.date_cible;
  if (!p.date_cible) return false;
  const cible = new Date(p.date_cible);
  const now = new Date();
  const jourCible = new Date(cible.getFullYear(), cible.getMonth(), cible.getDate()).getTime();
  const jourNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffJours = Math.round((jourCible - jourNow) / 86400000);
  if (dateOpt === "semaine") return diffJours <= 7;
  if (dateOpt === "mois") return cible.getFullYear() === now.getFullYear() && cible.getMonth() === now.getMonth();
  if (dateOpt === "30j") return diffJours >= 0 && diffJours <= 30;
  return diffJours > 30; // plus_tard
}

// Labels distincts du statut (retour Bryan : "éviter le doublon conceptuel
// avec le statut") — "Aucun avancement" plutôt que "Non commencé" (déjà le
// sens de "À préparer"), "Toutes les étapes terminées" plutôt que "Terminé"
// (déjà le sens du statut "Terminé"). Un projet sans étape est rangé dans
// "Aucun avancement", jamais affiché comme "0 %" (déjà le comportement de
// ProjetCarte::champsProjet, qui ne calcule une barre que si total > 0).
type ProgressionBucket = "non_commence" | "en_cours" | "termine";
const PROGRESSION_OPTIONS: { val: ProgressionBucket; label: string }[] = [
  { val: "non_commence", label: "Aucun avancement" },
  { val: "en_cours",     label: "En cours" },
  { val: "termine",      label: "Toutes les étapes terminées" },
];
function bucketProgression(p: Projet): ProgressionBucket {
  const total = p.etapes.length;
  if (total === 0) return "non_commence";
  const fait = p.etapes.filter((e) => e.fait).length;
  if (fait === total) return "termine";
  if (fait === 0) return "non_commence";
  return "en_cours";
}

type TriOption = "pertinence" | "date_proche" | "date_eloignee" | "modif" | "creation" | "progression";
const TRI_OPTIONS: { val: TriOption; label: string }[] = [
  { val: "pertinence",    label: "Pertinence" },
  { val: "date_proche",   label: "Date cible — la plus proche" },
  { val: "date_eloignee", label: "Date cible — la plus éloignée" },
  { val: "modif",         label: "Dernière modification" },
  { val: "creation",      label: "Date de création" },
  { val: "progression",   label: "Progression" },
];
// "Pertinence"/"Dernière modification" ne re-trient pas : la requête charge
// déjà par mis_a_jour_le décroissant (voir `charger`), les deux options
// pointent donc volontairement vers le même ordre plutôt qu'un tri dupliqué.
function trierProjets(liste: Projet[], tri: TriOption): Projet[] {
  if (tri === "pertinence" || tri === "modif") return liste;
  const copie = [...liste];
  if (tri === "creation") return copie.sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (tri === "date_proche") return copie.sort((a, b) => (!a.date_cible ? 1 : !b.date_cible ? -1 : a.date_cible.localeCompare(b.date_cible)));
  if (tri === "date_eloignee") return copie.sort((a, b) => (!a.date_cible ? 1 : !b.date_cible ? -1 : b.date_cible.localeCompare(a.date_cible)));
  const ratio = (p: Projet) => (p.etapes.length === 0 ? 0 : p.etapes.filter((e) => e.fait).length / p.etapes.length);
  return copie.sort((a, b) => ratio(b) - ratio(a));
}

type FiltresProjets = {
  statut: StatutProjet | "tout";
  categories: Set<CategorieId>;
  dateOpt: DateOption | "avant" | null;
  avantValue: string | null;
  progression: ProgressionBucket | null;
  tri: TriOption;
};
function filtresParDefaut(): FiltresProjets {
  return { statut: "tout", categories: new Set(), dateOpt: null, avantValue: null, progression: null, tri: "pertinence" };
}
function correspond(p: Projet, f: FiltresProjets): boolean {
  if (f.statut !== "tout" && p.statut !== f.statut) return false;
  if (f.categories.size > 0 && !(p.secteur && f.categories.has(p.secteur))) return false;
  if (!correspondDate(p, f.dateOpt, f.avantValue)) return false;
  if (f.progression && bucketProgression(p) !== f.progression) return false;
  return true;
}

// Texte de recherche — couvre plus que le titre (retour Bryan) : catégorie,
// statut, prochaine étape non cochée, besoin, lieu, description.
function texteRecherche(p: Projet): string {
  const secteurLabel = p.secteur ? ACTIVITE_CATEGORIE_SHORT[p.secteur] ?? "" : "";
  const prochaine = [...p.etapes].filter((e) => !e.fait).sort((a, b) => a.ordre - b.ordre)[0]?.libelle ?? "";
  return [p.titre, p.description ?? "", secteurLabel, STATUT_LABEL[p.statut], prochaine, p.besoin ?? "", p.lieu ?? ""].join(" ").toLowerCase();
}

function pillStyle(actif: boolean, chipBg: string, t1: string, brd: string): React.CSSProperties {
  return { padding: "7px 13px", borderRadius: "20px", border: `1px solid ${actif ? "transparent" : brd}`, background: actif ? "#F5A623" : chipBg, color: actif ? "#080812" : t1, fontSize: "11.5px", fontWeight: actif ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap" };
}

// Résumé lisible des filtres actifs — utilisé à la fois par le sheet Filtrer
// (aperçu du brouillon) et par le sheet Aide (contexte auto-capturé envoyé
// avec un feedback, cf. libellesFiltresActifs(filtres) plus bas).
function libellesFiltresActifs(f: FiltresProjets): string[] {
  const resume: string[] = [];
  if (f.statut !== "tout") resume.push(STATUT_LABEL[f.statut]);
  if (f.categories.size === 1) resume.push(ACTIVITE_CATEGORIE_SHORT[[...f.categories][0]] ?? "");
  else if (f.categories.size > 1) resume.push(`${f.categories.size} catégories`);
  if (f.dateOpt === "avant" && f.avantValue) resume.push(`Avant le ${formatDateCourt(f.avantValue)}`);
  else if (f.dateOpt && f.dateOpt !== "avant") resume.push(DATE_OPTIONS.find((o) => o.val === f.dateOpt)?.label ?? "");
  if (f.progression) resume.push(PROGRESSION_OPTIONS.find((o) => o.val === f.progression)?.label ?? "");
  if (f.tri !== "pertinence") resume.push(TRI_OPTIONS.find((o) => o.val === f.tri)?.label ?? "");
  return resume;
}

const P = { pointerEvents: "none" as const };
const Ic = {
  Search: () => <svg style={P} width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  Close:  () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Filter: () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none"/></svg>,
  Plus:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  // Même empreinte (21x21) que Search pour rester aligné dans le header
  // (retour Bryan : "? reste discret, mais toujours accessible").
  Aide:   () => <span style={{ ...P, fontSize: "19px", fontWeight: 800, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "21px", height: "21px" }}>?</span>,
  Sparkle: () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m14.5 9.5-2 5-5 2 2-5 5-2Z"/></svg>,
  Wrench:  () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2-2z"/></svg>,
  ChevL:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  ChevR:   () => <svg style={P} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>,
};

function RechercheProjetsOverlay({ projets, isDark, onClose, onOpen }: {
  projets: Projet[]; isDark: boolean; onClose: () => void; onOpen: (p: Projet) => void;
}) {
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombreCard = isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)";
  const scrollRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const resultats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return projets.filter((p) => texteRecherche(p).includes(q));
  }, [projets, query]);

  return (
    <div ref={scrollRef} style={{ position: "fixed", inset: 0, zIndex: 400, backgroundColor: bg, overflowY: "auto", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <ScrollPositionBarConteneur isDark={isDark} conteneurRef={scrollRef} variant="fixed"/>
      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)" }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <span/>
          <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Rechercher</div>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><Ic.Close/></button>
        </div>
      </header>
      <main style={{ padding: "16px 16px 40px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ position: "relative", marginBottom: "18px" }}>
          <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: t3, pointerEvents: "none" }}><Ic.Search/></div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Un projet, une étape, une catégorie…"
            autoFocus
            className="tp-search-input"
            style={{ width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fff", border: "none", borderRadius: "22px", padding: "12px 38px 12px 40px", color: t1, fontSize: "14.5px", fontWeight: 500, boxSizing: "border-box" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="tap" aria-label="Effacer" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", padding: 0 }}><Ic.Close/></button>
          )}
        </div>

        {query.trim().length === 0 ? (
          <div style={{ color: t2, fontSize: "12.5px", textAlign: "center", padding: "24px 12px" }}>Cherchez parmi tous vos projets.</div>
        ) : resultats.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}><IllustrationProjetVide size={56}/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "4px" }}>Aucun résultat</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>Aucun projet ne correspond à « {query.trim()} ».</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {resultats.map((p) => (
              <ProjetCarte key={p.id} p={p} isDark={isDark} card={card} brd={brd} t1={t1} t2={t2} t3={t3} ombreCard={ombreCard} onOpen={onOpen}/>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// "?" — mini Help Center contextuel + feedback produit (retour Bryan
// 28/09/2026). Rôle plus large que le "?" de "Nouveau projet" : explique
// l'écran ET ouvre une porte de feedback structuré. Reste néanmoins
// strictement distinct du Support Yelen (assistance/problème à traiter) —
// "Il manque quelque chose" ne part donc jamais vers la Messagerie support,
// uniquement vers citoyen_feedback (même table que /compte/feedback,
// étendue avec `type`/`contexte`, migration 20260928000004). Jamais ouvert
// automatiquement à l'arrivée sur l'écran — uniquement sur tap du "?".
type FeedbackType = "ne_fonctionne_pas" | "incomprehensible" | "manque" | "difficile" | "idee" | "autre";
const FEEDBACK_CHOIX: { val: FeedbackType; label: string }[] = [
  { val: "ne_fonctionne_pas", label: "Quelque chose ne fonctionne pas" },
  { val: "incomprehensible",  label: "Je ne comprends pas cette fonctionnalité" },
  { val: "manque",            label: "Il manque quelque chose" },
  { val: "difficile",         label: "C'est difficile à utiliser" },
  { val: "idee",              label: "J'ai une idée d'amélioration" },
  { val: "autre",             label: "Autre" },
];
// Deux questions pour "ne fonctionne pas" (ce qui s'est passé + ce que
// l'utilisateur voulait faire) donnent bien plus de valeur qu'un "ça ne
// marche pas" — concaténées dans l'unique colonne `message` de
// citoyen_feedback plutôt que d'ajouter 2 colonnes pour un seul type parmi 6.
function composerMessageFeedback(type: FeedbackType, champ1: string, champ2: string): string {
  if (type === "ne_fonctionne_pas") return `Que s'est-il passé ?\n${champ1.trim()}\n\nQue vouliez-vous faire ?\n${champ2.trim()}`;
  if (type === "manque") return `Qu'aimeriez-vous pouvoir faire ?\n${champ1.trim()}`;
  return champ1.trim();
}

const EXPLICATIONS_ECRAN = [
  { titre: "Vos projets", texte: "Retrouvez ici tout ce que vous préparez, planifiez ou avez terminé." },
  { titre: "Filtres",     texte: "Utilisez les filtres pour retrouver rapidement les projets correspondant à un statut, une catégorie, une date ou une progression." },
  { titre: "Recherche",   texte: "Recherchez directement un projet, une étape ou une catégorie." },
];

type ContexteEcran = { ecran: string; section: string; filtresActifs: string[]; nombreProjetsAffiches: number };
type VueAide = "aide" | "choix" | "detail" | "merci";

function AideEtFeedbackSheet({ isDark, contexte, onFermer, onCreerProjet, onLaisserYelenAider }: {
  isDark: boolean; contexte: ContexteEcran; onFermer: () => void; onCreerProjet: () => void; onLaisserYelenAider: () => void;
}) {
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const chipBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const [vue, setVue] = useState<VueAide>("aide");
  const [type, setType] = useState<FeedbackType | null>(null);
  const [champ1, setChamp1] = useState("");
  const [champ2, setChamp2] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const messageActuel = type ? composerMessageFeedback(type, champ1, champ2) : "";
  const formValide = messageActuel.trim().length >= 10;

  function choisirType(t: FeedbackType) {
    setType(t); setChamp1(""); setChamp2(""); setErreur(null); setVue("detail");
  }

  async function envoyerFeedback() {
    if (!type || !formValide) return;
    setErreur(null);
    setEnvoi(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setErreur("Session expirée, reconnectez-vous."); setEnvoi(false); return; }
    const form = new FormData();
    form.set("accessToken", session.access_token);
    form.set("message", messageActuel);
    form.set("type", type);
    // Contexte auto-capturé (retour Bryan : "l'utilisateur ne devrait pas
    // avoir à expliquer où il se trouvait") — jamais affiché ni demandé.
    form.set("contexte", JSON.stringify({ ecran: contexte.ecran, section: contexte.section, filtres_actifs: contexte.filtresActifs, nombre_projets_affiches: contexte.nombreProjetsAffiches }));
    try {
      const res = await fetch("/api/citoyen/feedback", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) { setErreur(json?.error || "Erreur lors de l'envoi. Réessayez."); setEnvoi(false); return; }
      setEnvoi(false);
      setVue("merci");
    } catch {
      setErreur("Une erreur est survenue.");
      setEnvoi(false);
    }
  }

  const titreVue = vue === "aide" ? "Besoin d'aide ?" : vue === "merci" ? "Merci pour votre retour." : "Votre retour";
  const sousTitreVue = vue === "aide" ? "Comprendre vos projets et nous signaler ce qui peut être amélioré."
    : vue === "choix" ? "Qu'est-ce qui pourrait être amélioré ?"
    : vue === "merci" ? "Vos remarques nous aident à améliorer Yelen."
    : null;
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`@keyframes tpAideUp{from{transform:translateY(16px);opacity:0.6}to{transform:translateY(0);opacity:1}}`}</style>
      <div onClick={onFermer} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}/>
      <div style={{ position: "relative", width: "100%", maxHeight: "88svh", display: "flex", flexDirection: "column", background: bg, borderRadius: "22px 22px 0 0", animation: "tpAideUp 0.22s ease", boxShadow: "0 -8px 30px rgba(0,0,0,0.25)" }}>
        <ScrollPositionBarConteneur isDark={isDark} conteneurRef={scrollRef}/>

        <div style={{ padding: "10px 20px 0", flexShrink: 0 }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: t3, opacity: 0.5, margin: "0 auto 14px" }}/>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              {(vue === "choix" || vue === "detail") && (
                <button onClick={() => setVue(vue === "detail" ? "choix" : "aide")} className="tap" aria-label="Retour" style={{ background: "none", border: "none", color: t2, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}><Ic.ChevL/></button>
              )}
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800 }}>{titreVue}</div>
            </div>
            <button onClick={onFermer} className="tap" aria-label="Fermer" style={{ width: "30px", height: "30px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}><Ic.Close/></button>
          </div>
          {sousTitreVue && <div style={{ color: t2, fontSize: "12px", lineHeight: 1.4, margin: "6px 0 14px" }}>{sousTitreVue}</div>}
          {!sousTitreVue && <div style={{ marginBottom: "10px" }}/>}
        </div>

        {vue === "aide" && (
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "15px" }}>📁</span>
              <span style={{ color: t1, fontSize: "13.5px", fontWeight: 800 }}>Tous les projets</span>
            </div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.55, marginBottom: "18px" }}>Cet espace rassemble tous vos projets créés avec Yelen.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "22px" }}>
              {EXPLICATIONS_ECRAN.map((e) => (
                <div key={e.titre}>
                  <div style={{ color: t1, fontSize: "13px", fontWeight: 700, marginBottom: "2px" }}>{e.titre}</div>
                  <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>{e.texte}</div>
                </div>
              ))}
            </div>

            <div style={{ background: isDark ? "linear-gradient(135deg, rgba(245,166,35,0.14), rgba(245,166,35,0.03))" : "linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.015))", border: `1px solid ${isDark ? "rgba(245,166,35,0.22)" : "rgba(245,166,35,0.18)"}`, borderRadius: "16px", padding: "16px", marginBottom: "18px" }}>
              <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px", display: "flex", alignItems: "center", gap: "7px" }}><Ic.Sparkle/> Vous ne savez pas quoi faire ?</div>
              <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5, marginBottom: "12px" }}>
                Vous pouvez créer un nouveau projet à tout moment. Si vous ne savez pas par où commencer, Yelen peut aussi vous accompagner pour définir votre besoin et identifier les prochaines étapes.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                <button onClick={onCreerProjet} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", color: "#F5A623", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", padding: 0 }}>Créer un projet <Ic.ChevR/></button>
                <button onClick={onLaisserYelenAider} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", color: "#F5A623", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", padding: 0 }}>Laisser Yelen m&apos;aider <Ic.ChevR/></button>
              </div>
            </div>

            <button onClick={() => setVue("choix")} className="tap" style={{ width: "100%", textAlign: "left", background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px", marginBottom: "10px", cursor: "pointer" }}>
              <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "6px", display: "flex", alignItems: "center", gap: "7px" }}><Ic.Wrench/> Aidez-nous à améliorer Yelen</div>
              <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5, marginBottom: "10px" }}>Vous avez remarqué quelque chose qui ne fonctionne pas, qui est difficile à comprendre ou qui pourrait être amélioré ? Dites-le-nous.</div>
              <div style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: 800, display: "flex", alignItems: "center", gap: "5px" }}>Signaler un problème ou une amélioration <Ic.ChevR/></div>
            </button>
          </div>
        )}

        {vue === "choix" && (
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {FEEDBACK_CHOIX.map((c) => (
                <button key={c.val} onClick={() => choisirType(c.val)} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "13px 15px", background: card, border: `1px solid ${brd}`, borderRadius: "13px", cursor: "pointer" }}>
                  <span style={{ color: t1, fontSize: "13.5px", fontWeight: 600 }}>{c.label}</span>
                  <span style={{ color: t3, flexShrink: 0, display: "flex" }}><Ic.ChevR/></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {vue === "detail" && type && (
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
            {type === "ne_fonctionne_pas" ? (
              <>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Que s&apos;est-il passé ?</div>
                <textarea value={champ1} onChange={(e) => setChamp1(e.target.value)} placeholder="Décrivez le problème…" rows={3} className="tp-search-input" style={{ width: "100%", padding: "13px 15px", borderRadius: "14px", border: "none", background: chipBg, color: t1, fontSize: "13.5px", fontFamily: "inherit", resize: "none", boxSizing: "border-box", marginBottom: "16px" }}/>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Que vouliez-vous faire ?</div>
                <textarea value={champ2} onChange={(e) => setChamp2(e.target.value)} placeholder="Ex. Je voulais filtrer mes projets par catégorie." rows={2} className="tp-search-input" style={{ width: "100%", padding: "13px 15px", borderRadius: "14px", border: "none", background: chipBg, color: t1, fontSize: "13.5px", fontFamily: "inherit", resize: "none", boxSizing: "border-box", marginBottom: "8px" }}/>
              </>
            ) : type === "manque" ? (
              <>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Qu&apos;aimeriez-vous pouvoir faire ?</div>
                <textarea value={champ1} onChange={(e) => setChamp1(e.target.value)} placeholder="Décrivez la fonctionnalité ou l'information qui vous manque…" rows={4} className="tp-search-input" style={{ width: "100%", padding: "13px 15px", borderRadius: "14px", border: "none", background: chipBg, color: t1, fontSize: "13.5px", fontFamily: "inherit", resize: "none", boxSizing: "border-box", marginBottom: "8px" }}/>
              </>
            ) : (
              <>
                <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Dites-nous en plus</div>
                <textarea value={champ1} onChange={(e) => setChamp1(e.target.value)} placeholder="Décrivez ce qui s'est passé ou ce que vous aimeriez voir changer…" rows={4} className="tp-search-input" style={{ width: "100%", padding: "13px 15px", borderRadius: "14px", border: "none", background: chipBg, color: t1, fontSize: "13.5px", fontFamily: "inherit", resize: "none", boxSizing: "border-box", marginBottom: "6px" }}/>
                <div style={{ color: t3, fontSize: "11px", lineHeight: 1.5, marginBottom: "8px" }}>Ex. « Je ne comprends pas la différence entre À préparer et Planifié. »</div>
              </>
            )}
            {erreur && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "8px" }}>{erreur}</div>}
          </div>
        )}

        {vue === "merci" && (
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 20px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "6px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        )}

        {(vue === "detail" || vue === "merci") && (
          <div style={{ flexShrink: 0, borderTop: `1px solid ${brd}`, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", background: bg }}>
            {vue === "merci" ? (
              <button onClick={onFermer} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "14px", border: "none", background: "#F5A623", color: "#080812", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" }}>Terminé</button>
            ) : (
              <button onClick={() => void envoyerFeedback()} disabled={envoi || !formValide} className="tap" style={{ width: "100%", padding: "13px", borderRadius: "14px", border: "none", background: "#F5A623", color: "#080812", fontSize: "13.5px", fontWeight: 800, cursor: envoi || !formValide ? "default" : "pointer", opacity: envoi || !formValide ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {envoi ? <YelenLoader size={16} color="#080812"/> : "Envoyer"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Bottom Sheet iOS — filtres avancés (retour Bryan, remplace la carte
// injectée dans le contenu). Brouillon local (useState initialisé au montage
// depuis `filtresActuels`) : rien n'est appliqué à l'écran derrière tant que
// "Voir N projets" n'est pas tapé ; fermer par X/backdrop jette le
// brouillon. Composant démonté à la fermeture (rendu conditionnel par le
// parent) — pas besoin de reset explicite, le prochain montage repart des
// filtres réellement appliqués.
function FiltreProjetsSheet({ isDark, liste, filtresActuels, onFermer, onAppliquer }: {
  isDark: boolean; liste: Projet[]; filtresActuels: FiltresProjets; onFermer: () => void; onAppliquer: (f: FiltresProjets) => void;
}) {
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const chipBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const [draft, setDraft] = useState<FiltresProjets>(() => ({ ...filtresActuels, categories: new Set(filtresActuels.categories) }));

  const previewCount = useMemo(() => liste.filter((p) => correspond(p, draft)).length, [liste, draft]);
  const draftActif = draft.statut !== "tout" || draft.categories.size > 0 || !!draft.dateOpt || !!draft.progression || draft.tri !== "pertinence";
  const boutonLabel = !draftActif ? "Voir tous les projets" : previewCount === 0 ? "Aucun projet trouvé" : `Voir ${previewCount} projet${previewCount > 1 ? "s" : ""}`;

  const resume = libellesFiltresActifs(draft);

  const sectionTitleStyle: React.CSSProperties = { color: t2, fontSize: "10px", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "9px" };
  const pill = (actif: boolean) => pillStyle(actif, chipBg, t1, brd);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "flex-end", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`@keyframes tpSheetUp{from{transform:translateY(16px);opacity:0.6}to{transform:translateY(0);opacity:1}}`}</style>
      <div onClick={onFermer} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}/>
      <div style={{ position: "relative", width: "100%", maxHeight: "88svh", display: "flex", flexDirection: "column", background: bg, borderRadius: "22px 22px 0 0", animation: "tpSheetUp 0.22s ease", boxShadow: "0 -8px 30px rgba(0,0,0,0.25)" }}>
        <ScrollPositionBarConteneur isDark={isDark} conteneurRef={scrollRef}/>

        <div style={{ padding: "10px 20px 0", flexShrink: 0 }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: t3, opacity: 0.5, margin: "0 auto 14px" }}/>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800 }}>Filtrer les projets</div>
            <button onClick={onFermer} className="tap" aria-label="Fermer" style={{ width: "30px", height: "30px", borderRadius: "50%", background: isDark ? "#2C2C2E" : "#EBEBF0", border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}><Ic.Close/></button>
          </div>
          <div style={{ color: t2, fontSize: "12px", lineHeight: 1.4, marginBottom: resume.length ? "8px" : "14px" }}>Affichez les projets selon vos critères.</div>
          {resume.length > 0 && (
            <div style={{ color: "#F5A623", fontSize: "12px", fontWeight: 700, marginBottom: "14px" }}>{resume.join(" · ")}</div>
          )}
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          <div style={sectionTitleStyle}>Statut</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "20px" }}>
            <button onClick={() => setDraft((d) => ({ ...d, statut: "tout" }))} className="tap" style={pill(draft.statut === "tout")}>Tout</button>
            {STATUTS_ORDRE.map((s) => (
              <button key={s} onClick={() => setDraft((d) => ({ ...d, statut: s }))} className="tap" style={pill(draft.statut === s)}>{STATUT_LABEL[s]}</button>
            ))}
          </div>

          <div style={sectionTitleStyle}>Catégorie</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "20px" }}>
            <button onClick={() => setDraft((d) => ({ ...d, categories: new Set() }))} className="tap" style={pill(draft.categories.size === 0)}>Toutes</button>
            {Object.entries(ACTIVITE_CATEGORIE_SHORT).map(([code, label]) => {
              const actif = draft.categories.has(code);
              return (
                <button key={code} onClick={() => setDraft((d) => {
                  const next = new Set(d.categories);
                  if (actif) next.delete(code); else next.add(code);
                  return { ...d, categories: next };
                })} className="tap" style={pill(actif)}>{actif ? `✓ ${label}` : label}</button>
              );
            })}
          </div>

          <div style={sectionTitleStyle}>Date cible</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: draft.dateOpt === "avant" ? "10px" : "20px" }}>
            {DATE_OPTIONS.map((opt) => (
              <button key={opt.val} onClick={() => setDraft((d) => ({ ...d, dateOpt: d.dateOpt === opt.val ? null : opt.val, avantValue: null }))} className="tap" style={pill(draft.dateOpt === opt.val)}>{opt.label}</button>
            ))}
            <button onClick={() => setDraft((d) => ({ ...d, dateOpt: d.dateOpt === "avant" ? null : "avant" }))} className="tap" style={pill(draft.dateOpt === "avant")}>
              {draft.dateOpt === "avant" && draft.avantValue ? `Avant le ${formatDateCourt(draft.avantValue)}` : "Choisir une date…"}
            </button>
          </div>
          {draft.dateOpt === "avant" && (
            <input
              type="date"
              value={draft.avantValue ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, avantValue: e.target.value || null }))}
              className="tp-search-input"
              style={{ width: "100%", padding: "12px 14px", borderRadius: "12px", border: "none", background: chipBg, color: draft.avantValue ? t1 : t2, fontSize: "14px", fontWeight: 600, marginBottom: "20px", colorScheme: isDark ? "dark" : "light", boxSizing: "border-box" }}
            />
          )}

          <div style={sectionTitleStyle}>Progression</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "20px" }}>
            {PROGRESSION_OPTIONS.map((opt) => (
              <button key={opt.val} onClick={() => setDraft((d) => ({ ...d, progression: d.progression === opt.val ? null : opt.val }))} className="tap" style={pill(draft.progression === opt.val)}>{opt.label}</button>
            ))}
          </div>

          <div style={sectionTitleStyle}>Trier par</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "12px" }}>
            {TRI_OPTIONS.map((opt) => {
              const actif = draft.tri === opt.val;
              return (
                <button key={opt.val} onClick={() => setDraft((d) => ({ ...d, tri: opt.val }))} className="tap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 2px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${actif ? "#F5A623" : brd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {actif && <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#F5A623" }}/>}
                  </div>
                  <span style={{ color: actif ? t1 : t2, fontSize: "13.5px", fontWeight: actif ? 700 : 500 }}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${brd}`, padding: "14px 20px calc(14px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: bg }}>
          <button onClick={() => setDraft(filtresParDefaut())} className="tap" style={{ background: "none", border: "none", color: t2, fontSize: "13px", fontWeight: 700, cursor: "pointer", padding: "8px 4px" }}>Réinitialiser</button>
          <button onClick={() => onAppliquer(draft)} className="tap" style={{ flex: 1, maxWidth: "230px", padding: "13px", borderRadius: "14px", border: "none", background: "#F5A623", color: "#080812", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" }}>{boutonLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function TousProjetsClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombreCard = isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)";
  const chipBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const [projets, setProjets] = useState<Projet[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [filtres, setFiltres] = useState<FiltresProjets>(filtresParDefaut);
  const [sheetOuvert, setSheetOuvert] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [aideOuverte, setAideOuverte] = useState(false);

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase
      .from("citoyen_projets")
      .select("*, etapes:citoyen_projet_etapes(*)")
      .eq("citoyen_id", session.user.id)
      .order("mis_a_jour_le", { ascending: false });
    if (error) { setToast("Impossible de charger vos projets."); return; }
    setProjets(((data ?? []) as unknown as Projet[]).map((p) => ({ ...p, etapes: [...p.etapes].sort((a, b) => a.ordre - b.ordre) })));
  }, []);

  useEffect(() => {
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [charger]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (loading) return <CompteLoadingScreen titre="Tous les projets"/>;

  const liste = projets ?? [];
  const total = liste.length;
  const nEnCours = liste.filter((p) => p.statut === "en_cours").length;
  const nAVenir = liste.filter((p) => p.statut === "planifie").length;

  const listeFiltree = trierProjets(liste.filter((p) => correspond(p, filtres)), filtres.tri);
  const statutHorsRaccourcis = filtres.statut !== "tout" && !STATUT_RACCOURCIS.includes(filtres.statut);
  const nbFiltresAvances = (statutHorsRaccourcis ? 1 : 0) + (filtres.categories.size > 0 ? 1 : 0) + (filtres.dateOpt ? 1 : 0) + (filtres.progression ? 1 : 0) + (filtres.tri !== "pertinence" ? 1 : 0);

  function reinitialiserAvances() {
    setFiltres((f) => ({
      statut: statutHorsRaccourcis ? "tout" : f.statut,
      categories: new Set(),
      dateOpt: null,
      avantValue: null,
      progression: null,
      tri: "pertinence",
    }));
  }

  function ouvrirProjet(p: Projet) {
    router.push(`/menu/projets/${p.id}`);
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}.tp-noscroll::-webkit-scrollbar{display:none}.tp-search-input:focus{outline:none;box-shadow:0 0 0 2px rgba(245,166,35,0.4)}`}</style>
      <CompteHeader titre="Tous les projets" rightActions={[
        { icon: <Ic.Aide/>, label: "Besoin d'aide ?", onClick: () => setAideOuverte(true) },
        { icon: <Ic.Search/>, label: "Rechercher un projet", onClick: () => setRechercheOuverte(true) },
      ]}/>
      <PullToRefresh onRefresh={charger} isDark={isDark}>
      <main style={{ padding: "16px 16px 100px" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "3px" }}>Tous vos projets</div>
            <div style={{ color: t2, fontSize: "12px", lineHeight: 1.4 }}>Retrouvez et gérez tout ce que vous préparez avec Yelen.</div>
          </div>
          <button onClick={() => router.push("/menu/projets?nouveau=1")} className="tap" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "5px", padding: "9px 13px", borderRadius: "11px", border: `1px solid ${brd}`, background: card, color: t1, fontSize: "12px", fontWeight: 800, cursor: "pointer", boxShadow: ombreCard }}>
            <Ic.Plus/> Nouveau
          </button>
        </div>
        {total > 0 && (
          <div style={{ color: t3, fontSize: "11.5px", fontWeight: 600, marginBottom: "16px" }}>
            {total} projet{total > 1 ? "s" : ""} · {nEnCours} en cours · {nAVenir} à venir
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: nbFiltresAvances > 0 ? "8px" : "18px" }}>
          <div className="tp-noscroll" style={{ overflowX: "auto", flex: 1, minWidth: 0, scrollbarWidth: "none" }}>
            <div style={{ display: "flex", gap: "6px", width: "max-content" }}>
              <button onClick={() => setFiltres((f) => ({ ...f, statut: "tout" }))} className="tap" style={pillStyle(filtres.statut === "tout", chipBg, t1, brd)}>Tout</button>
              {STATUT_RACCOURCIS.map((s) => (
                <button key={s} onClick={() => setFiltres((f) => ({ ...f, statut: s }))} className="tap" style={pillStyle(filtres.statut === s, chipBg, t1, brd)}>{STATUT_LABEL[s]}</button>
              ))}
            </div>
          </div>
          <button onClick={() => setSheetOuvert(true)} aria-label="Filtrer" className="tap" style={{ position: "relative", flexShrink: 0, width: "36px", height: "36px", borderRadius: "10px", border: `1px solid ${brd}`, background: card, color: t1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: ombreCard }}>
            <Ic.Filter/>
            {nbFiltresAvances > 0 && (
              <span style={{ position: "absolute", top: "-2px", right: "-2px", width: "9px", height: "9px", borderRadius: "50%", background: "#F5A623", border: `2px solid ${bg}` }}/>
            )}
          </button>
        </div>

        {nbFiltresAvances > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px", paddingLeft: "2px" }}>
            <span style={{ color: t2, fontSize: "11.5px", fontWeight: 600 }}>{nbFiltresAvances} filtre{nbFiltresAvances > 1 ? "s" : ""} actif{nbFiltresAvances > 1 ? "s" : ""}</span>
            <span style={{ color: t3 }}>·</span>
            <button onClick={reinitialiserAvances} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>Réinitialiser</button>
          </div>
        )}

        {listeFiltree.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 20px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}><IllustrationProjetVide size={56}/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: 800, marginBottom: "4px" }}>Aucun projet pour ces filtres</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5 }}>Essayez un autre statut ou réinitialisez les filtres.</div>
          </div>
        ) : filtres.statut === "tout" ? (
          GROUPES.map((g) => {
            const items = listeFiltree.filter((p) => g.statuts.includes(p.statut));
            if (items.length === 0) return null;
            return (
              <div key={g.id} style={{ marginBottom: "22px" }}>
                <div style={{ color: t2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "9px", paddingLeft: "2px" }}>{g.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                  {items.map((p) => (
                    <ProjetCarte key={p.id} p={p} isDark={isDark} card={card} brd={brd} t1={t1} t2={t2} t3={t3} ombreCard={ombreCard} onOpen={ouvrirProjet}/>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            {listeFiltree.map((p) => (
              <ProjetCarte key={p.id} p={p} isDark={isDark} card={card} brd={brd} t1={t1} t2={t2} t3={t3} ombreCard={ombreCard} onOpen={ouvrirProjet}/>
            ))}
          </div>
        )}
      </main>
      </PullToRefresh>

      {sheetOuvert && (
        <FiltreProjetsSheet
          isDark={isDark}
          liste={liste}
          filtresActuels={filtres}
          onFermer={() => setSheetOuvert(false)}
          onAppliquer={(nouveaux) => { setFiltres(nouveaux); setSheetOuvert(false); }}
        />
      )}

      {aideOuverte && (
        <AideEtFeedbackSheet
          isDark={isDark}
          contexte={{ ecran: "Tous les projets", section: "Mes projets", filtresActifs: libellesFiltresActifs(filtres), nombreProjetsAffiches: listeFiltree.length }}
          onFermer={() => setAideOuverte(false)}
          onCreerProjet={() => { setAideOuverte(false); router.push("/menu/projets?nouveau=1"); }}
          onLaisserYelenAider={() => { setAideOuverte(false); router.push("/menu/projets/accompagnement"); }}
        />
      )}

      {rechercheOuverte && (
        <RechercheProjetsOverlay projets={liste} isDark={isDark} onClose={() => setRechercheOuverte(false)} onOpen={ouvrirProjet}/>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500, zIndex: 9500, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap", backgroundColor: isDark ? "#2A0F0F" : "#fef2f2", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
          ⚠ {toast}
        </div>
      )}
    </div>
  );
}
