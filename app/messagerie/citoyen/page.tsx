"use client";

// Messagerie citoyen — 2 onglets (décision Bryan, chantier "Messagerie"
// 19/07/2026) : "Yelen" (support plateforme, table messages_yelen_citoyen,
// toujours ouvert) et "Établissements" (une conversation par RDV,
// lib/messagerie.ts::getConversationsEtablissements/getThreadRdv, se ferme
// définitivement quand le rdv passe à un statut terminal). Remplace
// l'ancienne version à fil unique par institution (fond codé en dur, zéro
// image, zéro fermeture) — voir le plan du chantier pour le détail complet.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import { YelenLoader } from "@/components/YelenLoader";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import { YelenLogo } from "@/components/YelenLogo";
import { EmptyState } from "@/components/EmptyState";
import {
  getConversationsEtablissements, getThreadRdv, sendMessageRdv, markThreadReadRdv,
  getThreadYelen, sendMessageYelen, markThreadYelenRead, getUnreadCountYelen,
  messageInstitutionSuspendue, InstitutionSuspendueError,
  type ConversationEtablissement, type MessageRdvThread, type MessageYelenThread,
} from "@/lib/messagerie";
import { journaliserMessageCitoyen } from "./actions";

type TabMsg = "yelen" | "etablissements";
type AnyMsg = { id: string; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string; mine: boolean };

const P = { pointerEvents: "none" as const };
const Ic = {
  Back:   () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  X:      () => <svg style={P} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Camera: () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Send:   () => <svg style={P} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Lock:   () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Chev:   () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
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
  const d = new Date(dateStr);
  const auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (estMemeJour(dateStr, auj.toISOString())) return "Aujourd'hui";
  if (estMemeJour(dateStr, hier.toISOString())) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
function formatApercu(msg: { dernier_message: string | null; dernier_message_type: "texte" | "image" | null }): string {
  if (msg.dernier_message_type === "image") return "📷 Image";
  return msg.dernier_message ?? "Aucun message";
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
  const [tab, setTab] = useState<TabMsg>("yelen");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [conversations, setConversations] = useState<ConversationEtablissement[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [selected, setSelected] = useState<ConversationEtablissement | null>(null);
  const [etabThread, setEtabThread] = useState<MessageRdvThread[]>([]);
  const [etabThreadLoading, setEtabThreadLoading] = useState(false);
  const [etabHasMore, setEtabHasMore] = useState(false);
  const [etabLoadingMore, setEtabLoadingMore] = useState(false);

  const [yelenThread, setYelenThread] = useState<MessageYelenThread[]>([]);
  const [yelenLoading, setYelenLoading] = useState(true);
  const [yelenHasMore, setYelenHasMore] = useState(false);
  const [yelenLoadingMore, setYelenLoadingMore] = useState(false);
  const [yelenUnread, setYelenUnread] = useState(0);
  const yelenLoadedRef = useRef(false);

  const [messageText, setMessageText] = useState("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

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

  const loadYelenThread = useCallback(async (uid: string) => {
    setYelenLoading(true);
    try {
      const msgs = await getThreadYelen(uid);
      setYelenThread(msgs);
      setYelenHasMore(msgs.length >= 50);
      resolveImageUrls(msgs.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
      await markThreadYelenRead(uid);
      setYelenUnread(0);
    } catch {
      showToast("Impossible de charger la conversation Yelen.");
    } finally {
      setYelenLoading(false);
    }
  }, [resolveImageUrls]);

  const loadYelenPlusAncien = useCallback(async () => {
    if (!userId || yelenThread.length === 0) return;
    setYelenLoadingMore(true);
    try {
      const older = await getThreadYelen(userId, { avant: yelenThread[0].cree_le });
      setYelenThread(prev => [...older, ...prev]);
      setYelenHasMore(older.length >= 50);
      resolveImageUrls(older.filter(m => m.type === "image" && m.image_url).map(m => m.image_url as string));
    } catch {} finally { setYelenLoadingMore(false); }
  }, [userId, yelenThread, resolveImageUrls]);

  useEffect(() => {
    let uid: string | null = null;
    try { uid = localStorage.getItem(YELEN224_USER_ID_KEY); } catch {}
    if (!uid) { router.push("/login"); return; }
    setUserId(uid);

    const instParam = searchParams.get("institution_id");
    (async () => {
      const list = await loadConversations(uid!);
      if (instParam) {
        const match = list.find(c => c.institution_id === instParam && !c.fermee) ?? list.find(c => c.institution_id === instParam);
        if (match) { setTab("etablissements"); setSelected(match); }
      }
    })();

    getUnreadCountYelen(uid).then(setYelenUnread).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (userId && selected) loadEtabThread(userId, selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selected?.rdv_id]);

  useEffect(() => {
    if (userId && tab === "yelen" && !yelenLoadedRef.current) {
      yelenLoadedRef.current = true;
      loadYelenThread(userId);
    }
  }, [userId, tab, loadYelenThread]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`messagerie-citoyen-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `destinataire_citoyen_id=eq.${userId}` }, () => {
        loadConversations(userId);
        setSelected(current => { if (current) loadEtabThread(userId, current); return current; });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages_yelen_citoyen", filter: `citoyen_id=eq.${userId}` }, () => {
        getUnreadCountYelen(userId).then(setYelenUnread).catch(() => {});
        setTab(current => { if (current === "yelen") loadYelenThread(userId); return current; });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [etabThread, yelenThread, tab, selected]);

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
    if (!userId || !pendingImageFile) return;
    setSending(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Session expirée, reconnectez-vous.");
      const form = new FormData();
      form.append("accessToken", token);
      form.append("target", tab === "yelen" ? "yelen" : "etablissement");
      if (tab === "etablissements" && selected) form.append("rdv_id", selected.rdv_id);
      if (messageText.trim()) form.append("legende", messageText.trim());
      form.append("file", pendingImageFile);
      const res = await fetch("/api/citoyen/messagerie/upload-image", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error || "Erreur d'envoi de l'image.");

      if (j.path && j.url) setImageUrls(prev => ({ ...prev, [j.path]: j.url }));
      const legende = messageText.trim() || null;
      cancelPendingImage();
      setMessageText("");

      if (tab === "yelen") {
        setYelenThread(prev => [...prev, { id: `local-${Date.now()}`, contenu: legende, image_url: j.path, type: "image", lu: false, cree_le: new Date().toISOString(), expediteur: "citoyen" }]);
      } else if (selected) {
        setEtabThread(prev => [...prev, { id: `local-${Date.now()}`, contenu: legende, image_url: j.path, type: "image", lu: false, cree_le: new Date().toISOString(), emetteur: "citoyen" }]);
        setConversations(prev => prev.map(c => c.rdv_id === selected.rdv_id ? { ...c, dernier_message: null, dernier_message_type: "image", dernier_message_at: new Date().toISOString() } : c));
        journaliserMessageCitoyen(selected.institution_id, userId).catch(() => {});
      }
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
        await sendMessageYelen(userId, { texte: contenu });
        setYelenThread(prev => [...prev, { id: `local-${Date.now()}`, contenu, image_url: null, type: "texte", lu: false, cree_le: new Date().toISOString(), expediteur: "citoyen" }]);
      } else if (selected) {
        await sendMessageRdv(userId, selected.institution_id, selected.rdv_id, { texte: contenu });
        setEtabThread(prev => [...prev, { id: `local-${Date.now()}`, contenu, image_url: null, type: "texte", lu: false, cree_le: new Date().toISOString(), emetteur: "citoyen" }]);
        setConversations(prev => prev.map(c => c.rdv_id === selected.rdv_id ? { ...c, dernier_message: contenu, dernier_message_type: "texte", dernier_message_at: new Date().toISOString() } : c));
        journaliserMessageCitoyen(selected.institution_id, userId).catch(() => {});
      }
      setMessageText("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      showToast(e instanceof InstitutionSuspendueError || msg.includes("terminé") ? msg : "Erreur d'envoi. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  const threadUnifie: AnyMsg[] = tab === "yelen"
    ? yelenThread.map(m => ({ id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type, cree_le: m.cree_le, mine: m.expediteur === "citoyen" }))
    : etabThread.map(m => ({ id: m.id, contenu: m.contenu, image_url: m.image_url, type: m.type, cree_le: m.cree_le, mine: m.emetteur === "citoyen" }));

  const dansUnFil = tab === "yelen" || (tab === "etablissements" && !!selected);
  const fermee = tab === "etablissements" && selected?.fermee === true;
  // Restriction messagerie citoyen → institution suspendue (retour Bryan
  // 17/08/2026) — message explicite, distinct de "conversation fermée"
  // (le rdv n'est pas fermé, l'établissement est simplement injoignable
  // pour l'instant).
  const suspendue = tab === "etablissements" && !fermee && selected?.institution_suspendue === true;
  const threadLoading = tab === "yelen" ? yelenLoading : etabThreadLoading;
  const hasMore = tab === "yelen" ? yelenHasMore : etabHasMore;
  const loadingMore = tab === "yelen" ? yelenLoadingMore : etabLoadingMore;

  // ── Refonte visuelle uniquement (retour Bryan 21/08/2026, "LOT — Refonte
  // UI/UX écran Messagerie Yelen") : même principe que
  // MessagerieTab.tsx (institution) — mobile-first, liste↔détail sur
  // mobile (une seule couche visible, piloté par `selected`/`tab`, état
  // déjà existant), liste + détail simultanés dès 860px. Zéro changement
  // de logique/route/realtime/pagination — uniquement présentation.
  const listeVisibleMobile = tab !== "etablissements" || !selected;
  const detailVisibleMobile = dansUnFil;

  return (
    <div style={{ minHeight: "100svh", background: bg, color: t1, fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
        .tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer;touch-action:manipulation}
        .tap:active{opacity:0.65;transform:scale(0.96)}
        input{font-family:inherit;color:${t1}}
        input:focus{outline:none}
        .msg-pane{display:none;min-height:0}
        .msg-pane-on{display:flex}
        @media (min-width:860px){
          .msg-pane{display:flex !important}
          .msg-body{flex-direction:row !important}
          .msg-list-pane{width:320px;flex-shrink:0;border-right:1px solid ${brd}}
        }
      `}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 200, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", paddingRight: "16px", paddingBottom: 0, paddingLeft: "16px", flexShrink: 0 }}>
        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => (tab === "etablissements" && selected) ? setSelected(null) : router.back()}
            className="tap" style={{ background: "none", border: "none", color: t2, padding: "4px 6px 4px 0", cursor: "pointer" }}
          >{Ic.Back()}</button>
          {tab === "etablissements" && selected ? (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: t1, fontSize: 14.5, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.institution_nom}</div>
              <div style={{ color: fermee ? "#EF4444" : t3, fontSize: 10.5, fontWeight: 600, marginTop: 1 }}>
                {fermee ? "Conversation fermée" : (selected.service ?? "Conversation active")}
              </div>
            </div>
          ) : (
            <div style={{ color: t1, fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>Messagerie</div>
          )}
        </div>
        <div className={`msg-pane ${listeVisibleMobile ? "msg-pane-on" : ""}`} style={{ gap: 6, paddingBottom: 10 }}>
          {([
            { key: "yelen" as const, label: "Yelen", badge: yelenUnread },
            { key: "etablissements" as const, label: "Établissements", badge: conversations.reduce((s, c) => s + c.non_lus, 0) },
          ]).map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => switchTab(t.key)} className="tap" style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "8px 10px", borderRadius: 10, border: "none",
                background: active ? "rgba(245,166,35,0.12)" : "transparent", color: active ? gold : t2,
                fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}>
                {t.key === "yelen" ? <YelenLogo size={13} color={active ? gold : t2}/> : null}
                {t.label}
                {t.badge > 0 && (
                  <span style={{ background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{t.badge}</span>
                )}
              </button>
            );
          })}
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
            ) : conversations.length === 0 ? (
              <div style={{ paddingTop: 24, padding: "24px 16px" }}>
                <EmptyState
                  title="Aucune conversation pour l'instant"
                  message="Dès qu'un rendez-vous est confirmé, vous pouvez échanger directement avec l'institution ici — rappels, questions, suivi."
                  color={gold} titleColor={t1} textColor={t3}
                />
              </div>
            ) : (
              <div>
                {conversations.map(c => {
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
          </div>
        )}

        {/* ═══ FIL (Yelen ou conversation établissement ouverte) ═══ */}
        <div className={`msg-pane msg-detail-pane ${detailVisibleMobile ? "msg-pane-on" : ""}`} style={{ flexDirection: "column", flex: 1, minHeight: 0 }}>
          {!dansUnFil ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t3, fontSize: 12.5, padding: 24, textAlign: "center" }}>
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px 8px" }}>
                {threadLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                    <div style={{ width: 30, height: 30, border: `3px solid rgba(245,166,35,0.15)`, borderTopColor: gold, borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                  </div>
                ) : threadUnifie.length === 0 ? (
                  <div style={{ paddingTop: 24 }}>
                    <EmptyState
                      title={tab === "yelen" ? "Écrivez-nous" : "Démarrez la conversation"}
                      message={tab === "yelen" ? "Une question, un souci, une suggestion — l'équipe Yelen vous répond ici." : `Envoyez un premier message à ${selected?.institution_nom}.`}
                      color={gold} titleColor={t1} textColor={t3}
                    />
                  </div>
                ) : (
                  <>
                    {hasMore && (
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                        <button onClick={() => tab === "yelen" ? loadYelenPlusAncien() : loadEtabPlusAncien()} disabled={loadingMore} className="tap" style={{ background: "none", border: `1px solid ${brd}`, borderRadius: 20, padding: "6px 14px", color: t2, fontSize: 11.5, fontWeight: 700, cursor: "pointer", opacity: loadingMore ? 0.6 : 1 }}>
                          {loadingMore ? "Chargement…" : "Charger les messages précédents"}
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
                          <div style={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", marginBottom: 14, animation: "fadeUp 0.2s ease" }}>
                            <div style={{ maxWidth: "min(76%, 480px)", background: m.mine ? "rgba(245,166,35,0.10)" : card, borderRadius: 15, padding: m.type === "image" ? 6 : "10px 14px", overflow: "hidden" }}>
                              {m.type === "image" && (
                                url ? (
                                  <Image src={url} alt="" width={800} height={600} onClick={() => setLightbox(url)} className="tap" style={{ display: "block", width: "100%", height: "auto", maxWidth: 220, borderRadius: 9, cursor: "pointer" }}/>
                                ) : (
                                  <div style={{ width: 180, height: 130, borderRadius: 9, background: card2, display: "flex", alignItems: "center", justifyContent: "center", color: t3, fontSize: 11 }}>Chargement…</div>
                                )
                              )}
                              {m.contenu && <div style={{ color: t1, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: m.type === "image" ? 6 : 0, padding: m.type === "image" ? "0 4px" : 0 }}>{m.contenu}</div>}
                            </div>
                            <span style={{ color: t3, fontSize: 10, marginTop: 4, padding: "0 2px" }}>{formatHeure(m.cree_le)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {fermee ? (
                <div style={{ position: "sticky", bottom: 0, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 16px", flexShrink: 0 }}>
                  {Ic.Lock()}
                  <div style={{ color: t3, fontSize: 11.5 }}>Ce rendez-vous est terminé — la conversation est fermée.</div>
                </div>
              ) : suspendue ? (
                <div style={{ position: "sticky", bottom: 0, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 16px", flexShrink: 0 }}>
                  {Ic.Lock()}
                  <div style={{ color: t2, fontSize: 11.5, lineHeight: 1.55 }}>
                    {messageInstitutionSuspendue(selected?.institution_nom || "Cet établissement")}{" "}
                    <a href="mailto:support@yelen224.com" style={{ color: gold, fontWeight: 700, textDecoration: "none" }}>Besoin de parler à un agent ? →</a>
                  </div>
                </div>
              ) : (
                <div style={{ position: "sticky", bottom: 0, background: isDark ? "rgba(10,10,15,0.97)" : "rgba(248,248,252,0.97)", backdropFilter: "blur(20px)", padding: "8px 16px 14px", flexShrink: 0 }}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: card2, borderRadius: 24, padding: "4px 6px 4px 16px" }}>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePickFile} style={{ display: "none" }}/>
                    <button onClick={() => fileInputRef.current?.click()} disabled={sending} className="tap" style={{ background: "none", border: "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: t2, cursor: "pointer", padding: 4 }}>{Ic.Camera()}</button>
                    <input
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
                      placeholder={pendingImageFile ? "Légende (optionnel)…" : "Écrire un message…"}
                      style={{ flex: 1, background: "none", border: "none", padding: "10px 0", fontSize: 13.5 }}
                    />
                    <button onClick={handleSend} disabled={sending || (!messageText.trim() && !pendingImageFile)} className="tap" style={{ background: gold, color: "#080812", border: "none", borderRadius: "50%", width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: sending || (!messageText.trim() && !pendingImageFile) ? 0.5 : 1 }}>
                      {sending ? <YelenLoader size={14} color="#080812"/> : Ic.Send()}
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
