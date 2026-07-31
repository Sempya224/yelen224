"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/ThemeProvider";
import {
  calculerMinutesAvantRdv, determinerEtat, messageProchainRdv,
  MESSAGE_AVIS_ATTENTE, MESSAGE_ANNONCE, MESSAGE_VIDE,
  MESSAGE_DOCUMENT_ATTENTE, MESSAGE_DEMARCHE_RETARD, MESSAGE_DEMARCHE_ECHEANCE,
} from "@/lib/assistantMessages";

// ============================================================
// "Mon Assistant" — bandeau tirable (bottom sheet), écran Accueil citoyen.
// Voir CLAUDE.md /chantier-mon-assistant pour le brief produit complet.
//
// Mécanique de glissement écrite à la main (pointer events) — aucune
// librairie de gestes n'existe dans ce projet (vérifié, package.json).
// Le `<div>` racine garde une position fixe (bottom = hauteur nav +
// safe-area), sa `height` anime entre COLLAPSED_H et une hauteur max
// plafonnée sous le header (calc CSS, jamais de z-index seul) — z-index
// 90, sous la nav du bas (100) et le header (100), donc jamais par-dessus.
// ============================================================

type InstitutionLite = { id: string; name: string; category: string; logo: string | null } | null;
type RdvLite = { id: string; date_rdv: string; heure_rdv: string; objet: string | null; statut: string; institutions: InstitutionLite };
type AnnonceLite = { id: string; titre: string; contenu: string; type: string; format: string | null; media_urls: string[] | null; image_url: string | null; created_at: string; date_expiration: string | null; institutions: InstitutionLite };
type DemarcheLite = { id: string; titre: string };
type DocumentAttenteLite = { id: string; label: string; institutions: InstitutionLite };

const COLLAPSED_H = 68;
const NAV_H = 78; // hauteur approx. de la <nav> bas (paddingTop 10 + contenu ~48 + paddingBottom 8), avant safe-area
const HEADER_CLEARANCE = 110; // marge de sécurité sous le header pour le calc CSS du max-height
const DRAG_SNAP_RATIO = 0.35; // fraction de la course pour basculer d'état au relâchement

const Ic = {
  Grip:     () => <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "currentColor", opacity: 0.35, margin: "0 auto" }}/>,
  Cal:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Star:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Announce: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h1l3.6 5.4a1 1 0 0 0 1.7-.9L9.5 14H17a4 4 0 0 0 0-8H4a1 1 0 0 0-1 1z"/><path d="M15 6v12"/></svg>,
  Doc:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Clock:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>,
  Sparkle:  ({ size = 40 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"/><circle cx="12" cy="12" r="3"/></svg>,
  Chev:     () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  X:        () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const ASSISTANT_DISMISS_KEY = "yelen224_assistant_dismissed_until";

function InstitutionAvatar({ logo, name, size = 22 }: { logo: string | null | undefined; name: string; size?: number }) {
  const initiales = name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
  if (logo) {
    return <img src={logo} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontSize: size * 0.4, fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {initiales}
    </div>
  );
}

function formatDateCourte(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const demain = new Date(aujourdhui); demain.setDate(demain.getDate() + 1);
  if (d.getTime() === aujourdhui.getTime()) return "aujourd'hui";
  if (d.getTime() === demain.getTime()) return "demain";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function MonAssistant({ userId }: { userId: string | null }) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bg    = isDark ? "#0A0A0F" : "#F2F2F7";
  const card  = isDark ? "#17171C" : "#FFFFFF";
  const card2 = isDark ? "#232328" : "#F2F2F5";
  const t1    = isDark ? "#FFFFFF" : "#000000";
  const t2    = isDark ? "#9999A6" : "#5A5A63";
  const t3    = isDark ? "#636366" : "#AEAEB2";
  const brd   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  const [upcoming, setUpcoming] = useState<RdvLite[]>([]);
  const [avisAttente, setAvisAttente] = useState<RdvLite[]>([]);
  const [annonces, setAnnonces] = useState<AnnonceLite[]>([]);
  const [demarchesEnRetard, setDemarchesEnRetard] = useState<DemarcheLite[]>([]);
  const [demarchesEcheanceProche, setDemarchesEcheanceProche] = useState<DemarcheLite[]>([]);
  const [documentsAttente, setDocumentsAttente] = useState<DocumentAttenteLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // X + popup explicatif (retour Bryan 23/07/2026) — fermer n'efface pas
  // définitivement le bandeau, ça ouvre d'abord un message expliquant sa
  // valeur ; seul le bouton "Masquer 24h" du popup le cache réellement,
  // et seulement temporairement (localStorage, pas de compte à rebours
  // serveur nécessaire pour ce genre de préférence purement locale).
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ASSISTANT_DISMISS_KEY);
      if (raw) setDismissedUntil(Number(raw) || 0);
    } catch {}
  }, []);

  function handleMasquer24h() {
    const until = Date.now() + 24 * 60 * 60 * 1000;
    try { localStorage.setItem(ASSISTANT_DISMISS_KEY, String(until)); } catch {}
    setDismissedUntil(until);
    setShowInfoPopup(false);
  }

  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<{ startY: number; startH: number } | null>(null);

  const charger = useCallback(async () => {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/citoyen/assistant", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setUpcoming(json.upcoming ?? []);
        setAvisAttente(json.avisAttente ?? []);
        setAnnonces(json.annonces ?? []);
        setDemarchesEnRetard(json.demarchesEnRetard ?? []);
        setDemarchesEcheanceProche(json.demarchesEcheanceProche ?? []);
        setDocumentsAttente(json.documentsAttente ?? []);
      }
    } catch {}
    setLoaded(true);
  }, [userId]);

  useEffect(() => { void charger(); }, [charger]);

  // Recalcule le message contextuel toutes les 30s (pas de refetch réseau)
  // — même pattern que JournalTab.tsx côté institution — pour que le
  // message change à l'approche du RDV sans dépendre du Realtime (Realtime
  // live hors scope de ce lot, voir plan).
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const setPanelHeight = (h: number, animate: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animate ? "height 0.32s cubic-bezier(0.16,1,0.3,1)" : "none";
    el.style.height = `${h}px`;
  };

  const getMaxH = () => {
    if (typeof window === "undefined") return 400;
    return Math.max(COLLAPSED_H, window.innerHeight - HEADER_CLEARANCE - NAV_H);
  };

  useEffect(() => {
    setPanelHeight(expanded ? getMaxH() : COLLAPSED_H, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = panelRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragging.current = { startY: e.clientY, startH: el.getBoundingClientRect().height };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = dragging.current.startY - e.clientY; // tirer vers le haut = positif
    const h = Math.min(getMaxH(), Math.max(COLLAPSED_H, dragging.current.startH + delta));
    setPanelHeight(h, false);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    const el = panelRef.current;
    const currentH = el ? el.getBoundingClientRect().height : COLLAPSED_H;
    const maxH = getMaxH();
    const seuil = COLLAPSED_H + (maxH - COLLAPSED_H) * DRAG_SNAP_RATIO;
    dragging.current = null;
    setExpanded(currentH >= seuil);
  };
  const onGripTap = () => setExpanded((v) => !v);

  if (!userId || !loaded) return null;
  if (dismissedUntil > nowTick) return null;

  // ── Message contextuel de la position réduite ──
  const now = new Date(nowTick);
  let sommaire = MESSAGE_VIDE;
  if (upcoming.length > 0 && upcoming[0].institutions) {
    const r = upcoming[0];
    const etat = determinerEtat(calculerMinutesAvantRdv({ dateRdv: r.date_rdv, heureRdv: r.heure_rdv, institutionNom: r.institutions!.name }, now), formatDateCourte(r.date_rdv) === "aujourd'hui");
    sommaire = messageProchainRdv(etat, { dateRdv: r.date_rdv, heureRdv: r.heure_rdv, institutionNom: r.institutions!.name }, formatDateCourte(r.date_rdv));
  } else if (documentsAttente.length > 0) {
    sommaire = MESSAGE_DOCUMENT_ATTENTE(documentsAttente.length);
  } else if (demarchesEnRetard.length > 0) {
    sommaire = MESSAGE_DEMARCHE_RETARD(demarchesEnRetard.length);
  } else if (avisAttente.length > 0) {
    sommaire = MESSAGE_AVIS_ATTENTE(avisAttente.length);
  } else if (demarchesEcheanceProche.length > 0) {
    sommaire = MESSAGE_DEMARCHE_ECHEANCE(demarchesEcheanceProche.length);
  } else if (annonces.length > 0) {
    sommaire = MESSAGE_ANNONCE(annonces.length);
  }

  const rien = upcoming.length === 0 && avisAttente.length === 0 && annonces.length === 0
    && demarchesEnRetard.length === 0 && demarchesEcheanceProche.length === 0 && documentsAttente.length === 0;

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: 0, right: 0,
        bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))`,
        height: `${COLLAPSED_H}px`,
        maxHeight: `calc(100svh - ${HEADER_CLEARANCE}px - ${NAV_H}px)`,
        zIndex: 90,
        background: card,
        borderTop: `1px solid ${brd}`,
        borderRadius: "18px 18px 0 0",
        boxShadow: isDark ? "0 -6px 24px rgba(0,0,0,0.35)" : "0 -6px 24px rgba(0,0,0,0.10)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        touchAction: "none",
      }}
    >
      {/* Poignée — tap ou glisser (pointer events) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onGripTap}
        style={{ flexShrink: 0, padding: "10px 16px 8px", cursor: "grab", color: t2 }}
      >
        <Ic.Grip/>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "#fff", border: `1px solid ${brd}`, color: "#080812", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ic.Sparkle size={16}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: t3, fontSize: "10px", fontWeight: "800", letterSpacing: "0.4px", textTransform: "uppercase" }}>Mon Assistant</div>
            <div style={{ color: t1, fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sommaire}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setShowInfoPopup(true); }} className="tap" style={{ background: "none", border: "none", padding: "6px", margin: "-6px", cursor: "pointer", color: t3, flexShrink: 0, display: "flex" }}><Ic.X/></button>
          <div style={{ transform: expanded ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform 0.25s", color: t3, flexShrink: 0 }}><Ic.Chev/></div>
        </div>
      </div>

      {/* Popup explicatif — ouvert par le X, explique la valeur avant de
          proposer de masquer (retour Bryan 23/07/2026). Rendu via portail
          dans document.body : le panneau racine de Mon Assistant est en
          position:fixed avec son propre z-index (90), ce qui crée un
          contexte d'empilement local — un enfant fixed à l'intérieur ne
          peut jamais dépasser visuellement la nav du bas (z-index 100,
          en dehors de ce contexte) même avec un z-index élevé sur lui-même.
          Le portail sort le popup de ce contexte, comme les autres modales
          de l'app (BiometrieModal, NotifPanel, LogoutFlow) qui n'ont pas
          ce problème car rendues directement au niveau de HomePage. */}
      {showInfoPopup && createPortal(
        <div onClick={() => setShowInfoPopup(false)} style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: card, borderRadius: "24px 24px 0 0", padding: "28px 20px calc(20px + env(safe-area-inset-bottom))", width: "100%", maxWidth: "480px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#fff", border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#080812" }}>
              <Ic.Sparkle size={28}/>
            </div>
            <div style={{ color: t1, fontSize: "17px", fontWeight: "800", textAlign: "center", marginBottom: "8px" }}>Mon Assistant</div>
            <div style={{ color: t2, fontSize: "13.5px", lineHeight: 1.6, textAlign: "center", marginBottom: "22px" }}>
              C'est votre assistant personnel pour ne rien manquer sur Yelen : rappels de rendez-vous, documents à fournir, avis à laisser et démarches à surveiller — au bon moment, sans avoir à y penser.
            </div>
            <button onClick={() => setShowInfoPopup(false)} className="tap" style={{ width: "100%", background: "linear-gradient(135deg,#F5A623,#C8940A)", color: "#080812", fontWeight: "800", fontSize: "14px", padding: "13px", borderRadius: "12px", border: "none", cursor: "pointer", marginBottom: "10px" }}>Compris, le garder affiché</button>
            <button onClick={handleMasquer24h} className="tap" style={{ width: "100%", background: "none", color: t2, fontWeight: "700", fontSize: "13px", padding: "10px", borderRadius: "12px", border: "none", cursor: "pointer" }}>Masquer pendant 24h</button>
          </div>
        </div>,
        document.body
      )}

      {/* Contenu déplié — scrollable, jamais responsable de la hauteur du panneau */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 20px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {rien ? (
          <div style={{ textAlign: "center", padding: "24px 12px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: card2, color: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Ic.Sparkle size={30}/>
            </div>
            <div style={{ color: t1, fontSize: "15px", fontWeight: "800", marginBottom: "6px" }}>Mon Assistant est prêt</div>
            <div style={{ color: t2, fontSize: "12.5px", lineHeight: 1.6, maxWidth: "280px", margin: "0 auto" }}>
              Dès votre premier rendez-vous, cet espace vous guidera avant, pendant et après — rappels, préparation, et demandes d'avis, au bon moment.
            </div>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Section titre="Prochains rendez-vous" t2={t2}>
                {upcoming.map((r) => (
                  <button key={r.id} onClick={() => router.push("/mes-rdv")} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", background: card2, border: "none", borderRadius: "14px", padding: "12px", cursor: "pointer" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(245,166,35,0.12)", color: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Cal/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.institutions?.name ?? "Institution"}</div>
                      <div style={{ color: t2, fontSize: "11.5px", marginTop: "2px" }}>{formatDateCourte(r.date_rdv)} · {r.heure_rdv?.slice(0, 5)}</div>
                    </div>
                  </button>
                ))}
              </Section>
            )}

            {documentsAttente.length > 0 && (
              <Section titre="Documents à fournir" t2={t2}>
                {documentsAttente.map((d) => (
                  <button key={d.id} onClick={() => router.push("/compte/documents-telecharges")} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "14px", padding: "12px", cursor: "pointer" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(239,68,68,0.12)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Doc/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
                      <div style={{ color: t2, fontSize: "11.5px", marginTop: "2px" }}>{d.institutions?.name ?? "Établissement"} attend ce document</div>
                    </div>
                  </button>
                ))}
              </Section>
            )}

            {avisAttente.length > 0 && (
              <Section titre="Avis à laisser" t2={t2}>
                {avisAttente.map((r) => (
                  <button key={r.id} onClick={() => router.push("/compte/mes-avis")} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: "14px", padding: "12px", cursor: "pointer" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(245,166,35,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Star/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "800" }}>{r.institutions?.name ?? "Institution"}</div>
                      <div style={{ color: "#F5A623", fontSize: "11.5px", marginTop: "2px", fontWeight: "700" }}>Donnez votre avis →</div>
                    </div>
                  </button>
                ))}
              </Section>
            )}

            {(demarchesEnRetard.length > 0 || demarchesEcheanceProche.length > 0) && (
              <Section titre="Démarches à surveiller" t2={t2}>
                {demarchesEnRetard.map((d) => (
                  <button key={d.id} onClick={() => router.push("/compte/mes-demarches")} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "14px", padding: "12px", cursor: "pointer" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(239,68,68,0.12)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Clock/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.titre}</div>
                      <div style={{ color: "#ef4444", fontSize: "11.5px", marginTop: "2px", fontWeight: "700" }}>En retard</div>
                    </div>
                  </button>
                ))}
                {demarchesEcheanceProche.map((d) => (
                  <button key={d.id} onClick={() => router.push("/compte/mes-demarches")} className="tap" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px", background: card2, border: "none", borderRadius: "14px", padding: "12px", cursor: "pointer" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(245,166,35,0.12)", color: "#F5A623", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ic.Clock/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: t1, fontSize: "13px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.titre}</div>
                      <div style={{ color: t2, fontSize: "11.5px", marginTop: "2px" }}>Échéance cette semaine</div>
                    </div>
                  </button>
                ))}
              </Section>
            )}

            {annonces.length > 0 && (
              <Section titre="Annonces des établissements" t2={t2}>
                {annonces.map((a) => {
                  const nomInst = a.institutions?.name ?? "Institution";
                  const video = !a.image_url && a.format === "video" && a.media_urls?.[0];
                  return (
                    <button key={a.id} onClick={() => a.institutions && router.push(`/institution/${a.institutions.id}`)} className="tap" style={{ width: "100%", textAlign: "left", background: card2, border: `1px solid ${brd}`, borderRadius: "16px", overflow: "hidden", cursor: "pointer", padding: 0 }}>
                      {a.image_url ? (
                        <div style={{ width: "100%", height: "130px", overflow: "hidden", background: card }}>
                          <img src={a.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}/>
                        </div>
                      ) : video ? (
                        <div style={{ width: "100%", height: "150px", overflow: "hidden", background: "#000" }}>
                          <video src={video} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline preload="metadata"/>
                        </div>
                      ) : null}
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "9px" }}>
                          <InstitutionAvatar logo={a.institutions?.logo} name={nomInst} size={22}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: t1, fontSize: "11.5px", fontWeight: "800", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nomInst}</div>
                          </div>
                          <span style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontSize: "9px", fontWeight: "800", padding: "3px 8px", borderRadius: "20px", flexShrink: 0 }}>Annonce</span>
                        </div>
                        <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", marginBottom: "4px" }}>{a.titre}</div>
                        <div style={{ color: t2, fontSize: "12px", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.contenu}</div>
                      </div>
                    </button>
                  );
                })}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ titre, t2, children }: { titre: string; t2: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: t2, fontSize: "11px", fontWeight: "800", letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: "8px" }}>{titre}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{children}</div>
    </div>
  );
}
