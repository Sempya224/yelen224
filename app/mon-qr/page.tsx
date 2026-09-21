"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import Link from "next/link";
import Image from "next/image";
import { YelenLoader } from "@/components/YelenLoader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { CompteHeader } from "@/components/CompteEcranVide";
import { YelenIdQrModal } from "@/components/YelenIdQrModal";
import { DEVISE_LABEL } from "@/lib/devise";
import { QR_MINUTES_APRES_RDV, QR_MINUTES_REGENERATION_FINALE, RDV_QR_EXPIRE_DEFINITIF_MESSAGE } from "@/lib/rdvGating";

// Refonte 16/07/2026 (décision CEO, écran wizard RDV) : cet écran mélangeait
// déjà les RDV gratuits ET payants dans une seule liste "rdv" — un RDV payant
// crée toujours une ligne rdv en plus de sa ligne paid_bookings (voir
// app/rdv/[id]/page.tsx). Mais cliquer dessus appelait /api/qr/generate qui
// ÉCRASAIT le code Yelen à 6 chiffres déjà généré à la réservation par un
// token HMAC différent — sans rapport avec le code que le citoyen a déjà vu
// et que l'institution valide manuellement (ValiderRdvTab.tsx, recherche par
// confirmation_code, pas de scan). Les deux flux sont maintenant séparés :
// - Gratuit : comportement inchangé, génération à la demande + scan institution.
// - Payant : lecture directe de paid_bookings (code déjà fixé, permanent,
//   jamais régénéré), affiché immédiatement sans appel serveur.
// Onglets Gratuit/Payant (au lieu d'un empilement vertical des deux listes)
// pour ne pas mélanger les deux logiques aux yeux du citoyen. Écran 100%
// mobile — jamais de mise en page PC ici, tous les écrans citoyen le sont.
const BLUE = "#4F8EF7";

function formatPrix(p: number): string {
  return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL;
}

// Illustrations Yelen pour les états vides (même langage que
// ClockInShiftTab.tsx : une petite scène en ligne, un seul accent doré,
// jamais un fond noir ni une icône Feather isolée) + message humain, pas
// une phrase technique. Une par état, jamais une icône générique réutilisée
// partout.
function IllustrationCarnetVide() {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill="rgba(245,166,35,0.06)"/>
      <circle cx="48" cy="48" r="28" stroke="rgba(0,0,0,0.12)" strokeWidth="2" strokeDasharray="4 5"/>
      <rect x="30" y="38" width="36" height="26" rx="6" fill="#fff" stroke="#AEAEB2" strokeWidth="2"/>
      <path d="M30 46h36" stroke="#AEAEB2" strokeWidth="2"/>
      <rect x="36" y="52" width="10" height="5" rx="1.5" fill="rgba(0,0,0,0.1)"/>
    </svg>
  );
}
function IllustrationToutEstAJour() {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill="rgba(245,166,35,0.06)"/>
      <circle cx="48" cy="48" r="27" fill="#fff" stroke="#F5A623" strokeWidth="2.4"/>
      <path d="M37 48l7.5 7.5L60 40" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationCalendrierVide() {
  return (
    <svg width="88" height="88" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill="rgba(245,166,35,0.06)"/>
      <rect x="26" y="30" width="44" height="38" rx="6" fill="#fff" stroke="#AEAEB2" strokeWidth="2"/>
      <path d="M26 42h44" stroke="#AEAEB2" strokeWidth="2"/>
      <path d="M36 26v8M60 26v8" stroke="#AEAEB2" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="48" cy="55" r="8" fill="rgba(245,166,35,0.1)" stroke="#F5A623" strokeWidth="2"/>
      <path d="M48 51v4l2.5 2.5" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IllustrationHistoriqueVide() {
  return (
    <svg width="76" height="76" viewBox="0 0 96 96" fill="none">
      <circle cx="48" cy="48" r="44" fill="rgba(245,166,35,0.06)"/>
      <rect x="28" y="24" width="40" height="48" rx="7" fill="#fff" stroke="#AEAEB2" strokeWidth="2"/>
      <path d="M35 37h26M35 47h26M35 57h16" stroke="#AEAEB2" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="66" cy="66" r="13" fill="#fff" stroke="#F5A623" strokeWidth="2.4"/>
      <path d="M61 66l3.5 3.5L71 62" stroke="#F5A623" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

type RdvGratuit = { id: string; date_rdv: string; heure_rdv: string; statut: string; objet: string | null; institution_id: string; presence_status: string | null; qr_token: string | null };
type PaidBookingRow = {
  id: string; confirmation_code: string; statut: string; date_rdv: string; heure_rdv: string; institution_id: string;
  montant_declare_citoyen: number | null; declare_le: string | null;
  paid_services: { nom: string; prix: number; duree_minutes: number } | null;
  institutions: { name: string; logo: string | null } | null;
};
// Historique des scans (jointure d'affichage uniquement, aucune règle
// métier touchée) — un rdv "présence confirmée" ne dit pas si c'était un
// passage gratuit ou payant. On le déduit par la même clé de
// correspondance déjà utilisée plus bas (paidSlotKeys) : institution +
// date + heure. Requête non bornée dans le temps (contrairement à
// paidBookings, limité à dateMin) car un scan de l'historique peut être
// ancien — limit(30) reste une borne raisonnable pour cet écran.
type PaidBookingHistoRow = { institution_id: string; date_rdv: string; heure_rdv: string; statut: string; montant_paye: number | null; paid_services: { prix: number } | null };
// Historique des scans — un seul et même champ pour le scan gratuit
// (app/api/qr/validate/route.ts) ET la validation payante
// (app/api/institution/paid-bookings/valider/route.ts écrit aussi
// presence_status="present" sur le rdv jumeau) : `rdv.presence_status`
// est donc la source unique, pas besoin de fusionner deux tables.
type ScanRow = { id: string; objet: string | null; statut: string; date_rdv: string; heure_rdv: string; presence_confirmed_at: string; institution_id: string; institutions: { name: string; logo: string | null } | null };
type ScanHistorique = {
  id: string; objet: string | null; dateRdv: string; heureRdv: string; rdvStatut: string; presenceConfirmeeLe: string;
  institutionNom: string; institutionLogo: string | null;
  type: "gratuit" | "payant"; paiementStatut: string | null; paiementMontant: number | null;
};

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
}

function formatScanDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const memeJour = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (memeJour(d, now)) return `Aujourd'hui · ${heure}`;
  if (memeJour(d, yesterday)) return `Hier · ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · ${heure}`;
}

function formatDatetimeFull(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Format lisible du compte à rebours QR — le cycle borné (30 min après le
// RDV, puis 10 min de régénération finale, voir lib/rdvGating.ts) ne dépasse
// jamais l'heure en conditions normales ; les paliers jour/heure ne servent
// qu'à rester lisible sur les codes générés avant ce cycle (ancienne
// expiration 7 jours), plutôt que d'afficher un total de minutes à 4 chiffres.
function formatDuree(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const j = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (j > 0) return `${j}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export default function MonQRPage() {
  const router = useRouter();
  const [subTab, setSubTab] = useState<"gratuit" | "payant">("gratuit");
  const [rdvs, setRdvs] = useState<RdvGratuit[]>([]);
  const [paidBookings, setPaidBookings] = useState<PaidBookingRow[]>([]);
  const [selected, setSelected] = useState<RdvGratuit | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [codeSecours, setCodeSecours] = useState("");
  const [selectedPaid, setSelectedPaid] = useState<PaidBookingRow | null>(null);
  const [paidQrUrl, setPaidQrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  // Cycle borné (décision CEO 01/09/2026, voir lib/rdvGating.ts::calculerEtatQr)
  // — derniereChance signale que le QR affiché est l'unique régénération
  // finale (fenêtre 10 min au lieu de 30). expireInfo est posé quand le
  // serveur confirme l'état "expire_definitif" — jamais un "expiré" muet,
  // toujours titre + raison complète affichés à la place du QR.
  const [derniereChance, setDerniereChance] = useState(false);
  const [expireInfo, setExpireInfo] = useState<{ titre: string; message: string } | null>(null);
  const [yelenIdQrOpen, setYelenIdQrOpen] = useState(false);

  // Lot A (double confirmation paiement, décision CEO 05/08/2026) — "Je
  // remets le paiement à l'institution". Le montant n'est jamais saisi
  // librement : il est toujours celui du service réservé (svc.prix),
  // simplement affiché pour confirmation.
  const [declarerOpen, setDeclarerOpen] = useState(false);
  const [declarerChecked, setDeclarerChecked] = useState(false);
  const [declarerLoading, setDeclarerLoading] = useState(false);
  const [declarerError, setDeclarerError] = useState("");

  // recus n'a aucune policy RLS (service_role uniquement, comme
  // transactions_financieres) — passe par /api/citoyen/paiements plutôt
  // qu'une lecture directe supabase.from("recus"), qui échouerait toujours.
  const [recusMap, setRecusMap] = useState<Record<string, { id: string; receipt_id: string }>>({});
  const [telechargement, setTelechargement] = useState<string | null>(null);

  const [scans, setScans] = useState<ScanHistorique[]>([]);
  const [scansExpanded, setScansExpanded] = useState(false);
  const [detailScan, setDetailScan] = useState<ScanHistorique | null>(null);
  const [detailDragY, setDetailDragY] = useState(0);
  const [detailDragging, setDetailDragging] = useState(false);
  const dragRef = useRef({ startY: 0, dragging: false });

  async function chargerRecus() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/citoyen/paiements", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return;
    const map: Record<string, { id: string; receipt_id: string }> = {};
    for (const p of json.paiements) { if (p.recu) map[p.id] = p.recu; }
    setRecusMap(map);
  }

  async function telechargerRecu(bookingId: string) {
    const recu = recusMap[bookingId];
    if (!recu) return;
    // Fenêtre ouverte de façon synchrone dans la pile du clic — un window.open()
    // déclenché après un await est bloqué silencieusement par les bloqueurs de
    // popup (Safari iOS notamment) : rien ne se passe, aucune erreur visible.
    const fenetre = window.open("", "_blank");
    setTelechargement(bookingId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError("Session expirée, reconnectez-vous."); setTelechargement(null); fenetre?.close(); return; }
    const res = await fetch(`/api/citoyen/recus/${recu.id}/pdf`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => null);
    setTelechargement(null);
    if (!res.ok || !json?.signedUrl) { setError(json?.error || "Reçu indisponible"); fenetre?.close(); return; }
    if (fenetre) fenetre.location.href = json.signedUrl;
    else window.open(json.signedUrl, "_blank");
  }

  // Extrait en fonction nommée (au lieu d'un Promise.all inline dans
  // l'effet de montage) pour être réutilisable par le pull-to-refresh —
  // même convention que app/page.tsx : un paramètre `silencieux` explicite
  // pour ne jamais remettre tout l'écran en loading pendant un
  // rafraîchissement (voir CLAUDE.md /pieges-techniques-connus).
  async function chargerDonnees(options?: { silencieux?: boolean }) {
    let id: string | null = null;
    try { id = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!id) { router.push("/login"); return; }
    if (!options?.silencieux) setLoading(true);
    const dateMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [rdvRes, paidRes, scansRes, paidHistoRes] = await Promise.all([
      supabase.from("rdv").select("id,date_rdv,heure_rdv,statut,objet,institution_id,presence_status,qr_token")
        .eq("citoyen_id", id).neq("statut", "annule").gte("date_rdv", dateMin).order("date_rdv").limit(20),
      supabase.from("paid_bookings").select("id,confirmation_code,statut,date_rdv,heure_rdv,institution_id,montant_declare_citoyen,declare_le,paid_services(nom,prix,duree_minutes),institutions!paid_bookings_institution_id_fkey(name,logo)")
        .eq("citoyen_id", id).neq("statut", "annule").gte("date_rdv", dateMin).order("date_rdv").limit(20),
      supabase.from("rdv").select("id,objet,statut,presence_confirmed_at,institution_id,date_rdv,heure_rdv,institutions!rdv_institution_id_fkey(name,logo)")
        .eq("citoyen_id", id).eq("presence_status", "present").not("presence_confirmed_at", "is", null)
        .order("presence_confirmed_at", { ascending: false }).limit(20),
      // Jointure d'affichage pour l'historique (voir commentaire sur
      // PaidBookingHistoRow) — non bornée par dateMin, un scan passé peut
      // être ancien.
      supabase.from("paid_bookings").select("institution_id,date_rdv,heure_rdv,statut,montant_paye,paid_services(prix)")
        .eq("citoyen_id", id).limit(30),
    ]);

    if (rdvRes.data) setRdvs(rdvRes.data as unknown as RdvGratuit[]);
    if (paidRes.data) setPaidBookings(paidRes.data as unknown as PaidBookingRow[]);
    if (scansRes.data) {
      const paidHistoMap = new Map(
        ((paidHistoRes.data ?? []) as unknown as PaidBookingHistoRow[]).map(b => [
          `${b.institution_id}|${b.date_rdv}|${b.heure_rdv}`,
          { statut: b.statut, montant: b.montant_paye ?? b.paid_services?.prix ?? null },
        ])
      );
      setScans((scansRes.data as unknown as ScanRow[]).map(r => {
        const paidMatch = paidHistoMap.get(`${r.institution_id}|${r.date_rdv}|${r.heure_rdv}`);
        return {
          id: r.id, objet: r.objet, dateRdv: r.date_rdv, heureRdv: r.heure_rdv, rdvStatut: r.statut,
          presenceConfirmeeLe: r.presence_confirmed_at,
          institutionNom: r.institutions?.name ?? "Institution",
          institutionLogo: r.institutions?.logo ?? null,
          type: paidMatch ? "payant" : "gratuit",
          paiementStatut: paidMatch?.statut ?? null,
          paiementMontant: paidMatch?.montant ?? null,
        };
      }));
    }
    setLoading(false);
  }

  async function rafraichirEcran() {
    await Promise.all([chargerDonnees({ silencieux: true }), chargerRecus()]);
  }

  useEffect(() => {
    void chargerDonnees();
    void chargerRecus();
  }, []);

  // Barre de scroll native — même mécanique que app/page.tsx (pas un
  // composant partagé, logique locale à chaque écran) : un fin thumb sur
  // le bord droit, visible ~0.9s après chaque scroll puis masqué en fondu.
  const [scrollPct, setScrollPct] = useState(0);
  const [scrollThumbH, setScrollThumbH] = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Une réservation payante crée toujours une ligne `rdv` en plus de sa
  // ligne `paid_bookings` — on l'exclut de la liste "gratuits" pour ne pas
  // l'afficher en double, en la reconnaissant par créneau (institution +
  // date + heure).
  const paidSlotKeys = useMemo(() => new Set(paidBookings.map(b => `${b.institution_id}|${b.date_rdv}|${b.heure_rdv}`)), [paidBookings]);
  const rdvsGratuits = useMemo(() => rdvs.filter(r => !paidSlotKeys.has(`${r.institution_id}|${r.date_rdv}|${r.heure_rdv}`)), [rdvs, paidSlotKeys]);

  // Signalé par Bryan 05/08/2026 : cet écran sert à présenter le code, il
  // n'a plus rien à faire une fois le paiement confirmé (ou le service
  // terminé) — le code ne sera plus jamais redemandé. Ces réservations
  // disparaissent d'ici et basculent vers "Mes reçus" (/compte/paiements).
  const paidBookingsActifs = useMemo(() => paidBookings.filter(b => b.statut !== "confirme" && b.statut !== "termine"), [paidBookings]);
  const paiementsTermines = useMemo(() => paidBookings.filter(b => b.statut === "confirme" || b.statut === "termine"), [paidBookings]);

  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expiré"); setQrDataUrl(""); clearInterval(t);
        // Si c'était déjà l'unique régénération finale, inutile d'attendre un
        // aller-retour serveur pour le savoir — le même message que
        // "expire_definitif" s'affiche immédiatement (source unique du texte,
        // voir lib/rdvGating.ts).
        if (derniereChance) setExpireInfo({ titre: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.titre, message: RDV_QR_EXPIRE_DEFINITIF_MESSAGE.message });
        return;
      }
      setTimeLeft(formatDuree(diff));
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, derniereChance]);

  async function genererQR(rdv: RdvGratuit) {
    setGenerating(true); setError(""); setSelected(rdv); setQrDataUrl(""); setCodeSecours(""); setTimeLeft(""); setExpireInfo(null); setDerniereChance(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Session expirée, reconnectez-vous."); setGenerating(false); return; }
      const res = await fetch("/api/qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ rdv_id: rdv.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur génération QR"); setGenerating(false); return; }

      // Cycle borné — le serveur peut répondre "expire_definitif" (aucun QR à
      // afficher, la seule régénération finale a déjà expiré sans scan).
      if (data.etat === "expire_definitif") {
        setExpireInfo({ titre: data.titre, message: data.message });
        setGenerating(false);
        return;
      }

      const payload = data.qr_payload;
      setExpiresAt(data.expires_at);
      setDerniereChance(!!data.derniere_chance);
      setCodeSecours(typeof data.code_secours === "string" ? data.code_secours : "");
      // ecc=H (30% de correction d'erreur, vs M par défaut) — nécessaire pour
      // tolérer le logo Yelen superposé au centre (overlay CSS, voir plus
      // bas) sans casser la lecture du code.
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}&bgcolor=ffffff&color=080812&margin=10&ecc=H`;
      setQrDataUrl(qrUrl);
    } catch { setError("Erreur réseau"); }
    setGenerating(false);
  }

  // Ferme le sheet plein écran du RDV sélectionné, réinitialise tout l'état
  // transitoire — sinon rouvrir un autre RDV pouvait hériter du compte à
  // rebours/de l'erreur du précédent le temps que genererQR() réponde.
  function fermerSelection() {
    setSelected(null); setQrDataUrl(""); setCodeSecours(""); setTimeLeft(""); setExpiresAt("");
    setDerniereChance(false); setExpireInfo(null); setError("");
  }

  function afficherQrPayant(booking: PaidBookingRow) {
    setError("");
    setSelectedPaid(booking);
    setPaidQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(booking.confirmation_code)}&bgcolor=ffffff&color=080812&margin=10`);
  }

  async function declarerPaiement() {
    if (!selectedPaid || !declarerChecked) return;
    setDeclarerLoading(true); setDeclarerError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setDeclarerError("Session expirée, reconnectez-vous."); setDeclarerLoading(false); return; }

      const res = await fetch("/api/citoyen/paid-bookings/declarer-paiement", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ paid_booking_id: selectedPaid.id }),
      });
      const data = await res.json();
      if (!res.ok) { setDeclarerError(data.error || "Erreur lors de la déclaration"); setDeclarerLoading(false); return; }

      const patch = { montant_declare_citoyen: data.montant, declare_le: data.declare_le };
      setSelectedPaid((prev) => (prev ? { ...prev, ...patch } : prev));
      setPaidBookings(prev => prev.map(b => (b.id === selectedPaid.id ? { ...b, ...patch } : b)));
      setDeclarerOpen(false);
      setDeclarerChecked(false);
    } catch {
      setDeclarerError("Erreur réseau");
    }
    setDeclarerLoading(false);
  }

  function switchTab(t: "gratuit" | "payant") {
    setSubTab(t);
    setError("");
  }

  // Sheet de détail d'un scan — glissement vers le bas natif (pas de
  // librairie de gestes dans le projet) : on suit le doigt sans transition
  // pendant le drag (dragRef muté de façon synchrone, lu au rendu), puis on
  // ré-active la transition CSS pour le retour à zéro ou la fermeture.
  function fermerDetailScan() {
    setDetailScan(null);
    setDetailDragY(0);
  }
  function onDetailDragStart(e: React.TouchEvent) {
    dragRef.current = { startY: e.touches[0].clientY, dragging: true };
    setDetailDragging(true);
  }
  function onDetailDragMove(e: React.TouchEvent) {
    if (!dragRef.current.dragging) return;
    const delta = e.touches[0].clientY - dragRef.current.startY;
    if (delta > 0) setDetailDragY(delta);
  }
  function onDetailDragEnd() {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    setDetailDragging(false);
    if (detailDragY > 100) fermerDetailScan();
    else setDetailDragY(0);
  }

  function stColor(s: string) {
    if (s === "confirme") return { c: "#fff", bg: "#22c55e", l: "Confirmé" };
    if (s === "en_attente") return { c: "#080812", bg: "#F5A623", l: "En attente" };
    return { c: "#fff", bg: "#8E8E93", l: s };
  }

  function presColor(s: string) {
    if (s === "present") return { c: "#22c55e", l: " Présent" };
    if (s === "absent") return { c: "#ef4444", l: " Absent" };
    return { c: "#F5A623", l: " En attente" };
  }

  // Statut réel d'un paiement payant (statut_paid_booking) — pas d'état
  // "paiement en ligne requis" inventé : le seul mécanisme qui existe est
  // remise en espèces/mobile money sur place, déclarée par le citoyen puis
  // confirmée par l'institution (app/api/citoyen/paid-bookings/declarer-
  // paiement + app/api/institution/paid-bookings/valider). "termine" n'est
  // jamais réellement écrit sur paid_bookings (seul le rdv jumeau le
  // reçoit) mais reste géré ici par défense, comme partout ailleurs dans
  // ce fichier.
  function paiementInfo(statut: string, declareLe?: string | null) {
    if (statut === "confirme" || statut === "termine") return { c: "#fff", bg: "#22c55e", l: "Paiement confirmé" };
    if (statut === "rembourse") return { c: "#fff", bg: "#22c55e", l: "Remboursé" };
    if (statut === "no_show") return { c: "#fff", bg: "#ef4444", l: "Absence constatée" };
    if (statut === "annule") return { c: "#fff", bg: "#8E8E93", l: "Annulé" };
    if (statut === "en_attente" && declareLe) return { c: "#080812", bg: "#F5A623", l: "En attente de confirmation" };
    if (statut === "en_attente") return { c: "#080812", bg: "#F5A623", l: "Paiement à remettre" };
    return { c: "#fff", bg: "#8E8E93", l: statut };
  }

  return (
    <div style={{ minHeight: "100svh", backgroundColor: "#F2F2F7", fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif", paddingBottom: "40px" }}>
      {/* HEADER — CompteHeader partagé (retour Bryan 24/08/2026 : "reste
          cohérent" avec les écrans /compte/*), gère déjà correctement
          env(safe-area-inset-top) — corrige au passage le header trop collé
          au haut de l'écran du rendu bespoke précédent. Icône QR à droite
          ouvre la modale "Mon Yelen ID" déjà utilisée sur l'écran Carte
          Yelen (components/YelenIdQrModal.tsx), pas une nouvelle fonctionnalité. */}
      <CompteHeader
        titre="Mon QR code"
        rightAction={{
          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM17 17h3v3h-3z" /></svg>,
          label: "Mon Yelen ID",
          onClick: () => setYelenIdQrOpen(true),
        }}
      />

      {/* Barre de scroll — même thumb fixe que app/page.tsx, masqué en
          fondu ~0.9s après le dernier scroll. */}
      <div aria-hidden style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 76px)", bottom: "calc(env(safe-area-inset-bottom) + 20px)", right: "3px", width: "3px", zIndex: 90, pointerEvents: "none", opacity: scrollBarShown ? 1 : 0, transition: "opacity 0.4s ease" }}>
        <div style={{ position: "absolute", top: `${scrollPct * (1 - scrollThumbH) * 100}%`, height: `${scrollThumbH * 100}%`, width: "100%", borderRadius: "3px", background: "rgba(8,8,18,0.35)" }}/>
      </div>

      <PullToRefresh onRefresh={rafraichirEcran}>
      <div style={{ padding: "20px 16px", maxWidth: "480px", margin: "0 auto" }}>

        {/* ── Onglets Gratuit / Payant ── */}
        <div style={{ display: "flex", gap: "6px", backgroundColor: "#fff", borderRadius: "16px", padding: "5px", marginBottom: "16px", border: "1px solid rgba(0,0,0,0.06)" }}>
          <button onClick={() => switchTab("gratuit")} style={{ flex: 1, background: subTab === "gratuit" ? "#080812" : "transparent", border: "1.5px solid transparent", borderRadius: "12px", padding: "10px 8px", color: subTab === "gratuit" ? "#fff" : "#8E8E93", fontSize: "13px", fontWeight: subTab === "gratuit" ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            Gratuit
            {rdvsGratuits.length > 0 && <span style={{ backgroundColor: subTab === "gratuit" ? "#F5A623" : "rgba(0,0,0,0.08)", color: subTab === "gratuit" ? "#fff" : "#8E8E93", fontSize: "9px", fontWeight: 900, padding: "2px 6px", borderRadius: "20px" }}>{rdvsGratuits.length}</span>}
          </button>
          <button onClick={() => switchTab("payant")} style={{ flex: 1, background: subTab === "payant" ? BLUE : "transparent", border: "1.5px solid transparent", borderRadius: "12px", padding: "10px 8px", color: subTab === "payant" ? "#fff" : "#8E8E93", fontSize: "13px", fontWeight: subTab === "payant" ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            Payant
            {paidBookingsActifs.length > 0 && <span style={{ backgroundColor: subTab === "payant" ? "#fff" : "rgba(0,0,0,0.08)", color: subTab === "payant" ? BLUE : "#8E8E93", fontSize: "9px", fontWeight: 900, padding: "2px 6px", borderRadius: "20px" }}>{paidBookingsActifs.length}</span>}
          </button>
        </div>

        {loading && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "32px", display: "flex", justifyContent: "center" }}>
            <YelenLoader size={32} label="Chargement de vos rendez-vous…"/>
          </div>
        )}

        {/* ═══════════════ ONGLET PAYANT ═══════════════ */}
        {!loading && subTab === "payant" && (
          <>
            <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div style={{ fontSize: "12px", color: "#6C6C70", lineHeight: 1.5 }}>
                Ce code identifie votre réservation auprès de l&apos;établissement. Le montant à régler est indiqué sur chaque réservation ci-dessous et se paie sur place, jamais dans l&apos;application.
              </div>
            </div>

            {paidQrUrl && selectedPaid && (
              <div style={{ backgroundColor: "#fff", borderRadius: "24px", padding: "28px 24px", textAlign: "center", marginBottom: "16px", boxShadow: "0 8px 40px rgba(245,166,35,0.2)", border: "2px solid #F5A623" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "20px" }}>
                  <span style={{ background: BLUE, color: "#fff", fontSize: "10px", fontWeight: "800", padding: "3px 10px", borderRadius: "20px", textTransform: "uppercase" }}>Service payant</span>
                </div>
                <div style={{ display: "inline-block", padding: "16px", backgroundColor: "#fff", borderRadius: "16px", border: "3px solid #F5A623", marginBottom: "16px", boxShadow: "0 4px 20px rgba(245,166,35,0.2)" }}>
                  {/* IMG-EXCEPTION: reason=URL externe api.qrserver.com générée à la volée par confirmation_code — décision CEO 08/08/2026 de ne pas ajouter ce tiers non maîtrisé aux remotePatterns next/image (aucun gain de cache réel sur un code court-vécu) | reviewed=2026-08-08 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={paidQrUrl} alt="QR code" width="220" height="220" style={{ display: "block", borderRadius: "8px" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "4px", marginBottom: "16px" }}>
                  {selectedPaid.confirmation_code.split("").map((c: string, i: number) => (
                    <div key={i} style={{ width: "30px", height: "38px", borderRadius: "8px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", fontSize: "18px", fontWeight: "900", fontFamily: "monospace" }}>{c}</div>
                  ))}
                </div>
                <div style={{ backgroundColor: "#F2F2F7", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", textAlign: "left" }}>
                  <div style={{ color: "#6C6C70", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Votre réservation</div>
                  <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{selectedPaid.paid_services?.nom || "Service"}</div>
                  <div style={{ color: "#F5A623", fontSize: "13px", fontWeight: "800", marginTop: "2px" }}>{selectedPaid.paid_services ? formatPrix(selectedPaid.paid_services.prix) : ""} — sur place</div>
                  {(selectedPaid.paid_services?.duree_minutes ?? 0) > 0 && <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "2px" }}>Durée estimée : {selectedPaid.paid_services?.duree_minutes} minutes</div>}
                  <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "3px" }}>
                    {new Date(selectedPaid.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {selectedPaid.heure_rdv && ` à ${selectedPaid.heure_rdv}`}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    "Présentez ce code au personnel à votre arrivée",
                    "Le paiement s'effectue sur place, directement auprès de l'établissement",
                    "Ce code est permanent — pas besoin de le régénérer",
                  ].map((txt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", textAlign: "left" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "11px", fontWeight: "800", color: "#080812" }}>{i + 1}</div>
                      <span style={{ color: "#6C6C70", fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
                    </div>
                  ))}
                </div>

                {/* Lot A — double confirmation paiement (décision CEO
                    05/08/2026) : le citoyen déclare avoir remis l'argent
                    AVANT que l'institution ne confirme. Montant jamais
                    saisi librement, toujours celui du service réservé.
                    ⚠️ Le statut réel (confirmé par l'institution) doit
                    toujours primer sur declare_le, qui lui reste posé pour
                    toujours dès la déclaration — sinon l'écran reste
                    bloqué sur "en attente" même après confirmation
                    (signalé par Bryan 05/08/2026). */}
                {(selectedPaid.statut === "confirme" || selectedPaid.statut === "termine") ? (
                  <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "14px", backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: recusMap[selectedPaid.id] ? "10px" : 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ color: "#22c55e", fontSize: "12.5px", fontWeight: "800" }}>Paiement confirmé</span>
                    </div>
                    {recusMap[selectedPaid.id] && (
                      <button onClick={() => telechargerRecu(selectedPaid.id)} disabled={telechargement === selectedPaid.id} className="tap" style={{ width: "100%", backgroundColor: "#F5A623", border: "none", color: "#080812", fontWeight: "700", fontSize: "12.5px", padding: "10px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        {telechargement === selectedPaid.id ? <YelenLoader size={14} color="#080812"/> : "Télécharger mon reçu"}
                      </button>
                    )}
                  </div>
                ) : selectedPaid.declare_le ? (
                  <div style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "14px", backgroundColor: "#F5A623", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#080812", animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: "#080812", fontSize: "12.5px", fontWeight: "800" }}>En attente de confirmation par {selectedPaid.institutions?.name || "l&apos;établissement"}…</div>
                      <div style={{ color: "rgba(8,8,18,0.75)", fontSize: "11px", marginTop: "2px" }}>Vous avez déclaré remettre {formatPrix(selectedPaid.montant_declare_citoyen ?? 0)}. Montrez votre code à l&apos;agent.</div>
                    </div>
                  </div>
                ) : selectedPaid.statut === "en_attente" && (
                  <button onClick={() => { setDeclarerError(""); setDeclarerChecked(false); setDeclarerOpen(true); }} style={{ marginTop: "16px", width: "100%", background: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                    Je remets le paiement à {selectedPaid.institutions?.name || "l&apos;établissement"}
                  </button>
                )}
              </div>
            )}

            {/* CTA "Mes reçus" — visible dès qu'au moins un paiement est
                terminé, indépendamment de la présence de paiements actifs
                en dessous. */}
            {paiementsTermines.length > 0 && (
              <Link href="/compte/paiements" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", marginBottom: "12px", textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.5 0 2.91.37 4.15 1.02"/></svg>
                  </div>
                  <div>
                    <div style={{ color: "#080812", fontSize: "13.5px", fontWeight: "800" }}>Mes reçus</div>
                    <div style={{ color: "#6C6C70", fontSize: "11.5px", marginTop: "1px" }}>{paiementsTermines.length} paiement{paiementsTermines.length > 1 ? "s" : ""} confirmé{paiementsTermines.length > 1 ? "s" : ""}</div>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            )}

            {paidBookingsActifs.length === 0 ? (
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
                  {paiementsTermines.length > 0 ? <IllustrationToutEstAJour/> : <IllustrationCarnetVide/>}
                </div>
                <div style={{ color: "#080812", fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>{paiementsTermines.length > 0 ? "Vous êtes à jour !" : "Aucun rendez-vous payant à venir"}</div>
                <div style={{ color: "#6C6C70", fontSize: "13px", marginBottom: "20px", lineHeight: 1.5 }}>{paiementsTermines.length > 0 ? "Aucun paiement en attente. Retrouvez vos reçus juste au-dessus." : "Dès que vous réservez un service payant, votre code Yelen apparaît ici, prêt à être présenté."}</div>
                {paiementsTermines.length === 0 && (
                  <Link href="/recherche" style={{ display: "inline-block", backgroundColor: BLUE, color: "#fff", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>
                    Trouver une institution
                  </Link>
                )}
              </div>
            ) : (
              paidBookingsActifs.map(b => {
                const st = paiementInfo(b.statut, b.declare_le);
                const isSelected = selectedPaid?.id === b.id;
                const svc = b.paid_services;
                const inst = b.institutions;
                return (
                  <div key={b.id} onClick={() => afficherQrPayant(b)}
                    style={{ backgroundColor: "#fff", borderRadius: "18px", padding: "16px", marginBottom: "10px", cursor: "pointer", border: `2px solid ${isSelected ? BLUE : "transparent"}`, boxShadow: isSelected ? `0 4px 20px ${BLUE}30` : "none", transition: "all 0.2s ease" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ width: "40px", height: "40px", position: "relative", borderRadius: "12px", backgroundColor: BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "800", color: "#fff", overflow: "hidden", flexShrink: 0 }}>
                        {inst?.logo ? <Image src={inst.logo} alt={inst?.name ?? ""} fill sizes="40px" style={{ objectFit: "cover" }}/> : getInitials(inst?.name ?? "?")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#080812", fontSize: "14px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst?.name ?? "Institution"}</div>
                        <div style={{ color: "#6C6C70", fontSize: "12.5px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{svc?.nom || "Service payant"}</div>
                        <div style={{ color: "#8E8E93", fontSize: "11.5px", marginTop: "3px" }}>
                          {new Date(b.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                          {b.heure_rdv && ` à ${b.heure_rdv}`}
                          {(svc?.duree_minutes ?? 0) > 0 && ` · ${svc?.duree_minutes} min`}
                        </div>
                      </div>
                      {svc?.prix != null && (
                        <div style={{ color: BLUE, fontSize: "14px", fontWeight: "900", flexShrink: 0, whiteSpace: "nowrap" }}>{formatPrix(svc.prix)}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ backgroundColor: st.bg, color: st.c, fontSize: "10.5px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px" }}>{st.l}</span>
                      {!isSelected && (
                        <span style={{ color: BLUE, fontSize: "12.5px", fontWeight: "800", display: "flex", alignItems: "center", gap: "3px" }}>
                          Afficher mon code
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ═══════════════ ONGLET GRATUIT ═══════════════ */}
        {!loading && subTab === "gratuit" && (
          <>
            <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div style={{ fontSize: "12px", color: "#6C6C70", lineHeight: 1.5 }}>
                Sélectionnez un RDV ci-dessous pour générer votre QR code unique. Présentez-le à l&apos;accueil pour confirmer votre présence.
              </div>
            </div>

            {rdvsGratuits.length === 0 ? (
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "40px 20px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}><IllustrationCalendrierVide/></div>
                <div style={{ color: "#080812", fontSize: "17px", fontWeight: "700", marginBottom: "8px" }}>Aucun rendez-vous gratuit à venir</div>
                <div style={{ color: "#6C6C70", fontSize: "13px", marginBottom: "20px", lineHeight: 1.5 }}>Dès que vous prenez rendez-vous, votre QR code apparaît ici pour confirmer votre présence.</div>
                <Link href="/recherche" style={{ display: "inline-block", backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", fontSize: "14px", padding: "12px 24px", borderRadius: "12px", textDecoration: "none" }}>
                  Trouver une institution
                </Link>
              </div>
            ) : (
              rdvsGratuits.map(rdv => {
                const st = stColor(rdv.statut);
                const pr = presColor(rdv.presence_status || "en_attente");
                const isSelected = selected?.id === rdv.id;
                return (
                  <div key={rdv.id} onClick={() => genererQR(rdv)}
                    style={{ backgroundColor: "#fff", borderRadius: "18px", padding: "16px", marginBottom: "10px", cursor: "pointer", border: `2px solid ${isSelected ? "#F5A623" : "transparent"}`, boxShadow: isSelected ? "0 4px 20px rgba(245,166,35,0.2)" : "none", transition: "all 0.2s ease" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{rdv.objet || "Rendez-vous"}</div>
                          <div style={{ color: "#6C6C70", fontSize: "12px" }}>
                            {new Date(rdv.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                            {rdv.heure_rdv && ` à ${rdv.heure_rdv}`}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                          <span style={{ backgroundColor: st.bg, color: st.c, fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" }}>{st.l}</span>
                          <span style={{ color: pr.c, fontSize: "10px", fontWeight: "700" }}>{pr.l}</span>
                        </div>
                        {/* Chevron — même signal de tappabilité que les lignes
                            de l'Historique des scans juste en dessous. */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    </div>
                    {!isSelected && (
                      <div style={{ backgroundColor: "#F5A623", color: "#080812", fontSize: "12px", fontWeight: "800", padding: "8px 14px", borderRadius: "10px", display: "inline-block" }}>
                        {rdv.qr_token ? "Afficher mon QR code" : "Générer mon QR code"}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ═══════════════ HISTORIQUE DES SCANS ═══════════════
            24/08/2026 — passages déjà confirmés, source unique
            `rdv.presence_status="present"` (posé aussi bien par le scan QR
            gratuit que par la validation payante, voir commentaire sur
            ScanRow plus haut). Reste dans ce même sheet, pas un nouvel
            écran — "Voir tout" ne fait qu'étendre la liste déjà chargée. */}
        {!loading && (
          <div style={{ marginTop: "32px", marginBottom: "16px" }}>
            <div style={{ color: "#080812", fontSize: "15px", fontWeight: "800", padding: "0 4px", marginBottom: "12px" }}>
              Historique des scans
            </div>

            {scans.length === 0 ? (
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "32px 20px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IllustrationHistoriqueVide/></div>
                <div style={{ color: "#080812", fontSize: "15px", fontWeight: "700", marginBottom: "6px" }}>Aucun passage enregistré</div>
                <div style={{ color: "#6C6C70", fontSize: "12.5px", lineHeight: 1.5 }}>Vos rendez-vous validés par QR code apparaîtront ici.</div>
              </div>
            ) : (
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "4px 16px" }}>
                {(scansExpanded ? scans : scans.slice(0, 3)).map((s, i, arr) => (
                  <div key={s.id} onClick={() => setDetailScan(s)} className="tap" role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setDetailScan(s); }} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none", cursor: "pointer" }}>
                    <div style={{ width: "40px", height: "40px", position: "relative", borderRadius: "12px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "800", color: "#080812", overflow: "hidden", flexShrink: 0 }}>
                      {s.institutionLogo ? <Image src={s.institutionLogo} alt={s.institutionNom} fill sizes="40px" style={{ objectFit: "cover" }}/> : getInitials(s.institutionNom)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#080812", fontSize: "13.5px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.institutionNom}</div>
                      <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.objet || "Rendez-vous"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "5px" }}>
                        <span style={{ backgroundColor: s.type === "payant" ? BLUE : "#F5A623", color: s.type === "payant" ? "#fff" : "#080812", fontSize: "9.5px", fontWeight: "800", padding: "2px 7px", borderRadius: "20px" }}>{s.type === "payant" ? "Payant" : "Gratuit"}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: "#080812", fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>{formatScanDateTime(s.presenceConfirmeeLe)}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: "5px" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ color: "#22c55e", fontSize: "10.5px", fontWeight: "700", whiteSpace: "nowrap" }}>Présence confirmée</span>
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                ))}

                {scans.length > 3 && (
                  <button onClick={() => setScansExpanded(v => !v)} className="tap" style={{ width: "100%", background: "transparent", border: "none", borderTop: "1px solid rgba(0,0,0,0.06)", color: "#F5A623", fontSize: "12.5px", fontWeight: "700", padding: "12px 0 8px", cursor: "pointer", textAlign: "center" }}>
                    {scansExpanded ? "Voir moins" : `Voir tout l'historique (${scans.length}) →`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ERREUR */}
        {error && (
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "16px", marginBottom: "16px", border: "2px solid #ef4444", textAlign: "center" }}>
            <div style={{ color: "#ef4444", fontWeight: "700", marginBottom: "8px" }}>{error}</div>
            <button onClick={() => setError("")} style={{ backgroundColor: "#F5A623", color: "#080812", fontWeight: "700", padding: "10px 20px", borderRadius: "10px", border: "none", cursor: "pointer" }}>Réessayer</button>
          </div>
        )}

        {/* SÉCURITÉ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px", backgroundColor: "rgba(34,197,94,0.06)", borderRadius: "12px", border: "1px solid rgba(34,197,94,0.15)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span style={{ color: "#22c55e", fontSize: "11px", fontWeight: "700" }}>QR code chiffré · Expire automatiquement · Unique par RDV</span>
        </div>
      </div>
      </PullToRefresh>

      {/* Sheet plein écran (01/09/2026, retour Bryan) — couvre tout l'écran
          sous le header ("Mon QR Code" reste accessible, avec son bouton
          retour). Avant, le contenu du RDV sélectionné (QR actif / expiré /
          définitivement expiré) s'affichait en ligne au-dessus de la liste
          ET de l'Historique des scans, mélangeant "un RDV en attente" et
          "l'historique" dans le même défilement. Désormais la liste et
          l'historique restent une page propre, cliquer sur un RDV ouvre ce
          contenu en pop — plus de dispersion. */}
      {selected && (
        <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 76px)", left: 0, right: 0, bottom: 0, zIndex: 950, backgroundColor: "#F2F2F7", overflowY: "auto", animation: "sheetUp 0.28s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 6px", maxWidth: "480px", margin: "0 auto" }}>
            <div style={{ color: "#080812", fontSize: "15px", fontWeight: "900" }}>Votre QR code</div>
            <button onClick={fermerSelection} aria-label="Fermer" className="tap" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6C6C70" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ padding: "10px 16px 40px", maxWidth: "480px", margin: "0 auto" }}>
            {generating && (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "40px", textAlign: "center" }}>
                <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", animation: "spin 1s linear infinite" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                </div>
                <div style={{ color: "#080812", fontSize: "16px", fontWeight: "700" }}>Génération sécurisée...</div>
                <div style={{ color: "#6C6C70", fontSize: "13px", marginTop: "6px" }}>Création de votre QR code unique</div>
              </div>
            )}

            {qrDataUrl && !generating && selected && (
              <div style={{ backgroundColor: "#fff", borderRadius: "24px", padding: "28px 24px", textAlign: "center", boxShadow: "0 8px 40px rgba(245,166,35,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "20px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#22c55e", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: "700" }}>QR code actif</span>
                  {timeLeft && <span style={{ color: "#6C6C70", fontSize: "12px" }}> · Expire dans {timeLeft}</span>}
                </div>

                <div style={{ position: "relative", display: "inline-block", padding: "16px", backgroundColor: "#fff", borderRadius: "16px", border: "3px solid #F5A623", marginBottom: "20px", boxShadow: "0 4px 20px rgba(245,166,35,0.2)" }}>
                  {/* IMG-EXCEPTION: reason=data URL base64 générée localement (QRCode), non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" width="240" height="240" style={{ display: "block", borderRadius: "8px" }} />
                  {/* Logo Yelen au centre — vraie icône PWA (public/icon-512.png,
                      mêmes couleurs de marque que le badge du QR Yelen ID en
                      compte citoyen, lib/qrBrand.ts), plus l'approximation SVG
                      contourée. ecc=H (30% de correction) posé sur l'URL de
                      génération le rend tolérable sans casser la lecture du code. */}
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "54px", height: "54px", borderRadius: "14px", backgroundColor: "#fff", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
                    <Image src="/icon-512.png" alt="" width={46} height={46} style={{ borderRadius: "10px" }} />
                  </div>
                </div>

                {/* Code de secours (chantier YELEN Accueil, 13/09/2026) —
                    même code que celui saisissable par l'agent via "Saisir le
                    code YELEN" (CheckInApp.tsx), même expiration que le QR
                    ci-dessus. Absent de cet écran jusqu'ici (trou trouvé
                    14/09/2026) : le code existait déjà en base et côté agent,
                    mais /api/qr/generate ne le renvoyait jamais au citoyen —
                    aucun moyen de le lire à voix haute si le scan échouait. */}
                {codeSecours && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ color: "#6C6C70", fontSize: "11px", fontWeight: "700", marginBottom: "8px" }}>Le scan ne fonctionne pas ? Donnez ce code à l&apos;accueil</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: "4px", flexWrap: "wrap" }}>
                      {codeSecours.split("").map((c, i) => (
                        <div key={i} style={{ width: "26px", height: "34px", borderRadius: "7px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", fontSize: "15px", fontWeight: "900", fontFamily: "monospace" }}>{c}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ backgroundColor: "#F2F2F7", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", textAlign: "left" }}>
                  <div style={{ color: "#6C6C70", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Votre rendez-vous</div>
                  <div style={{ color: "#080812", fontSize: "14px", fontWeight: "700" }}>{selected?.objet || "Rendez-vous général"}</div>
                  <div style={{ color: "#6C6C70", fontSize: "12px", marginTop: "3px" }}>
                    {selected && new Date(selected.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {selected?.heure_rdv && ` à ${selected.heure_rdv}`}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    "Présentez ce QR code à l'accueil de l'institution",
                    "Le personnel va scanner votre code pour confirmer votre présence",
                    "Si le scan échoue, communiquez le code ci-dessus à l'agent",
                    "Ne partagez pas ce code — il est personnel et unique",
                  ].map((txt, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", textAlign: "left" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "11px", fontWeight: "800", color: "#080812" }}>{i + 1}</div>
                      <span style={{ color: "#6C6C70", fontSize: "12px", lineHeight: 1.4 }}>{txt}</span>
                    </div>
                  ))}
                </div>

                {derniereChance && (
                  <div style={{ marginTop: "16px", padding: "10px 14px", borderRadius: "10px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444", fontSize: "11.5px", fontWeight: "700", textAlign: "left" }}>
                    Dernière chance — ce code est l&apos;unique régénération possible. S&apos;il n&apos;est pas scanné dans ce délai, ce rendez-vous ne sera plus valide.
                  </div>
                )}
              </div>
            )}

            {/* Délai initial dépassé sans scan (30 min après l'heure du RDV) —
                une seule régénération finale reste possible, 10 min. Jamais un
                QR ré-affiché automatiquement : le citoyen doit explicitement
                redemander le dernier code. */}
            {!qrDataUrl && !generating && !expireInfo && timeLeft === "Expiré" && !derniereChance && (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "28px 24px", textAlign: "center", border: "2px solid #F5A623" }}>
                <div style={{ color: "#080812", fontSize: "15px", fontWeight: "800", marginBottom: "8px" }}>QR expiré — dernière régénération possible</div>
                <div style={{ color: "#6C6C70", fontSize: "12.5px", lineHeight: 1.5, marginBottom: "18px" }}>
                  Le délai de {QR_MINUTES_APRES_RDV} minutes après l&apos;heure du rendez-vous est passé sans scan. Une seule régénération finale reste possible, valable {QR_MINUTES_REGENERATION_FINALE} minutes.
                </div>
                <button onClick={() => genererQR(selected)} style={{ width: "100%", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer" }}>
                  Générer mon dernier QR code
                </button>
              </div>
            )}

            {/* Définitivement expiré (délai final aussi dépassé, ou confirmé
                par le serveur) — jamais un simple "expiré" silencieux, la
                raison complète reste affichée tant que ce RDV est sélectionné. */}
            {expireInfo && (
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "28px 24px", textAlign: "center", border: "2px solid #ef4444" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <div style={{ color: "#ef4444", fontSize: "15px", fontWeight: "800", marginBottom: "8px" }}>{expireInfo.titre}</div>
                <div style={{ color: "#6C6C70", fontSize: "12.5px", lineHeight: 1.6, whiteSpace: "pre-line" }}>{expireInfo.message}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom-sheet — détail d'une entrée de l'Historique des scans
          (24/08/2026). Glissement vers le bas natif géré à la main
          (dragRef, pas de librairie de gestes dans le projet) : pas de
          transition pendant le drag pour suivre le doigt en temps réel,
          transition ré-activée pour le retour à zéro ou la fermeture. */}
      {detailScan && (
        <div onClick={fermerDetailScan} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: "480px", maxHeight: "88vh", overflowY: "auto", animation: "slideUp 0.3s ease", transform: `translateY(${detailDragY}px)`, transition: detailDragging ? "none" : "transform 0.25s ease", paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
          >
            <div onTouchStart={onDetailDragStart} onTouchMove={onDetailDragMove} onTouchEnd={onDetailDragEnd} onTouchCancel={onDetailDragEnd} style={{ padding: "10px 20px 4px", touchAction: "none" }}>
              <div style={{ width: "40px", height: "4px", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: "4px", margin: "0 auto 14px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: "#080812", fontSize: "15px", fontWeight: "900" }}>Détail du passage</div>
                <button onClick={fermerDetailScan} aria-label="Fermer" className="tap" style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: "#F2F2F7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6C6C70" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div style={{ padding: "12px 20px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                <div style={{ width: "52px", height: "52px", position: "relative", borderRadius: "16px", background: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "800", color: "#080812", overflow: "hidden", flexShrink: 0 }}>
                  {detailScan.institutionLogo ? <Image src={detailScan.institutionLogo} alt={detailScan.institutionNom} fill sizes="52px" style={{ objectFit: "cover" }}/> : getInitials(detailScan.institutionNom)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#080812", fontSize: "16px", fontWeight: "800" }}>{detailScan.institutionNom}</div>
                  <div style={{ color: "#6C6C70", fontSize: "12.5px", marginTop: "2px" }}>{detailScan.objet || "Rendez-vous"}</div>
                </div>
              </div>

              <div style={{ backgroundColor: "#F8F8FA", borderRadius: "14px", padding: "4px 16px" }}>
                {(() => {
                  const rdvSt = stColor(detailScan.rdvStatut);
                  const rows: { label: string; value: React.ReactNode }[] = [
                    { label: "Type", value: <span style={{ backgroundColor: detailScan.type === "payant" ? BLUE : "#F5A623", color: detailScan.type === "payant" ? "#fff" : "#080812", fontSize: "11px", fontWeight: "800", padding: "3px 9px", borderRadius: "20px" }}>{detailScan.type === "payant" ? "Payant" : "Gratuit"}</span> },
                    { label: "Rendez-vous", value: formatDatetimeFull(`${detailScan.dateRdv}T${detailScan.heureRdv || "00:00"}`) },
                    { label: "Statut de la réservation", value: <span style={{ backgroundColor: rdvSt.bg, color: rdvSt.c, fontSize: "11px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>{rdvSt.l}</span> },
                  ];
                  if (detailScan.type === "payant") {
                    const pInfo = paiementInfo(detailScan.paiementStatut ?? "");
                    rows.push(
                      { label: "Montant", value: detailScan.paiementMontant != null ? formatPrix(detailScan.paiementMontant) : "—" },
                      { label: "Statut du paiement", value: <span style={{ backgroundColor: pInfo.bg, color: pInfo.c, fontSize: "11px", fontWeight: "700", padding: "3px 9px", borderRadius: "20px" }}>{pInfo.l}</span> },
                    );
                  }
                  rows.push(
                    { label: "Scan confirmé le", value: formatDatetimeFull(detailScan.presenceConfirmeeLe) },
                    { label: "Présence", value: <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22c55e", fontSize: "12px", fontWeight: "700" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Confirmée</span> },
                  );
                  return rows.map((row, i) => (
                    <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 0", borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                      <span style={{ color: "#6C6C70", fontSize: "12.5px", fontWeight: "600" }}>{row.label}</span>
                      <span style={{ color: "#080812", fontSize: "12.5px", fontWeight: "700", textAlign: "right" }}>{row.value}</span>
                    </div>
                  ));
                })()}
              </div>

              {detailScan.type === "payant" && (
                <Link href="/compte/paiements" onClick={fermerDetailScan} className="tap" style={{ marginTop: "14px", width: "100%", backgroundColor: "#F5A623", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", textDecoration: "none" }}>
                  Télécharger mon reçu
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom-sheet — "Je remets le paiement à l'institution" (Lot A).
          Montant en lecture seule (jamais saisi librement), case de
          confirmation obligatoire. */}
      {declarerOpen && selectedPaid && (
        <div onClick={() => !declarerLoading && setDeclarerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: "24px 24px 0 0", padding: "22px 20px 32px", width: "100%", maxWidth: "480px", animation: "slideUp 0.3s ease" }}>
            <div style={{ width: "40px", height: "4px", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: "4px", margin: "0 auto 18px" }} />
            <Image src="/illustrations/remise-paiement-agent.png" alt="Remise du paiement à l'agent de l'établissement" width={1536} height={1024} style={{ width: "180px", maxWidth: "100%", height: "auto", margin: "0 auto 16px", display: "block" }}/>
            <div style={{ color: "#080812", fontSize: "16px", fontWeight: "900", marginBottom: "4px" }}>Je remets le paiement</div>
            <div style={{ color: "#6C6C70", fontSize: "12.5px", marginBottom: "18px", lineHeight: 1.5 }}>Confirmez que vous remettez ce montant à l&apos;agent de {selectedPaid.institutions?.name || "l&apos;établissement"}. {selectedPaid.institutions?.name || "L&apos;établissement"} devra confirmer le même montant pour que le paiement soit validé.</div>

            <div style={{ backgroundColor: "#F2F2F7", borderRadius: "14px", padding: "16px", textAlign: "center", marginBottom: "16px" }}>
              <div style={{ color: "#6C6C70", fontSize: "10.5px", fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Montant remis</div>
              <div style={{ color: "#080812", fontSize: "26px", fontWeight: "900" }}>{selectedPaid.paid_services ? formatPrix(selectedPaid.paid_services.prix) : ""}</div>
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 4px", cursor: "pointer", marginBottom: "16px" }}>
              <input type="checkbox" checked={declarerChecked} onChange={e => setDeclarerChecked(e.target.checked)} style={{ width: "18px", height: "18px", marginTop: "1px", accentColor: "#F5A623", flexShrink: 0 }} />
              <span style={{ color: "#080812", fontSize: "12.5px", fontWeight: "600", lineHeight: 1.5 }}>Je confirme remettre ce montant à l&apos;agent de {selectedPaid.institutions?.name || "l&apos;établissement"}.</span>
            </label>

            {declarerError && (
              <div style={{ padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", color: "#ef4444", fontSize: "12px", fontWeight: "600", marginBottom: "14px" }}>{declarerError}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "10px" }}>
              <button onClick={() => setDeclarerOpen(false)} disabled={declarerLoading} className="tap" style={{ padding: "14px", borderRadius: "14px", border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "#F2F2F7", color: "#080812", fontSize: "13px", fontWeight: "700", cursor: declarerLoading ? "not-allowed" : "pointer" }}>Annuler</button>
              <button onClick={declarerPaiement} disabled={!declarerChecked || declarerLoading} className="tap" style={{ padding: "14px", borderRadius: "14px", border: "none", background: !declarerChecked || declarerLoading ? "#D1D1D6" : "#F5A623", color: "#080812", fontSize: "13px", fontWeight: "800", cursor: !declarerChecked || declarerLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                {declarerLoading ? <YelenLoader size={15} color="#080812"/> : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {yelenIdQrOpen && <YelenIdQrModal onClose={() => setYelenIdQrOpen(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.85)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sheetUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .tap { transition: transform 0.1s, opacity 0.1s; touch-action: manipulation; }
        .tap:active { opacity: 0.65; transform: scale(0.97); }
      `}</style>
    </div>
  );
}
