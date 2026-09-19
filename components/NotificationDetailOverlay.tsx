"use client";

// Popup plein écran ouverte au clic sur une notification (in-app ou push,
// y compris depuis l'app fermée) — brief Bryan 12/08/2026, référence
// visuelle DoorDash (plein écran, X de fermeture, illustration, titre,
// contenu détaillé, CTA principal), adapté à l'identité Yelen (doré plat,
// zéro dégradé, cf. /aplatissement-doré-*). Contrairement à DoorDash, Yelen
// n'a pas de structure "litige/résultat/étapes" — le contenu réel dont on
// dispose est titre + message complet (non tronqué) + horodatage + action
// contextuelle si un RDV est lié.
import Image from "next/image";
import Link from "next/link";
import { resoudreNotif, resoudreCta, resoudreCtaSecondaire } from "@/lib/notificationContent";

export type NotifDetail = {
  id: string;
  titre: string;
  message: string;
  lu: boolean;
  created_at?: string;
  type?: string | null;
  rdv_id?: string | null;
  demarche_id?: string | null;
  etape_id?: string | null;
  depense_id?: string | null;
  budget_id?: string | null;
  objectif_id?: string | null;
};

type Props = {
  notif: NotifDetail;
  onClose: () => void;
  bg: string; t1: string; t2: string; t3: string; card: string; brd: string;
};

const P = { pointerEvents: "none" as const };
const IcX = () => <svg style={P} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

export function NotificationDetailOverlay({ notif, onClose, bg, t1, t2, t3, card, brd }: Props) {
  const heure = notif.created_at ? new Date(notif.created_at).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  const { Illustration } = resoudreNotif(notif.type);
  const cta = resoudreCta(notif);
  const ctaSecondaire = resoudreCtaSecondaire(notif);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: bg, display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, paddingTop: "env(safe-area-inset-top)", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} className="tap" aria-label="Fermer" style={{ width: "36px", height: "36px", borderRadius: "50%", background: card, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <IcX/>
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: "auto", padding: "8px 24px 24px", width: "100%", maxWidth: "480px", margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
          {notif.type === "rdv_annule_systeme" ? (
            <div style={{ width: "140px", height: "140px", borderRadius: "24px", overflow: "hidden", position: "relative" }}>
              <Image src="/illustrations/rdv-annule-systeme.png" alt="" fill style={{ objectFit: "cover" }}/>
            </div>
          ) : (
            <Illustration size={88}/>
          )}
        </div>

        <h1 style={{ color: t1, fontSize: "22px", fontWeight: "900", letterSpacing: "-0.4px", margin: "0 0 10px", lineHeight: 1.25 }}>{notif.titre}</h1>
        {heure && <div style={{ color: t3, fontSize: "12px", fontWeight: "700", marginBottom: "18px" }}>{heure}</div>}

        <div style={{ background: card, border: `1px solid ${brd}`, borderRadius: "16px", padding: "16px" }}>
          <p style={{ color: t2, fontSize: "14px", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{notif.message}</p>
        </div>

        <div style={{ flex: 1 }}/>

        {cta && (
          <Link
            href={cta.href}
            onClick={onClose}
            className="tap"
            style={{ display: "block", width: "100%", padding: "16px", borderRadius: "16px", background: "#F5A623", color: "#080812", fontSize: "15px", fontWeight: "800", textAlign: "center", textDecoration: "none", marginTop: "20px" }}
          >
            {cta.label}
          </Link>
        )}

        {/* CTA secondaire — approche DoorDash "problème → contexte →
            résolution → assistance" (brief Bryan 15/09/2026) : une porte de
            sortie vers un humain, toujours discrète, jamais aussi visible
            que la résolution principale. */}
        {ctaSecondaire && (
          <Link
            href={ctaSecondaire.href}
            onClick={onClose}
            className="tap"
            style={{ display: "block", width: "100%", padding: "14px", textAlign: "center", color: t2, fontSize: "14px", fontWeight: "700", textDecoration: "none", marginTop: "10px" }}
          >
            {ctaSecondaire.label}
          </Link>
        )}

        <button
          onClick={onClose}
          className="tap"
          style={{ width: "100%", padding: "16px", borderRadius: "16px", background: cta ? "transparent" : "#F5A623", border: cta ? `1px solid ${brd}` : "none", color: cta ? t1 : "#080812", fontSize: "15px", fontWeight: "800", cursor: "pointer", marginTop: "10px" }}
        >
          Fermer
        </button>
      </main>
    </div>
  );
}
