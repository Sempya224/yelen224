"use client";

// Tableau des rendez-vous (refonte UI 20/10/2026, étape 1). Présentationnel :
// layout.tsx garde l'état, les filtres, la pagination et tous les handlers ;
// ici on dessine seulement les lignes qu'on nous passe.
import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { DEVISE_LABEL } from "@/lib/devise";
import { heureAmPm, jourConakry } from "@/lib/heure";
import { rdvNonTraite } from "@/lib/rdvGating";
import { type ThemeTokens, toUiTokens } from "../../theme";
import { nomPropre, RowActionsMenu } from "../ClockInShiftUi";
import type { RDV } from "../../layout";
import { parseAppointmentLabel, formatTelephone, estAbsent } from "./parseAppointmentLabel";

// ── Définitions partagées des catégories de RDV ──────────────────────────
// UNE SEULE définition par catégorie, utilisée par le filtre de la liste, les
// compteurs (onglets et KPI) et les variations : un compteur et la liste qu'il
// ouvre ne peuvent donc plus diverger. « Effectués » regroupe effectue (ancien),
// termine (valeur écrite par l'écran de statut) et honore.
export const STATUTS_EFFECTUES: readonly string[] = ["effectue", "termine", "honore"];
export function estEffectue(statut: string): boolean {
  return STATUTS_EFFECTUES.includes(statut);
}

export type LigneRdvFiltrable = { statut: string; presence_status?: string | null; date_rdv: string; heure_rdv: string };

// Les clés de filtre (tous, nouveau, en_attente, confirme, effectue, annule,
// absent, en_retard) sont aussi utilisées depuis l'accueil : leur nom ne change
// pas, seule la logique derrière est centralisée ici. « nouveau » et « en_attente »
// excluent les RDV « non traités » (catégories mutuellement exclusives).
export function correspondFiltreRdv(r: LigneRdvFiltrable, filtre: string, maintenant: Date = new Date()): boolean {
  if (filtre === "tous") return true;
  if (filtre === "absent") return r.presence_status === "absent";
  const nonTraite = rdvNonTraite(r.statut, r.presence_status, r.date_rdv, r.heure_rdv, maintenant);
  if (filtre === "en_retard") return nonTraite;
  if (filtre === "en_attente") return r.statut === "en_attente" && r.presence_status !== "absent" && !nonTraite;
  if (filtre === "nouveau") return r.statut === "nouveau" && !nonTraite;
  if (filtre === "effectue") return estEffectue(r.statut);
  return r.statut === filtre;
}

// ── Variation « aujourd'hui / hier » des KPI ─────────────────────────────
// Nombre de RDV PRÉVUS aujourd'hui et hier (date_rdv) dans la catégorie, au statut
// actuel. Jamais de pourcentage. Les jours sont ceux de Conakry (lib/heure.ts),
// pas le jour UTC du navigateur.
export type VariationJour = { aujourdhui: number; hier: number };

export function jourPrecedent(jour: string): string {
  if (!jour) return "";
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function variationJour(rdvs: readonly LigneRdvFiltrable[], filtre: string, maintenant: Date): VariationJour {
  const aujourdhui = jourConakry(maintenant);
  const hier = jourPrecedent(aujourdhui);
  let a = 0, h = 0;
  for (const r of rdvs) {
    if (!correspondFiltreRdv(r, filtre, maintenant)) continue;
    if (r.date_rdv === aujourdhui) a++;
    else if (r.date_rdv === hier) h++;
  }
  return { aujourdhui: a, hier: h };
}

// null quand il n'y a rien à dire (0 aujourd'hui et 0 hier).
export function libelleVariationJour(v: VariationJour): string | null {
  if (v.aujourdhui === 0 && v.hier === 0) return null;
  return `Aujourd'hui : ${v.aujourdhui} · hier : ${v.hier}`;
}

export type RdvKpi = { key: string; label: string; valeur: React.ReactNode; valeurTexte: number; dot: string; variation: VariationJour; onClick: () => void; active?: boolean };

// Bande KPI de l'écran Rendez-vous : même présentation que la bande de l'accueil,
// mais la variation est un texte neutre (sans pourcentage, sans flèche, sans
// couleur d'alerte).
export function RdvKpiBand({ C, items }: { C: ThemeTokens; items: RdvKpi[] }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", overflowX: "auto", marginBottom: "16px" }}>
      <style>{`
        .rdv-kpi:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
        .rdv-kpi:hover{background-color:${C.bgCard2}}
        .rdv-kpi-long{display:inline}
        .rdv-kpi-court{display:none}
        @container rdvkpi (max-width: 165px){.rdv-kpi-long{display:none}.rdv-kpi-court{display:inline}}
        @media(prefers-reduced-motion:reduce){.rdv-kpi{transition:none!important}}
      `}</style>
      <div role="group" aria-label="Indicateurs" style={{ display: "flex", minWidth: "880px" }}>
        {items.map((k, i) => {
          const texte = libelleVariationJour(k.variation);
          return (
            <button key={k.key} type="button" onClick={k.onClick} className="rdv-kpi tap" aria-pressed={k.active}
              aria-label={`${k.label} : ${k.valeurTexte}${texte ? `. ${texte}` : ""}`}
              title={texte ? `${texte} — RDV prévus aujourd'hui / hier dans cette catégorie` : undefined}
              style={{ containerType: "inline-size", containerName: "rdvkpi", flex: "1 1 0", minWidth: 0, textAlign: "left", background: "none", border: "none", borderLeft: i > 0 ? `1px solid ${C.border}` : "none", padding: "14px 16px", cursor: "pointer", font: "inherit", boxShadow: k.active ? `inset 0 -2px 0 ${C.gold}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: k.dot, flexShrink: 0 }}/>{k.label}
              </div>
              <div style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.2, marginTop: "4px", fontVariantNumeric: "tabular-nums" }}>{k.valeur}</div>
              {/* Hauteur réservée sur TOUTES les cartes (ligne vide invisible sans texte) :
                  les chiffres restent alignés d'une carte à l'autre. Une seule ligne ; la
                  version courte prend le relais quand la carte est étroite. */}
              <div aria-hidden="true" style={{ height: "16px", lineHeight: "16px", marginTop: "2px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                {texte && (
                  <>
                    <span className="rdv-kpi-long">Aujourd&apos;hui : {k.variation.aujourdhui} · hier : {k.variation.hier}</span>
                    <span className="rdv-kpi-court">Auj. {k.variation.aujourdhui} · hier {k.variation.hier}</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type AppointmentRowData = { r: RDV; badgeStatut: string; isRetard: boolean; clientExistant: boolean; imminent: boolean };
export type AppointmentActions = {
  loading: string | null;
  onOpen: (r: RDV) => void;
  onAccept: (id: string) => void;
  onPrendre: (r: RDV) => void;
  onAbsent: (r: { id: string; nom: string }) => void;
  onTermine: (r: RDV) => void;
  onRefuse: (id: string) => void;
};

export function AppointmentsStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .apt-table{display:none}
      .apt-cards{display:flex;flex-direction:column;gap:10px}
      @media(min-width:1280px){.apt-table{display:block}.apt-cards{display:none}}
      .apt-grid{display:grid;grid-template-columns:104px minmax(160px,1.3fr) minmax(110px,1.2fr) minmax(120px,1fr) minmax(90px,128px) 260px;gap:12px;align-items:center;padding:0 16px}
      .apt-act{width:100%;min-width:0}
      .apt-act button{white-space:nowrap;flex-shrink:0}
      .apt-row{min-height:72px;cursor:pointer;border-top:1px solid ${C.border}}
      .apt-row:hover{background-color:${C.bgCard2}}
      .apt-row:focus-visible,.apt-btn:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      @media(prefers-reduced-motion:reduce){.apt-row{transition:none!important}}
    `}</style>
  );
}

// ── Badge de statut unique (point + texte, teintes douces) ───────────────
export function AppointmentStatusBadge({ C, statut }: { C: ThemeTokens; statut: string }) {
  let c: string; let l: string;
  switch (statut) {
    case "nouveau": c = C.gold; l = "Nouveau"; break;
    case "en_attente": c = C.orange; l = "En attente"; break;
    case "confirme": c = C.blue; l = "Confirmé"; break;
    case "effectue": case "termine": case "honore": c = C.green; l = statut === "termine" ? "Terminé" : statut === "honore" ? "Honoré" : "Effectué"; break;
    case "annule": c = C.red; l = "Annulé"; break;
    case "absent": c = C.red; l = "Absent"; break;
    case "en_retard": case "non_traite": c = C.red; l = "Non traité"; break;
    default: c = C.t2; l = statut || "—"; // repli neutre pour tout statut inconnu
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${c}1c`, color: c === C.t2 ? C.t2 : c, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: c }}/>{l}
    </span>
  );
}

const IcoOeil = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoHorloge = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>;
const IcoPin = <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
const IcoReport = <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>;

function dateCourte(dateRdv: string): string {
  const [y, m, d] = dateRdv.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const memeAnnee = dt.getFullYear() === new Date().getFullYear();
  const t = dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", ...(memeAnnee ? {} : { year: "numeric" }) });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Heures en 12 h AM/PM via le formateur partagé (lib/heure.ts).
function heureListe(h?: string | null): string {
  return heureAmPm(h) || "—";
}
function initiales(nom: string): string { return nom.trim().split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "?"; }

function Avatar32({ C, r }: { C: ThemeTokens; r: RDV }) {
  // Photo introuvable ou cassée : repli sur les initiales (la donnée n'est pas modifiée).
  // On retient l'URL en échec, pas un booléen : une autre photo retente sa chance.
  const [photoEnEchec, setPhotoEnEchec] = useState<string | null>(null);
  const photoOk = !!r.citoyen_photo && photoEnEchec !== r.citoyen_photo;
  return (
    <span aria-hidden="true" style={{ width: "32px", height: "32px", position: "relative", borderRadius: "50%", overflow: "hidden", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {photoOk && r.citoyen_photo
        ? <Image src={r.citoyen_photo} alt="" fill sizes="32px" style={{ objectFit: "cover" }} onError={() => setPhotoEnEchec(r.citoyen_photo ?? null)}/>
        : initiales(r.citoyen_nom)}
    </span>
  );
}

function CelluleCitoyen({ C, d }: { C: ThemeTokens; d: AppointmentRowData }) {
  const { r } = d;
  const parsed = parseAppointmentLabel(r.objet);
  const nomTiers = r.pour_autre ? (!estAbsent(r.nom_autre) ? (r.nom_autre as string) : parsed.beneficiaireNom ?? "un tiers") : parsed.beneficiaireNom;
  const telTiers = formatTelephone(!estAbsent(r.phone_autre) ? r.phone_autre : parsed.beneficiaireTel);
  const tel = formatTelephone(r.citoyen_phone);
  const nomManquant = !r.citoyen_nom?.trim() || r.citoyen_nom.trim().toLowerCase() === "citoyen";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
      <Avatar32 C={C} r={r}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {nomManquant
            ? <span title="Nom non renseigné" style={{ color: C.t3, fontSize: "14px", fontStyle: "italic" }}>Citoyen</span>
            : <span title={r.citoyen_nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomPropre(r.citoyen_nom)}</span>}
          {d.clientExistant && <span style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px" }}>Client existant</span>}
          {d.imminent && <span style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: `${C.orange}1c`, color: C.orange, fontSize: "12px", fontWeight: 600 }}>Imminent</span>}
        </div>
        {tel && <div style={{ color: C.t3, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{tel}</div>}
        {nomTiers && <div title={`Pour ${nomPropre(nomTiers)}`} style={{ color: C.t3, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Pour {nomPropre(nomTiers)}{telTiers && <span style={{ fontVariantNumeric: "tabular-nums" }}> · {telTiers}</span>}</div>}
      </div>
    </div>
  );
}

function CelluleService({ C, r }: { C: ThemeTokens; r: RDV }) {
  const parsed = parseAppointmentLabel(r.objet);
  const titre = parsed.reconnu ? parsed.service ?? "" : (r.objet?.trim() || "RDV général");
  const prix = parsed.montant ?? (r.est_payant && r.service_payant_prix ? `${r.service_payant_prix.toLocaleString("fr-FR")} ${DEVISE_LABEL}` : null);
  return (
    <div style={{ minWidth: 0 }}>
      <div title={titre} style={{ color: C.t1, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</div>
      {prix && <div style={{ color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{prix}{parsed.lieu ? ` · ${parsed.lieu}` : ""}</div>}
    </div>
  );
}

function CelluleStatut({ C, d }: { C: ThemeTokens; d: AppointmentRowData }) {
  const { r } = d;
  return (
    <div style={{ minWidth: 0 }}>
      <AppointmentStatusBadge C={C} statut={d.badgeStatut}/>
      {!estAbsent(r.motif_report) && (
        <div title={r.motif_report} style={{ display: "flex", alignItems: "center", gap: "5px", color: C.t3, fontSize: "12px", marginTop: "4px" }}>
          {IcoReport}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Reporté par le citoyen — {r.motif_report}</span>
        </div>
      )}
    </div>
  );
}

function CelluleLieu({ C, r }: { C: ThemeTokens; r: RDV }) {
  return (
    <div style={{ color: C.t2, fontSize: "13px", display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
      {r.duree_minutes ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t2 }}><span style={{ color: C.t3, display: "flex" }}>{IcoHorloge}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{r.duree_minutes} min</span></span> : null}
      {!estAbsent(r.guichet) ? <span title={r.guichet} style={{ display: "inline-flex", alignItems: "center", gap: "6px", minWidth: 0 }}><span style={{ color: C.t3, display: "flex" }}>{IcoPin}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guichet}</span></span> : null}
      {!r.duree_minutes && estAbsent(r.guichet) && <span style={{ color: C.t3 }}>—</span>}
    </div>
  );
}

// Un seul bouton primaire par ligne ; « Absent » en secondaire ; « Marquer
// terminé » en secondaire (désactivé tant que la présence n'est pas confirmée).
function CelluleActions({ C, d, a }: { C: ThemeTokens; d: AppointmentRowData; a: AppointmentActions }) {
  const ui = toUiTokens(C);
  const { r } = d;
  const presenceConfirmee = r.presence_status === "present";
  const occupe = !!a.loading;
  const items = [{ label: "Voir détails", onClick: () => a.onOpen(r) }, ...(r.statut === "nouveau" ? [{ label: "Refuser", onClick: () => a.onRefuse(r.id), danger: true }] : [])];
  const absentBtn = d.isRetard && r.presence_status !== "absent"
    ? <Button tokens={ui} className="tap" variant="secondary" size="sm" disabled={occupe} onClick={() => a.onAbsent({ id: r.id, nom: r.citoyen_nom })}>{a.loading === r.id ? "…" : "Absent"}</Button>
    : null;
  let travail: React.ReactNode = null;
  if (r.statut === "nouveau") {
    travail = <><Button tokens={ui} className="tap" variant="primary" size="sm" disabled={occupe} onClick={() => a.onAccept(r.id)}>{a.loading === r.id ? "…" : "Accepter"}</Button>{absentBtn}</>;
  } else if (r.presence_status !== "absent" && r.statut === "en_attente") {
    travail = <><Button tokens={ui} className="tap" variant="primary" size="sm" disabled={occupe} onClick={() => a.onPrendre(r)}>Prendre en charge</Button>{absentBtn}</>;
  } else if (r.presence_status !== "absent" && r.statut === "confirme") {
    travail = <Button tokens={ui} className="tap" variant="secondary" size="sm" disabled={occupe || !presenceConfirmee} title={presenceConfirmee ? undefined : "Confirmez d'abord la présence"} onClick={() => { if (presenceConfirmee) a.onTermine(r); }}>Marquer terminé</Button>;
  }
  return (
    <div className="apt-act" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
      {travail}
      <button type="button" className="apt-btn tap" aria-label={`Voir le détail du rendez-vous de ${nomPropre(r.citoyen_nom)}`} title="Voir le détail" onClick={() => a.onOpen(r)}
        style={{ width: "32px", height: "32px", borderRadius: "8px", background: "none", border: `1px solid ${C.border}`, color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{IcoOeil}</button>
      <RowActionsMenu C={C} label={`Plus d'actions pour ${nomPropre(r.citoyen_nom)}`} items={items}/>
    </div>
  );
}

function ouvrirSiPasSelection(a: AppointmentActions, r: RDV) {
  if (typeof window !== "undefined" && (window.getSelection()?.toString() ?? "").length > 0) return; // sélection de texte : n'ouvre pas
  a.onOpen(r);
}

export function AppointmentsTable({ C, rows, actions }: { C: ThemeTokens; rows: AppointmentRowData[]; actions: AppointmentActions }) {
  const th = { color: C.t2, fontSize: "12px", fontWeight: 500 } as const;
  return (
    <>
      <AppointmentsStyles C={C}/>
      <div className="apt-table" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px" }}>
        <div className="apt-grid" role="presentation" style={{ position: "sticky", top: "var(--header-h)", zIndex: 2, height: "40px", backgroundColor: C.bgCard2, borderRadius: "12px 12px 0 0" }}>
          <span style={th}>Date et heure</span><span style={th}>Citoyen</span><span style={th}>Service</span><span style={th}>Statut</span><span style={th}>Durée / lieu</span><span style={{ ...th, textAlign: "right" }}>Actions</span>
        </div>
        {rows.map(d => {
          const { r } = d;
          return (
            <div key={r.id} role="button" tabIndex={0} aria-label={`Ouvrir le rendez-vous de ${nomPropre(r.citoyen_nom)}`} className="apt-grid apt-row tap"
              onClick={() => ouvrirSiPasSelection(actions, r)}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); actions.onOpen(r); } }}>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500 }}>{dateCourte(r.date_rdv)}</div>
                <div style={{ color: C.t3, fontSize: "13px" }}>{heureListe(r.heure_rdv)}</div>
              </div>
              <CelluleCitoyen C={C} d={d}/>
              <CelluleService C={C} r={r}/>
              <CelluleStatut C={C} d={d}/>
              <CelluleLieu C={C} r={r}/>
              <CelluleActions C={C} d={d} a={actions}/>
            </div>
          );
        })}
      </div>

      <div className="apt-cards">
        {rows.map(d => {
          const { r } = d;
          return (
            <div key={r.id} role="button" tabIndex={0} aria-label={`Ouvrir le rendez-vous de ${nomPropre(r.citoyen_nom)}`} className="apt-row tap"
              onClick={() => ouvrirSiPasSelection(actions, r)}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); actions.onOpen(r); } }}
              style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ color: C.t1, fontSize: "14px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{dateCourte(r.date_rdv)} · {heureListe(r.heure_rdv)}</span>
                <CelluleStatut C={C} d={d}/>
              </div>
              <CelluleCitoyen C={C} d={d}/>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <CelluleService C={C} r={r}/>
                <CelluleLieu C={C} r={r}/>
              </div>
              <CelluleActions C={C} d={d} a={actions}/>
            </div>
          );
        })}
      </div>
    </>
  );
}
