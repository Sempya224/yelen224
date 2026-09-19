"use client";

// Modal "confirmation de présence indisponible" — modernisation (décision
// CEO 06/09/2026) de l'ancien dialogue "Impossible de prendre ce
// rendez-vous en charge" (RDV_HORS_CRENEAU_MESSAGE, lib/rdvGating.ts).
// Aucune règle métier changée : le seul verrou réel reste creneauEstOuvert,
// appliqué côté serveur dans app/api/qr/validate et
// app/api/institution/paid-bookings/valider. Ce composant ne fait que :
// - présenter le blocage comme une règle normale, pas une erreur ;
// - afficher un compte à rebours fiable, basé sur l'heure serveur (jamais
//   l'horloge locale seule — voir GET /api/institution/rdv/checkin-status) ;
// - se fermer et relancer l'action automatiquement dès que le créneau
//   s'ouvre, sans recharger la page.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";
import { calculerCheckInAvailableAt, calculerCheckInStatus, type CheckInStatus } from "@/lib/rdvGating";

type CheckInStatusResponse = {
  appointmentStartTime: string;
  checkInAvailableAt: string;
  serverTime: string;
  checkInStatus: CheckInStatus;
};

function pad2(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

function formatHeure(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function diffJoursCalendaires(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((A.getTime() - B.getTime()) / 86400000);
}

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Construit le libellé "Disponible à partir de" + une éventuelle ligne de
// compte à rebours — jamais un compte à rebours en heures pour un
// rendez-vous à plusieurs jours (règle explicite du brief CEO, section 6).
function formatDisponibilite(checkInAvailableAt: Date, maintenant: Date): { dateLabel: string; relatif: string | null; estAujourdHui: boolean } {
  const jours = diffJoursCalendaires(checkInAvailableAt, maintenant);
  const heure = formatHeure(checkInAvailableAt);
  if (jours <= 0) return { dateLabel: `Aujourd'hui à ${heure}`, relatif: null, estAujourdHui: true };
  if (jours === 1) return { dateLabel: `Demain à ${heure}`, relatif: null, estAujourdHui: false };
  const jourSemaine = JOURS_FR[checkInAvailableAt.getDay()];
  const jourSemaineCap = jourSemaine.charAt(0).toUpperCase() + jourSemaine.slice(1);
  const dateLabel = `${jourSemaineCap} ${checkInAvailableAt.getDate()} ${MOIS_FR[checkInAvailableAt.getMonth()]} à ${heure}`;
  return { dateLabel, relatif: `Dans ${jours} jours`, estAujourdHui: false };
}

function formatDateRdv(dateRdv: string, heureRdv: string): string {
  const [y, m, d] = dateRdv.split("-").map(Number);
  const jourSemaine = JOURS_FR[new Date(y, m - 1, d).getDay()];
  const jourSemaineCap = jourSemaine.charAt(0).toUpperCase() + jourSemaine.slice(1);
  return `${jourSemaineCap} ${d} ${MOIS_FR[m - 1]} à ${heureRdv}`;
}

function formatCompteARebours(remainingMs: number): string {
  const totalMin = Math.max(0, Math.ceil(remainingMs / 60000));
  if (totalMin < 1) return "Moins d'une minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `Encore ${m} min`;
  return `Encore ${pad2(h)} h ${pad2(m)} min`;
}

export function CheckInUnavailableDialog({
  open, rdv, onClose, onBecameAvailable, C,
}: {
  open: boolean;
  rdv: { id: string; date_rdv: string; heure_rdv: string } | null;
  onClose: () => void;
  onBecameAvailable: () => void;
  C: ThemeTokens;
}) {
  const [statusData, setStatusData] = useState<CheckInStatusResponse | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const offsetRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const becameAvailableRef = useRef(onBecameAvailable);
  useEffect(() => { becameAvailableRef.current = onBecameAvailable; });

  // Charge l'état serveur à l'ouverture — jamais l'horloge locale seule pour
  // décider si le blocage doit s'afficher (brief CEO, section 4).
  useEffect(() => {
    if (!open || !rdv) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/institution/rdv/checkin-status?rdv_id=${rdv.id}`);
        const json = res.ok ? await res.json().catch(() => null) : null;
        if (annule) return;
        if (json?.checkInAvailableAt) {
          offsetRef.current = new Date(json.serverTime).getTime() - Date.now();
          setStatusData(json as CheckInStatusResponse);
        } else {
          // Repli local si l'endpoint échoue — dégrade vers l'ancien
          // comportement (horloge de l'appareil), jamais un blocage total
          // de l'écran par une simple erreur réseau.
          const seuil = calculerCheckInAvailableAt(rdv.date_rdv, rdv.heure_rdv);
          if (seuil) {
            offsetRef.current = 0;
            setStatusData({
              appointmentStartTime: seuil.toISOString(),
              checkInAvailableAt: seuil.toISOString(),
              serverTime: new Date().toISOString(),
              checkInStatus: calculerCheckInStatus(rdv.date_rdv, rdv.heure_rdv),
            });
          }
        }
      } catch {
        const seuil = calculerCheckInAvailableAt(rdv.date_rdv, rdv.heure_rdv);
        if (!annule && seuil) {
          offsetRef.current = 0;
          setStatusData({
            appointmentStartTime: seuil.toISOString(),
            checkInAvailableAt: seuil.toISOString(),
            serverTime: new Date().toISOString(),
            checkInStatus: calculerCheckInStatus(rdv.date_rdv, rdv.heure_rdv),
          });
        }
      }
    })();
    return () => { annule = true; };
  }, [open, rdv]);

  // Horloge corrigée par l'écart serveur, tick chaque seconde — jamais un
  // nouveau fetch réseau par seconde, juste une projection locale de
  // l'écart mesuré une fois à l'ouverture.
  useEffect(() => {
    if (!open || !statusData) return;
    const id = setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1000);
    return () => clearInterval(id);
  }, [open, statusData]);

  // Transition automatique dès que le créneau s'ouvre — ferme le blocage et
  // relance l'action sans jamais demander de recharger la page (section 5).
  // Uniquement pour le cas "pas encore ouvert" : pour CHECK_IN_EXPIRED,
  // checkInAvailableAt est aussi dans le passé, donc la comparaison serait
  // vraie en permanence et relancerait l'action en boucle sur un RDV
  // définitivement expiré.
  useEffect(() => {
    if (!statusData || statusData.checkInStatus !== "CHECK_IN_NOT_YET_AVAILABLE") return;
    const dispo = new Date(statusData.checkInAvailableAt).getTime() <= now.getTime();
    if (dispo) becameAvailableRef.current();
  }, [now, statusData]);

  useEffect(() => {
    if (open) {
      lastFocused.current = document.activeElement as HTMLElement;
      const t = setTimeout(() => panelRef.current?.focus(), 30);
      return () => clearTimeout(t);
    } else {
      lastFocused.current?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Ne s'affiche jamais si l'action est déjà disponible (section 8) — le
  // useEffect ci-dessus s'en charge dès que statusData arrive, mais on
  // garde aussi ce garde-fou synchrone pour éviter un flash visuel.
  if (!open || !rdv || !statusData || statusData.checkInStatus === "CHECK_IN_AVAILABLE") return null;

  const estExpire = statusData.checkInStatus === "CHECK_IN_EXPIRED";
  const checkInAvailableAt = new Date(statusData.checkInAvailableAt);
  const { dateLabel, relatif, estAujourdHui } = estExpire
    ? { dateLabel: "", relatif: null, estAujourdHui: false }
    : formatDisponibilite(checkInAvailableAt, now);
  const remainingMs = checkInAvailableAt.getTime() - now.getTime();

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-unavailable-title"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: C.bgCard, borderRadius: "22px", border: `1px solid ${C.border2}`, maxWidth: "420px", width: "100%", padding: "28px 24px", textAlign: "center", outline: "none" }}
      >
        <Image
          src="/illustrations/checkin-confirmation-indisponible.png"
          alt=""
          width={1254}
          height={1254}
          className="checkin-clock-icon"
          style={{ width: "104px", height: "auto", margin: "0 auto 16px", display: "block" }}
        />

        <div id="checkin-unavailable-title" style={{ color: C.t1, fontSize: "16px", fontWeight: "800", marginBottom: "12px" }}>
          {estExpire ? "Ce rendez-vous est passé" : "Confirmation de présence indisponible"}
        </div>
        <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.7, marginBottom: "18px", textAlign: "left" }}>
          {estExpire
            ? "La journée de ce rendez-vous est terminée : la confirmation de présence n'est plus possible."
            : "La confirmation de présence sera disponible le jour de votre rendez-vous, à partir de 10 minutes avant l'heure prévue."}
        </div>

        {estExpire ? (
          <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px", textAlign: "left" }}>
            <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Rendez-vous prévu le</div>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800" }}>{formatDateRdv(rdv.date_rdv, rdv.heure_rdv)}</div>
          </div>
        ) : (
          <div style={{ backgroundColor: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "18px", textAlign: "left" }}>
            <div style={{ color: C.t3, fontSize: "10.5px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "6px" }}>Disponible à partir de</div>
            <div style={{ color: C.t1, fontSize: "15px", fontWeight: "800", marginBottom: relatif ? "2px" : 0 }}>{dateLabel}</div>
            {relatif && <div style={{ color: C.t3, fontSize: "12px", fontWeight: "600" }}>{relatif}</div>}
            {estAujourdHui && (
              <div aria-live="polite" aria-atomic="true" style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", color: C.gold, fontSize: "13px", fontWeight: "800" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {formatCompteARebours(remainingMs)}
              </div>
            )}
          </div>
        )}

        <div style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6, marginBottom: "20px" }}>
          Cette règle contribue à protéger les rendez-vous, les paiements et l&apos;historique de présence sur Yelen.
        </div>

        <Button tokens={toUiTokens(C)} className="tap" variant="primary" size="md" fullWidth onClick={onClose}>
          Compris
        </Button>
      </div>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .checkin-clock-icon { animation: checkinPulse 2.4s ease-in-out infinite; }
        }
        @keyframes checkinPulse { 0%,100%{ box-shadow: 0 0 0 0 ${C.gold}25; } 50%{ box-shadow: 0 0 0 6px ${C.gold}00; } }
      `}</style>
    </div>
  );
}
