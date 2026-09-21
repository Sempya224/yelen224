"use client";

// Messagerie citoyen — 2 onglets (décision Bryan, chantier "Messagerie"
// 19/07/2026) : "Yelen" et "Établissements" (une conversation par RDV,
// lib/messagerie.ts::getConversationsEtablissements/getThreadRdv, se ferme
// définitivement quand le rdv passe à un statut terminal).
//
// Onglet "Yelen" refondu en ticketing (chantier "Support Yelen",
// 04/09/2026, décision CEO — agents humains uniquement, zéro LLM) :
// remplace l'ancienne conversation permanente unique (messages_yelen_citoyen,
// jamais fermée) par une file de demandes (support_tickets, statut contrôlé
// serveur, voir lib/supportTickets.ts). Retour Bryan 04/09/2026 : le
// support doit vivre ICI (accès rapide, déjà connu) plutôt que dans une
// page séparée atteinte via l'icône FAQ — donc onglet existant, pas de
// nouvelle route.
//
// Vocabulaire citoyen (retour Bryan 04/09/2026, instruction complète) : le
// "ticket" reste une abstraction 100% interne (backend, console
// /admin/support) — jamais ce mot, ni "demande"/"formulaire"/"soumettre"
// côté citoyen. L'expérience doit se lire comme "je parle directement à
// une personne de l'équipe Yelen", jamais "je remplis un dossier
// administratif". D'où : bouton "Parler au support" (pas "Nouvelle
// demande"), statuts "Conversation en cours"/"Conversation terminée" (pas
// "Demande traitée/clôturée"), etc. — voir statutTicketLabelCitoyen()
// ci-dessous, distincte de SUPPORT_STATUT_LABELS (admin).
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { YelenLoader } from "@/components/YelenLoader";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { EmptyState } from "@/components/EmptyState";
import {
  getConversationsEtablissements, getThreadRdv, sendMessageRdv, markThreadReadRdv,
  messageInstitutionSuspendue, InstitutionSuspendueError,
  type ConversationEtablissement, type MessageRdvThread,
} from "@/lib/messagerie";
import { journaliserMessageCitoyen } from "./actions";
import {
  SUPPORT_CATEGORIES, SUPPORT_CATEGORIE_LABELS,
  SUPPORT_RATING_RAISONS_POSITIVES, SUPPORT_RATING_RAISONS_NEGATIVES, SUPPORT_RATING_RAISON_LABELS, SUPPORT_RATING_LABELS,
  type SupportCategorie, type SupportStatut, type SupportRatingRaison,
} from "@/lib/supportTicketsConstants";

type TabMsg = "yelen" | "etablissements";
type TicketFiltre = "toutes" | "en_cours" | "resolues";
type AnyMsg = { id: string; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string; mine: boolean };

type TicketListItem = {
  id: string; numero_public: string; categorie: SupportCategorie; sujet: string;
  statut: SupportStatut; agent_nom: string | null;
  dernier_message: string | null; dernier_message_at: string | null;
  dernier_message_expediteur: "citoyen" | "agent" | null;
  cree_le: string; non_lus: number;
};
type TicketMsg = { id: string; expediteur_type: "citoyen" | "agent"; agent_nom: string | null; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string };
type TicketRating = { note: number; raisons: string[]; commentaire: string | null; cree_le: string };
type TicketDetail = {
  id: string; numero_public: string; categorie: SupportCategorie; sujet: string; statut: SupportStatut;
  agent_nom: string | null; cree_le: string; resolu_par: "citoyen" | "agent" | "system" | null; rating: TicketRating | null;
  messages: TicketMsg[];
};

// Numéro déjà public (app/faq/page.tsx, section contact Conakry) — jamais
// affiché en texte dans ce composant, uniquement dans le lien tel: (bouton
// "Appeler Yelen", brief section 9). Réglé par Bryan dans .env.local/Netlify.
const SUPPORT_PHONE_TEL = (process.env.NEXT_PUBLIC_SUPPORT_PHONE || "").replace(/[^\d+]/g, "");

const P = { pointerEvents: "none" as const };
const Ic = {
  Back:   () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  X:      () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  // Même traitement que le dashboard institution (retour Bryan 06/09/2026,
  // "svg pas d'emojis classic sur yelen") — icônes SVG reprises telles
  // quelles, jamais de caractère emoji brut comme élément d'interface.
  Image2: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  Paperclip: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  Smile: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
  Send:   () => <svg style={P} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Lock:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Chev:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  Clock:  () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  Search: () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>,
  Phone:  () => <svg style={P} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Help2:  () => <svg style={P} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Shield: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
  Star: ({ filled, color }: { filled: boolean; color: string }) => <svg style={P} width="34" height="34" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Check: () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}
function formatHeure(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function estMemeJour(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
// Date contextuelle pour la liste des conversations (retour Bryan
// 21/09/2026, écran "Support Yelen") : l'ancien affichage montrait
// uniquement l'heure (ex. "01:39") pour toutes les conversations,
// aujourd'hui comme il y a plusieurs mois — aucun repère temporel réel.
function formatDateListe(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (estMemeJour(dateStr, now.toISOString())) return formatHeure(dateStr);
  const hier = new Date(now); hier.setDate(hier.getDate() - 1);
  if (estMemeJour(dateStr, hier.toISOString())) return "Hier";
  const debutAujourdhui = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const debutJour = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffJours = Math.round((debutAujourdhui.getTime() - debutJour.getTime()) / 86400000);
  if (diffJours > 0 && diffJours < 7) {
    const jour = d.toLocaleDateString("fr-FR", { weekday: "short" });
    return jour.charAt(0).toUpperCase() + jour.slice(1);
  }
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function formatSeparateurJour(dateStr: string): string {
  const d = new Date(dateStr);
  const auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (estMemeJour(dateStr, auj.toISOString())) return "Aujourd'hui";
  if (estMemeJour(dateStr, hier.toISOString())) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function formatApercu(msg: { dernier_message: string | null; dernier_message_type: "texte" | "image" | null }): string {
  if (msg.dernier_message_type === "image") return "Image";
  return msg.dernier_message ?? "Aucun message";
}
function statutTicketCouleur(statut: SupportStatut): { fg: string; dot: string } {
  if (statut === "attente_agent") return { fg: "#c47a00", dot: "#F5A623" };
  if (statut === "en_cours") return { fg: "#2563eb", dot: "#3b82f6" };
  if (statut === "resolu") return { fg: "#15803d", dot: "#22c55e" };
  return { fg: "#6C6C70", dot: "#6C6C70" };
}
// Tri de la liste (retour Bryan 21/09/2026) : les conversations actives
// (rien à faire côté citoyen) passent avant celles où Yelen attend sa
// réponse, elles-mêmes avant les conversations résolues/clôturées — le
// tri par date reste préservé à l'intérieur de chaque groupe (tri stable
// sur un tableau déjà trié par dernier_message_at décroissant côté API).
function ticketPrioriteTri(t: TicketListItem): number {
  if (t.statut === "resolu" || t.statut === "cloture") return 2;
  if (t.statut === "en_cours" && t.dernier_message_expediteur === "agent") return 1;
  return 0;
}
// Vocabulaire côté citoyen (retour Bryan 04/09/2026) — distinct de
// SUPPORT_STATUT_LABELS (lib/supportTicketsConstants.ts, réutilisé par la
// console agent admin) : "ticket" reste une abstraction interne, le
// citoyen ne doit jamais lire ce mot ni un vocabulaire administratif
// ("Demande assignée/traitée", etc.) — juste une conversation avec une
// vraie personne. Voir instruction complète en tête de fichier.
function statutTicketLabelCitoyen(statut: SupportStatut): string {
  if (statut === "attente_agent") return "En attente d'un agent";
  if (statut === "en_cours") return "Conversation en cours";
  if (statut === "resolu") return "Résolu";
  return "Conversation terminée";
}

// Carte d'attente "Support Yelen" (brief 04/09/2026, écran de référence
// fourni) — remplace l'ancienne ligne plate "En attente d'un agent •••".
// Paliers dérivés uniquement de elapsedSec (recalculé depuis
// ticketDetail.cree_le côté appelant, jamais un minuteur local qui
// repartirait de zéro à la réouverture de l'app, brief section 14).
// Support 100% humain (brief section 20-21) : aucun des textes ci-dessous
// ne doit jamais évoquer une IA qui réfléchit/génère — uniquement des
// messages système liés à l'état réel de la file d'attente.
function SupportWaitingCard({ elapsedSec, isDark, card, t1, t2, t3, brd, gold }: {
  elapsedSec: number; isDark: boolean; card: string; t1: string; t2: string; t3: string; brd: string; gold: string;
}) {
  const phase = elapsedSec >= 120 ? "desole" : elapsedSec >= 60 ? "min1" : elapsedSec >= 30 ? "sec30" : "initial";
  const systemMsg =
    phase === "sec30" ? "Nous recherchons actuellement un agent disponible pour vous répondre." :
    phase === "min1" ? "Merci de patienter. Votre message est toujours en attente de prise en charge." :
    null;
  const titre = phase === "desole" ? "Nous sommes désolés pour cette attente." : "Un agent Yelen arrive bientôt.";
  const soustitre = phase === "desole"
    ? "Un agent n'est pas encore disponible pour vous répondre. Vous pouvez continuer à attendre ici ou obtenir de l'aide autrement."
    : "Merci pour votre patience.";
  const showActions = phase === "desole";
  const actionCard = isDark ? "#2C2C2E" : "#F2F2F7";

  return (
    <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: 24, padding: "26px 20px 22px", margin: "6px 0 16px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${gold}`, display: "flex", alignItems: "center", justifyContent: "center", color: gold, marginBottom: 14, flexShrink: 0 }}>
        {Ic.Clock()}
      </div>

      {systemMsg && (
        <div key={systemMsg} style={{ color: t2, fontSize: 12, fontWeight: 600, lineHeight: 1.5, marginBottom: 10, maxWidth: 260, animation: "fadeUp 0.4s ease" }}>
          {systemMsg}
        </div>
      )}

      <div style={{ color: t1, fontSize: 14.5, fontWeight: 800, lineHeight: 1.35, maxWidth: 260 }}>{titre}</div>
      <div style={{ color: t3, fontSize: 12, fontWeight: 600, marginTop: 3, maxWidth: 260, lineHeight: 1.5 }}>{soustitre}</div>

      <span className="support-wait-dots" style={{ margin: "14px 0" }}><span/><span/><span/></span>

      <div style={{ width: 168 }}>
        <div className="support-agent-illustration">
          <Image src="/illustrations/support-agent-yelen.png" alt="Un agent Yelen" width={1312} height={1199} style={{ width: "100%", height: "auto", display: "block" }}/>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, color: t3, fontSize: 11, fontWeight: 600, marginTop: 14 }}>
        <span style={{ display: "flex", color: gold, flexShrink: 0 }}>{Ic.Shield()}</span>
        Votre conversation est en sécurité et 100% humaine.
      </div>

      {showActions && (
        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 18 }}>
          <button
            onClick={() => { if (SUPPORT_PHONE_TEL) window.location.href = `tel:${SUPPORT_PHONE_TEL}`; }}
            className="tap"
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: actionCard, border: `1px solid ${brd}`, borderRadius: 14, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ display: "flex", color: gold, marginBottom: 2 }}>{Ic.Phone()}</span>
            <span style={{ color: t1, fontSize: 12.5, fontWeight: 800 }}>Appeler Yelen</span>
            <span style={{ color: t3, fontSize: 10.5, fontWeight: 600 }}>Parler à un agent</span>
          </button>
          <Link
            href="/faq"
            className="tap"
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: actionCard, border: `1px solid ${brd}`, borderRadius: 14, padding: "10px 12px", textDecoration: "none", cursor: "pointer" }}
          >
            <span style={{ display: "flex", color: gold, marginBottom: 2 }}>{Ic.Help2()}</span>
            <span style={{ color: t1, fontSize: 12.5, fontWeight: 800 }}>Consulter la FAQ</span>
            <span style={{ color: t3, fontSize: 10.5, fontWeight: 600 }}>Trouver une réponse</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function MessagerieInner() {
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
  const gold  = "#F5A623";

  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabMsg>("etablissements");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [conversations, setConversations] = useState<ConversationEtablissement[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [selected, setSelected] = useState<ConversationEtablissement | null>(null);
  const [historiqueOpen, setHistoriqueOpen] = useState(false);
  const [historiqueSearch, setHistoriqueSearch] = useState("");
  const [etabThread, setEtabThread] = useState<MessageRdvThread[]>([]);
  const [etabThreadLoading, setEtabThreadLoading] = useState(false);
  const [etabHasMore, setEtabHasMore] = useState(false);
  const [etabLoadingMore, setEtabLoadingMore] = useState(false);

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false);
  const [nouvelleDemandeOpen, setNouvelleDemandeOpen] = useState(false);
  const [nouvelleCategorie, setNouvelleCategorie] = useState<SupportCategorie | null>(null);
  const [nouvelleSujet, setNouvelleSujet] = useState("");
  const [nouvelleMessage, setNouvelleMessage] = useState("");
  const [nouvelleEnvoi, setNouvelleEnvoi] = useState(false);
  const [conversationActiveAlerteOpen, setConversationActiveAlerteOpen] = useState(false);
  const ticketsUnread = tickets.reduce((s, t) => s + t.non_lus, 0);
  // Une seule conversation Yelen ouverte à la fois (retour Bryan
  // 07/09/2026) — en attente d'un agent ou déjà en cours, jamais de
  // deuxième conversation en parallèle pour le même citoyen.
  const ticketActif = tickets.find(t => t.statut === "attente_agent" || t.statut === "en_cours") ?? null;
  // Filtre liste (retour Bryan 21/09/2026) — "En cours" regroupe attente
  // d'agent + conversation en cours (statuts non résolus côté citoyen),
  // "Résolues" regroupe résolu + clôturé.
  const [ticketFiltre, setTicketFiltre] = useState<TicketFiltre>("toutes");
  const ticketsFiltres = tickets
    .filter(t => {
      if (ticketFiltre === "en_cours") return t.statut === "attente_agent" || t.statut === "en_cours";
      if (ticketFiltre === "resolues") return t.statut === "resolu" || t.statut === "cloture";
      return true;
    })
    .slice()
    .sort((a, b) => ticketPrioriteTri(a) - ticketPrioriteTri(b));

  // Fin de conversation + évaluation (brief 04/09/2026) — evaluationPromptedIds
  // évite de rouvrir le sheet à chaque poll/realtime une fois que le citoyen
  // l'a déjà vu pour ce ticket dans cette session (fermé sans noter = son
  // choix, on ne le harcèle pas) ; une conversation résolue sans note reste
  // toutefois re-proposée à la prochaine ouverture de l'app (brief section
  // 11 : rien de persistant tant qu'aucune note n'existe en base).
  const [bannerDismissedKey, setBannerDismissedKey] = useState<string | null>(null);
  const [confirmerFinOpen, setConfirmerFinOpen] = useState(false);
  const [terminerEnCours, setTerminerEnCours] = useState(false);
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const evaluationPromptedIdsRef = useRef<Set<string>>(new Set());
  const [evaluationNote, setEvaluationNote] = useState(0);
  const [evaluationRaisons, setEvaluationRaisons] = useState<Set<SupportRatingRaison>>(new Set());
  const [evaluationCommentaire, setEvaluationCommentaire] = useState("");
  const [evaluationEnvoi, setEvaluationEnvoi] = useState(false);
  const [evaluationEnvoyee, setEvaluationEnvoyee] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // "En train d'écrire…" côté établissement (retour Bryan 06/09/2026,
  // symétrique de app/[slug]/[id]/components/MessagerieTab.tsx). Canal
  // Broadcast Supabase Realtime éphémère, clé = rdv_id (seule chose que ce
  // fichier connaît — la nouvelle entité `conversations` côté institution
  // n'est jamais exposée ici). Concerne uniquement l'onglet
  // "Établissements", pas le support Yelen (ticketing, hors périmètre).
  const [instEnTrainDecrire, setInstEnTrainDecrire] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const instTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  function showToast(msg: string, type: "success" | "error" = "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const resolveImageUrls = useCallback(async (paths: string[]) => {
    const uniq = [...new Set(paths)];
    if (uniq.length === 0) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch("/api/citoyen/messagerie/image-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, paths: uniq }),
      });
      const j = await res.json().catch(() => null);
      if (j?.success) setImageUrls(prev => ({ ...prev, ...j.urls }));
    } catch {}
  }, [getAccessToken]);

  const loadConversations = useCallback(async (uid: string): Promise<ConversationEtablissement[]> => {
    setConversationsLoading(true);
    try {
      const list = await getConversationsEtablissements(uid);
      setConversations(list);
      return list;
    } catch {
      showToast("Impossible de charger les conversations.");
      return [];
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  const loadEtabThread = useCallback(async (uid: string, conv: ConversationEtablissement) => {
    setEtabThreadLoading(true);
    try {
      const msgs = await getThreadRdv(conv.rdv_id);
      setEtabThread(msgs);
      setEtabHasMore(msgs.length >= 50);
      resolveImageUrls(msgs.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
      await markThreadReadRdv(uid, conv.rdv_id);
      setConversations(prev => prev.map(c => c.rdv_id === conv.rdv_id ? { ...c, non_lus: 0 } : c));
    } catch {
      showToast("Impossible de charger la conversation.");
    } finally {
      setEtabThreadLoading(false);
    }
  }, [resolveImageUrls]);

  const loadEtabPlusAncien = useCallback(async () => {
    if (!selected || etabThread.length === 0) return;
    setEtabLoadingMore(true);
    try {
      const older = await getThreadRdv(selected.rdv_id, { avant: etabThread[0].cree_le });
      setEtabThread(prev => [...older, ...prev]);
      setEtabHasMore(older.length >= 50);
      resolveImageUrls(older.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
    } catch {} finally { setEtabLoadingMore(false); }
  }, [selected, etabThread, resolveImageUrls]);

  // Ticketing "Yelen" (chantier "Support Yelen", 04/09/2026) — les 3 tables
  // support_tickets/support_ticket_messages/support_ticket_events sont RLS
  // zéro policy (service_role uniquement, voir lib/supportTickets.ts) :
  // jamais d'accès direct au client Supabase ici, toujours via les routes
  // /api/citoyen/support/tickets*, comme le reste des routes citoyen
  // sensibles au statut (cf. /api/citoyen/messagerie/upload-image).
  const loadTickets = useCallback(async (silencieux = false) => {
    if (!silencieux) setTicketsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch("/api/citoyen/support/tickets", { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => null);
      if (res.ok) setTickets(j?.tickets ?? []);
    } catch {
      if (!silencieux) showToast("Impossible de charger vos conversations.");
    } finally {
      if (!silencieux) setTicketsLoading(false);
    }
  }, [getAccessToken]);

  const loadTicketDetail = useCallback(async (ticketId: string, silencieux = false) => {
    if (!silencieux) setTicketDetailLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/citoyen/support/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setTicketDetail(j?.ticket ?? null);
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, non_lus: 0 } : t));
      } else if (!silencieux) {
        showToast("Cette conversation est introuvable.");
      }
    } catch {
      if (!silencieux) showToast("Impossible de charger cette conversation.");
    } finally {
      if (!silencieux) setTicketDetailLoading(false);
    }
  }, [getAccessToken]);

  async function envoyerMessageTicket(ticketId: string, texte: string): Promise<boolean> {
    const token = await getAccessToken();
    if (!token) { showToast("Session expirée, reconnectez-vous."); return false; }
    const res = await fetch(`/api/citoyen/support/tickets/${ticketId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texte }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) { showToast(j?.error || "Envoi impossible."); return false; }
    return true;
  }

  // Fin de conversation citoyen (brief section 3-4) — après succès, on
  // recharge le ticket (non silencieux : on veut voir tout de suite le
  // banniere+séparateur "résolu") puis on ouvre directement le sheet
  // d'évaluation sans attendre le prochain tick Realtime/polling.
  async function terminerConversation() {
    if (!selectedTicketId || terminerEnCours) return;
    setTerminerEnCours(true);
    try {
      const token = await getAccessToken();
      if (!token) { showToast("Session expirée, reconnectez-vous."); return; }
      const res = await fetch(`/api/citoyen/support/tickets/${selectedTicketId}/terminer`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { showToast(j?.error || "Impossible de terminer la conversation."); return; }
      setConfirmerFinOpen(false);
      await loadTicketDetail(selectedTicketId);
      await loadTickets(true);
    } catch {
      showToast("Impossible de terminer la conversation.");
    } finally {
      setTerminerEnCours(false);
    }
  }

  function ouvrirEvaluation() {
    setEvaluationNote(0);
    setEvaluationRaisons(new Set());
    setEvaluationCommentaire("");
    setEvaluationEnvoyee(false);
    setEvaluationOpen(true);
  }

  async function envoyerEvaluation() {
    if (!selectedTicketId || !evaluationNote || evaluationEnvoi) return;
    setEvaluationEnvoi(true);
    try {
      const token = await getAccessToken();
      if (!token) { showToast("Session expirée, reconnectez-vous."); return; }
      const res = await fetch(`/api/citoyen/support/tickets/${selectedTicketId}/evaluation`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: evaluationNote, raisons: [...evaluationRaisons], commentaire: evaluationCommentaire.trim() || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { showToast(j?.error || "Envoi impossible."); return; }
      setEvaluationEnvoyee(true);
      loadTicketDetail(selectedTicketId, true);
    } catch {
      showToast("Envoi impossible.");
    } finally {
      setEvaluationEnvoi(false);
    }
  }

  useEffect(() => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!uid) { router.push("/login"); return; }
    setUserId(uid);

    const instParam = searchParams.get("institution_id");
    const tabParam = searchParams.get("tab");
    const ticketIdParam = searchParams.get("ticket_id");
    (async () => {
      const list = await loadConversations(uid!);
      if (instParam) {
        const match = list.find(c => c.institution_id === instParam && !c.fermee) ?? list.find(c => c.institution_id === instParam);
        if (match) { setTab("etablissements"); setSelected(match); }
      }
    })();

    loadTickets();
    if (tabParam === "yelen") {
      setTab("yelen");
      if (ticketIdParam) setSelectedTicketId(ticketIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (userId && selected) loadEtabThread(userId, selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selected?.rdv_id]);

  useEffect(() => {
    if (userId && selectedTicketId) loadTicketDetail(selectedTicketId);
    else setTicketDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedTicketId]);

  // Filet de secours (jamais de rechargement plein écran, voir CLAUDE.md
  // /pieges-techniques-connus) — support_tickets/support_ticket_messages ont
  // désormais une policy RLS de lecture citoyen (migration
  // 20260904000002, écran d'attente Support Yelen) donc le Realtime
  // ci-dessous est la source principale ; ce polling ne sert plus que de
  // rattrapage si un événement Realtime est manqué (reconnexion réseau).
  useEffect(() => {
    if (!userId || tab !== "yelen") return;
    const interval = setInterval(() => {
      if (selectedTicketId) loadTicketDetail(selectedTicketId, true);
      else loadTickets(true);
    }, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab, selectedTicketId]);

  // Realtime Support Yelen — statut/agent (attente_agent→en_cours, etc.) et
  // nouveaux messages, sans attendre le polling de secours ci-dessus (brief
  // section 13 : "le backend doit être temps réel"). Deux canaux distincts
  // (liste vs fil ouvert) pour ne recharger que ce qui est réellement affiché.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`support-tickets-citoyen-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `citoyen_id=eq.${userId}` }, () => {
        loadTickets(true);
        setSelectedTicketId(current => { if (current) loadTicketDetail(current, true); return current; });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || !selectedTicketId) return;
    const channel = supabase
      .channel(`support-ticket-messages-${selectedTicketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedTicketId}` }, () => {
        loadTicketDetail(selectedTicketId, true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedTicketId]);

  // Timer d'attente — recalculé en continu depuis ticketDetail.cree_le
  // (jamais un compteur local repartant de zéro, brief section 14 : app
  // fermée puis rouverte 3 min plus tard doit afficher directement l'état
  // correspondant). 5s de granularité suffisent pour des paliers à 30/60/120s.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (ticketDetail?.statut !== "attente_agent") return;
    const interval = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [ticketDetail?.statut]);
  const attenteElapsedSec = ticketDetail?.statut === "attente_agent"
    ? Math.max(0, Math.floor((nowTick - new Date(ticketDetail.cree_le).getTime()) / 1000))
    : 0;

  // Ouverture automatique du sheet d'évaluation (brief section 10-11) — que
  // ce soit le citoyen qui vienne de cliquer "Terminer le chat" ou l'agent
  // qui ait résolu de son côté (Realtime/polling met ticketDetail à jour
  // dans les deux cas, ce useEffect ne distingue pas la source). Ne se
  // déclenche qu'une fois par ticket et par session tant qu'aucune note
  // n'existe — voir commentaire sur evaluationPromptedIds plus haut.
  useEffect(() => {
    if (!ticketDetail || ticketDetail.statut !== "resolu" || ticketDetail.rating) return;
    if (evaluationPromptedIdsRef.current.has(ticketDetail.id)) return;
    evaluationPromptedIdsRef.current.add(ticketDetail.id);
    ouvrirEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketDetail?.id, ticketDetail?.statut, ticketDetail?.rating]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`messagerie-citoyen-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `destinataire_citoyen_id=eq.${userId}` }, () => {
        loadConversations(userId);
        setSelected(current => { if (current) loadEtabThread(userId, current); return current; });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [etabThread, ticketDetail?.messages, tab, selected, selectedTicketId]);

  useEffect(() => {
    setInstEnTrainDecrire(false);
    const rdvId = tab === "etablissements" ? selected?.rdv_id : null;
    if (!rdvId) { typingChannelRef.current = null; return; }
    const channel = supabase
      .channel(`typing-rdv-${rdvId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if ((payload as { from?: string })?.from !== "institution") return;
        setInstEnTrainDecrire(true);
        if (instTypingTimeoutRef.current) clearTimeout(instTypingTimeoutRef.current);
        instTypingTimeoutRef.current = setTimeout(() => setInstEnTrainDecrire(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      if (instTypingTimeoutRef.current) clearTimeout(instTypingTimeoutRef.current);
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [tab, selected?.rdv_id]);

  function signalerEnTrainDecrire() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: "citoyen" } });
  }

  function switchTab(next: TabMsg) {
    setTab(next);
    setSelected(null);
    setSelectedTicketId(null);
    setConfirmerFinOpen(false);
    setEvaluationOpen(false);
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
  }

  function cancelPendingImage() {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(null);
    setPendingImagePreview(null);
  }

  // Pièces jointes non prises en charge pour les demandes de support pour
  // l'instant (lot "attachments" volontairement pas construit cette
  // session) — bouton caméra masqué sur l'onglet Yelen, cette fonction ne
  // reste utile qu'à Établissements.
  async function handleSendImage() {
    if (!userId || !pendingImageFile || tab === "yelen" || !selected) return;
    setSending(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée, reconnectez-vous.");
      const form = new FormData();
      form.append("accessToken", token);
      form.append("target", "etablissement");
      form.append("rdv_id", selected.rdv_id);
      if (messageText.trim()) form.append("legende", messageText.trim());
      form.append("file", pendingImageFile);
      const res = await fetch("/api/citoyen/messagerie/upload-image", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error || "Erreur d'envoi de l'image.");

      if (j.path && j.url) setImageUrls(prev => ({ ...prev, [j.path]: j.url }));
      const legende = messageText.trim() || null;
      cancelPendingImage();
      setMessageText("");

      setEtabThread(prev => [...prev, { id: `local-${Date.now()}`, contenu: legende, image_url: j.path, type: "image", lu: false, cree_le: new Date().toISOString(), emetteur: "citoyen" }]);
      setConversations(prev => prev.map(c => c.rdv_id === selected.rdv_id ? { ...c, dernier_message: null, dernier_message_type: "image", dernier_message_at: new Date().toISOString() } : c));
      journaliserMessageCitoyen(selected.institution_id, userId).catch(() => {});
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erreur d'envoi de l'image.");
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!userId || sending) return;
    if (pendingImageFile) { await handleSendImage(); return; }
    const contenu = messageText.trim();
    if (!contenu) return;
    setSending(true);
    try {
      if (tab === "yelen") {
        if (!selectedTicketId) return;
        const ok = await envoyerMessageTicket(selectedTicketId, contenu);
        if (ok) { setMessageText(""); await loadTicketDetail(selectedTicketId, true); await loadTickets(true); }
      } else if (selected) {
        await sendMessageRdv(userId, selected.institution_id, selected.rdv_id, { texte: contenu });
        setEtabThread(prev => [...prev, { id: `local-${Date.now()}`, contenu, image_url: null, type: "texte", lu: false, cree_le: new Date().toISOString(), emetteur: "citoyen" }]);
        setConversations(prev => prev.map(c => c.rdv_id === selected.rdv_id ? { ...c, dernier_message: contenu, dernier_message_type: "texte", dernier_message_at: new Date().toISOString() } : c));
        journaliserMessageCitoyen(selected.institution_id, userId).catch(() => {});
        setMessageText("");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      showToast(e instanceof InstitutionSuspendueError || msg.includes("terminé") ? msg : "Erreur d'envoi. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  async function creerNouveauTicket() {
    if (!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim() || nouvelleEnvoi) return;
    setNouvelleEnvoi(true);
    try {
      const token = await getAccessToken();
      if (!token) { showToast("Session expirée, reconnectez-vous."); return; }
      const res = await fetch("/api/citoyen/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categorie: nouvelleCategorie, sujet: nouvelleSujet.trim(), message: nouvelleMessage.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { showToast(j?.error || "Envoi impossible."); return; }
      setNouvelleDemandeOpen(false);
      setNouvelleCategorie(null); setNouvelleSujet(""); setNouvelleMessage("");
      await loadTickets(true);
      setTab("yelen");
      setSelectedTicketId(j.id);
    } catch {
      showToast("Envoi impossible.");
    } finally {
      setNouvelleEnvoi(false);
    }
  }

  // Point d'entrée unique pour "Parler au support" (3 boutons : liste
  // principale + relance depuis un ticket clôturé/résolu) — redirige vers
  // l'alerte plutôt que le formulaire si une conversation est déjà
  // attente_agent/en_cours, pour ne jamais laisser le citoyen en ouvrir
  // une deuxième en parallèle.
  function ouvrirNouvelleDemande() {
    if (ticketActif) { setConversationActiveAlerteOpen(true); return; }
    setNouvelleDemandeOpen(true);
  }
  function allerVersConversationActive() {
    if (!ticketActif) return;
    setConversationActiveAlerteOpen(false);
    setSelectedTicketId(ticketActif.id);
  }

  // Conversations actives = rdv pas encore fermé (voir fermee dans
  // lib/messagerie.ts, inclut désormais termine/annule/refuse/absent) —
  // celles-ci restent affichées comme "établissement actuel" dans la liste
  // principale. Le reste bascule uniquement dans le sheet Historique (retour
  // Bryan 31/08/2026, "LOT — Historique messagerie").
  const activeConversations = conversations.filter(c => !c.fermee);
  const historiqueConversations = conversations.filter(c => c.fermee);
  const historiqueFiltree = historiqueConversations.filter(c => {
    const q = historiqueSearch.trim().toLowerCase();
    if (!q) return true;
    return c.institution_nom.toLowerCase().includes(q) || (c.dernier_message ?? "").toLowerCase().includes(q);
  });

  // Établissements uniquement — l'onglet Yelen (tickets) a son propre
  // rendu dédié plus bas (statuts/agent/clôture n'ont pas d'équivalent
  // dans ce fil unifié d'origine).
  const threadUnifie: AnyMsg[] = etabThread.map(m => ({ id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type, cree_le: m.cree_le, mine: m.emetteur === "citoyen" }));

  const dansUnFilEtab = tab === "etablissements" && !!selected;
  const fermee = tab === "etablissements" && selected?.fermee === true;
  // Restriction messagerie citoyen → institution suspendue (retour Bryan
  // 17/08/2026) — message explicite, distinct de "conversation fermée"
  // (le rdv n'est pas fermé, l'établissement est simplement injoignable
  // pour l'instant).
  const suspendue = tab === "etablissements" && !fermee && selected?.institution_suspendue === true;

  // ── Refonte visuelle uniquement (retour Bryan 21/08/2026, "LOT — Refonte
  // UI/UX écran Messagerie Yelen") : même principe que
  // MessagerieTab.tsx (institution) — mobile-first, liste↔détail sur
  // mobile (une seule couche visible, piloté par `selected`/`tab`, état
  // déjà existant), liste + détail simultanés dès 860px. Zéro changement
  // de logique/route/realtime/pagination — uniquement présentation.
  const listeVisibleMobile = (tab === "etablissements" && !selected) || (tab === "yelen" && !selectedTicketId);
  const detailVisibleMobile = dansUnFilEtab || (tab === "yelen" && !!selectedTicketId);

  return (
    <div style={{ minHeight: "100svh", background: bg, color: t1, fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .support-wait-dots{display:inline-flex;gap:3px}
        .support-wait-dots span{width:5px;height:5px;border-radius:3px;background:${t3};animation:support-wait-bounce 1.2s infinite ease-in-out}
        .support-wait-dots span:nth-child(2){animation-delay:0.15s}
        .support-wait-dots span:nth-child(3){animation-delay:0.3s}
        @keyframes support-wait-bounce{0%,60%,100%{opacity:0.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
        @keyframes support-agent-wave{0%,80%,100%{transform:rotate(0deg)}85%{transform:rotate(-4deg)}90%{transform:rotate(3deg)}95%{transform:rotate(-2deg)}}
        @media (prefers-reduced-motion: no-preference){
          .support-agent-illustration{animation:support-agent-wave 4s ease-in-out infinite;transform-origin:65% 95%}
        }
        .tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.96)}
        input{font-family:inherit;color:${t1}}
        input:focus{outline:none}
        .msg-pane{display:none;min-height:0}
        .msg-pane-on{display:flex}
        .msg-list-pane{width:100%}
        /* Barre du bas (composer/bannières) : "sticky" seul ne suffit pas
           en mobile — Safari iOS recalcule "100svh" au moment du premier
           rendu (barre d'adresse visible) puis ne relayoute pas toujours
           quand elle se masque ensuite au scroll, laissant un vide sous la
           barre (retour Bryan 09/09/2026, repéré sur écran réel). "fixed"
           ancre à la fenêtre visible réelle en continu — vrai correctif,
           pas juste esthétique. Gardé "sticky" en layout 2 colonnes
           desktop (≥860px) où la barre doit rester dans la largeur du
           volet détail, pas toute la fenêtre. */
        .msg-bottom-bar{position:sticky;bottom:0}
        .msg-scroll-area{padding-bottom:8px}
        @media (max-width:859px){
          .msg-bottom-bar{position:fixed!important;left:0;right:0;z-index:50}
          .msg-scroll-area{padding-bottom:calc(100px + env(safe-area-inset-bottom))!important}
        }
        @media (min-width:860px){
          .msg-pane{display:flex !important}
          .msg-body{flex-direction:row !important}
          .msg-list-pane{width:320px;flex-shrink:0;border-right:1px solid ${brd}}
        }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 200, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", paddingRight: "16px", paddingBottom: 0, paddingLeft: "16px", flexShrink: 0 }}>
        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => {
              if (tab === "etablissements" && selected) setSelected(null);
              else if (tab === "yelen" && selectedTicketId) setSelectedTicketId(null);
              else if (tab === "yelen") switchTab("etablissements");
              else router.back();
            }}
            className="tap" style={{ background: "none", border: "none", color: t1, padding: "4px 6px 4px 0", cursor: "pointer" }}
          >{Ic.Back()}</button>
          {tab === "etablissements" && selected ? (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: t1, fontSize: 14.5, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.institution_nom}</div>
              <div style={{ color: fermee ? "#EF4444" : t3, fontSize: 10.5, fontWeight: 600, marginTop: 1 }}>
                {fermee ? "Conversation fermée" : (selected.service ?? "Conversation active")}
              </div>
            </div>
          ) : tab === "yelen" && selectedTicketId ? (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: t1, fontSize: 14.5, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ticketDetail?.sujet ?? "Conversation"}</div>
              <div style={{ color: t3, fontSize: 10.5, fontWeight: 600, marginTop: 1 }}>{ticketDetail ? SUPPORT_CATEGORIE_LABELS[ticketDetail.categorie] : ""}</div>
            </div>
          ) : (
            <div style={{ flex: 1, color: t1, fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{tab === "yelen" ? "Support Yelen" : "Messagerie"}</div>
          )}
          {tab === "yelen" && selectedTicketId && ticketDetail && (ticketDetail.statut === "attente_agent" || ticketDetail.statut === "en_cours") && (
            <button onClick={() => setConfirmerFinOpen(true)} className="tap" style={{ background: "none", border: "none", padding: "4px 2px", color: t2, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
              Terminer le chat
            </button>
          )}
          {tab !== "yelen" && (
            <button onClick={() => switchTab("yelen")} aria-label="Support Yelen" className="tap" style={{ position: "relative", background: "none", border: "none", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer", flexShrink: 0 }}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
              {ticketsUnread > 0 && (
                <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: "#EF4444", border: `1.5px solid ${isDark ? "#0A0A0F" : "#F8F8FC"}` }}/>
              )}
            </button>
          )}
        </div>
      </header>

      <div className="msg-body" style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* ═══ LISTE ÉTABLISSEMENTS ═══ */}
        {tab === "etablissements" && (
          <div className={`msg-pane msg-list-pane ${listeVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "column", overflowY: "auto" }}>
            {conversationsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                <div style={{ width: 30, height: 30, border: `3px solid rgba(245,166,35,0.15)`, borderTopColor: gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
              </div>
            ) : activeConversations.length === 0 ? (
              <div style={{ paddingTop: 24, padding: "24px 16px" }}>
                {historiqueConversations.length > 0 ? (
                  <>
                    <EmptyState
                      title="Aucune réservation en cours"
                      message="Vous n'avez pas de rendez-vous actif pour l'instant. Vos échanges précédents restent disponibles dans l'historique ci-dessous."
                      color={gold} titleColor={t1} textColor={t3}
                    />
                    <div style={{ textAlign: "center", marginTop: 4, fontSize: 12.5 }}>
                      <span style={{ color: t3 }}>Envie d&apos;un nouveau rendez-vous ? </span>
                      <Link href="/recherche" className="tap" style={{ color: gold, fontWeight: 800, textDecoration: "none" }}>en trouver un</Link>
                    </div>
                  </>
                ) : (
                  // Illustration réelle (retour Bryan 07/09/2026, chantier
                  // "illustrations sur mesure") plutôt que l'icône SVG
                  // générique d'EmptyState — même typographie que le
                  // composant partagé, juste l'icône remplacée par le PNG.
                  <div style={{ textAlign: "center", padding: "28px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                      <Image src="/illustrations/messagerie-etablissements-vide.png" alt="Un citoyen échange avec une institution" width={1536} height={1024} style={{ width: 260, maxWidth: "100%", height: "auto", display: "block" }}/>
                    </div>
                    <div style={{ color: t1, fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Aucune conversation pour l&apos;instant</div>
                    <div style={{ color: t3, fontSize: 12.5, lineHeight: 1.6, maxWidth: 260, margin: "0 auto" }}>Dès qu&apos;un rendez-vous est confirmé, vous pouvez échanger directement avec l&apos;institution ici — rappels, questions, suivi.</div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {activeConversations.map(c => {
                  const activeRow = selected?.rdv_id === c.rdv_id;
                  return (
                    <div key={c.rdv_id} onClick={() => setSelected(c)} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderLeft: `2px solid ${activeRow ? gold : "transparent"}`, background: activeRow ? card2 : "transparent", cursor: "pointer" }}>
                      <div style={{ width: 40, height: 40, position: "relative", borderRadius: 12, background: card2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: t2, overflow: "hidden", flexShrink: 0 }}>
                        {c.institution_logo ? <Image src={c.institution_logo} alt={c.institution_nom} fill sizes="40px" style={{ objectFit: "cover" }}/> : getInitials(c.institution_nom)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: t1, fontSize: 13.5, fontWeight: c.non_lus > 0 ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.institution_nom}</span>
                          {c.dernier_message_at && <span style={{ color: t3, fontSize: 10.5, flexShrink: 0 }}>{formatHeure(c.dernier_message_at)}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          {(c.fermee || c.institution_suspendue) && <span style={{ display: "flex", color: t3, flexShrink: 0 }}>{Ic.Lock()}</span>}
                          {c.dernier_message_type === "image" && <span style={{ display: "flex", color: t3, flexShrink: 0 }}>{Ic.Image2()}</span>}
                          <span style={{ color: c.non_lus > 0 ? t2 : t3, fontSize: 12, fontWeight: c.non_lus > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatApercu(c)}</span>
                        </div>
                      </div>
                      {c.non_lus > 0 && (
                        <span style={{ background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>{c.non_lus}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {historiqueConversations.length > 0 && (
              <div style={{ padding: "16px" }}>
                <button onClick={() => setHistoriqueOpen(true)} className="tap" style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  background: gold, border: "none", borderRadius: 14,
                  padding: "14px 16px", color: "#080812", fontSize: 13.5, fontWeight: 800, cursor: "pointer",
                }}>
                  <span style={{ display: "flex", color: "#080812" }}>{Ic.Clock()}</span>
                  Historique des conversations
                  <span style={{ background: "rgba(8,8,18,0.15)", color: "#080812", fontSize: 10.5, fontWeight: 800, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{historiqueConversations.length}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ LISTE DEMANDES (Yelen — tickets) ═══ */}
        {tab === "yelen" && (
          <div className={`msg-pane msg-list-pane ${listeVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "column", overflowY: "auto" }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <button onClick={ouvrirNouvelleDemande} className="tap" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: gold, border: "none", borderRadius: 10, height: 40, padding: "0 16px", color: "#080812", fontSize: 13, fontWeight: 800, cursor: "pointer",
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Parler au support
                </button>
                {/* Accès FAQ (retour Bryan 07/09/2026) — volontairement très
                    visible (fond plein, pas un simple ghost icon comme le
                    reste des headers) pour offrir une alternative rapide au
                    ticketing avant même de parler à un agent. */}
                <Link href="/faq" aria-label="Consulter la FAQ" className="tap" style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 40, height: 40, borderRadius: "50%", background: gold, color: "#080812", flexShrink: 0, textDecoration: "none",
                }}>
                  {Ic.Help2()}
                </Link>
              </div>
              <div style={{ color: t3, fontSize: 10.5, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                Une question ou un problème ?<br/>Notre équipe est là pour vous aider.
              </div>
            </div>

            {tickets.length > 0 && (
              <div style={{ display: "flex", gap: 6, padding: "0 16px 12px" }}>
                {([["toutes", "Toutes"], ["en_cours", "En cours"], ["resolues", "Résolues"]] as [TicketFiltre, string][]).map(([f, label]) => (
                  <button key={f} onClick={() => setTicketFiltre(f)} className="tap" style={{
                    flex: 1, height: 32, borderRadius: 8, border: "none",
                    background: ticketFiltre === f ? gold : card2,
                    color: ticketFiltre === f ? "#080812" : t2,
                    fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {ticketsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                <div style={{ width: 30, height: 30, border: `3px solid rgba(245,166,35,0.15)`, borderTopColor: gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: "8px 16px 24px" }}>
                {/* Illustration réelle (retour Bryan 07/09/2026, chantier
                    "illustrations sur mesure"), même principe que l'état vide
                    Établissements ci-dessus — icône EmptyState remplacée par
                    le PNG, typographie identique. */}
                <div style={{ textAlign: "center", padding: "28px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                    <Image src="/illustrations/messagerie-support-vide.png" alt="Un agent Yelen prêt à vous aider" width={1536} height={1024} style={{ width: 260, maxWidth: "100%", height: "auto", display: "block" }}/>
                  </div>
                  <div style={{ color: t1, fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Besoin d&apos;aide ?</div>
                  <div style={{ color: t3, fontSize: 12.5, lineHeight: 1.6, maxWidth: 260, margin: "0 auto" }}>Écrivez-nous directement. Un agent Yelen vous répondra ici.</div>
                </div>
              </div>
            ) : ticketsFiltres.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: t3, fontSize: 12.5 }}>
                Aucune conversation dans cette catégorie.
              </div>
            ) : (
              <div>
                {ticketsFiltres.map(t => {
                  const activeRow = selectedTicketId === t.id;
                  const c = statutTicketCouleur(t.statut);
                  return (
                    <div key={t.id} onClick={() => setSelectedTicketId(t.id)} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderLeft: `2px solid ${activeRow ? gold : "transparent"}`, background: activeRow ? card2 : "transparent", cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: t1, fontSize: 13.5, fontWeight: t.non_lus > 0 ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sujet}</span>
                          <span style={{ color: t3, fontSize: 10.5, flexShrink: 0 }}>{formatDateListe(t.dernier_message_at ?? t.cree_le)}</span>
                        </div>
                        {t.dernier_message && (
                          <div style={{ color: t.non_lus > 0 ? t2 : t3, fontSize: 12, fontWeight: t.non_lus > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{t.dernier_message}</div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: c.dot, flexShrink: 0 }}/>
                          <span style={{ color: c.fg, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{statutTicketLabelCitoyen(t.statut)}</span>
                          <span style={{ color: t3, fontSize: 11 }}>· {SUPPORT_CATEGORIE_LABELS[t.categorie]}</span>
                        </div>
                      </div>
                      {t.non_lus > 0 && (
                        <span style={{ background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>{t.non_lus}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ FIL (Yelen ou conversation établissement ouverte) ═══ */}
        <div className={`msg-pane msg-detail-pane ${detailVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "column", flex: 1, minHeight: 0 }}>
          {tab === "yelen" ? (
            !selectedTicketId ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t3, fontSize: 12.5, padding: 24, textAlign: "center" }}>
                Sélectionnez une conversation ou parlez au support
              </div>
            ) : ticketDetailLoading || !ticketDetail ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 30, height: 30, border: `3px solid rgba(245,166,35,0.15)`, borderTopColor: gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
              </div>
            ) : (
              <>
                {(() => {
                  const banniere = {
                    attente_agent: { fg: "#c47a00", titre: "En attente d'un agent", texte: "Votre message a bien été reçu. Un agent Yelen va vous répondre directement ici." },
                    en_cours: { fg: "#15803d", titre: "Vous êtes maintenant en contact avec Yelen.", texte: ticketDetail.agent_nom ? `${ticketDetail.agent_nom} vous aide.` : "Un agent Yelen vous aide." },
                    resolu: { fg: "#2563eb", titre: "Votre problème est résolu", texte: "Répondez ici si vous avez encore besoin d'aide — nous reprendrons la conversation." },
                    cloture: { fg: t3, titre: "Conversation terminée", texte: "Merci d'avoir contacté Yelen. Vous pouvez nous écrire à tout moment si vous avez besoin d'aide." },
                  }[ticketDetail.statut];
                  const bannerKey = `${ticketDetail.id}:${ticketDetail.statut}`;
                  if (bannerDismissedKey === bannerKey) return null;
                  return (
                    <div style={{ padding: "12px 20px 0" }}>
                      {/* Retour Bryan 04/09/2026 : fond neutre (plus de teinte
                          colorée), texte du titre en noir/blanc normal (plus
                          de couleur par statut), le point coloré suffit comme
                          repère visuel — plus sobre et pro. Dismissible par X,
                          réapparaît si le statut change ensuite (bannerKey). */}
                      <div style={{ position: "relative", background: card, border: `1px solid ${brd}`, borderRadius: 16, padding: "14px 40px 14px 16px" }}>
                        <button onClick={() => setBannerDismissedKey(bannerKey)} aria-label="Fermer" className="tap" style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", padding: 6, display: "flex", color: t3, cursor: "pointer" }}>
                          {Ic.X()}
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: banniere.fg, flexShrink: 0 }}/>
                          <span style={{ color: t1, fontSize: 12.5, fontWeight: 800 }}>{banniere.titre}</span>
                        </div>
                        <div style={{ color: t2, fontSize: 11.5, lineHeight: 1.5 }}>{banniere.texte}</div>
                      </div>
                    </div>
                  );
                })()}

                <div ref={scrollRef} className="msg-scroll-area" style={{ flex: 1, overflowY: "auto", padding: "12px 20px 8px" }}>
                  {ticketDetail.messages.map((m, i) => {
                    const prev = ticketDetail.messages[i - 1];
                    const showSeparateur = !prev || !estMemeJour(prev.cree_le, m.cree_le);
                    const mine = m.expediteur_type === "citoyen";
                    return (
                      <div key={m.id}>
                        {showSeparateur && (
                          <div style={{ textAlign: "center", margin: "16px 0 12px" }}>
                            <span style={{ color: t3, fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>{formatSeparateurJour(m.cree_le)}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 14, animation: "fadeUp 0.2s ease" }}>
                          {!mine && (
                            <span style={{ color: t3, fontSize: 10, fontWeight: 700, marginBottom: 3, marginLeft: 2 }}>{m.agent_nom ?? "Agent Yelen"} · Agent Support Yelen</span>
                          )}
                          <div style={{ maxWidth: "min(76%, 480px)" }}>
                            <div style={{ background: mine ? gold : card, borderRadius: 15, padding: "10px 14px" }}>
                              {m.contenu && <div style={{ color: mine ? "#080812" : t1, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.contenu}</div>}
                            </div>
                            <span style={{ display: "block", color: t3, fontSize: 10, marginTop: 4, padding: "0 2px", fontWeight: mine ? 700 : 400, textAlign: mine ? "right" : "left" }}>{mine ? "Vous · " : ""}{formatHeure(m.cree_le)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ticketDetail.statut === "attente_agent" && (
                    <SupportWaitingCard elapsedSec={attenteElapsedSec} isDark={isDark} card={card} t1={t1} t2={t2} t3={t3} brd={brd} gold={gold}/>
                  )}
                  {(ticketDetail.statut === "resolu" || ticketDetail.statut === "cloture") && (
                    <div style={{ textAlign: "center", margin: "18px 0 4px" }}>
                      <div style={{ color: t2, fontSize: 11, fontWeight: 800, letterSpacing: 0.3, marginBottom: 3 }}>Conversation terminée</div>
                      <div style={{ color: t3, fontSize: 11.5 }}>
                        {ticketDetail.resolu_par === "citoyen" ? "Vous avez terminé cette conversation."
                          : ticketDetail.resolu_par === "agent" ? "Cette conversation a été terminée par le support Yelen."
                          : "Cette conversation est terminée."}
                      </div>
                    </div>
                  )}
                </div>

                {ticketDetail.statut === "cloture" ? (
                  <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", flexShrink: 0, textAlign: "center" }}>
                    <div style={{ color: t3, fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>Cette conversation est terminée. Vous pouvez nous écrire à tout moment si vous avez besoin d&apos;aide.</div>
                    <button onClick={ouvrirNouvelleDemande} className="tap" style={{ background: gold, color: "#080812", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                      Parler au support
                    </button>
                  </div>
                ) : ticketDetail.statut === "resolu" ? (
                  // Retour Bryan 04/09/2026 : une conversation terminée
                  // (par le citoyen ou l'agent) ne se réouvre plus en y
                  // répondant — même traitement que "cloture", pour
                  // continuer il faut démarrer une nouvelle conversation.
                  <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", flexShrink: 0, textAlign: "center" }}>
                    <div style={{ color: t3, fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>Cette conversation est terminée. Démarrez une nouvelle conversation si vous avez encore besoin d&apos;aide.</div>
                    <button onClick={ouvrirNouvelleDemande} className="tap" style={{ background: gold, color: "#080812", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                      Parler au support
                    </button>
                  </div>
                ) : ticketDetail.statut === "attente_agent" ? (
                  // Retour Bryan 04/09/2026 : plus d'envoi possible tant
                  // qu'aucun agent n'a pris la conversation en charge.
                  <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", flexShrink: 0, textAlign: "center" }}>
                    <div style={{ color: t3, fontSize: 11.5, fontWeight: 600 }}>Un agent doit prendre en charge la conversation avant que vous puissiez continuer à échanger.</div>
                  </div>
                ) : (
                  <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", padding: "8px 16px calc(14px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: card2, borderRadius: 24, padding: "4px 6px 4px 16px" }}>
                      <input
                        value={messageText}
                        onChange={e => setMessageText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                        placeholder="Écrire un message…"
                        style={{ flex: 1, background: "none", border: "none", padding: "10px 0", fontSize: 13.5 }}
                      />
                      <button onClick={handleSend} disabled={sending || !messageText.trim()} className="tap" style={{ background: gold, color: "#080812", border: "none", borderRadius: "50%", width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: sending || !messageText.trim() ? 0.5 : 1 }}>
                        {sending ? <YelenLoader size={14} color="#080812"/> : Ic.Send()}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          ) : !dansUnFilEtab ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t3, fontSize: 12.5, padding: 24, textAlign: "center" }}>
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="msg-scroll-area" style={{ flex: 1, overflowY: "auto", padding: "18px 20px 8px" }}>
                {fermee && !etabThreadLoading && (
                  <div style={{ textAlign: "center", padding: "0 4px 24px" }}>
                    <Image
                      src="/illustrations/messagerie-conversation-fermee.png"
                      alt="Conversation fermée"
                      width={1536} height={1024}
                      style={{ width: "170px", maxWidth: "100%", height: "auto", margin: "0 auto 10px", display: "block" }}
                    />
                    <div style={{ color: t3, fontSize: 11.5, fontWeight: 600 }}>Ce rendez-vous est terminé, la conversation est archivée.</div>
                  </div>
                )}
                {etabThreadLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                    <div style={{ width: 30, height: 30, border: `3px solid rgba(245,166,35,0.15)`, borderTopColor: gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                  </div>
                ) : threadUnifie.length === 0 ? (
                  <div style={{ padding: "8px 16px 24px" }}>
                    {/* Illustration réelle (retour Bryan 09/09/2026), même
                        principe que l'état vide "Besoin d'aide ?" ci-dessus
                        — icône EmptyState remplacée par le PNG, typographie
                        identique. */}
                    <div style={{ textAlign: "center", padding: "28px 20px" }}>
                      <div style={{ color: t1, fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Démarrez la conversation</div>
                      <div style={{ color: t3, fontSize: 12.5, lineHeight: 1.6, maxWidth: 260, margin: "0 auto 14px" }}>Envoyez un premier message à {selected?.institution_nom}.</div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <Image src="/illustrations/messagerie-demarrer-conversation.png" alt="Démarrez la conversation" width={1024} height={1536} style={{ width: 220, maxWidth: "100%", height: "auto", display: "block" }}/>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {etabHasMore && (
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                        <button onClick={loadEtabPlusAncien} disabled={etabLoadingMore} className="tap" style={{ background: "none", border: `1px solid ${brd}`, borderRadius: 20, padding: "6px 14px", color: t2, fontSize: 11.5, fontWeight: 700, cursor: "pointer", opacity: etabLoadingMore ? 0.6 : 1 }}>
                          {etabLoadingMore ? "Chargement…" : "Charger les messages précédents"}
                        </button>
                      </div>
                    )}
                    {threadUnifie.map((m, i) => {
                      const prev = threadUnifie[i - 1];
                      const showSeparateur = !prev || !estMemeJour(prev.cree_le, m.cree_le);
                      const url = m.image_url ? imageUrls[m.image_url] : null;
                      return (
                        <div key={m.id}>
                          {showSeparateur && (
                            <div style={{ textAlign: "center", margin: "16px 0 12px" }}>
                              <span style={{ color: t3, fontSize: 11, fontWeight: 700, textTransform: "capitalize" }}>{formatSeparateurJour(m.cree_le)}</span>
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: m.mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 7, marginBottom: 14, animation: "fadeUp 0.2s ease" }}>
                            {!m.mine && (
                              <div style={{ width: 26, height: 26, borderRadius: "50%", position: "relative", overflow: "hidden", flexShrink: 0, background: card2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, color: t2 }}>
                                {selected?.institution_logo
                                  ? <Image src={selected.institution_logo} alt="" fill sizes="26px" style={{ objectFit: "cover" }}/>
                                  : getInitials(selected?.institution_nom || "")}
                              </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", maxWidth: "min(76%, 480px)" }}>
                              <div style={{ background: m.mine ? gold : card, borderRadius: 15, padding: m.type === "image" ? 6 : "10px 14px", overflow: "hidden" }}>
                                {m.type === "image" && (
                                  url ? (
                                    <Image src={url} alt="" width={800} height={600} onClick={() => setLightbox(url)} className="tap" style={{ display: "block", width: "100%", height: "auto", maxWidth: 220, borderRadius: 9, cursor: "pointer" }}/>
                                  ) : (
                                    <div style={{ width: 180, height: 130, borderRadius: 9, background: card2, display: "flex", alignItems: "center", justifyContent: "center", color: t3, fontSize: 11 }}>Chargement…</div>
                                  )
                                )}
                                {m.contenu && <div style={{ color: m.mine ? "#080812" : t1, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: m.type === "image" ? 6 : 0, padding: m.type === "image" ? "0 4px" : 0 }}>{m.contenu}</div>}
                              </div>
                              <span style={{ color: t3, fontSize: 10, marginTop: 4, padding: "0 2px", fontWeight: m.mine ? 700 : 400 }}>{m.mine ? "Vous · " : ""}{formatHeure(m.cree_le)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {instEnTrainDecrire && !fermee && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 20px 8px" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", position: "relative", overflow: "hidden", flexShrink: 0, background: card2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8.5, fontWeight: 800, color: t2 }}>
                    {selected?.institution_logo
                      ? <Image src={selected.institution_logo} alt="" fill sizes="22px" style={{ objectFit: "cover" }}/>
                      : getInitials(selected?.institution_nom || "")}
                  </div>
                  <div style={{ background: card, borderRadius: 14, padding: "8px 13px", color: t3, fontSize: 12, fontStyle: "italic" }}>en train d&apos;écrire…</div>
                </div>
              )}

              {fermee ? (
                <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
                  {Ic.Lock()}
                  <div style={{ color: t3, fontSize: 11.5 }}>Ce rendez-vous est terminé — la conversation est fermée.</div>
                </div>
              ) : suspendue ? (
                <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
                  {Ic.Lock()}
                  <div style={{ color: t2, fontSize: 11.5, lineHeight: 1.55 }}>
                    {messageInstitutionSuspendue(selected?.institution_nom || "Cet établissement")}{" "}
                    <a href="mailto:support@yelen224.com" style={{ color: gold, fontWeight: 700, textDecoration: "none" }}>Besoin de parler à un agent ? →</a>
                  </div>
                </div>
              ) : (
                <div className="msg-bottom-bar" style={{ background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", padding: "8px 16px calc(14px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
                  {pendingImagePreview && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ position: "relative", width: 46, height: 46, borderRadius: 10, overflow: "hidden", border: `1px solid ${brd}` }}>
                        {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pendingImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      </div>
                      <button onClick={cancelPendingImage} className="tap" style={{ background: card2, border: "none", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <span style={{ color: t3, fontSize: 11 }}>Image prête — ajoutez une légende ou envoyez directement.</span>
                    </div>
                  )}
                  {/* Même traitement que le dashboard institution (retour
                      Bryan 06/09/2026) : saisie pleine largeur, actions +
                      Envoyer en dessous. Fichier désactivé ("bientôt
                      disponible") — messages.type n'accepte que
                      texte/image côté serveur, aucun support fichier
                      générique. Emoji = focus sur le champ, clavier système. */}
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePickFile} style={{ display: "none" }}/>
                  <div style={{ background: card2, borderRadius: 18, padding: "10px 14px 8px" }}>
                    <input
                      ref={messageInputRef}
                      value={messageText}
                      onChange={e => { setMessageText(e.target.value); signalerEnTrainDecrire(); }}
                      onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                      placeholder={pendingImageFile ? "Légende (optionnel)…" : "Écrire un message…"}
                      style={{ width: "100%", background: "none", border: "none", padding: "4px 0 8px", fontSize: 13.5 }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <button onClick={() => showToast("Envoi de fichiers bientôt disponible.")} disabled={sending} className="tap" style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: t3, cursor: "pointer", padding: 6, opacity: 0.5 }}>{Ic.Paperclip()}</button>
                      <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="tap" style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", padding: 6 }}>{Ic.Image2()}</button>
                      <button onClick={() => messageInputRef.current?.focus()} className="tap" style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", padding: 6 }}>{Ic.Smile()}</button>
                      <div style={{ flex: 1 }}/>
                      <button onClick={handleSend} disabled={sending || (!messageText.trim() && !pendingImageFile)} className="tap" style={{ display: "flex", alignItems: "center", gap: 6, background: gold, color: "#080812", border: "none", borderRadius: 12, padding: "8px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: sending || (!messageText.trim() && !pendingImageFile) ? 0.5 : 1 }}>
                        {sending ? <YelenLoader size={14} color="#080812"/> : Ic.Send()} Envoyer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Pop-up de création en plein écran (header X + titre) — même
          pattern que Mes démarches (CLAUDE.md /chantier-mes-demarches). */}
      {nouvelleDemandeOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 700, background: bg, display: "flex", flexDirection: "column" }}>
          <div style={{ paddingTop: "env(safe-area-inset-top)" }}/>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${brd}` }}>
            <button onClick={() => setNouvelleDemandeOpen(false)} className="tap" style={{ background: "none", border: "none", color: t1, padding: 4, cursor: "pointer" }}>{Ic.X()}</button>
            <div style={{ color: t1, fontSize: 15, fontWeight: 800 }}>Parler au support</div>
            <div style={{ width: 30 }}/>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
            <div style={{ color: t2, fontSize: 12.5, lineHeight: 1.5, marginBottom: 22 }}>
              Écrivez-nous. Un agent Yelen vous répondra directement ici.
            </div>

            <div style={{ color: t2, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>DE QUOI AVEZ-VOUS BESOIN ?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
              {SUPPORT_CATEGORIES.map(c => {
                const active = nouvelleCategorie === c;
                return (
                  <button key={c} onClick={() => setNouvelleCategorie(c)} className="tap" style={{
                    padding: "12px", borderRadius: 12, border: active ? `2px solid ${gold}` : `1.5px solid ${brd}`,
                    background: active ? "rgba(245,166,35,0.12)" : card2, color: active ? "#c47a00" : t1,
                    fontSize: 12.5, fontWeight: 700, textAlign: "left", cursor: "pointer",
                  }}>
                    {SUPPORT_CATEGORIE_LABELS[c]}
                  </button>
                );
              })}
            </div>

            <div style={{ color: t2, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>EN QUELQUES MOTS</div>
            <input value={nouvelleSujet} onChange={e => setNouvelleSujet(e.target.value)} maxLength={150} placeholder="Dites-nous ce qui se passe…"
              style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${brd}`, background: card2, color: t1, fontSize: 13.5, outline: "none", marginBottom: 18, boxSizing: "border-box" }}/>

            <div style={{ color: t2, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>VOTRE MESSAGE</div>
            <textarea value={nouvelleMessage} onChange={e => setNouvelleMessage(e.target.value)} maxLength={4000} rows={6} placeholder="Expliquez-nous ce qui s'est passé…"
              style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${brd}`, background: card2, color: t1, fontSize: 13.5, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}/>
          </div>

          <div style={{ padding: "14px 16px", borderTop: `1px solid ${brd}`, paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
            <button onClick={creerNouveauTicket} disabled={!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim() || nouvelleEnvoi} className="tap" style={{
              width: "100%", padding: "15px", borderRadius: 14, border: "none",
              background: (!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim() || nouvelleEnvoi) ? card2 : gold,
              color: (!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim() || nouvelleEnvoi) ? t3 : "#080812",
              fontSize: 14, fontWeight: 800, cursor: (!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim() || nouvelleEnvoi) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {nouvelleEnvoi ? <YelenLoader size={16} color={isDark ? "#fff" : "#080812"}/> : "Parler au support"}
            </button>
          </div>
        </div>
      )}

      {/* Une seule conversation Yelen ouverte à la fois (retour Bryan
          07/09/2026) — s'affiche à la place du formulaire "Parler au
          support" quand ticketActif existe (attente_agent ou en_cours).
          Ton humain Yelen, jamais un message d'erreur sec (vocabulaire
          citoyen imposé en tête de fichier : jamais "ticket"/"demande"). */}
      {conversationActiveAlerteOpen && ticketActif && (
        <div onClick={() => setConversationActiveAlerteOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 650, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, width: "100%", borderTopLeftRadius: 20, borderTopRightRadius: 20, animation: "sheetUp 0.25s ease", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: brd }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${gold}1a`, display: "flex", alignItems: "center", justifyContent: "center", color: gold }}>
                {Ic.Clock()}
              </div>
            </div>
            <div style={{ padding: "12px 24px 4px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                {ticketActif.statut === "attente_agent" ? "Vous avez déjà une conversation en attente" : "Vous êtes déjà en conversation avec un agent"}
              </div>
              <div style={{ color: t2, fontSize: 13, lineHeight: 1.55, marginBottom: 22 }}>
                {ticketActif.statut === "attente_agent"
                  ? "Votre message est toujours en attente d'un agent Yelen. Inutile d'en envoyer un nouveau — il sera pris en charge dans cette même conversation dès qu'un agent sera disponible."
                  : "Un agent Yelen échange déjà avec vous. Continuez cette conversation plutôt que d'en ouvrir une nouvelle, c'est plus rapide pour vous comme pour nous."}
              </div>
            </div>
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={allerVersConversationActive} className="tap" style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: gold, color: "#080812", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Voir la conversation
              </button>
              <button onClick={() => setConversationActiveAlerteOpen(false)} className="tap" style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: card2, color: t1, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation "Terminer le chat" (brief section 3) — sheet léger,
          action irréversible mise en évidence en rouge, jamais un
          window.confirm (voir CLAUDE.md /regles-ux-ui). */}
      {confirmerFinOpen && (
        <div onClick={() => !terminerEnCours && setConfirmerFinOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 650, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, width: "100%", borderTopLeftRadius: 20, borderTopRightRadius: 20, animation: "sheetUp 0.25s ease", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: brd }}/>
            </div>
            <div style={{ padding: "10px 24px 4px", textAlign: "center" }}>
              <div style={{ color: t1, fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Terminer cette conversation ?</div>
              <div style={{ color: t2, fontSize: 13, lineHeight: 1.55, marginBottom: 22 }}>Êtes-vous sûr de vouloir terminer votre conversation avec le support Yelen ?</div>
            </div>
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => setConfirmerFinOpen(false)} disabled={terminerEnCours} className="tap" style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: card2, color: t1, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Continuer la conversation
              </button>
              <button onClick={terminerConversation} disabled={terminerEnCours} className="tap" style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#EF4444", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: terminerEnCours ? 0.7 : 1 }}>
                {terminerEnCours ? <YelenLoader size={14} color="#fff"/> : "Terminer le chat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Évaluation de fin de conversation (brief section 4-9) — s'ouvre
          automatiquement dès que ticketDetail.statut passe à 'resolu' sans
          note existante, que ce soit le citoyen ou l'agent qui ait terminé
          (voir l'effet plus haut). Dismissible par tap sur le fond
          (le citoyen n'est jamais obligé de noter, brief section 7). */}
      {evaluationOpen && (
        <div onClick={() => !evaluationEnvoi && setEvaluationOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, width: "100%", maxHeight: "88vh", borderTopLeftRadius: 20, borderTopRightRadius: 20, display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px", flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: brd }}/>
            </div>

            {evaluationEnvoyee ? (
              <div style={{ padding: "28px 24px calc(28px + env(safe-area-inset-bottom))", textAlign: "center" }}>
                <div style={{ color: t1, fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Merci pour votre avis.</div>
                <div style={{ color: t2, fontSize: 13, lineHeight: 1.55, marginBottom: 22 }}>Votre retour nous aide à améliorer l&apos;expérience Yelen.</div>
                <button onClick={() => setEvaluationOpen(false)} className="tap" style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: gold, color: "#080812", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  Terminer
                </button>
              </div>
            ) : (
              <div style={{ overflowY: "auto", padding: "6px 24px calc(20px + env(safe-area-inset-bottom))" }}>
                <div style={{ textAlign: "center", marginBottom: 18 }}>
                  <div style={{ color: t1, fontSize: 16, fontWeight: 800, lineHeight: 1.35, marginBottom: 6 }}>Comment était votre expérience avec le support Yelen ?</div>
                  <div style={{ color: t2, fontSize: 12.5, lineHeight: 1.5 }}>Votre avis nous aide à améliorer le support Yelen.</div>
                </div>

                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setEvaluationNote(n)} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} className="tap" style={{ background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex" }}>
                      {Ic.Star({ filled: n <= evaluationNote, color: gold })}
                    </button>
                  ))}
                </div>
                {evaluationNote > 0 && (
                  <div style={{ textAlign: "center", color: t1, fontSize: 13, fontWeight: 800, marginBottom: 22, animation: "fadeUp 0.2s ease" }}>
                    {SUPPORT_RATING_LABELS[evaluationNote as 1 | 2 | 3 | 4 | 5]}
                  </div>
                )}

                {evaluationNote > 0 && (
                  <div style={{ marginBottom: 20, animation: "fadeUp 0.25s ease" }}>
                    <div style={{ color: t1, fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
                      {evaluationNote >= 4 ? "Qu'avez-vous particulièrement apprécié ?" : "Que pouvons-nous améliorer ?"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(evaluationNote >= 4 ? SUPPORT_RATING_RAISONS_POSITIVES : SUPPORT_RATING_RAISONS_NEGATIVES).map(r => {
                        const active = evaluationRaisons.has(r);
                        return (
                          <button
                            key={r}
                            onClick={() => setEvaluationRaisons(prev => {
                              const next = new Set(prev);
                              if (next.has(r)) next.delete(r); else next.add(r);
                              return next;
                            })}
                            className="tap"
                            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${brd}`, background: card2, cursor: "pointer", textAlign: "left" }}
                          >
                            <span style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${active ? gold : t3}`, background: active ? gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", flexShrink: 0 }}>
                              {active && Ic.Check()}
                            </span>
                            <span style={{ color: active ? t1 : t2, fontSize: 13, fontWeight: active ? 700 : 500 }}>{SUPPORT_RATING_RAISON_LABELS[r]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {evaluationNote > 0 && (
                  <div style={{ marginBottom: 22, animation: "fadeUp 0.3s ease" }}>
                    <div style={{ color: t1, fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Un commentaire ?</div>
                    <textarea
                      value={evaluationCommentaire}
                      onChange={e => setEvaluationCommentaire(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="Dites-nous ce que vous pensez…"
                      style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${brd}`, background: card2, color: t1, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                )}

                <button onClick={envoyerEvaluation} disabled={!evaluationNote || evaluationEnvoi} className="tap" style={{
                  width: "100%", padding: "15px", borderRadius: 14, border: "none",
                  background: (!evaluationNote || evaluationEnvoi) ? card2 : gold,
                  color: (!evaluationNote || evaluationEnvoi) ? t3 : "#080812",
                  fontSize: 14, fontWeight: 800, cursor: (!evaluationNote || evaluationEnvoi) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {evaluationEnvoi ? <YelenLoader size={16} color={isDark ? "#fff" : "#080812"}/> : "Envoyer mon avis"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {historiqueOpen && (
        <div onClick={() => setHistoriqueOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: bg, width: "100%", maxHeight: "80vh", borderTopLeftRadius: 20, borderTopRightRadius: 20, display: "flex", flexDirection: "column", animation: "sheetUp 0.25s ease", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px", flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: brd }}/>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px 10px", flexShrink: 0 }}>
              <div style={{ color: t1, fontSize: 15, fontWeight: 800 }}>Historique des conversations</div>
              <button onClick={() => setHistoriqueOpen(false)} className="tap" style={{ background: card2, border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer" }}>{Ic.X()}</button>
            </div>
            <div style={{ padding: "0 16px 12px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: card2, borderRadius: 12, padding: "9px 12px" }}>
                <span style={{ display: "flex", color: t3, flexShrink: 0 }}>{Ic.Search()}</span>
                <input
                  value={historiqueSearch}
                  onChange={e => setHistoriqueSearch(e.target.value)}
                  placeholder="Rechercher un établissement…"
                  style={{ flex: 1, background: "none", border: "none", fontSize: 13 }}
                />
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {historiqueFiltree.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: t3, fontSize: 12.5 }}>Aucune conversation ne correspond à cette recherche.</div>
              ) : historiqueFiltree.map(c => (
                <div key={c.rdv_id} onClick={() => { setSelected(c); setHistoriqueOpen(false); }} className="tap" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, position: "relative", borderRadius: 12, background: card2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: t2, overflow: "hidden", flexShrink: 0 }}>
                    {c.institution_logo ? <Image src={c.institution_logo} alt={c.institution_nom} fill sizes="40px" style={{ objectFit: "cover" }}/> : getInitials(c.institution_nom)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: t1, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.institution_nom}</span>
                      {c.dernier_message_at && <span style={{ color: t3, fontSize: 10.5, flexShrink: 0 }}>{formatHeure(c.dernier_message_at)}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                      <span style={{ display: "flex", color: t3, flexShrink: 0 }}>{Ic.Lock()}</span>
                      {c.dernier_message_type === "image" && <span style={{ display: "flex", color: t3, flexShrink: 0 }}>{Ic.Image2()}</span>}
                      <span style={{ color: t3, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatApercu(c)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <button onClick={() => setLightbox(null)} className="tap" style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>{Ic.X()}</button>
          <Image src={lightbox} alt="" width={1200} height={900} style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }}/>
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 500,
          zIndex: 9500, animation: "slideUp 0.25s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
          backgroundColor: toast.type === "success" ? (isDark ? "#0F2A1A" : "#f0faf5") : (isDark ? "#2A0F0F" : "#fef2f2"),
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#22c55e" : "#ef4444",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function MessagerieCitoyenPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <YelenLoader size={32}/>
      </div>
    }>
      <MessagerieInner/>
    </Suspense>
  );
}
