"use client";

// Panneau de notifications citoyen — extrait de app/page.tsx (20/07/2026)
// pour être partagé avec app/dashboard/dashboard-client.tsx. Passé en
// plein écran (27/07/2026, retour Bryan : "retire tous les flottants,
// rends-le premium et plein écran comme la recherche") — même convention
// header que CompteRechercheOverlay/OffreFicheOverlay (X + titre centré),
// plus de dropdown flottant sous la cloche. Chaque notification est
// maintenant une vraie carte (background + bordure), texte tronqué à 2
// lignes pour rester scannable même quand plusieurs notifications
// partagent un corps de message très proche (rappels RDV répétés).
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { YelenLoader } from "@/components/YelenLoader";
import { NotificationDetailOverlay } from "@/components/NotificationDetailOverlay";
import { resoudreNotif, IllustrationGenerique } from "@/lib/notificationContent";

const P = { pointerEvents: "none" as const };
const IcX     = () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

type Notif = {
  id: string; titre: string; message: string; type: string | null; lu: boolean; temps: string; created_at?: string;
  rdv_id?: string | null; demarche_id?: string | null; etape_id?: string | null; depense_id?: string | null; budget_id?: string | null; objectif_id?: string | null;
};

type NotifRow = {
  id: string | number; titre: string | null; message: string | null; type: string | null; lu: boolean | null; created_at: string | null;
  rdv_id: string | null; demarche_id: string | null; etape_id: string | null; depense_id: string | null; budget_id: string | null; objectif_id: string | null;
};

type NotifPanelProps = {
  onClose: () => void;
  isDark?: boolean;
  bg: string; t1: string; t2: string; t3: string; card: string; card2: string; brd: string;
  userId: string | null;
  userName?: string;
};

export function NotifPanel({ onClose, isDark, bg, t1, t2, t3, card, card2, brd, userId }: NotifPanelProps) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [ongletNotif, setOngletNotif] = useState<"utilisateur" | "systeme">("utilisateur");
  const [detailNotif, setDetailNotif] = useState<Notif | null>(null);
  // Indicateur de position de scroll — même barre verticale native que
  // app/page.tsx / Mes dépenses / Mes démarches, mais rattachée au scroll
  // du <main> interne (panneau plein écran, pas le document).
  const mainRef = useRef<HTMLElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [scrollThumbH, setScrollThumbH] = useState(0);
  const [scrollBarShown, setScrollBarShown] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fmt(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "À l'instant"; if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (userId) {
        const { data, error } = await supabase.from("notifications").select("id,titre,message,type,lu,created_at,rdv_id,demarche_id,etape_id,depense_id,budget_id,objectif_id").eq("destinataire_id", userId).eq("destinataire_type", "citoyen").order("created_at", { ascending: false }).limit(20);
        // Destructurer l'erreur explicitement (piège déjà rencontré dans ce
        // projet, voir CLAUDE.md) : sans ça, une vraie erreur serveur (ex.
        // colonne manquante si une migration n'a pas encore été exécutée)
        // se fait passer pour "aucune notification", invisible au diagnostic.
        if (error) console.error("[NotifPanel] select notifications:", error.message);
        setNotifs((data ?? []).map((n: NotifRow) => ({
          id: String(n.id), titre: n.titre || "Notification", message: n.message || "", type: n.type, lu: Boolean(n.lu),
          temps: n.created_at ? fmt(n.created_at) : "Récemment", created_at: n.created_at ?? undefined,
          rdv_id: n.rdv_id ?? null, demarche_id: n.demarche_id ?? null, etape_id: n.etape_id ?? null,
          depense_id: n.depense_id ?? null, budget_id: n.budget_id ?? null, objectif_id: n.objectif_id ?? null,
        })));
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScrollPct = () => {
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? Math.min(Math.max(el.scrollTop / max, 0), 1) : 0);
      setScrollThumbH(el.scrollHeight > 0 ? Math.min(Math.max(el.clientHeight / el.scrollHeight, 0.08), 1) : 1);
      setScrollBarShown(true);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
      scrollHideTimer.current = setTimeout(() => setScrollBarShown(false), 900);
    };
    onScrollPct();
    el.addEventListener("scroll", onScrollPct, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScrollPct);
      if (scrollHideTimer.current) clearTimeout(scrollHideTimer.current);
    };
  }, [loading, ongletNotif]);

  // Marquer lu seulement à l'ouverture de CETTE notification (retour Bryan
  // 24/08/2026) — plus de "tout marqué lu" en arrivant sur l'écran, qui
  // rendait le badge non-lu inutile dès le premier chargement.
  async function marquerLu(id: string) {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)));
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
  }

  function handleClickNotif(n: Notif) {
    setDetailNotif(n);
    if (!n.lu) void marquerLu(n.id);
  }

  // Regroupe les notifications par jour (Aujourd'hui / Hier / date) —
  // demandé par Bryan le 20/07/2026, chaque carte affiche en plus l'heure
  // exacte + le temps relatif ("il y a X").
  function libelleJour(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
    const dJour = new Date(d); dJour.setHours(0, 0, 0, 0);
    if (dJour.getTime() === auj.getTime()) return "Aujourd'hui";
    if (dJour.getTime() === hier.getTime()) return "Hier";
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }
  const groupes: { jour: string; items: Notif[] }[] = [];
  for (const n of notifs) {
    const jour = libelleJour(n.created_at);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.items.push(n);
    else groupes.push({ jour, items: [n] });
  }

  const unread = notifs.filter(n => !n.lu).length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: bg, display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 1, background: bg, borderBottom: `1px solid ${brd}`, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
          <span />
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <div style={{ color: t1, fontSize: "16px", fontWeight: 800, textAlign: "center" }}>Notifications</div>
            {unread > 0 && <span style={{ backgroundColor: "#ef4444", color: "#fff", fontSize: "10px", fontWeight: "800", borderRadius: "10px", padding: "1px 7px" }}>{unread}</span>}
          </div>
          <button
            onClick={onClose}
            className="tap"
            aria-label="Fermer"
            style={{ justifySelf: "end", width: "36px", height: "36px", borderRadius: "50%", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}
          >
            <IcX/>
          </button>
        </div>

        {/* ── Onglets Utilisateur / Système — le système n'existe pas encore
            (mention "à venir" seulement), demandé par Bryan le 20/07/2026 ── */}
        <div style={{ display: "flex", gap: "8px", padding: "0 16px 12px" }}>
          {([{ key: "utilisateur", label: "Mes notifications" }, { key: "systeme", label: "Système" }] as const).map(o => (
            <button key={o.key} onClick={() => setOngletNotif(o.key)} className="tap" style={{ flex: 1, background: ongletNotif === o.key ? "#F5A623" : "transparent", border: `1px solid ${ongletNotif === o.key ? "#F5A623" : brd}`, borderRadius: "10px", padding: "9px 10px", color: ongletNotif === o.key ? "#080812" : t3, fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
              {o.label}
            </button>
          ))}
        </div>
      </header>

      <main ref={mainRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 40px", width: "100%", maxWidth: "640px", margin: "0 auto", boxSizing: "border-box" }}>
        {ongletNotif === "systeme" ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IllustrationGenerique size={72}/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px" }}>Bientôt disponible</div>
            <div style={{ color: t3, fontSize: "12px", lineHeight: 1.6 }}>Les alertes système et informations de la plateforme Yelen apparaîtront ici.</div>
          </div>
        ) : loading ? (
          <div style={{ padding: "48px", display: "flex", justifyContent: "center" }}><YelenLoader size={32}/></div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><IllustrationGenerique size={72}/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px" }}>Vous êtes à jour</div>
            <div style={{ color: t3, fontSize: "12px", lineHeight: 1.6 }}>Aucune notification pour l&apos;instant — nous vous préviendrons dès qu&apos;il y a du nouveau utile.</div>
          </div>
        ) : groupes.map(g => (
          <div key={g.jour} style={{ marginBottom: "20px" }}>
            <div style={{ color: t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>{g.jour}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {g.items.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClickNotif(n)}
                  className="tap"
                  style={{
                    padding: "13px 14px", borderRadius: "16px", background: card,
                    border: `1px solid ${n.lu ? brd : "#F5A623"}`,
                    display: "flex", gap: "12px", cursor: "pointer",
                  }}
                >
                  <div style={{ width: "36px", height: "36px", flexShrink: 0 }}>{resoudreNotif(n.type).Illustration({ size: 36 })}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: n.lu ? "600" : "800", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.titre}</div>
                      <span style={{ fontSize: "9.5px", fontWeight: "800", padding: "2px 8px", borderRadius: "20px", flexShrink: 0, backgroundColor: n.lu ? card2 : "#F5A623", color: n.lu ? t3 : "#fff" }}>
                        {n.lu ? "Lu" : "Non lu"}
                      </span>
                    </div>
                    {/* Tronqué à 2 lignes — plusieurs notifications de rappel
                        partagent un corps de message quasi identique,
                        éviter que chacune prenne 4-5 lignes rend la liste
                        scannable (retour Bryan 27/07/2026). */}
                    <div style={{ color: t2, fontSize: "11.5px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.message}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                      {n.created_at && <span style={{ color: t3, fontSize: "10px", fontWeight: "700" }}>{new Date(n.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
                      <span style={{ color: t3, fontSize: "10px" }}>·</span>
                      <span style={{ color: t3, fontSize: "10px", fontWeight: "600" }}>il y a {n.temps}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      {detailNotif && (
        <NotificationDetailOverlay
          notif={detailNotif}
          onClose={() => setDetailNotif(null)}
          bg={bg} t1={t1} t2={t2} t3={t3} card={card2} brd={brd}
        />
      )}

      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top) + 96px)",
          bottom: "12px",
          right: "3px",
          width: "3px",
          zIndex: 90,
          pointerEvents: "none",
          opacity: scrollBarShown ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: `${scrollPct * (1 - scrollThumbH) * 100}%`,
            height: `${scrollThumbH * 100}%`,
            width: "100%",
            borderRadius: "3px",
            background: isDark ? "rgba(245,166,35,0.55)" : "rgba(8,8,18,0.35)",
          }}
        />
      </div>
    </div>
  );
}
