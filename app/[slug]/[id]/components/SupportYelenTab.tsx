"use client";

// Écran Support Yelen institution (chantier "Support Yelen institution",
// 06/09/2026) — refonte complète sur le même système de ticketing que le
// citoyen (support_tickets/support_ticket_messages/support_ticket_events/
// support_ticket_ratings, lib/supportTickets.ts), qui avait lui-même
// remplacé l'ancienne conversation permanente le 04/09/2026. L'ancien
// modèle institution (messages_yelen_institution_conversations) reste en
// base pour l'instant, retiré séparément une fois cette bascule validée.
//
// Toujours accessible uniquement via l'icône casque du panneau header
// "Aide & ressources" (voir layout.tsx), ouvert dans un NOUVEL ONGLET
// NAVIGATEUR (/{slug}/{id}/support) — inchangé de la version précédente.
// Rendu plein écran (position fixed) au-dessus du dashboard sous-jacent de
// cet onglet navigateur.
//
// Réception live : pas de Realtime direct possible (institution = JWT
// custom, jamais de session Supabase Auth) — relais SSE serveur, voir
// app/api/institution/support/tickets/[id]/stream/route.ts, même solution
// que app/[slug]/[id]/components/MessagerieTab.tsx.
//
// Pièces jointes : pas d'envoi d'image sur les tickets support, même
// limitation que côté citoyen ("lot attachments volontairement pas
// construit", app/messagerie/citoyen/page.tsx) — pas une régression
// propre à l'institution.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { YelenLogo } from "@/components/YelenLogo";
import {
  SUPPORT_CATEGORIES_INSTITUTION, SUPPORT_CATEGORIE_INSTITUTION_LABELS,
  SUPPORT_RATING_RAISONS_POSITIVES, SUPPORT_RATING_RAISONS_NEGATIVES, SUPPORT_RATING_RAISON_LABELS, SUPPORT_RATING_LABELS,
  type SupportCategorieInstitution, type SupportStatut, type SupportRatingRaison,
} from "@/lib/supportTicketsConstants";

type TicketListItem = {
  id: string; numero_public: string; categorie: string; sujet: string;
  statut: SupportStatut; agent_nom: string | null;
  dernier_message: string | null; dernier_message_at: string | null; cree_le: string; non_lus: number;
};
type TicketMsg = { id: string; expediteur_type: "institution" | "agent"; agent_nom: string | null; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string };
type TicketRating = { note: number; raisons: string[]; commentaire: string | null; cree_le: string };
type TicketDetail = {
  id: string; numero_public: string; categorie: string; sujet: string; statut: SupportStatut;
  agent_nom: string | null; cree_le: string; assigne_le: string | null; position_file: number | null;
  resolu_par: "institution" | "agent" | "system" | null; rating: TicketRating | null;
  messages: TicketMsg[];
};

const P = { pointerEvents: "none" as const };
const Ic = {
  X:       () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Send:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Lock:    () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Clock:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  Check:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  // Badge "vérifié" — identité officielle Support Yelen (retour Bryan
  // 06/09/2026, "ajouter un badge de vérification"), jamais un emoji.
  Verified: ({ size = 13, color }: { size?: number; color: string }) => (
    <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5l2.6 1.3 2.9-.7 1 2.8 2.6 1.6-.7 2.9.7 2.9-2.6 1.6-1 2.8-2.9-.7L12 21.5l-2.6-1.3-2.9.7-1-2.8-2.6-1.6.7-2.9-.7-2.9 2.6-1.6 1-2.8 2.9.7L12 2.5z" fill={color}/>
      <path d="M8.5 12.3l2.2 2.2 4.3-4.6" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Plus:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Back:    () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Star: ({ filled, color }: { filled: boolean; color: string }) => <svg style={P} width="30" height="30" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

function estMemeJour(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function formatHeure(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function formatSeparateurJour(dateStr: string): string {
  const auj = new Date(); const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (estMemeJour(dateStr, auj.toISOString())) return "Aujourd'hui";
  if (estMemeJour(dateStr, hier.toISOString())) return "Hier";
  return new Date(dateStr).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function statutMeta(s: SupportStatut, C: ThemeTokens): { label: string; color: string; bg: string } {
  if (s === "attente_agent") return { label: "En attente d'un agent", color: C.orange, bg: C.orangeL };
  if (s === "en_cours") return { label: "En cours", color: C.blue, bg: C.blueL };
  if (s === "resolu") return { label: "Résolue", color: C.green, bg: C.greenL };
  return { label: "Clôturée", color: C.t3, bg: C.bgCard2 };
}
// Badge statut arrondi/teinté (retour Bryan 06/09/2026, "moderniser niveau
// US") — même motif que STATUT_CONFIG de app/admin/support/page.tsx
// (pastille + fond teinté), plutôt que le point + texte brut précédent.
function StatutBadge({ s, C }: { s: SupportStatut; C: ThemeTokens }) {
  const meta = statutMeta(s, C);
  // "attente_agent" en fond doré plat + texte noir, comme les boutons
  // (retour Bryan 06/09/2026, "fond jaune texte jaune n'a aucun sens") —
  // même correctif que le filtre "Toutes"/l'avatar plus tôt dans ce
  // chantier. Les autres statuts gardent le fond teinté + texte coloré
  // (contraste suffisant, pas visé par ce retour).
  if (s === "attente_agent") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.gold, color: "#000", fontSize: 10.5, fontWeight: 700, padding: "3px 9px 3px 7px", borderRadius: 20 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#000", flexShrink: 0 }}/>
        {meta.label}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: meta.bg, color: meta.color, fontSize: 10.5, fontWeight: 700, padding: "3px 9px 3px 7px", borderRadius: 20 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0 }}/>
      {meta.label}
    </span>
  );
}

// Écran d'attente avant prise en charge (miroir de SupportWaitingCard côté
// citoyen, ton plus professionnel — même mécanique de paliers dérivés
// uniquement de cree_le, jamais un minuteur local repartant de zéro).
function AttenteAgent({ depuis, positionFile, C }: { depuis: string; positionFile: number | null; C: ThemeTokens }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(depuis).getTime()) / 1000));
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - new Date(depuis).getTime()) / 1000)), 5000);
    return () => clearInterval(interval);
  }, [depuis]);
  const palier = elapsed >= 120 ? "desole" : elapsed >= 60 ? "min1" : elapsed >= 30 ? "sec30" : "initial";
  const message =
    palier === "sec30" ? "Nous recherchons actuellement un agent disponible pour vous répondre." :
    palier === "min1" ? "Merci de patienter, votre message est toujours en attente de prise en charge." :
    palier === "desole" ? "Nous sommes désolés pour cette attente — un agent va prendre votre demande en charge dès que possible." :
    null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "28px 24px", margin: "8px 0", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 16 }}>
      {/* Carte d'identité "Vous contactez Yelen" (retour Bryan 06/09/2026) —
          même illustration humaine réelle que côté citoyen
          (SupportWaitingCard, app/messagerie/citoyen/page.tsx), remise en
          place le 07/09/2026 (retour Bryan : garder l'illustration humaine
          précédente plutôt que le badge logo seul). */}
      <div className="support-agent-illustration" style={{ width: 110, flexShrink: 0 }}>
        <Image src="/illustrations/support-agent-yelen.png" alt="Un agent Yelen" width={1312} height={1199} style={{ width: "100%", height: "auto", display: "block" }}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ color: C.t1, fontSize: 14.5, fontWeight: 800 }}>Vous contactez Yelen</span>
          {Ic.Verified({ size: 13, color: C.gold })}
        </div>
        <div style={{ color: C.t3, fontSize: 10.5, fontWeight: 600, marginBottom: 10 }}>Support officiel Yelen224 — assistance 100% humaine, sans intelligence artificielle.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <YelenLoader size={18}/>
          <div style={{ color: C.t1, fontSize: 13, fontWeight: 700 }}>En attente d&apos;un agent Yelen…</div>
        </div>
        {message && <div key={message} style={{ color: C.t3, fontSize: 11.5, lineHeight: 1.5, marginBottom: 8 }}>{message}</div>}
        {/* Position réelle uniquement (retour Bryan 06/09/2026, "ne jamais
            afficher une position ou estimation fictive") — pas de temps
            d'attente estimé : aucune moyenne historique fiable n'existe
            encore (système trop récent, volume trop faible pour être
            honnête sur une estimation en minutes). */}
        {positionFile != null && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.gold, borderRadius: 8, padding: "5px 10px" }}>
            <span style={{ color: "#000", fontSize: 11.5, fontWeight: 800 }}>Position dans la file : #{positionFile}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SupportYelenTab({ onClose, onToast, onRead, instName, instLogo }: { onClose: () => void; onToast: (msg: string, color?: string) => void; onRead?: () => void; instName?: string | null; instLogo?: string | null }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [nouvelleDemandeOpen, setNouvelleDemandeOpen] = useState(false);
  const [nouvelleCategorie, setNouvelleCategorie] = useState<SupportCategorieInstitution | null>(null);
  const [nouvelleSujet, setNouvelleSujet] = useState("");
  const [nouvelleMessage, setNouvelleMessage] = useState("");
  const [nouvelleEnvoi, setNouvelleEnvoi] = useState(false);

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
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadTickets = useCallback(async (silencieux = false) => {
    if (!silencieux) setTicketsLoading(true);
    try {
      const res = await fetch("/api/institution/support/tickets");
      const j = await res.json().catch(() => null);
      if (res.ok) setTickets(j?.tickets ?? []);
      onRead?.();
    } catch {
      if (!silencieux) onToast("Impossible de charger vos conversations.", C.red);
    } finally {
      if (!silencieux) setTicketsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = useCallback(async (id: string, silencieux = false) => {
    if (!silencieux) setDetailLoading(true);
    try {
      const res = await fetch(`/api/institution/support/tickets/${id}`);
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setDetail(j?.ticket ?? null);
        setTickets(prev => prev.map(t => t.id === id ? { ...t, non_lus: 0 } : t));
      } else if (!silencieux) {
        onToast("Cette conversation est introuvable.", C.red);
      }
    } catch {
      if (!silencieux) onToast("Impossible de charger cette conversation.", C.red);
    } finally {
      if (!silencieux) setDetailLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedId) loadDetail(selectedId, true);
      else loadTickets(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [selectedId, loadTickets, loadDetail]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Réception live du ticket ouvert (voir en-tête de fichier) — filet de
  // sécurité 20s ci-dessus en plus, au cas où la connexion SSE serait coupée.
  useEffect(() => {
    if (!selectedId) return;
    const es = new EventSource(`/api/institution/support/tickets/${selectedId}/stream`);
    es.addEventListener("changed", () => { loadDetail(selectedId, true); loadTickets(true); });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [detail?.messages]);

  useEffect(() => {
    if (!detail || detail.statut !== "resolu" || detail.rating) return;
    if (evaluationPromptedIdsRef.current.has(detail.id)) return;
    evaluationPromptedIdsRef.current.add(detail.id);
    setEvaluationNote(0); setEvaluationRaisons(new Set()); setEvaluationCommentaire(""); setEvaluationEnvoyee(false);
    setEvaluationOpen(true);
  }, [detail?.id, detail?.statut, detail?.rating]);

  async function creerNouveauTicket() {
    if (!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim() || nouvelleEnvoi) return;
    setNouvelleEnvoi(true);
    try {
      const res = await fetch("/api/institution/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorie: nouvelleCategorie, sujet: nouvelleSujet.trim(), message: nouvelleMessage.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { onToast(j?.error || "Envoi impossible.", C.red); return; }
      setNouvelleDemandeOpen(false);
      setNouvelleCategorie(null); setNouvelleSujet(""); setNouvelleMessage("");
      await loadTickets(true);
      setSelectedId(j.id);
    } catch {
      onToast("Envoi impossible.", C.red);
    } finally {
      setNouvelleEnvoi(false);
    }
  }

  async function handleSend() {
    if (!selectedId || sending) return;
    const texte = messageText.trim();
    if (!texte) return;
    setSending(true);
    try {
      const res = await fetch(`/api/institution/support/tickets/${selectedId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texte }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "Erreur d'envoi.");
      setMessageText("");
      await loadDetail(selectedId, true);
      await loadTickets(true);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Erreur d'envoi. Réessayez.", C.red);
    } finally {
      setSending(false);
    }
  }

  async function terminerConversation() {
    if (!selectedId || terminerEnCours) return;
    setTerminerEnCours(true);
    try {
      const res = await fetch(`/api/institution/support/tickets/${selectedId}/terminer`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) { onToast(j?.error || "Impossible de terminer la conversation.", C.red); return; }
      setConfirmerFinOpen(false);
      await loadDetail(selectedId);
      await loadTickets(true);
    } catch {
      onToast("Impossible de terminer la conversation.", C.red);
    } finally {
      setTerminerEnCours(false);
    }
  }

  async function envoyerEvaluation() {
    if (!selectedId || !evaluationNote || evaluationEnvoi) return;
    setEvaluationEnvoi(true);
    try {
      const res = await fetch(`/api/institution/support/tickets/${selectedId}/evaluation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: evaluationNote, raisons: [...evaluationRaisons], commentaire: evaluationCommentaire.trim() || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { onToast(j?.error || "Envoi impossible.", C.red); return; }
      setEvaluationEnvoyee(true);
      loadDetail(selectedId, true);
    } catch {
      onToast("Envoi impossible.", C.red);
    } finally {
      setEvaluationEnvoi(false);
    }
  }

  const enAttente = detail?.statut === "attente_agent";
  const enCours = detail?.statut === "en_cours";
  const termine = detail?.statut === "resolu" || detail?.statut === "cloture";
  const nonLusTotal = tickets.reduce((s, t) => s + t.non_lus, 0);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: C.bg, display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease" }}>
      <style>{`
        .support-pane{display:none;min-height:0}
        .support-pane-on{display:flex}
        @media (min-width:860px){
          .support-pane{display:flex !important}
          .support-body{flex-direction:row !important}
          .support-list-pane{width:320px;flex-shrink:0;border-right:1px solid ${C.border}}
        }
        @keyframes support-agent-wave{0%,80%,100%{transform:rotate(0deg)}85%{transform:rotate(-4deg)}90%{transform:rotate(3deg)}95%{transform:rotate(-2deg)}}
        @media (prefers-reduced-motion: no-preference){
          .support-agent-illustration{animation:support-agent-wave 4s ease-in-out infinite;transform-origin:65% 95%}
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {/* Identité = le logo officiel Yelen, jamais le casque (retour Bryan
            06/09/2026, "ne jamais utiliser le casque comme identité du
            support" — le casque reste réservé aux icônes d'action/catégorie
            ailleurs). */}
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", flexShrink: 0 }}>
          <YelenLogo size={19} color="#000" strokeWidth={2.3}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.t1, fontSize: 14.5, fontWeight: 800 }}>Support Yelen</span>
            {Ic.Verified({ size: 13, color: C.gold })}
          </div>
          <div style={{ color: C.t3, fontSize: 11, fontWeight: 600, marginTop: 1 }}>Yelen224 · Support officiel · {tickets.length} conversation{tickets.length > 1 ? "s" : ""} · {nonLusTotal} non lue{nonLusTotal > 1 ? "s" : ""}</div>
        </div>
        {/* Identification de l'établissement : cet écran appartient au
            dashboard de l'institution, pas à Yelen elle-même (retour Bryan
            06/09/2026, "ses sont ecrant et non celle de yelen") — jamais
            laisser croire que Support Yelen = l'espace de l'institution. */}
        {instName && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 20, background: C.bgCard2, border: `1px solid ${C.border}`, flexShrink: 0, maxWidth: 200 }} title={`Espace ${instName}`}>
            {instLogo ? (
              <div style={{ position: "relative", width: 20, height: 20, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}><Image src={instLogo} alt="" fill sizes="20px" style={{ objectFit: "cover" }}/></div>
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: 6, background: C.bg3, flexShrink: 0 }}/>
            )}
            <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</span>
          </div>
        )}
        <button onClick={onClose} className="tap" style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer", flexShrink: 0 }}>{Ic.X()}</button>
      </div>

      <div className="support-body" style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <div className={`support-pane support-list-pane ${!selectedId ? "support-pane-on" : ""}`} style={{ flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: 16, flexShrink: 0 }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth icon={Ic.Plus()} onClick={() => setNouvelleDemandeOpen(true)}>
              Nouvelle demande
            </Button>
          </div>
          {ticketsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={22}/></div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 20px", color: C.t3, fontSize: 12.5, lineHeight: 1.6 }}>Besoin d&apos;aide ? Écrivez directement à l&apos;équipe Yelen — un agent vous répondra ici.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 12px 12px" }}>
              {tickets.map(t => {
                const active = selectedId === t.id;
                return (
                  <div key={t.id} onClick={() => setSelectedId(t.id)} className="tap" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 12, border: `1px solid ${active ? C.gold + "50" : C.border}`, background: active ? `${C.gold}0d` : C.bgCard, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <span style={{ color: C.t1, fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>Support Yelen</span>
                        {Ic.Verified({ size: 11, color: C.gold })}
                      </div>
                      {t.dernier_message_at && <span style={{ color: C.t3, fontSize: 10.5, flexShrink: 0 }}>{formatHeure(t.dernier_message_at)}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatutBadge s={t.statut} C={C}/>
                      {t.non_lus > 0 && <span style={{ background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{t.non_lus}</span>}
                    </div>
                    <div style={{ color: t.non_lus > 0 ? C.t2 : C.t3, fontSize: 11.5, fontWeight: t.non_lus > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.dernier_message ?? t.sujet}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`support-pane support-detail-pane ${(selectedId || nouvelleDemandeOpen) ? "support-pane-on" : ""}`} style={{ flexDirection: "column", flex: 1, minHeight: 0 }}>
          {nouvelleDemandeOpen ? (
            // Vue à droite plutôt qu'un popup plein écran (retour Bryan
            // 06/09/2026, "ce dashboard est pur PC, pas de mobile") — la
            // liste reste visible à gauche, jamais masquée.
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <button onClick={() => setNouvelleDemandeOpen(false)} className="tap" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 0, display: "flex" }}>{Ic.Back()}</button>
                <div style={{ color: C.t1, fontSize: 13.5, fontWeight: 800 }}>Parler au support</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                <div style={{ color: C.t2, fontSize: 12.5, lineHeight: 1.5, marginBottom: 22 }}>Écrivez-nous. Un agent Yelen vous répondra directement ici.</div>
                <div style={{ color: C.t2, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>DE QUOI AVEZ-VOUS BESOIN ?</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
                  {SUPPORT_CATEGORIES_INSTITUTION.map(c => {
                    const active = nouvelleCategorie === c;
                    return (
                      <button key={c} onClick={() => setNouvelleCategorie(c)} className="tap" style={{ padding: 12, borderRadius: 12, border: active ? `2px solid ${C.gold}` : `1.5px solid ${C.border}`, background: active ? `${C.gold}1a` : C.bgCard2, color: active ? C.gold : C.t1, fontSize: 12.5, fontWeight: 700, textAlign: "left", cursor: "pointer" }}>
                        {SUPPORT_CATEGORIE_INSTITUTION_LABELS[c]}
                      </button>
                    );
                  })}
                </div>
                <div style={{ color: C.t2, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>EN QUELQUES MOTS</div>
                <input value={nouvelleSujet} onChange={e => setNouvelleSujet(e.target.value)} maxLength={150} placeholder="Sujet de votre demande…"
                  style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.bgCard2, color: C.t1, fontSize: 13.5, outline: "none", marginBottom: 18, boxSizing: "border-box" }}/>
                <div style={{ color: C.t2, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>VOTRE MESSAGE</div>
                <textarea value={nouvelleMessage} onChange={e => setNouvelleMessage(e.target.value)} maxLength={4000} rows={6} placeholder="Expliquez-nous ce qui se passe…"
                  style={{ width: "100%", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.bgCard2, color: C.t1, fontSize: 13.5, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}/>
              </div>
              <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth loading={nouvelleEnvoi} disabled={!nouvelleCategorie || !nouvelleSujet.trim() || !nouvelleMessage.trim()} onClick={creerNouveauTicket}>
                  Envoyer
                </Button>
              </div>
            </>
          ) : !selectedId ? (
            // Illustration réelle (retour Bryan 07/09/2026) plutôt qu'un
            // simple texte centré — même principe que les cartes
            // AttenteAgent/"Conversation terminée".
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
              <div style={{ width: 210, borderRadius: 20, overflow: "hidden", marginBottom: 20, border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/support-empty-state.png" alt="Le Support Yelen vous accueille" width={960} height={1086} style={{ width: "100%", height: "auto", display: "block" }}/>
              </div>
              <div style={{ color: C.t1, fontSize: 14.5, fontWeight: 800, marginBottom: 4 }}>Votre conversation avec Yelen</div>
              <div style={{ color: C.t3, fontSize: 12.5, maxWidth: 300, lineHeight: 1.5 }}>Sélectionnez une conversation pour échanger avec notre équipe Support, ou démarrez-en une nouvelle.</div>
            </div>
          ) : detailLoading || !detail ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={26}/></div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <button onClick={() => setSelectedId(null)} className="tap" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 0, display: "flex" }}>{Ic.Back()}</button>
                {/* Identité toujours visible dans l'avatar : initiales de
                    l'agent réel une fois assigné, sinon le logo Yelen — ne
                    jamais laisser un emplacement d'identité vide (retour
                    Bryan 06/09/2026). */}
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#000", fontSize: 11, fontWeight: 800 }} title={detail.agent_nom ?? "Support Yelen"}>
                  {detail.agent_nom ? detail.agent_nom.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") : <YelenLogo size={15} color="#000" strokeWidth={2.4}/>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ color: C.t3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Conversation avec Yelen · Support officiel</span>
                    {Ic.Verified({ size: 10, color: C.gold })}
                  </div>
                  <div style={{ color: C.t1, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail.sujet}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    <StatutBadge s={detail.statut} C={C}/>
                    <span style={{ color: C.t3, fontSize: 10.5 }}>Demande {detail.numero_public}</span>
                    <span style={{ color: C.t3, fontSize: 10.5 }}>· {formatHeure(detail.cree_le)}</span>
                    {detail.agent_nom && <span style={{ color: C.t3, fontSize: 10.5 }}>· {detail.agent_nom}</span>}
                  </div>
                </div>
                {(enAttente || enCours) && (
                  <button onClick={() => setConfirmerFinOpen(true)} className="tap" style={{ background: "none", border: "none", color: C.t2, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>Terminer</button>
                )}
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px 8px", display: "flex", flexDirection: "column" }}>
                {/* Timeline système discrète (retour Bryan 06/09/2026) — deux
                    premières lignes ancrées sur le même horodatage réel
                    (cree_le, un seul événement réel : la création du
                    ticket) ; "Agent assigné" seulement si assigne_le est
                    réellement rempli, jamais une estimation. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 4px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.t3, flexShrink: 0 }}/>
                    <span style={{ color: C.t3, fontSize: 10.5 }}>{formatHeure(detail.cree_le)} · Demande créée</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.t3, flexShrink: 0 }}/>
                    <span style={{ color: C.t3, fontSize: 10.5 }}>{formatHeure(detail.cree_le)} · Demande envoyée au Support Yelen</span>
                  </div>
                  {detail.assigne_le && (
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, flexShrink: 0 }}/>
                      <span style={{ color: C.t2, fontSize: 10.5, fontWeight: 600 }}>{formatHeure(detail.assigne_le)} · Agent Yelen assigné{detail.agent_nom ? ` (${detail.agent_nom})` : ""}</span>
                    </div>
                  )}
                </div>

                {/* Carte système "demande reçue" — une fois, tant qu'aucun
                    agent n'a encore répondu. */}
                {enAttente && !detail.messages.some(m => m.expediteur_type === "agent") && (
                  <div style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                      <span style={{ color: C.green, display: "flex" }}>{Ic.Check()}</span>
                      <span style={{ color: C.t1, fontSize: 12.5, fontWeight: 800 }}>Votre demande a bien été reçue</span>
                    </div>
                    <div style={{ color: C.t3, fontSize: 11.5, lineHeight: 1.5 }}>Votre demande a été transmise à l&apos;équipe Support Yelen. Un agent la prendra en charge dès qu&apos;il sera disponible.</div>
                  </div>
                )}

                {detail.messages.length === 0 && !enAttente ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: C.t3, fontSize: 12.5 }}>Aucun message pour l&apos;instant.</div>
                ) : detail.messages.map((m, i) => {
                  const prev = detail.messages[i - 1];
                  const showSeparateur = !prev || !estMemeJour(prev.cree_le, m.cree_le);
                  const mine = m.expediteur_type === "institution";
                  return (
                    <div key={m.id}>
                      {showSeparateur && (
                        <div style={{ textAlign: "center", margin: "16px 0 12px" }}>
                          <span style={{ color: C.t3, fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" }}>{formatSeparateurJour(m.cree_le)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 14 }}>
                        {!mine && <span style={{ color: C.t3, fontSize: 10, fontWeight: 700, marginBottom: 3, marginLeft: 2 }}>{m.agent_nom ?? "Agent Yelen"} · Agent Support Yelen</span>}
                        <div style={{ maxWidth: "min(74%, 460px)", background: mine ? C.bg3 : C.bgCard2, borderRadius: 14, padding: "9px 13px" }}>
                          {m.contenu && <div style={{ color: C.t1, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.contenu}</div>}
                        </div>
                        <span style={{ color: C.t3, fontSize: 10, marginTop: 4, padding: "0 2px" }}>{formatHeure(m.cree_le)}</span>
                      </div>
                    </div>
                  );
                })}
                {enAttente && <AttenteAgent depuis={detail.cree_le} positionFile={detail.position_file} C={C}/>}
                {termine && (
                  // Illustration réelle (agent Yelen qui salue), retour Bryan
                  // 07/09/2026 — même mise en page que la carte d'attente
                  // (AttenteAgent), illustration à gauche + message à droite,
                  // plutôt qu'un simple texte centré. Cadre arrondi (plutôt
                  // qu'un cutout flottant comme AttenteAgent) : cette
                  // illustration a son propre fond bokeh, pas un fond
                  // transparent.
                  <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 24px", margin: "8px 0", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 16 }}>
                    <div style={{ width: 96, height: 101, borderRadius: 14, overflow: "hidden", flexShrink: 0, border: `1px solid ${C.border}` }}>
                      <Image src="/illustrations/support-agent-yelen-au-revoir.png" alt="Un agent Yelen vous salue" width={922} height={973} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ color: C.t1, fontSize: 14, fontWeight: 800 }}>Conversation terminée</span>
                        {Ic.Verified({ size: 12, color: C.gold })}
                      </div>
                      <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
                        {detail.resolu_par === "institution" ? "Vous avez terminé cette conversation."
                          : detail.resolu_par === "agent" ? "Cette conversation a été terminée par le support Yelen."
                          : "Cette conversation est terminée."}
                      </div>
                      <div style={{ color: C.t3, fontSize: 11, lineHeight: 1.5 }}>Merci d&apos;avoir contacté le Support Yelen — une équipe 100% humaine, toujours là si vous avez encore besoin d&apos;aide.</div>
                    </div>
                  </div>
                )}
              </div>

              {termine ? (
                <div style={{ padding: "12px 16px", flexShrink: 0, textAlign: "center" }}>
                  <div style={{ color: C.t3, fontSize: 11.5, marginBottom: 8 }}>Démarrez une nouvelle conversation si vous avez encore besoin d&apos;aide.</div>
                  <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" onClick={() => setNouvelleDemandeOpen(true)}>Nouvelle demande</Button>
                </div>
              ) : (
                <div style={{ padding: "8px 16px 14px", flexShrink: 0 }}>
                  {/* Composer actif pendant l'attente aussi (retour Bryan
                      06/09/2026, "ajouter des informations sans attendre
                      l'agent") — jamais bloqué avant la prise en charge. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.bgCard2, borderRadius: 22, padding: "4px 6px 4px 14px" }}>
                    <input
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                      placeholder="Écrire un message…"
                      style={{ flex: 1, background: "none", border: "none", padding: "8px 0", fontSize: 13, color: C.t1, outline: "none" }}
                    />
                    <button onClick={handleSend} disabled={sending || !messageText.trim()} className="tap" style={{ background: C.gold, color: "#080812", border: "none", borderRadius: "50%", width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: sending || !messageText.trim() ? 0.5 : 1 }}>
                      {sending ? <YelenLoader size={13} color="#080812"/> : Ic.Send()}
                    </button>
                  </div>
                  {enAttente && (
                    <div style={{ color: C.t3, fontSize: 10.5, textAlign: "center", marginTop: 7 }}>Vous pouvez ajouter des informations à votre demande pendant l&apos;attente.</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmation "Terminer" — jamais un window.confirm */}
      {confirmerFinOpen && (
        <div onClick={() => !terminerEnCours && setConfirmerFinOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, borderRadius: 18, padding: 24, maxWidth: 380, width: "100%" }}>
            <div style={{ color: C.t1, fontSize: 15.5, fontWeight: 800, marginBottom: 8, textAlign: "center" }}>Terminer cette conversation ?</div>
            <div style={{ color: C.t2, fontSize: 12.5, lineHeight: 1.55, marginBottom: 20, textAlign: "center" }}>Une nouvelle demande devra être ouverte si vous avez encore besoin d&apos;aide.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth disabled={terminerEnCours} onClick={() => setConfirmerFinOpen(false)}>Continuer la conversation</Button>
              <Button tokens={toUiTokens(C)} className="tap" variant="danger" size="md" fullWidth loading={terminerEnCours} onClick={terminerConversation}>Terminer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Évaluation de fin de conversation */}
      {evaluationOpen && (
        <div onClick={() => !evaluationEnvoi && setEvaluationOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, borderRadius: 18, padding: 24, maxWidth: 440, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            {evaluationEnvoyee ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: C.t1, fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Merci pour votre avis.</div>
                <div style={{ color: C.t2, fontSize: 12.5, lineHeight: 1.55, marginBottom: 20 }}>Votre retour nous aide à améliorer le support Yelen.</div>
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={() => setEvaluationOpen(false)}>Fermer</Button>
              </div>
            ) : (
              <>
                <div style={{ textAlign: "center", marginBottom: 18 }}>
                  <div style={{ color: C.t1, fontSize: 15, fontWeight: 800, lineHeight: 1.35, marginBottom: 6 }}>Comment était votre expérience avec le support Yelen ?</div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setEvaluationNote(n)} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} className="tap" style={{ background: "none", border: "none", padding: 4, cursor: "pointer", display: "flex" }}>
                      {Ic.Star({ filled: n <= evaluationNote, color: C.gold })}
                    </button>
                  ))}
                </div>
                {evaluationNote > 0 && <div style={{ textAlign: "center", color: C.t1, fontSize: 12.5, fontWeight: 800, marginBottom: 20 }}>{SUPPORT_RATING_LABELS[evaluationNote as 1 | 2 | 3 | 4 | 5]}</div>}
                {evaluationNote > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ color: C.t1, fontSize: 12.5, fontWeight: 800, marginBottom: 10 }}>{evaluationNote >= 4 ? "Qu'avez-vous particulièrement apprécié ?" : "Que pouvons-nous améliorer ?"}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {(evaluationNote >= 4 ? SUPPORT_RATING_RAISONS_POSITIVES : SUPPORT_RATING_RAISONS_NEGATIVES).map(r => {
                        const active = evaluationRaisons.has(r);
                        return (
                          <button key={r} onClick={() => setEvaluationRaisons(prev => { const next = new Set(prev); if (next.has(r)) next.delete(r); else next.add(r); return next; })} className="tap" style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bgCard2, cursor: "pointer", textAlign: "left" }}>
                            <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${active ? C.gold : C.t3}`, background: active ? C.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#080812", flexShrink: 0 }}>{active && Ic.Check()}</span>
                            <span style={{ color: active ? C.t1 : C.t2, fontSize: 12.5, fontWeight: active ? 700 : 500 }}>{SUPPORT_RATING_RAISON_LABELS[r]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {evaluationNote > 0 && (
                  <textarea value={evaluationCommentaire} onChange={e => setEvaluationCommentaire(e.target.value)} maxLength={2000} rows={3} placeholder="Un commentaire ?"
                    style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bgCard2, color: C.t1, fontSize: 12.5, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 18 }}/>
                )}
                <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth loading={evaluationEnvoi} disabled={!evaluationNote} onClick={envoyerEvaluation}>Envoyer mon avis</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
