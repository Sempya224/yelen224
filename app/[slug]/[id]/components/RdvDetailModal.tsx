"use client";

// Fiche « Détails du RDV » — conteneur, en-tête, bandeau de situation et pied
// d'actions (refonte phase 1, étape 2). Tout ce qui est décision (phase,
// urgence, actions autorisées) vient de lib/rdvDecision.ts : ce composant ne
// recalcule aucune règle serveur. Le contenu (client, demande, quand et où,
// historique) arrive en `children` et sera refondu à l'étape 3.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { getRdvDecision, type RdvDecision, type RdvDecisionAction, type RdvDecisionActionId, type RdvDecisionEvent, type RdvDecisionPermission, type RdvDecisionPhase } from "@/lib/rdvDecision";
import { delaiRestant, heureAmPm, libelleDateRelativeRdv } from "@/lib/heure";
import { MINUTES_GRACE_NON_TRAITE } from "@/lib/rdvGating";
import { useVerrouillageDefilement, ZoneDefilement } from "./ZoneDefilement";
import { type ThemeTokens, toUiTokens } from "../theme";
import type { RDV } from "../layout";

type Ton = "red" | "orange" | "green" | "blue" | "gold" | "muted";

// Libellé court du badge UNIQUE de l'en-tête, par phase (jamais le statut brut).
const BADGE_PAR_PHASE: Record<RdvDecisionPhase, { l: string; ton: Ton }> = {
  nouveau_a_venir: { l: "Nouveau", ton: "gold" },
  nouveau_en_retard: { l: "En retard", ton: "red" },
  accepte_a_venir: { l: "Accepté", ton: "blue" },
  reporte: { l: "Reporté", ton: "blue" },
  presence_ouverte: { l: "À accueillir", ton: "orange" },
  en_retard_grace: { l: "En retard", ton: "red" },
  non_traite: { l: "Non traité", ton: "orange" },
  present: { l: "Présent", ton: "green" },
  termine: { l: "Terminé", ton: "green" },
  absent: { l: "Absent", ton: "red" },
  annule: { l: "Annulé", ton: "red" },
  refuse: { l: "Refusé", ton: "red" },
  inconnu: { l: "Statut inconnu", ton: "muted" },
};

function couleur(C: ThemeTokens, ton: Ton): string {
  switch (ton) {
    case "red": return C.red;
    case "orange": return C.orange;
    case "green": return C.green;
    case "blue": return C.blue;
    case "gold": return C.gold;
    default: return C.t2;
  }
}

// Teinte du bandeau : l'urgence prime, sinon la phase (terminé / présent en
// vert, le reste en bleu ou neutre).
function tonBandeau(d: RdvDecision): Ton {
  if (d.urgence === "critique") return "red";
  if (d.urgence === "attention") return "orange";
  if (d.phase === "termine" || d.phase === "present") return "green";
  if (d.phase === "annule" || d.phase === "refuse") return "muted";
  return "blue";
}

function IconeBandeau({ d, color }: { d: RdvDecision; color: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (d.urgence === "critique") return <svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (d.urgence === "attention") return <svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>;
  if (d.phase === "termine" || d.phase === "present") return <svg {...p}><path d="M20 6 9 17l-5-5"/></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

// Heure « murale » d'une échéance (Date construite en heure locale par
// rdvGating, comme heure_rdv) — surtout pas passée par un fuseau.
function heureMurale(d: Date): string {
  return heureAmPm(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
}

const FOCUSABLES = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function RdvDetailModal({ C, rdv, events, can, suspendu, actionLoading, bloqueClavier, onClose, onAction, children }: {
  C: ThemeTokens;
  rdv: RDV;
  events: readonly RdvDecisionEvent[];
  can: (permission: RdvDecisionPermission) => boolean;
  suspendu: boolean;
  actionLoading: string | null;
  // Vrai tant qu'un dialogue de confirmation est ouvert au-dessus : Échap et
  // piège à focus lui appartiennent alors.
  bloqueClavier: boolean;
  onClose: () => void;
  onAction: (id: RdvDecisionActionId) => void;
  children: ReactNode;
}) {
  const ui = toUiTokens(C);
  const titreId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dernierFocus = useRef<HTMLElement | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [copie, setCopie] = useState(false);
  const [motifDeplie, setMotifDeplie] = useState(false);
  // La page derrière ne défile pas tant que la fiche est ouverte.
  useVerrouillageDefilement();

  // La phase dépend de l'heure (fenêtre de présence, grâce, non traité) : on
  // recalcule chaque 30 s plutôt qu'à chaque rendu.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Focus : on mémorise l'élément déclencheur, on entre dans la fiche, on
  // restitue le focus à la fermeture.
  useEffect(() => {
    dernierFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => { dernierFocus.current?.focus?.(); };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (bloqueClavier) return;
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLES));
      if (f.length === 0) { e.preventDefault(); return; }
      const premier = f[0];
      const dernier = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === premier || document.activeElement === panelRef.current)) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bloqueClavier, onClose]);

  const d = getRdvDecision(rdv, now, { can, suspendu, events });
  const badge = BADGE_PAR_PHASE[d.phase];
  const cBadge = couleur(C, badge.ton);
  const ton = tonBandeau(d);
  const cBandeau = couleur(C, ton);
  const occupe = !!actionLoading;
  const dateRelative = libelleDateRelativeRdv(rdv.date_rdv, rdv.heure_rdv, now);
  const aDesActions = !!d.actionPrincipale || d.actionsSecondaires.length > 0;
  const desactivees = [d.actionPrincipale, ...d.actionsSecondaires].filter((a): a is RdvDecisionAction => !!a && a.disabled && !!a.raison);

  async function copierReference() {
    if (!rdv.reference) return;
    try {
      await navigator.clipboard.writeText(rdv.reference);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch { /* presse-papiers indisponible (contexte non sécurisé) : sans effet */ }
  }

  const bouton = (a: RdvDecisionAction, principal: boolean) => (
    <Button
      key={a.id}
      tokens={ui}
      className="tap rdvm-btn"
      variant={principal ? "primary" : a.id === "refuser" ? "danger-ghost" : "secondary"}
      size="md"
      disabled={a.disabled || occupe}
      loading={principal && occupe}
      onClick={() => onAction(a.id)}
    >
      {a.label}
    </Button>
  );

  return (
    <div className="rdvm-overlay" onClick={onClose}>
      <style>{`
        .rdvm-overlay{position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;animation:fadeIn .2s ease}
        .rdvm-panel{position:relative;display:flex;flex-direction:column;width:100%;max-width:640px;max-height:calc(100dvh - 48px);border-radius:16px;overflow:hidden;outline:none;animation:slideUp .24s ease}
        .rdvm-body{padding:20px 24px;display:grid;grid-template-columns:minmax(0,1fr);gap:24px;align-items:start}
        .rdvm-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
        @media(min-width:1024px){.rdvm-panel{max-width:880px}.rdvm-body{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}}
        @media(max-width:767px){
          .rdvm-overlay{padding:0}
          .rdvm-panel{max-width:none;height:100dvh;max-height:100dvh;border-radius:0;border-left:none!important;border-right:none!important}
          .rdvm-body{padding:16px}
          .rdvm-foot{flex-direction:column-reverse}
          .rdvm-foot .rdvm-btn{width:100%}
        }
        .rdvm-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      `}</style>

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        className="rdvm-panel"
        onClick={e => e.stopPropagation()}
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border2}` }}
      >
        {/* ── En-tête fixe ── */}
        <div style={{ flexShrink: 0, padding: "16px 24px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flexWrap: "wrap" }}>
              <h2 id={titreId} style={{ margin: 0, color: C.t1, fontSize: "18px", fontWeight: 600 }}>Rendez-vous</h2>
              {rdv.reference && (
                <button type="button" onClick={copierReference} className="tap" aria-label={`Copier la référence ${rdv.reference}`} title="Copier la référence"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "24px", padding: "0 8px", borderRadius: "6px", border: `1px solid ${C.border}`, background: "none", color: C.t2, fontSize: "12px", fontVariantNumeric: "tabular-nums", cursor: "pointer", font: "inherit" }}>
                  <span style={{ fontSize: "12px" }}>{copie ? "Copié" : rdv.reference}</span>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "24px", padding: "0 10px", borderRadius: "6px", backgroundColor: `${cBadge}1c`, color: cBadge, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: cBadge }}/>{badge.l}
              </span>
              {d.lectureSeule && (
                <span style={{ display: "inline-flex", alignItems: "center", height: "24px", padding: "0 10px", borderRadius: "6px", border: `1px solid ${C.border}`, color: C.t2, fontSize: "12px" }}>Lecture seule</span>
              )}
            </div>
            <button type="button" onClick={onClose} className="tap" aria-label="Fermer"
              style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "transparent", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {dateRelative && <div style={{ marginTop: "6px", color: C.t2, fontSize: "14px", fontVariantNumeric: "tabular-nums" }}>{dateRelative}</div>}
        </div>

        {/* ── Zone défilante : le bandeau de situation défile avec le corps, seul l'en-tête reste fixe ── */}
        <ZoneDefilement C={C} label="Contenu du rendez-vous">
        <div style={{ backgroundColor: `${cBandeau}14`, borderTop: `1px solid ${cBandeau}33`, borderBottom: `1px solid ${cBandeau}33`, padding: "12px 24px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span style={{ marginTop: "1px", flexShrink: 0, display: "flex" }}><IconeBandeau d={d} color={cBandeau}/></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div aria-live="polite">
              <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>{d.titre}</div>
              <div className={motifDeplie ? undefined : "rdvm-clamp"} style={{ color: C.t2, fontSize: "14px", lineHeight: 1.5, marginTop: "2px" }}>{d.detail}</div>
            </div>
            {d.motifComplet && d.motifComplet.length > 110 && (
              <button type="button" onClick={() => setMotifDeplie(v => !v)} className="tap" aria-expanded={motifDeplie}
                style={{ marginTop: "4px", background: "none", border: "none", padding: 0, color: C.t2, fontSize: "12px", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>
                {motifDeplie ? "Réduire" : "Voir tout"}
              </button>
            )}
            {d.echeance && (
              <div style={{ marginTop: "6px", color: cBandeau, fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {/* La règle est en info-bulle : ce n'est pas l'heure de fin du rendez-vous. */}
                <span title={`Un rendez-vous resté sans réponse ${MINUTES_GRACE_NON_TRAITE} minutes après son heure prévue est compté « non traité ».`}>
                  {d.phase === "en_retard_grace" ? "Agir avant" : "Répondre avant"} {heureMurale(d.echeance)}
                </span>
                {" · "}{delaiRestant(d.echeance, now)}
              </div>
            )}
          </div>
        </div>

        {/* ── Corps (contenu refondu à l'étape 3) ── */}
        <div className="rdvm-body">{children}</div>
        </ZoneDefilement>

        {/* ── Pied fixe : un seul bouton primaire ── */}
        {!aDesActions && (
          <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "14px 24px calc(env(safe-area-inset-bottom) + 14px)" }}>
            <div className="rdvm-foot">
              <Button tokens={ui} className="tap rdvm-btn" variant="secondary" size="md" onClick={onClose}>Fermer</Button>
            </div>
          </div>
        )}
        {aDesActions && (
          <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "14px 24px calc(env(safe-area-inset-bottom) + 14px)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="rdvm-foot">
              {d.actionsSecondaires.map(a => bouton(a, false))}
              {d.actionPrincipale && bouton(d.actionPrincipale, true)}
            </div>
            {desactivees.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", textAlign: "right" }}>
                {desactivees.map(a => <span key={a.id} style={{ color: C.t3, fontSize: "12px" }}>{a.label} : {a.raison}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
