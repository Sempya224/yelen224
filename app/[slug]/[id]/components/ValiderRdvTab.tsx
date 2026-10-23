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
  ValidationStyles, ValidationHeader, ValidationStats, CodeEntryCard, DailyActivityCard, ProcessedTodayTable, BandeauSession, nomPropre,
  controlesValidation, raisonBlocage, interpreterErreur, lireEtat,
  type ValidationStat, type ActiviteRow, type TraiteeRow, type ErreurInterpretee, type EtatReservation,
} from "./ValiderRdvUi";
import { FicheValidation, PiedAction, useFocusTrap, montantEncaisse, type BookingFound } from "./ValiderRdvFiche";
import { DEVISE_LABEL } from "@/lib/devise";
import { calculerCheckInStatus, RDV_EXPIRE_MESSAGE } from "@/lib/rdvGating";
import { heureDepuisHorodatage, jourConakry } from "@/lib/heure";

// Statuts que l'écran sait afficher. Tout autre statut renvoyé par le serveur
// (ex. « rembourse », posé par l'écran Paiements) tombe sur un repli neutre.
type BookingStatut = "en_attente" | "confirme" | "termine" | "no_show" | "annule";

type HistoryEntry = {
  id: string;
  confirmation_code: string;
  statut: string;
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

function StatutIcon({ statut, color, size = 14 }: { statut: string; color: string; size?: number }) {
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

// Appel API qui ne lève jamais : une coupure réseau (fetch qui échoue) devient
// `reseau: true` au lieu d'une exception qui laisserait l'écran bloqué sur
// « Traitement en cours… ». `retryApres` = en-tête Retry-After du 429.
type ReponseApi = { ok: boolean; status: number; json: Record<string, unknown> | null; reseau: boolean; retryApres: number | null };
async function appelerApi(url: string, init?: RequestInit): Promise<ReponseApi> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const retry = Number(res.headers.get("Retry-After"));
    return { ok: res.ok, status: res.status, json, reseau: false, retryApres: Number.isFinite(retry) && retry > 0 ? retry : null };
  } catch {
    return { ok: false, status: 0, json: null, reseau: true, retryApres: null };
  }
}

// Historique du jour (lecture seule) ; null = indisponible (réseau ou erreur serveur).
async function lireHistorique(): Promise<HistoryEntry[] | null> {
  const r = await appelerApi(`${API_VALIDER}?history=1`);
  return r.ok && r.json && Array.isArray(r.json.history) ? (r.json.history as HistoryEntry[]) : null;
}

const API_VALIDER = "/api/institution/paid-bookings/valider";
type ActionApi = "confirme" | "no_show" | "annule" | "annuler_validation";
const STATUT_ATTENDU: Record<ActionApi, string> = { confirme: "confirme", no_show: "no_show", annule: "annule", annuler_validation: "en_attente" };
type SortieAction =
  | { kind: "ok"; json: Record<string, unknown>; etat: EtatReservation | null }
  | { kind: "erreur"; erreur: ErreurInterpretee }
  | { kind: "inconnu" };

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
  const panneau = useRef<HTMLDivElement>(null);
  // Échap : ferme tout de suite si rien n'est saisi ; sinon demande d'abord si
  // l'on abandonne le motif en cours de saisie.
  const [abandon, setAbandon] = useState(false);
  useFocusTrap(panneau, () => {
    if (loading) return;
    if (motif.trim().length > 0 && !abandon) setAbandon(true);
    else onClose();
  });
  const longueur = motif.trim().length;
  const bloque = loading || (requireMotif && longueur < 5);
  return (
    <div className="valider-annuler-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }} onClick={() => { if (motif.trim().length > 0) setAbandon(true); else onClose(); }}>
      <style>{`
        @media(min-width:1024px){
          .valider-annuler-overlay{align-items:center!important}
          .valider-annuler-panel{max-width:440px!important;border-radius:20px!important}
        }
      `}</style>
      <div ref={panneau} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="motif-titre" onClick={e => e.stopPropagation()} className="valider-annuler-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: "440px", border: `1px solid ${C.border2}`, borderBottom: "none", animation: "slideUp 0.3s ease", outline: "none" }}>
        <h2 id="motif-titre" style={{ color: C.t1, fontSize: "15px", fontWeight: 600, margin: "0 0 6px" }}>{titre}</h2>
        <p style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.6, margin: `0 0 ${requireMotif ? "14px" : "0"}` }}>{description}</p>
        {requireMotif && (
          <>
            <label htmlFor="motif-saisie" style={{ color: C.t2, fontSize: "12.5px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Motif (obligatoire)</label>
            <textarea id="motif-saisie" value={motif} onChange={e => { setMotif(e.target.value); setAbandon(false); }} rows={3} aria-describedby="motif-compteur" placeholder="Ex. mauvais citoyen sélectionné, montant erroné…" style={{ width: "100%", boxSizing: "border-box", backgroundColor: C.bg3, border: `1.5px solid ${C.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13px", color: C.t1, resize: "vertical", fontFamily: "inherit" }}/>
            <div id="motif-compteur" style={{ marginTop: "4px", color: longueur >= 5 ? C.t3 : C.t2, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
              {longueur >= 5 ? `${longueur} caractères` : `${longueur}/5 caractères minimum`}
            </div>
          </>
        )}
        {abandon && (
          <div role="alert" style={{ marginTop: "10px", padding: "10px 12px", backgroundColor: C.orangeL, border: `1px solid ${C.orange}40`, borderRadius: "8px", color: C.t1, fontSize: "13px", lineHeight: 1.5 }}>
            Abandonner la saisie du motif ?
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={() => setAbandon(false)}>Continuer à écrire</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="danger-ghost" size="sm" onClick={onClose}>Abandonner</Button>
            </div>
          </div>
        )}
        {error && <div role="alert" style={{ marginTop: "10px", color: C.red, fontSize: "12.5px", fontWeight: 600, lineHeight: 1.5 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px", marginTop: "16px" }}>
          <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" disabled={loading} onClick={() => { if (motif.trim().length > 0) setAbandon(true); else onClose(); }}>Fermer</Button>
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
  // Repli neutre pour tout statut que l'écran ne gère pas (ex. « rembourse ») :
  // jamais de plantage ni de couleur trompeuse.
  const cfgStatut = (s: string) => (s in statutConfig ? statutConfig[s as BookingStatut] : { label: "Statut inconnu", color: C.t2, bg: C.bg3 });
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchErrorTitre, setSearchErrorTitre] = useState("Code introuvable");
  // Limiteur de tentatives (429) : saisie du code suspendue le temps du délai.
  const [saisieSuspendue, setSaisieSuspendue] = useState<number | null>(null);
  // Horloge de l'écran : injectée dans les calculs de rendu (jamais Date.now()
  // pendant le rendu), rafraîchie toutes les 30 s tant qu'une fiche est ouverte.
  const [maintenant, setMaintenant] = useState(() => new Date());
  // Garde synchrone contre le double envoi (le state `actionLoading` n'est visible
  // qu'au rendu suivant) : un second clic pendant l'appel est ignoré.
  const actionEnCours = useRef(false);
  const [sessionExpiree, setSessionExpiree] = useState(false);
  const [verificationReseau, setVerificationReseau] = useState(false);
  const [resultatInconnu, setResultatInconnu] = useState(false);
  const [montantObsolete, setMontantObsolete] = useState(false);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  // Confirmation légère avant d'encaisser un service payant.
  const [confirmerEncaissement, setConfirmerEncaissement] = useState(false);
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
      setSearching(true); setSearchError(null); setBooking(null); setActionSuccess(null); setActionError(null); setActionErrorMeta(null);
      setResultatInconnu(false); setMontantObsolete(false); setAvertissements([]);
      const r = await appelerApi(`${API_VALIDER}?id=${preloadBookingId}`);
      setSearching(false);
      if (!r.ok || !r.json?.booking) {
        const err = interpreterErreur(r.status, r.json, r.retryApres);
        if (err.genre === "session") setSessionExpiree(true);
        setSearchErrorTitre(err.genre === "reseau" ? "Connexion impossible" : "Réservation introuvable");
        setSearchError(err.genre === "generique" && r.status === 404 ? "Réservation introuvable." : err.message);
        onPreloadConsumed?.();
        return;
      }
      const b = r.json.booking as BookingFound;
      setBooking(b);
      setMaintenant(new Date());
      ficheShownAt.current = Date.now();
      setDigits(b.confirmation_code.split(""));
      onPreloadConsumed?.();
    })();
  }, [preloadBookingId, onPreloadConsumed]);

  // Rechargement déclenché par l'agent (relance, après une action) : avec spinner.
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const h = await lireHistorique();
    setHistoryError(h === null);
    setHistory(h ?? []);
    setHistoryLoading(false);
  }, []);

  // Premier chargement : historyLoading vaut déjà true, l'état n'est écrit qu'après la réponse.
  useEffect(() => {
    let actif = true;
    (async () => {
      const h = await lireHistorique();
      if (!actif) return;
      setHistoryError(h === null);
      setHistory(h ?? []);
      setHistoryLoading(false);
    })();
    return () => { actif = false; };
  }, []);

  // Horloge : tant qu'une fiche est ouverte, l'état « en avance / ouvert / expiré »
  // se met à jour sans que l'agent ait à rouvrir la fiche.
  useEffect(() => {
    if (!booking) return;
    const t = setInterval(() => setMaintenant(new Date()), 30000);
    return () => clearInterval(t);
  }, [booking]);

  // Fin du délai du limiteur (429) : la saisie du code redevient possible.
  useEffect(() => {
    if (saisieSuspendue === null) return;
    const t = setTimeout(() => { setSaisieSuspendue(null); setSearchError(null); }, saisieSuspendue * 1000);
    return () => clearTimeout(t);
  }, [saisieSuspendue]);

  function handleDigit(index: number, value: string) {
    if (saisieSuspendue !== null) return;
    const v = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setSearchError(null);
    if (v && index < 5) inputRefs.current[index + 1]?.focus();
    lancerSiComplet(next);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) { e.preventDefault(); inputRefs.current[index - 1]?.focus(); }
    if (e.key === "ArrowRight" && index < 5) { e.preventDefault(); inputRefs.current[index + 1]?.focus(); }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (saisieSuspendue !== null) return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      setTimeout(() => inputRefs.current[5]?.focus(), 10);
      lancerSiComplet(pasted.split(""));
    }
  }

  function resetCode() {
    setDigits(["", "", "", "", "", ""]);
    setBooking(null);
    setSearchError(null);
    setActionError(null);
    setActionErrorMeta(null);
    setActionSuccess(null);
    setResultatInconnu(false);
    setMontantObsolete(false);
    setAvertissements([]);
    setConfirmerEncaissement(false);
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
    setResultatInconnu(false);
    setMontantObsolete(false);
    setAvertissements([]);

    const r = await appelerApi(`${API_VALIDER}?code=${code}`);
    setSearching(false);

    if (!r.ok || !r.json?.booking) {
      const err = interpreterErreur(r.status, r.json, r.retryApres);
      if (err.genre === "session") setSessionExpiree(true);
      if (err.genre === "tentatives") {
        setSearchErrorTitre("Trop de tentatives");
        setSaisieSuspendue(err.retrySecondes ?? 60);
      } else {
        setSearchErrorTitre(err.genre === "reseau" ? "Connexion impossible" : err.genre === "message_serveur" ? "Code en double" : err.genre === "session" ? "Session expirée" : "Code introuvable");
      }
      setSearchError(err.genre !== "generique" || typeof r.json?.error === "string"
        ? err.message
        : "Aucune réservation trouvée pour ce code dans votre institution. Vérifiez le code et réessayez.");
      return;
    }
    setBooking(r.json.booking as BookingFound);
    setMaintenant(new Date());
    ficheShownAt.current = Date.now();
  }, []);

  // Validation instantanée (section 4 du brief) — dès que le 6e chiffre est
  // saisi, recherche automatique, aucun bouton à cliquer. Le garde-fou
  // lastAutoSearched évite une boucle : un code déjà tenté (même en échec)
  // n'est pas relancé tant que l'agent n'a pas modifié au moins un chiffre.
  // Déclenchée par la saisie elle-même (chiffre, collage), jamais par un effet :
  // une fiche ouverte par « Prendre en charge » (recherche par identifiant) ne
  // relance donc pas de recherche par code, qui échouerait sur un code en double.
  function lancerSiComplet(chiffres: string[]) {
    const code = chiffres.join("");
    if (chiffres.every(d => d !== "") && code !== lastAutoSearched.current && !searching) {
      lastAutoSearched.current = code;
      handleSearch(code);
    }
  }

  // Relit la réservation (GET ?id=) : sert à resynchroniser la fiche après une
  // coupure réseau, un 409 sur le montant ou à la demande de l'agent.
  async function relireBooking(id: string): Promise<BookingFound | null> {
    const r = await appelerApi(`${API_VALIDER}?id=${id}`);
    return r.ok && r.json?.booking ? (r.json.booking as BookingFound) : null;
  }

  // Envoie une action (PATCH). Ne lève jamais et ne reste jamais « en cours » :
  //  - réponse du serveur : ok, ou erreur interprétée ;
  //  - coupure réseau : le résultat est INCONNU (l'écriture a pu aboutir). On relit
  //    la réservation et on compare à l'état attendu : appliquée -> ok ; inchangée
  //    -> erreur « non enregistrée, réessayez » ; autre statut -> déjà traitée ;
  //    relecture impossible -> inconnu (l'agent relit à la main).
  async function envoyerAction(corps: Record<string, unknown>, action: ActionApi, statutAvant: string, id: string): Promise<SortieAction> {
    const r = await appelerApi(API_VALIDER, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    if (r.ok) return { kind: "ok", json: r.json ?? {}, etat: lireEtat(r.json?.etat) };
    if (!r.reseau) return { kind: "erreur", erreur: interpreterErreur(r.status, r.json, r.retryApres) };

    setVerificationReseau(true);
    const relu = await relireBooking(id);
    setVerificationReseau(false);
    if (!relu) return { kind: "inconnu" };
    if (relu.statut === STATUT_ATTENDU[action] && relu.statut !== statutAvant) {
      return { kind: "ok", json: { recu_id: relu.recu_id }, etat: { statut: relu.statut, traite_le: relu.traite_le, montant_paye: null, montant_declare: relu.montant_declare, declare_le: relu.declare_le, rdv_id: null } };
    }
    if (relu.statut === statutAvant) {
      return { kind: "erreur", erreur: { genre: "reseau", message: "L'action n'a pas été enregistrée. Vérifiez votre connexion puis réessayez.", titre: null, etat: null, retrySecondes: null } };
    }
    return { kind: "erreur", erreur: { genre: "deja_traitee", message: "Cette réservation a déjà été traitée.", titre: null, etat: { statut: relu.statut, traite_le: relu.traite_le, montant_paye: null, montant_declare: relu.montant_declare, declare_le: relu.declare_le, rdv_id: null }, retrySecondes: null } };
  }

  // Resynchronise le statut affiché avec l'état réel renvoyé par le serveur.
  function synchroniserEtat(etat: EtatReservation | null) {
    if (!etat) return;
    setBooking(prev => (prev ? { ...prev, statut: etat.statut, traite_le: etat.traite_le } : null));
  }

  async function rafraichirFiche() {
    if (!booking) return;
    setActionError(null); setActionErrorMeta(null); setResultatInconnu(false); setMontantObsolete(false);
    const relu = await relireBooking(booking.id);
    if (!relu) { setActionError("Impossible de relire la réservation. Vérifiez votre connexion puis réessayez."); return; }
    setBooking(relu);
    setMaintenant(new Date());
  }

  async function handleAction(newStatut: Exclude<ActionApi, "annuler_validation">, motif?: string) {
    if (!booking || actionEnCours.current) return;
    actionEnCours.current = true;
    setActionLoading(true);
    setActionError(null);
    setActionErrorMeta(null);
    setResultatInconnu(false);
    setMontantObsolete(false);

    // Le nouvel écran envoie toujours « declare » : l'agent a sous les yeux le montant
    // déclaré par le citoyen (ou le prix actuel quand rien n'est déclaré).
    const corps = { id: booking.id, action: newStatut, ...(motif ? { motif } : {}), ...(newStatut === "confirme" ? { montant_vu: montantEncaisse(booking), montant_vu_base: "declare" } : {}) };
    const sortie = await envoyerAction(corps, newStatut, booking.statut, booking.id);
    actionEnCours.current = false;
    setActionLoading(false);

    if (sortie.kind === "inconnu") { setResultatInconnu(true); return; }
    if (sortie.kind === "erreur") {
      const e = sortie.erreur;
      synchroniserEtat(e.etat);
      if (e.genre === "session") setSessionExpiree(true);
      if (e.genre === "montant") setMontantObsolete(true);
      if (e.genre === "hors_creneau") { setActionErrorMeta({ titre: e.titre ?? "Le citoyen est en avance", message: e.message }); return; }
      if (e.genre !== "deja_traitee") setActionError(e.message);
      return;
    }

    if (ficheShownAt.current) {
      const duree = Date.now() - ficheShownAt.current;
      setSessionDurations(prev => [...prev, duree].slice(-50));
      ficheShownAt.current = null;
    }
    const alertes: string[] = [];
    if (sortie.json.ledger_ok === false) alertes.push("Le paiement est validé, mais son écriture au registre financier a échoué : signalez-le à un responsable.");
    if (sortie.json.recu_ok === false) alertes.push("Le paiement est validé, mais le reçu n'a pas pu être généré.");
    setAvertissements(alertes);
    setActionSuccess(newStatut);
    setBooking(prev => (prev ? {
      ...prev,
      statut: sortie.etat?.statut ?? newStatut, traite_le: sortie.etat?.traite_le ?? prev.traite_le,
      recu_id: typeof sortie.json.recu_id === "string" ? sortie.json.recu_id : prev.recu_id,
      rdv_lie: typeof sortie.json.rdv_lie === "boolean" ? sortie.json.rdv_lie : prev.rdv_lie,
    } : null));
    loadHistory();
  }

  async function handleAnnulerValidation() {
    if (!booking || actionEnCours.current) return;
    if (annulerMotif.trim().length < 5) { setAnnulerError("Un motif d'au moins 5 caractères est requis."); return; }
    actionEnCours.current = true;
    setAnnulerLoading(true);
    setAnnulerError(null);

    const sortie = await envoyerAction({ id: booking.id, action: "annuler_validation", motif: annulerMotif.trim() }, "annuler_validation", booking.statut, booking.id);
    actionEnCours.current = false;
    setAnnulerLoading(false);
    if (sortie.kind === "inconnu") { setAnnulerError("Résultat inconnu. Fermez cette fenêtre puis relisez la fiche pour vérifier l'état."); return; }
    if (sortie.kind === "erreur") {
      synchroniserEtat(sortie.erreur.etat);
      if (sortie.erreur.genre === "session") setSessionExpiree(true);
      setAnnulerError(sortie.erreur.message);
      return;
    }

    setShowAnnulerModal(false);
    setAnnulerMotif("");
    setBooking(prev => (prev ? { ...prev, statut: "en_attente", traite_le: null } : null));
    ficheShownAt.current = Date.now();
    loadHistory();
  }

  async function handleAnnulerReservation() {
    if (!booking || actionEnCours.current) return;
    if (annulerReservationMotif.trim().length < 5) { setAnnulerReservationError("Un motif d'au moins 5 caractères est requis."); return; }
    actionEnCours.current = true;
    setAnnulerReservationLoading(true);
    setAnnulerReservationError(null);

    const sortie = await envoyerAction({ id: booking.id, action: "annule", motif: annulerReservationMotif.trim() }, "annule", booking.statut, booking.id);
    actionEnCours.current = false;
    setAnnulerReservationLoading(false);
    if (sortie.kind === "inconnu") { setAnnulerReservationError("Résultat inconnu. Fermez cette fenêtre puis relisez la fiche pour vérifier l'état."); return; }
    if (sortie.kind === "erreur") {
      synchroniserEtat(sortie.erreur.etat);
      if (sortie.erreur.genre === "session") setSessionExpiree(true);
      setAnnulerReservationError(sortie.erreur.message);
      return;
    }

    setShowAnnulerReservationModal(false);
    setAnnulerReservationMotif("");
    if (ficheShownAt.current) {
      const duree = Date.now() - ficheShownAt.current;
      setSessionDurations(prev => [...prev, duree].slice(-50));
      ficheShownAt.current = null;
    }
    setActionSuccess("annule");
    setBooking(prev => (prev ? { ...prev, statut: sortie.etat?.statut ?? "annule" } : null));
    loadHistory();
  }

  // Plus de retour automatique après une action (décision Mission B) : l'agent
  // doit pouvoir lire le résultat, le reçu et les avertissements, puis choisit
  // lui-même « Valider un autre paiement » ou « Fermer ».

  const codeComplete = digits.every(d => d !== "");

  // Statut du créneau (même règle que app/api/institution/paid-bookings/valider/route.ts::PATCH).
  // Horloge injectée (`maintenant`, état) : aucun Date.now() pendant le rendu.
  const checkInStatus = booking ? calculerCheckInStatus(booking.date_rdv, booking.heure_rdv, maintenant) : "CHECK_IN_AVAILABLE";

  // Journée du rendez-vous entièrement passée — proactif, pas seulement
  // découvert après un clic refusé (même logique que estEnAvance ci-dessus,
  // miroir indicatif du CHECK_IN_EXPIRED serveur, voir
  // CheckInUnavailableDialog.tsx côté RDV gratuit).
  const estExpire = !!booking && booking.statut === "en_attente" && checkInStatus === "CHECK_IN_EXPIRED";

  // Vérifications réelles (jamais décoratives) et raison du blocage éventuel du
  // bouton : miroir indicatif des refus du serveur, qui reste seul juge.
  const controles = booking
    ? controlesValidation({
        statut: booking.statut, date_rdv: booking.date_rdv, heure_rdv: booking.heure_rdv, date_depart: booking.date_depart,
        service_prix: booking.service_prix, declare_le: booking.declare_le, montant_declare: booking.montant_declare, prix_courant: booking.prix_courant,
      }, maintenant)
    : [];
  const blocage = booking ? raisonBlocage(controles, booking.droits, booking.etablissement_suspendu) : null;

  // « Annuler la validation » : même jour (Conakry), droit réel renvoyé par le
  // serveur (mêmes tests que le PATCH) et établissement non suspendu.
  const peutAnnulerValidation = !!booking && booking.statut !== "en_attente" && !!booking.traite_le
    && jourConakry(booking.traite_le) === jourConakry(maintenant)
    && booking.droits.annuler_validation && !booking.etablissement_suspendu;

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
    const cfg = cfgStatut(h.statut);
    return {
      id: h.id, statut: h.statut, label: cfg.label, color: cfg.color, bg: cfg.bg,
      icon: <StatutIcon statut={h.statut} color={cfg.color} size={12}/>,
      heure: h.traite_le ? formatHeure(h.traite_le) : "—", nom: nomPropre(h.citoyen_nom || h.service_nom),
    };
  });
  const traiteesRows: TraiteeRow[] = history.map(h => {
    const cfg = cfgStatut(h.statut);
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
          description="Le citoyen sera notifié de l'annulation, avec votre motif. Aucun remboursement n'est effectué automatiquement : une réservation déjà payée doit d'abord passer par « Annuler la validation »."
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

      {/* Fiche de validation (Mission B) : présentation dans ValiderRdvFiche.tsx ;
          ce fichier fournit les alertes d'action (`alertes`) et la zone d'action
          (`pied`). Le bandeau « en avance / expiré / prêt » est calculé par la fiche. */}
      {booking && (
        <FicheValidation C={C} booking={booking} maintenant={maintenant} controles={controles} checkIn={checkInStatus}
          onClose={resetCode} occupe={actionLoading || verificationReseau}
          onEscape={() => { if (confirmerEncaissement) setConfirmerEncaissement(false); else if (!actionLoading && !verificationReseau) resetCode(); }}
          alertes={<>
            {sessionExpiree && <BandeauSession C={C}/>}
            {!booking.rdv_lie && (
              <div role="status" style={{ marginBottom: "14px", padding: "12px 14px", background: `${C.orange}10`, border: `1px solid ${C.orange}35`, borderRadius: "12px", color: C.t1, fontSize: "12px", lineHeight: 1.5 }}>
                RDV lié introuvable : la validation n&apos;a mis à jour que la réservation payante.
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

          </>}
          pied={
            <PiedAction C={C} booking={booking} blocage={blocage} expire={estExpire} occupe={actionLoading}
              verificationReseau={verificationReseau} resultatInconnu={resultatInconnu} montantObsolete={montantObsolete} sessionExpiree={sessionExpiree}
              actionError={actionError} actionSuccess={actionSuccess} avertissements={avertissements} peutAnnulerValidation={peutAnnulerValidation}
              confirmation={confirmerEncaissement} heureResultat={booking.traite_le ? formatHeure(booking.traite_le) : heureDepuisHorodatage(maintenant)}
              telechargementRecu={telechargementRecu}
              onDemanderConfirmation={() => setConfirmerEncaissement(true)} onRetourConfirmation={() => setConfirmerEncaissement(false)}
              onConfirmer={() => { setConfirmerEncaissement(false); return handleAction("confirme"); }}
              onAbsent={() => setShowAbsentModal(true)}
              onAnnulerReservation={() => { setAnnulerReservationMotif(""); setAnnulerReservationError(null); setShowAnnulerReservationModal(true); }}
              onAnnulerValidation={() => { setAnnulerError(null); setAnnulerMotif(""); setShowAnnulerModal(true); }}
              onRafraichir={rafraichirFiche} onAutre={resetCode} onFermer={resetCode} onRecu={telechargerRecuFiche}/>
          } />
      )}

      <ValidationStyles C={C}/>
      {sessionExpiree && !booking && <BandeauSession C={C}/>}
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
        <CodeEntryCard C={C} digits={digits} inputRefs={inputRefs} searching={searching} searchError={searchError} searchErrorTitre={searchErrorTitre} desactive={saisieSuspendue !== null}
          focusedDigit={focusedDigit} onFocusDigit={setFocusedDigit} onBlurDigit={i => setFocusedDigit(prev => (prev === i ? null : prev))}
          onDigit={handleDigit} onKeyDown={handleKeyDown} onPaste={handlePaste} onReset={resetCode}
          showNouveauCode={(codeComplete || !!booking) && !searching}/>
        <DailyActivityCard C={C} rows={activiteRows} loading={historyLoading && history.length === 0} error={historyError} onRetry={loadHistory}/>
      </div>

      <ProcessedTodayTable C={C} rows={traiteesRows} totalEncaisse={formatPrix(todayCA)} payes={todayPaye}/>
    </div>
  );
}
