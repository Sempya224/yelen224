"use client";

// Briques présentationnelles de l'onglet Projets (refonte UI 20/10/2026).
// Aucune requête ni règle métier ici : ProjetsSection.tsx garde le chargement,
// les filtres, le tri, la progression (computeProgress), le drag & drop et
// toutes les mutations ; on dessine seulement ce qu'on nous passe.
import { type ThemeTokens } from "../../theme";
import { nomPropre, RowActionsMenu } from "../../components/ClockInShiftUi";
import {
  type Projet, type Membre, statutColor, statutLabel, prioriteLabel, santeInfo, nomMembre, initiales as initialesMembre,
} from "./ProjetsOverlays";

export type ProjetProgress = { pct: number; total: number; termine: number; enRetard: number };

export function ProjetsStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .prj-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
      @media(min-width:768px){.prj-grid{grid-template-columns:repeat(2,minmax(0,420px))}}
      @media(min-width:1280px){.prj-grid{grid-template-columns:repeat(3,minmax(0,420px))}}
      .prj-card{transition:border-color .15s ease}
      .prj-card:hover{border-color:${C.border2}!important}
      .prj-card:focus-visible,.prj-row:focus-visible,.prj-kcard:focus-visible,.prj-bar:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .prj-row:hover{background-color:${C.bgCard2}}
      .prj-listhead,.prj-row{display:grid;grid-template-columns:minmax(0,1fr) 170px 96px 130px 130px 110px 44px;gap:12px;align-items:center;padding:0 16px}
      .prj-row{min-height:64px;cursor:pointer}
      @media(max-width:1023px){
        .prj-listhead{display:none}
        .prj-row{grid-template-columns:minmax(0,1fr) auto;padding:12px 16px;row-gap:8px}
        .prj-row>.prj-c{display:none}
      }
      .prj-kan{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:12px;align-items:start;overflow-x:auto}
      @media(prefers-reduced-motion:reduce){.prj-card{transition:none!important}}
    `}</style>
  );
}

// ── Formatage d'affichage ────────────────────────────────────────────────
export function dateProjet(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(memeAnnee ? {} : { year: "numeric" }) });
}
function estEnRetard(p: Projet): boolean {
  if (!p.date_fin_prevue || p.statut === "termine") return false;
  const t = new Date(); const auj = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return p.date_fin_prevue < auj;
}

// ── Badges ───────────────────────────────────────────────────────────────
export function StatutBadge({ C, statut }: { C: ThemeTokens; statut: string }) {
  const couleur = statutColor(statut, C);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${couleur}1c`, color: statut === "a_venir" ? C.t2 : couleur, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: couleur }}/>{statutLabel(statut)}
    </span>
  );
}
export function PrioriteBadge({ C, priorite }: { C: ThemeTokens; priorite: string }) {
  const couleur = priorite === "haute" ? C.orange : C.t3;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${couleur}1c`, color: priorite === "haute" ? couleur : C.t2, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>{prioriteLabel(priorite)}</span>
  );
}

export function Avatar({ C, texte, taille = 24 }: { C: ThemeTokens; texte: string; taille?: number }) {
  return (
    <span aria-hidden="true" style={{ width: `${taille}px`, height: `${taille}px`, borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "10px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{texte}</span>
  );
}

export function ResponsableLabel({ C, projet, membres }: { C: ThemeTokens; projet: Projet; membres: Membre[] }) {
  const nom = nomMembre(projet.responsable_membre_id, membres);
  if (!nom) return <span style={{ color: C.t3, fontSize: "13px" }}>Non assigné</span>;
  return (
    <span title={nom} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
      <Avatar C={C} texte={initialesMembre(projet.responsable_membre_id, membres) ?? "?"}/>
      <span style={{ color: C.t1, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomPropre(nom)}</span>
    </span>
  );
}

export function CibleLabel({ C, projet, court }: { C: ThemeTokens; projet: Projet; court?: boolean }) {
  if (!projet.date_fin_prevue) return <span style={{ color: C.t3, fontSize: "13px" }}>—</span>;
  const retard = estEnRetard(projet);
  const couleur = retard ? C.red : C.t2;
  return (
    <span title={retard ? "Date cible dépassée" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap", color: couleur, fontSize: "13px", fontWeight: retard ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
      {retard
        ? <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        : <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
      {court ? "" : "Cible : "}{dateProjet(projet.date_fin_prevue)}{retard && <span style={{ fontWeight: 600 }}> · En retard</span>}
    </span>
  );
}

export function ProgressBar({ C, pct, hauteur = 6 }: { C: ThemeTokens; pct: number; hauteur?: number }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progression" style={{ height: `${hauteur}px`, borderRadius: `${hauteur / 2}px`, backgroundColor: C.bg3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, backgroundColor: pct >= 100 ? C.green : C.gold, borderRadius: `${hauteur / 2}px` }}/>
    </div>
  );
}

export type ProjetAction = { label: string; onClick: () => void; danger?: boolean };

// ── Carte projet ─────────────────────────────────────────────────────────
export function ProjectCardView({ C, projet, membres, progress, onOpen, actions }: {
  C: ThemeTokens; projet: Projet; membres: Membre[]; progress: ProjetProgress; onOpen: () => void; actions: ProjetAction[];
}) {
  const sante = santeInfo(projet.sante, C);
  return (
    <div role="button" tabIndex={0} className="prj-card tap" onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}
      style={{ backgroundColor: C.bgCard, borderRadius: "12px", border: `1px solid ${C.border}`, padding: "20px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "14px", boxSizing: "border-box", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", minWidth: 0 }}>
          {sante && <span role="img" aria-label={`Santé : ${sante.label}`} title={sante.label} style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: sante.color, flexShrink: 0, marginTop: "7px" }}/>}
          <h3 title={projet.nom} style={{ margin: 0, color: C.t1, fontSize: "16px", fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{projet.nom}</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <StatutBadge C={C} statut={projet.statut}/>
          <RowActionsMenu C={C} label={`Actions pour ${projet.nom}`} items={actions}/>
        </div>
      </div>

      {projet.description && (
        <p style={{ margin: 0, color: C.t2, fontSize: "13px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>{projet.description}</p>
      )}

      <div style={{ marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "6px", fontSize: "12px", color: C.t2 }}>
          <span>Progression{progress.total > 0 && <span style={{ color: C.t3 }}> · {progress.termine} / {progress.total} tâche{progress.total > 1 ? "s" : ""}</span>}</span>
          <span style={{ color: C.t1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{progress.pct} %</span>
        </div>
        <ProgressBar C={C} pct={progress.pct}/>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 12px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
        <ResponsableLabel C={C} projet={projet} membres={membres}/>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <CibleLabel C={C} projet={projet}/>
          <PrioriteBadge C={C} priorite={projet.priorite}/>
        </div>
      </div>
    </div>
  );
}

// ── États ────────────────────────────────────────────────────────────────
export function ProjectsSkeleton({ label = "Chargement des projets" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="prj-grid">
      {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="cix-skel" style={{ height: "210px", borderRadius: "12px" }}/>)}
    </div>
  );
}
