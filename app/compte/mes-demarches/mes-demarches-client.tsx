"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader } from "@/components/CompteEcranVide";
import { SECTEUR_LABELS } from "@/lib/secteurs";

// Lot 1 "Mes démarches" (chantier stratégie rétention v2, voir CLAUDE.md
// /chantier-strategie-retention-v2) — checklist personnelle libre, aucune
// donnée partagée avec une institution, aucun modèle pré-rempli par Yelen.
// Écriture directe via Supabase (RLS auth.uid() = citoyen_id), pas de route
// API dédiée : mirroring citoyen_favoris, pas le style service_role-only
// des tables de sécurité — une démarche n'est pas un secret.

const P = { pointerEvents: "none" as const };
const Ic = {
  Plus:      () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Check:     () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Trash:     () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Search:    () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Bldg:      () => <svg style={P} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18M4 21V10l8-7 8 7v11M9 21v-6h6v6"/></svg>,
  X:         () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Clipboard: () => <svg style={P} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M9 12l2 2 4-4"/></svg>,
  Chev:      () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>,
};

const FAQ_DEMARCHES: { q: string; r: string }[] = [
  { q: "Qu'est-ce que \"Mes démarches\" ?", r: "Un espace personnel pour suivre vos dossiers administratifs, vos renouvellements de documents ou toute échéance que vous ne voulez pas oublier — indépendamment de vos rendez-vous pris sur Yelen. Utile pour un citoyen comme pour un entrepreneur ou un chef d'entreprise qui suit ses propres démarches professionnelles (licences, déclarations, fournisseurs…)." },
  { q: "À quoi sert la catégorie Personnel/Professionnel ?", r: "Uniquement à vous y retrouver et à filtrer votre liste. Elle est optionnelle et n'a aucun autre effet — vous pouvez la changer à tout moment depuis le détail d'une démarche." },
  { q: "Dois-je obligatoirement ajouter des étapes ?", r: "Non. Vous pouvez créer une démarche avec juste un titre et une date, comme un simple rappel (ex. l'expiration d'un document). Les étapes servent uniquement si vous voulez suivre une progression détaillée, comme un dossier en plusieurs parties." },
  { q: "Que se passe-t-il quand je coche toutes mes étapes ?", r: "La démarche passe automatiquement au statut \"Terminée\", sans action supplémentaire de votre part." },
  { q: "Quelle est la différence entre \"Terminée\" et \"Clôturée\" ?", r: "\"Terminée\" signifie que toutes les étapes ont été cochées. \"Clôturée\" signifie que vous avez choisi de fermer la démarche vous-même, manuellement, alors qu'il restait au moins une étape non cochée." },
  { q: "Que signifie le badge \"En retard\" ?", r: "Une étape (ou la date cible, si vous n'avez ajouté aucune étape) a dépassé sa date prévue sans avoir été cochée." },
  { q: "L'établissement que je lie à une démarche voit-il cette information ?", r: "Non. Lier un établissement à une démarche est purement indicatif pour vous permettre de vous y retrouver — aucune donnée n'est partagée avec cet établissement." },
  { q: "Puis-je modifier une démarche après l'avoir créée ?", r: "Oui. Depuis le détail d'une démarche, vous pouvez modifier le titre et la date cible, ajouter ou supprimer des étapes à tout moment, et rouvrir une démarche déjà terminée ou clôturée." },
  { q: "Mes démarches sont-elles privées ?", r: "Oui, entièrement. Seul vous pouvez les consulter — aucune institution ni aucun autre citoyen n'y a accès." },
];

type Categorie = "personnel" | "professionnel";
type Etape = { id: string; libelle: string; date_echeance: string | null; fait: boolean; ordre: number };
type Demarche = {
  id: string; titre: string; institution_id: string | null; institution_nom: string | null;
  date_cible: string | null; statut: "en_cours" | "terminee"; created_at: string; etapes: Etape[];
  categorie: Categorie | null; termine_le: string | null;
};
type InstitutionOption = { id: string; name: string; secteur: string | null };

const EXEMPLES_PERSONNEL = ["Renouvellement de passeport", "Dossier universitaire", "Renouvellement d'ordonnance"];
const EXEMPLES_PROFESSIONNEL = ["Renouvellement RCCM", "Déclaration fiscale", "Suivi paiement fournisseur", "Renouvellement de licence commerciale"];

function estEnRetard(d: Demarche): boolean {
  if (d.statut === "terminee") return false;
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  if (d.etapes.length > 0) return d.etapes.some((e) => !e.fait && e.date_echeance && new Date(e.date_echeance) < aujourdHui);
  return !!d.date_cible && new Date(d.date_cible) < aujourdHui;
}

function formatDateCourt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateHeure(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function texteTempsRestant(d: Demarche): string | null {
  const prochaine = d.etapes.length > 0
    ? d.etapes.filter((e) => !e.fait && e.date_echeance).map((e) => e.date_echeance as string).sort()[0] ?? null
    : d.date_cible;
  if (!prochaine) return null;
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const cible = new Date(prochaine); cible.setHours(0, 0, 0, 0);
  const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
  if (jours < 0) return null;
  if (jours === 0) return "Se termine aujourd'hui";
  if (jours === 1) return "Se termine demain";
  return `Se termine dans ${jours} jours`;
}

function joindreListeFr(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function IllustrationVictoire() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
      <g stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" opacity="0.7">
        <line x1="48" y1="0" x2="48" y2="9"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(45 48 40)"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(-45 48 40)"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(90 48 40)"/>
        <line x1="48" y1="0" x2="48" y2="9" transform="rotate(-90 48 40)"/>
      </g>
      <path d="M36 52 L27 89 L48 78 L69 89 L60 52 Z" fill="#C8940A"/>
      <circle cx="48" cy="42" r="27" fill="#F5A623" stroke="#C8940A" strokeWidth="2.5"/>
      <path d="M35 43l9 9 17-18" stroke="#080812" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

export function MesDemarchesClient() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg   = isDark ? "#0A0A0F" : "#F2F2F7";
  const card = isDark ? "#1C1C1E" : "#FFFFFF";
  const t1   = isDark ? "#FFFFFF" : "#000000";
  const t2   = isDark ? "#8E8E93" : "#6C6C70";
  const t3   = isDark ? "#636366" : "#AEAEB2";
  const brd  = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [demarches, setDemarches] = useState<Demarche[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [filtre, setFiltre] = useState<"toutes" | "en_cours" | "terminees">("toutes");
  const [filtreCategorie, setFiltreCategorie] = useState<"toutes" | Categorie>("toutes");

  const [creationOuverte, setCreationOuverte] = useState(false);
  const [titreForm, setTitreForm] = useState("");
  const [categorieForm, setCategorieForm] = useState<Categorie | null>(null);
  const [dateCibleForm, setDateCibleForm] = useState("");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutionResultats, setInstitutionResultats] = useState<InstitutionOption[]>([]);
  const [institutionChoisie, setInstitutionChoisie] = useState<InstitutionOption | null>(null);
  const [etapesForm, setEtapesForm] = useState<{ libelle: string; date_echeance: string }[]>([]);
  const [etapeLibelleDraft, setEtapeLibelleDraft] = useState("");
  const [etapeDateDraft, setEtapeDateDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const [detail, setDetail] = useState<Demarche | null>(null);
  const [nouvelleEtapeLibelle, setNouvelleEtapeLibelle] = useState("");
  const [nouvelleEtapeDate, setNouvelleEtapeDate] = useState("");
  const [busyEtapeId, setBusyEtapeId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [editionActive, setEditionActive] = useState(false);
  const [editTitre, setEditTitre] = useState("");
  const [editDateCible, setEditDateCible] = useState("");
  const [editCategorie, setEditCategorie] = useState<Categorie | null>(null);
  const [afficherGuide, setAfficherGuide] = useState(true);
  const [faqOuverte, setFaqOuverte] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{ titre: string; message: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const [celebration, setCelebration] = useState<{ titre: string } | null>(null);

  const clotureeIncompleteDetail = useMemo(() => {
    if (!detail || detail.statut !== "terminee" || detail.etapes.length === 0) return false;
    return !detail.etapes.every((e) => e.fait);
  }, [detail]);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setCitoyenId(session.user.id);
    const { data, error } = await supabase
      .from("citoyen_demarches")
      .select("*, institutions(name), etapes:citoyen_demarche_etapes(*)")
      .eq("citoyen_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) { showToast("Impossible de charger vos démarches.", "error"); return; }
    const normalized: Demarche[] = (data ?? []).map((d: any) => ({
      ...d,
      institution_nom: d.institutions?.name ?? null,
      etapes: (d.etapes ?? []).slice().sort((a: Etape, b: Etape) => a.ordre - b.ordre),
    }));
    setDemarches(normalized);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.replace("/inscription"); return; }
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [router, charger]);

  useEffect(() => {
    if (!creationOuverte) return;
    const q = institutionQuery.trim();
    if (q.length < 2) { setInstitutionResultats([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("institutions").select("id,name,secteur").ilike("name", `%${q}%`).limit(8);
      setInstitutionResultats((data as InstitutionOption[]) ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [institutionQuery, creationOuverte]);

  const kpi = useMemo(() => {
    const list = demarches ?? [];
    return {
      total: list.length,
      enCours: list.filter((d) => d.statut === "en_cours").length,
      terminees: list.filter((d) => d.statut === "terminee").length,
      enRetard: list.filter(estEnRetard).length,
    };
  }, [demarches]);

  const demarchesFiltrees = useMemo(() => {
    let list = demarches ?? [];
    if (filtre === "en_cours") list = list.filter((d) => d.statut === "en_cours");
    if (filtre === "terminees") list = list.filter((d) => d.statut === "terminee");
    if (filtreCategorie !== "toutes") list = list.filter((d) => d.categorie === filtreCategorie);
    return list;
  }, [demarches, filtre, filtreCategorie]);

  const categoriesPresentes = useMemo(() => new Set((demarches ?? []).map((d) => d.categorie).filter(Boolean)), [demarches]);

  function fermerCreation() {
    setCreationOuverte(false);
    setTitreForm(""); setCategorieForm(null); setDateCibleForm(""); setInstitutionQuery(""); setInstitutionResultats([]);
    setInstitutionChoisie(null); setEtapesForm([]); setEtapeLibelleDraft(""); setEtapeDateDraft("");
  }

  function ouvrirCreationDepuisExemple(titre: string, categorie: Categorie) {
    setTitreForm(titre);
    setCategorieForm(categorie);
    setCreationOuverte(true);
  }

  function ajouterEtapeDraft() {
    if (!etapeLibelleDraft.trim()) return;
    setEtapesForm((prev) => [...prev, { libelle: etapeLibelleDraft.trim(), date_echeance: etapeDateDraft }]);
    setEtapeLibelleDraft(""); setEtapeDateDraft("");
  }

  function champsManquantsCreation(): string[] {
    const manques: string[] = [];
    if (!categorieForm) manques.push("une catégorie (Personnel ou Professionnel)");
    if (!dateCibleForm) manques.push("une date cible");
    if (etapesForm.length === 0) manques.push("au moins une étape");
    return manques;
  }

  function handleClicCreer() {
    const manques = champsManquantsCreation();
    if (manques.length === 0) { void handleCreerDemarche(); return; }
    setConfirmation({
      titre: "Démarche non organisée",
      message: `Il manque ${joindreListeFr(manques)}. Sans cela, cette démarche sera plus difficile à suivre et à retrouver (pas de détection "en retard" fiable, pas de progression visible). Vous pouvez la créer quand même, ou revenir compléter ces champs.`,
      onConfirm: () => void handleCreerDemarche(),
    });
  }

  async function handleCreerDemarche() {
    if (!titreForm.trim() || !citoyenId) return;
    setCreating(true);
    const { data: nouvelle, error } = await supabase
      .from("citoyen_demarches")
      .insert({ citoyen_id: citoyenId, titre: titreForm.trim(), categorie: categorieForm, institution_id: institutionChoisie?.id ?? null, date_cible: dateCibleForm || null })
      .select()
      .single();
    if (error || !nouvelle) { setCreating(false); showToast("Impossible de créer la démarche.", "error"); return; }
    if (etapesForm.length > 0) {
      const rows = etapesForm.map((e, idx) => ({
        demarche_id: nouvelle.id, citoyen_id: citoyenId, libelle: e.libelle,
        date_echeance: e.date_echeance || null, ordre: idx,
      }));
      const { error: errEtapes } = await supabase.from("citoyen_demarche_etapes").insert(rows);
      if (errEtapes) showToast("Démarche créée, mais certaines étapes n'ont pas pu être enregistrées.", "error");
    }
    setCreating(false);
    fermerCreation();
    await charger();
    showToast("Démarche créée.");
  }

  async function executerToggleEtape(etape: Etape, demarche: Demarche, nouveauFait: boolean) {
    setBusyEtapeId(etape.id);
    const { error } = await supabase
      .from("citoyen_demarche_etapes")
      .update({ fait: nouveauFait, fait_le: nouveauFait ? new Date().toISOString() : null })
      .eq("id", etape.id);
    setBusyEtapeId(null);
    if (error) { showToast("Impossible de mettre à jour cette étape.", "error"); return; }

    const etapesMaj = demarche.etapes.map((e) => (e.id === etape.id ? { ...e, fait: nouveauFait } : e));
    const toutesFaites = etapesMaj.length > 0 && etapesMaj.every((e) => e.fait);
    let statutMaj = demarche.statut;
    if (toutesFaites && demarche.statut !== "terminee") {
      const { error: errStatut } = await supabase.from("citoyen_demarches").update({ statut: "terminee", termine_le: new Date().toISOString() }).eq("id", demarche.id);
      if (errStatut) showToast("Étape cochée, mais le statut de la démarche n'a pas pu être mis à jour.", "error");
      else { statutMaj = "terminee"; setCelebration({ titre: demarche.titre }); }
    } else if (!toutesFaites && demarche.statut === "terminee") {
      const { error: errStatut } = await supabase.from("citoyen_demarches").update({ statut: "en_cours", termine_le: null }).eq("id", demarche.id);
      if (errStatut) showToast("Étape décochée, mais le statut de la démarche n'a pas pu être mis à jour.", "error");
      else statutMaj = "en_cours";
    }
    const demarcheMaj = { ...demarche, etapes: etapesMaj, statut: statutMaj };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail((d) => (d && d.id === demarche.id ? demarcheMaj : d));
  }

  function handleToggleEtape(etape: Etape, demarche: Demarche) {
    const nouveauFait = !etape.fait;
    if (nouveauFait && etape.date_echeance) {
      const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
      const dateEtape = new Date(etape.date_echeance); dateEtape.setHours(0, 0, 0, 0);
      if (dateEtape.getTime() !== aujourdHui.getTime()) {
        setConfirmation({
          titre: "Confirmer l'étape",
          message: `Cette étape était prévue pour le ${formatDateCourt(etape.date_echeance)}. La marquer terminée aujourd'hui ?`,
          onConfirm: () => void executerToggleEtape(etape, demarche, nouveauFait),
        });
        return;
      }
    }
    void executerToggleEtape(etape, demarche, nouveauFait);
  }

  async function handleAjouterEtapeDetail(demarche: Demarche) {
    if (!nouvelleEtapeLibelle.trim() || !citoyenId) return;
    setBusyAction(true);
    const ordre = demarche.etapes.length > 0 ? Math.max(...demarche.etapes.map((e) => e.ordre)) + 1 : 0;
    const { data, error } = await supabase
      .from("citoyen_demarche_etapes")
      .insert({ demarche_id: demarche.id, citoyen_id: citoyenId, libelle: nouvelleEtapeLibelle.trim(), date_echeance: nouvelleEtapeDate || null, ordre })
      .select()
      .single();
    setBusyAction(false);
    if (error || !data) { showToast("Impossible d'ajouter cette étape.", "error"); return; }
    let demarcheMaj = { ...demarche, etapes: [...demarche.etapes, data as Etape] };
    if (demarche.statut === "terminee") {
      const { error: errStatut } = await supabase.from("citoyen_demarches").update({ statut: "en_cours", termine_le: null }).eq("id", demarche.id);
      if (errStatut) showToast("Étape ajoutée, mais la démarche n'a pas pu être rouverte automatiquement.", "error");
      else demarcheMaj = { ...demarcheMaj, statut: "en_cours" };
    }
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
    setNouvelleEtapeLibelle(""); setNouvelleEtapeDate("");
  }

  async function handleSupprimerEtape(etape: Etape, demarche: Demarche) {
    const { error } = await supabase.from("citoyen_demarche_etapes").delete().eq("id", etape.id);
    if (error) { showToast("Impossible de supprimer cette étape.", "error"); return; }
    const demarcheMaj = { ...demarche, etapes: demarche.etapes.filter((e) => e.id !== etape.id) };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
  }

  async function executerBasculeStatut(demarche: Demarche, nouveauStatut: "en_cours" | "terminee", celebrer: boolean) {
    setBusyAction(true);
    const { error } = await supabase
      .from("citoyen_demarches")
      .update({ statut: nouveauStatut, termine_le: nouveauStatut === "terminee" ? new Date().toISOString() : null })
      .eq("id", demarche.id);
    setBusyAction(false);
    if (error) { showToast("Impossible de mettre à jour la démarche.", "error"); return; }
    const demarcheMaj = { ...demarche, statut: nouveauStatut };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
    if (celebrer) setCelebration({ titre: demarche.titre });
  }

  function handleBasculerStatut(demarche: Demarche) {
    const nouveauStatut: "en_cours" | "terminee" = demarche.statut === "terminee" ? "en_cours" : "terminee";
    if (nouveauStatut === "terminee") {
      const nonCochees = demarche.etapes.filter((e) => !e.fait).length;
      if (nonCochees > 0) {
        setConfirmation({
          titre: "Étapes non cochées",
          message: `${nonCochees} étape${nonCochees > 1 ? "s" : ""} non cochée${nonCochees > 1 ? "s" : ""} sur cette démarche. La clôturer quand même ?`,
          onConfirm: () => executerBasculeStatut(demarche, nouveauStatut, false),
        });
        return;
      }
    }
    void executerBasculeStatut(demarche, nouveauStatut, nouveauStatut === "terminee");
  }

  async function executerSuppressionDemarche(demarche: Demarche) {
    const { error } = await supabase.from("citoyen_demarches").delete().eq("id", demarche.id);
    if (error) { showToast("Impossible de supprimer cette démarche.", "error"); return; }
    setDemarches((prev) => prev?.filter((d) => d.id !== demarche.id) ?? null);
    setDetail(null);
    showToast("Démarche supprimée.");
  }

  function handleSupprimerDemarche(demarche: Demarche) {
    setConfirmation({
      titre: "Supprimer la démarche",
      message: `Supprimer définitivement "${demarche.titre}" ? Cette action est irréversible.`,
      danger: true,
      onConfirm: () => executerSuppressionDemarche(demarche),
    });
  }

  function ouvrirEdition(demarche: Demarche) {
    setEditTitre(demarche.titre);
    setEditDateCible(demarche.date_cible ?? "");
    setEditCategorie(demarche.categorie);
    setEditionActive(true);
  }

  async function handleEnregistrerEdition(demarche: Demarche) {
    if (!editTitre.trim()) return;
    setBusyAction(true);
    const { error } = await supabase.from("citoyen_demarches").update({ titre: editTitre.trim(), date_cible: editDateCible || null, categorie: editCategorie }).eq("id", demarche.id);
    setBusyAction(false);
    if (error) { showToast("Impossible d'enregistrer les modifications.", "error"); return; }
    const demarcheMaj = { ...demarche, titre: editTitre.trim(), date_cible: editDateCible || null, categorie: editCategorie };
    setDemarches((prev) => prev?.map((d) => (d.id === demarche.id ? demarcheMaj : d)) ?? null);
    setDetail(demarcheMaj);
    setEditionActive(false);
  }

  const btnGhost: React.CSSProperties = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", color: t1, fontWeight: 700, fontSize: "12.5px",
    padding: "10px 14px", borderRadius: "12px", border: `1px solid ${brd}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`,
    borderRadius: "12px", padding: "12px 14px", color: t1, fontSize: "14px",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${isDark ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.2)"}`, borderTopColor: "#F5A623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
      <CompteHeader titre="Mes démarches"/>
      <main style={{ padding: "16px 16px 100px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ padding: "4px 4px 16px" }}>
          <p style={{ color: t2, fontSize: "13.5px", margin: 0, lineHeight: 1.5 }}>Suivez vos démarches administratives, étape par étape — renouvellement de documents, dossiers en cours, échéances à ne pas oublier. Utile aussi pour vos démarches d'entrepreneur ou de chef d'entreprise (licences, déclarations, fournisseurs…).</p>
        </div>

        {afficherGuide && (
          <div style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "14px", padding: "14px 16px", marginBottom: "20px", position: "relative" }}>
            <button onClick={() => setAfficherGuide(false)} className="tap" style={{ position: "absolute", top: "10px", right: "10px", background: "none", border: "none", color: "#F5A623", cursor: "pointer", padding: "4px" }}><Ic.X/></button>
            <div style={{ color: "#F5A623", fontSize: "12.5px", fontWeight: 800, marginBottom: "8px", paddingRight: "24px" }}>Comment ça marche ?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                "Donnez un titre à ce que vous voulez suivre (un dossier, un renouvellement, une échéance, personnel ou professionnel).",
                "Ajoutez des étapes si vous voulez suivre une progression — ou n'en ajoutez aucune pour un simple rappel de date.",
                "Cochez vos étapes au fur et à mesure : la démarche passe automatiquement en \"Terminée\" une fois tout coché.",
              ].map((txt, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <span style={{ color: "#F5A623", fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ color: t2, fontSize: "12px", lineHeight: 1.5 }}>{txt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total", valeur: kpi.total },
            { label: "En cours", valeur: kpi.enCours },
            { label: "Terminées", valeur: kpi.terminees },
            { label: "En retard", valeur: kpi.enRetard, alerte: kpi.enRetard > 0 },
          ].map((k) => (
            <div key={k.label} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "14px", padding: "12px 8px", textAlign: "center" }}>
              <div style={{ color: k.alerte ? "#ef4444" : t1, fontSize: "18px", fontWeight: 900 }}>{k.valeur}</div>
              <div style={{ color: t2, fontSize: "10.5px", fontWeight: 700, marginTop: "2px" }}>{k.label}</div>
            </div>
          ))}
        </div>

        <button className="tap" onClick={() => setCreationOuverte(true)} style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "14px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "18px" }}>
          <Ic.Plus/> Nouvelle démarche
        </button>

        {(demarches?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            {([["toutes", "Toutes"], ["en_cours", "En cours"], ["terminees", "Terminées"]] as const).map(([val, label]) => (
              <button key={val} className="tap" onClick={() => setFiltre(val)} style={{ ...btnGhost, flex: 1, backgroundColor: filtre === val ? "rgba(245,166,35,0.12)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: filtre === val ? "rgba(245,166,35,0.4)" : brd, color: filtre === val ? "#F5A623" : t1 }}>{label}</button>
            ))}
          </div>
        )}

        {categoriesPresentes.size > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {([["toutes", "Toutes"], ["personnel", "Personnel"], ["professionnel", "Professionnel"]] as const).map(([val, label]) => (
              <button key={val} className="tap" onClick={() => setFiltreCategorie(val)} style={{ ...btnGhost, flex: 1, backgroundColor: filtreCategorie === val ? "rgba(59,130,246,0.12)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: filtreCategorie === val ? "rgba(59,130,246,0.4)" : brd, color: filtreCategorie === val ? "#3b82f6" : t1 }}>{label}</button>
            ))}
          </div>
        )}

        {(demarches?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px 20px" }}>
            <div style={{ color: t3, marginBottom: "16px", display: "flex", justifyContent: "center" }}><Ic.Clipboard/></div>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, marginBottom: "6px" }}>Aucune démarche</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>Créez votre première démarche pour suivre un dossier en cours ou une échéance à venir.</div>
            <div style={{ color: t3, fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Pour un usage personnel :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginBottom: "16px" }}>
              {EXEMPLES_PERSONNEL.map((ex) => (
                <button key={ex} className="tap" onClick={() => ouvrirCreationDepuisExemple(ex, "personnel")} style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${brd}`, borderRadius: "20px", padding: "7px 13px", color: t1, fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>{ex}</button>
              ))}
            </div>
            <div style={{ color: t3, fontSize: "11px", fontWeight: 700, marginBottom: "8px" }}>Pour un usage professionnel :</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
              {EXEMPLES_PROFESSIONNEL.map((ex) => (
                <button key={ex} className="tap" onClick={() => ouvrirCreationDepuisExemple(ex, "professionnel")} style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "20px", padding: "7px 13px", color: "#3b82f6", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>{ex}</button>
              ))}
            </div>
          </div>
        )}

        {demarchesFiltrees.length === 0 && (demarches?.length ?? 0) > 0 && (
          <div style={{ textAlign: "center", padding: "32px 20px", color: t2, fontSize: "13px" }}>Aucune démarche pour ce filtre.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {demarchesFiltrees.map((d) => {
            const enRetard = estEnRetard(d);
            const total = d.etapes.length;
            const fait = d.etapes.filter((e) => e.fait).length;
            const clotureeIncomplete = d.statut === "terminee" && total > 0 && fait < total;
            return (
              <div key={d.id} className="tap" onClick={() => { setDetail(d); setEditionActive(false); }} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
                  <div style={{ color: t1, fontSize: "15px", fontWeight: 800, flex: 1, minWidth: 0 }}>{d.titre}</div>
                  {d.statut === "terminee" && <span style={{ flexShrink: 0, color: "#22c55e", fontSize: "10.5px", fontWeight: 800, background: "rgba(34,197,94,0.12)", padding: "3px 9px", borderRadius: "20px" }}>{clotureeIncomplete ? "Clôturée" : "Terminée"}</span>}
                  {d.statut !== "terminee" && enRetard && <span style={{ flexShrink: 0, color: "#ef4444", fontSize: "10.5px", fontWeight: 800, background: "rgba(239,68,68,0.12)", padding: "3px 9px", borderRadius: "20px" }}>En retard</span>}
                </div>
                {(d.institution_nom || d.categorie) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                    {d.institution_nom && <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#F5A623", fontSize: "11.5px", fontWeight: 700 }}><Ic.Bldg/>{d.institution_nom}</div>}
                    {d.categorie && <span style={{ color: d.categorie === "professionnel" ? "#3b82f6" : t2, background: d.categorie === "professionnel" ? "rgba(59,130,246,0.1)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"), fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px" }}>{d.categorie === "professionnel" ? "Professionnel" : "Personnel"}</span>}
                  </div>
                )}
                {d.statut === "terminee" ? (
                  <div style={{ color: t2, fontSize: "11.5px", fontWeight: 600 }}>{clotureeIncomplete ? "Clôturée" : "Terminée"} le {formatDateHeure(d.termine_le) ?? formatDateCourt(d.created_at)}</div>
                ) : (
                  <>
                    {total > 0 ? (
                      <>
                        <div style={{ height: "6px", borderRadius: "3px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "6px" }}>
                          <div style={{ height: "100%", width: `${(fait / total) * 100}%`, background: "#F5A623", borderRadius: "3px" }}/>
                        </div>
                        <div style={{ color: t2, fontSize: "11.5px" }}>{fait}/{total} étape{total > 1 ? "s" : ""}</div>
                      </>
                    ) : d.date_cible ? (
                      <div style={{ color: enRetard ? "#ef4444" : t2, fontSize: "11.5px", fontWeight: 600 }}>Échéance : {formatDateCourt(d.date_cible)}</div>
                    ) : (
                      <div style={{ color: t3, fontSize: "11.5px" }}>Créée le {formatDateCourt(d.created_at)}</div>
                    )}
                    {!enRetard && texteTempsRestant(d) && (
                      <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: 700, marginTop: "4px" }}>{texteTempsRestant(d)}</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "36px" }}>
          <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "4px" }}>Questions fréquentes</div>
          <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.5, marginBottom: "14px" }}>Tout ce qu'il faut savoir sur le fonctionnement de cet écran.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {FAQ_DEMARCHES.map((item, i) => (
              <div key={i} style={{ backgroundColor: card, border: `1px solid ${brd}`, borderRadius: "12px", overflow: "hidden" }}>
                <button onClick={() => setFaqOuverte((prev) => (prev === i ? null : i))} className="tap" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "13px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{item.q}</span>
                  <span style={{ color: t3, flexShrink: 0, transform: faqOuverte === i ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><Ic.Chev/></span>
                </button>
                {faqOuverte === i && (
                  <div style={{ padding: "0 14px 14px", color: t2, fontSize: "12.5px", lineHeight: 1.6 }}>{item.r}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "28px", padding: "18px 16px", borderTop: `1px solid ${brd}`, textAlign: "center" }}>
          <div style={{ color: "#F5A623", fontSize: "11px", fontWeight: 800, letterSpacing: "1.5px", marginBottom: "8px" }}>YELEN224</div>
          <p style={{ color: t3, fontSize: "11.5px", lineHeight: 1.7, margin: 0, maxWidth: "440px", marginLeft: "auto", marginRight: "auto" }}>
            Yelen existe pour une seule raison : rendre l'accès aux services essentiels — santé, administration, banque, justice — aussi simple et digne que possible pour chaque citoyen guinéen. Chaque démarche suivie ici reste la vôtre, privée, à votre rythme. Yelen, c'est votre lumière dans vos démarches du quotidien.
          </p>
        </div>
      </main>

      {creationOuverte && (
        <div onClick={fermerCreation} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px 24px 0 0", padding: "24px", maxWidth: "480px", width: "100%", border: `1px solid ${brd}`, maxHeight: "88svh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ color: t1, fontSize: "17px", fontWeight: 800 }}>Nouvelle démarche</div>
              <button onClick={fermerCreation} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", padding: "4px" }}><Ic.X/></button>
            </div>

            <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Que voulez-vous suivre ?</label>
            <input value={titreForm} onChange={(e) => setTitreForm(e.target.value)} placeholder="Ex. Renouvellement de passeport" style={{ ...inputStyle, marginBottom: "6px" }}/>
            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.4, marginBottom: "16px" }}>Un dossier en cours, un renouvellement de document, ou simplement une échéance à ne pas oublier.</div>

            <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Catégorie (optionnel)</label>
            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.4, marginBottom: "8px" }}>Sert uniquement à filtrer votre liste plus tard — utile si vous mélangez démarches personnelles et professionnelles (utile aussi pour les entrepreneurs et chefs d'entreprise).</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              {(["personnel", "professionnel"] as const).map((c) => (
                <button key={c} className="tap" onClick={() => setCategorieForm((prev) => (prev === c ? null : c))} style={{ ...btnGhost, flex: 1, backgroundColor: categorieForm === c ? "rgba(59,130,246,0.12)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: categorieForm === c ? "rgba(59,130,246,0.4)" : brd, color: categorieForm === c ? "#3b82f6" : t1 }}>{c === "personnel" ? "Personnel" : "Professionnel"}</button>
              ))}
            </div>

            <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Établissement lié (optionnel)</label>
            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.4, marginBottom: "8px" }}>Sert uniquement à retrouver plus tard à quel établissement cette démarche se rapporte. Rien n'est envoyé ni partagé avec lui.</div>
            {institutionChoisie ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "12px", padding: "10px 12px", marginBottom: "16px" }}>
                <span style={{ color: "#F5A623", fontSize: "13px", fontWeight: 700 }}>{institutionChoisie.name}</span>
                <button onClick={() => setInstitutionChoisie(null)} className="tap" style={{ background: "none", border: "none", color: "#F5A623", cursor: "pointer" }}><Ic.X/></button>
              </div>
            ) : (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: t3 }}><Ic.Search/></div>
                  <input value={institutionQuery} onChange={(e) => setInstitutionQuery(e.target.value)} placeholder="Rechercher un établissement…" style={{ ...inputStyle, paddingLeft: "36px" }}/>
                </div>
                {institutionResultats.length > 0 && (
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {institutionResultats.map((opt) => (
                      <button key={opt.id} className="tap" onClick={() => { setInstitutionChoisie(opt); setInstitutionQuery(""); setInstitutionResultats([]); }} style={{ textAlign: "left", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: `1px solid ${brd}`, borderRadius: "10px", padding: "9px 11px", cursor: "pointer" }}>
                        <div style={{ color: t1, fontSize: "13px", fontWeight: 700 }}>{opt.name}</div>
                        {opt.secteur && <div style={{ color: t3, fontSize: "11px" }}>{SECTEUR_LABELS[opt.secteur] ?? opt.secteur}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Date cible (optionnel)</label>
            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.4, marginBottom: "8px" }}>La date que vous voulez suivre (ex. l'expiration d'un document). Si vous ajoutez des étapes ci-dessous, chacune peut avoir sa propre date — celle-ci reste juste une indication générale.</div>
            <input type="date" value={dateCibleForm} onChange={(e) => setDateCibleForm(e.target.value)} style={{ ...inputStyle, marginBottom: "20px", colorScheme: isDark ? "dark" : "light" }}/>

            <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "8px" }}>Étapes (optionnel)</label>
            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.4, marginBottom: "8px" }}>Chaque étape peut avoir son propre libellé et sa propre date. Vous les cocherez une par une plus tard, dans le détail de la démarche.</div>
            {etapesForm.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                {etapesForm.map((e, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "10px", padding: "8px 11px" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.libelle}</div>
                      {e.date_echeance && <div style={{ color: t3, fontSize: "11px" }}>{formatDateCourt(e.date_echeance)}</div>}
                    </div>
                    <button onClick={() => setEtapesForm((prev) => prev.filter((_, i) => i !== idx))} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <input value={etapeLibelleDraft} onChange={(e) => setEtapeLibelleDraft(e.target.value)} placeholder="Libellé de l'étape" style={{ ...inputStyle, flex: 1 }}/>
              <input type="date" value={etapeDateDraft} onChange={(e) => setEtapeDateDraft(e.target.value)} style={{ ...inputStyle, width: "128px", colorScheme: isDark ? "dark" : "light" }}/>
              <button onClick={ajouterEtapeDraft} className="tap" style={{ ...btnGhost, padding: "0 14px" }}><Ic.Plus/></button>
            </div>
            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.5, marginBottom: "20px" }}>Laissez vide pour un simple rappel d'échéance, sans étapes détaillées.</div>

            <button disabled={!titreForm.trim() || creating} onClick={handleClicCreer} className="tap" style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "14px", borderRadius: "14px", border: "none", cursor: "pointer", opacity: !titreForm.trim() || creating ? 0.5 : 1 }}>
              {creating ? "Création…" : "Créer la démarche"}
            </button>
          </div>
        </div>
      )}

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 9000, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "24px", maxWidth: "440px", width: "100%", border: `1px solid ${brd}`, maxHeight: "85svh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800, flex: 1 }}>{editionActive ? "Modifier la démarche" : detail.titre}</div>
              <button onClick={() => setDetail(null)} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
            </div>

            {editionActive ? (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Titre</label>
                <input value={editTitre} onChange={(e) => setEditTitre(e.target.value)} style={{ ...inputStyle, marginBottom: "12px" }}/>
                <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Date cible</label>
                <input type="date" value={editDateCible} onChange={(e) => setEditDateCible(e.target.value)} style={{ ...inputStyle, marginBottom: "12px", colorScheme: isDark ? "dark" : "light" }}/>
                <label style={{ color: t2, fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>Catégorie</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  {(["personnel", "professionnel"] as const).map((c) => (
                    <button key={c} className="tap" onClick={() => setEditCategorie((prev) => (prev === c ? null : c))} style={{ ...btnGhost, flex: 1, backgroundColor: editCategorie === c ? "rgba(59,130,246,0.12)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"), borderColor: editCategorie === c ? "rgba(59,130,246,0.4)" : brd, color: editCategorie === c ? "#3b82f6" : t1 }}>{c === "personnel" ? "Personnel" : "Professionnel"}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button disabled={!editTitre.trim() || busyAction} onClick={() => handleEnregistrerEdition(detail)} className="tap" style={{ ...btnGhost, flex: 1, background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623", opacity: !editTitre.trim() || busyAction ? 0.5 : 1 }}>Enregistrer</button>
                  <button onClick={() => setEditionActive(false)} className="tap" style={{ ...btnGhost, flex: 1 }}>Annuler</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                  {detail.institution_nom && <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#F5A623", fontSize: "12px", fontWeight: 700 }}><Ic.Bldg/>{detail.institution_nom}</div>}
                  {detail.categorie && <span style={{ color: detail.categorie === "professionnel" ? "#3b82f6" : t2, background: detail.categorie === "professionnel" ? "rgba(59,130,246,0.1)" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"), fontSize: "10.5px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px" }}>{detail.categorie === "professionnel" ? "Professionnel" : "Personnel"}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                  {detail.date_cible && <span style={{ color: t2, fontSize: "12px" }}>Date cible : {formatDateCourt(detail.date_cible)}</span>}
                  <button onClick={() => ouvrirEdition(detail)} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}>Modifier</button>
                </div>
                {clotureeIncompleteDetail && <div style={{ color: "#ef4444", fontSize: "11px", fontWeight: 600, marginBottom: "10px" }}>Clôturée avec des étapes non terminées.</div>}
                <div style={{ marginBottom: "14px" }}/>
              </>
            )}

            {detail.etapes.length === 0 && (
              <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.5, fontStyle: "italic", marginBottom: "12px" }}>
                Aucune étape pour l'instant — {detail.date_cible ? "cette démarche sert de simple rappel pour la date ci-dessus." : "cette démarche n'a pas de suivi détaillé."} Ajoutez une étape ci-dessous si vous voulez suivre une progression.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {detail.etapes.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px", padding: "10px 12px" }}>
                  <button disabled={busyEtapeId === e.id} onClick={() => handleToggleEtape(e, detail)} className="tap" style={{ width: "22px", height: "22px", borderRadius: "7px", border: e.fait ? "none" : `2px solid ${t3}`, background: e.fait ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: busyEtapeId === e.id ? 0.5 : 1 }}>
                    {e.fait && <Ic.Check/>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "13.5px", fontWeight: 600, textDecoration: e.fait ? "line-through" : "none", opacity: e.fait ? 0.6 : 1 }}>{e.libelle}</div>
                    {e.date_echeance && <div style={{ color: !e.fait && new Date(e.date_echeance) < new Date() ? "#ef4444" : t3, fontSize: "11px" }}>{formatDateCourt(e.date_echeance)}</div>}
                  </div>
                  <button onClick={() => handleSupprimerEtape(e, detail)} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.Trash/></button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
              <input value={nouvelleEtapeLibelle} onChange={(e) => setNouvelleEtapeLibelle(e.target.value)} placeholder="Ajouter une étape" style={{ ...inputStyle, flex: 1, padding: "9px 11px", fontSize: "13px" }}/>
              <input type="date" value={nouvelleEtapeDate} onChange={(e) => setNouvelleEtapeDate(e.target.value)} style={{ ...inputStyle, width: "116px", padding: "9px 11px", fontSize: "13px", colorScheme: isDark ? "dark" : "light" }}/>
              <button disabled={!nouvelleEtapeLibelle.trim() || busyAction} onClick={() => handleAjouterEtapeDetail(detail)} className="tap" style={{ ...btnGhost, padding: "0 12px", opacity: !nouvelleEtapeLibelle.trim() || busyAction ? 0.5 : 1 }}><Ic.Plus/></button>
            </div>

            <div style={{ color: t3, fontSize: "11px", lineHeight: 1.5, marginBottom: "8px" }}>
              {detail.statut === "terminee"
                ? "Cette démarche est marquée terminée — vous pouvez la rouvrir à tout moment."
                : detail.etapes.length === 0
                  ? "Aucune étape ici : marquez-la terminée vous-même une fois la démarche accomplie."
                  : "Elle passe automatiquement en \"Terminée\" une fois toutes les étapes cochées, ou vous pouvez la clôturer manuellement avant."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button disabled={busyAction} onClick={() => handleBasculerStatut(detail)} className="tap" style={{ ...btnGhost, background: detail.statut === "terminee" ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)") : "rgba(34,197,94,0.12)", borderColor: detail.statut === "terminee" ? brd : "rgba(34,197,94,0.4)", color: detail.statut === "terminee" ? t1 : "#22c55e" }}>
                {detail.statut === "terminee" ? "Rouvrir la démarche" : "Marquer terminée"}
              </button>
              <button onClick={() => handleSupprimerDemarche(detail)} className="tap" style={{ ...btnGhost, color: "#ef4444" }}><Ic.Trash/> Supprimer la démarche</button>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div onClick={() => setConfirmation(null)} style={{ position: "fixed", inset: 0, zIndex: 9700, backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}` }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>{confirmation.titre}</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>{confirmation.message}</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmation(null)} className="tap" style={{ ...btnGhost, flex: 1 }}>Annuler</button>
              <button onClick={() => { confirmation.onConfirm(); setConfirmation(null); }} className="tap" style={{ ...btnGhost, flex: 1, background: confirmation.danger ? "rgba(239,68,68,0.12)" : "rgba(245,166,35,0.12)", borderColor: confirmation.danger ? "rgba(239,68,68,0.4)" : "rgba(245,166,35,0.4)", color: confirmation.danger ? "#ef4444" : "#F5A623" }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {celebration && (
        <div onClick={() => setCelebration(null)} style={{ position: "fixed", inset: 0, zIndex: 9800, backgroundColor: "rgba(0,0,0,0.9)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px", padding: "32px 24px 24px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}`, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}><IllustrationVictoire/></div>
            <div style={{ color: t1, fontSize: "19px", fontWeight: 900, marginBottom: "8px" }}>Bravo !</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, marginBottom: "22px" }}>
              Vous avez terminé « {celebration.titre} ». Une discipline comme celle-ci construit une vie administrative bien gérée — continuez ainsi.
            </div>
            <button onClick={() => setCelebration(null)} className="tap" style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "14px", border: "none", cursor: "pointer" }}>Continuer</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
