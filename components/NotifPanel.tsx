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
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const P = { pointerEvents: "none" as const };
const IcX     = () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcNotif = () => <svg style={P} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;

type Notif = { id: string; titre: string; message: string; type: "info" | "success" | "warning" | "rdv"; lu: boolean; temps: string; created_at?: string; rdv_id?: string | null };

// Illustration d'état vide — trait, sans emoji (même esprit que
// EtatVideSante du chantier Avis & Réputation institution).
function NotifEmptyIllustration() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="34" stroke="#F5A62330" strokeWidth="1.5"/>
      <path d="M27 30a9 9 0 0 1 18 0c0 8 4 10 4 10H23s4-2 4-10z" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M32.5 44a3.5 3.5 0 0 0 7 0" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/>
      <path d="M27 25l4 4M45 25l-4 4" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

export function NotifPanel({ onClose, bg, t1, t2, t3, card, card2, brd, userId }: any) {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [ongletNotif, setOngletNotif] = useState<"utilisateur" | "systeme">("utilisateur");

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (userId) {
        const { data } = await supabase.from("notifications").select("*").eq("destinataire_id", userId).eq("destinataire_type", "citoyen").order("created_at", { ascending: false }).limit(20);
        setNotifs((data ?? []).map((n: any) => ({ id: String(n.id), titre: n.titre || "Notification", message: n.message || "", type: "rdv", lu: Boolean(n.lu), temps: n.created_at ? fmt(n.created_at) : "Récemment", rdv_id: n.rdv_id ?? null, created_at: n.created_at })));
        // Marque tout comme lu à l'ouverture — même convention que le
        // bouton "Marquer lu" de app/mes-rdv/page.tsx.
        await supabase.from("notifications").update({ lu: true }).eq("destinataire_id", userId).eq("destinataire_type", "citoyen").eq("lu", false);
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  function fmt(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "À l'instant"; if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
  }

  function handleClickNotif(n: Notif) {
    if (n.rdv_id) { router.push(`/messagerie?rdv_id=${n.rdv_id}`); onClose(); }
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
            <button key={o.key} onClick={() => setOngletNotif(o.key)} className="tap" style={{ flex: 1, background: ongletNotif === o.key ? "#F5A62318" : "transparent", border: `1px solid ${ongletNotif === o.key ? "#F5A62345" : brd}`, borderRadius: "10px", padding: "9px 10px", color: ongletNotif === o.key ? "#F5A623" : t3, fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
              {o.label}
            </button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 40px", width: "100%", maxWidth: "640px", margin: "0 auto", boxSizing: "border-box" }}>
        {ongletNotif === "systeme" ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><NotifEmptyIllustration/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px" }}>Bientôt disponible</div>
            <div style={{ color: t3, fontSize: "12px", lineHeight: 1.6 }}>Les alertes système et informations de la plateforme Yelen apparaîtront ici.</div>
          </div>
        ) : loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: t3 }}>Chargement...</div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><NotifEmptyIllustration/></div>
            <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px" }}>Vous êtes à jour</div>
            <div style={{ color: t3, fontSize: "12px", lineHeight: 1.6 }}>Aucune notification pour l'instant — nous vous préviendrons dès qu'il y a du nouveau concernant vos rendez-vous.</div>
          </div>
        ) : groupes.map(g => (
          <div key={g.jour} style={{ marginBottom: "20px" }}>
            <div style={{ color: t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>{g.jour}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {g.items.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClickNotif(n)}
                  className={n.rdv_id ? "tap" : undefined}
                  style={{
                    padding: "13px 14px", borderRadius: "16px", background: card,
                    border: `1px solid ${n.lu ? brd : "rgba(245,166,35,0.3)"}`,
                    display: "flex", gap: "12px", cursor: n.rdv_id ? "pointer" : "default",
                    boxShadow: n.lu ? "none" : "0 2px 10px rgba(245,166,35,0.08)",
                  }}
                >
                  <div style={{ width: "36px", height: "36px", borderRadius: "11px", background: "linear-gradient(135deg,#F5A62325,#F5A62310)", border: "1px solid #F5A62330", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#F5A623" }}><IcNotif/></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: n.lu ? "600" : "800", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.titre}</div>
                      {!n.lu && <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#F5A623", flexShrink: 0 }}/>}
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
    </div>
  );
}
