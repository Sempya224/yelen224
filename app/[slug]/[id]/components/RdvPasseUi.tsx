"use client";

// Pièces d'affichage de l'onglet « Rendez-vous passés » (refonte 25/10/2026) :
// ligne dense, menu « ⋯ », modale « Détails », champ date jj/mm/aaaa, squelettes.
// Aucune logique métier ni appel API ici : tout arrive par props depuis RdvPasseTab.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { type ThemeTokens, toUiTokens, toCardTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEVISE_LABEL } from "@/lib/devise";
import { dateMuraleAbregee, heureAmPm, horodatageAbrege } from "@/lib/heure";
import { formatTelephone, parseAppointmentLabel } from "./rdv/parseAppointmentLabel";

export type RdvHisto = {
  id: string; objet: string | null; date_rdv: string; heure_rdv: string;
  statut: string; citoyen_id: string; citoyen_nom: string; citoyen_phone: string;
  notes: string | null; motif_annulation: string | null; created_at: string;
  presence_status: string | null; reference: string;
  service_nom: string | null; service_prix: number | null;
  derniere_action: string | null; agent_nom: string | null; derniere_action_le: string | null;
};

// ── Styles partagés ─────────────────────────────────────────────────────────
export function RdvPasseStyles() {
  return (
    <style>{`
      .rdvp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
      .rdvp-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,1.1fr) 372px;gap:16px;align-items:center}
      .rdvp-head{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,1.1fr) 372px;gap:16px;padding:0 16px 8px}
      .rdvp-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .rdvp-chip{min-height:32px}
      .rdvp-filtres-btn{display:none}
      .rdvp-skel{border-radius:10px}
      @media(max-width:1023px){
        .rdvp-head{display:none}
        .rdvp-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
        .rdvp-actions{grid-column:1/-1}
      }
      @media(max-width:639px){
        .rdvp-grid{grid-template-columns:minmax(0,1fr)}
        .rdvp-btn{min-height:44px !important}
        .rdvp-icobtn{width:44px !important;height:44px !important}
        .rdvp-chip{min-height:40px}
        .rdvp-filtres-btn{display:inline-flex}
        .rdvp-filtres{display:none !important}
        .rdvp-filtres[data-open="true"]{display:flex !important}
      }
      @media(prefers-reduced-motion:no-preference){
        .rdvp-card{transition:border-color 120ms ease}
        .rdvp-skel{animation:rdvpPulse 1.2s ease-in-out infinite}
        @keyframes rdvpPulse{0%,100%{opacity:.55}50%{opacity:1}}
      }
    `}</style>
  );
}

// ── Helpers d'affichage ─────────────────────────────────────────────────────
const AVATAR_PALETTE = ["blue", "green", "purple", "orange", "teal", "red"] as const;
function avatarColor(nom: string, C: ThemeTokens): { c: string; bg: string } {
  let h = 0; for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  const key = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  const map: Record<string, { c: string; bg: string }> = {
    blue: { c: C.blue, bg: C.blueL }, green: { c: C.green, bg: C.greenL }, purple: { c: C.purple, bg: C.purpleL },
    orange: { c: C.orange, bg: C.orangeL }, teal: { c: C.teal, bg: C.tealL }, red: { c: C.red, bg: C.redL },
  };
  return map[key];
}

function initiales(nom: string): string {
  const mots = nom.split(/\s+/).filter(m => /^\p{L}/u.test(m));
  if (mots.length === 0) return "C";
  return (mots[0][0] + (mots[1]?.[0] ?? mots[0][1] ?? "")).toUpperCase();
}

export function statutBadge(r: RdvHisto, C: ThemeTokens): { dot: string; l: string } {
  if (r.presence_status === "absent") return { dot: C.t2, l: "Absent" };
  switch (r.statut) {
    case "confirme":   return { dot: C.green, l: "Confirmé" };
    case "en_attente": return { dot: C.gold,  l: "En attente" };
    case "nouveau":    return { dot: C.gold,  l: "Nouveau" };
    case "annule":     return { dot: C.red,   l: "Annulé" };
    case "termine":    return { dot: C.green, l: "Terminé" };
    default:           return { dot: C.t2,    l: r.statut };
  }
}

export function formatPrix(p: number): string { return p.toLocaleString("fr-FR") + " " + DEVISE_LABEL; }

function heureRdv(r: RdvHisto): string { return heureAmPm(r.heure_rdv) || r.heure_rdv; }
function quandRdv(r: RdvHisto): string { return `${dateMuraleAbregee(r.date_rdv) || r.date_rdv} · ${heureRdv(r)}`; }

// Libellé de la dernière action journalisée : « Accepté par Alpha camara », ou l'action seule sans auteur.
function actionLibelle(r: RdvHisto): string | null {
  if (!r.derniere_action) return null;
  return r.agent_nom ? `${r.derniere_action} par ${r.agent_nom}` : r.derniere_action;
}

function serviceAffiche(r: RdvHisto): { titre: string; detail: string | null; prix: string | null } {
  const p = parseAppointmentLabel(r.objet);
  const titre = r.service_nom || p.service || p.brut || "RDV général";
  let detail: string | null = null;
  if (p.beneficiaireNom) detail = `Pour ${p.beneficiaireNom}${p.beneficiaireTel ? ` (${formatTelephone(p.beneficiaireTel)})` : ""}`;
  else if (!p.reconnu && r.service_nom && p.brut) detail = p.brut;
  const prix = r.service_prix != null ? formatPrix(r.service_prix) : p.montant;
  return { titre, detail, prix };
}

// ── Texte replié sur 2 lignes ───────────────────────────────────────────────
function TexteRepliable({ libelle, texte, C }: { libelle: string; texte: string; C: ThemeTokens }) {
  const [ouvert, setOuvert] = useState(false);
  const long = texte.length > 90;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}>{libelle}</div>
      <div style={{ color: C.t2, fontSize: "12.5px", lineHeight: 1.5, overflowWrap: "anywhere", ...(ouvert ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }) }}>{texte}</div>
      {long && (
        <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert} className="yelen-focus-ring" style={{ background: "none", border: "none", padding: "2px 0", color: C.t1, fontSize: "12px", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
          {ouvert ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}

// ── Menu « ⋯ » ──────────────────────────────────────────────────────────────
export function MenuLigne({ C, nom, onDetails, onCopier }: { C: ThemeTokens; nom: string; onDetails: () => void; onCopier: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const declencheur = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => { if (ouvert) items.current[0]?.focus(); }, [ouvert]);

  function fermer(rendreFocus: boolean) {
    setOuvert(false);
    if (rendreFocus) declencheur.current?.focus();
  }
  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const cibles = items.current.filter((x): x is HTMLButtonElement => x !== null);
    const i = cibles.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); fermer(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); cibles[(i + 1) % cibles.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cibles[(i - 1 + cibles.length) % cibles.length]?.focus(); }
    else if (e.key === "Tab") setOuvert(false);
  }
  const itemStyle = { width: "100%", textAlign: "left" as const, padding: "11px 14px", background: "none", border: "none", color: C.t1, fontSize: "13px", fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ position: "relative" }}>
      <button ref={declencheur} type="button" onClick={() => setOuvert(o => !o)} aria-label={`Plus d'actions pour ${nom}`} aria-haspopup="menu" aria-expanded={ouvert} className="yelen-focus-ring rdvp-icobtn" style={{ width: "40px", height: "40px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}/>
          <div role="menu" aria-label={`Actions pour ${nom}`} onKeyDown={onMenuKey} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 501, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "10px", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", minWidth: "190px", overflow: "hidden" }}>
            <button ref={el => { items.current[0] = el; }} role="menuitem" type="button" onClick={() => { setOuvert(false); onDetails(); }} className="yelen-focus-ring" style={itemStyle}>Voir les détails</button>
            <div style={{ height: "1px", backgroundColor: C.border }}/>
            <button ref={el => { items.current[1] = el; }} role="menuitem" type="button" onClick={() => { setOuvert(false); onCopier(); }} className="yelen-focus-ring" style={itemStyle}>Copier la référence</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Ligne ───────────────────────────────────────────────────────────────────
export type ActionsLigne = "attente" | "termine" | "annule";

export function RdvLigne(props: {
  C: ThemeTokens; r: RdvHisto; actions: ActionsLigne; busy: boolean;
  suiviOuvert: boolean; suiviText: string;
  onSuiviText: (v: string) => void; onSuiviToggle: () => void; onSuiviSave: () => void; onSuiviCancel: () => void;
  onRappel: () => void; onDetails: () => void; onCopier: () => void;
}) {
  const { C, r, actions, busy, suiviOuvert } = props;
  const badge = statutBadge(r, C);
  const av = avatarColor(r.citoyen_nom, C);
  const svc = serviceAffiche(r);
  const action = actionLibelle(r);
  const motif = r.motif_annulation && r.presence_status !== "absent" ? r.motif_annulation : null;
  const ui = toUiTokens(C);
  const nomAria = r.citoyen_nom;
  return (
    <li>
      <Card tokens={toCardTokens(C)} padding="14px 16px" className="rdvp-card">
        <div className="rdvp-grid">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <div aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: av.bg, color: av.c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>{initiales(r.citoyen_nom)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.t1, fontSize: "13.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.citoyen_nom}</div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "2px" }}>
                {r.citoyen_phone && <span style={{ color: C.t2, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{formatTelephone(r.citoyen_phone)}</span>}
                <span style={{ backgroundColor: C.bg3, color: C.t2, fontSize: "11px", fontWeight: 600, padding: "1px 7px", borderRadius: "6px", fontFamily: "monospace" }}>{r.reference}</span>
              </div>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{svc.titre}</div>
            {(svc.detail || svc.prix) && (
              <div style={{ color: C.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[svc.detail, svc.prix].filter(Boolean).join(" · ")}
              </div>
            )}
            <div style={{ color: C.t2, fontSize: "12px", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>{quandRdv(r)}</div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", color: C.t1, fontSize: "13px", fontWeight: 600 }}>
              <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: badge.dot, flexShrink: 0 }}/>
              {badge.l}
            </div>
            {action && <div style={{ color: C.t2, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{action}</div>}
            <div style={{ color: C.t2, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>Créé le {horodatageAbrege(r.created_at) || "—"}</div>
          </div>

          <div className="rdvp-actions">
            {actions === "attente" && (
              <>
                <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" ariaLabel={`Marquer un suivi pour ${nomAria}`} style={{ whiteSpace: "nowrap" }} onClick={props.onSuiviToggle}>Marquer un suivi</Button>
                <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" ariaLabel={`Rappeler ${nomAria}`} style={{ whiteSpace: "nowrap" }} loading={busy} onClick={props.onRappel}>Rappeler ce client</Button>
              </>
            )}
            {actions === "termine" && (
              <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" ariaLabel={`Voir le dossier de ${nomAria}`} style={{ whiteSpace: "nowrap" }} onClick={props.onDetails}>Voir le dossier</Button>
            )}
            {actions === "annule" && (
              <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" ariaLabel={`Détails du rendez-vous de ${nomAria}`} style={{ whiteSpace: "nowrap" }} onClick={props.onDetails}>Détails</Button>
            )}
            <MenuLigne C={C} nom={nomAria} onDetails={props.onDetails} onCopier={props.onCopier}/>
          </div>
        </div>

        {(motif || r.notes) && (
          <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
            {motif && <TexteRepliable libelle="Motif d'annulation" texte={motif} C={C}/>}
            {r.notes && <TexteRepliable libelle="Suivi" texte={r.notes} C={C}/>}
          </div>
        )}

        {suiviOuvert && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
            <label htmlFor={`suivi-${r.id}`} style={{ display: "block", color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>Note de suivi pour {nomAria}</label>
            <textarea id={`suivi-${r.id}`} value={props.suiviText} onChange={e => props.onSuiviText(e.target.value)} placeholder="Note de suivi pour ce rendez-vous…" rows={2} className="yelen-focus-ring" style={{ width: "100%", backgroundColor: C.bg3, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.6, resize: "none", color: C.t1, marginBottom: "8px" }}/>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="secondary" size="md" onClick={props.onSuiviCancel}>Annuler</Button>
              <Button tokens={ui} className="rdvp-btn yelen-focus-ring" variant="primary" size="md" loading={busy} onClick={props.onSuiviSave}>Enregistrer</Button>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}

export function EnteteColonnes({ C }: { C: ThemeTokens }) {
  const s = { color: C.t2, fontSize: "12px", fontWeight: 600 } as const;
  return (
    <div className="rdvp-head" aria-hidden="true">
      <span style={s}>Client</span><span style={s}>Service et date</span><span style={s}>Statut</span>
      <span/>
    </div>
  );
}

// ── Squelettes ──────────────────────────────────────────────────────────────
export function SqueletteLignes({ C, n }: { C: ThemeTokens; n: number }) {
  return (
    <ul className="rdvp-list" aria-busy="true" aria-label="Chargement de l'historique">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="rdvp-skel" style={{ height: "92px", backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}/>
      ))}
    </ul>
  );
}

// ── Champ date jj/mm/aaaa (masque + sélecteur natif en repli) ───────────────
export function masqueDate(s: string): string {
  const d = s.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
export function jmaVersIso(t: string): string {
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const j = Number(m[1]), mo = Number(m[2]), a = Number(m[3]);
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
export function isoVersJma(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function ChampDate({ C, id, libelle, texte, onTexte, erreur }: { C: ThemeTokens; id: string; libelle: string; texte: string; onTexte: (t: string) => void; erreur: string | null }) {
  const natif = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>{libelle}</label>
      <div style={{ position: "relative" }}>
        <input id={id} value={texte} onChange={e => onTexte(masqueDate(e.target.value))} inputMode="numeric" placeholder="jj/mm/aaaa" maxLength={10} autoComplete="off" aria-invalid={erreur ? true : undefined} aria-describedby={erreur ? `${id}-err` : undefined} className="yelen-focus-ring" style={{ width: "150px", height: "36px", backgroundColor: C.bgCard, border: `1px solid ${erreur ? C.red : C.border}`, borderRadius: "10px", padding: "0 38px 0 12px", fontSize: "13px", color: C.t1, fontVariantNumeric: "tabular-nums" }}/>
        <button type="button" aria-label={`Ouvrir le calendrier — ${libelle}`} onClick={() => { try { natif.current?.showPicker(); } catch { natif.current?.focus(); } }} className="yelen-focus-ring" style={{ position: "absolute", right: "2px", top: "2px", width: "32px", height: "32px", background: "none", border: "none", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        <input ref={natif} type="date" tabIndex={-1} aria-hidden="true" value={jmaVersIso(texte)} onChange={e => onTexte(isoVersJma(e.target.value))} style={{ position: "absolute", right: 0, bottom: 0, width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }}/>
      </div>
      {erreur && <div id={`${id}-err`} role="alert" style={{ color: C.red, fontSize: "12px", marginTop: "3px" }}>{erreur}</div>}
    </div>
  );
}

// ── Modale « Détails du rendez-vous » ───────────────────────────────────────
function Champ({ C, label, value }: { C: ThemeTokens; label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <dt style={{ color: C.t2, fontSize: "12.5px", flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0, color: C.t1, fontSize: "13px", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

const PRESENCE_LIBELLE: Record<string, string> = { absent: "Absent", present: "Présent" };

export function DetailRdvModal({ C, r, onClose }: { C: ThemeTokens; r: RdvHisto; onClose: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);
  const motif = r.motif_annulation && r.presence_status !== "absent" ? r.motif_annulation : null;
  const svc = serviceAffiche(r);
  const badge = statutBadge(r, C);
  const presence = r.presence_status ? (PRESENCE_LIBELLE[r.presence_status] ?? r.presence_status) : null;

  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    fermer.current?.focus();
    return () => { precedent?.focus?.(); };
  }, []);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !boite.current) return;
    const cibles = Array.from(boite.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(x => !x.hasAttribute("disabled"));
    if (cibles.length === 0) return;
    const premier = cibles[0], dernier = cibles[cibles.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }

  const titreSection = { color: C.t1, fontSize: "13px", fontWeight: 600, margin: "16px 0 2px" } as const;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div ref={boite} role="dialog" aria-modal="true" aria-labelledby="rdvp-detail-titre" onKeyDown={onKey} onClick={e => e.stopPropagation()} style={{ backgroundColor: C.bgCard, borderRadius: "14px", border: `1px solid ${C.border2}`, maxWidth: "480px", width: "100%", maxHeight: "86svh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "18px 20px 12px" }}>
          <h2 id="rdvp-detail-titre" style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>Détails du rendez-vous</h2>
          <button ref={fermer} type="button" onClick={onClose} aria-label="Fermer les détails du rendez-vous" className="yelen-focus-ring" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 20px 8px", flex: 1 }}>
          <h3 style={{ ...titreSection, marginTop: "4px" }}>Rendez-vous</h3>
          <dl style={{ margin: 0 }}>
            <Champ C={C} label="Référence" value={r.reference}/>
            <Champ C={C} label="Service" value={svc.titre}/>
            {svc.detail && <Champ C={C} label="Détail" value={svc.detail}/>}
            {svc.prix && <Champ C={C} label="Montant" value={svc.prix}/>}
            <Champ C={C} label="Date et heure" value={quandRdv(r)}/>
            <Champ C={C} label="Statut" value={badge.l}/>
            {presence && <Champ C={C} label="Présence" value={presence}/>}
          </dl>

          <h3 style={titreSection}>Client</h3>
          <dl style={{ margin: 0 }}>
            <Champ C={C} label="Nom" value={r.citoyen_nom}/>
            <Champ C={C} label="Téléphone" value={formatTelephone(r.citoyen_phone) || "—"}/>
          </dl>

          <h3 style={titreSection}>Traçabilité</h3>
          <dl style={{ margin: 0 }}>
            <Champ C={C} label="Créé le" value={horodatageAbrege(r.created_at) || "—"}/>
            {r.derniere_action && <Champ C={C} label="Dernière action" value={r.derniere_action}/>}
            {r.agent_nom && <Champ C={C} label="Agent" value={r.agent_nom}/>}
            {r.derniere_action_le && <Champ C={C} label="Action le" value={horodatageAbrege(r.derniere_action_le) || "—"}/>}
            {!r.derniere_action && !r.agent_nom && <Champ C={C} label="Dernière action" value="—"/>}
          </dl>

          {motif && (
            <div style={{ marginTop: "16px", backgroundColor: C.bg3, borderRadius: "10px", padding: "12px 14px" }}>
              <h3 style={{ color: C.t1, fontSize: "13px", fontWeight: 600, margin: "0 0 4px" }}>Motif d&apos;annulation</h3>
              <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" }}>{motif}</p>
            </div>
          )}
          {r.notes && (
            <div style={{ marginTop: "12px", backgroundColor: C.bg3, borderRadius: "10px", padding: "12px 14px" }}>
              <h3 style={{ color: C.t1, fontSize: "13px", fontWeight: 600, margin: "0 0 4px" }}>Suivi</h3>
              <p style={{ color: C.t2, fontSize: "13px", lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" }}>{r.notes}</p>
            </div>
          )}
          <div style={{ height: "8px" }}/>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 20px", borderTop: `1px solid ${C.border}` }}>
          <Button tokens={toUiTokens(C)} className="yelen-focus-ring" variant="secondary" size="md" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}
