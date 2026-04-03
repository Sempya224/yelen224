"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type Message = {
  id: string;
  expediteur_id: string;
  destinataire_id: string;
  contenu: string;
  image_url: string | null;
  lu: boolean;
  created_at: string;
};

type RDVInfo = {
  id: string;
  objet: string | null;
  date_rdv: string;
  heure_rdv: string;
  statut: string;
  citoyen_id: string;
  institution_id: string;
  conversation_terminee: boolean;
  citoyen: {
    nom: string | null;
    prenom: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function formatDateLabel(d: string) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
function groupByDate(msgs: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let cur = "";
  msgs.forEach(m => {
    const d = m.created_at.split("T")[0];
    if (d !== cur) { cur = d; groups.push({ date: d, messages: [m] }); }
    else groups[groups.length - 1].messages.push(m);
  });
  return groups;
}
function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function formatLastSeen(d: string | null) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return "vu à l'instant";
  if (min < 60) return `vu il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vu il y a ${h}h`;
  return `vu il y a ${Math.floor(h / 24)}j`;
}

const STATUT_COLORS: Record<string, string> = {
  confirme: "#34D399", termine: "#A78BFA",
  annule: "#F87171", en_attente: "#F59E0B", absent: "#9CA3AF",
};
const STATUT_LABELS: Record<string, string> = {
  confirme: "Confirmé", termine: "Terminé",
  annule: "Annulé", en_attente: "En attente", absent: "Absent",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function MesagerieInstitution() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rdvId = searchParams.get("rdv_id");

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const presenceInterval = useRef<NodeJS.Timeout | null>(null);

  const [rdv, setRdv] = useState<RDVInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contenu, setContenu] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [citoyenOnline, setCitoyenOnline] = useState(false);
  const [citoyenLastSeen, setCitoyenLastSeen] = useState<string | null>(null);
  const [citoyenTyping, setCitoyenTyping] = useState(false);
  const [showImageFull, setShowImageFull] = useState<string | null>(null);
  const [showTerminerConfirm, setShowTerminerConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const instId = localStorage.getItem("yelen224_institution_id");
    if (!instId) { router.push("/institution/connexion"); return; }
    setInstitutionId(instId);
    if (!rdvId) { setError("RDV introuvable."); setLoading(false); return; }

    fetchRDV(rdvId, instId);
    fetchMessages(rdvId, instId);
    updatePresence(instId, true);

    presenceInterval.current = setInterval(() => updatePresence(instId, true), 30000);

    // Realtime messages
    const chMsg = supabase.channel(`inst_msg_${rdvId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `rdv_id=eq.${rdvId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => [...prev, msg]);
        if (msg.destinataire_id === instId) {
          supabase.from("messages").update({ lu: true }).eq("id", msg.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `rdv_id=eq.${rdvId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, lu: (payload.new as Message).lu } : m
        ));
      })
      .subscribe();

    // Realtime présence citoyen
    const chPres = supabase.channel(`inst_pres_${rdvId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" },
        (payload) => {
          const p = payload.new as any;
          if (p?.user_type === "citoyen") {
            const online = p.en_ligne && (Date.now() - new Date(p.derniere_activite).getTime()) < 60000;
            setCitoyenOnline(online);
            setCitoyenLastSeen(p.derniere_activite);
          }
        })
      .subscribe();

    // Realtime frappe citoyen
    const chType = supabase.channel(`inst_type_${rdvId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "typing_indicator",
        filter: `rdv_id=eq.${rdvId}`,
      }, (payload) => {
        const t = payload.new as any;
        if (t?.user_id !== instId) setCitoyenTyping(t?.is_typing || false);
      })
      .subscribe();

    // Realtime rdv
    const chRdv = supabase.channel(`inst_rdv_${rdvId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "rdv",
        filter: `id=eq.${rdvId}`,
      }, (payload) => {
        const u = payload.new as any;
        setRdv(prev => prev ? { ...prev, statut: u.statut, conversation_terminee: u.conversation_terminee } : prev);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chMsg);
      supabase.removeChannel(chPres);
      supabase.removeChannel(chType);
      supabase.removeChannel(chRdv);
      updatePresence(instId, false);
      if (presenceInterval.current) clearInterval(presenceInterval.current);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      stopTyping(instId, rdvId);
    };
  }, [rdvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, citoyenTyping]);

  // ── Helpers async ─────────────────────────────────────────────────────────
  const updatePresence = async (uid: string, online: boolean) => {
    await supabase.from("presence").upsert(
      { user_id: uid, user_type: "institution", en_ligne: online, derniere_activite: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  };

  const startTyping = async (uid: string) => {
    if (!rdvId) return;
    await supabase.from("typing_indicator").upsert(
      { rdv_id: rdvId, user_id: uid, is_typing: true, updated_at: new Date().toISOString() },
      { onConflict: "rdv_id,user_id" }
    );
  };

  const stopTyping = async (uid: string | null, rid: string | null) => {
    if (!uid || !rid) return;
    await supabase.from("typing_indicator").upsert(
      { rdv_id: rid, user_id: uid, is_typing: false, updated_at: new Date().toISOString() },
      { onConflict: "rdv_id,user_id" }
    );
  };

  const fetchRDV = async (id: string, instId: string) => {
    const { data } = await supabase.from("rdv")
      .select("id, objet, date_rdv, heure_rdv, statut, citoyen_id, institution_id, conversation_terminee")
      .eq("id", id).single();

    if (!data) { setError("RDV introuvable."); setLoading(false); return; }
    // Sécurité
    if (data.institution_id !== instId) { router.push("/institution/dashboard"); return; }

    const { data: citoyen } = await supabase.from("users")
      .select("nom, prenom, phone, avatar_url")
      .eq("id", data.citoyen_id).maybeSingle();

    setRdv({ ...data, citoyen: citoyen || null });
    setLoading(false);

    // Présence citoyen
    const { data: pres } = await supabase.from("presence")
      .select("*").eq("user_id", data.citoyen_id).maybeSingle();
    if (pres) {
      const online = pres.en_ligne && (Date.now() - new Date(pres.derniere_activite).getTime()) < 60000;
      setCitoyenOnline(online);
      setCitoyenLastSeen(pres.derniere_activite);
    }
  };

  const fetchMessages = async (id: string, instId: string) => {
    const { data } = await supabase.from("messages")
      .select("*").eq("rdv_id", id).order("created_at", { ascending: true });
    setMessages(data || []);
    await supabase.from("messages").update({ lu: true })
      .eq("rdv_id", id).eq("destinataire_id", instId);
  };

  // ── Envoi ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!contenu.trim() && !imageFile) return;
    if (!rdv || !institutionId || rdv.conversation_terminee) return;
    setSending(true);
    stopTyping(institutionId, rdvId);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `messages/${rdvId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("documents").upload(path, imageFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }
      await supabase.from("messages").insert({
        rdv_id: rdvId,
        expediteur_id: institutionId,
        destinataire_id: rdv.citoyen_id,
        contenu: contenu.trim(),
        image_url: imageUrl,
        lu: false,
      });
      setContenu(""); setImageFile(null); setImagePreview(null);
    } finally { setSending(false); }
  };

  const handleTyping = (val: string) => {
    setContenu(val);
    if (!institutionId) return;
    startTyping(institutionId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopTyping(institutionId, rdvId), 2000);
  };

  // ── Actions RDV ───────────────────────────────────────────────────────────
  const terminerConversation = async () => {
    if (!rdvId) return;
    setActionLoading(true);
    await supabase.from("rdv").update({ conversation_terminee: true }).eq("id", rdvId);
    setShowTerminerConfirm(false);
    setActionLoading(false);
    showToast("Conversation terminée.");
  };

  const confirmerRdv = async () => {
    if (!rdvId) return;
    await supabase.from("rdv").update({ statut: "confirme" }).eq("id", rdvId);
    showToast("RDV confirmé ✓");
  };

  // ── Render guards ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#070B14", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 38, height: 38, border: "3px solid rgba(96,165,250,0.2)", borderTopColor: "#60A5FA", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#070B14", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#F87171", fontSize: 16, marginBottom: 20 }}>{error}</p>
        <button onClick={() => router.back()} style={{ background: "#60A5FA", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>Retour</button>
      </div>
    </div>
  );

  const citoyenName = rdv?.citoyen
    ? [rdv.citoyen.prenom, rdv.citoyen.nom].filter(Boolean).join(" ") || rdv.citoyen.phone || "Citoyen"
    : "Citoyen";
  const citoyenInitials = getInitials(citoyenName);
  const convTerminee = rdv?.conversation_terminee;
  const statutColor = STATUT_COLORS[rdv?.statut || ""] || "#60A5FA";
  const groups = groupByDate(messages);
  const isEnAttente = rdv?.statut === "en_attente";

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#070B14;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes toastIn{from{transform:translateX(-50%) translateY(16px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        .msg-in{animation:fadeUp 0.18s ease;}
        textarea:focus{outline:none;}
        textarea::placeholder{color:#1E3A5F;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(96,165,250,0.15);border-radius:2px;}
        .tdot{width:6px;height:6px;border-radius:50%;background:#64748B;display:inline-block;}
        .tdot:nth-child(1){animation:pulse 1.2s ease infinite 0s;}
        .tdot:nth-child(2){animation:pulse 1.2s ease infinite 0.2s;}
        .tdot:nth-child(3){animation:pulse 1.2s ease infinite 0.4s;}
      `}</style>

      <div style={{ height: "100vh", background: "#070B14", color: "#E8ECF4", fontFamily: "'Inter',-apple-system,sans-serif", display: "flex", flexDirection: "column" }}>

        {/* ── HEADER INSTITUTION — BLEU ── */}
        <header style={{ flexShrink: 0, background: "rgba(7,11,20,0.98)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(96,165,250,0.12)", padding: "0 16px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", height: 62, display: "flex", alignItems: "center", gap: 12 }}>

            <button onClick={() => router.back()} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 22, cursor: "pointer", padding: 4, flexShrink: 0 }}>←</button>

            {/* Avatar citoyen */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(96,165,250,0.1)", border: "2px solid rgba(96,165,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {rdv?.citoyen?.avatar_url
                  ? <img src={rdv.citoyen.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  : <span style={{ color: "#60A5FA", fontSize: 15, fontWeight: 800 }}>{citoyenInitials}</span>
                }
              </div>
              <div style={{ position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: "50%", background: citoyenOnline ? "#34D399" : "#475569", border: "2px solid #070B14" }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{citoyenName}</span>
                <span style={{ fontSize: 10, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#60A5FA", padding: "1px 7px", borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>CITOYEN</span>
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                {citoyenTyping
                  ? <span style={{ color: "#34D399" }}>✍️ est en train d'écrire...</span>
                  : citoyenOnline
                    ? <span style={{ color: "#34D399" }}>● En ligne</span>
                    : <span>{formatLastSeen(citoyenLastSeen)}</span>
                }
                {rdv?.citoyen?.phone && !citoyenTyping && (
                  <span style={{ marginLeft: 8, color: "#334155" }}>· {rdv.citoyen.phone}</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <span style={{ background: `${statutColor}18`, border: `1px solid ${statutColor}40`, color: statutColor, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                {STATUT_LABELS[rdv?.statut || ""] || rdv?.statut?.toUpperCase()}
              </span>
              {!convTerminee && (
                <button onClick={() => setShowTerminerConfirm(true)}
                  style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 8, cursor: "pointer" }}>
                  🔒 Terminer
                </button>
              )}
            </div>
          </div>

          {/* Bandeau RDV — BLEU côté institution */}
          <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 10 }}>

            {/* Alerte si RDV en attente */}
            {isEnAttente && !convTerminee && (
              <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "9px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ fontSize: 12, color: "#FBBF24", fontWeight: 600 }}>Ce RDV est en attente de confirmation</span>
                </div>
                <button onClick={confirmerRdv}
                  style={{ background: "#F59E0B", border: "none", color: "#0A0E1A", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8, cursor: "pointer", flexShrink: 0 }}>
                  ✓ Confirmer
                </button>
              </div>
            )}

            <div style={{ background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.12)", borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>📅</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9", margin: 0 }}>{rdv?.objet || "Sans objet"}</p>
                  <p style={{ fontSize: 11, color: "#475569", margin: "1px 0 0" }}>
                    {rdv?.date_rdv ? new Date(rdv.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }) : ""} à {rdv?.heure_rdv}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {convTerminee && (
                  <span style={{ fontSize: 11, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", color: "#A78BFA", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>
                    🔒 Terminée
                  </span>
                )}
                <span style={{ color: "#334155", fontSize: 10 }}>#{rdvId?.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── MESSAGES ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>

            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26 }}>💬</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginBottom: 8 }}>Début de la conversation</p>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
                  Répondez directement à <strong style={{ color: "#60A5FA" }}>{citoyenName}</strong> concernant son rendez-vous.<br />
                  Soyez professionnel et réactif.
                </p>
              </div>
            )}

            {groups.map(group => (
              <div key={group.date}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 14px" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                  <span style={{ fontSize: 11, color: "#334155", padding: "3px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)" }}>
                    {formatDateLabel(group.date + "T12:00:00")}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                </div>

                {group.messages.map(msg => {
                  const isMe = msg.expediteur_id === institutionId;
                  return (
                    <div key={msg.id} className="msg-in"
                      style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 6, alignItems: "flex-end", gap: 8 }}>

                      {/* Avatar citoyen (gauche) */}
                      {!isMe && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                          {rdv?.citoyen?.avatar_url
                            ? <img src={rdv.citoyen.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                            : <span style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B" }}>{citoyenInitials}</span>
                          }
                        </div>
                      )}

                      <div style={{ maxWidth: "68%", minWidth: 60 }}>
                        {msg.image_url && (
                          <img src={msg.image_url} onClick={() => setShowImageFull(msg.image_url)}
                            style={{ maxWidth: "100%", borderRadius: 12, display: "block", cursor: "pointer", marginBottom: msg.contenu ? 5 : 0, border: "1px solid rgba(255,255,255,0.07)" }} alt="" />
                        )}
                        {msg.contenu && (
                          <div style={{
                            // INSTITUTION : ses bulles = BLEU, citoyen = AMBRE/JAUNE
                            background: isMe ? "rgba(96,165,250,0.2)" : "#F59E0B",
                            border: isMe ? "1px solid rgba(96,165,250,0.35)" : "none",
                            borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            padding: "10px 14px",
                          }}>
                            <p style={{ color: isMe ? "#BAE6FD" : "#0A0E1A", fontSize: 14, margin: 0, lineHeight: 1.55, wordBreak: "break-word" }}>
                              {msg.contenu}
                            </p>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 4, marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: "#334155" }}>{formatTime(msg.created_at)}</span>
                          {isMe && (
                            <span style={{ fontSize: 11, color: msg.lu ? "#34D399" : "#475569" }}>
                              {msg.lu ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Avatar institution (droite — moi) */}
                      {isMe && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, fontWeight: 700, color: "#60A5FA" }}>
                          Moi
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Indicateur frappe citoyen */}
            {citoyenTyping && (
              <div className="msg-in" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(245,158,11,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>{citoyenInitials}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", display: "flex", gap: 5 }}>
                  <span className="tdot" /><span className="tdot" /><span className="tdot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── ZONE SAISIE INSTITUTION ── */}
        {convTerminee ? (
          <div style={{ flexShrink: 0, borderTop: "1px solid rgba(96,165,250,0.1)", padding: 18, background: "#070B14", textAlign: "center" }}>
            <p style={{ color: "#475569", fontSize: 13 }}>🔒 Conversation terminée — plus aucun message possible.</p>
          </div>
        ) : (
          <>
            {imagePreview && (
              <div style={{ flexShrink: 0, borderTop: "1px solid rgba(96,165,250,0.08)", padding: "10px 16px", background: "#070B14" }}>
                <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={imagePreview} style={{ height: 52, borderRadius: 8, objectFit: "cover" }} alt="" />
                  <p style={{ color: "#64748B", fontSize: 12, flex: 1 }}>{imageFile?.name}</p>
                  <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                    style={{ background: "transparent", border: "none", color: "#F87171", fontSize: 18, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            )}
            <div style={{ flexShrink: 0, borderTop: "1px solid rgba(96,165,250,0.08)", padding: "12px 16px", background: "rgba(7,11,20,0.98)" }}>
              <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "flex-end", gap: 10 }}>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 18 }}>
                  📷
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setImageFile(f); setImagePreview(URL.createObjectURL(f));
                }} style={{ display: "none" }} />

                {/* Zone texte — fond BLEU pour l'institution */}
                <div style={{ flex: 1, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "flex-end" }}>
                  <textarea value={contenu} onChange={e => handleTyping(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Répondre au citoyen..."
                    rows={1}
                    style={{ flex: 1, background: "transparent", border: "none", color: "#F1F5F9", fontSize: 14, resize: "none", lineHeight: 1.5, maxHeight: 120, overflow: "auto" }}
                  />
                </div>

                {/* Bouton envoi BLEU pour institution */}
                <button onClick={handleSend} disabled={sending || (!contenu.trim() && !imageFile)}
                  style={{
                    background: (!contenu.trim() && !imageFile) ? "rgba(96,165,250,0.08)" : "#60A5FA",
                    border: "none", borderRadius: 12, width: 44, height: 44,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: (!contenu.trim() && !imageFile) ? "not-allowed" : "pointer", flexShrink: 0,
                  }}>
                  {sending
                    ? <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    : <span style={{ color: (!contenu.trim() && !imageFile) ? "#60A5FA" : "#fff", fontSize: 18 }}>➤</span>
                  }
                </button>
              </div>
              <p style={{ color: "#1E293B", fontSize: 10, textAlign: "center", marginTop: 7 }}>
                RDV #{rdvId?.slice(0, 8)} · Interface Institution Yelen224
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Image plein écran ── */}
      {showImageFull && (
        <div onClick={() => setShowImageFull(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.93)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <img src={showImageFull} style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12 }} alt="" />
          <button onClick={() => setShowImageFull(null)}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
      )}

      {/* ── Modal Terminer ── */}
      {showTerminerConfirm && (
        <div onClick={() => setShowTerminerConfirm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 420, animation: "slideUp 0.25s ease" }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#F1F5F9", marginBottom: 8 }}>🔒 Terminer la conversation ?</p>
            <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, marginBottom: 8 }}>
              Le citoyen <strong style={{ color: "#60A5FA" }}>{citoyenName}</strong> ne pourra plus envoyer de messages. Il recevra une invitation à laisser un avis.
            </p>
            <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#93C5FD", marginBottom: 20, lineHeight: 1.6 }}>
              ℹ️ Utilisez cette action uniquement quand l'échange est complet et le RDV traité.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowTerminerConfirm(false)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", cursor: "pointer", fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={terminerConversation} disabled={actionLoading}
                style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: "#F87171", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {actionLoading ? "..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0F2A1A", border: "1px solid rgba(52,211,153,0.3)", color: "#34D399", padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 500, zIndex: 9999, animation: "toastIn 0.25s ease", whiteSpace: "nowrap" }}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}