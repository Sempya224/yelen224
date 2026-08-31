"use client";

// Écran Messagerie institution (chantier "Messagerie" 19/07/2026) —
// remplace le pop-up flottant MessagerieWidget.tsx. 2 onglets, mirroring
// exactement le côté citoyen (app/messagerie/citoyen/page.tsx) : "Yelen"
// (support plateforme, conversation permanente) et "Citoyen" (une
// conversation par rdv, fermée définitivement quand ce rdv atteint un
// statut terminal). Simplification assumée par rapport au citoyen : pas
// de pagination "charger plus ancien" ici (le fil complet est chargé —
// volume par conversation institution attendu modeste), à reprendre si
// Bryan le juge nécessaire après un premier usage réel.
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { YelenLogo } from "@/components/YelenLogo";
import { YelenLoader } from "@/components/YelenLoader";

type TabMsg = "yelen" | "citoyen";
type ConversationCitoyen = {
  rdv_id: string; citoyen_id: string; citoyen_nom: string; service: string | null; date_rdv: string;
  fermee: boolean; dernier_message: string | null; dernier_message_type: "texte" | "image" | null; dernier_message_at: string | null; non_lus: number;
};
type AnyMsg = { id: string; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string; mine: boolean };
type RawMsg = { id: string; contenu: string | null; image_url: string | null; type?: "texte" | "image"; cree_le: string; emetteur?: string; expediteur?: string };
// Lot 2 (chantier "Messagerie", 21/08/2026, retour Bryan) — prise en charge/
// fermeture, voir app/api/institution/messagerie-yelen/route.ts.
type YelenEtat = { statut: "nouvelle" | "prise_en_charge" | "fermee"; attente_depuis: string | null };

// Écran d'attente avant prise en charge par un agent (référence DoorDash,
// retour Bryan 21/08/2026) — YelenLoader réutilisé tel quel (indicateur de
// chargement unique du projet, voir components/YelenLoader.tsx), jamais un
// spinner réinventé localement. `attenteDepuis` est un vrai timestamp
// serveur (dernier message du fil), jamais une horloge côté client qui se
// réinitialiserait à un rechargement de page.
function AttenteAgentYelen({ attenteDepuis, C }: { attenteDepuis: string | null; C: ThemeTokens }) {
  const [depasse60s, setDepasse60s] = useState(false);
  useEffect(() => {
    if (!attenteDepuis) { setDepasse60s(false); return; }
    const debut = new Date(attenteDepuis).getTime();
    const verifier = () => setDepasse60s(Date.now() - debut >= 60000);
    verifier();
    const interval = setInterval(verifier, 5000);
    return () => clearInterval(interval);
  }, [attenteDepuis]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "18px 20px", margin: "8px 0" }}>
      <YelenLoader size={30}/>
      <div style={{ color: C.t1, fontSize: "12.5px", fontWeight: "800", textAlign: "center" }}>En attente d&apos;un agent Yelen…</div>
      {depasse60s && (
        <div style={{ color: C.t3, fontSize: "11.5px", textAlign: "center", lineHeight: 1.5, maxWidth: "260px" }}>
          Merci de patienter, un agent Yelen vous prendra en charge le plus tôt possible.
        </div>
      )}
    </div>
  );
}

const P = { pointerEvents: "none" as const };
const Ic = {
  X:      () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Camera: () => <svg style={P} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Send:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Lock:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Back:   () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
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
function formatSeparateurJour(dateStr: string): string {
  const auj = new Date(); const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (estMemeJour(dateStr, auj.toISOString())) return "Aujourd'hui";
  if (estMemeJour(dateStr, hier.toISOString())) return "Hier";
  return new Date(dateStr).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function formatApercu(c: { dernier_message: string | null; dernier_message_type: "texte" | "image" | null }): string {
  if (c.dernier_message_type === "image") return "Image";
  return c.dernier_message ?? "Aucun message";
}

export function MessagerieTab({ onToast, initialCitoyenId, suspendu, onOpenFeedback }: { onToast: (msg: string, color?: string) => void; initialCitoyenId?: string | null; suspendu?: boolean; onOpenFeedback?: () => void }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;

  const [tab, setTab] = useState<TabMsg>("yelen");

  const [conversations, setConversations] = useState<ConversationCitoyen[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [selected, setSelected] = useState<ConversationCitoyen | null>(null);
  const [citoyenThread, setCitoyenThread] = useState<AnyMsg[]>([]);
  const [citoyenThreadLoading, setCitoyenThreadLoading] = useState(false);

  const [yelenThread, setYelenThread] = useState<AnyMsg[]>([]);
  const [yelenLoading, setYelenLoading] = useState(true);
  const [yelenUnread, setYelenUnread] = useState(0);
  const [yelenEtat, setYelenEtat] = useState<YelenEtat | null>(null);

  const [messageText, setMessageText] = useState("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolveImageUrls = useCallback(async (paths: string[]) => {
    const uniq = [...new Set(paths)];
    if (uniq.length === 0) return;
    try {
      const res = await fetch("/api/institution/messages/image-url", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: uniq }),
      });
      const j = await res.json().catch(() => null);
      if (j?.success) setImageUrls(prev => ({ ...prev, ...j.urls }));
    } catch {}
  }, []);

  const loadConversations = useCallback(async (): Promise<ConversationCitoyen[]> => {
    setConversationsLoading(true);
    try {
      const res = await fetch("/api/institution/messages");
      const j = await res.json().catch(() => null);
      const list: ConversationCitoyen[] = res.ok ? (j?.conversations ?? []) : [];
      setConversations(list);
      return list;
    } catch {
      onToast("Impossible de charger les conversations.", C.red);
      return [];
    } finally {
      setConversationsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCitoyenThread = useCallback(async (conv: ConversationCitoyen) => {
    setCitoyenThreadLoading(true);
    try {
      const res = await fetch(`/api/institution/messages?rdv_id=${conv.rdv_id}`);
      const j = await res.json().catch(() => null);
      const msgs = res.ok ? (j?.messages ?? []) : [];
      const unified: AnyMsg[] = (msgs as RawMsg[]).map((m) => ({ id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type ?? "texte", cree_le: m.cree_le, mine: m.emetteur === "institution" }));
      setCitoyenThread(unified);
      resolveImageUrls(unified.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
      setConversations(prev => prev.map(c => c.rdv_id === conv.rdv_id ? { ...c, non_lus: 0 } : c));
    } catch {
      onToast("Impossible de charger la conversation.", C.red);
    } finally {
      setCitoyenThreadLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveImageUrls]);

  // `silencieux` (retour Bryan 21/08/2026) — jamais remettre tout l'écran en
  // loading pour un rafraîchissement en arrière-plan (même convention que
  // PresencesView/SignalementsTab.tsx, voir CLAUDE.md pièges techniques).
  const loadYelenThread = useCallback(async (silencieux = false) => {
    if (!silencieux) setYelenLoading(true);
    try {
      const res = await fetch("/api/institution/messagerie-yelen");
      const j = await res.json().catch(() => null);
      const msgs = res.ok ? (j?.messages ?? []) : [];
      const unified: AnyMsg[] = (msgs as RawMsg[]).map((m) => ({ id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type ?? "texte", cree_le: m.cree_le, mine: m.expediteur === "institution" }));
      setYelenThread(unified);
      setYelenEtat(res.ok ? (j?.etat ?? null) : null);
      resolveImageUrls(unified.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
      setYelenUnread(0);
    } catch {
      if (!silencieux) onToast("Impossible de charger la conversation Yelen.", C.red);
    } finally {
      if (!silencieux) setYelenLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveImageUrls]);

  useEffect(() => {
    (async () => {
      const list = await loadConversations();
      if (initialCitoyenId) {
        const match = list.find(c => c.citoyen_id === initialCitoyenId && !c.fermee) ?? list.find(c => c.citoyen_id === initialCitoyenId);
        if (match) { setTab("citoyen"); setSelected(match); }
      }
    })();
    fetch("/api/institution/messagerie-yelen?compte=1").then(r => r.json()).then(j => setYelenUnread(j?.non_lus ?? 0)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCitoyenId]);

  useEffect(() => {
    if (selected) loadCitoyenThread(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.rdv_id]);

  // Recharge à chaque ouverture de l'onglet Yelen (bug réel corrigé
  // 21/08/2026 : un ref "déjà chargé une fois" bloquait tout rechargement
  // ultérieur — la réponse d'un admin restait invisible tant que la page
  // n'était pas rechargée en dur, alors même que le badge de non-lus se
  // mettait à jour ailleurs). Poll silencieux tant que l'onglet reste
  // ouvert, pour voir une réponse arriver sans même changer d'onglet.
  useEffect(() => {
    if (tab !== "yelen") return;
    loadYelenThread();
    const interval = setInterval(() => loadYelenThread(true), 15000);
    return () => clearInterval(interval);
  }, [tab, loadYelenThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [citoyenThread, yelenThread, tab, selected]);

  function switchTab(next: TabMsg) {
    setTab(next);
    setSelected(null);
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

  async function handleSendImage() {
    if (!pendingImageFile) return;
    setSending(true);
    try {
      const form = new FormData();
      if (tab === "citoyen" && selected) form.append("rdv_id", selected.rdv_id);
      if (messageText.trim()) form.append("legende", messageText.trim());
      form.append("file", pendingImageFile);
      const url = tab === "yelen" ? "/api/institution/messagerie-yelen/upload-image" : "/api/institution/messages/upload-image";
      const res = await fetch(url, { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error || "Erreur d'envoi de l'image.");

      if (j.path && j.url) setImageUrls(prev => ({ ...prev, [j.path]: j.url }));
      const legende = messageText.trim() || null;
      cancelPendingImage();
      setMessageText("");

      if (tab === "yelen") {
        setYelenThread(prev => [...prev, { id: `local-${Date.now()}`, contenu: legende, image_url: j.path, type: "image", cree_le: new Date().toISOString(), mine: true }]);
      } else if (selected) {
        setCitoyenThread(prev => [...prev, { id: `local-${Date.now()}`, contenu: legende, image_url: j.path, type: "image", cree_le: new Date().toISOString(), mine: true }]);
        setConversations(prev => prev.map(c => c.rdv_id === selected.rdv_id ? { ...c, dernier_message: null, dernier_message_type: "image", dernier_message_at: new Date().toISOString() } : c));
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Erreur d'envoi de l'image.", C.red);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (sending) return;
    if (pendingImageFile) { await handleSendImage(); return; }
    const contenu = messageText.trim();
    if (!contenu) return;
    setSending(true);
    try {
      if (tab === "yelen") {
        const res = await fetch("/api/institution/messagerie-yelen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contenu }) });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error || "Erreur d'envoi.");
        setYelenThread(prev => [...prev, { id: `local-${Date.now()}`, contenu, image_url: null, type: "texte", cree_le: new Date().toISOString(), mine: true }]);
      } else if (selected) {
        const res = await fetch("/api/institution/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rdv_id: selected.rdv_id, contenu }) });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error || "Erreur d'envoi.");
        setCitoyenThread(prev => [...prev, { id: `local-${Date.now()}`, contenu, image_url: null, type: "texte", cree_le: new Date().toISOString(), mine: true }]);
        setConversations(prev => prev.map(c => c.rdv_id === selected.rdv_id ? { ...c, dernier_message: contenu, dernier_message_type: "texte", dernier_message_at: new Date().toISOString() } : c));
      }
      setMessageText("");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Erreur d'envoi. Réessayez.", C.red);
    } finally {
      setSending(false);
    }
  }

  const threadUnifie = tab === "yelen" ? yelenThread : citoyenThread;
  const dansUnFil = tab === "yelen" || (tab === "citoyen" && !!selected);
  const fermee = tab === "citoyen" && selected?.fermee === true;
  // Restriction messagerie institution → citoyen pendant une suspension
  // (retour Bryan 17/08/2026, "côté institutions le plus important") — ne
  // concerne QUE l'onglet Citoyen, jamais "Yelen" (le support Yelen reste
  // toujours joignable, y compris suspendu). La vraie barrière vit côté
  // serveur (POST /api/institution/messages), ceci n'est que l'affichage.
  const suspenduBloque = tab === "citoyen" && !fermee && suspendu === true;
  const threadLoading = tab === "yelen" ? yelenLoading : citoyenThreadLoading;

  // ── Refonte visuelle uniquement (retour Bryan 21/08/2026, "LOT — Refonte
  // UI/UX écran Messagerie Yelen") : mobile-first, liste↔détail sur mobile
  // (une seule couche visible à la fois, piloté par `selected`/`tab`, déjà
  // l'état existant — aucune nouvelle donnée), liste + détail simultanés
  // dès 860px. Zéro changement de logique/route/permission — uniquement
  // structure visuelle, espacement, hiérarchie, largeur des messages.
  const listeVisibleMobile = tab !== "citoyen" || !selected;
  const detailVisibleMobile = dansUnFil;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 140px)", minHeight: "480px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden" }}>
      <style>{`
        .msg-tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer}
        .msg-tap:active{opacity:0.65;transform:scale(0.97)}
        .msg-pane{display:none;min-height:0}
        .msg-pane-on{display:flex}
        @media (min-width:860px){
          .msg-pane{display:flex !important}
          .msg-body{flex-direction:row !important}
          .msg-list-pane{width:296px;flex-shrink:0;border-right:1px solid ${C.border}}
        }
      `}</style>

      {/* Bascule Yelen/Citoyen — masquée sur mobile une fois une
          conversation citoyen ouverte (comportement inchangé), toujours
          visible dès 860px (les deux volets coexistent). */}
      <div className={`msg-pane ${listeVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "row", gap: 6, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([
          { key: "yelen" as const, label: "Yelen", badge: yelenUnread },
          { key: "citoyen" as const, label: "Citoyen", badge: conversations.reduce((s, c) => s + c.non_lus, 0) },
        ]).map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => switchTab(t.key)} className="msg-tap" style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "8px 10px", borderRadius: 10, border: "none",
              background: active ? `${C.gold}16` : "transparent", color: active ? C.gold : C.t2,
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>
              {t.key === "yelen" ? <YelenLogo size={13} color={active ? C.gold : C.t2}/> : null}
              {t.label}
              {t.badge > 0 && (
                <span style={{ background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Corps : liste (citoyen uniquement) + détail, côte à côte dès
          860px, une seule couche visible en dessous (retour Bryan
          21/08/2026, §2 du brief). */}
      <div className="msg-body" style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {tab === "citoyen" && (
          <div className={`msg-pane msg-list-pane ${listeVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "column", overflowY: "auto" }}>
            {conversationsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={22}/></div>
            ) : conversations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 20px", color: C.t3, fontSize: 12.5, lineHeight: 1.6 }}>Aucune conversation pour l&apos;instant — elles apparaîtront ici dès qu&apos;un client vous écrira ou qu&apos;un rendez-vous sera confirmé.</div>
            ) : (
              <div>
                {conversations.map(c => {
                  const activeRow = selected?.rdv_id === c.rdv_id;
                  return (
                    <div key={c.rdv_id} onClick={() => setSelected(c)} className="msg-tap" style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderLeft: `2px solid ${activeRow ? C.gold : "transparent"}`, background: activeRow ? C.bgCard2 : "transparent", cursor: "pointer" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.t2, flexShrink: 0 }}>{getInitials(c.citoyen_nom)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ color: C.t1, fontSize: 13, fontWeight: c.non_lus > 0 ? 800 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.citoyen_nom}</span>
                          {c.dernier_message_at && <span style={{ color: C.t3, fontSize: 10.5, flexShrink: 0 }}>{formatHeure(c.dernier_message_at)}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          {c.fermee && <span style={{ color: C.t3, flexShrink: 0, display: "flex" }}>{Ic.Lock()}</span>}
                          <span style={{ color: c.non_lus > 0 ? C.t2 : C.t3, fontSize: 11.5, fontWeight: c.non_lus > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatApercu(c)}</span>
                        </div>
                      </div>
                      {c.non_lus > 0 && <span style={{ background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>{c.non_lus}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className={`msg-pane msg-detail-pane ${detailVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "column", flex: 1, minHeight: 0 }}>
          {!dansUnFil ? (
            // Desktop uniquement (masqué sur mobile par listeVisibleMobile) —
            // évite un volet détail vide quand aucune conversation citoyen
            // n'est encore sélectionnée.
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: 12.5, padding: 24, textAlign: "center" }}>
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              {tab === "citoyen" && selected && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                  <button onClick={() => setSelected(null)} className="msg-tap" style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", padding: 0, display: "flex" }}>{Ic.Back()}</button>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.t1, fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.citoyen_nom}</div>
                    <div style={{ color: fermee ? C.red : C.t3, fontSize: 10.5, fontWeight: 600, marginTop: 1 }}>{fermee ? "Conversation fermée" : (selected.service ?? "Conversation active")}</div>
                  </div>
                </div>
              )}

              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px 8px", display: "flex", flexDirection: "column" }}>
                {threadLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><YelenLoader size={24}/></div>
                ) : threadUnifie.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: C.t3, fontSize: 12.5 }}>
                    {tab === "yelen" ? "Une question pour l'équipe Yelen ? Écrivez ici." : `Envoyez un premier message à ${selected?.citoyen_nom}.`}
                  </div>
                ) : threadUnifie.map((m, i) => {
                  const prev = threadUnifie[i - 1];
                  const showSeparateur = !prev || !estMemeJour(prev.cree_le, m.cree_le);
                  const url = m.image_url ? imageUrls[m.image_url] : null;
                  return (
                    <div key={m.id}>
                      {showSeparateur && (
                        <div style={{ textAlign: "center", margin: "16px 0 12px" }}>
                          <span style={{ color: C.t3, fontSize: 10.5, fontWeight: 700, textTransform: "capitalize" }}>{formatSeparateurJour(m.cree_le)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", marginBottom: 14 }}>
                        <div style={{ maxWidth: "min(74%, 460px)", background: m.mine ? C.bg3 : C.bgCard2, borderRadius: 14, padding: m.type === "image" ? 6 : "9px 13px" }}>
                          {m.type === "image" && (
                            url ? (
                              <Image src={url} alt="" width={800} height={600} onClick={() => setLightbox(url)} className="msg-tap" style={{ display: "block", width: "100%", height: "auto", maxWidth: 220, borderRadius: 9, cursor: "pointer" }}/>
                            ) : (
                              <div style={{ width: 170, height: 125, borderRadius: 9, background: C.bg3, display: "flex", alignItems: "center", justifyContent: "center" }}><YelenLoader size={20}/></div>
                            )
                          )}
                          {m.contenu && <div style={{ color: C.t1, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: m.type === "image" ? 6 : 0, padding: m.type === "image" ? "0 4px" : 0 }}>{m.contenu}</div>}
                        </div>
                        <span style={{ color: C.t3, fontSize: 10, marginTop: 4, padding: "0 2px" }}>{formatHeure(m.cree_le)}</span>
                      </div>
                    </div>
                  );
                })}
                {tab === "yelen" && yelenEtat?.statut === "nouvelle" && !threadLoading && (
                  <AttenteAgentYelen attenteDepuis={yelenEtat.attente_depuis} C={C}/>
                )}
              </div>

              {fermee ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 16px", flexShrink: 0, color: C.t3 }}>
                  {Ic.Lock()}
                  <div style={{ fontSize: 11.5 }}>Ce rendez-vous est terminé — la conversation est fermée.</div>
                </div>
              ) : suspenduBloque ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 16px", flexShrink: 0, color: C.t2 }}>
                  {Ic.Lock()}
                  <div style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                    Votre établissement est suspendu — vous ne pouvez pas envoyer de nouveaux messages aux citoyens pour le moment.{" "}
                    <span style={{ color: C.gold, fontWeight: 700 }}>Besoin de parler à un agent ? Contactez le support Yelen ou l&apos;onglet &quot;Yelen&quot;.</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "8px 16px 14px", flexShrink: 0 }}>
                  {tab === "yelen" && yelenEtat?.statut === "fermee" && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: C.t3, marginBottom: onOpenFeedback ? 8 : 0 }}>
                        {Ic.Lock()}
                        <div style={{ fontSize: 11.5 }}>Conversation résolue — écrivez pour en ouvrir une nouvelle.</div>
                      </div>
                      {onOpenFeedback && (
                        <button onClick={onOpenFeedback} className="msg-tap" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", width: "100%" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.t2, flex: 1, textAlign: "left" }}>Comment s&apos;est passé cet échange avec le support ? Donnez votre avis</span>
                          <span style={{ color: C.gold, fontWeight: 800 }}>›</span>
                        </button>
                      )}
                    </div>
                  )}
                  {pendingImagePreview && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 9, overflow: "hidden", border: `1px solid ${C.border}` }}>
                        {/* IMG-EXCEPTION: reason=aperçu blob local (URL.createObjectURL) avant envoi, non fetchable par l'optimiseur next/image | reviewed=2026-08-08 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pendingImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      </div>
                      <button onClick={cancelPendingImage} className="msg-tap" style={{ background: C.bgCard2, border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <span style={{ color: C.t3, fontSize: 11 }}>Image prête — légende optionnelle.</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.bgCard2, borderRadius: 22, padding: "4px 6px 4px 14px" }}>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePickFile} style={{ display: "none" }}/>
                    <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="msg-tap" style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.t2, cursor: "pointer", padding: "4px" }}>{Ic.Camera()}</button>
                    <input
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                      placeholder={pendingImageFile ? "Légende (optionnel)…" : "Écrire un message…"}
                      style={{ flex: 1, background: "none", border: "none", padding: "8px 0", fontSize: 13, color: C.t1, outline: "none" }}
                    />
                    <button onClick={handleSend} disabled={sending || (!messageText.trim() && !pendingImageFile)} className="msg-tap" style={{ background: C.gold, color: "#080812", border: "none", borderRadius: "50%", width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: sending || (!messageText.trim() && !pendingImageFile) ? 0.5 : 1 }}>
                      {sending ? <YelenLoader size={13} color="#080812"/> : Ic.Send()}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <button onClick={() => setLightbox(null)} className="msg-tap" style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>{Ic.X()}</button>
          <Image src={lightbox} alt="" width={1200} height={900} style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }}/>
        </div>
      )}
    </div>
  );
}
