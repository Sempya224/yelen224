"use client";

// Centre de validation — refonte Enterprise "Front Desk / Check-in Center"
// (mission CEO Product Hardening, 05/08/2026). Anciennement "Valider un RDV
// payant", porté depuis app/institution/valider-rdv/page.tsx. Logique de
// recherche par code / actions confirme·no_show·annule inchangée, même
// route service_role app/api/institution/paid-bookings/valider/route.ts
// (Lot B, 16/07/2026 — paid_bookings/rdv n'ont que des policies citoyen).
//
// Ajouts de données réels pour cette refonte (zéro chiffre inventé) :
// - paid_bookings.traite_le (migration 20260805000018) : jusqu'ici seule
//   date_rdv/heure_rdv (créneau PRÉVU) et created_at (création de la
//   réservation) existaient — aucune colonne ne capturait le moment RÉEL de
//   traitement. Sans elle, la Timeline de la journée et l'historique
//   n'avaient que l'heure du créneau à afficher, pas l'heure réelle de
//   passage au guichet. Renseignée par la route PATCH à chaque action.
// - users.photo_url désormais sélectionnée (colonne existante, jamais lue
//   ici avant) pour l'avatar de la fiche citoyen — repli sur les initiales
//   si absente.
//
// Simplifications assumées face au brief CEO (à ne pas considérer comme des
// oublis) :
// - "Temps moyen" : mesuré réellement (Date.now() entre l'ouverture de la
//   fiche citoyen et la validation), mais scopé à la SESSION du navigateur
//   en cours, pas persisté en base. Un temps moyen "toute la journée, tous
//   agents confondus" nécessiterait de stocker une durée par validation —
//   non construit ici, la métrique de session déjà réelle suffit à l'objectif
//   (donner un repère de rythme à l'agent) sans inventer un historique qui
//   n'existe pas. Étiqueté explicitement "sur cette session".
// - "Code expiré" (état visuel orange du brief) : aucune notion d'expiration
//   n'existe sur confirmation_code (pas de colonne expires_at) — état non
//   construit plutôt que simulé avec une donnée qui n'existe pas.
// - Bouton "Confirmer la présence" (3e variante du brief) : cet écran ne
//   traite que des paid_bookings (RDV payants par construction) — seules
//   "Valider le paiement" (prix > 0) et "Confirmer gratuitement" (prix = 0,
//   cas limite si une institution configure un service payant à 0) sont
//   pertinentes ici. La validation d'un RDV gratuit vit sur l'écran Scanner
//   QR, hors périmètre de ce chantier.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { HelpCenterGuide } from "./HelpCenterGuide";
import {
  ValidationStyles, ValidationHeader, ValidationStats, CodeEntryCard, DailyActivityCard, ProcessedTodayTable, nomPropre,
  type ValidationStat, type ActiviteRow, type TraiteeRow,
} from "./ValiderRdvUi";
import { DEVISE_LABEL } from "@/lib/devise";
import { creneauEstOuvert, calculerCheckInStatus, RDV_EXPIRE_MESSAGE } from "@/lib/rdvGating";
import { heureAmPm, heureDepuisHorodatage } from "@/lib/heure";

type BookingStatut = "en_attente" | "confirme" | "termine" | "no_show" | "annule";

type BookingFound = {
  id: string;
  confirmation_code: string;
  statut: BookingStatut;
  date_rdv: string;
  heure_rdv: string;
  // Chambre hôtel (chantier "Vraie réservation hôtel", 25/09/2026) —
  // présent uniquement pour une réservation de chambre, null pour tous les
  // autres services (créneau horaire classique).
  date_depart: string | null;
  traite_le: string | null;
  montant_declare_citoyen: number | null;
  declare_le: string | null;
  pour_autre: boolean;
  nom_autre: string | null;
  phone_autre: string | null;
  service_nom: string;
  service_prix: number;
  service_duree: number;
  citoyen_prenom: string | null;
  citoyen_nom: string | null;
  citoyen_phone: string | null;
  citoyen_photo_url: string | null;
  citoyen_date_naissance_renseignee: boolean;
  citoyen_sexe: "homme" | "femme" | null;
  historique: { total: number; honores: number; absents: number; derniereVisite: string | null };
  recu_id: string | null;
};

type HistoryEntry = {
  id: string;
  confirmation_code: string;
  statut: BookingStatut;
  date_rdv: string;
  heure_rdv: string;
  traite_le: string | null;
  service_nom: string;
  service_prix: number;
  citoyen_nom: string | null;
  citoyen_photo_url: string | null;
};

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}


function formatHeure(iso: string): string {
  return heureDepuisHorodatage(iso) || "—";
}

function formatDuree(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min} min ${String(sec).padStart(2, "0")}`;
}

function initiales(nom: string | null | undefined): string {
  return (nom ?? "").split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const STATUT_CONFIG = (C: ThemeTokens): Record<BookingStatut, { label: string; color: string; bg: string }> => ({
  en_attente: { label: "En attente", color: C.gold, bg: `${C.gold}15` },
  confirme:   { label: "Payé",       color: C.green, bg: C.greenL },
  termine:    { label: "Terminé",    color: C.purple, bg: C.purpleL },
  annule:     { label: "Annulé",     color: C.red,   bg: C.redL },
  no_show:    { label: "Absent",     color: C.t2,    bg: "rgba(153,153,179,0.1)" },
});

function StatutIcon({ statut, color, size = 14 }: { statut: BookingStatut; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (statut === "confirme") return <svg {...common}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
  if (statut === "no_show") return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
  if (statut === "annule") return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
  if (statut === "termine") return <svg {...common}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}

function Avatar({ nom, photoUrl, C, size = 44 }: { nom: string | null | undefined; photoUrl?: string | null; C: ThemeTokens; size?: number }) {
  return (
    <div style={{ width: size, height: size, position: "relative", borderRadius: Math.round(size * 0.32), overflow: "hidden", flexShrink: 0, backgroundColor: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {photoUrl ? (
        <Image src={photoUrl} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }}/>
      ) : (
        <span style={{ color: "#000", fontSize: Math.round(size * 0.36), fontWeight: 800 }}>{initiales(nom)}</span>
      )}
    </div>
  );
}

// Encadré Vérification (section 6 du brief) — 4 contrôles déterministes,
// aucun n'est un jugement porté sur le citoyen : "Identité cohérente"
// signifie seulement que le profil a un nom ET un téléphone renseignés
// (pas de vérification biométrique/faciale, hors périmètre) ; "Code valide"
// et "Institution correcte" sont mécaniquement vrais dès qu'une fiche est
// affichée (la route ne renvoie un booking que scopé à l'institution
// authentifiée) ; "Rendez-vous du jour" compare réellement date_rdv à
// aujourd'hui.
function CheckRow({ ok, label, C }: { ok: boolean; label: string; C: ThemeTokens }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0" }}>
      <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: ok ? C.greenL : C.bg3, border: `1px solid ${ok ? C.green + "50" : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {ok ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/></svg>
        )}
      </div>
      <span style={{ color: ok ? C.t1 : C.t3, fontSize: "12px", fontWeight: ok ? 700 : 500 }}>{label}</span>
    </div>
  );
}

// Modale de confirmation — même convention bottom-sheet mobile / dialogue
// centré ≥1024px que le reste du dashboard (.client-fiche-*/.dispo-fiche-*),
// jamais de window.confirm. Réutilisée pour "Annuler la validation",
// "Annuler la réservation" (motif obligatoire, signalé par Bryan 05/08/2026 :
// ces boutons déclenchaient l'action directement sans confirmation —
// "pas normal") ET "Marquer comme absent" (requireMotif=false — Bryan
// voulait un avertissement/rappel que l'action est visible du citoyen, pas
// un motif écrit obligatoire). Collecte le motif si demandé et affiche
// l'erreur retournée par le serveur, qui reste seul juge des règles.
function MotifModal({ C, titre, description, motif, setMotif, loading, error, confirmLabel, onConfirm, onClose, requireMotif = true }: {
  C: ThemeTokens; titre: string; description: string; motif: string; setMotif: (v: string) => void;
  loading: boolean; error: string | null; confirmLabel: string; onConfirm: () => void; onClose: () => void; requireMotif?: boolean;
}) {
  const bloque = loading || (requireMotif && motif.trim().length < 5);
  return (
    <div className="valider-annuler-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <style>{`
        @media(min-width:1024px){
          .valider-annuler-overlay{align-items:center!important}
          .valider-annuler-panel{max-width:440px!important;border-radius:20px!important}
        }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="valider-annuler-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: "440px", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease" }}>
        <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>{titre}</div>
        <p style={{ color: C.t2, fontSize: "12px", lineHeight: 1.6, marginBottom: requireMotif ? "14px" : 0 }}>{description}</p>
        {requireMotif && (
          <>
            <label style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>Motif (obligatoire)</label>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3} placeholder="Ex. mauvais citoyen sélectionné, montant erroné…" style={{ width: "100%", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13px", color: C.t1, resize: "vertical", fontFamily: "inherit" }}/>
          </>
        )}
        {error && <div style={{ marginTop: "10px", color: C.red, fontSize: "11.5px", fontWeight: "600", lineHeight: 1.5 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px", marginTop: "16px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" disabled={loading} onClick={onClose}>Fermer</Button>
          <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" disabled={bloque} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function ValiderRdvTab({ preloadBookingId, onPreloadConsumed }: { instId: string; preloadBookingId?: string | null; onPreloadConsumed?: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const statutConfig = STATUT_CONFIG(C);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const lastAutoSearched = useRef<string>("");
  // Retour visuel de focus (signalé par Bryan 05/08/2026 : les cases ne
  // réagissaient qu'une fois un chiffre déjà tapé, jamais au clic/focus lui-
  // même — combiné au caret masqué ci-dessous, cliquer dedans donnait
  // l'impression que rien ne se passait, même si le focus fonctionnait
  // réellement au niveau du navigateur).
  const [focusedDigit, setFocusedDigit] = useState<number | null>(null);

  const [booking, setBooking] = useState<BookingFound | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorMeta, setActionErrorMeta] = useState<{ titre: string; message: string } | null>(null);
  const [actionSuccess, setActionSuccess] = useState<BookingStatut | null>(null);
  const [telechargementRecu, setTelechargementRecu] = useState(false);

  // Décision CEO 06/08/2026 — "activer le reçu aussi côté institution" :
  // téléchargement direct depuis la fiche de validation, sans devoir
  // repasser par l'onglet Paiements séparé. Même convention URL signée
  // (60s) que app/institution/[id]/dashboard/components/PaiementsTab.tsx.
  async function telechargerRecuFiche() {
    if (!booking?.recu_id) return;
    // Fenêtre ouverte de façon synchrone dans la pile du clic — un window.open()
    // déclenché après un await est bloqué silencieusement par les bloqueurs de
    // popup (Safari iOS notamment) : rien ne se passe, aucune erreur visible.
    const fenetre = window.open("", "_blank");
    setTelechargementRecu(true);
    const res = await fetch(`/api/institution/recus/${booking.recu_id}/pdf`);
    const j = await res.json().catch(() => null);
    setTelechargementRecu(false);
    if (!res.ok || !j?.signedUrl) { fenetre?.close(); return; }
    if (fenetre) fenetre.location.href = j.signedUrl;
    else window.open(j.signedUrl, "_blank");
  }

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [showAide, setShowAide] = useState(false);
  const [paiementOuvert, setPaiementOuvert] = useState(true);
  const [expireBannerFerme, setExpireBannerFerme] = useState(false);

  // "Annuler la validation" (secondaire, réservé confirme→paiements.rembourser
  // / no_show,annule→rdv.write côté serveur, motif obligatoire) — reverse une
  // action déjà traitée le jour même. Voir handleAnnulerValidation dans la
  // route API pour les règles exactes.
  const [showAnnulerModal, setShowAnnulerModal] = useState(false);
  const [annulerMotif, setAnnulerMotif] = useState("");
  const [annulerLoading, setAnnulerLoading] = useState(false);
  const [annulerError, setAnnulerError] = useState<string | null>(null);

  // "Annuler la réservation" (en_attente uniquement) — même exigence de
  // motif que ci-dessus, ajoutée le 05/08/2026 car ce bouton déclenchait
  // l'annulation sans aucune confirmation.
  const [showAnnulerReservationModal, setShowAnnulerReservationModal] = useState(false);
  const [annulerReservationMotif, setAnnulerReservationMotif] = useState("");
  const [annulerReservationLoading, setAnnulerReservationLoading] = useState(false);
  const [annulerReservationError, setAnnulerReservationError] = useState<string | null>(null);

  // "Marquer comme absent" — motif obligatoire depuis le 08/09/2026
  // (décision CEO, revenant sur le choix initial du 05/08/2026 qui
  // l'excluait volontairement : un no-show déclenche désormais une
  // mécanique de restriction citoyen potentiellement lourde jusqu'à la
  // clôture de compte, l'accountability l'exige). loading/error restent
  // ceux de handleAction("no_show") (actionLoading/actionError), déjà
  // partagés par toutes les actions de cette fiche.
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [absentMotif, setAbsentMotif] = useState("");

  // Temps moyen — mesuré réellement entre l'ouverture de la fiche citoyen
  // et la validation, scopé à cette session navigateur (voir note d'en-tête).
  const [sessionDurations, setSessionDurations] = useState<number[]>([]);
  const ficheShownAt = useRef<number | null>(null);

  const citoyensRecus = history.length;
  const todayPaye = history.filter(h => h.statut === "confirme").length;
  const todayCA = history.filter(h => h.statut === "confirme").reduce((s, h) => s + h.service_prix, 0);
  const avgMs = sessionDurations.length ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length) : null;

  useEffect(() => { setTimeout(() => inputRefs.current[0]?.focus(), 300); }, []);

  // Préremplissage depuis le bouton "Prendre en charge" de l'écran RDV (Lot
  // C, refonte cycle de vie RDV, 16/07/2026) — évite de retaper le code Yelen
  // quand le staff arrive déjà depuis la ligne RDV concernée.
  useEffect(() => {
    if (!preloadBookingId) return;
    (async () => {
      setSearching(true); setSearchError(null); setBooking(null); setActionSuccess(null); setActionError(null); setActionErrorMeta(null); setExpireBannerFerme(false);
      const res = await fetch(`/api/institution/paid-bookings/valider?id=${preloadBookingId}`);
      const j = await res.json().catch(() => null);
      setSearching(false);
      if (!res.ok) { setSearchError(j?.error || "Réservation introuvable."); onPreloadConsumed?.(); return; }
      setBooking(j.booking);
      ficheShownAt.current = Date.now();
      setDigits(j.booking.confirmation_code.split(""));
      onPreloadConsumed?.();
    })();
  }, [preloadBookingId, onPreloadConsumed]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/institution/paid-bookings/valider?history=1");
      const j = res.ok ? await res.json().catch(() => null) : null;
      setHistoryError(!j);
      setHistory(j?.history ?? []);
    } catch { setHistoryError(true); }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function handleDigit(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setSearchError(null);
    if (v && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) { e.preventDefault(); inputRefs.current[index - 1]?.focus(); }
    if (e.key === "ArrowRight" && index < 5) { e.preventDefault(); inputRefs.current[index + 1]?.focus(); }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      setTimeout(() => inputRefs.current[5]?.focus(), 10);
    }
  }

  function resetCode() {
    setDigits(["", "", "", "", "", ""]);
    setBooking(null);
    setSearchError(null);
    setActionError(null);
    setActionErrorMeta(null);
    setActionSuccess(null);
    setExpireBannerFerme(false);
    lastAutoSearched.current = "";
    ficheShownAt.current = null;
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }

  const handleSearch = useCallback(async (code: string) => {
    setSearching(true);
    setSearchError(null);
    setBooking(null);
    setActionSuccess(null);
    setActionError(null);
    setActionErrorMeta(null);
    setExpireBannerFerme(false);

    const res = await fetch(`/api/institution/paid-bookings/valider?code=${code}`);
    const j = await res.json().catch(() => null);
    setSearching(false);

    if (!res.ok) { setSearchError(j?.error || "Aucune réservation trouvée pour ce code dans votre institution. Vérifiez le code et réessayez."); return; }
    setBooking(j.booking);
    ficheShownAt.current = Date.now();
  }, []);

  // Validation instantanée (section 4 du brief) — dès que le 6e chiffre est
  // saisi, recherche automatique, aucun bouton à cliquer. Le garde-fou
  // lastAutoSearched évite une boucle : un code déjà tenté (même en échec)
  // n'est pas relancé tant que l'agent n'a pas modifié au moins un chiffre.
  useEffect(() => {
    const code = digits.join("");
    const complete = digits.every(d => d !== "");
    if (complete && code !== lastAutoSearched.current && !searching) {
      lastAutoSearched.current = code;
      handleSearch(code);
    }
  }, [digits, searching, handleSearch]);

  async function handleAction(newStatut: BookingStatut, motif?: string) {
    if (!booking) return;
    setActionLoading(true);
    setActionError(null);
    setActionErrorMeta(null);

    const res = await fetch("/api/institution/paid-bookings/valider", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: booking.id, action: newStatut, ...(motif ? { motif } : {}), ...(newStatut === "confirme" ? { montant_vu: booking.service_prix } : {}) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setActionLoading(false);
      if (j?.hors_creneau) { setActionErrorMeta({ titre: j.titre ?? "Le citoyen est en avance", message: j.error ?? "" }); return; }
      setActionError(j?.error || "Erreur lors de la mise à jour.");
      return;
    }

    if (ficheShownAt.current) {
      const duree = Date.now() - ficheShownAt.current;
      setSessionDurations(prev => [...prev, duree].slice(-50));
      ficheShownAt.current = null;
    }
    setActionSuccess(newStatut);
    setBooking(prev => (prev ? { ...prev, statut: newStatut, recu_id: j?.recu_id ?? prev.recu_id } : null));
    setActionLoading(false);
    loadHistory();
  }

  async function handleAnnulerValidation() {
    if (!booking) return;
    if (annulerMotif.trim().length < 5) { setAnnulerError("Un motif d'au moins 5 caractères est requis."); return; }
    setAnnulerLoading(true);
    setAnnulerError(null);

    const res = await fetch("/api/institution/paid-bookings/valider", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: booking.id, action: "annuler_validation", motif: annulerMotif.trim() }),
    });
    const j = await res.json().catch(() => null);
    setAnnulerLoading(false);
    if (!res.ok) { setAnnulerError(j?.error || "Erreur lors de l'annulation."); return; }

    setShowAnnulerModal(false);
    setAnnulerMotif("");
    setBooking(prev => (prev ? { ...prev, statut: "en_attente", traite_le: null } : null));
    ficheShownAt.current = Date.now();
    loadHistory();
  }

  async function handleAnnulerReservation() {
    if (!booking) return;
    if (annulerReservationMotif.trim().length < 5) { setAnnulerReservationError("Un motif d'au moins 5 caractères est requis."); return; }
    setAnnulerReservationLoading(true);
    setAnnulerReservationError(null);

    const res = await fetch("/api/institution/paid-bookings/valider", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: booking.id, action: "annule", motif: annulerReservationMotif.trim() }),
    });
    const j = await res.json().catch(() => null);
    setAnnulerReservationLoading(false);
    if (!res.ok) { setAnnulerReservationError(j?.error || "Erreur lors de l'annulation."); return; }

    setShowAnnulerReservationModal(false);
    setAnnulerReservationMotif("");
    if (ficheShownAt.current) {
      const duree = Date.now() - ficheShownAt.current;
      setSessionDurations(prev => [...prev, duree].slice(-50));
      ficheShownAt.current = null;
    }
    setActionSuccess("annule");
    setBooking(prev => (prev ? { ...prev, statut: "annule" } : null));
    loadHistory();
  }

  // Confirmation Premium (section 11 du brief) — disparition automatique
  // après 2s, l'agent peut aussi cliquer "Valider un autre paiement" pour ne
  // pas attendre.
  useEffect(() => {
    if (!actionSuccess) return;
    const t = setTimeout(() => resetCode(), 2000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  const codeComplete = digits.every(d => d !== "");
  const nomCitoyen = booking ? (booking.pour_autre && booking.nom_autre ? booking.nom_autre : `${booking.citoyen_prenom ?? ""} ${booking.citoyen_nom ?? ""}`.trim() || "Citoyen enregistré") : "";

  // Alerte proactive "le citoyen est en avance" (section 7 du brief) —
  // affichée dès l'ouverture de la fiche, pas seulement après une tentative
  // de validation refusée par le serveur (creneauEstOuvert, même règle
  // exacte que app/api/institution/paid-bookings/valider/route.ts::PATCH).
  const rdvDateTime = booking ? new Date(`${booking.date_rdv}T${booking.heure_rdv}:00`) : null;
  const checkInStatus = booking ? calculerCheckInStatus(booking.date_rdv, booking.heure_rdv) : "CHECK_IN_AVAILABLE";
  const estEnAvance = !!booking && booking.statut === "en_attente" && checkInStatus === "CHECK_IN_NOT_YET_AVAILABLE";
  const minutesEnAvance = estEnAvance && rdvDateTime ? Math.round((rdvDateTime.getTime() - Date.now()) / 60000) : 0;

  // Journée du rendez-vous entièrement passée — proactif, pas seulement
  // découvert après un clic refusé (même logique que estEnAvance ci-dessus,
  // miroir indicatif du CHECK_IN_EXPIRED serveur, voir
  // CheckInUnavailableDialog.tsx côté RDV gratuit).
  const estExpire = !!booking && booking.statut === "en_attente" && checkInStatus === "CHECK_IN_EXPIRED";

  // Encadré Vérification (section 6 du brief) — voir le commentaire de
  // CheckRow pour ce que chaque contrôle mesure réellement.
  const identiteCoherente = !!booking && !!(booking.pour_autre ? booking.nom_autre : (booking.citoyen_prenom || booking.citoyen_nom)) && !!(booking.pour_autre ? booking.phone_autre : booking.citoyen_phone);
  const rdvDuJour = !!booking && booking.date_rdv === new Date().toISOString().slice(0, 10);

  // Double confirmation (Lot B) — miroir client (indicatif) de la même
  // règle côté serveur : un service payant ne peut être validé qu'une fois
  // le citoyen déclaré. Le serveur reste seul juge (code DECLARATION_MANQUANTE).
  const declarationRequiseMaisAbsente = !!booking && booking.service_prix > 0 && !booking.declare_le;

  // Miroir client (indicatif) de la fenêtre imposée côté serveur — le
  // bouton n'apparaît que si une chance raisonnable existe que la requête
  // aboutisse ; le serveur reste seul juge (traite_le exact, permission).
  const peutAnnulerValidation = !!booking && booking.statut !== "en_attente" && !!booking.traite_le
    && booking.traite_le.slice(0, 10) === new Date().toISOString().slice(0, 10);

  const prixSepare = formatPrix(todayCA);
  const prixSep = prixSepare.lastIndexOf(" ");
  const iconKpi = (d: ReactNode) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
  const stats: ValidationStat[] = [
    {
      label: "Citoyens reçus", value: String(citoyensRecus), sub: "traités aujourd'hui",
      icon: iconKpi(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
    },
    {
      label: "Paiements validés", value: String(todayPaye), sub: "Aujourd'hui",
      icon: iconKpi(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>),
    },
    {
      label: "Chiffre du jour", value: prixSepare.slice(0, prixSep), unit: prixSepare.slice(prixSep + 1), sub: "Aujourd'hui",
      icon: iconKpi(<><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></>),
    },
    {
      label: "Temps moyen", value: avgMs !== null ? formatDuree(avgMs) : "—", sub: avgMs !== null ? "par validation, cette session" : "aucune validation encore",
      icon: iconKpi(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
    },
  ];
  const activiteRows: ActiviteRow[] = history.map(h => {
    const cfg = statutConfig[h.statut];
    return {
      id: h.id, statut: h.statut, label: cfg.label, color: cfg.color, bg: cfg.bg,
      icon: <StatutIcon statut={h.statut} color={cfg.color} size={12}/>,
      heure: h.traite_le ? formatHeure(h.traite_le) : "—", nom: nomPropre(h.citoyen_nom || h.service_nom),
    };
  });
  const traiteesRows: TraiteeRow[] = history.map(h => {
    const cfg = statutConfig[h.statut];
    return {
      id: h.id, avatar: <Avatar nom={h.citoyen_nom} photoUrl={h.citoyen_photo_url} C={C} size={32}/>,
      nom: nomPropre(h.citoyen_nom ?? ""), service: h.service_nom, code: h.confirmation_code,
      prix: h.statut === "confirme" ? formatPrix(h.service_prix) : null,
      heure: h.traite_le ? formatHeure(h.traite_le) : "—",
      label: cfg.label, color: cfg.color, bg: cfg.bg, icon: <StatutIcon statut={h.statut} color={cfg.color} size={12}/>,
    };
  });

  return (
    <div className="vrx-page" style={{ animation: "fadeUp 0.2s ease" }}>
      {showAnnulerModal && booking && (
        <MotifModal
          C={C}
          titre="Annuler la validation"
          description={booking.statut === "confirme"
            ? "Cette réservation repasse en attente et le paiement encaissé est reversé dans le registre financier (l'encaissement d'origine reste conservé, une écriture d'annulation est ajoutée à côté)."
            : "Cette réservation repasse en attente."}
          motif={annulerMotif}
          setMotif={setAnnulerMotif}
          loading={annulerLoading}
          error={annulerError}
          confirmLabel="Confirmer l'annulation"
          onConfirm={handleAnnulerValidation}
          onClose={() => { if (!annulerLoading) setShowAnnulerModal(false); }}
        />
      )}

      {showAnnulerReservationModal && booking && (
        <MotifModal
          C={C}
          titre="Annuler la réservation"
          description="Cette réservation sera annulée et ne sera plus disponible pour le citoyen."
          motif={annulerReservationMotif}
          setMotif={setAnnulerReservationMotif}
          loading={annulerReservationLoading}
          error={annulerReservationError}
          confirmLabel="Confirmer l'annulation"
          onConfirm={handleAnnulerReservation}
          onClose={() => { if (!annulerReservationLoading) setShowAnnulerReservationModal(false); }}
        />
      )}

      {showAbsentModal && booking && (
        <MotifModal
          C={C}
          requireMotif={true}
          titre="Marquer comme absent"
          description="Cette action est visible du citoyen, dans son propre historique Yelen et dans l'historique affiché à l'institution sur ses futures fiches."
          motif={absentMotif} setMotif={setAbsentMotif}
          loading={actionLoading}
          error={actionError}
          confirmLabel="Confirmer"
          onConfirm={() => { setShowAbsentModal(false); handleAction("no_show", absentMotif.trim()); setAbsentMotif(""); }}
          onClose={() => { if (!actionLoading) { setShowAbsentModal(false); setAbsentMotif(""); } }}
        />
      )}

      {/* Fiche de validation — "Identity Verification Card" (refonte
          05/08/2026, brief CEO dédié), en pop plein écran avec X de
          fermeture (signalé par Bryan 05/08/2026 : la fiche s'ouvrait dans
          le flux de la page, "expérience cachée" — désormais un vrai écran
          dédié, même convention que les pop-up plein écran citoyen
          Mes démarches/Mes dépenses : header sticky X + titre). Question
          unique : est-ce bien la bonne personne et le bon rendez-vous ?
          Lecture verticale en 5 zones titrées : alertes → Citoyen → Détails
          de la réservation → Paiement → Vérification/Historique → Action. */}
      {booking && (
        <div className="client-fiche-scroll" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: C.bg, overflowY: "scroll", animation: "fadeIn 0.2s ease" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 10, background: `${C.bg}F2`, backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}`, padding: "env(safe-area-inset-top) 16px 0" }}>
            <div style={{ height: "56px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <button onClick={resetCode} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "10px", background: C.bg3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.t1, cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: "800" }}>Fiche de validation</div>
              <div/>
            </div>
          </header>

          <div className="fiche-body" style={{ padding: "20px 16px calc(env(safe-area-inset-bottom) + 40px)", maxWidth: "640px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gridTemplateAreas: `"alerts" "citoyen" "main"` }}>
            <style>{`
              @media(min-width:1024px){
                .fiche-body{max-width:1120px!important; padding:40px 40px calc(env(safe-area-inset-bottom) + 60px)!important; grid-template-columns:380px 1fr!important; grid-template-areas:"citoyen alerts" "citoyen main"!important; column-gap:24px!important; align-items:start!important}
                .fiche-area-citoyen{position:sticky!important; top:76px!important}
              }
            `}</style>

            <div className="fiche-area-alerts" style={{ gridArea: "alerts" }}>
            {/* Alerte proactive — visible dès l'ouverture de la fiche, pas
                seulement après un clic refusé */}
            {estEnAvance && !actionErrorMeta && (
              <div style={{ marginBottom: "14px", padding: "16px 18px", background: `${C.orange}10`, border: `1px solid ${C.orange}35`, borderRadius: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${C.orange}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <div style={{ color: C.orange, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>Le citoyen est en avance</div>
                  <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.6 }}>
                    {booking.date_depart
                      ? `Arrivée prévue le ${new Date(`${booking.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}, dans environ ${Math.max(1, Math.round(minutesEnAvance / 1440))} jour${Math.round(minutesEnAvance / 1440) > 1 ? "s" : ""}.`
                      : `Rendez-vous prévu à ${heureAmPm(booking.heure_rdv) || booking.heure_rdv}, dans environ ${minutesEnAvance} min. La validation ne sera possible qu'à partir de 10 minutes avant l'heure prévue.`}
                  </div>
                </div>
              </div>
            )}

            {/* RDV expiré — journée du rendez-vous entièrement passée, verrou
                permanent (contrairement à "en avance" ci-dessus, qui se lève
                de lui-même) : proactif, pas seulement découvert après un clic
                refusé. Miroir indicatif du CHECK_IN_EXPIRED serveur, voir
                CheckInUnavailableDialog.tsx côté RDV gratuit. */}
            {estExpire && !actionErrorMeta && !expireBannerFerme && (
              <div style={{ marginBottom: "14px", padding: "16px 18px", background: `${C.red}10`, border: `1px solid ${C.red}35`, borderRadius: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${C.red}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.red, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>{RDV_EXPIRE_MESSAGE.titre}</div>
                  <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.6 }}>
                    {booking.date_depart
                      ? `Arrivée prévue le ${new Date(`${booking.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — la journée est terminée, plus aucune action n'est possible depuis cet écran.`
                      : `Rendez-vous prévu le ${new Date(`${booking.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à ${heureAmPm(booking.heure_rdv) || booking.heure_rdv} — la journée est terminée, plus aucune action n'est possible depuis cet écran.`}
                  </div>
                </div>
                <button onClick={() => setExpireBannerFerme(true)} className="tap" aria-label="Fermer" style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", color: C.t3, flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* Hors créneau — détecté par le serveur après une tentative
                refusée (section 12 du brief) : "en avance" (orange, le verrou
                se lève de lui-même) ou "expiré" (rouge, verrou permanent,
                voir RDV_EXPIRE_MESSAGE) — même distinction que les deux
                bandeaux proactifs ci-dessus. */}
            {actionErrorMeta && (
              <div style={{ marginBottom: "14px", padding: "16px 18px", background: `${actionErrorMeta.titre === RDV_EXPIRE_MESSAGE.titre ? C.red : C.orange}10`, border: `1px solid ${actionErrorMeta.titre === RDV_EXPIRE_MESSAGE.titre ? C.red : C.orange}35`, borderRadius: "16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${actionErrorMeta.titre === RDV_EXPIRE_MESSAGE.titre ? C.red : C.orange}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {actionErrorMeta.titre === RDV_EXPIRE_MESSAGE.titre ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  )}
                </div>
                <div>
                  <div style={{ color: actionErrorMeta.titre === RDV_EXPIRE_MESSAGE.titre ? C.red : C.orange, fontSize: "13px", fontWeight: "800", marginBottom: "4px" }}>{actionErrorMeta.titre}</div>
                  <div style={{ color: C.t2, fontSize: "11.5px", lineHeight: 1.6, whiteSpace: "pre-line" }}>{actionErrorMeta.message}</div>
                </div>
              </div>
            )}

            {booking.statut !== "en_attente" && !actionSuccess && (
              <div style={{ marginBottom: "14px", padding: "14px 16px", background: statutConfig[booking.statut].bg, border: `1px solid ${statutConfig[booking.statut].color}33`, borderRadius: "14px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${statutConfig[booking.statut].color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <StatutIcon statut={booking.statut} color={statutConfig[booking.statut].color} size={17}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: statutConfig[booking.statut].color, fontSize: "13px", fontWeight: "800" }}>
                    Déjà traitée : {statutConfig[booking.statut].label}
                  </div>
                  <div style={{ color: C.t3, fontSize: "11px", marginTop: "3px", lineHeight: 1.5 }}>
                    {booking.traite_le ? `Traité à ${formatHeure(booking.traite_le)}. ` : ""}Aucune action supplémentaire n&apos;est requise.
                  </div>
                  {peutAnnulerValidation && (
                    <button onClick={() => { setAnnulerError(null); setAnnulerMotif(""); setShowAnnulerModal(true); }} className="tap" style={{ marginTop: "8px", background: "none", border: "none", padding: 0, color: statutConfig[booking.statut].color, fontSize: "11px", fontWeight: "800", textDecoration: "underline", cursor: "pointer" }}>
                      Annuler la validation
                    </button>
                  )}
                </div>
              </div>
            )}

            {actionSuccess && (
              <div style={{ marginBottom: "14px", padding: "24px 16px", background: statutConfig[actionSuccess].bg, border: `2px solid ${statutConfig[actionSuccess].color}44`, borderRadius: "18px", textAlign: "center", animation: "fadeUp 0.25s ease" }}>
                <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: `${statutConfig[actionSuccess].color}20`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                  <StatutIcon statut={actionSuccess} color={statutConfig[actionSuccess].color} size={26}/>
                </div>
                <div style={{ color: statutConfig[actionSuccess].color, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.3px" }}>
                  {actionSuccess === "confirme" && (booking.service_prix > 0 ? "Paiement confirmé." : "Présence confirmée.")}
                  {actionSuccess === "no_show" && "Citoyen marqué absent"}
                  {actionSuccess === "annule" && "Réservation annulée"}
                </div>
                {actionSuccess === "confirme" && (
                  <div style={{ color: C.t3, fontSize: "12px", marginTop: "6px", lineHeight: 1.6 }}>
                    {booking.service_prix > 0 && <>{formatPrix(booking.service_prix)} encaissé en espèces<br/></>}
                    Le citoyen est maintenant enregistré comme présent. Le service concerné a été notifié automatiquement.
                  </div>
                )}
                {actionSuccess === "confirme" && booking.recu_id && (
                  <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth loading={telechargementRecu} style={{ marginTop: "14px", color: C.gold, border: `1px solid ${C.gold}30`, backgroundColor: `${C.gold}12` }} onClick={telechargerRecuFiche}>Télécharger le reçu</Button>
                )}
              </div>
            )}
            </div>

            {/* Zone 1 — Citoyen (photo, nom, badge) */}
            <div className="fiche-area-citoyen" style={{ gridArea: "citoyen", background: C.bgCard, borderRadius: "22px", border: `1.5px solid ${C.border2}`, overflow: "hidden", marginBottom: "14px" }}>
              {booking.statut !== "en_attente" && <div style={{ height: "4px", background: statutConfig[booking.statut].color }}/>}
              <div style={{ padding: "20px 20px 20px" }}>
                <div style={{ color: C.t3, fontSize: "11px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "16px" }}>{booking.pour_autre ? "Bénéficiaire du rendez-vous" : "Client"}</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                    <Avatar nom={nomCitoyen} photoUrl={booking.pour_autre ? null : booking.citoyen_photo_url} C={C} size={88}/>
                  </div>
                  <div style={{ color: C.t1, fontSize: "20px", fontWeight: "800", letterSpacing: "-0.3px" }}>{nomCitoyen}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                    <span style={{ padding: "5px 11px", background: booking.statut === "en_attente" ? C.gold : statutConfig[booking.statut].bg, border: booking.statut === "en_attente" ? "none" : `1px solid ${statutConfig[booking.statut].color}44`, borderRadius: "20px", display: "flex", alignItems: "center", gap: "5px" }}>
                      <StatutIcon statut={booking.statut} color={booking.statut === "en_attente" ? "#000" : statutConfig[booking.statut].color} size={11}/>
                      <span style={{ color: booking.statut === "en_attente" ? "#000" : statutConfig[booking.statut].color, fontSize: "11px", fontWeight: "800" }}>{statutConfig[booking.statut].label}</span>
                    </span>
                    {!booking.pour_autre ? (
                      <span style={{ padding: "5px 11px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "20px", color: C.t2, fontSize: "10.5px", fontWeight: "700" }}>Client vérifié</span>
                    ) : (
                      <span style={{ padding: "5px 11px", background: `${C.orange}12`, border: `1px solid ${C.orange}40`, borderRadius: "20px", color: C.orange, fontSize: "10.5px", fontWeight: "700" }}>Tiers — identité non vérifiée</span>
                    )}
                    {(booking.pour_autre ? booking.phone_autre : booking.citoyen_phone) && (
                      <span style={{ padding: "5px 11px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "20px", color: C.t2, fontSize: "10.5px", fontWeight: "700" }}>Téléphone confirmé</span>
                    )}
                  </div>

                  <div style={{ marginTop: "18px", textAlign: "left" }}>
                    {[
                      { label: "Téléphone", value: (booking.pour_autre ? booking.phone_autre : booking.citoyen_phone) ?? "—" },
                      !booking.pour_autre && booking.citoyen_date_naissance_renseignee ? { label: "Date de naissance", value: "••••••" } : null,
                      !booking.pour_autre && booking.citoyen_sexe ? { label: "Sexe", value: booking.citoyen_sexe === "homme" ? "Homme" : "Femme" } : null,
                    ].filter((r): r is { label: string; value: string } => r !== null).map((row, i, arr) => (
                      <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <span style={{ color: C.t3, fontSize: "11.5px" }}>{row.label}</span>
                        <span style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {(booking.pour_autre ? booking.phone_autre : booking.citoyen_phone) && (
                    <a href={`tel:${booking.pour_autre ? booking.phone_autre : booking.citoyen_phone}`} className="tap" style={{ marginTop: "14px", width: "100%", padding: "10px", borderRadius: "10px", border: `1px solid ${C.border2}`, background: "transparent", color: C.gold, fontSize: "12px", fontWeight: "700", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.54 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      Appeler
                    </a>
                  )}

                  {/* Réservation "pour un tiers" — les deux identités sont
                      volontairement séparées visuellement (signalé par
                      Bryan 05/08/2026, "le mélange... pas structuré et
                      explicite") : le bloc principal ci-dessus est le
                      bénéficiaire à identifier sur place (nom_autre, non
                      vérifié), ce sous-bloc distinct est le titulaire du
                      compte Yelen qui a fait la réservation — jamais fondus
                      en une seule identité. */}
                  {booking.pour_autre && (
                    <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "14px", background: C.bg3, border: `1px solid ${C.border2}`, textAlign: "left" }}>
                      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "10px" }}>Réservé par</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar nom={`${booking.citoyen_prenom ?? ""} ${booking.citoyen_nom ?? ""}`.trim() || "Compte Yelen"} photoUrl={booking.citoyen_photo_url} C={C} size={38}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: C.t1, fontSize: "13px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${booking.citoyen_prenom ?? ""} ${booking.citoyen_nom ?? ""}`.trim() || "Compte Yelen"}</div>
                          <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "1px" }}>Compte Yelen vérifié{booking.citoyen_phone ? ` · ${booking.citoyen_phone}` : ""}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="fiche-area-main" style={{ gridArea: "main" }}>
            {/* Zone 2 — Détails de la réservation */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px 20px", marginBottom: "14px" }}>
              <div style={{ color: C.t3, fontSize: "11px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Détails de la réservation</div>
              <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: "12px" }}>{booking.service_nom}</div>
              {booking.date_depart ? (
                // Chambre hôtel — arrivée/départ/nuits plutôt que
                // date/heure/durée en minutes (1440 min n'aurait aucun sens
                // affiché ici, voir ServicesHotelTab.tsx::handleSaveChambre).
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Arrivée</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{new Date(`${booking.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                  </div>
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Départ</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{new Date(`${booking.date_depart}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                  </div>
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Nuits</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{Math.round((new Date(`${booking.date_depart}T00:00:00`).getTime() - new Date(`${booking.date_rdv}T00:00:00`).getTime()) / 86400000)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: booking.service_duree > 0 ? "1fr 1fr 1fr" : "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Date</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{new Date(`${booking.date_rdv}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                  </div>
                  <div>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Heure</div>
                    <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{heureAmPm(booking.heure_rdv) || booking.heure_rdv}</div>
                  </div>
                  {booking.service_duree > 0 && (
                    <div>
                      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Durée prévue</div>
                      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "700" }}>{booking.service_duree} min</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Zone 3 — Paiement (uniquement si le service est payant) —
                refonte "réduisable" (demande Bryan 15/10/2026) : header
                cliquable toujours visible (montant + statut en un coup
                d'œil), détails (mode, déclaration citoyen) repliables. */}
            {booking.service_prix > 0 && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", marginBottom: "14px", overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setPaiementOuvert(v => !v)}
                  className="tap"
                  aria-expanded={paiementOuvert}
                  style={{ width: "100%", background: "none", border: "none", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.8px", textTransform: "uppercase" }}>Paiement</div>
                    <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", letterSpacing: "-0.3px", marginTop: "2px" }}>{formatPrix(booking.service_prix)}</div>
                  </div>
                  {booking.statut === "confirme" ? (
                    <span style={{ padding: "4px 10px", background: C.greenL, borderRadius: "20px", color: C.green, fontSize: "10.5px", fontWeight: "800", flexShrink: 0 }}>Confirmé</span>
                  ) : (
                    <span style={{ padding: "4px 10px", border: `1px solid ${C.border2}`, borderRadius: "20px", color: C.gold, fontSize: "10.5px", fontWeight: "800", flexShrink: 0 }}>En attente</span>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: paiementOuvert ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                {paiementOuvert && (
                  <div style={{ padding: "0 20px 18px", animation: "fadeUp 0.2s ease" }}>
                    <div style={{ height: "1px", background: C.border, marginBottom: "16px" }}/>
                    <div>
                      <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" }}>Mode</div>
                      <div style={{ color: C.t1, fontSize: "12px", fontWeight: "700" }}>Paiement sur place</div>
                    </div>

                    {/* Double confirmation (Lot B, décision CEO 05/08/2026) —
                        déclaration du citoyen, très visible, à comparer avant
                        de valider. Aucune saisie libre côté agent : il compare
                        puis valide, le serveur refait la comparaison de toute
                        façon (source de vérité). */}
                    {booking.statut === "en_attente" && (
                      booking.declare_le ? (
                        <div style={{ marginTop: "14px", padding: "14px 16px", borderRadius: "14px", background: `${C.green}12`, border: `1.5px solid ${C.green}40` }}>
                          <div style={{ color: C.t3, fontSize: "10px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Le citoyen déclare avoir remis</div>
                          <div style={{ color: C.green, fontSize: "20px", fontWeight: "800" }}>{formatPrix(booking.montant_declare_citoyen ?? booking.service_prix)}</div>
                        </div>
                      ) : (
                        <div style={{ marginTop: "14px", padding: "12px 16px", borderRadius: "14px", background: C.bg3, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", gap: "10px" }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span style={{ color: C.t2, fontSize: "11.5px", fontWeight: "600", lineHeight: 1.5 }}>Le citoyen n&apos;a pas encore déclaré remettre ce paiement depuis son écran.</span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Zone 4 — Vérification (contrôles déterministes, voir CheckRow) */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "16px 20px", marginBottom: "14px" }}>
              <div style={{ color: C.t3, fontSize: "11px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Vérification</div>
              <CheckRow ok={identiteCoherente} label="Identité cohérente" C={C}/>
              <CheckRow ok={true} label="Code valide" C={C}/>
              <CheckRow ok={rdvDuJour} label="Rendez-vous du jour" C={C}/>
              <CheckRow ok={true} label="Institution correcte" C={C}/>
            </div>

            {/* Historique Yelen — contexte rapide, pas un CRM complet */}
            <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "16px 20px", marginBottom: "16px" }}>
              <div style={{ color: C.t3, fontSize: "11px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Historique Yelen</div>
              {booking.historique.total === 0 ? (
                <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6 }}>Premier rendez-vous de ce citoyen avec votre institution.</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <div><span style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>{booking.historique.total}</span> <span style={{ color: C.t3, fontSize: "11px" }}>rendez-vous</span></div>
                    <div><span style={{ color: C.green, fontSize: "13px", fontWeight: "800" }}>{booking.historique.honores}</span> <span style={{ color: C.t3, fontSize: "11px" }}>honoré{booking.historique.honores > 1 ? "s" : ""}</span></div>
                    {booking.historique.absents > 0 && (
                      <div><span style={{ color: C.red, fontSize: "13px", fontWeight: "800" }}>{booking.historique.absents}</span> <span style={{ color: C.t3, fontSize: "11px" }}>absent{booking.historique.absents > 1 ? "s" : ""}</span></div>
                    )}
                  </div>
                  {booking.historique.derniereVisite && (
                    <div style={{ color: C.t3, fontSize: "10.5px" }}>Dernière visite : {new Date(`${booking.historique.derniereVisite}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</div>
                  )}
                </>
              )}
            </div>

            {/* Zone 5 — Action */}
            {booking.statut === "en_attente" && !actionSuccess && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "18px", padding: "18px 20px" }}>
                <div style={{ color: C.t3, fontSize: "11px", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>Action</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {actionError && (
                    <div style={{ padding: "11px 14px", backgroundColor: C.redL, border: `1px solid ${C.red}30`, borderRadius: "12px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span style={{ color: C.red, fontSize: "12px", fontWeight: "600", lineHeight: 1.5 }}>{actionError}</span>
                    </div>
                  )}

                  <Button
                    tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth
                    onClick={() => handleAction("confirme")}
                    disabled={declarationRequiseMaisAbsente || estExpire}
                    loading={actionLoading}
                    loadingColor="#fff"
                    style={{
                      backgroundColor: declarationRequiseMaisAbsente || estExpire ? C.bg3 : C.green,
                      borderColor: declarationRequiseMaisAbsente || estExpire ? C.bg3 : C.green,
                      color: declarationRequiseMaisAbsente || estExpire ? C.t3 : "#fff",
                      fontSize: "14px", letterSpacing: "-0.3px",
                      boxShadow: declarationRequiseMaisAbsente || estExpire ? "none" : `0 8px 28px ${C.green}35`,
                    }}
                    icon={!declarationRequiseMaisAbsente && !estExpire ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : undefined}
                  >
                    {actionLoading ? "Traitement en cours…" : estExpire ? "Rendez-vous expiré" : declarationRequiseMaisAbsente ? "En attente de la déclaration du citoyen" : (booking.service_prix > 0 ? `Valider le paiement · ${formatPrix(booking.service_prix)}` : "Confirmer gratuitement")}
                  </Button>

                  {booking.service_prix > 0 && (
                    <div style={{ textAlign: "center", color: C.t3, fontSize: "11px", lineHeight: 1.5, padding: "0 8px" }}>
                      Cliquez sur <strong style={{ color: C.t1 }}>Valider</strong> uniquement après avoir encaissé le montant en espèces.
                    </div>
                  )}

                  {/* Actions secondaires (section 9 du brief) — volontairement
                      limitées à Absent/Annuler : "Voir le profil complet" et
                      "Signaler un problème" n'ont aucune route backend
                      existante à cet endroit (hors périmètre, à construire
                      séparément si besoin réel) ; "Historique des rendez-vous"
                      est déjà couvert par le bloc Historique Yelen ci-dessus. */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" disabled={actionLoading || estExpire}
                      icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>}
                      onClick={() => setShowAbsentModal(true)}>Marquer comme absent</Button>
                    <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" disabled={actionLoading || estExpire}
                      icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                      onClick={() => { setAnnulerReservationMotif(""); setAnnulerReservationError(null); setShowAnnulerReservationModal(true); }}>Annuler la réservation</Button>
                  </div>
                  {estExpire && (
                    <div style={{ textAlign: "center", color: C.t3, fontSize: "11px", lineHeight: 1.5, padding: "0 8px" }}>
                      La journée de ce rendez-vous est terminée — aucune action n&apos;est plus possible depuis cet écran.
                    </div>
                  )}
                </div>
              </div>
            )}

            {actionSuccess && (
              <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth style={{ boxShadow: `0 6px 20px ${C.gold}35` }}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>}
                onClick={resetCode}>Valider un autre paiement</Button>
            )}
            </div>
          </div>
        </div>
      )}

      <ValidationStyles C={C}/>
      <ValidationHeader C={C} helpSlot={<HelpCenterGuide tab="valider-rdv" />} aideOuverte={showAide} onToggleAide={() => setShowAide(v => !v)}/>

      {showAide && (
        <div style={{ marginBottom: "20px", padding: "16px 18px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px" }}>
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
            Comment valider un paiement
          </div>
          {[
            { num: "1", title: "Le citoyen se présente au guichet", desc: "Il ouvre son application Yelen224 et affiche son code à 6 chiffres." },
            { num: "2", title: "Saisissez le code ci-dessous", desc: "La recherche se lance automatiquement dès le 6e chiffre saisi." },
            { num: "3", title: "Vérifiez la fiche et encaissez", desc: "Confirmez le service, le montant, puis validez le paiement." },
          ].map((step, i, arr) => (
            <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "7px", background: C.bg3, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600, flexShrink: 0, marginTop: "1px" }}>
                {step.num}
              </div>
              <div>
                <div style={{ color: C.t1, fontSize: "13px", fontWeight: 600, marginBottom: "2px" }}>{step.title}</div>
                <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ValidationStats C={C} items={stats} loading={historyLoading && history.length === 0}/>

      <div className="vrx-grid">
        <CodeEntryCard C={C} digits={digits} inputRefs={inputRefs} searching={searching} searchError={searchError}
          focusedDigit={focusedDigit} onFocusDigit={setFocusedDigit} onBlurDigit={i => setFocusedDigit(prev => (prev === i ? null : prev))}
          onDigit={handleDigit} onKeyDown={handleKeyDown} onPaste={handlePaste} onReset={resetCode}
          showNouveauCode={(codeComplete || !!booking) && !searching}/>
        <DailyActivityCard C={C} rows={activiteRows} loading={historyLoading && history.length === 0} error={historyError} onRetry={loadHistory}/>
      </div>

      <ProcessedTodayTable C={C} rows={traiteesRows} totalEncaisse={formatPrix(todayCA)} payes={todayPaye}/>
    </div>
  );
}
