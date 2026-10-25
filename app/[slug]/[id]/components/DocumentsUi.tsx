"use client";

// Briques visuelles de l'onglet Documents institutionnels (refonte visuelle du
// 24/10/2026, frontend uniquement) — extraites de DocumentsTab.tsx pour que ce
// dernier ne garde que l'état et les appels API. Aucune logique métier ici :
// tout ce qui est affiché dérive des données déjà chargées (statuts des
// documents, statut du compte, dernières décisions), jamais d'une date ou d'une
// étape inventée.
import type { ReactNode } from "react";
import Image from "next/image";
import type { ThemeTokens } from "../theme";
import { toCardTokens, toUiTokens } from "../theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { YelenLoader } from "@/components/YelenLoader";
import { dateHeureComplete } from "@/lib/heure";

export type DocStatut = "recu" | "valide" | "complement_demande" | "rejete" | null;

export type DocumentItem = {
  type: string;
  label: string;
  description: string;
  formats: string;
  obligatoire: boolean;
  statut: DocStatut;
  motif_rejet: string | null;
  soumis_le: string | null;
  // Optionnel : absent d'une réponse d'une version antérieure de l'API.
  examine_le?: string | null;
};

export type DecisionVerification = {
  axe: string;
  type_decision: string;
  justification: string | null;
  complement_demande_motif: string | null;
  decide_le: string;
  expire_le: string | null;
};

export type DocumentsResponse = {
  institution_statut: string;
  // Date de validation du compte : null si inconnue (compte validé avant le suivi
  // de cette date) ou non validé. Optionnelle pour une API antérieure.
  validee_le?: string | null;
  statut_juridique: string | null;
  documents: DocumentItem[];
  // Optionnel : absent d'une réponse d'une version antérieure de l'API.
  decisions?: { identite: DecisionVerification | null; autorite: DecisionVerification | null };
};

const RECU_VERS_EN_EXAMEN_MS = 24 * 60 * 60 * 1000;

export function DocumentsStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .dc-page{animation:dcIn 0.18s ease}
      @keyframes dcIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
      .dc-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
      .dc-main{display:flex;flex-direction:column;gap:12px;min-width:0}
      .dc-side{display:flex;flex-direction:column;gap:12px;min-width:0}
      @media (min-width:1024px){
        .dc-grid{grid-template-columns:minmax(0,1fr) 340px;gap:24px}
        .dc-side{position:sticky;top:16px}
      }
      .dc-drop{transition:background-color 0.14s ease,border-color 0.14s ease}
      .dc-drop:not(:disabled):hover{background-color:${C.bgCard2};border-color:${C.gold}}
      @keyframes dcPulse{0%,100%{opacity:1}50%{opacity:0.5}}
      .dc-skel{background:${C.bgCard2};border-radius:10px;animation:dcPulse 1.3s ease-in-out infinite}
      @media (prefers-reduced-motion:reduce){
        .dc-page,.dc-skel{animation:none}
        .dc-drop{transition:none}
      }
    `}</style>
  );
}

function Icone({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const IC = {
  doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></>,
  check: <polyline points="20 6 9 17 4 12"/>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
};

// ── En-tête ────────────────────────────────────────────────────────────────
export function StatutCompteChip({ statut, C }: { statut: string; C: ThemeTokens }) {
  const meta =
    statut === "validee" ? { label: "Compte validé", color: C.green } :
    statut === "refusee" ? { label: "Dossier refusé", color: C.red } :
    statut === "suspendue" ? { label: "Espace suspendu", color: C.red } :
    { label: "En attente de validation", color: C.gold };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border2}`, backgroundColor: C.bgCard2, borderRadius: 999, padding: "4px 12px", color: C.t1, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: meta.color }}/>
      {meta.label}
    </span>
  );
}

export function EnteteDocuments({ C, statut, sousTitre, aide }: { C: ThemeTokens; statut: string; sousTitre: string; aide: ReactNode }) {
  return (
    <header style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.t2, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Établissement</div>
          <h1 style={{ color: C.t1, fontSize: 24, fontWeight: 700, letterSpacing: "-0.4px", margin: 0 }}>Documents</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatutCompteChip statut={statut} C={C}/>
          {aide}
        </div>
      </div>
      <p style={{ color: C.t2, fontSize: 13, lineHeight: 1.55, margin: "8px 0 0", maxWidth: 720 }}>{sousTitre}</p>
    </header>
  );
}

// ── Bannière d'état (validé, reçu, refusé, suspendu, à compléter) ──────────
export function BanniereEtat({ C, ton, titre, texte, role, action, illustration }: {
  C: ThemeTokens; ton: "succes" | "attente" | "alerte" | "neutre"; titre: string; texte: ReactNode;
  role?: "alert" | "status"; action?: ReactNode; illustration?: ReactNode;
}) {
  const couleur = ton === "succes" ? C.green : ton === "alerte" ? C.red : ton === "attente" ? C.gold : C.t3;
  const fond = ton === "succes" ? C.greenL : ton === "alerte" ? C.redL : C.bgCard2;
  return (
    <div role={role} style={{ display: "flex", alignItems: "center", gap: 16, backgroundColor: fond, border: `1px solid ${couleur}40`, borderRadius: 14, padding: "16px 18px" }}>
      {illustration ?? (
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.bgCard, border: `1px solid ${couleur}60`, color: couleur, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icone size={20}>{ton === "succes" ? IC.check : IC.alert}</Icone>
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.t1, fontSize: 15, fontWeight: 600, marginBottom: 3 }}>{titre}</div>
        <div style={{ color: C.t2, fontSize: 13, lineHeight: 1.55 }}>{texte}</div>
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
}

// Logo de l'établissement avec pastille "vérifié" (coche) en bas à droite —
// remplace l'icône générique de la bannière "documents validés". Sans logo,
// les initiales de l'établissement (jamais une image inventée).
export function LogoEtablissementVerifie({ C, nom, logo }: { C: ThemeTokens; nom: string | null | undefined; logo: string | null | undefined }) {
  const initiales = (nom ?? "").split(" ").filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span role="img" aria-label={`${nom || "Établissement"} — vérifié`} style={{ position: "relative", width: 48, height: 48, flexShrink: 0, display: "inline-block" }}>
      <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 14, overflow: "hidden", backgroundColor: C.gold, border: `1px solid ${C.border2}` }}>
        {logo ? (
          <Image src={logo} alt="" fill sizes="48px" style={{ objectFit: "cover" }}/>
        ) : (
          <span style={{ color: "#000", fontSize: 16, fontWeight: 700 }}>{initiales}</span>
        )}
      </span>
      <span aria-hidden="true" style={{ position: "absolute", right: -5, bottom: -5, width: 20, height: 20, borderRadius: "50%", backgroundColor: C.green, border: `2px solid ${C.bgCard}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icone size={11}>{IC.check}</Icone>
      </span>
    </span>
  );
}

// Illustration "documents en cours d'examen" — simple SVG décoratif, dupliqué
// volontairement depuis CentreConfigurationTab.tsx (même état, même retour du
// 14/08/2026), sans logique à factoriser.
export function IllustrationExamen({ C }: { C: ThemeTokens }) {
  return (
    <svg width="56" height="56" viewBox="0 0 96 96" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="24" y="14" width="40" height="52" rx="4" fill="none" stroke={C.t2} strokeWidth="2" />
      <line x1="32" y1="28" x2="56" y2="28" stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="36" x2="56" y2="36" stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="44" x2="48" y2="44" stroke={C.t3} strokeWidth="2" strokeLinecap="round" />
      <circle cx="66" cy="58" r="14" fill={C.bgCard} stroke={C.gold} strokeWidth="3" />
      <path d="M60 58l4 4 8-8" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Colonne latérale : progression + parcours ──────────────────────────────
export function ProgressionDocuments({ C, soumis, total, compteValide }: { C: ThemeTokens; soumis: number; total: number; compteValide: boolean }) {
  const pct = total === 0 ? 0 : Math.round((soumis / total) * 100);
  const couleur = compteValide ? C.green : C.gold;
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.border2}` }}>
      <div style={{ color: C.t2, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Documents soumis</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
        <span style={{ color: C.t1, fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{soumis}</span>
        <span style={{ color: C.t2, fontSize: 13 }}>sur {total}</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={soumis} aria-label={`${soumis} documents soumis sur ${total}`}
        style={{ height: 8, borderRadius: 999, backgroundColor: C.bg3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", backgroundColor: couleur, borderRadius: 999, transition: "width 0.3s ease" }}/>
      </div>
    </Card>
  );
}

type EtatEtape = "fait" | "courant" | "avenir";
export function ParcoursVerification({ C, depotComplet, compteValide, dernierDepot, valideeLe }: { C: ThemeTokens; depotComplet: boolean; compteValide: boolean; dernierDepot: string | null; valideeLe: string | null }) {
  // Dérivé uniquement de l'état réel : dépôt complet (tous les documents requis
  // reçus ou validés), statut du compte et date du dernier dépôt. Aucune autre
  // date ni étape inventée : le compte n'a pas de date de validation en données.
  const etapes: { titre: string; texte: string; etat: EtatEtape }[] = [
    { titre: "Dépôt des documents", texte: depotComplet ? `Tous les documents requis sont reçus${dernierDepot ? ` — dernier dépôt le ${dateHeureComplete(dernierDepot)}` : ""}.` : "Envoyez les documents demandés.", etat: depotComplet ? "fait" : "courant" },
    { titre: "Examen par l'équipe Yelen", texte: compteValide ? "Examen terminé." : depotComplet ? "Votre dossier est en cours d'examen." : "Commence une fois le dépôt complet.", etat: compteValide ? "fait" : depotComplet ? "courant" : "avenir" },
    { titre: "Compte validé", texte: compteValide ? `Votre établissement est vérifié${valideeLe ? ` — validé le ${dateHeureComplete(valideeLe)}` : ""}.` : "Vous serez averti par notification.", etat: compteValide ? "fait" : "avenir" },
  ];
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${C.border2}` }}>
      <div style={{ color: C.t2, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Parcours de vérification</div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {etapes.map((e, i) => {
          const couleur = e.etat === "fait" ? C.green : e.etat === "courant" ? C.gold : C.t3;
          return (
            <li key={e.titre} aria-current={e.etat === "courant" ? "step" : undefined} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${couleur}`, backgroundColor: e.etat === "fait" ? couleur : "transparent", color: "#000" }}>
                  {e.etat === "fait" ? <Icone size={12}>{IC.check}</Icone> : <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: e.etat === "courant" ? couleur : "transparent" }}/>}
                </span>
                {i < etapes.length - 1 && <span aria-hidden="true" style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: e.etat === "fait" ? C.green : C.border2 }}/>}
              </div>
              <div style={{ paddingBottom: i < etapes.length - 1 ? 14 : 0, minWidth: 0 }}>
                <div style={{ color: C.t1, fontSize: 13, fontWeight: 600 }}>{e.titre}<span className="dc-sr"> — {e.etat === "fait" ? "terminé" : e.etat === "courant" ? "en cours" : "à venir"}</span></div>
                <div style={{ color: C.t2, fontSize: 12, lineHeight: 1.5 }}>{e.texte}</div>
              </div>
            </li>
          );
        })}
      </ol>
      <style>{`.dc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`}</style>
    </Card>
  );
}

export function NoteConfidentialite({ C }: { C: ThemeTokens }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, backgroundColor: C.bgCard2 }}>
      <span aria-hidden="true" style={{ color: C.t2, flexShrink: 0, marginTop: 1 }}><Icone size={16}>{IC.lock}</Icone></span>
      <p style={{ color: C.t2, fontSize: 12, lineHeight: 1.55, margin: 0 }}>
        Ces documents permettent à Yelen224 de vérifier l&apos;existence légale de votre établissement. Ils ne sont consultables que par l&apos;équipe de vérification — jamais visibles publiquement.
      </p>
    </div>
  );
}

// ── Décisions de l'équipe Yelen (B2) ───────────────────────────────────────
const AXE_LABEL: Record<string, string> = { identite: "Identité", autorite: "Autorité" };

function decisionMeta(type: string, C: ThemeTokens): { label: string; color: string } {
  if (type === "accordee") return { label: "Vérifié", color: C.green };
  if (type === "complement_demande") return { label: "Complément demandé", color: C.orange };
  if (type === "rejetee") return { label: "Non vérifié", color: C.red };
  if (type === "revoquee") return { label: "Révoqué", color: C.red };
  return { label: "Décision enregistrée", color: C.t3 };
}

// Mêmes libellés que l'écran admin de vérification. N'apparaît que s'il existe
// au moins une décision : jamais un bloc vide ni un "en attente" inventé.
export function DecisionsVerification({ decisions, C }: { decisions: DocumentsResponse["decisions"]; C: ThemeTokens }) {
  const lignes = [decisions?.identite, decisions?.autorite].filter((d): d is DecisionVerification => !!d);
  if (lignes.length === 0) return null;
  return (
    <Card tokens={toCardTokens(C)} noPadding style={{ border: `1px solid ${C.border2}` }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, color: C.t2, fontSize: 12, fontWeight: 600 }}>
        Décisions de l&apos;équipe Yelen
      </div>
      {lignes.map((d, i) => {
        const meta = decisionMeta(d.type_decision, C);
        const expiree = !!d.expire_le && new Date(d.expire_le).getTime() < Date.now();
        return (
          <div key={d.axe} style={{ padding: "12px 16px", borderBottom: i < lignes.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: C.t1, fontSize: 13, fontWeight: 600 }}>{AXE_LABEL[d.axe] ?? d.axe}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.t2, fontSize: 12, fontWeight: 600 }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: meta.color }}/>
                {meta.label}
              </span>
            </div>
            <div style={{ color: C.t2, fontSize: 12, marginTop: 2 }}>
              Le {dateHeureComplete(d.decide_le)}
              {d.expire_le && (expiree ? ` · périmée depuis le ${dateHeureComplete(d.expire_le)}` : ` · valable jusqu'au ${dateHeureComplete(d.expire_le)}`)}
            </div>
            {d.type_decision === "complement_demande" && d.complement_demande_motif && (
              <p style={{ color: C.t1, fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}>À fournir : {d.complement_demande_motif}</p>
            )}
            {d.justification && <p style={{ color: C.t2, fontSize: 12, lineHeight: 1.5, margin: "6px 0 0" }}>{d.justification}</p>}
          </div>
        );
      })}
    </Card>
  );
}

// ── Statut d'un document ───────────────────────────────────────────────────
function statutDocumentMeta(statut: DocStatut, soumisLe: string | null, C: ThemeTokens): { label: string; color: string; bg: string } {
  if (statut === "valide") return { label: "Validé", color: C.green, bg: C.greenL };
  if (statut === "rejete") return { label: "Rejeté", color: C.red, bg: C.redL };
  if (statut === "complement_demande") return { label: "Complément demandé", color: C.orange, bg: C.orangeL };
  if (statut === "recu") {
    const enExamen = soumisLe ? (Date.now() - new Date(soumisLe).getTime()) > RECU_VERS_EN_EXAMEN_MS : false;
    return { label: enExamen ? "En cours d'examen" : "Reçu", color: C.blue, bg: C.blueL };
  }
  return { label: "À fournir", color: C.t3, bg: C.bg3 };
}

// Point coloré + texte en couleur de texte standard : le texte teinté
// (orange/vert sur fond teinté) n'atteint pas toujours le contraste AA.
export function BadgeStatutDocument({ statut, soumisLe, C }: { statut: DocStatut; soumisLe: string | null; C: ThemeTokens }) {
  const m = statutDocumentMeta(statut, soumisLe, C);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: m.bg, border: `1px solid ${m.color}30`, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: m.color }}/>
      <span style={{ color: C.t1 }}>{m.label}</span>
    </span>
  );
}

// ── Carte d'un document ────────────────────────────────────────────────────
export function DocumentCarte({ C, doc, uploading, onPick, inputRef, onFile, readOnly }: {
  C: ThemeTokens; doc: DocumentItem; uploading: boolean; onPick: () => void;
  inputRef: (el: HTMLInputElement | null) => void; onFile: (f: File) => void; readOnly: boolean;
}) {
  // Dirigeant (lecture seule) : jamais de zone de dépôt, quel que soit le
  // statut du document — seul l'admin peut soumettre/renvoyer.
  const locked = readOnly || doc.statut === "recu" || doc.statut === "valide";
  const alerte = doc.statut === "rejete" || doc.statut === "complement_demande";
  const couleurIcone = doc.statut === "valide" ? C.green : alerte ? C.orange : doc.statut === "recu" ? C.blue : C.t2;

  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ border: `1px solid ${alerte ? C.orange + "60" : C.border2}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.bgCard2, border: `1px solid ${C.border}`, color: couleurIcone, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icone size={20}>{IC.doc}</Icone>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ color: C.t1, fontSize: 14, fontWeight: 600, margin: 0 }}>{doc.label}{doc.obligatoire && <span style={{ color: C.t2, fontWeight: 400 }}> · obligatoire</span>}</h2>
            <BadgeStatutDocument statut={doc.statut} soumisLe={doc.soumis_le} C={C}/>
          </div>
          <p style={{ color: C.t2, fontSize: 12, lineHeight: 1.5, margin: "3px 0 0" }}>{doc.description}</p>
          {/* Dates réelles uniquement : dépôt de la version active et, une fois
              l'examen fait, sa date. Rien si le document n'a jamais été déposé. */}
          {(doc.soumis_le || doc.examine_le) && (
            <p style={{ color: C.t2, fontSize: 12, lineHeight: 1.5, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>
              {doc.soumis_le && <>Déposé le {dateHeureComplete(doc.soumis_le)}</>}
              {doc.soumis_le && doc.examine_le && " · "}
              {doc.examine_le && <>Examiné le {dateHeureComplete(doc.examine_le)}</>}
            </p>
          )}
        </div>
      </div>

      {doc.motif_rejet && alerte && (
        <div role="alert" style={{ backgroundColor: C.orangeL, border: `1px solid ${C.orange}30`, borderRadius: 10, padding: "10px 12px", marginTop: 12 }}>
          <p style={{ color: C.t1, fontSize: 13, lineHeight: 1.5, margin: 0, fontWeight: 600 }}>{doc.motif_rejet}</p>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {locked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, backgroundColor: C.bg3, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.t2, fontSize: 12 }}>
              {readOnly && doc.statut !== "recu" && doc.statut !== "valide"
                ? "Consultation seule — l'envoi est réservé à l'administrateur."
                : doc.statut === "valide" ? "Document validé — plus aucune action requise." : "Document reçu, en attente d'examen. Aucun renvoi possible pour l'instant."}
            </span>
          </div>
        ) : (
          <>
            {/* Vrai bouton (clavier : Tab + Entrée/Espace) ; l'input fichier reste
                masqué, hors du bouton (un input n'a pas sa place dans un button). */}
            <button type="button" onClick={onPick} disabled={uploading} aria-busy={uploading}
              aria-label={`${doc.statut ? "Renvoyer" : "Sélectionner un fichier pour"} : ${doc.label}`}
              className="dc-drop tap yelen-focus-ring"
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: 12, borderRadius: 12, border: `1.5px dashed ${C.border2}`, background: "none", font: "inherit", textAlign: "left", cursor: uploading ? "default" : "pointer", boxSizing: "border-box" }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.t2 }}>
                {uploading ? <YelenLoader size={16}/> : <Icone size={16}>{IC.upload}</Icone>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", color: C.t1, fontSize: 13, fontWeight: 600 }}>{uploading ? "Envoi en cours…" : (doc.statut ? "Renvoyer le document" : "Sélectionner un fichier")}</span>
                <span style={{ display: "block", color: C.t2, fontSize: 12 }}>Formats acceptés : {doc.formats} — 10 Mo max</span>
              </span>
            </button>
            <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" tabIndex={-1} aria-hidden="true" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}/>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Bandeau-guide : comment un document change de statut ───────────────────
// Texte fixe qui décrit le comportement réel de l'écran et de l'API (renvoi
// possible seulement après rejet ou complément, nouveau dépôt = statut "Reçu",
// "En cours d'examen" = reçu depuis plus de 24 h). Aucun délai de traitement
// n'est promis : l'app n'en a pas.
const GUIDE_STATUTS: { statut: DocStatut; texte: string }[] = [
  { statut: null, texte: "Aucun fichier envoyé. Sélectionnez-le depuis la carte du document." },
  { statut: "recu", texte: "Le document est chez l'équipe Yelen. Passé 24 h, il s'affiche « En cours d'examen ». Aucun renvoi possible pendant l'examen." },
  { statut: "complement_demande", texte: "L'équipe précise ce qui manque. Renvoyez le document : il repasse à « Reçu »." },
  { statut: "rejete", texte: "Le motif est affiché sur la carte. Renvoyez un document corrigé : il repasse à « Reçu »." },
  { statut: "valide", texte: "Le document est retenu. Plus aucune action n'est requise de votre part." },
];

export function GuideStatutsDocuments({ C, onOuvrirEntreprise }: { C: ThemeTokens; onOuvrirEntreprise?: () => void }) {
  return (
    <section aria-labelledby="dc-guide-titre" style={{ marginTop: 16, backgroundColor: `${C.gold}0F`, border: `1px solid ${C.gold}30`, borderRadius: 14, padding: "16px 20px" }}>
      <h2 id="dc-guide-titre" style={{ color: C.t1, fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>
        Comprendre les statuts de vos documents
      </h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px 20px" }}>
        {GUIDE_STATUTS.map((g) => {
          const m = statutDocumentMeta(g.statut, null, C);
          return (
            <li key={m.label} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: m.color, flexShrink: 0 }}/>
                <span style={{ color: C.t1, fontSize: 13, fontWeight: 600 }}>{m.label}</span>
              </div>
              <p style={{ color: C.t2, fontSize: 12, lineHeight: 1.55, margin: 0 }}>{g.texte}</p>
            </li>
          );
        })}
      </ul>
      <p style={{ color: C.t2, fontSize: 12, lineHeight: 1.55, margin: "14px 0 0", paddingTop: 12, borderTop: `1px solid ${C.gold}30` }}>
        Votre compte est validé par l&apos;équipe Yelen une fois l&apos;examen terminé. Vous êtes averti par notification à chaque décision.
      </p>

      {/* Que se passe-t-il quand l'établissement modifie ses informations ?
          Reprend le comportement réel de l'onglet Entreprise : confirmation par
          PIN, examen par l'équipe, anciennes informations visibles en attendant,
          suivi dans l'onglet (en cours d'examen / conforme / à corriger). */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.gold}30` }}>
        <h3 style={{ color: C.t1, fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>Si vous modifiez votre établissement</h3>
        <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 4 }}>
          <li style={{ color: C.t2, fontSize: 12, lineHeight: 1.55 }}>Changer le nom, l&apos;adresse, la localisation ou l&apos;activité demande de confirmer votre PIN.</li>
          <li style={{ color: C.t2, fontSize: 12, lineHeight: 1.55 }}>L&apos;équipe Yelen examine la modification, et peut demander un contrôle complémentaire avant de la valider.</li>
          <li style={{ color: C.t2, fontSize: 12, lineHeight: 1.55 }}>En attendant sa décision, les citoyens continuent de voir l&apos;information actuelle.</li>
          <li style={{ color: C.t2, fontSize: 12, lineHeight: 1.55 }}>Le suivi apparaît dans l&apos;onglet Entreprise : en cours d&apos;examen, conforme, ou à corriger avec le commentaire de l&apos;équipe.</li>
        </ul>
        {onOuvrirEntreprise && (
          <div style={{ marginTop: 12 }}>
            <Button tokens={toUiTokens(C)} variant="secondary" size="md" className="tap dc-cta" ariaLabel="Ouvrir l'onglet Entreprise pour modifier les informations de l'établissement" onClick={onOuvrirEntreprise}>
              Ouvrir Entreprise
            </Button>
          </div>
        )}
      </div>
      <style>{`@media (max-width:1023px){.dc-cta{min-height:44px}}`}</style>
    </section>
  );
}

// ── Ligne en lecture (compte validé : seulement les types retenus) ─────────
export function DocumentLigneValidee({ C, label, dernier }: { C: ThemeTokens; label: string; dernier: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: dernier ? "none" : `1px solid ${C.border}` }}>
      <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: C.greenL, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icone size={13}>{IC.check}</Icone>
      </span>
      <span style={{ color: C.t1, fontSize: 13, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// ── Squelette et états techniques ──────────────────────────────────────────
export function SqueletteDocuments() {
  return (
    <div role="status" aria-label="Chargement des documents" className="dc-grid">
      <div className="dc-main">
        <div className="dc-skel" style={{ height: 30, width: "34%" }}/>
        <div className="dc-skel" style={{ height: 14, width: "70%" }}/>
        <div className="dc-skel" style={{ height: 72, borderRadius: 14 }}/>
        {[0, 1].map((i) => <div key={i} className="dc-skel" style={{ height: 150, borderRadius: 14 }}/>)}
      </div>
      <div className="dc-side">
        <div className="dc-skel" style={{ height: 96, borderRadius: 14 }}/>
        <div className="dc-skel" style={{ height: 190, borderRadius: 14 }}/>
      </div>
    </div>
  );
}

export function ErreurDocuments({ C, relance, onRetry }: { C: ThemeTokens; relance: boolean; onRetry: () => void | Promise<void> }) {
  return (
    <div role="alert" style={{ padding: "48px 16px", textAlign: "center" }}>
      <p style={{ color: C.t2, fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>Documents indisponibles. Vérifiez votre connexion et réessayez.</p>
      <Button tokens={toUiTokens(C)} variant="secondary" size="md" className="tap" loading={relance} ariaLabel="Réessayer de charger les documents" onClick={onRetry}>
        {relance ? "Chargement…" : "Réessayer"}
      </Button>
    </div>
  );
}
