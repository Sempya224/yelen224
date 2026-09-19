"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { CATEGORIES_DEPENSE, formatGNF, type CategorieDepenseId } from "@/lib/depenses";
import { ajouterDepense, modifierDepense, supprimerDepense, upsertBudget, supprimerBudget, creerObjectifFinancier, supprimerObjectifFinancier, ajouterContribution, renouvelerDepenseRecurrente } from "./actions";
import { CalendrierDepenses, type LigneCalendrier } from "./calendrier-depenses";
import { YelenLoader } from "@/components/YelenLoader";

// "Mes dépenses" — chantier engagement du 25/07/2026, inspiré de
// MoneyLion (budget par catégorie + suggestions), décision CEO : pas
// d'info externe nécessaire ici, tout vient de l'activité réelle du
// citoyen — ses RDV payés (paid_bookings, déjà réel) + ce qu'il ajoute
// lui-même (citoyen_depenses, nouvelle table). Pas de plafond de budget
// ni d'alerte de dépassement en V1 (ça viendrait avec une vraie UI de
// configuration par catégorie — hors scope demandé ici) : le "aide à
// réduire" passe par le CTA vers Mes démarches, pas par une limite
// automatique.
type Depense = { id: string; categorie: CategorieDepenseId; montant: number; description: string | null; date_depense: string; created_at: string; source: "manuelle"; recurrence: "aucune" | "hebdomadaire" | "mensuel"; recurrence_prochaine_date: string | null };
type PaiementRdv = { id: string; montant: number; date_depense: string; created_at: string; description: string | null; institutionNom: string | null; serviceNom: string | null; statut: string; source: "yelen" };
type Ligne = Depense | PaiementRdv;

const Illu: Record<CategorieDepenseId | "yelen", () => React.ReactNode> = {
  sante: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FEE2E2"/><rect x="18" y="11" width="8" height="22" rx="2" fill="#E11D48"/><rect x="11" y="18" width="22" height="8" rx="2" fill="#E11D48"/></svg>),
  transport: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#DBEAFE"/><rect x="9" y="20" width="26" height="10" rx="3" fill="#2563EB"/><path d="M12 20l3-7h14l3 7" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinejoin="round"/><circle cx="15" cy="31" r="2.6" fill="#1E3A8A"/><circle cx="29" cy="31" r="2.6" fill="#1E3A8A"/></svg>),
  alimentation: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FFEDD5"/><path d="M12 20a10 10 0 0 0 20 0z" fill="#EA580C"/><rect x="11" y="18" width="22" height="3" rx="1.5" fill="#EA580C"/></svg>),
  logement: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#CCFBF1"/><path d="M12 34V19l10-8 10 8v15z" fill="#0F766E"/><rect x="19" y="25" width="6" height="9" fill="#CCFBF1"/></svg>),
  education: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#EDE9FE"/><path d="M22 13l14 6-14 6-14-6z" fill="#6D28D9"/><path d="M15 21v6c0 2 3 4 7 4s7-2 7-4v-6" stroke="#6D28D9" strokeWidth="2" fill="none"/></svg>),
  loisirs: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FCE7F3"/><polygon points="22,10 25.5,18 34,19 27.5,24.5 29.5,33 22,28.5 14.5,33 16.5,24.5 10,19 18.5,18" fill="#DB2777"/></svg>),
  autre: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#E2E8F0"/><circle cx="16" cy="22" r="3" fill="#475569"/><circle cx="22" cy="22" r="3" fill="#475569"/><circle cx="28" cy="22" r="3" fill="#475569"/></svg>),
  yelen: () => (<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="22" fill="#FEF3C7"/><rect x="12" y="12" width="20" height="20" rx="3" fill="#F5A623"/><rect x="16" y="16" width="4" height="4" fill="#fff"/><rect x="24" y="16" width="4" height="4" fill="#fff"/><rect x="16" y="24" width="4" height="4" fill="#fff"/></svg>),
};

const CATEGORIE_LABEL: Record<CategorieDepenseId | "yelen", string> = {
  sante: "Santé", transport: "Transport", alimentation: "Alimentation", logement: "Logement",
  education: "Éducation", loisirs: "Loisirs", autre: "Autre", yelen: "Rendez-vous Yelen",
};

function estCeMois(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function estMoisDernier(dateStr: string): boolean {
  const d = new Date(dateStr);
  const moisDernier = new Date(); moisDernier.setMonth(moisDernier.getMonth() - 1);
  return d.getFullYear() === moisDernier.getFullYear() && d.getMonth() === moisDernier.getMonth();
}

// `categorie` optionnelle (24/08/2026, modernisation "À surveiller") :
// quand l'alerte concerne une catégorie précise, elle devient cliquable
// (ouvre son budget) au lieu de rester un simple constat — "guider", pas
// juste présenter.
type Insight = { texte: string; ton: "neutre" | "alerte"; categorie?: CategorieDepenseId };

// Une dépense manuelle datée dans le futur = une dépense planifiée, pas
// encore réalisée (retour Bryan 29/07/2026 : "planifier des dépenses à
// venir"). Un RDV payé (source "yelen") n'est jamais "à venir" — il
// n'existe qu'une fois le paiement réellement effectué.
function estAVenir(l: Ligne): l is Depense {
  if (l.source !== "manuelle") return false;
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  return new Date(l.date_depense) > aujourdHui;
}

function texteEcheance(dateStr: string): string {
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const cible = new Date(dateStr); cible.setHours(0, 0, 0, 0);
  const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return "Demain";
  return `Dans ${jours} jours`;
}

// Lot 1 "Centre de pilotage" (24/08/2026) — budget global mensuel
// (citoyen_budgets, categorie NULL). Jours restants inclut aujourd'hui
// (un objectif "pour aujourd'hui" ne doit pas être divisé par 0 le
// dernier jour du mois).
type Budget = { id: string; categorie: CategorieDepenseId | null; montant_limite: number; periode: "hebdomadaire" | "mensuel"; seuil_alerte: number | null };

function finDuMois(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
}

function joursRestantsDansMois(reference: Date): number {
  const fin = finDuMois(reference); fin.setHours(0, 0, 0, 0);
  const aujourdHui = new Date(reference); aujourdHui.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((fin.getTime() - aujourdHui.getTime()) / 86400000) + 1);
}

function joursDansMois(reference: Date): number {
  return finDuMois(reference).getDate();
}

function estAujourdhui(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// Lot 5 "Mes objectifs" — `montant_actuel` toujours dérivé par SUM des
// contributions (jamais stocké, voir migration + actions.ts).
type Objectif = { id: string; titre: string; montant_cible: number; deadline: string | null; cadence: "hebdomadaire" | "mensuel" | "unique" | null; statut: "actif" | "atteint" | "abandonne" };
type Contribution = { id: string; objectif_id: string; montant: number; created_at: string };

function joursJusquau(dateStr: string): number {
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const cible = new Date(dateStr); cible.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000));
}

export function DepensesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const card2 = isDark ? "#2C2C2E" : "#EBEBF0";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#8E8E93" : "#6C6C70";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const ombre = isDark ? "none" : "0 2px 10px rgba(0,0,0,0.05)";

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Indicateur de position de scroll — barre verticale sur le bord droit
  // de l'écran (standard iOS/Android natif), même pattern que app/page.tsx
  // (retour CEO 23/07/2026). Visible uniquement pendant le défilement, puis
  // s'estompe après une pause.
  const [scrollPct, setScrollPct] = useState(0);
  const [scrollThumbH, setScrollThumbH] = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Deep link ?depense=/?budget=/?objectif= (24/08/2026, Mission Ghost —
  // Notifications V2) — ouvre directement le bon sheet depuis le CTA
  // d'une notification, même pattern que mes-demarches-client.tsx (?id=).
  const deepLinkAppliqueRef = useRef(false);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fCategorie, setFCategorie] = useState<CategorieDepenseId>("alimentation");
  const [fMontant, setFMontant] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fRecurrence, setFRecurrence] = useState<"aucune" | "hebdomadaire" | "mensuel">("aucune");
  // Lot 10 "Ajout rapide" — description/date/récurrence repliées par
  // défaut à l'ouverture (montant → catégorie → confirmer en 3 gestes),
  // dépliables via "Plus d'options" pour qui veut planifier/récurrer.
  const [avanceOuvert, setAvanceOuvert] = useState(false);
  // Lot 13 "Historique V2" — editId non-null = formOpen sert de formulaire
  // de modification (même sheet, réutilisée) plutôt que d'ajout.
  const [editId, setEditId] = useState<string | null>(null);
  const [editRecurrenceOriginale, setEditRecurrenceOriginale] = useState<{ recurrence: "aucune" | "hebdomadaire" | "mensuel"; prochaine: string | null } | null>(null);
  // Instantané des valeurs au moment de l'ouverture de la modification
  // (24/08/2026, brief CEO "état du bouton d'action") — sert à détecter une
  // vraie modification avant d'activer le bouton, jamais un état inventé.
  const [editSnapshot, setEditSnapshot] = useState<{ categorie: CategorieDepenseId; montant: string; description: string; date: string; recurrence: "aucune" | "hebdomadaire" | "mensuel" } | null>(null);
  const [histFiltre, setHistFiltre] = useState<CategorieDepenseId | "toutes">("toutes");
  const [histTri, setHistTri] = useState<"recent" | "montant">("recent");
  const [detail, setDetail] = useState<Ligne | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [objectifSheetOpen, setObjectifSheetOpen] = useState(false);
  const [objectifMontant, setObjectifMontant] = useState("");
  const [objectifSaving, setObjectifSaving] = useState(false);
  // Lot 4 — sheet de configuration d'un budget de catégorie, réouvert
  // pré-rempli si un budget existe déjà pour cette catégorie.
  const [budgetCatOuvert, setBudgetCatOuvert] = useState<CategorieDepenseId | null>(null);
  const [budgetCatMontant, setBudgetCatMontant] = useState("");
  const [budgetCatPeriode, setBudgetCatPeriode] = useState<"hebdomadaire" | "mensuel">("mensuel");
  const [budgetCatSaving, setBudgetCatSaving] = useState(false);
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [nouvelObjectifOuvert, setNouvelObjectifOuvert] = useState(false);
  const [noTitre, setNoTitre] = useState("");
  const [noMontant, setNoMontant] = useState("");
  const [noDeadline, setNoDeadline] = useState("");
  const [noCadence, setNoCadence] = useState<"hebdomadaire" | "mensuel" | "unique" | null>(null);
  const [noSaving, setNoSaving] = useState(false);
  const [objectifDetail, setObjectifDetail] = useState<Objectif | null>(null);
  const [contribMontant, setContribMontant] = useState("");
  const [contribSaving, setContribSaving] = useState(false);
  const [calendrierOuvert, setCalendrierOuvert] = useState(false);

  const charger = useCallback(async (id: string) => {
    const [depRes, paidRes, budgetRes, objectifRes, contribRes] = await Promise.all([
      supabase.from("citoyen_depenses").select("id,categorie,montant,description,date_depense,created_at,recurrence,recurrence_prochaine_date").eq("citoyen_id", id).order("date_depense", { ascending: false }),
      supabase.from("paid_bookings").select("id,montant_paye,created_at,statut,paid_services(nom),institutions!paid_bookings_institution_id_fkey(name)").eq("citoyen_id", id).in("statut", ["confirme", "termine"]),
      supabase.from("citoyen_budgets").select("id,categorie,montant_limite,periode,seuil_alerte").eq("citoyen_id", id).eq("actif", true),
      supabase.from("citoyen_objectifs_financiers").select("id,titre,montant_cible,deadline,cadence,statut").eq("citoyen_id", id).order("created_at", { ascending: false }),
      supabase.from("citoyen_objectif_contributions").select("id,objectif_id,montant,created_at").eq("citoyen_id", id),
    ]);
    type DepenseRow = { id: string; categorie: CategorieDepenseId; montant: number; description: string | null; date_depense: string; created_at: string; recurrence: "aucune" | "hebdomadaire" | "mensuel"; recurrence_prochaine_date: string | null };
    type PaiementRow = { id: string; montant_paye: number | null; created_at: string; statut: string; paid_services: { nom: string | null } | null; institutions: { name: string | null } | null };
    const manuelles: Depense[] = ((depRes.data ?? []) as unknown as DepenseRow[]).map((d) => ({ id: d.id, categorie: d.categorie, montant: d.montant, description: d.description, date_depense: d.date_depense, created_at: d.created_at, source: "manuelle" as const, recurrence: d.recurrence, recurrence_prochaine_date: d.recurrence_prochaine_date }));
    const paiements: PaiementRdv[] = ((paidRes.data ?? []) as unknown as PaiementRow[]).map((p) => ({
      id: p.id, montant: p.montant_paye ?? 0, date_depense: p.created_at, created_at: p.created_at,
      description: `${p.paid_services?.nom ?? "Service"} — ${p.institutions?.name ?? ""}`.trim(),
      institutionNom: p.institutions?.name ?? null, serviceNom: p.paid_services?.nom ?? null, statut: p.statut,
      source: "yelen" as const,
    }));
    setLignes([...manuelles, ...paiements].sort((a, b) => new Date(b.date_depense).getTime() - new Date(a.date_depense).getTime()));
    setBudgets((budgetRes.data ?? []) as Budget[]);
    setObjectifs((objectifRes.data ?? []) as Objectif[]);
    setContributions((contribRes.data ?? []) as Contribution[]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    // Lecture d'un système externe (localStorage) au montage, seule source
    // possible de l'id citoyen ici (même pattern justifié qu'app/recherche/shared.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserId(id);
    void (async () => { setLoading(true); await charger(id); setLoading(false); })();
  }, [router, charger]);

  useEffect(() => {
    if (deepLinkAppliqueRef.current || loading) return;
    deepLinkAppliqueRef.current = true;
    const depenseId = searchParams.get("depense");
    const budgetId = searchParams.get("budget");
    const objectifId = searchParams.get("objectif");
    // Ouvre le sheet correspondant depuis un paramètre d'URL externe
    // (CTA d'une notification) au chargement — même justification que
    // l'effet de lecture localStorage ci-dessus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (depenseId) {
      const l = lignes.find((x) => x.id === depenseId);
      if (l) setDetail(l);
    } else if (budgetId) {
      const b = budgets.find((x) => x.id === budgetId);
      if (b) { if (b.categorie) ouvrirBudgetCategorie(b.categorie); else setObjectifSheetOpen(true); }
    } else if (objectifId) {
      const o = objectifs.find((x) => x.id === objectifId);
      if (o) setObjectifDetail(o);
    }
    // ouvrirBudgetCategorie volontairement absente des dépendances : simple
    // fonction du corps du composant (pas mémoïsée), l'effet ne s'exécute
    // qu'une fois grâce à deepLinkAppliqueRef, l'inclure ne changerait rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams, lignes, budgets, objectifs]);

  useEffect(() => {
    const onScrollPct = () => {
      const viewport = window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const max = total - viewport;
      setScrollPct(max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0);
      setScrollThumbH(total > 0 ? Math.min(Math.max(viewport / total, 0.08), 1) : 1);
      setScrollBarShown(true);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => setScrollBarShown(false), 900);
    };
    onScrollPct();
    window.addEventListener("scroll", onScrollPct, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, []);

  // Resynchronise la fiche objectif ouverte (statut notamment, ex. bascule
  // "actif" → "atteint") après un rechargement déclenché par une
  // contribution — objectifDetail est un instantané, pas une référence,
  // resynchronisé ici depuis les données rechargées (pas une dérivation
  // calculable au rendu). `objectifDetail` volontairement absent des
  // dépendances : le réintégrer recréerait une boucle (l'effet
  // redéclencherait sur son propre setState).
  useEffect(() => {
    if (!objectifDetail) return;
    const frais = objectifs.find((o) => o.id === objectifDetail.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (frais) setObjectifDetail(frais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectifs]);

  // Une dépense planifiée dans le futur n'est pas encore un fait accompli —
  // elle a sa propre section "À venir" et n'entre ni dans le total du mois,
  // ni dans la répartition par catégorie, ni dans "Toutes vos dépenses".
  const aVenir = lignes.filter(estAVenir).sort((a, b) => new Date(a.date_depense).getTime() - new Date(b.date_depense).getTime());
  const aVenirIds = new Set(aVenir.map(d => d.id));
  const historique = lignes.filter(l => !aVenirIds.has(l.id));

  // Lot 13 "Historique V2" — filtre catégorie (7 catégories + "yelen" via
  // "toutes") et tri, appliqués uniquement à l'affichage de la liste
  // "Historique" — n'affecte aucun calcul du reste de l'écran (budgets,
  // rythme, prévisions… tous basés sur `historique` brut).
  const historiqueAffiche = historique
    .filter((l) => histFiltre === "toutes" || (l.source === "manuelle" && l.categorie === histFiltre))
    .sort((a, b) => histTri === "montant" ? b.montant - a.montant : new Date(b.date_depense).getTime() - new Date(a.date_depense).getTime());

  // Lot 8 — modèles récurrents (recurrence_prochaine_date renseignée),
  // triés par échéance la plus proche.
  const prochainesRecurrentes = lignes
    .filter((l): l is Depense => l.source === "manuelle" && l.recurrence !== "aucune" && !!l.recurrence_prochaine_date)
    .sort((a, b) => new Date(a.recurrence_prochaine_date as string).getTime() - new Date(b.recurrence_prochaine_date as string).getTime());

  const lignesMois = historique.filter(l => estCeMois(l.date_depense));
  const totalMois = lignesMois.reduce((s, l) => s + l.montant, 0);

  const parCategorie = new Map<CategorieDepenseId | "yelen", number>();
  for (const l of lignesMois) {
    const cle = l.source === "yelen" ? "yelen" : l.categorie;
    parCategorie.set(cle, (parCategorie.get(cle) ?? 0) + l.montant);
  }
  const categoriesTriees = [...parCategorie.entries()].sort((a, b) => b[1] - a[1]);
  const topCategorie = categoriesTriees[0]?.[0];

  // Lot 6 "À surveiller" — comparaison au mois dernier, `historique` porte
  // déjà tout l'historique réel (la requête ne filtre pas par date), pas
  // besoin d'un nouveau fetch.
  const lignesMoisDernier = historique.filter((l) => estMoisDernier(l.date_depense));
  const parCategorieMoisDernier = new Map<CategorieDepenseId | "yelen", number>();
  for (const l of lignesMoisDernier) {
    const cle = l.source === "yelen" ? "yelen" : l.categorie;
    parCategorieMoisDernier.set(cle, (parCategorieMoisDernier.get(cle) ?? 0) + l.montant);
  }

  // Insights déterministes — zéro appel LLM (philosophie du projet, voir
  // lib/citoyenTendances.ts/lib/citoyenDemarchesRappels.ts). Purement
  // local à cet écran (types Ligne/Depense non exportés) plutôt que
  // lib/depenses.ts, aucun autre écran n'en a besoin aujourd'hui.
  const insights: Insight[] = [];
  if (totalMois > 0 && topCategorie && topCategorie !== "yelen") {
    const pctTop = Math.round(((parCategorie.get(topCategorie) ?? 0) / totalMois) * 100);
    if (pctTop >= 50) insights.push({ texte: `${CATEGORIE_LABEL[topCategorie]} représente ${pctTop}% de vos dépenses ce mois-ci.`, ton: pctTop >= 70 ? "alerte" : "neutre", categorie: topCategorie });
  }
  for (const cat of CATEGORIES_DEPENSE.map((c) => c.id)) {
    const ceMois = parCategorie.get(cat) ?? 0;
    const moisDernier = parCategorieMoisDernier.get(cat) ?? 0;
    if (moisDernier >= 10000 && ceMois > moisDernier) {
      const variation = Math.round(((ceMois - moisDernier) / moisDernier) * 100);
      if (variation >= 20) insights.push({ texte: `Vos dépenses de ${CATEGORIE_LABEL[cat]} ont augmenté de ${variation}% par rapport au mois dernier.`, ton: "alerte", categorie: cat });
    }
  }
  for (const b of budgets.filter((b) => b.categorie !== null)) {
    const cat = b.categorie as CategorieDepenseId;
    const montant = parCategorie.get(cat) ?? 0;
    if (montant > b.montant_limite) insights.push({ texte: `Vous avez dépassé votre limite ${CATEGORIE_LABEL[cat]}.`, ton: "alerte", categorie: cat });
  }
  {
    const semaine = lignesMois.filter((l) => l.source === "manuelle");
    const weekend = semaine.filter((l) => [0, 6].includes(new Date(l.date_depense).getDay()));
    const enSemaine = semaine.filter((l) => ![0, 6].includes(new Date(l.date_depense).getDay()));
    const moyWeekend = weekend.length > 0 ? weekend.reduce((s, l) => s + l.montant, 0) / weekend.length : 0;
    const moyEnSemaine = enSemaine.length > 0 ? enSemaine.reduce((s, l) => s + l.montant, 0) / enSemaine.length : 0;
    if (weekend.length >= 2 && enSemaine.length >= 2 && moyWeekend > moyEnSemaine * 1.3) {
      insights.push({ texte: "Vous dépensez davantage le week-end en moyenne.", ton: "neutre" });
    }
  }
  {
    const septJours = new Date(); septJours.setDate(septJours.getDate() - 7);
    const recentes = historique.filter((l) => l.source === "manuelle" && new Date(l.date_depense) >= septJours);
    const parPaire = new Map<string, number>();
    for (const l of recentes) {
      const cle = `${(l as Depense).categorie}-${l.montant}`;
      parPaire.set(cle, (parPaire.get(cle) ?? 0) + 1);
    }
    const repetee = [...parPaire.entries()].find(([, n]) => n >= 3);
    if (repetee) {
      const [cle, n] = repetee;
      const cat = cle.split("-")[0] as CategorieDepenseId;
      insights.push({ texte: `${n} dépenses similaires (${CATEGORIE_LABEL[cat]}) ont été enregistrées cette semaine.`, ton: "neutre", categorie: cat });
    }
  }

  const budgetGlobalMensuel = budgets.find((b) => b.categorie === null && b.periode === "mensuel") ?? null;
  const resteMensuel = budgetGlobalMensuel ? budgetGlobalMensuel.montant_limite - totalMois : null;
  const joursRestantsMois = joursRestantsDansMois(new Date());
  const finMoisLabel = finDuMois(new Date()).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  // Lot 2 "Aujourd'hui" — objectif quotidien dérivé du budget global
  // (mensuel/nb de jours du mois, ou hebdomadaire/7), pas une colonne
  // séparée : un seul budget global à gérer pour le citoyen.
  const budgetGlobal = budgets.find((b) => b.categorie === null) ?? null;
  const objectifQuotidien = budgetGlobal
    ? budgetGlobal.periode === "mensuel" ? budgetGlobal.montant_limite / joursDansMois(new Date()) : budgetGlobal.montant_limite / 7
    : null;
  const depenseAujourdhui = historique.filter((l) => estAujourdhui(l.date_depense)).reduce((s, l) => s + l.montant, 0);
  const resteAujourdhui = objectifQuotidien !== null ? objectifQuotidien - depenseAujourdhui : null;

  // Lot 3 "Votre rythme" — compare le rythme réel (dépensé / jours
  // écoulés ce mois) au rythme cible (objectif mensuel / jours du mois).
  // Seuil ±10 % pour éviter un ton alarmiste sur un écart minime.
  const joursEcoulesMois = new Date().getDate();
  const rythmeReel = totalMois / joursEcoulesMois;
  const rythmeCible = budgetGlobalMensuel ? budgetGlobalMensuel.montant_limite / joursDansMois(new Date()) : null;
  const rythme = rythmeCible !== null && rythmeCible > 0
    ? (() => {
        const ratio = rythmeReel / rythmeCible;
        if (ratio > 1.1) return { ton: "#ef4444", texte: "Votre rythme actuel est supérieur à votre objectif.", conseil: "Conseil : réduisez vos dépenses variables cette semaine (loisirs, sorties) pour vous rapprocher de votre objectif." };
        if (ratio < 0.9) return { ton: "#22c55e", texte: "Votre rythme actuel est en dessous de votre objectif — bien joué.", conseil: null };
        return { ton: t2, texte: "Vous êtes dans votre rythme, au plus proche de votre objectif.", conseil: null };
      })()
    : null;

  // Lot 4 "Budget par catégorie" — enveloppes de suivi. Union des
  // catégories qui ont une dépense ce mois-ci ET de celles qui ont un
  // budget configuré (même à 0 dépensé, l'enveloppe reste visible pour
  // que le citoyen la retrouve). "yelen" (RDV payés) reste hors budget,
  // décision déjà actée dans lib/depenses.ts.
  const budgetsCategorie = budgets.filter((b): b is Budget & { categorie: CategorieDepenseId } => b.categorie !== null);
  const categoriesAvecDepense = categoriesTriees.map(([c]) => c).filter((c): c is CategorieDepenseId => c !== "yelen");
  const categoriesAffichees = Array.from(new Set([...categoriesAvecDepense, ...budgetsCategorie.map((b) => b.categorie)]))
    .sort((a, b) => (parCategorie.get(b) ?? 0) - (parCategorie.get(a) ?? 0));
  const depenseYelenMois = parCategorie.get("yelen") ?? 0;

  // Lot 9 "Prévisions" — projection linéaire simple (rythme réel × jours
  // du mois), déterministe, aucune régression/ML. Alerte de dépassement
  // catégorie limitée aux enveloppes PAS déjà dépassées aujourd'hui (un
  // dépassement déjà réel est déjà signalé par la barre rouge du Lot 4 /
  // "À surveiller" du Lot 6 — Prévisions n'ajoute que ce qui n'est pas
  // encore visible : "vous y allez" avant que ce soit arrivé).
  const projectionFinMois = joursEcoulesMois > 0 ? Math.round(rythmeReel * joursDansMois(new Date())) : totalMois;
  const depassementProjete = budgetGlobalMensuel && projectionFinMois > budgetGlobalMensuel.montant_limite
    ? projectionFinMois - budgetGlobalMensuel.montant_limite : null;
  const previsionsCategorie = budgetsCategorie
    .map((b) => {
      const montant = parCategorie.get(b.categorie) ?? 0;
      const projection = joursEcoulesMois > 0 ? Math.round((montant / joursEcoulesMois) * joursDansMois(new Date())) : montant;
      return { categorie: b.categorie, projection, limite: b.montant_limite, dejaDepasse: montant > b.montant_limite };
    })
    .filter((p) => p.projection > p.limite && !p.dejaDepasse);

  // Lot 11 "Action recommandée" — consolide Budget par catégorie (4),
  // Mes objectifs (5), À surveiller (6) et Prévisions (9) en UNE seule
  // recommandation, la plus urgente d'abord (ordre de priorité fixe,
  // déterministe — jamais un classement par score inventé). Chaque item
  // du brief garde sa propre section détaillée plus bas ; celle-ci ne
  // fait que pointer vers la bonne action.
  type ActionRecommandee = { ton: "critique" | "alerte" | "neutre" | "positif"; texte: string; action?: { label: string; onClick: () => void } };
  const categorieDejaDepassee = budgetsCategorie.find((b) => (parCategorie.get(b.categorie) ?? 0) > b.montant_limite) ?? null;
  const objectifEcheanceProche = objectifs.find((o) => {
    if (o.statut !== "actif" || !o.deadline) return false;
    const actuel = contributions.filter((c) => c.objectif_id === o.id).reduce((s, c) => s + c.montant, 0);
    return actuel < o.montant_cible && joursJusquau(o.deadline) <= 7;
  }) ?? null;
  const alerteInsight = insights.find((i) => i.ton === "alerte") ?? null;

  const actionRecommandee: ActionRecommandee | null = (() => {
    if (categorieDejaDepassee) {
      return { ton: "critique", texte: `Vous avez dépassé votre budget ${CATEGORIE_LABEL[categorieDejaDepassee.categorie]} ce mois-ci.`, action: { label: "Revoir ce budget", onClick: () => ouvrirBudgetCategorie(categorieDejaDepassee.categorie) } };
    }
    if (resteMensuel !== null && resteMensuel < 0) {
      return { ton: "critique", texte: `Votre objectif mensuel est dépassé de ${formatGNF(Math.abs(resteMensuel))}.`, action: { label: "Revoir mon objectif", onClick: () => setObjectifSheetOpen(true) } };
    }
    if (depassementProjete !== null) {
      return { ton: "alerte", texte: `À ce rythme, vous devriez dépasser votre objectif mensuel de ${formatGNF(depassementProjete)} d'ici le ${finMoisLabel}.`, action: { label: "Ajuster mon objectif", onClick: () => setObjectifSheetOpen(true) } };
    }
    if (previsionsCategorie.length > 0) {
      const p = previsionsCategorie[0];
      return { ton: "alerte", texte: `Au rythme actuel, vous devriez dépasser votre budget ${CATEGORIE_LABEL[p.categorie]} d'ici la fin du mois.`, action: { label: "Revoir ce budget", onClick: () => ouvrirBudgetCategorie(p.categorie) } };
    }
    if (alerteInsight) {
      return { ton: "alerte", texte: alerteInsight.texte };
    }
    if (objectifEcheanceProche) {
      return { ton: "neutre", texte: `L'échéance de "${objectifEcheanceProche.titre}" approche — pensez à y contribuer.`, action: { label: "Voir l'objectif", onClick: () => setObjectifDetail(objectifEcheanceProche) } };
    }
    if (budgets.length === 0) {
      return { ton: "neutre", texte: "Définissez un objectif mensuel pour recevoir des recommandations personnalisées.", action: { label: "Définir un objectif", onClick: () => setObjectifSheetOpen(true) } };
    }
    if (totalMois > 0) {
      return { ton: "positif", texte: "Tout est sous contrôle ce mois-ci, continuez ainsi." };
    }
    return null;
  })();

  // Lot 14 "Analyse mensuelle" — comparaison agrégée mois courant / mois
  // dernier, déterministe. Réutilise lignesMoisDernier/parCategorieMoisDernier
  // déjà chargés pour le Lot 6, aucun nouveau fetch. N'affiche rien avant
  // qu'il y ait au moins une activité sur l'un des deux mois — comparer
  // 0 à 0 n'apporte aucune information réelle.
  const totalMoisDernier = lignesMoisDernier.reduce((s, l) => s + l.montant, 0);
  const variationMois = totalMoisDernier > 0 ? Math.round(((totalMois - totalMoisDernier) / totalMoisDernier) * 100) : null;
  const topCategorieMoisDernier = [...parCategorieMoisDernier.entries()].filter(([c]) => c !== "yelen").sort((a, b) => b[1] - a[1])[0]?.[0] as CategorieDepenseId | undefined;
  const budgetsRespectesCeMois = budgetsCategorie.filter((b) => (parCategorie.get(b.categorie) ?? 0) <= b.montant_limite).length;
  const moisDernierLabel = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString("fr-FR", { month: "long" }); })();

  function ouvrirBudgetCategorie(cat: CategorieDepenseId) {
    const existant = budgetsCategorie.find((b) => b.categorie === cat) ?? null;
    setBudgetCatMontant(existant ? String(existant.montant_limite) : "");
    setBudgetCatPeriode(existant?.periode ?? "mensuel");
    setBudgetCatOuvert(cat);
  }

  async function soumettreBudgetCategorie() {
    if (!userId || !budgetCatOuvert) return;
    const montant = Number(budgetCatMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    setBudgetCatSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setBudgetCatSaving(false); return; }
    const result = await upsertBudget(userId, session.access_token, { categorie: budgetCatOuvert, montantLimite: montant, periode: budgetCatPeriode });
    setBudgetCatSaving(false);
    if (result.ok) {
      setBudgetCatOuvert(null);
      await charger(userId);
      setToast("Budget enregistré.");
    } else {
      setToast(result.error || "Échec de l'enregistrement.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function retirerBudgetCategorie() {
    if (!budgetCatOuvert || !userId) return;
    const existant = budgetsCategorie.find((b) => b.categorie === budgetCatOuvert);
    if (!existant) return;
    setBudgetCatSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setBudgetCatSaving(false); return; }
    const result = await supprimerBudget(session.access_token, existant.id);
    setBudgetCatSaving(false);
    if (result.ok) {
      setBudgetCatOuvert(null);
      await charger(userId);
      setToast("Budget retiré.");
    } else {
      setToast(result.error || "Échec de la suppression.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function soumettreObjectifMensuel() {
    if (!userId) return;
    const montant = Number(objectifMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    setObjectifSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setObjectifSaving(false); return; }
    const result = await upsertBudget(userId, session.access_token, { categorie: null, montantLimite: montant, periode: "mensuel" });
    setObjectifSaving(false);
    if (result.ok) {
      setObjectifSheetOpen(false);
      setObjectifMontant("");
      await charger(userId);
      setToast("Objectif mensuel enregistré.");
    } else {
      setToast(result.error || "Échec de l'enregistrement.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function soumettreNouvelObjectif() {
    if (!userId) return;
    if (!noTitre.trim()) { setToast("Donnez un titre à cet objectif."); setTimeout(() => setToast(null), 2000); return; }
    const montant = Number(noMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    setNoSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setNoSaving(false); return; }
    const result = await creerObjectifFinancier(userId, session.access_token, { titre: noTitre.trim(), montantCible: montant, deadline: noDeadline || null, cadence: noCadence });
    setNoSaving(false);
    if (result.ok) {
      setNouvelObjectifOuvert(false);
      setNoTitre(""); setNoMontant(""); setNoDeadline(""); setNoCadence(null);
      await charger(userId);
      setToast("Objectif créé.");
    } else {
      setToast(result.error || "Échec de la création.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function soumettreContribution() {
    if (!userId || !objectifDetail) return;
    const montant = Number(contribMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    setContribSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setContribSaving(false); return; }
    const result = await ajouterContribution(userId, session.access_token, { objectifId: objectifDetail.id, montant });
    setContribSaving(false);
    if (result.ok) {
      setContribMontant("");
      await charger(userId);
      setToast("Contribution ajoutée.");
    } else {
      setToast(result.error || "Échec de l'ajout.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function retirerObjectif(id: string) {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); return; }
    const result = await supprimerObjectifFinancier(session.access_token, id);
    if (result.ok) {
      setObjectifDetail(null);
      await charger(userId);
      setToast("Objectif supprimé.");
    } else {
      setToast(result.error || "Échec de la suppression.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function renouveler(depenseId: string) {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); return; }
    const result = await renouvelerDepenseRecurrente(userId, session.access_token, depenseId);
    if (result.ok) {
      setDetail(null);
      await charger(userId);
      setToast("Dépense enregistrée, prochaine échéance mise à jour.");
    } else {
      setToast(result.error || "Échec du renouvellement.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  const fEstFuture = (() => {
    const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
    return new Date(fDate) > aujourdHui;
  })();

  // Bouton actif seulement s'il y a vraiment quelque chose à faire :
  // en ajout, dès qu'un montant est saisi ; en édition, seulement si un
  // champ diffère de l'instantané pris à l'ouverture (brief CEO 24/08/2026).
  const montantBrut = fMontant.replace(/[^\d]/g, "");
  const formModifie = editId && editSnapshot
    ? fCategorie !== editSnapshot.categorie
      || montantBrut !== editSnapshot.montant
      || fDescription.trim() !== editSnapshot.description
      || fDate !== editSnapshot.date
      || fRecurrence !== editSnapshot.recurrence
    : montantBrut.length > 0;

  function ouvrirAjout() {
    setEditId(null);
    setEditSnapshot(null);
    setFMontant(""); setFDescription(""); setFDate(new Date().toISOString().slice(0, 10)); setFRecurrence("aucune"); setAvanceOuvert(false);
    setFormOpen(true);
  }

  // Lot 13 "Historique V2" — pré-remplit le même formulaire avec la
  // dépense existante. "Plus d'options" ouvert par défaut : en édition, le
  // citoyen vient généralement pour ajuster un détail précis (date,
  // description, récurrence), pas seulement le montant.
  function ouvrirModifier(d: Depense) {
    setEditId(d.id);
    setEditRecurrenceOriginale({ recurrence: d.recurrence, prochaine: d.recurrence_prochaine_date });
    const snap = { categorie: d.categorie, montant: String(d.montant), description: d.description ?? "", date: d.date_depense, recurrence: d.recurrence };
    setEditSnapshot(snap);
    setFCategorie(snap.categorie); setFMontant(snap.montant); setFDescription(snap.description);
    setFDate(snap.date); setFRecurrence(snap.recurrence); setAvanceOuvert(true);
    setDetail(null);
    setFormOpen(true);
  }

  async function retirerDepense(id: string) {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); return; }
    const result = await supprimerDepense(session.access_token, id);
    if (result.ok) {
      setDetail(null);
      await charger(userId);
      setToast("Dépense supprimée.");
    } else {
      setToast(result.error || "Échec de la suppression.");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function executerSoumission() {
    if (!userId) return;
    const montant = Number(fMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setToast("Session expirée, reconnectez-vous."); setSaving(false); return; }
    // En édition, si la récurrence n'a pas changé de type, on conserve la
    // prochaine échéance déjà en base plutôt que de la recalculer depuis
    // fDate (qui repartirait du début du cycle sans raison — l'utilisateur
    // n'a peut-être touché que la description).
    const recurrenceProchaine = fRecurrence === "aucune" ? null
      : editId && editRecurrenceOriginale?.recurrence === fRecurrence ? editRecurrenceOriginale.prochaine
      : (() => {
          const d = new Date(fDate);
          if (fRecurrence === "hebdomadaire") d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1);
          return d.toISOString().slice(0, 10);
        })();
    const payload = { categorie: fCategorie, montant, description: fDescription, dateDepense: fDate, recurrence: fRecurrence, recurrenceProchaine };
    const result = editId
      ? await modifierDepense(session.access_token, editId, payload)
      : await ajouterDepense(userId, session.access_token, payload);
    setSaving(false);
    if (result.ok) {
      setFormOpen(false);
      const etaitFuture = fEstFuture;
      const modifiait = !!editId;
      setEditId(null);
      setEditRecurrenceOriginale(null);
      setEditSnapshot(null);
      setFMontant("");
      setFDescription("");
      setFRecurrence("aucune");
      await charger(userId);
      setToast(modifiait ? "Dépense modifiée." : etaitFuture ? "Dépense planifiée." : "Dépense ajoutée.");
    } else {
      setToast(result.error || (editId ? "Échec de la modification." : "Échec de l'ajout."));
    }
    setTimeout(() => setToast(null), 2500);
  }

  // Système de sheets de confirmation/explication (24/08/2026, brief CEO)
  // — avant toute action importante ou difficilement réversible, expliquer
  // clairement ce qui va se passer plutôt qu'un simple "Êtes-vous sûr ?".
  // Un seul composant générique, réutilisé pour les 5 actions concernées
  // ici (ajouter/modifier/supprimer une dépense, retirer un budget,
  // supprimer un objectif) — jamais systématique : le checkbox d'étape,
  // le renouvellement récurrent, etc. restent des actions directes.
  type SheetAction = {
    titre: string; message: string;
    recap?: { label: string; valeur: string }[];
    labelConfirmer: string; labelAnnuler: string;
    danger?: boolean; onConfirm: () => void | Promise<void>;
  };
  const [sheetAction, setSheetAction] = useState<SheetAction | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  function soumettre() {
    const montant = Number(fMontant.replace(/[^\d]/g, ""));
    if (!montant || montant <= 0) { setToast("Entrez un montant valide."); setTimeout(() => setToast(null), 2000); return; }
    if (editId) {
      setSheetAction({
        titre: "Modifier cette dépense ?",
        message: "Vous allez modifier les informations de cette dépense. Les nouvelles informations remplaceront les données actuelles.",
        labelConfirmer: "Modifier la dépense", labelAnnuler: "Annuler",
        onConfirm: executerSoumission,
      });
    } else {
      setSheetAction({
        titre: fEstFuture ? "Planifier cette dépense ?" : "Ajouter cette dépense ?",
        message: "Vérifiez les informations avant de l'ajouter à votre suivi.",
        recap: [
          { label: "Catégorie", valeur: CATEGORIE_LABEL[fCategorie] },
          { label: "Montant", valeur: formatGNF(montant) },
          { label: "Description", valeur: fDescription.trim() || "—" },
          { label: "Date", valeur: new Date(fDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) },
        ],
        labelConfirmer: fEstFuture ? "Planifier cette dépense" : "Ajouter la dépense", labelAnnuler: "Modifier",
        onConfirm: executerSoumission,
      });
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={40}/>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`
        .tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.97)}
        @keyframes screenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <CompteHeader titre="Mes dépenses" fondNeutre retourHref="/?menu=1"/>

      {/* Centre de pilotage (Lot 1, 24/08/2026) — répond à "où j'en suis /
          combien puis-je encore dépenser" ; remplace le simple total du
          mois. La 3e question du brief ("que dois-je surveiller
          aujourd'hui") arrive avec les Lots 3/6/11 — non dupliquée ici. */}
      <div style={{ padding: "24px 20px 8px", animation: "screenIn 0.35s ease" }}>
        <div style={{ color: t2, fontSize: "12.5px", fontWeight: "700", marginBottom: "6px" }}>Ce mois-ci</div>
        <div style={{ color: t1, fontSize: "34px", fontWeight: "900", marginBottom: budgetGlobalMensuel ? "4px" : "16px" }}>{formatGNF(totalMois)}</div>

        {budgetGlobalMensuel ? (
          <>
            <div style={{ color: resteMensuel !== null && resteMensuel < 0 ? "#ef4444" : t2, fontSize: "13px", fontWeight: "700", marginBottom: "3px" }}>
              {resteMensuel !== null && resteMensuel >= 0
                ? `${formatGNF(resteMensuel)} restant sur votre objectif mensuel`
                : `Objectif mensuel dépassé de ${formatGNF(Math.abs(resteMensuel ?? 0))}`}
            </div>
            <div style={{ color: t2, fontSize: "12px", marginBottom: "16px" }}>
              {resteMensuel !== null && resteMensuel > 0
                ? `≈ ${formatGNF(resteMensuel / joursRestantsMois)}/jour jusqu'au ${finMoisLabel}`
                : "Ajustez votre objectif si besoin, depuis le détail plus bas."}
            </div>
          </>
        ) : (
          <button onClick={() => setObjectifSheetOpen(true)} className="tap" style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", padding: 0, marginBottom: "16px", color: "#F5A623", fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
            Définir un objectif mensuel
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        )}

        {actionRecommandee && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "10px", borderRadius: "16px", padding: "14px",
            marginBottom: "14px",
            backgroundColor: actionRecommandee.ton === "critique" ? "rgba(239,68,68,0.1)" : actionRecommandee.ton === "alerte" ? "rgba(234,179,8,0.1)" : actionRecommandee.ton === "positif" ? "rgba(34,197,94,0.1)" : card,
            border: actionRecommandee.ton === "critique" ? "1px solid rgba(239,68,68,0.25)" : actionRecommandee.ton === "alerte" ? "1px solid rgba(234,179,8,0.25)" : actionRecommandee.ton === "positif" ? "1px solid rgba(34,197,94,0.25)" : `1px solid ${brd}`,
          }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", marginTop: "5px", flexShrink: 0, backgroundColor: actionRecommandee.ton === "critique" ? "#ef4444" : actionRecommandee.ton === "alerte" ? "#eab308" : actionRecommandee.ton === "positif" ? "#22c55e" : "#F5A623" }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: t1, fontSize: "12.5px", fontWeight: "700", lineHeight: "1.5" }}>{actionRecommandee.texte}</div>
              {actionRecommandee.action && (
                <button onClick={actionRecommandee.action.onClick} className="tap" style={{ background: "none", border: "none", padding: 0, marginTop: "6px", color: "#F5A623", fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
                  {actionRecommandee.action.label} →
                </button>
              )}
            </div>
          </div>
        )}

        <button onClick={ouvrirAjout} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: "pointer" }}>
          + Ajouter une dépense
        </button>
      </div>

      {lignes.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: t3, fontSize: "13.5px", lineHeight: "1.6" }}>
          Rien à afficher pour l&apos;instant. Ajoutez une dépense (passée ou à venir), ou prenez un rendez-vous payant sur Yelen — il apparaîtra ici automatiquement.
        </div>
      ) : (
        <div style={{ padding: "8px 20px 40px" }}>
          {/* Aujourd'hui (Lot 2, 24/08/2026) — couche quotidienne, toujours
              affichée (même à 0 GNF, c'est un fait réel, pas un bloc vide).
              La jauge/le reste n'apparaissent que si un objectif est
              configuré (Lot 1). */}
          <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", marginBottom: "16px", boxShadow: ombre }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800" }}>Aujourd&apos;hui</div>
              <button onClick={ouvrirAjout} className="tap" aria-label="Ajouter une dépense" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "50%", background: "rgba(245,166,35,0.14)", border: "none", color: "#F5A623", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
            <div style={{ color: t1, fontSize: "22px", fontWeight: "900", marginBottom: objectifQuotidien !== null ? "10px" : "0" }}>{formatGNF(depenseAujourdhui)} dépensés</div>
            {objectifQuotidien !== null && (
              <>
                <div style={{ height: "6px", borderRadius: "3px", backgroundColor: card2, overflow: "hidden", marginBottom: "8px" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (depenseAujourdhui / objectifQuotidien) * 100)}%`, borderRadius: "3px", backgroundColor: resteAujourdhui !== null && resteAujourdhui < 0 ? "#ef4444" : "#22c55e" }}/>
                </div>
                <div style={{ color: t2, fontSize: "11.5px", marginBottom: "4px" }}>Objectif quotidien : {formatGNF(objectifQuotidien)}</div>
                <div style={{ color: resteAujourdhui !== null && resteAujourdhui < 0 ? "#ef4444" : t2, fontSize: "12.5px", fontWeight: "700" }}>
                  {resteAujourdhui !== null && resteAujourdhui >= 0
                    ? `${formatGNF(resteAujourdhui)} disponibles`
                    : `Vous avez dépassé votre repère quotidien de ${formatGNF(Math.abs(resteAujourdhui ?? 0))}.`}
                </div>
              </>
            )}
          </div>

          {rythme && (
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", marginBottom: "16px", boxShadow: ombre }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "8px" }}>Votre rythme</div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: "1.5", marginBottom: "6px" }}>
                Vous avez dépensé {formatGNF(totalMois)} en {joursEcoulesMois} jour{joursEcoulesMois > 1 ? "s" : ""}.
              </div>
              <div style={{ color: rythme.ton, fontSize: "13px", fontWeight: "800", marginBottom: rythme.conseil ? "6px" : "0" }}>{rythme.texte}</div>
              {rythme.conseil && <div style={{ color: t2, fontSize: "12px", lineHeight: "1.5" }}>{rythme.conseil}</div>}
            </div>
          )}

          {prochainesRecurrentes.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>Prochaine dépense prévue</div>
              <button onClick={() => setDetail(prochainesRecurrentes[0])} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "12px", backgroundColor: card, borderRadius: "16px", padding: "14px", border: "none", boxShadow: ombre, cursor: "pointer" }}>
                <span style={{ transform: "scale(0.75)", transformOrigin: "left center" }}>{Illu[prochainesRecurrentes[0].categorie]()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{prochainesRecurrentes[0].description || CATEGORIE_LABEL[prochainesRecurrentes[0].categorie]} — {formatGNF(prochainesRecurrentes[0].montant)}</div>
                  <div style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: "700", marginTop: "2px" }}>{texteEcheance(prochainesRecurrentes[0].recurrence_prochaine_date as string)}</div>
                </div>
              </button>
            </div>
          )}

          {aVenir.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>À venir</div>
              <div style={{ display: "flex", gap: "10px", overflowX: "auto", margin: "0 -20px", padding: "0 20px 4px" }}>
                {aVenir.map((l, i) => (
                  <button key={l.id} onClick={() => setDetail(l)} className="tap" style={{ flexShrink: 0, minWidth: "132px", textAlign: "left", backgroundColor: card, borderRadius: "18px", padding: "14px", border: "none", borderLeft: "3px solid #F5A623", boxShadow: ombre, cursor: "pointer", animation: `cardIn 0.3s ease ${i * 0.05}s both` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ transform: "scale(0.75)", transformOrigin: "left center" }}>{Illu[l.categorie]()}</span>
                      <span style={{ color: "#F5A623", fontSize: "10px", fontWeight: "800" }}>{texteEcheance(l.date_depense)}</span>
                    </div>
                    <div style={{ color: t1, fontSize: "14px", fontWeight: "900", whiteSpace: "nowrap" }}>{formatGNF(l.montant)}</div>
                    <div style={{ color: t2, fontSize: "10.5px", fontWeight: "700", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.description || CATEGORIE_LABEL[l.categorie]}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(categoriesAffichees.length > 0 || depenseYelenMois > 0) && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>Par catégorie</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {categoriesAffichees.map((cat, i) => {
                  const montant = parCategorie.get(cat) ?? 0;
                  const budget = budgetsCategorie.find((b) => b.categorie === cat) ?? null;
                  const pct = budget ? Math.min(100, Math.round((montant / budget.montant_limite) * 100)) : 0;
                  const depasse = budget ? montant > budget.montant_limite : false;
                  return (
                    <button key={cat} onClick={() => ouvrirBudgetCategorie(cat)} className="tap" style={{ width: "100%", textAlign: "left", backgroundColor: card, borderRadius: "16px", padding: "14px", border: "none", boxShadow: ombre, cursor: "pointer", animation: `cardIn 0.3s ease ${i * 0.05}s both` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ transform: "scale(0.75)", transformOrigin: "left center", flexShrink: 0 }}>{Illu[cat]()}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "3px" }}>{CATEGORIE_LABEL[cat]}</div>
                          {budget ? (
                            <div style={{ color: depasse ? "#ef4444" : t1, fontSize: "13px", fontWeight: "800" }}>
                              {formatGNF(montant)} <span style={{ color: t2, fontWeight: "600" }}>/ {formatGNF(budget.montant_limite)}</span>
                            </div>
                          ) : (
                            <>
                              <div style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{formatGNF(montant)}</div>
                              <div style={{ color: t3, fontSize: "11px", fontWeight: "600", marginTop: "2px" }}>Aucun budget défini</div>
                            </>
                          )}
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: t3, flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
                      </div>
                      {budget && (
                        <>
                          <div style={{ height: "6px", borderRadius: "3px", backgroundColor: card2, overflow: "hidden", marginTop: "10px" }}>
                            <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", backgroundColor: depasse ? "#ef4444" : "#22c55e" }}/>
                          </div>
                          <div style={{ color: depasse ? "#ef4444" : t2, fontSize: "10.5px", fontWeight: "800", marginTop: "5px" }}>{depasse ? `Dépassé — ${pct}%` : `${pct}%`}</div>
                        </>
                      )}
                    </button>
                  );
                })}
                {depenseYelenMois > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", backgroundColor: card, borderRadius: "16px", padding: "14px", boxShadow: ombre }}>
                    <span style={{ transform: "scale(0.75)", transformOrigin: "left center", flexShrink: 0 }}>{Illu.yelen()}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "3px" }}>{CATEGORIE_LABEL.yelen}</div>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{formatGNF(depenseYelenMois)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mes objectifs (Lot 5, 24/08/2026) — montant_actuel toujours
              dérivé des contributions chargées, jamais stocké. */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800" }}>Mes objectifs</div>
              <button onClick={() => setNouvelObjectifOuvert(true)} className="tap" style={{ color: "#F5A623", fontSize: "11.5px", fontWeight: "800", background: "none", border: "none", cursor: "pointer" }}>+ Nouvel objectif</button>
            </div>
            {objectifs.filter((o) => o.statut !== "abandonne").length === 0 ? (
              <div style={{ backgroundColor: card, borderRadius: "16px", padding: "16px", boxShadow: ombre, color: t2, fontSize: "12.5px", lineHeight: "1.5" }}>
                Économiser pour un loyer, un voyage, une réserve… Créez un objectif et suivez votre progression ici.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {objectifs.filter((o) => o.statut !== "abandonne").map((o) => {
                  const actuel = contributions.filter((c) => c.objectif_id === o.id).reduce((s, c) => s + c.montant, 0);
                  const pct = Math.min(100, Math.round((actuel / o.montant_cible) * 100));
                  const reste = o.montant_cible - actuel;
                  return (
                    <button key={o.id} onClick={() => setObjectifDetail(o)} className="tap" style={{ width: "100%", textAlign: "left", backgroundColor: card, borderRadius: "16px", padding: "14px", border: "none", boxShadow: ombre, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                        <div style={{ flex: 1, minWidth: 0, color: t1, fontSize: "13.5px", fontWeight: "800" }}>{o.titre}</div>
                        {o.statut === "atteint" && <span style={{ color: "#22c55e", fontSize: "10.5px", fontWeight: "800", backgroundColor: "rgba(34,197,94,0.12)", padding: "2px 9px", borderRadius: "20px", flexShrink: 0 }}>Atteint</span>}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: t3, flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
                      </div>
                      <div style={{ height: "6px", borderRadius: "3px", backgroundColor: card2, overflow: "hidden", marginBottom: "6px" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", backgroundColor: "#F5A623" }}/>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: t1, fontSize: "12px", fontWeight: "800" }}>{formatGNF(actuel)} <span style={{ color: t2, fontWeight: "600" }}>/ {formatGNF(o.montant_cible)}</span></span>
                        <span style={{ color: t1, fontSize: "12px", fontWeight: "800" }}>{pct}%</span>
                      </div>
                      {reste > 0 && o.deadline && (
                        <div style={{ color: t3, fontSize: "11px", marginTop: "5px" }}>
                          Il reste {joursJusquau(o.deadline)} jour{joursJusquau(o.deadline) > 1 ? "s" : ""} — pour l&apos;atteindre, mettez de côté ≈ {formatGNF(reste / joursJusquau(o.deadline))}/jour
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {insights.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>À surveiller</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {insights.slice(0, 5).map((ins, i) => {
                  const contenu = (
                    <>
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", marginTop: "5px", flexShrink: 0, backgroundColor: ins.ton === "alerte" ? "#ef4444" : "#F5A623" }}/>
                      <span style={{ flex: 1, color: t1, fontSize: "12.5px", fontWeight: "700", lineHeight: "1.5" }}>{ins.texte}</span>
                      {ins.categorie && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: t3, flexShrink: 0, marginTop: "2px" }}><path d="m9 18 6-6-6-6"/></svg>}
                    </>
                  );
                  return ins.categorie ? (
                    <button key={i} onClick={() => ouvrirBudgetCategorie(ins.categorie as CategorieDepenseId)} className="tap" style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: "10px", backgroundColor: card, borderRadius: "14px", padding: "12px 14px", border: "none", boxShadow: ombre, cursor: "pointer", textAlign: "left" }}>
                      {contenu}
                    </button>
                  ) : (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", backgroundColor: card, borderRadius: "14px", padding: "12px 14px", boxShadow: ombre }}>
                      {contenu}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vue calendrier (Lot 7) — composant dédié (calendrier-depenses.tsx),
              simple point d'entrée ici. */}
          <button onClick={() => setCalendrierOuvert(true)} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: card, borderRadius: "16px", padding: "14px 16px", border: "none", boxShadow: ombre, cursor: "pointer", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>Voir le calendrier des dépenses</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t3} strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>

          {totalMois > 0 && joursEcoulesMois > 0 && (
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", marginBottom: "16px", boxShadow: ombre }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "8px" }}>Prévisions</div>
              <div style={{ color: t2, fontSize: "12.5px", lineHeight: "1.5" }}>
                À ce rythme, vous devriez atteindre environ <strong style={{ color: t1 }}>{formatGNF(projectionFinMois)}</strong> d&apos;ici le {finMoisLabel}.
              </div>
              {depassementProjete !== null && (
                <div style={{ color: "#ef4444", fontSize: "13px", fontWeight: "800", marginTop: "8px" }}>
                  Soit {formatGNF(depassementProjete)} de plus que votre objectif mensuel.
                </div>
              )}
              {previsionsCategorie.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
                  {previsionsCategorie.map((p) => (
                    <div key={p.categorie} style={{ color: "#eab308", fontSize: "12px", fontWeight: "700", lineHeight: "1.5" }}>
                      {CATEGORIE_LABEL[p.categorie]} : au rythme actuel, vous devriez dépasser votre limite ({formatGNF(p.projection)} / {formatGNF(p.limite)} prévus).
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(totalMois > 0 || totalMoisDernier > 0) && (
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", marginBottom: "16px", boxShadow: ombre }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "800", marginBottom: "10px" }}>Analyse mensuelle</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
                <span style={{ color: t1, fontSize: "18px", fontWeight: "900" }}>{formatGNF(totalMois)}</span>
                {variationMois !== null && (
                  <span style={{ color: variationMois > 0 ? "#ef4444" : variationMois < 0 ? "#22c55e" : t2, fontSize: "12px", fontWeight: "800" }}>
                    {variationMois > 0 ? "+" : ""}{variationMois}% vs {moisDernierLabel}
                  </span>
                )}
              </div>
              {totalMoisDernier > 0 && (
                <div style={{ color: t3, fontSize: "11.5px", marginBottom: "10px" }}>{moisDernierLabel} : {formatGNF(totalMoisDernier)}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", paddingTop: "10px", borderTop: `1px solid ${brd}` }}>
                {topCategorie && (
                  <div style={{ color: t2, fontSize: "12px", lineHeight: "1.5" }}>
                    Catégorie la plus dépensée : <strong style={{ color: t1 }}>{CATEGORIE_LABEL[topCategorie]}</strong>
                    {topCategorieMoisDernier && topCategorieMoisDernier !== topCategorie ? ` (c'était ${CATEGORIE_LABEL[topCategorieMoisDernier]} le mois dernier)` : ""}
                    {/* Lot 15 "Mes dépenses V2" (24/08/2026) — CTA vers Mes
                        démarches redevenu une action contextuelle secondaire
                        (lien texte à côté du fait qui le justifie), plus
                        une carte gradient permanente en tête d'écran. */}
                    {" — "}
                    <Link href="/compte/mes-demarches" className="tap" style={{ color: "#F5A623", fontWeight: "700", textDecoration: "none" }}>
                      Organiser un suivi →
                    </Link>
                  </div>
                )}
                {budgetsCategorie.length > 0 && (
                  <div style={{ color: t2, fontSize: "12px", lineHeight: "1.5" }}>
                    Budgets respectés ce mois-ci : <strong style={{ color: t1 }}>{budgetsRespectesCeMois} / {budgetsCategorie.length}</strong>
                  </div>
                )}
                <div style={{ color: t2, fontSize: "12px", lineHeight: "1.5" }}>
                  Dépenses enregistrées ce mois-ci : <strong style={{ color: t1 }}>{lignesMois.length}</strong>
                </div>
              </div>
            </div>
          )}

          {historique.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: "800" }}>Historique</div>
                <button onClick={() => setHistTri((t) => t === "recent" ? "montant" : "recent")} className="tap" style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", padding: 0, color: t2, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="2.5" strokeLinecap="round"><path d="M3 7h18M6 12h12M10 17h4"/></svg>
                  {histTri === "recent" ? "Plus récent" : "Montant"}
                </button>
              </div>

              <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "10px", paddingBottom: "2px" }}>
                <button onClick={() => setHistFiltre("toutes")} className="tap" style={{ flexShrink: 0, padding: "6px 12px", borderRadius: "20px", border: "none", backgroundColor: histFiltre === "toutes" ? "#F5A623" : card2, color: histFiltre === "toutes" ? "#080812" : t2, fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>
                  Toutes
                </button>
                {CATEGORIES_DEPENSE.map((c) => (
                  <button key={c.id} onClick={() => setHistFiltre(c.id)} className="tap" style={{ flexShrink: 0, padding: "6px 12px", borderRadius: "20px", border: "none", backgroundColor: histFiltre === c.id ? "#F5A623" : card2, color: histFiltre === c.id ? "#080812" : t2, fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>
                    {c.label}
                  </button>
                ))}
              </div>

              {historiqueAffiche.length === 0 ? (
                <div style={{ backgroundColor: card, borderRadius: "18px", padding: "20px", boxShadow: ombre, color: t2, fontSize: "12.5px", textAlign: "center" }}>
                  Aucune dépense {CATEGORIE_LABEL[histFiltre as CategorieDepenseId]} pour l&apos;instant.
                </div>
              ) : (
                <div style={{ backgroundColor: card, borderRadius: "18px", overflow: "hidden", boxShadow: ombre }}>
                  {historiqueAffiche.map((l, i) => (
                    <button key={l.id} onClick={() => setDetail(l)} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", width: "100%", border: "none", background: "none", borderBottom: i < historiqueAffiche.length - 1 ? `1px solid ${brd}` : "none", cursor: "pointer", textAlign: "left" }}>
                      {Illu[l.source === "yelen" ? "yelen" : l.categorie]()}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: t1, fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.source === "yelen" ? (l.description || "Rendez-vous Yelen") : (l.description || CATEGORIE_LABEL[l.categorie])}
                        </div>
                        <div style={{ color: t3, fontSize: "11px" }}>{new Date(l.date_depense).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                      </div>
                      <span style={{ color: t1, fontSize: "13px", fontWeight: "800", flexShrink: 0 }}>{formatGNF(l.montant)}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: t3, flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", padding: "10px 18px", borderRadius: "20px", backgroundColor: "#080812", color: "#fff", fontSize: "12.5px", fontWeight: "700", animation: "toastIn 0.25s ease", zIndex: 300 }}>
          {toast}
        </div>
      )}

      {formOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => { setFormOpen(false); setEditId(null); setEditRecurrenceOriginale(null); setEditSnapshot(null); }} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>{editId ? "Modifier la dépense" : fEstFuture ? "Planifier une dépense" : "Ajouter une dépense"}</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            {/* Lot 10 "Ajout rapide" — montant en premier (le geste le plus
                fréquent), catégorie juste après, confirmer : 3 gestes sans
                déplier quoi que ce soit. */}
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Montant (GNF)</div>
              <input autoFocus value={fMontant} onChange={e => setFMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 50000" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "17px", fontWeight: "800", boxSizing: "border-box" }}/>
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: "700", margin: "18px 0 8px" }}>Catégorie</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {CATEGORIES_DEPENSE.map(c => (
                <button key={c.id} onClick={() => setFCategorie(c.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px 6px 6px", borderRadius: "24px", border: "none", backgroundColor: fCategorie === c.id ? "#F5A623" : card2, cursor: "pointer" }}>
                  <span style={{ transform: "scale(0.7)", transformOrigin: "center" }}>{Illu[c.id]()}</span>
                  <span style={{ color: fCategorie === c.id ? "#080812" : t1, fontSize: "12.5px", fontWeight: "700" }}>{c.label}</span>
                </button>
              ))}
            </div>

            <button onClick={soumettre} disabled={saving || !formModifie} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: saving || !formModifie ? "default" : "pointer", opacity: saving || !formModifie ? 0.5 : 1, marginTop: "22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {saving ? <YelenLoader size={16} color="#080812"/> : editId ? "Modifier" : fEstFuture ? "Planifier cette dépense" : "Ajouter"}
            </button>

            <button onClick={() => setAvanceOuvert((v) => !v)} className="tap" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", width: "100%", background: "none", border: "none", padding: "16px 0 4px", color: t2, fontSize: "12px", fontWeight: "800", cursor: "pointer" }}>
              {avanceOuvert ? "Moins d'options" : "Plus d'options"}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={t2} strokeWidth="3" strokeLinecap="round" style={{ transform: avanceOuvert ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }}><path d="m9 18 6-6-6-6"/></svg>
            </button>

            {avanceOuvert && (
              <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre, marginTop: "8px" }}>
                <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Description (optionnel)</div>
                <input value={fDescription} onChange={e => setFDescription(e.target.value)} placeholder="Ex : Marché du quartier" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "600", marginBottom: "16px", boxSizing: "border-box" }}/>

                <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Date</div>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "600", boxSizing: "border-box" }}/>
                {fEstFuture && (
                  <div style={{ color: t2, fontSize: "11.5px", lineHeight: "1.5", marginTop: "10px" }}>
                    Date dans le futur : cette dépense sera classée &quot;À venir&quot; jusqu&apos;à cette date.
                  </div>
                )}

                <div style={{ color: t2, fontSize: "12px", fontWeight: "700", margin: "16px 0 8px" }}>Récurrence (optionnel)</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["aucune", "hebdomadaire", "mensuel"] as const).map((r) => (
                    <button key={r} onClick={() => setFRecurrence(r)} className="tap" style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", backgroundColor: fRecurrence === r ? "#F5A623" : card2, color: fRecurrence === r ? "#080812" : t1, fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>{r === "aucune" ? "Aucune" : r === "hebdomadaire" ? "Chaque semaine" : "Chaque mois"}</button>
                  ))}
                </div>
                {fRecurrence !== "aucune" && (
                  <div style={{ color: t2, fontSize: "11.5px", lineHeight: "1.5", marginTop: "10px" }}>
                    Yelen vous rappellera cette dépense à chaque échéance ; vous pourrez l&apos;enregistrer à nouveau en un geste depuis son détail.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {objectifSheetOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setObjectifSheetOpen(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>Objectif mensuel</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ color: t2, fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}>
              Le montant maximum que vous souhaitez dépenser au total ce mois-ci, toutes catégories confondues. Vous pourrez le modifier à tout moment.
            </div>
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Montant (GNF)</div>
              <input value={objectifMontant} onChange={(e) => setObjectifMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 600000" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "15px", fontWeight: "700", boxSizing: "border-box" }}/>
            </div>
            <button onClick={soumettreObjectifMensuel} disabled={objectifSaving} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: objectifSaving ? "default" : "pointer", opacity: objectifSaving ? 0.7 : 1, marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {objectifSaving ? <YelenLoader size={16} color="#080812"/> : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {budgetCatOuvert && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setBudgetCatOuvert(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>Budget {CATEGORIE_LABEL[budgetCatOuvert]}</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ color: t2, fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}>
              La limite que vous souhaitez suivre pour cette catégorie. Yelen affichera votre progression et vous alertera en cas de dépassement.
            </div>
            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre, marginBottom: "20px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Montant limite (GNF)</div>
              <input value={budgetCatMontant} onChange={(e) => setBudgetCatMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 200000" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "15px", fontWeight: "700", marginBottom: "16px", boxSizing: "border-box" }}/>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Période</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {(["mensuel", "hebdomadaire"] as const).map((p) => (
                  <button key={p} onClick={() => setBudgetCatPeriode(p)} className="tap" style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", backgroundColor: budgetCatPeriode === p ? "#F5A623" : card2, color: budgetCatPeriode === p ? "#080812" : t1, fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }}>{p === "mensuel" ? "Mensuel" : "Hebdomadaire"}</button>
                ))}
              </div>
            </div>
            <button onClick={soumettreBudgetCategorie} disabled={budgetCatSaving} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: budgetCatSaving ? "default" : "pointer", opacity: budgetCatSaving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {budgetCatSaving ? <YelenLoader size={16} color="#080812"/> : "Enregistrer"}
            </button>
            {budgetsCategorie.some((b) => b.categorie === budgetCatOuvert) && (
              <button onClick={() => budgetCatOuvert && setSheetAction({
                titre: "Retirer ce budget ?",
                message: `Le budget ${CATEGORIE_LABEL[budgetCatOuvert]} sera supprimé. Yelen arrêtera de suivre vos dépenses par rapport à cette limite et de vous alerter en cas de dépassement.`,
                danger: true, labelConfirmer: "Retirer le budget", labelAnnuler: "Annuler",
                onConfirm: retirerBudgetCategorie,
              })} disabled={budgetCatSaving} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "24px", border: "none", backgroundColor: "transparent", color: "#ef4444", fontSize: "13px", fontWeight: "700", cursor: budgetCatSaving ? "default" : "pointer", marginTop: "8px" }}>
                Retirer ce budget
              </button>
            )}
          </div>
        </div>
      )}

      {nouvelObjectifOuvert && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setNouvelObjectifOuvert(false)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>Nouvel objectif</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Titre</div>
            <input value={noTitre} onChange={(e) => setNoTitre(e.target.value)} placeholder="Ex : Préparer mon loyer" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "600", marginBottom: "16px", boxSizing: "border-box" }}/>

            <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre, marginBottom: "20px" }}>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Montant cible (GNF)</div>
              <input value={noMontant} onChange={(e) => setNoMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 1000000" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "15px", fontWeight: "700", marginBottom: "16px", boxSizing: "border-box" }}/>

              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Échéance (optionnel)</div>
              <input type="date" value={noDeadline} onChange={(e) => setNoDeadline(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "600", marginBottom: "16px", boxSizing: "border-box" }}/>

              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Rythme prévu (optionnel)</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {(["hebdomadaire", "mensuel", "unique"] as const).map((c) => (
                  <button key={c} onClick={() => setNoCadence((prev) => (prev === c ? null : c))} className="tap" style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", backgroundColor: noCadence === c ? "#F5A623" : card2, color: noCadence === c ? "#080812" : t1, fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>{c === "hebdomadaire" ? "Chaque semaine" : c === "mensuel" ? "Chaque mois" : "Ponctuel"}</button>
                ))}
              </div>
            </div>

            <button onClick={soumettreNouvelObjectif} disabled={noSaving} className="tap" style={{ width: "100%", padding: "16px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "14.5px", fontWeight: "800", cursor: noSaving ? "default" : "pointer", opacity: noSaving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {noSaving ? <YelenLoader size={16} color="#080812"/> : "Créer l'objectif"}
            </button>
          </div>
        </div>
      )}

      {objectifDetail && (() => {
        const actuel = contributions.filter((c) => c.objectif_id === objectifDetail.id).reduce((s, c) => s + c.montant, 0);
        const pct = Math.min(100, Math.round((actuel / objectifDetail.montant_cible) * 100));
        const reste = objectifDetail.montant_cible - actuel;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
            <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
              <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                <button onClick={() => setObjectifDetail(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>{objectifDetail.titre}</div>
                <div/>
              </div>
            </header>

            <div style={{ padding: "24px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{ color: t1, fontSize: "28px", fontWeight: "900" }}>{formatGNF(actuel)}</div>
                <div style={{ color: t2, fontSize: "13px", fontWeight: "700", marginTop: "2px" }}>sur {formatGNF(objectifDetail.montant_cible)}</div>
                {objectifDetail.statut === "atteint" && (
                  <div style={{ display: "inline-block", marginTop: "10px", padding: "3px 10px", borderRadius: "20px", background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontSize: "11px", fontWeight: "800" }}>
                    Objectif atteint
                  </div>
                )}
              </div>

              <div style={{ height: "8px", borderRadius: "4px", backgroundColor: card2, overflow: "hidden", marginBottom: "6px" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: "4px", backgroundColor: "#F5A623" }}/>
              </div>
              <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "20px" }}>{pct}%</div>

              {reste > 0 && objectifDetail.deadline && (
                <div style={{ backgroundColor: card, borderRadius: "16px", padding: "14px", boxShadow: ombre, marginBottom: "20px", color: t2, fontSize: "12.5px", lineHeight: "1.5" }}>
                  Il vous reste {joursJusquau(objectifDetail.deadline)} jour{joursJusquau(objectifDetail.deadline) > 1 ? "s" : ""}. Pour atteindre votre objectif, mettez de côté environ <strong style={{ color: t1 }}>{formatGNF(reste / joursJusquau(objectifDetail.deadline))}/jour</strong>.
                </div>
              )}

              {objectifDetail.statut === "actif" && (
                <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombre, marginBottom: "16px" }}>
                  <div style={{ color: t2, fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>Ajouter une contribution (GNF)</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input value={contribMontant} onChange={(e) => setContribMontant(e.target.value)} inputMode="numeric" placeholder="Ex : 50000" style={{ flex: 1, padding: "12px 14px", borderRadius: "12px", border: "none", backgroundColor: card2, color: t1, fontSize: "14px", fontWeight: "700", boxSizing: "border-box" }}/>
                    <button onClick={soumettreContribution} disabled={contribSaving} className="tap" style={{ padding: "0 18px", borderRadius: "12px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "13px", fontWeight: "800", cursor: contribSaving ? "default" : "pointer", opacity: contribSaving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {contribSaving ? <YelenLoader size={14} color="#080812"/> : "Ajouter"}
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => {
                const nbContributions = contributions.filter((c) => c.objectif_id === objectifDetail.id).length;
                setSheetAction({
                  titre: "Supprimer cet objectif ?",
                  message: `« ${objectifDetail.titre} » sera définitivement supprimé${nbContributions > 0 ? `, avec l'historique de ${nbContributions === 1 ? "sa" : "ses"} ${nbContributions} contribution${nbContributions > 1 ? "s" : ""}` : ""}. Cette action ne pourra pas être annulée.`,
                  danger: true, labelConfirmer: "Supprimer l'objectif", labelAnnuler: "Annuler",
                  onConfirm: () => retirerObjectif(objectifDetail.id),
                });
              }} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "24px", border: "none", backgroundColor: "transparent", color: "#ef4444", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                Supprimer cet objectif
              </button>
            </div>
          </div>
        );
      })()}

      {detail && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: bg, overflowY: "auto", animation: "screenIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={() => setDetail(null)} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>Détail de la dépense</div>
              <div/>
            </div>
          </header>

          <div style={{ padding: "24px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                <div style={{ transform: "scale(1.3)" }}>{Illu[detail.source === "yelen" ? "yelen" : detail.categorie]()}</div>
              </div>
              <div style={{ color: t1, fontSize: "26px", fontWeight: "900" }}>{formatGNF(detail.montant)}</div>
              <div style={{ color: t2, fontSize: "13px", fontWeight: "700", marginTop: "4px" }}>{CATEGORIE_LABEL[detail.source === "yelen" ? "yelen" : detail.categorie]}</div>
              {estAVenir(detail) && (
                <div style={{ display: "inline-block", marginTop: "10px", padding: "3px 10px", borderRadius: "20px", background: "rgba(245,166,35,0.14)", border: "1px solid rgba(245,166,35,0.3)", color: "#F5A623", fontSize: "11px", fontWeight: "800" }}>
                  À venir · {texteEcheance(detail.date_depense)}
                </div>
              )}
            </div>

            <div style={{ backgroundColor: card, borderRadius: "18px", overflow: "hidden", boxShadow: ombre, marginBottom: "16px" }}>
              {detail.source === "yelen" ? (
                <>
                  <LigneDetail label="Établissement" valeur={detail.institutionNom || "—"} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Service" valeur={detail.serviceNom || "—"} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Statut du paiement" valeur={detail.statut === "termine" ? "Terminé" : "Confirmé"} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Payé le" valeur={new Date(detail.created_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Heure du paiement" valeur={new Date(detail.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} brd={brd} t2={t2} t1={t1} dernier/>
                </>
              ) : (
                <>
                  {detail.description && <LigneDetail label="Description" valeur={detail.description} brd={brd} t2={t2} t1={t1}/>}
                  <LigneDetail label="Date de la dépense" valeur={new Date(detail.date_depense).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} brd={brd} t2={t2} t1={t1}/>
                  <LigneDetail label="Ajoutée le" valeur={new Date(detail.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} brd={brd} t2={t2} t1={t1}/>
                  {detail.recurrence !== "aucune" ? (
                    <>
                      <LigneDetail label="Récurrence" valeur={detail.recurrence === "hebdomadaire" ? "Chaque semaine" : "Chaque mois"} brd={brd} t2={t2} t1={t1}/>
                      <LigneDetail label="Prochaine échéance" valeur={detail.recurrence_prochaine_date ? new Date(detail.recurrence_prochaine_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"} brd={brd} t2={t2} t1={t1} dernier/>
                    </>
                  ) : (
                    <LigneDetail label="À" valeur={new Date(detail.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} brd={brd} t2={t2} t1={t1} dernier/>
                  )}
                </>
              )}
            </div>

            {detail.source === "manuelle" && detail.recurrence !== "aucune" && (
              <button onClick={() => renouveler(detail.id)} className="tap" style={{ width: "100%", padding: "15px", borderRadius: "24px", border: "none", backgroundColor: "#F5A623", color: "#080812", fontSize: "13.5px", fontWeight: "800", cursor: "pointer", marginBottom: "10px" }}>
                J&apos;ai payé — enregistrer et renouveler
              </button>
            )}

            {/* Lot 13 "Historique V2" — supprimerDepense existait déjà côté
                actions.ts sans jamais être câblé côté UI ; modifierDepense
                ajoutée à côté pour ce même lot. */}
            {detail.source === "manuelle" && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button onClick={() => ouvrirModifier(detail)} className="tap" style={{ flex: 1, padding: "14px", borderRadius: "24px", border: `1px solid ${brd}`, backgroundColor: "transparent", color: t1, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  Modifier
                </button>
                <button onClick={() => setSheetAction({
                  titre: "Supprimer cette dépense ?",
                  message: `Cette dépense de ${formatGNF(detail.montant)} sera supprimée de votre historique. Cette action ne pourra pas être annulée.`,
                  danger: true, labelConfirmer: "Supprimer la dépense", labelAnnuler: "Annuler",
                  onConfirm: () => retirerDepense(detail.id),
                })} className="tap" style={{ flex: 1, padding: "14px", borderRadius: "24px", border: "none", backgroundColor: "transparent", color: "#ef4444", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                  Supprimer
                </button>
              </div>
            )}

            <div style={{ color: t3, fontSize: "11.5px", lineHeight: "1.6", textAlign: "center" }}>
              Ces détails restent privés. Ils nous aident seulement à vous proposer, plus tard, des recommandations qui correspondent à votre vraie activité.
            </div>
          </div>
        </div>
      )}

      {calendrierOuvert && (
        <CalendrierDepenses
          lignes={historique.map((l): LigneCalendrier => ({
            id: l.id, montant: l.montant, date_depense: l.date_depense,
            label: l.source === "yelen" ? (l.description || "Rendez-vous Yelen") : (l.description || CATEGORIE_LABEL[l.categorie]),
          }))}
          card={card} card2={card2} t1={t1} t2={t2} t3={t3} brd={brd} isDark={isDark} ombre={ombre}
          onFermer={() => setCalendrierOuvert(false)}
        />
      )}

      {sheetAction && (
        <div onClick={() => { if (!sheetBusy) setSheetAction(null); }} style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}` }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: "900", marginBottom: "8px" }}>{sheetAction.titre}</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: "1.5", marginBottom: sheetAction.recap ? "14px" : "18px" }}>{sheetAction.message}</div>
            {sheetAction.recap && (
              <div style={{ backgroundColor: card2, borderRadius: "14px", padding: "12px 14px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "7px" }}>
                {sheetAction.recap.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ color: t2, fontSize: "12px", fontWeight: "600" }}>{r.label}</span>
                    <span style={{ color: t1, fontSize: "12px", fontWeight: "800", textAlign: "right" }}>{r.valeur}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button onClick={async () => { setSheetBusy(true); await sheetAction.onConfirm(); setSheetBusy(false); setSheetAction(null); }} disabled={sheetBusy} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "16px", border: "none", backgroundColor: sheetAction.danger ? "#ef4444" : "#F5A623", color: sheetAction.danger ? "#fff" : "#080812", fontSize: "14px", fontWeight: "800", cursor: sheetBusy ? "default" : "pointer", opacity: sheetBusy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {sheetBusy ? <YelenLoader size={16} color={sheetAction.danger ? "#fff" : "#080812"}/> : sheetAction.labelConfirmer}
              </button>
              <button onClick={() => setSheetAction(null)} disabled={sheetBusy} className="tap" style={{ width: "100%", padding: "14px", borderRadius: "16px", border: `1px solid ${brd}`, backgroundColor: "transparent", color: t1, fontSize: "13.5px", fontWeight: "700", cursor: sheetBusy ? "default" : "pointer", opacity: sheetBusy ? 0.5 : 1 }}>
                {sheetAction.labelAnnuler}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 60px)",
          bottom: "calc(env(safe-area-inset-bottom) + 12px)",
          right: "3px",
          width: "3px",
          zIndex: 90,
          pointerEvents: "none",
          opacity: scrollBarShown ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${scrollPct * (1 - scrollThumbH) * 100}%`,
            height: `${scrollThumbH * 100}%`,
            width: "100%",
            borderRadius: "3px",
            background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)",
          }}
        />
      </div>
    </div>
  );
}

function LigneDetail({ label, valeur, brd, t2, t1, dernier }: { label: string; valeur: string; brd: string; t2: string; t1: string; dernier?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: dernier ? "none" : `1px solid ${brd}` }}>
      <span style={{ color: t2, fontSize: "12.5px", fontWeight: "600" }}>{label}</span>
      <span style={{ color: t1, fontSize: "13px", fontWeight: "700", textTransform: "capitalize", textAlign: "right", maxWidth: "60%" }}>{valeur}</span>
    </div>
  );
}
