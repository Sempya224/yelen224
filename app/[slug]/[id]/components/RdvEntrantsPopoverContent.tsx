"use client";

// Contenu du popover « RDV entrants » du header (refonte d'affichage,
// 22/10/2026). Présentation uniquement : la liste (`rdvsPending`), les handlers
// Accepter / Refuser et `actionLoading` viennent de layout.tsx, inchangés.
// La décomposition de `objet` (service / bénéficiaire / téléphone) est faite à
// l'affichage seulement (parseAppointmentLabel), jamais écrite.
// Refuser passe par une confirmation inline en deux temps avec motif
// OBLIGATOIRE (comme la fiche RDV et le bandeau) ; Accepter reste en un clic.
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { libelleDateHeureRdvCourte } from "@/lib/heure";
import { type ThemeTokens, toUiTokens } from "../theme";
import type { RDV } from "../layout";
import { nomPropre } from "./ClockInShiftUi";
import { PopoverEmpty, PopoverFooter, IcoVideRdv } from "./PopoverUi";
import { estAbsent, formatTelephone, parseAppointmentLabel } from "./rdv/parseAppointmentLabel";

// Plafond d'affichage historique du popover (slice(0, 8)) : au-delà, le pied
// annonce le reste au lieu de le masquer en silence.
const MAX_RENDUS = 8;
// Limite côté client seulement : le serveur n'impose aucune longueur au motif.
const MOTIF_MAX = 200;
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function Styles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .rdvp-open{transition:background-color 140ms ease}
      .rdvp-open:hover{background-color:${C.bgCard2}}
      .rdvp-open:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .rdvp-motif:focus-visible{outline:2px solid ${C.gold};outline-offset:-1px}
      .rdvp-confirm{animation:rdvpIn 140ms ease}
      .rdvp-liste{max-height:480px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:${C.border2} transparent}
      @keyframes rdvpIn{from{opacity:0}to{opacity:1}}
      @media(prefers-reduced-motion:reduce){.rdvp-open{transition:none}.rdvp-confirm{animation:none}}
    `}</style>
  );
}

const CHIP: React.CSSProperties = { borderRadius: "6px", padding: "1px 6px", fontSize: "12px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// Défini au niveau module (jamais dans le composant parent : perte de focus,
// voir /pieges-techniques-connus).
function CarteRdv({ C, r, now, occupe, enCours, confirmation, motif, onMotifChange, onOuvrir, onAccepter, onDemanderRefus, onAnnulerRefus, onConfirmerRefus }: {
  C: ThemeTokens; r: RDV; now: Date; occupe: boolean; enCours: boolean; confirmation: boolean; motif: string;
  onMotifChange: (v: string) => void; onOuvrir: (r: RDV) => void; onAccepter: (id: string) => void;
  onDemanderRefus: (id: string) => void; onAnnulerRefus: () => void; onConfirmerRefus: (id: string) => void;
}) {
  const ui = toUiTokens(C);
  const nom = nomPropre(r.citoyen_nom) || "Citoyen";
  const parsed = parseAppointmentLabel(r.objet);
  const nomTiers = r.pour_autre ? (!estAbsent(r.nom_autre) ? (r.nom_autre as string) : parsed.beneficiaireNom ?? "un tiers") : parsed.beneficiaireNom;
  const telTiers = formatTelephone(r.pour_autre && !estAbsent(r.phone_autre) ? r.phone_autre : parsed.beneficiaireTel);
  // Format non reconnu : repli sur le texte brut de `objet` (puis « RDV général »).
  const service = parsed.reconnu ? parsed.service : (parsed.brut || "RDV général");
  const quand = libelleDateHeureRdvCourte(r.date_rdv, r.heure_rdv, now);

  const carteRef = useRef<HTMLDivElement>(null);
  const refuserRef = useRef<HTMLDivElement>(null);
  const annulerRef = useRef<HTMLDivElement>(null);
  const motifRef = useRef<HTMLTextAreaElement>(null);
  const etaitEnConfirmation = useRef(false);
  const [motifFocus, setMotifFocus] = useState(false);

  // Focus sur « Annuler » à l'ouverture de la confirmation, rendu à « Refuser »
  // à la sortie (annulation ou Échap).
  useEffect(() => {
    if (confirmation) {
      annulerRef.current?.querySelector("button")?.focus();
      carteRef.current?.scrollIntoView({ block: "nearest" });
    } else if (etaitEnConfirmation.current) {
      refuserRef.current?.querySelector("button")?.focus();
    }
    etaitEnConfirmation.current = confirmation;
  }, [confirmation]);

  function ajusterHauteur(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 56)}px`;
  }

  return (
    <div ref={carteRef} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden" }}>
      <button type="button" className="rdvp-open tap" onClick={() => onOuvrir(r)} title={r.objet || undefined}
        aria-label={`Ouvrir le rendez-vous de ${nom}`}
        style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", boxSizing: "border-box", padding: "12px 12px 8px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: C.t1 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%" }}>
          <span style={{ color: C.t1, fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{nom}</span>
          <span style={{ color: C.blue, background: C.blueL, fontSize: "12px", fontWeight: 500, borderRadius: "6px", padding: "1px 8px", flexShrink: 0 }}>Nouveau</span>
        </span>
        {quand && <span style={{ color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{quand}</span>}
        <span style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
          {service && <span style={{ ...CHIP, color: C.t2, background: C.bg3 }}>{service}</span>}
          {parsed.montant && <span style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{parsed.montant}{parsed.lieu ? ` · ${parsed.lieu}` : ""}</span>}
          {r.reference && <span style={{ ...CHIP, color: C.t3, background: C.bg3, fontFamily: MONO }}>{r.reference}</span>}
        </span>
        {nomTiers && (
          <span style={{ color: C.t2, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            Pour {nomPropre(nomTiers)}{telTiers && <span style={{ color: C.t3, fontSize: "12px", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}> · {telTiers}</span>}
          </span>
        )}
      </button>

      {confirmation ? (
        <div role="group" aria-label={`Confirmer le refus du rendez-vous de ${nom}`} aria-live="polite" className="rdvp-confirm"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key !== "Escape") return;
            // Échap annule la confirmation sans fermer le popover (son écouteur
            // Échap est posé sur document).
            e.stopPropagation();
            e.nativeEvent.stopPropagation();
            if (!occupe) onAnnulerRefus();
          }}
          style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 12px 12px" }}>
          <div>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 600 }}>Refuser ce rendez-vous ?</div>
            <div style={{ color: C.t2, fontSize: "12px", marginTop: "2px" }}>Le citoyen sera prévenu que son rendez-vous est refusé.</div>
          </div>
          <div>
            <label htmlFor={`rdvp-motif-${r.id}`} style={{ display: "block", color: C.t2, fontSize: "12px", marginBottom: "4px" }}>Motif (obligatoire)</label>
            <textarea id={`rdvp-motif-${r.id}`} ref={motifRef} className="rdvp-motif" rows={1} maxLength={MOTIF_MAX} value={motif} disabled={occupe} aria-required="true"
              placeholder="Ex : créneau complet, service indisponible ce jour-là"
              onChange={e => { onMotifChange(e.target.value.replace(/\s*\n\s*/g, " ")); ajusterHauteur(e.target); }}
              onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
              onFocus={() => setMotifFocus(true)} onBlur={() => setMotifFocus(false)}
              style={{ width: "100%", boxSizing: "border-box", minHeight: "36px", maxHeight: "56px", resize: "none", padding: "8px 10px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "13px", lineHeight: 1.4, fontFamily: "inherit" }}/>
            {(motifFocus || motif.length > 0) && (
              <div style={{ color: C.t3, fontSize: "12px", textAlign: "right", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>{motif.length}/{MOTIF_MAX}</div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div ref={annulerRef}>
              <Button tokens={ui} className="tap" variant="secondary" size="md" fullWidth disabled={occupe} style={{ height: "36px" }} onClick={() => { onAnnulerRefus(); }}>Annuler</Button>
            </div>
            <Button tokens={ui} className="tap" variant="danger" size="md" fullWidth disabled={occupe || motif.trim() === ""} loading={enCours}
              title={motif.trim() === "" ? "Saisissez un motif pour confirmer le refus" : undefined}
              ariaLabel={`Confirmer le refus du rendez-vous de ${nom}`} style={{ height: "36px" }} onClick={() => { onConfirmerRefus(r.id); }}>
              {enCours ? "Traitement…" : "Confirmer le refus"}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "4px 12px 12px" }}>
          <div ref={refuserRef}>
            <Button tokens={ui} className="tap" variant="danger" size="md" fullWidth disabled={occupe}
              ariaLabel={`Refuser le rendez-vous de ${nom}`} style={{ height: "36px" }} onClick={() => { onDemanderRefus(r.id); }}>
              Refuser
            </Button>
          </div>
          <Button tokens={ui} className="tap" variant="primary" size="md" fullWidth disabled={occupe} loading={enCours}
            ariaLabel={`Accepter le rendez-vous de ${nom}`} loadingColor="#fff"
            style={{ height: "36px", backgroundColor: C.green, borderColor: C.green, color: "#fff" }} onClick={() => { onAccepter(r.id); }}>
            {enCours ? "Traitement…" : "Accepter"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function RdvEntrantsPopoverContent({ C, rdvs, actionLoading, onOuvrir, onAccepter, onRefuser, onVoirTous }: {
  C: ThemeTokens;
  rdvs: RDV[];
  actionLoading: string | null;
  onOuvrir: (r: RDV) => void;
  onAccepter: (id: string) => void;
  onRefuser: (id: string, motif?: string) => void;
  onVoirTous: () => void;
}) {
  const now = new Date();
  // Un seul RDV en confirmation à la fois ; le motif est effacé à chaque
  // changement de cible, à l'annulation et au démontage (fermeture du popover).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const affiches = rdvs.slice(0, MAX_RENDUS);
  const nbRestants = rdvs.length - affiches.length;

  function demanderRefus(id: string) { setConfirmId(id); setMotif(""); }
  function annulerRefus() { setConfirmId(null); setMotif(""); }

  return (
    <div>
      <Styles C={C}/>
      {rdvs.length === 0 ? (
        <PopoverEmpty C={C} icone={IcoVideRdv} titre="Aucun RDV en attente" aide="Les nouvelles demandes apparaîtront ici."/>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <span style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{rdvs.length} en attente</span>
          </div>
          <div className="rdvp-liste" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {affiches.map(r => (
              <CarteRdv key={r.id} C={C} r={r} now={now} occupe={!!actionLoading} enCours={actionLoading === r.id}
                confirmation={confirmId === r.id} motif={confirmId === r.id ? motif : ""} onMotifChange={setMotif}
                onOuvrir={onOuvrir} onAccepter={onAccepter}
                onDemanderRefus={demanderRefus} onAnnulerRefus={annulerRefus}
                onConfirmerRefus={id => { if (motif.trim()) onRefuser(id, motif.trim()); }}/>
            ))}
          </div>
        </>
      )}
      <PopoverFooter C={C} label={nbRestants > 0 ? `Voir tous les RDV (${nbRestants} autre${nbRestants > 1 ? "s" : ""})` : "Voir tous les RDV"} onClick={onVoirTous}/>
    </div>
  );
}
