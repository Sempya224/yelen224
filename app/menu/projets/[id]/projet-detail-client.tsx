"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { CompteHeader, CompteLoadingScreen } from "@/components/CompteEcranVide";
import { YelenLoader } from "@/components/YelenLoader";
import { ACTIVITE_CATEGORIE_SHORT } from "@/lib/activiteVisuels";
import { Pill, STATUT_LABEL, STATUT_TON, PRIORITE_LABEL, HISTORIQUE_LABEL, type Projet, type EtapeProjet, type StatutProjet, type CategorieId, type Priorite } from "../projets-client";

// Fiche "Mes projets" — Lot 1. Même patron d'écriture directe Supabase
// sous RLS que le détail "Mes démarches" (mes-demarches-client.tsx), pas
// de route API dédiée. `mis_a_jour_le` est mis à jour manuellement à
// chaque mutation (pas de trigger DB pour ce lot) — sert à trier/choisir
// la carte "À continuer" de l'écran liste.

const STATUTS_ORDRE: StatutProjet[] = ["a_preparer", "planifie", "en_cours", "en_attente", "termine", "archive"];
const PRIORITES_ORDRE: Priorite[] = ["faible", "normale", "importante", "urgente"];

// Lot 4 (migration 20260928000003) — "Lié à ce projet", limité aux
// rendez-vous/réservations pour ce lot (documents/messages/professionnel
// reportés). Un seul type d'affichage pour les deux mécanismes de
// réservation du produit (rdv gratuit / paid_bookings payant, cf.
// CLAUDE.md /schema) plutôt que deux listes séparées à l'écran.
type LiaisonType = "rdv" | "paid_booking";
type Liaison = { liaisonId: string; type: LiaisonType; refId: string; institutionNom: string | null; libelle: string; date: string | null; heure: string | null; statut: string };
const STATUT_RESA_LABEL: Record<string, string> = {
  nouveau: "Nouveau", en_attente: "En attente", confirme: "Confirmé", accepte: "Accepté",
  refuse: "Refusé", annule: "Annulé", termine: "Terminé", no_show: "Absence", rembourse: "Remboursé",
};
function statutResaTon(s: string) {
  if (s === "termine" || s === "confirme" || s === "accepte") return "blue" as const;
  if (s === "annule" || s === "refuse" || s === "no_show") return "red" as const;
  if (s === "rembourse") return "neutral" as const;
  return "orange" as const;
}

const P = { pointerEvents: "none" as const };
const Ic = {
  X:     () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Trash: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/></svg>,
  Plus:  () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Cal:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

function formatDateCourt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function ProjetDetailClient({ id }: { id: string }) {
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
  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const btnGhost: React.CSSProperties = { padding: "12px", borderRadius: "14px", border: `1px solid ${brd}`, background: "transparent", color: t1, fontWeight: 700, fontSize: "13px", cursor: "pointer" };

  const [citoyenId, setCitoyenId] = useState<string | null>(null);
  const [projet, setProjet] = useState<Projet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [busyEtapeId, setBusyEtapeId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [editionActive, setEditionActive] = useState(false);
  const [editTitre, setEditTitre] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSecteur, setEditSecteur] = useState<CategorieId | null>(null);
  const [editDateCible, setEditDateCible] = useState("");
  const [editStatut, setEditStatut] = useState<StatutProjet>("a_preparer");
  const [editBesoin, setEditBesoin] = useState("");
  const [editLieu, setEditLieu] = useState("");
  const [editPriorite, setEditPriorite] = useState<Priorite>("normale");

  const [nouvelleEtapeLibelle, setNouvelleEtapeLibelle] = useState("");
  const [nouvelleEtapeDate, setNouvelleEtapeDate] = useState("");

  // Lot 3 — journal append-only (citoyen_projet_historique, migration
  // 20260928000002), même patron que citoyen_demarche_historique. Chargé
  // une fois au montage (fiche dédiée à un seul id, contrairement au
  // sheet réutilisable de "Mes démarches"), mis à jour localement à
  // chaque journalisation plutôt que rechargé en base.
  const [historique, setHistorique] = useState<{ id: string; evenement: string; detail: string | null; created_at: string }[]>([]);

  // Lot 4 — "Lié à ce projet" (rendez-vous/réservations uniquement).
  const [liaisons, setLiaisons] = useState<Liaison[]>([]);
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOptions, setPickerOptions] = useState<Liaison[]>([]);
  const [busyLiaisonId, setBusyLiaisonId] = useState<string | null>(null);

  const [confirmation, setConfirmation] = useState<{ titre: string; message: string; danger?: boolean; onConfirm: () => void | Promise<void> } | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);
  const [suppressionBusy, setSuppressionBusy] = useState(false);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setCitoyenId(session.user.id);
    const { data } = await supabase
      .from("citoyen_projets")
      .select("*, etapes:citoyen_projet_etapes(*)")
      .eq("id", id)
      .eq("citoyen_id", session.user.id)
      .maybeSingle();
    if (!data) { setProjet(null); return; }
    const p = data as unknown as Projet;
    setProjet({ ...p, etapes: [...p.etapes].sort((a, b) => a.ordre - b.ordre) });
  }, [id]);

  useEffect(() => {
    void (async () => { setLoading(true); await charger(); setLoading(false); })();
  }, [charger]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("citoyen_projet_historique")
        .select("id,evenement,detail,created_at")
        .eq("projet_id", id)
        .order("created_at", { ascending: false });
      setHistorique(data ?? []);
    })();
  }, [id]);

  // Lot 4 — requêtes séparées explicites plutôt qu'un embed PostgREST
  // implicite (piège documenté CLAUDE.md : un embed cassé sur une route
  // centrale a déjà cassé tout un dashboard) — ici surtout parce que
  // rdv/paid_bookings n'ont pas de relation directe entre elles, un seul
  // embed ne couvrirait de toute façon qu'un des deux mécanismes.
  const chargerLiaisons = useCallback(async () => {
    const { data: liens } = await supabase.from("citoyen_projet_reservations").select("id,rdv_id,paid_booking_id").eq("projet_id", id);
    const rows = liens ?? [];
    const rdvIds = rows.filter((r) => r.rdv_id).map((r) => r.rdv_id as string);
    const bookingIds = rows.filter((r) => r.paid_booking_id).map((r) => r.paid_booking_id as string);

    const [rdvRes, bookingRes] = await Promise.all([
      rdvIds.length > 0 ? supabase.from("rdv").select("id,institution_id,objet,date_rdv,heure_rdv,statut").in("id", rdvIds) : Promise.resolve({ data: [] as { id: string; institution_id: string; objet: string | null; date_rdv: string; heure_rdv: string; statut: string }[] }),
      bookingIds.length > 0 ? supabase.from("paid_bookings").select("id,institution_id,service_id,date_rdv,heure_rdv,statut").in("id", bookingIds) : Promise.resolve({ data: [] as { id: string; institution_id: string; service_id: string; date_rdv: string; heure_rdv: string; statut: string }[] }),
    ]);
    const rdvRows = rdvRes.data ?? [];
    const bookingRows = bookingRes.data ?? [];

    const institutionIds = Array.from(new Set([...rdvRows.map((r) => r.institution_id), ...bookingRows.map((b) => b.institution_id)]));
    const serviceIds = Array.from(new Set(bookingRows.map((b) => b.service_id)));
    const [instRes, servRes] = await Promise.all([
      institutionIds.length > 0 ? supabase.from("institutions").select("id,name").in("id", institutionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      serviceIds.length > 0 ? supabase.from("paid_services").select("id,nom").in("id", serviceIds) : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
    ]);
    const instMap = new Map((instRes.data ?? []).map((i) => [i.id, i.name]));
    const servMap = new Map((servRes.data ?? []).map((s) => [s.id, s.nom]));

    const affichees: Liaison[] = rows.flatMap((l): Liaison[] => {
      if (l.rdv_id) {
        const r = rdvRows.find((x) => x.id === l.rdv_id);
        if (!r) return [];
        return [{ liaisonId: l.id, type: "rdv", refId: r.id, institutionNom: instMap.get(r.institution_id) ?? null, libelle: r.objet || "Rendez-vous", date: r.date_rdv, heure: r.heure_rdv, statut: r.statut }];
      }
      const b = bookingRows.find((x) => x.id === l.paid_booking_id);
      if (!b) return [];
      return [{ liaisonId: l.id, type: "paid_booking", refId: b.id, institutionNom: instMap.get(b.institution_id) ?? null, libelle: servMap.get(b.service_id) ?? "Réservation", date: b.date_rdv, heure: b.heure_rdv, statut: b.statut }];
    }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    setLiaisons(affichees);
  }, [id]);

  useEffect(() => { void chargerLiaisons(); }, [chargerLiaisons]);

  async function ouvrirPicker() {
    if (!citoyenId) return;
    setPickerOuvert(true);
    setPickerLoading(true);
    const [rdvRes, bookingRes] = await Promise.all([
      supabase.from("rdv").select("id,institution_id,objet,date_rdv,heure_rdv,statut").eq("citoyen_id", citoyenId).order("date_rdv", { ascending: false }).limit(30),
      supabase.from("paid_bookings").select("id,institution_id,service_id,date_rdv,heure_rdv,statut").eq("citoyen_id", citoyenId).order("date_rdv", { ascending: false }).limit(30),
    ]);
    const rdvRows = rdvRes.data ?? [];
    const bookingRows = bookingRes.data ?? [];

    const institutionIds = Array.from(new Set([...rdvRows.map((r) => r.institution_id), ...bookingRows.map((b) => b.institution_id)]));
    const serviceIds = Array.from(new Set(bookingRows.map((b) => b.service_id)));
    const [instRes, servRes] = await Promise.all([
      institutionIds.length > 0 ? supabase.from("institutions").select("id,name").in("id", institutionIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      serviceIds.length > 0 ? supabase.from("paid_services").select("id,nom").in("id", serviceIds) : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
    ]);
    const instMap = new Map((instRes.data ?? []).map((i) => [i.id, i.name]));
    const servMap = new Map((servRes.data ?? []).map((s) => [s.id, s.nom]));

    const dejaLies = new Set(liaisons.map((l) => `${l.type}-${l.refId}`));
    const options: Liaison[] = [
      ...rdvRows.filter((r) => !dejaLies.has(`rdv-${r.id}`)).map((r) => ({ liaisonId: `rdv-${r.id}`, type: "rdv" as const, refId: r.id, institutionNom: instMap.get(r.institution_id) ?? null, libelle: r.objet || "Rendez-vous", date: r.date_rdv, heure: r.heure_rdv, statut: r.statut })),
      ...bookingRows.filter((b) => !dejaLies.has(`paid_booking-${b.id}`)).map((b) => ({ liaisonId: `paid_booking-${b.id}`, type: "paid_booking" as const, refId: b.id, institutionNom: instMap.get(b.institution_id) ?? null, libelle: servMap.get(b.service_id) ?? "Réservation", date: b.date_rdv, heure: b.heure_rdv, statut: b.statut })),
    ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    setPickerOptions(options);
    setPickerLoading(false);
  }

  async function lierReservation(option: Liaison) {
    if (!citoyenId) return;
    const payload = option.type === "rdv" ? { rdv_id: option.refId } : { paid_booking_id: option.refId };
    const { error } = await supabase.from("citoyen_projet_reservations").insert({ projet_id: id, citoyen_id: citoyenId, ...payload });
    if (error) { showToast("Impossible de lier ce rendez-vous.", "error"); return; }
    setPickerOuvert(false);
    await chargerLiaisons();
    showToast("Rendez-vous lié au projet.");
  }

  async function delierReservation(liaisonId: string) {
    setBusyLiaisonId(liaisonId);
    const { error } = await supabase.from("citoyen_projet_reservations").delete().eq("id", liaisonId);
    setBusyLiaisonId(null);
    if (error) { showToast("Impossible de délier ce rendez-vous.", "error"); return; }
    setLiaisons((prev) => prev.filter((l) => l.liaisonId !== liaisonId));
  }

  // Fire-and-forget, comme mes-demarches-client.tsx::journaliser : un échec
  // ici n'affecte jamais l'action réelle (changer de statut, modifier),
  // juste sa trace dans l'Activité. Mise à jour optimiste locale plutôt
  // qu'un rechargement complet, cette fiche restant ouverte après l'action.
  async function journaliser(evenement: string, detail: string) {
    if (!citoyenId) return;
    try {
      const { data } = await supabase.from("citoyen_projet_historique").insert({ projet_id: id, citoyen_id: citoyenId, evenement, detail }).select().single();
      if (data) setHistorique((prev) => [data, ...prev]);
    } catch {}
  }

  async function patcher(champs: Record<string, unknown>): Promise<boolean> {
    const { error } = await supabase.from("citoyen_projets").update({ ...champs, mis_a_jour_le: new Date().toISOString() }).eq("id", id);
    if (error) return false;
    setProjet((prev) => (prev ? { ...prev, ...champs, mis_a_jour_le: new Date().toISOString() } as Projet : prev));
    return true;
  }

  async function executerChangerStatut(nouveauStatut: StatutProjet) {
    if (!projet) return;
    const ancienStatut = projet.statut;
    setBusyAction(true);
    const ok = await patcher({ statut: nouveauStatut, termine_le: nouveauStatut === "termine" ? new Date().toISOString() : null });
    setBusyAction(false);
    if (!ok) { showToast("Impossible de mettre à jour le statut.", "error"); return; }
    showToast("Statut mis à jour.");
    if (nouveauStatut === "termine") void journaliser("terminee", "Marqué terminé manuellement.");
    else if (nouveauStatut === "archive") void journaliser("archivee", "Projet archivé.");
    else if (ancienStatut === "termine" || ancienStatut === "archive") void journaliser("reouverte", "Projet rouvert.");
  }

  function handleChangerStatut(nouveauStatut: StatutProjet) {
    if (!projet || projet.statut === nouveauStatut) return;
    if (nouveauStatut === "termine" || nouveauStatut === "archive") {
      setConfirmation({
        titre: nouveauStatut === "termine" ? "Marquer ce projet terminé ?" : "Archiver ce projet ?",
        message: nouveauStatut === "termine"
          ? "Le projet passera dans « Terminés ». Vous pourrez toujours le rouvrir plus tard."
          : "Le projet sera rangé dans « Terminés » sans être marqué comme accompli. Vous pourrez toujours le rouvrir plus tard.",
        onConfirm: () => executerChangerStatut(nouveauStatut),
      });
      return;
    }
    void executerChangerStatut(nouveauStatut);
  }

  async function executerToggleEtape(etape: EtapeProjet, nouveauFait: boolean) {
    if (!projet) return;
    setBusyEtapeId(etape.id);
    const { error } = await supabase.from("citoyen_projet_etapes").update({ fait: nouveauFait, fait_le: nouveauFait ? new Date().toISOString() : null }).eq("id", etape.id);
    setBusyEtapeId(null);
    if (error) { showToast("Impossible de mettre à jour cette étape.", "error"); return; }

    const etapesMaj = projet.etapes.map((e) => (e.id === etape.id ? { ...e, fait: nouveauFait } : e));
    const toutesFaites = etapesMaj.length > 0 && etapesMaj.every((e) => e.fait);
    let statutMaj = projet.statut;
    if (toutesFaites && projet.statut !== "termine") {
      const ok = await patcher({ statut: "termine", termine_le: new Date().toISOString() });
      if (ok) { statutMaj = "termine"; showToast("Toutes les étapes sont cochées — projet marqué terminé."); void journaliser("terminee", "Terminé automatiquement (toutes les étapes cochées)."); }
    } else if (!toutesFaites && projet.statut === "termine") {
      const ok = await patcher({ statut: "en_cours", termine_le: null });
      if (ok) { statutMaj = "en_cours"; void journaliser("reouverte", "Rouvert automatiquement (étape décochée)."); }
    }
    setProjet((prev) => (prev ? { ...prev, etapes: etapesMaj, statut: statutMaj } : prev));
  }

  async function handleAjouterEtape() {
    if (!nouvelleEtapeLibelle.trim() || !citoyenId || !projet) return;
    setBusyAction(true);
    const ordre = projet.etapes.length > 0 ? Math.max(...projet.etapes.map((e) => e.ordre)) + 1 : 0;
    const { data, error } = await supabase
      .from("citoyen_projet_etapes")
      .insert({ projet_id: projet.id, citoyen_id: citoyenId, libelle: nouvelleEtapeLibelle.trim(), date_echeance: nouvelleEtapeDate || null, ordre })
      .select()
      .single();
    setBusyAction(false);
    if (error || !data) { showToast("Impossible d'ajouter cette étape.", "error"); return; }
    const etapesMaj = [...projet.etapes, data as EtapeProjet];
    let statutMaj = projet.statut;
    if (projet.statut === "termine") {
      const ok = await patcher({ statut: "en_cours", termine_le: null });
      if (ok) statutMaj = "en_cours";
    } else {
      await patcher({});
    }
    setProjet((prev) => (prev ? { ...prev, etapes: etapesMaj, statut: statutMaj } : prev));
    setNouvelleEtapeLibelle(""); setNouvelleEtapeDate("");
  }

  async function handleSupprimerEtape(etape: EtapeProjet) {
    if (!projet) return;
    const { error } = await supabase.from("citoyen_projet_etapes").delete().eq("id", etape.id);
    if (error) { showToast("Impossible de supprimer cette étape.", "error"); return; }
    await patcher({});
    setProjet((prev) => (prev ? { ...prev, etapes: prev.etapes.filter((e) => e.id !== etape.id) } : prev));
  }

  function ouvrirEdition() {
    if (!projet) return;
    setEditTitre(projet.titre);
    setEditDescription(projet.description ?? "");
    setEditSecteur(projet.secteur);
    setEditDateCible(projet.date_cible ?? "");
    setEditStatut(projet.statut);
    setEditBesoin(projet.besoin ?? "");
    setEditLieu(projet.lieu ?? "");
    setEditPriorite(projet.priorite);
    setEditionActive(true);
  }

  async function handleEnregistrerEdition() {
    if (!projet || !editTitre.trim()) return;
    const ancienStatut = projet.statut;
    setBusyAction(true);
    const ok = await patcher({
      titre: editTitre.trim(),
      description: editDescription.trim() || null,
      secteur: editSecteur,
      date_cible: editDateCible || null,
      statut: editStatut,
      termine_le: editStatut === "termine" ? (projet.termine_le ?? new Date().toISOString()) : null,
      besoin: editBesoin.trim() || null,
      lieu: editLieu.trim() || null,
      priorite: editPriorite,
    });
    setBusyAction(false);
    if (!ok) { showToast("Impossible d'enregistrer les modifications.", "error"); return; }
    setEditionActive(false);
    showToast("Projet mis à jour.");
    if (editStatut === "termine" && ancienStatut !== "termine") void journaliser("terminee", "Marqué terminé depuis la modification.");
    else if (editStatut === "archive" && ancienStatut !== "archive") void journaliser("archivee", "Archivé depuis la modification.");
    else if ((ancienStatut === "termine" || ancienStatut === "archive") && editStatut !== ancienStatut) void journaliser("reouverte", "Rouvert depuis la modification.");
    else void journaliser("modifiee", "Informations modifiées.");
  }

  async function executerSupprimerProjet() {
    const { error } = await supabase.from("citoyen_projets").delete().eq("id", id);
    if (error) { showToast("Impossible de supprimer ce projet.", "error"); return; }
    router.push("/menu/projets");
  }

  if (loading) return <CompteLoadingScreen titre="Projet"/>;

  if (!projet) {
    return (
      <div style={{ minHeight: "100svh", backgroundColor: bg }}>
        <CompteHeader titre="Projet"/>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "6px" }}>Projet introuvable</div>
          <div style={{ color: t2, fontSize: "13px" }}>Ce projet n&apos;existe plus ou ne vous appartient pas.</div>
        </div>
      </div>
    );
  }

  const total = projet.etapes.length;
  const fait = projet.etapes.filter((e) => e.fait).length;
  const pct = total > 0 ? Math.round((fait / total) * 100) : null;
  const enCours = projet.statut !== "termine" && projet.statut !== "archive";
  const prochaineEtape = enCours ? projet.etapes.filter((e) => !e.fait).sort((a, b) => a.ordre - b.ordre)[0] ?? null : null;
  const sameJour = projet.mis_a_jour_le.slice(0, 10) === projet.created_at.slice(0, 10);
  const sectionLabel: React.CSSProperties = { color: t2, fontSize: "11px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "9px", paddingLeft: "2px" };

  return (
    <div style={{ minHeight: "100svh", backgroundColor: bg, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',sans-serif" }}>
      <style>{`.tap{transition:transform 0.1s,opacity 0.1s;cursor:pointer !important;touch-action:manipulation}.tap:active{opacity:0.65;transform:scale(0.97)}@keyframes sheetUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {/* Titre de barre fixe et court ("Détails du projet"), pas le nom du
          projet — évite la troncature façon "Renouveler mon pas…" (retour
          Bryan 28/09/2026, cf. recommandation Apple HIG sur les titres de
          navigation). Le nom du projet devient le contenu principal,
          affiché en grand dans la carte d'identité ci-dessous. */}
      <CompteHeader titre="Détails du projet"/>
      <main style={{ padding: "16px 16px 100px", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ backgroundColor: card, borderRadius: "18px", padding: "20px 18px", boxShadow: ombreCard, marginBottom: "22px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "6px" }}>
            <div style={{ color: t1, fontSize: "19px", fontWeight: 900, lineHeight: 1.3, minWidth: 0 }}>{projet.titre}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              {(projet.priorite === "urgente" || projet.priorite === "importante") && (
                <Pill ton={projet.priorite === "urgente" ? "red" : "orange"} isDark={isDark}>{PRIORITE_LABEL[projet.priorite]}</Pill>
              )}
              <Pill ton={STATUT_TON[projet.statut]} isDark={isDark}>{STATUT_LABEL[projet.statut]}</Pill>
            </div>
          </div>

          {projet.secteur && (
            <div style={{ color: t2, fontSize: "12.5px", fontWeight: 700, marginBottom: "14px" }}>{ACTIVITE_CATEGORIE_SHORT[projet.secteur]}</div>
          )}

          {projet.date_cible && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ color: t3, fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "3px" }}>Date cible</div>
              <div style={{ color: t1, fontSize: "14px", fontWeight: 700 }}>{formatDateCourt(projet.date_cible)}</div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: `1px solid ${brd}` }}>
            <div style={{ color: t3, fontSize: "11px" }}>
              Créé le {formatDateCourt(projet.created_at)}{!sameJour && ` · Modifié le ${formatDateCourt(projet.mis_a_jour_le)}`}
            </div>
            <button onClick={ouvrirEdition} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0, flexShrink: 0 }}>Modifier</button>
          </div>
        </div>

        {editionActive && (
          <div style={{ backgroundColor: card, borderRadius: "18px", padding: "18px", boxShadow: ombreCard, marginBottom: "22px" }}>
            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Titre</div>
            <input value={editTitre} onChange={(e) => setEditTitre(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "15px", fontWeight: 600, boxSizing: "border-box", marginBottom: "16px" }}/>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Résumé</div>
            <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Décrivez ce projet en quelques mots" rows={3} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "14px", fontWeight: 500, fontFamily: "inherit", resize: "none", boxSizing: "border-box", marginBottom: "16px" }}/>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Catégorie</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {Object.entries(ACTIVITE_CATEGORIE_SHORT).map(([code, label]) => {
                const actif = editSecteur === code;
                return (
                  <button key={code} className="tap" onClick={() => setEditSecteur((prev) => (prev === code ? null : code))} style={{ padding: "8px 14px", borderRadius: "24px", border: "none", backgroundColor: actif ? "#F5A623" : inputBg, color: actif ? "#080812" : t1, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>{label}</button>
                );
              })}
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Date cible</div>
            {/* Overlay au lieu du texte natif (retour Bryan, écran de
                création — même correctif appliqué ici) : un input date vide
                ne rend rien de visible sur ce webview. */}
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <input type="date" value={editDateCible} onChange={(e) => setEditDateCible(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: "transparent", fontSize: "14px", fontWeight: 600, boxSizing: "border-box", colorScheme: isDark ? "dark" : "light" }}/>
              <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: editDateCible ? t1 : t3, fontSize: "14px", fontWeight: 600, pointerEvents: "none" }}>{editDateCible ? formatDateCourt(editDateCible) : "Choisir une date"}</span>
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Besoin (optionnel)</div>
            <input value={editBesoin} onChange={(e) => setEditBesoin(e.target.value)} placeholder="Ex : Renouvellement de passeport" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "14px", fontWeight: 600, boxSizing: "border-box", marginBottom: "16px" }}/>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Lieu (optionnel)</div>
            <input value={editLieu} onChange={(e) => setEditLieu(e.target.value)} placeholder="Ex : Conakry" style={{ width: "100%", padding: "14px 16px", borderRadius: "14px", border: "none", backgroundColor: inputBg, color: t1, fontSize: "14px", fontWeight: 600, boxSizing: "border-box", marginBottom: "16px" }}/>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Priorité</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {PRIORITES_ORDRE.map((p) => {
                const actif = editPriorite === p;
                const couleur = p === "urgente" ? "#ef4444" : p === "importante" ? "#F5A623" : t1;
                return (
                  <button key={p} className="tap" onClick={() => setEditPriorite(p)} style={{ padding: "8px 14px", borderRadius: "24px", border: `1px solid ${actif ? couleur : brd}`, background: actif ? `${couleur}1f` : "transparent", color: actif ? couleur : t2, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>{PRIORITE_LABEL[p]}</button>
                );
              })}
            </div>

            <div style={{ color: t2, fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>Statut</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
              {STATUTS_ORDRE.map((s) => {
                const actif = editStatut === s;
                return (
                  <button key={s} className="tap" onClick={() => setEditStatut(s)} style={{ padding: "8px 14px", borderRadius: "24px", border: "none", backgroundColor: actif ? "#F5A623" : inputBg, color: actif ? "#080812" : t1, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>{STATUT_LABEL[s]}</button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setEditionActive(false)} disabled={busyAction} className="tap" style={{ ...btnGhost, flex: 1, opacity: busyAction ? 0.5 : 1 }}>Annuler</button>
              <button onClick={() => void handleEnregistrerEdition()} disabled={busyAction || !editTitre.trim()} className="tap" style={{ ...btnGhost, flex: 1, background: "#F5A623", border: "none", color: "#080812", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {busyAction ? <YelenLoader size={14} color="#080812"/> : "Enregistrer"}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "22px" }}>
          <div style={sectionLabel}>Résumé</div>
          {projet.description ? (
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6 }}>{projet.description}</div>
          ) : (
            <div style={{ color: t3, fontSize: "12px", lineHeight: 1.5, fontStyle: "italic" }}>
              Aucun résumé pour l&apos;instant. <button onClick={ouvrirEdition} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontWeight: 700, cursor: "pointer", padding: 0, font: "inherit" }}>Ajoutez-en un</button>.
            </div>
          )}
        </div>

        {(projet.besoin || projet.lieu) && (
          <div style={{ marginBottom: "22px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={sectionLabel}>Informations</div>
            {projet.besoin && (
              <div>
                <div style={{ color: t3, fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "3px" }}>Besoin</div>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: 600 }}>{projet.besoin}</div>
              </div>
            )}
            {projet.lieu && (
              <div>
                <div style={{ color: t3, fontSize: "10px", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "3px" }}>Lieu</div>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: 600 }}>{projet.lieu}</div>
              </div>
            )}
          </div>
        )}

        {total > 0 && (
          <div style={{ marginBottom: "22px" }}>
            <div style={sectionLabel}>Progression</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
              <span style={{ color: t1, fontSize: "14px", fontWeight: 800 }}>{pct}&nbsp;% terminé</span>
              <span style={{ color: t2, fontSize: "12px", fontWeight: 700 }}>{fait} / {total} étape{total > 1 ? "s" : ""}</span>
            </div>
            <div style={{ height: "8px", borderRadius: "4px", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#F5A623", borderRadius: "4px" }}/>
            </div>
          </div>
        )}

        {prochaineEtape && (
          <div style={{ marginBottom: "22px" }}>
            <div style={sectionLabel}>Prochaine étape</div>
            <div style={{ color: t1, fontSize: "14.5px", fontWeight: 700, marginBottom: prochaineEtape.date_echeance ? "3px" : 0 }}>{prochaineEtape.libelle}</div>
            {prochaineEtape.date_echeance && <div style={{ color: t2, fontSize: "12px" }}>Échéance : {formatDateCourt(prochaineEtape.date_echeance)}</div>}
          </div>
        )}

        <div style={sectionLabel}>Étapes</div>
        {projet.etapes.length === 0 && (
          <>
            <div style={{ color: t3, fontSize: "11.5px", lineHeight: 1.5, fontStyle: "italic", marginBottom: "12px" }}>
              Aucune étape pour l&apos;instant. Ajoutez-en une ci-dessous si vous voulez suivre une progression détaillée.
            </div>
            {/* "Yelen peut vous aider" (retour Bryan, écran de création) —
                réutilise le parcours "Yelen vous accompagne" déjà construit
                (orientation vers un professionnel), pas un générateur
                d'étapes type/inventé : le libellé reste honnête sur ce que
                fait réellement le bouton. Visible tant que 0 étape, pas
                seulement juste après la création (pas de flag "vient d'être
                créé" à faire vivre pour un même effet). */}
            <button onClick={() => router.push("/menu/projets/accompagnement")} className="tap" style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", background: isDark ? "linear-gradient(135deg, rgba(245,166,35,0.14), rgba(245,166,35,0.03))" : "linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.015))", border: `1px solid ${isDark ? "rgba(245,166,35,0.22)" : "rgba(245,166,35,0.18)"}`, borderRadius: "14px", padding: "13px 14px", marginBottom: "14px", cursor: "pointer" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "linear-gradient(135deg, #F5A623, #C8940A)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m14.5 9.5-2 5-5 2 2-5 5-2Z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: "13px", fontWeight: 800, marginBottom: "2px" }}>Yelen peut vous aider</div>
                <div style={{ color: t2, fontSize: "11.5px", lineHeight: 1.4 }}>Trouver un professionnel pour avancer sur ce projet.</div>
              </div>
              <span style={{ color: "#F5A623", flexShrink: 0, display: "flex" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>
            </button>
          </>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
          {projet.etapes.map((e) => (
            <div key={e.id} style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px" }}>
              <button disabled={busyEtapeId === e.id} onClick={() => void executerToggleEtape(e, !e.fait)} className="tap" style={{ width: "22px", height: "22px", borderRadius: "7px", border: e.fait ? "none" : `2px solid ${t3}`, background: e.fait ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: busyEtapeId === e.id ? 0.5 : 1 }}>
                {e.fait && <Ic.Check/>}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: t1, fontSize: "13.5px", fontWeight: 600, textDecoration: e.fait ? "line-through" : "none", opacity: e.fait ? 0.6 : 1 }}>{e.libelle}</div>
                {e.date_echeance && <div style={{ color: t3, fontSize: "11px" }}>{formatDateCourt(e.date_echeance)}</div>}
              </div>
              <button onClick={() => void handleSupprimerEtape(e)} className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0 }}><Ic.Trash/></button>
            </div>
          ))}
        </div>
        <div style={{ background: card, borderRadius: "12px", boxShadow: ombreCard, display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "26px" }}>
          <input value={nouvelleEtapeLibelle} onChange={(e) => setNouvelleEtapeLibelle(e.target.value)} placeholder="Ajouter une étape" style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "8px 0", color: t1, fontSize: "14px", fontFamily: "inherit" }}/>
          {/* Pilule distincte (retour Bryan, écran de création — même
              correctif appliqué ici) : le texte, une fois une date choisie,
              rend nul sur un input date natif vide, ce qui masquait
              totalement qu'on pouvait ajouter une échéance à l'étape. */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <input type="date" value={nouvelleEtapeDate} onChange={(e) => setNouvelleEtapeDate(e.target.value)} style={{ border: "none", borderRadius: "9px", background: nouvelleEtapeDate ? (isDark ? "rgba(245,166,35,0.14)" : "rgba(245,166,35,0.1)") : inputBg, color: "transparent", fontSize: "11px", width: "86px", padding: "7px 8px 7px 24px", colorScheme: isDark ? "dark" : "light", boxSizing: "border-box" }}/>
            <div style={{ position: "absolute", left: "7px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={nouvelleEtapeDate ? "#F5A623" : t3} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <span style={{ position: "absolute", left: "24px", right: "8px", top: "50%", transform: "translateY(-50%)", color: nouvelleEtapeDate ? "#F5A623" : t3, fontSize: "10.5px", fontWeight: 700, pointerEvents: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {nouvelleEtapeDate ? new Date(nouvelleEtapeDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "Date"}
            </span>
          </div>
          <button disabled={busyAction} onClick={() => void handleAjouterEtape()} aria-label="Ajouter l'étape" className="tap" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}><Ic.Plus/></button>
        </div>

        {historique.length > 0 && (
          <div style={{ marginBottom: "22px" }}>
            <div style={sectionLabel}>Activité</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {historique.map((h) => (
                <div key={h.id} style={{ display: "flex", gap: "10px" }}>
                  <div style={{ color: t3, fontSize: "11px", flexShrink: 0, width: "76px", paddingTop: "1px" }}>{formatDateCourt(h.created_at)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: t1, fontSize: "12.5px", fontWeight: 700 }}>{HISTORIQUE_LABEL[h.evenement] ?? h.evenement}</div>
                    {h.detail && <div style={{ color: t2, fontSize: "11.5px" }}>{h.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "9px" }}>
            <div style={sectionLabel}>Lié à ce projet</div>
            <button onClick={() => void ouvrirPicker()} className="tap" style={{ background: "none", border: "none", color: "#F5A623", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: 0 }}>+ Lier</button>
          </div>
          {liaisons.length === 0 ? (
            <div style={{ color: t3, fontSize: "12px", lineHeight: 1.5, fontStyle: "italic" }}>Aucun rendez-vous ni réservation lié pour l&apos;instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {liaisons.map((l) => (
                <div key={l.liaisonId} style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: "12px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px", flexWrap: "wrap" }}>
                      <span style={{ color: t1, fontSize: "13.5px", fontWeight: 700 }}>{l.libelle}</span>
                      <Pill ton={statutResaTon(l.statut)} isDark={isDark}>{STATUT_RESA_LABEL[l.statut] ?? l.statut}</Pill>
                    </div>
                    <div style={{ color: t2, fontSize: "11.5px" }}>
                      {l.institutionNom ?? "Établissement"}{l.date && ` · ${formatDateCourt(l.date)}`}{l.heure && ` · ${l.heure.slice(0, 5)}`}
                    </div>
                  </div>
                  <button disabled={busyLiaisonId === l.liaisonId} onClick={() => void delierReservation(l.liaisonId)} aria-label="Délier" className="tap" style={{ background: "none", border: "none", color: t3, cursor: "pointer", flexShrink: 0, opacity: busyLiaisonId === l.liaisonId ? 0.5 : 1 }}><Ic.X/></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button disabled={busyAction} onClick={() => handleChangerStatut(projet.statut === "termine" ? "en_cours" : "termine")} className="tap" style={{ ...btnGhost, background: projet.statut === "termine" ? inputBg : "rgba(34,197,94,0.12)", borderColor: projet.statut === "termine" ? brd : "rgba(34,197,94,0.4)", color: projet.statut === "termine" ? t1 : "#22c55e", opacity: busyAction ? 0.6 : 1 }}>
            {projet.statut === "termine" ? "Rouvrir le projet" : "Marquer terminée"}
          </button>
          <button disabled={busyAction} onClick={() => handleChangerStatut(projet.statut === "archive" ? "en_cours" : "archive")} className="tap" style={{ ...btnGhost, opacity: busyAction ? 0.6 : 1 }}>
            {projet.statut === "archive" ? "Restaurer le projet" : "Archiver le projet"}
          </button>
        </div>

        <div style={{ borderTop: `1px solid ${brd}`, marginTop: "18px", paddingTop: "18px" }}>
          <button onClick={() => setConfirmationSuppression(true)} className="tap" style={{ width: "100%", background: "none", border: `1px solid rgba(239,68,68,0.35)`, color: "#ef4444", fontWeight: 700, fontSize: "13px", padding: "13px", borderRadius: "14px", cursor: "pointer" }}>
            Supprimer ce projet
          </button>
        </div>
      </main>

      {pickerOuvert && (
        <div onClick={() => setPickerOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 9600, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "24px 24px 0 0", padding: "10px 20px calc(env(safe-area-inset-bottom) + 20px)", width: "100%", maxWidth: "560px", maxHeight: "80svh", overflowY: "auto", animation: "sheetUp 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }}/>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ color: t1, fontSize: "16px", fontWeight: 800 }}>Lier un rendez-vous</div>
              <button onClick={() => setPickerOuvert(false)} className="tap" aria-label="Fermer" style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: "none", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
            </div>
            {pickerLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}><YelenLoader size={22} color="#F5A623"/></div>
            ) : pickerOptions.length === 0 ? (
              <div style={{ color: t3, fontSize: "12.5px", textAlign: "center", padding: "20px 0" }}>Aucun rendez-vous ou réservation disponible à lier.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {pickerOptions.map((o) => (
                  <button key={o.liaisonId} onClick={() => void lierReservation(o)} className="tap" style={{ textAlign: "left", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: "none", borderRadius: "12px", padding: "10px 12px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px", flexWrap: "wrap" }}>
                      <span style={{ color: t1, fontSize: "13.5px", fontWeight: 700 }}>{o.libelle}</span>
                      <Pill ton={statutResaTon(o.statut)} isDark={isDark}>{STATUT_RESA_LABEL[o.statut] ?? o.statut}</Pill>
                    </div>
                    <div style={{ color: t2, fontSize: "11.5px" }}>{o.institutionNom ?? "Établissement"}{o.date && ` · ${formatDateCourt(o.date)}`}{o.heure && ` · ${o.heure.slice(0, 5)}`}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmation && (
        <div onClick={() => { if (!confirmationBusy) setConfirmation(null); }} style={{ position: "fixed", inset: 0, zIndex: 9700, backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}` }}>
            <div style={{ color: t1, fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}>{confirmation.titre}</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.5, marginBottom: "18px" }}>{confirmation.message}</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmation(null)} disabled={confirmationBusy} className="tap" style={{ ...btnGhost, flex: 1, opacity: confirmationBusy ? 0.5 : 1 }}>Annuler</button>
              <button onClick={async () => { setConfirmationBusy(true); await confirmation.onConfirm(); setConfirmationBusy(false); setConfirmation(null); }} disabled={confirmationBusy} className="tap" style={{ ...btnGhost, flex: 1, background: "rgba(245,166,35,0.12)", borderColor: "rgba(245,166,35,0.4)", color: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {confirmationBusy ? <YelenLoader size={14} color="#F5A623"/> : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmationSuppression && (
        <div onClick={() => { if (!suppressionBusy) setConfirmationSuppression(false); }} style={{ position: "fixed", inset: 0, zIndex: 9800, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: card, borderRadius: "20px", padding: "22px", maxWidth: "360px", width: "100%", border: `1px solid ${brd}`, textAlign: "center" }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 900, marginBottom: "8px" }}>Supprimer ce projet ?</div>
            <div style={{ color: t2, fontSize: "13px", lineHeight: 1.6, marginBottom: "20px" }}>
              « {projet.titre} » sera définitivement supprimé{projet.etapes.length > 0 ? `, avec ${projet.etapes.length > 1 ? "ses" : "son"} ${projet.etapes.length} étape${projet.etapes.length > 1 ? "s" : ""}` : ""}. Cette action est irréversible.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button onClick={async () => { setSuppressionBusy(true); await executerSupprimerProjet(); setSuppressionBusy(false); }} disabled={suppressionBusy} className="tap" style={{ width: "100%", background: "#ef4444", color: "#fff", fontWeight: 800, fontSize: "14px", padding: "13px", borderRadius: "14px", border: "none", cursor: suppressionBusy ? "default" : "pointer", opacity: suppressionBusy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {suppressionBusy ? <YelenLoader size={16} color="#fff"/> : "Supprimer définitivement"}
              </button>
              <button onClick={() => setConfirmationSuppression(false)} disabled={suppressionBusy} className="tap" style={{ ...btnGhost, width: "100%", opacity: suppressionBusy ? 0.5 : 1 }}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 500, zIndex: 9500, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap", backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"), border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, color: toast.type === "success" ? "#22c55e" : "#ef4444" }}>
          {toast.type === "success" ? "✓ " : "⚠ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
