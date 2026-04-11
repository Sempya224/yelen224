"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";
import {
  notifierAnnulation,
  notifierReport,
  verifierRappels,
  peutTerminerRdv,
  fetchNotifications,
  marquerNotifsLues,
  countNotifsNonLues,
  type RdvComplet,
} from "@/lib/notifications";

// ─── Types ────────────────────────────────────────────────────────────────────

type Rdv = {
  id: string;
  date_rdv: string;
  heure_rdv: string;
  objet: string | null;
  statut: string;
  pour_autre: boolean;
  nom_autre: string | null;
  phone_autre: string | null;
  presence: boolean;
  created_at: string;
  motif_annulation: string | null;
  motif_report: string | null;
  avis_demande: boolean;
  institutions: {
    id: string;
    name: string;
    category: string;
    logo: string | null;
    ville: string | null;
    badge_verifie: boolean;
  } | null;
  unreadCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};

type Notif = {
  id: string;
  type: string;
  titre: string;
  message: string;
  lu: boolean;
  rdv_id: string | null;
  created_at: string;
};

type ModalType =
  | { type: "annuler"; rdv: Rdv }
  | { type: "reporter"; rdv: Rdv }
  | { type: "avis"; rdv: Rdv }
  | { type: "notifs" }
  | null;

// ─── Statut config ────────────────────────────────────────────────────────────

const STATUT: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  confirme:   { label: "Confirmé",   color: "#34D399", bg: "rgba(52,211,153,0.12)",  dot: "#34D399" },
  en_attente: { label: "En attente", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  dot: "#F59E0B" },
  annule:     { label: "Annulé",     color: "#F87171", bg: "rgba(248,113,113,0.12)", dot: "#F87171" },
  termine:    { label: "Terminé",    color: "#A78BFA", bg: "rgba(167,139,250,0.12)", dot: "#A78BFA" },
  absent:     { label: "Absent",     color: "#9CA3AF", bg: "rgba(156,163,175,0.12)", dot: "#9CA3AF" },
};

const NOTIF_ICON: Record<string, string> = {
  confirmation: "✅", rappel_24h: "⏰", rappel_30min: "🔔",
  heure_rdv: "🟢", rdv_termine: "🏁", rdv_annule: "❌",
  rdv_reporte: "🔄", rdv_depasse: "⚠️", message: "💬", avis: "⭐",
};

// ─── Helpers — FIX TIMEZONE ───────────────────────────────────────────────────
// new Date("2026-04-01") = minuit UTC = 31 mars 20h en EST → bug timezone
// new Date(2026, 3, 1)   = minuit heure locale → correct partout

function parseDateLocale(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isPasse(dateStr: string): boolean {
  const d = parseDateLocale(dateStr);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

function getDaysUntil(dateStr: string): number {
  const d = parseDateLocale(dateStr);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function formatRelative(dateStr: string): string {
  const days = getDaysUntil(dateStr);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  if (days === -1) return "Hier";
  if (days > 1 && days <= 7) return `Dans ${days} jours`;
  if (days < -1 && days >= -7) return `Il y a ${Math.abs(days)} jours`;
  return parseDateLocale(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function formatMsgTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "À l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MesRdvPage() {
  const router = useRouter();

  const [rdvs, setRdvs]           = useState<Rdv[]>([]);
  const [loading, setLoading]     = useState(true);
  const [userId, setUserId]       = useState<string | null>(null);
  const [tab, setTab]             = useState<"avenir" | "historique">("avenir");
  const [modal, setModal]         = useState<ModalType>(null);
  const [motif, setMotif]         = useState("");
  const [nouvelleDate, setNouvelleDate] = useState("");
  const [nouvelleHeure, setNouvelleHeure] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [notifs, setNotifs]       = useState<Notif[]>([]);
  const [nbNotifs, setNbNotifs]   = useState(0);
  const [avisNote, setAvisNote]   = useState(0);
  const [avisCommentaire, setAvisCommentaire] = useState("");
  const [avisEnvoye, setAvisEnvoye] = useState(false);
  const channelRef = useRef<any>(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch RDVs ─────────────────────────────────────────────────────────────
  const fetchRdvs = useCallback(async (uid?: string) => {
    const id = uid || userId;
    if (!id) return;

    const { data } = await supabase
      .from("rdv")
      .select(`
        id, date_rdv, heure_rdv, objet, statut,
        pour_autre, nom_autre, phone_autre, presence, created_at,
        motif_annulation, motif_report, avis_demande,
        institutions ( id, name, category, logo, ville, badge_verifie )
      `)
      .eq("citoyen_id", id)
      .order("date_rdv", { ascending: false });

    const list = (data as unknown as Rdv[]) || [];

    const enriched = await Promise.all(
      list.map(async (rdv) => {
        const [unreadRes, lastMsgRes] = await Promise.all([
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("rdv_id", rdv.id)
            .eq("destinataire_id", id)
            .eq("lu", false),
          supabase
            .from("messages")
            .select("contenu, created_at")
            .eq("rdv_id", rdv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        return {
          ...rdv,
          unreadCount: unreadRes.count || 0,
          lastMessage: lastMsgRes.data?.contenu || null,
          lastMessageAt: lastMsgRes.data?.created_at || null,
        };
      })
    );

    setRdvs(enriched);
    setLoading(false);
  }, [userId]);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = localStorage.getItem(YELEN224_USER_ID_KEY);
    if (!uid) { router.push("/login"); return; }
    setUserId(uid);
    fetchRdvs(uid);

    fetchNotifications(uid, 30).then(data => {
      setNotifs(data as Notif[]);
      setNbNotifs(data.filter((n: any) => !n.lu).length);
    });

    verifierRappels(uid, "citoyen").catch(console.error);

    const channel = supabase
      .channel("mes-rdv-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "rdv" },
        () => fetchRdvs(uid))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },
        () => fetchRdvs(uid))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications",
        filter: `destinataire_id=eq.${uid}` },
        (payload) => {
          setNotifs(prev => [payload.new as Notif, ...prev]);
          setNbNotifs(n => n + 1);
        })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Annuler ────────────────────────────────────────────────────────────────
  async function handleAnnuler() {
    if (!modal || modal.type !== "annuler" || !motif.trim() || !userId) return;
    const rdv = modal.rdv;
    setActionLoading(rdv.id);
    try {
      const rdvComplet: RdvComplet = {
        id: rdv.id,
        date_rdv: rdv.date_rdv,
        heure_rdv: rdv.heure_rdv,
        objet: rdv.objet,
        statut: rdv.statut,
        citoyen_id: userId,
        institution_id: rdv.institutions!.id,
        institution: { name: rdv.institutions!.name },
      };
      await notifierAnnulation(rdvComplet, userId, "citoyen", motif.trim());
      showToast("Rendez-vous annulé avec succès.");
    } catch {
      showToast("Erreur lors de l'annulation.", false);
    }
    await fetchRdvs();
    setActionLoading(null);
    setModal(null);
    setMotif("");
  }

  // ── Reporter ───────────────────────────────────────────────────────────────
  async function handleReporter() {
    if (!modal || modal.type !== "reporter" || !motif.trim() || !nouvelleDate || !nouvelleHeure || !userId) return;
    const rdv = modal.rdv;
    setActionLoading(rdv.id);
    try {
      const rdvComplet: RdvComplet = {
        id: rdv.id,
        date_rdv: rdv.date_rdv,
        heure_rdv: rdv.heure_rdv,
        objet: rdv.objet,
        statut: rdv.statut,
        citoyen_id: userId,
        institution_id: rdv.institutions!.id,
        institution: { name: rdv.institutions!.name },
      };
      await notifierReport(rdvComplet, userId, "citoyen", motif.trim(), nouvelleDate, nouvelleHeure);
      showToast("Rendez-vous reporté avec succès.");
    } catch {
      showToast("Erreur lors du report.", false);
    }
    await fetchRdvs();
    setActionLoading(null);
    setModal(null);
    setMotif("");
    setNouvelleDate("");
    setNouvelleHeure("");
  }

  // ── Envoyer avis ───────────────────────────────────────────────────────────
  async function handleEnvoyerAvis() {
    if (!modal || modal.type !== "avis" || avisNote === 0 || !userId) return;
    const rdv = modal.rdv;
    setActionLoading(rdv.id);
    try {
      await supabase.from("avis").insert({
        institution_id: rdv.institutions!.id,
        citoyen_id: userId,
        rdv_id: rdv.id,
        note: avisNote,
        commentaire: avisCommentaire.trim() || null,
      });
      await supabase.from("rdv").update({ avis_demande: false }).eq("id", rdv.id);
      setAvisEnvoye(true);
      showToast("Avis envoyé, merci !");
      setTimeout(() => {
        setModal(null);
        setAvisNote(0);
        setAvisCommentaire("");
        setAvisEnvoye(false);
        fetchRdvs();
      }, 1800);
    } catch {
      showToast("Erreur lors de l'envoi.", false);
    }
    setActionLoading(null);
  }

  // ── Listes filtrées ────────────────────────────────────────────────────────
  const rdvsAvenir = rdvs.filter(r =>
    !isPasse(r.date_rdv) && r.statut !== "annule" && r.statut !== "termine"
  );
  const rdvsHistorique = rdvs.filter(r =>
    isPasse(r.date_rdv) || r.statut === "annule" || r.statut === "termine"
  );
  const displayed = tab === "avenir" ? rdvsAvenir : rdvsHistorique;
  const totalUnread = rdvs.reduce((s, r) => s + (r.unreadCount || 0), 0);
  const rdvsAvisDemande = rdvs.filter(r => r.avis_demande && r.statut === "termine");

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100svh", background: "#070B14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "-apple-system,sans-serif" }}>
      <div style={{ width: 40, height: 40, border: "3px solid rgba(245,158,11,0.15)", borderTopColor: "#F59E0B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
      <p style={{ color: "#475569", fontSize: 14 }}>Chargement...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100svh", background: "#070B14", color: "#E8ECF4", fontFamily: "-apple-system,'SF Pro Text','Helvetica Neue',sans-serif", paddingBottom: 100 }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
        html,body{background:#070B14;overflow-x:hidden}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
        @keyframes shimmer{0%{background-position:-300px 0}100%{background-position:300px 0}}
        .tap{transition:opacity 0.1s,transform 0.1s;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .tap:active{opacity:0.65;transform:scale(0.96)}
        textarea,input{font-family:inherit;color:#F1F5F9}
        textarea:focus,input:focus{outline:none}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(0.5)}
        input[type=time]::-webkit-calendar-picker-indicator{filter:invert(1) opacity(0.5)}
      `}</style>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header style={{ position: "sticky", top: 0, zIndex: 200, background: "rgba(7,11,20,0.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
        <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => router.back()} className="tap" style={{ background: "none", border: "none", color: "#64748B", padding: "4px 8px 4px 0", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>←</button>
            <div>
              <div style={{ color: "#F59E0B", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Yelen224</div>
              <div style={{ color: "#F1F5F9", fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>Mes RDV</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {totalUnread > 0 && (
              <button onClick={() => router.push("/messagerie-list")} className="tap" style={{ position: "relative", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style={{ position: "absolute", top: -4, right: -4, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 900, width: 17, height: 17, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #070B14" }}>
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              </button>
            )}

            <button onClick={() => { setModal({ type: "notifs" }); marquerNotifsLues(userId!).then(() => setNbNotifs(0)); }} className="tap" style={{ position: "relative", background: nbNotifs > 0 ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${nbNotifs > 0 ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={nbNotifs > 0 ? "#F59E0B" : "#64748B"} strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {nbNotifs > 0 && (
                <span style={{ position: "absolute", top: -4, right: -4, background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 900, width: 17, height: 17, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #070B14", animation: "pulse 2s infinite" }}>
                  {nbNotifs > 9 ? "9+" : nbNotifs}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ══ CTA AVIS ════════════════════════════════════════════════════════ */}
      {rdvsAvisDemande.length > 0 && (
        <div style={{ margin: "12px 16px 0" }}>
          {rdvsAvisDemande.slice(0, 1).map(rdv => (
            <div key={rdv.id} onClick={() => { setModal({ type: "avis", rdv }); setAvisNote(0); setAvisCommentaire(""); setAvisEnvoye(false); }} className="tap" style={{ background: "linear-gradient(135deg,rgba(167,139,250,0.12),rgba(245,158,11,0.08))", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 16, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>⭐</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#F1F5F9", fontSize: 14, fontWeight: 800, marginBottom: 2 }}>Donnez votre avis !</div>
                <div style={{ color: "#94A3B8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Votre RDV chez {rdv.institutions?.name} est terminé</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
          ))}
        </div>
      )}

      {/* ══ STATS ════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "14px 16px 0" }}>
        {[
          { n: rdvs.length,                                     l: "Total",    c: "#60A5FA" },
          { n: rdvsAvenir.length,                               l: "À venir",  c: "#F59E0B" },
          { n: rdvs.filter(r => r.statut === "termine").length, l: "Terminés", c: "#34D399" },
          { n: totalUnread,                                     l: "Non lus",  c: totalUnread > 0 ? "#EF4444" : "#475569" },
        ].map((s, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ color: s.c, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{s.n}</div>
            <div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* ══ TABS ═════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 8, padding: "14px 16px 0" }}>
        {(["avenir", "historique"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="tap" style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "none", background: tab === t ? "#F59E0B" : "rgba(255,255,255,0.04)", color: tab === t ? "#080812" : "#64748B", fontSize: 13, fontWeight: tab === t ? 800 : 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {t === "avenir" ? "📅 À venir" : "🕐 Historique"}
            <span style={{ background: tab === t ? "rgba(8,8,18,0.2)" : "rgba(255,255,255,0.07)", borderRadius: 20, padding: "1px 7px", fontSize: 11 }}>
              {t === "avenir" ? rdvsAvenir.length : rdvsHistorique.length}
            </span>
          </button>
        ))}
      </div>

      {/* ══ LISTE RDV ════════════════════════════════════════════════════════ */}
      <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>

        {displayed.length === 0 && (
          <div style={{ textAlign: "center", padding: "56px 24px", animation: "fadeUp 0.3s ease" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>{tab === "avenir" ? "📭" : "🕐"}</div>
            <div style={{ color: "#64748B", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              {tab === "avenir" ? "Aucun RDV à venir" : "Aucun historique"}
            </div>
            <div style={{ color: "#334155", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              {tab === "avenir" ? "Prenez rendez-vous depuis la carte des institutions." : "Vos anciens RDV apparaîtront ici."}
            </div>
            {tab === "avenir" && (
              <button onClick={() => router.push("/recherche")} className="tap" style={{ background: "#F59E0B", color: "#080812", border: "none", borderRadius: 12, padding: "13px 28px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                Trouver une institution
              </button>
            )}
          </div>
        )}

        {displayed.map((rdv) => {
          const cfg = STATUT[rdv.statut] ?? STATUT.en_attente;
          const inst = rdv.institutions;
          const days = getDaysUntil(rdv.date_rdv);
          const hasUnread = (rdv.unreadCount || 0) > 0;
          const canChat = rdv.statut === "confirme" || rdv.statut === "en_attente" || rdv.statut === "termine";
          const canAct = tab === "avenir" && rdv.statut !== "annule" && rdv.statut !== "termine";

          let urgencyColor = "transparent";
          if (tab === "avenir") {
            if (days === 0) urgencyColor = "#EF4444";
            else if (days <= 2) urgencyColor = "#F59E0B";
            else if (days <= 7) urgencyColor = "#34D399";
          }

          return (
            <div key={rdv.id} style={{ background: hasUnread ? "rgba(245,158,11,0.04)" : "rgba(255,255,255,0.025)", border: `1px solid ${hasUnread ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius: 18, overflow: "hidden", animation: "fadeUp 0.25s ease" }}>

              <div style={{ height: 3, background: urgencyColor, opacity: urgencyColor !== "transparent" ? 0.8 : 0 }}/>

              <div style={{ padding: "14px 16px 10px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 13, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#F59E0B", overflow: "hidden" }}>
                    {inst?.logo
                      ? <img src={inst.logo} alt={inst.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      : getInitials(inst?.name ?? "?")}
                  </div>
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: cfg.dot, border: "2px solid #070B14" }}/>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#F1F5F9", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inst?.name ?? "Institution"}</div>
                      <div style={{ color: "#64748B", fontSize: 11, marginTop: 1 }}>{inst?.category ?? ""}{inst?.ville ? ` · ${inst.ville}` : ""}</div>
                    </div>
                    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0 }}>{cfg.label}</span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, background: days === 0 ? "rgba(239,68,68,0.08)" : days <= 3 && tab === "avenir" ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${days === 0 ? "rgba(239,68,68,0.2)" : days <= 3 && tab === "avenir" ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.06)"}`, color: days === 0 ? "#FCA5A5" : days <= 3 && tab === "avenir" ? "#FCD34D" : "#94A3B8", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 7 }}>
                      📅 {formatRelative(rdv.date_rdv)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#94A3B8", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 7 }}>
                      🕐 {rdv.heure_rdv}
                    </span>
                  </div>
                </div>
              </div>

              {rdv.objet && (
                <div style={{ margin: "0 16px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Objet</div>
                  <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.5 }}>{rdv.objet}</div>
                </div>
              )}

              {rdv.motif_annulation && (
                <div style={{ margin: "0 16px 10px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ color: "#F87171", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Motif d'annulation</div>
                  <div style={{ color: "#FCA5A5", fontSize: 12, lineHeight: 1.5 }}>{rdv.motif_annulation}</div>
                </div>
              )}

              {rdv.motif_report && (
                <div style={{ margin: "0 16px 10px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 10, padding: "8px 12px" }}>
                  <div style={{ color: "#F59E0B", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Motif du report</div>
                  <div style={{ color: "#FCD34D", fontSize: 12, lineHeight: 1.5 }}>{rdv.motif_report}</div>
                </div>
              )}

              {rdv.lastMessage && canChat && (
                <div onClick={() => router.push(`/messagerie?rdv_id=${rdv.id}`)} className="tap" style={{ margin: "0 16px 10px", background: hasUnread ? "rgba(96,165,250,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${hasUnread ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.05)"}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(96,165,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: hasUnread ? "#CBD5E1" : "#64748B", fontSize: 12, fontWeight: hasUnread ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rdv.lastMessage}</div>
                  </div>
                  {rdv.lastMessageAt && <span style={{ color: "#334155", fontSize: 10, flexShrink: 0 }}>{formatMsgTime(rdv.lastMessageAt)}</span>}
                  {hasUnread && (
                    <span style={{ background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0, animation: "pulse 2s infinite" }}>
                      {rdv.unreadCount}
                    </span>
                  )}
                </div>
              )}

              {rdv.avis_demande && rdv.statut === "termine" && (
                <div onClick={() => { setModal({ type: "avis", rdv }); setAvisNote(0); setAvisCommentaire(""); setAvisEnvoye(false); }} className="tap" style={{ margin: "0 16px 10px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 12, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>⭐</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#A78BFA", fontSize: 13, fontWeight: 700 }}>Laisser un avis</div>
                    <div style={{ color: "#64748B", fontSize: 11 }}>Votre expérience compte pour la communauté</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              )}

              {canChat && !rdv.lastMessage && (
                <div style={{ margin: "0 16px 10px" }}>
                  <button onClick={() => router.push(`/messagerie?rdv_id=${rdv.id}`)} className="tap" style={{ width: "100%", padding: "11px", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 12, color: "#60A5FA", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Contacter l'institution
                  </button>
                </div>
              )}

              {canAct && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                  <button onClick={() => { setModal({ type: "annuler", rdv }); setMotif(""); }} className="tap" style={{ padding: "13px 8px", background: "transparent", border: "none", borderRight: "1px solid rgba(255,255,255,0.05)", color: "#F87171", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Annuler
                  </button>
                  <button onClick={() => { setModal({ type: "reporter", rdv }); setMotif(""); setNouvelleDate(""); setNouvelleHeure(""); }} className="tap" style={{ padding: "13px 8px", background: "transparent", border: "none", color: "#F59E0B", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Reporter
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ══ BOUTON NOUVEAU RDV ═══════════════════════════════════════════════ */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100 }}>
        <button onClick={() => router.push("/recherche")} className="tap" style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#F59E0B,#D97706)", border: "none", boxShadow: "0 6px 24px rgba(245,158,11,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#080812" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      {/* ══ TOAST ════════════════════════════════════════════════════════════ */}
      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", padding: "12px 22px", borderRadius: 14, fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", background: toast.ok ? "#0F2A1A" : "#2A0F0F", border: `1px solid ${toast.ok ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, color: toast.ok ? "#34D399" : "#F87171", animation: "slideUp 0.25s ease" }}>
          {toast.ok ? "✓  " : "✕  "}{toast.msg}
        </div>
      )}

      {/* ══ MODAL ANNULER ════════════════════════════════════════════════════ */}
      {modal?.type === "annuler" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px 24px 0 0", padding: "8px 0 0", width: "100%", maxWidth: 480, animation: "slideUp 0.28s ease" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", margin: "0 auto 20px" }}/>
            <div style={{ padding: "0 24px 40px" }}>
              <div style={{ color: "#F87171", fontSize: 20, fontWeight: 900, marginBottom: 6 }}>❌ Annuler le RDV</div>
              <div style={{ color: "#64748B", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                RDV chez <strong style={{ color: "#F1F5F9" }}>{modal.rdv.institutions?.name}</strong> le {formatRelative(modal.rdv.date_rdv)} à {modal.rdv.heure_rdv}
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#64748B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Motif d'annulation <span style={{ color: "#F87171" }}>*obligatoire</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {["Empêchement personnel", "Problème de santé", "Déplacement annulé", "Changement de plans"].map(m => (
                    <button key={m} onClick={() => setMotif(m)} className="tap" style={{ padding: "10px 14px", background: motif === m ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${motif === m ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, color: motif === m ? "#FCA5A5" : "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ou écrivez votre motif..." rows={2}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", lineHeight: 1.5, color: "#F1F5F9" }}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <button onClick={() => setModal(null)} className="tap" style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>Retour</button>
                <button onClick={handleAnnuler} disabled={!motif.trim() || actionLoading === modal.rdv.id} className="tap" style={{ padding: 14, borderRadius: 14, border: "none", background: motif.trim() ? "#F87171" : "rgba(248,113,113,0.2)", color: motif.trim() ? "#fff" : "#F87171", fontSize: 14, fontWeight: 800, cursor: motif.trim() ? "pointer" : "not-allowed" }}>
                  {actionLoading === modal.rdv.id ? "..." : "Confirmer l'annulation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REPORTER ═══════════════════════════════════════════════════ */}
      {modal?.type === "reporter" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px 24px 0 0", padding: "8px 0 0", width: "100%", maxWidth: 480, animation: "slideUp 0.28s ease" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", margin: "0 auto 20px" }}/>
            <div style={{ padding: "0 24px 40px" }}>
              <div style={{ color: "#F59E0B", fontSize: 20, fontWeight: 900, marginBottom: 6 }}>🔄 Reporter le RDV</div>
              <div style={{ color: "#64748B", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                RDV actuel : <strong style={{ color: "#F1F5F9" }}>{formatRelative(modal.rdv.date_rdv)} à {modal.rdv.heure_rdv}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div>
                  <div style={{ color: "#64748B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Nouvelle date</div>
                  <input type="date" value={nouvelleDate} min={new Date().toISOString().split("T")[0]} onChange={e => setNouvelleDate(e.target.value)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#F1F5F9" }}/>
                </div>
                <div>
                  <div style={{ color: "#64748B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Nouvelle heure</div>
                  <input type="time" value={nouvelleHeure} onChange={e => setNouvelleHeure(e.target.value)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#F1F5F9" }}/>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#64748B", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Motif du report <span style={{ color: "#F87171" }}>*obligatoire</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {["Conflit d'horaires", "Raison professionnelle", "Raison médicale", "Voyage/déplacement"].map(m => (
                    <button key={m} onClick={() => setMotif(m)} className="tap" style={{ padding: "10px 14px", background: motif === m ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${motif === m ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, color: motif === m ? "#FCD34D" : "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ou écrivez votre motif..." rows={2}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", lineHeight: 1.5, color: "#F1F5F9" }}/>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <button onClick={() => setModal(null)} className="tap" style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>Retour</button>
                <button onClick={handleReporter} disabled={!motif.trim() || !nouvelleDate || !nouvelleHeure || actionLoading === modal.rdv.id} className="tap" style={{ padding: 14, borderRadius: 14, border: "none", background: (motif.trim() && nouvelleDate && nouvelleHeure) ? "#F59E0B" : "rgba(245,158,11,0.2)", color: (motif.trim() && nouvelleDate && nouvelleHeure) ? "#080812" : "#F59E0B", fontSize: 14, fontWeight: 800, cursor: (motif.trim() && nouvelleDate && nouvelleHeure) ? "pointer" : "not-allowed" }}>
                  {actionLoading === modal.rdv.id ? "..." : "Confirmer le report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL AVIS ═══════════════════════════════════════════════════════ */}
      {modal?.type === "avis" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px 24px 0 0", padding: "8px 0 0", width: "100%", maxWidth: 480, animation: "slideUp 0.28s ease" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", margin: "0 auto 20px" }}/>
            <div style={{ padding: "0 24px 40px" }}>
              {!avisEnvoye ? (
                <>
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 42, marginBottom: 10 }}>⭐</div>
                    <div style={{ color: "#F1F5F9", fontSize: 19, fontWeight: 800, marginBottom: 4 }}>Votre avis compte !</div>
                    <div style={{ color: "#64748B", fontSize: 13, lineHeight: 1.6 }}>Comment s'est passé votre RDV chez <strong style={{ color: "#F1F5F9" }}>{modal.rdv.institutions?.name}</strong> ?</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setAvisNote(n)} className="tap" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 38, opacity: n <= avisNote ? 1 : 0.2, transition: "all 0.15s", transform: n <= avisNote ? "scale(1.1)" : "scale(1)" }}>⭐</button>
                    ))}
                  </div>
                  {avisNote > 0 && (
                    <div style={{ textAlign: "center", color: ["","#F87171","#FB923C","#FBBF24","#34D399","#34D399"][avisNote], fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
                      {["","Très mauvais","Décevant","Correct","Bien","Excellent !"][avisNote]}
                    </div>
                  )}
                  <textarea value={avisCommentaire} onChange={e => setAvisCommentaire(e.target.value)} placeholder="Commentaire (optionnel)..." rows={3}
                    style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", fontSize: 13, resize: "none", lineHeight: 1.5, color: "#F1F5F9", marginBottom: 20 }}/>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                    <button onClick={() => setModal(null)} className="tap" style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>Plus tard</button>
                    <button onClick={handleEnvoyerAvis} disabled={avisNote === 0 || actionLoading !== null} className="tap" style={{ padding: 14, borderRadius: 14, border: "none", background: avisNote > 0 ? "#F59E0B" : "rgba(245,158,11,0.2)", color: avisNote > 0 ? "#080812" : "#F59E0B", fontSize: 14, fontWeight: 800, cursor: avisNote > 0 ? "pointer" : "not-allowed" }}>
                      {actionLoading !== null ? "Envoi..." : "Envoyer mon avis"}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
                  <div style={{ fontSize: 48, marginBottom: 14 }}>✅</div>
                  <div style={{ color: "#34D399", fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Merci pour votre avis !</div>
                  <div style={{ color: "#64748B", fontSize: 13, lineHeight: 1.6 }}>Votre évaluation aide toute la communauté Yelen224.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL NOTIFICATIONS ══════════════════════════════════════════════ */}
      {modal?.type === "notifs" && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, maxHeight: "80svh", display: "flex", flexDirection: "column", animation: "slideUp 0.28s ease" }}>
            <div style={{ padding: "12px 24px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", margin: "0 auto 16px" }}/>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 800 }}>🔔 Notifications</div>
                <button onClick={() => setModal(null)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748B", fontSize: 14 }}>✕</button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifs.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔕</div>
                  <div style={{ color: "#475569", fontSize: 14 }}>Aucune notification</div>
                </div>
              ) : notifs.map((n, i) => (
                <div key={n.id} onClick={() => { if (n.rdv_id) { router.push(`/messagerie?rdv_id=${n.rdv_id}`); setModal(null); } }} style={{ padding: "14px 20px", borderBottom: i < notifs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: n.lu ? "transparent" : "rgba(245,158,11,0.03)", cursor: n.rdv_id ? "pointer" : "default", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                    {NOTIF_ICON[n.type] || "📌"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#F1F5F9", fontSize: 13, fontWeight: n.lu ? 500 : 700, marginBottom: 3 }}>{n.titre}</div>
                    <div style={{ color: "#64748B", fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>{n.message}</div>
                    <div style={{ color: "#334155", fontSize: 10 }}>{formatMsgTime(n.created_at)}</div>
                  </div>
                  {!n.lu && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", flexShrink: 0, marginTop: 5 }}/>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}