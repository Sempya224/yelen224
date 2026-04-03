"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { YELEN224_USER_ID_KEY } from "@/lib/auth/constants";

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
  institution: {
    name: string;
    logo: string | null;
    category: string | null;
    ville: string | null;
    badge_verifie: boolean;
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
export default function MessagerieCitoyen() {
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
  const [userId, setUserId] = useState<string | null>(null);
  const [instOnline, setInstOnline] = useState(false);
  const [instLastSeen, setInstLastSeen] = useState<string | null>(null);
  const [instTyping, setInstTyping] = useState(false);
  const [showImageFull, setShowImageFull] = useState<string | null>(null);
  const [showSondage, setShowSondage] = useState(false);
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [sondageEnvoye, setSondageEnvoye] = useState(false);
  const [error, setError] = useState("");

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = localStorage.getItem(YELEN224_USER_ID_KEY);
    if (!uid) { router.push("/login"); return; }

    // Sécurité : si c'est une institution, rediriger
    const instId = localStorage.getItem("yelen224_institution_id");
    if (instId && !uid) {
      router.push(`/messagerie/institution?rdv_id=${rdvId}`);
      return;
    }

    setUserId(uid);
    if (!rdvId) { setError("RDV introuvable."); setLoading(false); return; }

    fetchRDV(rdvId, uid);
    fetchMessages(rdvId, uid);
    updatePresence(uid, true);

    presenceInterval.current = setInterval(() => updatePresence(uid, true), 30000);

    // Realtime messages
    const chMsg = supabase.channel(`citoyen_msg_${rdvId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `rdv_id=eq.${rdvId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => [...prev, msg]);
        if (msg.destinataire_id === uid) {
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

    // Realtime présence institution
    const chPres = supabase.channel(`citoyen_pres_${rdvId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" },
        (payload) => {
          const p = payload.new as any;
          if (p?.user_type === "institution") {
            const online = p.en_ligne && (Date.now() - new Date(p.derniere_activite).getTime()) < 60000;
            setInstOnline(online);
            setInstLastSeen(p.derniere_activite);
          }
        })
      .subscribe();

    // Realtime frappe
    const chType = supabase.channel(`citoyen_type_${rdvId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "typing_indicator",
        filter: `rdv_id=eq.${rdvId}`,
      }, (payload) => {
        const t = payload.new as any;
        if (t?.user_id !== uid) setInstTyping(t?.is_typing || false);
      })
      .subscribe();

    // Realtime rdv (conversation_terminee)
    const chRdv = supabase.channel(`citoyen_rdv_${rdvId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "rdv",
        filter: `id=eq.${rdvId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setRdv(prev => prev ? { ...prev, conversation_terminee: updated.conversation_terminee, statut: updated.statut } : prev);
        if (updated.conversation_terminee) setShowSondage(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chMsg);
      supabase.removeChannel(chPres);
      supabase.removeChannel(chType);
      supabase.removeChannel(chRdv);
      updatePresence(uid, false);
      if (presenceInterval.current) clearInterval(presenceInterval.current);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      stopTyping(uid, rdvId);
    };
  }, [rdvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, instTyping]);

  // ── Helpers async ─────────────────────────────────────────────────────────
  const updatePresence = async (uid: string, online: boolean) => {
    await supabase.from("presence").upsert(
      { user_id: uid, user_type: "citoyen", en_ligne: online, derniere_activite: new Date().toISOString() },
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

  const fetchRDV = async (id: string, uid: string) => {
    const { data } = await supabase.from("rdv")
      .select("id, objet, date_rdv, heure_rdv, statut, citoyen_id, institution_id, conversation_terminee")
      .eq("id", id).single();

    if (!data) { setError("RDV introuvable."); setLoading(false); return; }

    // Vérification sécurité : ce RDV appartient bien au citoyen
    if (data.citoyen_id !== uid) { router.push("/mes-rdv"); return; }

    const { data: inst } = await supabase.from("institutions")
      .select("name, logo, category, ville, badge_verifie")
      .eq("id", data.institution_id).single();

    setRdv({ ...data, institution: inst || null });
    setLoading(false);

    // Présence institution
    const { data: pres } = await supabase.from("presence")
      .select("*").eq("user_id", data.institution_id).maybeSingle();
    if (pres) {
      const online = pres.en_ligne && (Date.now() - new Date(pres.derniere_activite).getTime()) < 60000;
      setInstOnline(online);
      setInstLastSeen(pres.derniere_activite);
    }
  };

  const fetchMessages = async (id: string, uid: string) => {
    const { data } = await supabase.from("messages")
      .select("*").eq("rdv_id", id).order("created_at", { ascending: true });
    setMessages(data || []);
    // Marquer comme lus
    await supabase.from("messages").update({ lu: true })
      .eq("rdv_id", id).eq("destinataire_id", uid);
  };

  // ── Envoi ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!contenu.trim() && !imageFile) return;
    if (!rdv || !userId || rdv.conversation_terminee) return;
    setSending(true);
    stopTyping(userId, rdvId);
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
        expediteur_id: userId,
        destinataire_id: rdv.institution_id,
        contenu: contenu.trim(),
        image_url: imageUrl,
        lu: false,
      });
      setContenu(""); setImageFile(null); setImagePreview(null);
    } finally { setSending(false); }
  };

  const handleTyping = (val: string) => {
    setContenu(val);
    if (!userId) return;
    startTyping(userId);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => stopTyping(userId, rdvId), 2000);
  };

  const envoyerSondage = async () => {
    if (!rdv || note === 0) return;
    await supabase.from("satisfaction").insert({
      rdv_id: rdvId, citoyen_id: rdv.citoyen_id,
      note, commentaire,
    });
    setSondageEnvoye(true);
  };

  // ── Render guards ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#070B14", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 38, height: 38, border: "3px solid rgba(245,158,11,0.2)", borderTopColor: "#F59E0B", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#070B14", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#F87171", fontSize: 16, marginBottom: 20 }}>{error}</p>
        <button onClick={() => router.back()} style={{ background: "#F59E0B", color: "#0A0E1A", border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>Retour</button>
      </div>
    </div>
  );

  const instName = rdv?.institution?.name || "Institution";
  const instLogo = rdv?.institution?.logo;
  const instInitials = getInitials(instName);
  const convTerminee = rdv?.conversation_terminee;
  const statutColor = STATUT_COLORS[rdv?.statut || ""] || "#F59E0B";
  const groups = groupByDate(messages);

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#070B14;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .msg-in{animation:fadeUp 0.18s ease;}
        textarea:focus{outline:none;}
        textarea::placeholder{color:#334155;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px;}
        .tdot{width:6px;height:6px;border-radius:50%;background:#64748B;display:inline-block;}
        .tdot:nth-child(1){animation:pulse 1.2s ease infinite 0s;}
        .tdot:nth-child(2){animation:pulse 1.2s ease infinite 0.2s;}
        .tdot:nth-child(3){animation:pulse 1.2s ease infinite 0.4s;}
      `}</style>

      <div style={{ height: "100vh", background: "#070B14", color: "#E8ECF4", fontFamily: "'Inter',-apple-system,sans-serif", display: "flex", flexDirection: "column" }}>

        {/* ── HEADER CITOYEN ── */}
        <header style={{ flexShrink: 0, background: "rgba(7,11,20,0.98)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(245,158,11,0.1)", padding: "0 16px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", height: 62, display: "flex", alignItems: "center", gap: 12 }}>

            <button onClick={() => router.back()} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 22, cursor: "pointer", padding: 4, flexShrink: 0 }}>←</button>

            {/* Avatar institution */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(245,158,11,0.1)", border: "2px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {instLogo
                  ? <img src={instLogo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                  : <span style={{ color: "#F59E0B", fontSize: 15, fontWeight: 800 }}>{instInitials}</span>
                }
              </div>
              {/* Pastille en ligne */}
              <div style={{ position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: "50%", background: instOnline ? "#34D399" : "#475569", border: "2px solid #070B14" }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instName}</span>
                {rdv?.institution?.badge_verifie && <span style={{ fontSize: 13 }}>✅</span>}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                {instTyping
                  ? <span style={{ color: "#34D399" }}>✍️ est en train d'écrire...</span>
                  : instOnline
                    ? <span style={{ color: "#34D399" }}>● En ligne</span>
                    : <span>{formatLastSeen(instLastSeen)}</span>
                }
              </div>
            </div>

            {/* Statut RDV */}
            <span style={{ background: `${statutColor}18`, border: `1px solid ${statutColor}40`, color: statutColor, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0 }}>
              {STATUT_LABELS[rdv?.statut || ""] || rdv?.statut?.toUpperCase()}
            </span>
          </div>

          {/* Bandeau RDV — couleur AMBRE côté citoyen */}
          <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 10 }}>
            <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.12)", borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15 }}>📅</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#F1F5F9", margin: 0 }}>{rdv?.objet || "Sans objet"}</p>
                  <p style={{ fontSize: 11, color: "#475569", margin: "1px 0 0" }}>
                    {rdv?.date_rdv ? new Date(rdv.date_rdv).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" }) : ""} à {rdv?.heure_rdv}
                    {rdv?.institution?.category ? ` · ${rdv.institution.category}` : ""}
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
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>

            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26 }}>💬</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", marginBottom: 8 }}>Début de la conversation</p>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
                  Posez vos questions à <strong style={{ color: "#F59E0B" }}>{instName}</strong> concernant votre rendez-vous.<br />Soyez clair et précis.
                </p>
              </div>
            )}

            {groups.map(group => (
              <div key={group.date}>
                {/* Séparateur date */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 14px" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                  <span style={{ fontSize: 11, color: "#334155", padding: "3px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.05)" }}>
                    {formatDateLabel(group.date + "T12:00:00")}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
                </div>

                {group.messages.map(msg => {
                  const isMe = msg.expediteur_id === userId;
                  return (
                    <div key={msg.id} className="msg-in"
                      style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 6, alignItems: "flex-end", gap: 8 }}>

                      {/* Avatar institution (gauche) */}
                      {!isMe && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                          {instLogo
                            ? <img src={instLogo} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                            : <span style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B" }}>{instInitials}</span>
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
                            // CITOYEN : ses bulles = JAUNE/AMBRE, institution = GRIS FONCÉ
                            background: isMe ? "#F59E0B" : "rgba(255,255,255,0.06)",
                            border: isMe ? "none" : "1px solid rgba(255,255,255,0.08)",
                            borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                            padding: "10px 14px",
                          }}>
                            <p style={{ color: isMe ? "#0A0E1A" : "#E8ECF4", fontSize: 14, margin: 0, lineHeight: 1.55, wordBreak: "break-word" }}>
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
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Indicateur frappe */}
            {instTyping && (
              <div className="msg-in" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(245,158,11,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>{instInitials}</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "18px 18px 18px 4px", padding: "12px 16px", display: "flex", gap: 5 }}>
                  <span className="tdot" /><span className="tdot" /><span className="tdot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── ZONE SAISIE CITOYEN ── */}
        {convTerminee ? (
          <div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)", padding: 18, background: "#070B14", textAlign: "center" }}>
            <p style={{ color: "#475569", fontSize: 13, marginBottom: 12 }}>🔒 Conversation terminée par l'institution.</p>
            {!sondageEnvoye ? (
              <button onClick={() => setShowSondage(true)}
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B", padding: "9px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                ⭐ Évaluer cet échange
              </button>
            ) : (
              <p style={{ color: "#34D399", fontSize: 13 }}>✓ Évaluation envoyée, merci !</p>
            )}
          </div>
        ) : (
          <>
            {imagePreview && (
              <div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", background: "#070B14" }}>
                <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={imagePreview} style={{ height: 52, borderRadius: 8, objectFit: "cover" }} alt="" />
                  <p style={{ color: "#64748B", fontSize: 12, flex: 1 }}>{imageFile?.name}</p>
                  <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                    style={{ background: "transparent", border: "none", color: "#F87171", fontSize: 18, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            )}
            <div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", background: "rgba(7,11,20,0.98)" }}>
              <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "flex-end", gap: 10 }}>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 12, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 18 }}>
                  📷
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setImageFile(f); setImagePreview(URL.createObjectURL(f));
                }} style={{ display: "none" }} />

                {/* Zone texte — fond AMBRE léger pour le citoyen */}
                <div style={{ flex: 1, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "flex-end" }}>
                  <textarea value={contenu} onChange={e => handleTyping(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Écrire à l'institution..."
                    rows={1}
                    style={{ flex: 1, background: "transparent", border: "none", color: "#F1F5F9", fontSize: 14, resize: "none", lineHeight: 1.5, maxHeight: 120, overflow: "auto" }}
                  />
                </div>

                <button onClick={handleSend} disabled={sending || (!contenu.trim() && !imageFile)}
                  style={{
                    background: (!contenu.trim() && !imageFile) ? "rgba(245,158,11,0.08)" : "#F59E0B",
                    border: "none", borderRadius: 12, width: 44, height: 44,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: (!contenu.trim() && !imageFile) ? "not-allowed" : "pointer", flexShrink: 0,
                  }}>
                  {sending
                    ? <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    : <span style={{ color: (!contenu.trim() && !imageFile) ? "#F59E0B" : "#0A0E1A", fontSize: 18 }}>➤</span>
                  }
                </button>
              </div>
              <p style={{ color: "#1E293B", fontSize: 10, textAlign: "center", marginTop: 7 }}>
                RDV #{rdvId?.slice(0, 8)} · Yelen224 peut accéder aux messages en cas de litige
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

      {/* ── Sondage satisfaction ── */}
      {showSondage && !sondageEnvoye && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.87)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "32px 28px", width: "100%", maxWidth: 420, animation: "slideUp 0.3s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>⭐</div>
              <p style={{ fontSize: 19, fontWeight: 800, color: "#F1F5F9", marginBottom: 6 }}>Comment s'est passé cet échange ?</p>
              <p style={{ fontSize: 13, color: "#64748B" }}>Votre avis aide à améliorer Yelen224</p>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} onClick={() => setNote(n)}
                  style={{ fontSize: 34, cursor: "pointer", opacity: n <= note ? 1 : 0.25, filter: n <= note ? "none" : "grayscale(1)", transition: "all 0.1s" }}>⭐</span>
              ))}
            </div>
            {note > 0 && (
              <p style={{ textAlign: "center", fontSize: 13, color: ["","#F87171","#FB923C","#FBBF24","#34D399","#34D399"][note], fontWeight: 600, marginBottom: 14 }}>
                {["","Très mauvais","Décevant","Correct","Bien","Excellent !"][note]}
              </p>
            )}
            <textarea placeholder="Un commentaire ? (optionnel)" value={commentaire}
              onChange={e => setCommentaire(e.target.value)} rows={3}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 14, color: "#E8ECF4", fontSize: 13, resize: "none", outline: "none", marginBottom: 18, lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowSondage(false)}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#64748B", cursor: "pointer", fontSize: 13 }}>
                Plus tard
              </button>
              <button onClick={envoyerSondage} disabled={note === 0}
                style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: note > 0 ? "#F59E0B" : "rgba(245,158,11,0.15)", color: note > 0 ? "#0A0E1A" : "#F59E0B", fontWeight: 700, fontSize: 14, cursor: note > 0 ? "pointer" : "not-allowed" }}>
                Envoyer mon évaluation
              </button>
            </div>
          </div>
        </div>
      )}

      {sondageEnvoye && showSondage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.87)", backdropFilter: "blur(8px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0F172A", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 24, padding: "40px 32px", width: "100%", maxWidth: 360, textAlign: "center", animation: "slideUp 0.3s ease" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#F1F5F9", marginBottom: 8 }}>Merci !</p>
            <p style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>Votre évaluation a été enregistrée.</p>
            <button onClick={() => { setShowSondage(false); router.push("/mes-rdv"); }}
              style={{ background: "#F59E0B", color: "#0A0E1A", border: "none", borderRadius: 10, padding: "12px 32px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Retour à mes RDV
            </button>
          </div>
        </div>
      )}
    </>
  );
}