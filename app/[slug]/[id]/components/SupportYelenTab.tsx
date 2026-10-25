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
//
// Refonte visuelle 24/10/2026 (frontend uniquement) : briques d'affichage dans
// SupportYelenUi.tsx ; ici ne restent que l'état, les appels API, le SSE et le
// polling, inchangés.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { YelenLogo } from "@/components/YelenLogo";
import {
  SUPPORT_RATING_RAISONS_POSITIVES, SUPPORT_RATING_RAISONS_NEGATIVES, SUPPORT_RATING_RAISON_LABELS, SUPPORT_RATING_LABELS,
  type SupportCategorieInstitution, type SupportRatingRaison,
} from "@/lib/supportTicketsConstants";
import {
  AttenteAgent, BlocEtat, CategorieRadioGroup, Composer, EvenementSysteme, FilSkeleton, Ic, ListeSkeleton,
  MessagesAvecSeparateurs, StatutTexte, SupportStyles, TicketRow, Chip, dateHeureCourte, pluriel,
  type TicketDetail, type TicketListItem,
} from "./SupportYelenUi";

const SUJET_MAX = 150;
const MESSAGE_MAX = 4000;

export function SupportYelenTab({ onClose, onToast, onRead, instName, instLogo }: { onClose: () => void; onToast: (msg: string, color?: string) => void; onRead?: () => void; instName?: string | null; instLogo?: string | null }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsErreur, setTicketsErreur] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErreur, setDetailErreur] = useState(false);

  const [nouvelleDemandeOpen, setNouvelleDemandeOpen] = useState(false);
  const [nouvelleCategorie, setNouvelleCategorie] = useState<SupportCategorieInstitution | null>(null);
  const [nouvelleSujet, setNouvelleSujet] = useState("");
  const [nouvelleMessage, setNouvelleMessage] = useState("");
  const [nouvelleEnvoi, setNouvelleEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [touche, setTouche] = useState({ categorie: false, sujet: false, message: false });

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
    if (!silencieux) { setTicketsLoading(true); setTicketsErreur(false); }
    try {
      const res = await fetch("/api/institution/support/tickets");
      const j = await res.json().catch(() => null);
      if (res.ok) setTickets(j?.tickets ?? []);
      else if (!silencieux) setTicketsErreur(true);
      onRead?.();
    } catch {
      if (!silencieux) { setTicketsErreur(true); onToast("Impossible de charger vos conversations.", C.red); }
    } finally {
      if (!silencieux) setTicketsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = useCallback(async (id: string, silencieux = false) => {
    if (!silencieux) { setDetailLoading(true); setDetailErreur(false); }
    try {
      const res = await fetch(`/api/institution/support/tickets/${id}`);
      const j = await res.json().catch(() => null);
      if (res.ok) {
        setDetail(j?.ticket ?? null);
        setTickets(prev => prev.map(t => t.id === id ? { ...t, non_lus: 0 } : t));
      } else if (!silencieux) {
        setDetailErreur(true);
        onToast("Cette conversation est introuvable.", C.red);
      }
    } catch {
      if (!silencieux) { setDetailErreur(true); onToast("Impossible de charger cette conversation.", C.red); }
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
    setErreurEnvoi(null);
    try {
      const res = await fetch("/api/institution/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorie: nouvelleCategorie, sujet: nouvelleSujet.trim(), message: nouvelleMessage.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setErreurEnvoi(j?.error || "Envoi impossible."); return; }
      setNouvelleDemandeOpen(false);
      setNouvelleCategorie(null); setNouvelleSujet(""); setNouvelleMessage("");
      setTouche({ categorie: false, sujet: false, message: false });
      await loadTickets(true);
      setSelectedId(j.id);
    } catch {
      setErreurEnvoi("Envoi impossible. Vérifiez votre connexion.");
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

  const ui = toUiTokens(C);
  const enAttente = detail?.statut === "attente_agent";
  const enCours = detail?.statut === "en_cours";
  const termine = detail?.statut === "resolu" || detail?.statut === "cloture";
  const nonLusTotal = tickets.reduce((s, t) => s + t.non_lus, 0);
  const ticketsTermines = tickets.filter(t => t.statut === "resolu" || t.statut === "cloture");
  const ticketsActifs = tickets.filter(t => t.statut !== "resolu" && t.statut !== "cloture");

  const erreurCategorie = touche.categorie && !nouvelleCategorie ? "Choisissez une catégorie." : null;
  const erreurSujet = touche.sujet && !nouvelleSujet.trim() ? "Indiquez le sujet de votre demande." : null;
  const erreurMessage = touche.message && !nouvelleMessage.trim() ? "Écrivez votre message." : null;
  const formulaireValide = !!nouvelleCategorie && !!nouvelleSujet.trim() && !!nouvelleMessage.trim();

  const labelStyle = { display: "block", color: C.t1, fontSize: 13, fontWeight: 600, marginBottom: 6 } as const;
  const champStyle = { width: "100%", padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.border2}`, background: C.bgCard2, color: C.t1, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" } as const;
  const erreurStyle = { color: C.red, fontSize: 12, marginTop: 6 } as const;

  function renderGroupe(titre: string, liste: TicketListItem[]) {
    if (liste.length === 0) return null;
    return (
      <section aria-label={titre} style={{ padding: "0 12px 12px" }}>
        <h2 style={{ color: C.t2, fontSize: 12, fontWeight: 700, margin: "4px 4px 8px" }}>{titre} · {liste.length}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {liste.map(t => <TicketRow key={t.id} t={t} active={selectedId === t.id} onSelect={() => setSelectedId(t.id)} C={C}/>)}
        </div>
      </section>
    );
  }

  return (
    <div className="support-root" style={{ position: "fixed", inset: 0, zIndex: 1200, background: C.bg, display: "flex", flexDirection: "column" }}>
      <SupportStyles C={C}/>

      <div style={{ borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div className="support-inner" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
          {/* Identité = le logo officiel Yelen, jamais le casque (retour Bryan
              06/09/2026, "ne jamais utiliser le casque comme identité du
              support" — le casque reste réservé aux icônes d'action/catégorie
              ailleurs). */}
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", flexShrink: 0 }}>
            <YelenLogo size={19} color="#000" strokeWidth={2.3}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <h1 style={{ color: C.t1, fontSize: 16, fontWeight: 700, margin: 0 }}>Support Yelen</h1>
              <Ic.Verified size={14} color={C.gold}/>
            </div>
            <div style={{ color: C.t2, fontSize: 12, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
              Yelen224 · Support officiel · {pluriel(tickets.length, "conversation", "conversations")} · {pluriel(nonLusTotal, "non lue", "non lues")}
            </div>
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
              <span style={{ color: C.t2, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instName}</span>
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Fermer le support" className="tap yelen-focus-ring support-ico" style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer", flexShrink: 0 }}><Ic.X/></button>
        </div>
      </div>

      <div className="support-inner support-body" style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <div className={`support-pane support-list-pane ${(!selectedId && !nouvelleDemandeOpen) ? "support-pane-on" : ""}`} style={{ flexDirection: "column", overflowY: "auto", flex: 1 }}>
          <div style={{ padding: 16, flexShrink: 0 }}>
            <Button tokens={ui} className="tap support-tap" variant="primary" size="md" fullWidth icon={<Ic.Plus/>} onClick={() => setNouvelleDemandeOpen(true)}>
              Nouvelle demande
            </Button>
          </div>
          {ticketsLoading ? (
            <ListeSkeleton/>
          ) : ticketsErreur && tickets.length === 0 ? (
            <BlocEtat C={C} titre="Support indisponible" texte="Vos demandes n'ont pas pu être chargées."
              action={<Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => loadTickets()}>Réessayer</Button>}/>
          ) : tickets.length === 0 ? (
            <BlocEtat C={C} titre="Aucune demande" texte="Besoin d'aide ? Écrivez directement à l'équipe Yelen — un agent vous répondra ici."/>
          ) : (
            <>
              {renderGroupe("En cours", ticketsActifs)}
              {renderGroupe("Terminées", ticketsTermines)}
            </>
          )}
        </div>

        <div className={`support-pane support-detail-pane ${(selectedId || nouvelleDemandeOpen) ? "support-pane-on" : ""}`} style={{ flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}>
          {nouvelleDemandeOpen ? (
            // Vue à droite plutôt qu'un popup plein écran (retour Bryan
            // 06/09/2026, "ce dashboard est pur PC, pas de mobile") — la
            // liste reste visible à gauche, jamais masquée.
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <button type="button" onClick={() => setNouvelleDemandeOpen(false)} aria-label="Retour" className="tap yelen-focus-ring support-ico" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><Ic.Back/></button>
                <h2 style={{ color: C.t1, fontSize: 14, fontWeight: 700, margin: 0 }}>Parler au support</h2>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
                <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                  <p style={{ color: C.t2, fontSize: 13, lineHeight: 1.5, margin: "0 0 22px" }}>Écrivez-nous. Un agent Yelen vous répondra ici.</p>

                  <div id="support-cat-label" style={{ ...labelStyle, marginBottom: 10 }}>De quoi avez-vous besoin ?</div>
                  <div onClick={() => setTouche(p => ({ ...p, categorie: true }))}>
                    <CategorieRadioGroup value={nouvelleCategorie} onChange={c => { setNouvelleCategorie(c); setTouche(p => ({ ...p, categorie: true })); }} C={C} describedBy={erreurCategorie ? "support-cat-err" : undefined}/>
                  </div>
                  {erreurCategorie && <div id="support-cat-err" role="alert" style={erreurStyle}>{erreurCategorie}</div>}

                  <div style={{ marginTop: 22 }}>
                    <label htmlFor="support-sujet" style={labelStyle}>En quelques mots</label>
                    <input id="support-sujet" name="support-sujet" autoComplete="off" value={nouvelleSujet} onChange={e => setNouvelleSujet(e.target.value)}
                      onBlur={() => setTouche(p => ({ ...p, sujet: true }))} maxLength={SUJET_MAX} placeholder="Sujet de votre demande…"
                      aria-invalid={!!erreurSujet} aria-describedby={erreurSujet ? "support-sujet-err" : undefined}
                      className="support-field" style={{ ...champStyle, borderColor: erreurSujet ? C.red : C.border2 }}/>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      {erreurSujet ? <div id="support-sujet-err" role="alert" style={erreurStyle}>{erreurSujet}</div> : <span/>}
                      <span style={{ color: C.t2, fontSize: 12, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{nouvelleSujet.length}/{SUJET_MAX}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <label htmlFor="support-message" style={labelStyle}>Votre message</label>
                    <textarea id="support-message" name="support-message" autoComplete="off" value={nouvelleMessage} onChange={e => setNouvelleMessage(e.target.value)}
                      onBlur={() => setTouche(p => ({ ...p, message: true }))} maxLength={MESSAGE_MAX} rows={7} placeholder="Expliquez-nous ce qui se passe…"
                      aria-invalid={!!erreurMessage} aria-describedby={erreurMessage ? "support-message-err" : undefined}
                      className="support-field" style={{ ...champStyle, resize: "vertical", lineHeight: 1.55, borderColor: erreurMessage ? C.red : C.border2 }}/>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      {erreurMessage ? <div id="support-message-err" role="alert" style={erreurStyle}>{erreurMessage}</div> : <span/>}
                      <span style={{ color: C.t2, fontSize: 12, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{nouvelleMessage.length}/{MESSAGE_MAX}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                  {erreurEnvoi && (
                    <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: C.redL, border: `1px solid ${C.red}40`, borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                      <span style={{ color: C.t1, fontSize: 13 }}>{erreurEnvoi}</span>
                      <Button tokens={ui} className="tap" variant="secondary" size="sm" disabled={nouvelleEnvoi || !formulaireValide} onClick={creerNouveauTicket}>Réessayer</Button>
                    </div>
                  )}
                  {!formulaireValide && (
                    <div style={{ color: C.t2, fontSize: 12, marginBottom: 8 }}>
                      Pour envoyer : {[!nouvelleCategorie && "choisissez une catégorie", !nouvelleSujet.trim() && "indiquez un sujet", !nouvelleMessage.trim() && "écrivez votre message"].filter(Boolean).join(", ")}.
                    </div>
                  )}
                  <Button tokens={ui} className="tap support-tap" variant="primary" size="md" fullWidth loading={nouvelleEnvoi} disabled={!formulaireValide} onClick={creerNouveauTicket}>
                    {nouvelleEnvoi ? "Envoi…" : "Envoyer"}
                  </Button>
                </div>
              </div>
            </>
          ) : !selectedId ? (
            // Illustration réelle (retour Bryan 07/09/2026) plutôt qu'un
            // simple texte centré — même principe que les cartes
            // AttenteAgent/"Conversation terminée".
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
              <div style={{ width: 180, borderRadius: 20, overflow: "hidden", marginBottom: 18, border: `1px solid ${C.border}` }}>
                <Image src="/illustrations/support-empty-state.png" alt="" width={960} height={1086} style={{ width: "100%", height: "auto", display: "block" }}/>
              </div>
              <div style={{ color: C.t1, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Votre conversation avec Yelen</div>
              <div style={{ color: C.t2, fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>Sélectionnez une conversation pour échanger avec notre équipe Support, ou démarrez-en une nouvelle.</div>
            </div>
          ) : detailErreur ? (
            <BlocEtat C={C} titre="Support indisponible" texte="Cette conversation n'a pas pu être chargée."
              action={<Button tokens={ui} className="tap" variant="secondary" size="sm" onClick={() => loadDetail(selectedId)}>Réessayer</Button>}/>
          ) : detailLoading || !detail || detail.id !== selectedId ? (
            <FilSkeleton/>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <button type="button" onClick={() => setSelectedId(null)} aria-label="Retour à la liste des demandes" className="tap yelen-focus-ring support-ico" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, flexShrink: 0 }}><Ic.Back/></button>
                {/* Identité toujours visible dans l'avatar : initiales de
                    l'agent réel une fois assigné, sinon le logo Yelen — ne
                    jamais laisser un emplacement d'identité vide (retour
                    Bryan 06/09/2026). */}
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#000", fontSize: 12, fontWeight: 700 }} title={detail.agent_nom ?? "Support Yelen"}>
                  {detail.agent_nom ? detail.agent_nom.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") : <YelenLogo size={16} color="#000" strokeWidth={2.4}/>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ color: C.t1, fontSize: 14, fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail.sujet || "Demande de support"}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                    <StatutTexte s={detail.statut} C={C}/>
                    <Chip C={C}>{detail.numero_public}</Chip>
                    <span style={{ color: C.t2, fontSize: 12 }}>{dateHeureCourte(detail.cree_le)}</span>
                    {detail.agent_nom && <span style={{ color: C.t2, fontSize: 12 }}>· {detail.agent_nom}</span>}
                  </div>
                </div>
                {(enAttente || enCours) && (
                  <Button tokens={ui} className="tap" variant="secondary" size="sm" ariaLabel="Terminer cette demande" onClick={() => setConfirmerFinOpen(true)}>Terminer</Button>
                )}
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px 8px", display: "flex", flexDirection: "column" }}>
                <div role="log" aria-live="polite" aria-label="Conversation avec le Support Yelen" style={{ display: "flex", flexDirection: "column" }}>
                  {/* Timeline système discrète (retour Bryan 06/09/2026) — deux
                      premières lignes ancrées sur le même horodatage réel
                      (cree_le, un seul événement réel : la création du
                      ticket) ; "Agent assigné" seulement si assigne_le est
                      réellement rempli, jamais une estimation. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "2px 4px 16px" }}>
                    <EvenementSysteme date={detail.cree_le} texte="Demande créée" C={C}/>
                    <EvenementSysteme date={detail.cree_le} texte="Demande envoyée au Support Yelen" C={C}/>
                    {detail.assigne_le && (
                      <EvenementSysteme date={detail.assigne_le} texte={`Agent Yelen assigné${detail.agent_nom ? ` (${detail.agent_nom})` : ""}`} accent C={C}/>
                    )}
                  </div>

                  {/* Carte système "demande reçue" — une fois, tant qu'aucun
                      agent n'a encore répondu. */}
                  {enAttente && !detail.messages.some(m => m.expediteur_type === "agent") && (
                    <div style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                        <span style={{ color: C.green, display: "flex" }}><Ic.Check/></span>
                        <span style={{ color: C.t1, fontSize: 13, fontWeight: 700 }}>Votre demande a bien été reçue</span>
                      </div>
                      <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.5 }}>Votre demande a été transmise à l&apos;équipe Support Yelen. Un agent la prendra en charge dès qu&apos;il sera disponible.</div>
                    </div>
                  )}

                  {detail.messages.length === 0 && !enAttente ? (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: C.t2, fontSize: 13 }}>Aucun message pour l&apos;instant.</div>
                  ) : (
                    <MessagesAvecSeparateurs messages={detail.messages} C={C}/>
                  )}
                  {enAttente && <AttenteAgent depuis={detail.cree_le} positionFile={detail.position_file} C={C}/>}
                  {termine && (
                    // Illustration réelle (agent Yelen qui salue), retour Bryan
                    // 07/09/2026 — même mise en page que la carte d'attente
                    // (AttenteAgent), illustration à gauche + message à droite.
                    // Cadre arrondi : cette illustration a son propre fond
                    // bokeh, pas un fond transparent.
                    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px", margin: "8px 0", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 16 }}>
                      <div style={{ width: 80, height: 84, borderRadius: 14, overflow: "hidden", flexShrink: 0, border: `1px solid ${C.border}` }}>
                        <Image src="/illustrations/support-agent-yelen-au-revoir.png" alt="" width={922} height={973} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ color: C.t1, fontSize: 14, fontWeight: 700 }}>Demande résolue</span>
                          <Ic.Verified size={13} color={C.gold}/>
                        </div>
                        <div style={{ color: C.t1, fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>
                          {detail.resolu_par === "institution" ? "Vous avez terminé cette conversation."
                            : detail.resolu_par === "agent" ? "Cette conversation a été terminée par le support Yelen."
                            : "Cette conversation est terminée."}
                        </div>
                        <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.5 }}>Merci d&apos;avoir contacté le Support Yelen — une équipe 100% humaine, toujours là si vous avez encore besoin d&apos;aide.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {termine ? (
                <div style={{ padding: "12px 16px", flexShrink: 0, textAlign: "center" }}>
                  <div style={{ color: C.t2, fontSize: 12, marginBottom: 8 }}>Démarrez une nouvelle conversation si vous avez encore besoin d&apos;aide.</div>
                  <Button tokens={ui} className="tap support-tap" variant="primary" size="md" onClick={() => setNouvelleDemandeOpen(true)}>Nouvelle demande</Button>
                </div>
              ) : (
                <div style={{ padding: "8px 16px 14px", flexShrink: 0 }}>
                  {/* Composer actif pendant l'attente aussi (retour Bryan
                      06/09/2026, "ajouter des informations sans attendre
                      l'agent") — jamais bloqué avant la prise en charge. */}
                  <Composer value={messageText} onChange={setMessageText} onSend={handleSend} sending={sending} C={C}/>
                  {enAttente && (
                    <div style={{ color: C.t2, fontSize: 12, textAlign: "center", marginTop: 7 }}>Vous pouvez ajouter des informations à votre demande pendant l&apos;attente.</div>
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
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Terminer cette conversation" style={{ background: C.bgCard, borderRadius: 18, padding: 24, maxWidth: 380, width: "100%" }}>
            <div style={{ color: C.t1, fontSize: 15.5, fontWeight: 800, marginBottom: 8, textAlign: "center" }}>Terminer cette conversation ?</div>
            <div style={{ color: C.t2, fontSize: 12.5, lineHeight: 1.55, marginBottom: 20, textAlign: "center" }}>Une nouvelle demande devra être ouverte si vous avez encore besoin d&apos;aide.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Button tokens={ui} className="tap" variant="secondary" size="md" fullWidth disabled={terminerEnCours} onClick={() => setConfirmerFinOpen(false)}>Continuer la conversation</Button>
              <Button tokens={ui} className="tap" variant="danger" size="md" fullWidth loading={terminerEnCours} onClick={terminerConversation}>Terminer</Button>
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
                <Button tokens={ui} className="tap" variant="primary" size="md" fullWidth onClick={() => setEvaluationOpen(false)}>Fermer</Button>
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
                <Button tokens={ui} className="tap" variant="primary" size="md" fullWidth loading={evaluationEnvoi} disabled={!evaluationNote} onClick={envoyerEvaluation}>Envoyer mon avis</Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
