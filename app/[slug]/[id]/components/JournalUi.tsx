"use client";

// Briques d'affichage de l'écran "Journal d'activité" (refonte 24/10/2026,
// frontend uniquement) : libellés des actions, icônes, filtres, champ de
// date jj/mm/aaaa, ligne de journal, menu d'actions, squelettes. L'état, les
// appels API et l'assemblage de l'écran restent dans JournalTab.tsx, la
// fiche de détail dans JournalFiche.tsx.
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ThemeTokens } from "../theme";
import { MEMBRE_ROLES } from "@/lib/institutionPermissions";
import { scoreRisque, type RisqueJournal } from "@/lib/journalTaxonomie";
import { FUSEAU_GUINEE, heureDepuisHorodatage, libelleRelatif } from "@/lib/heure";
import { CATEGORIES, LIBELLES_ACTIONS, NIVEAUX, PLATEFORMES, actionALibelle, libelleAction, libelleCible } from "@/lib/journalLibelles";

export type Entree = {
  id: string; audit_id: string; membre_id: string | null; membre_nom: string; action: string;
  categorie: string; niveau: string;
  cible_table: string; cible_id: string | null;
  details: Record<string, unknown>;
  ancienne_valeur: Record<string, unknown> | null;
  nouvelle_valeur: Record<string, unknown> | null;
  ip: string | null; user_agent: string | null; navigateur: string | null; os: string | null; plateforme: string;
  created_at: string;
};

export type MembreEquipe = { id: string; prenom: string; nom: string; role?: string };

export type Stats = {
  actions_aujourdhui: number; actions_semaine: number; membres_actifs: number;
  connexions: number; alertes_securite: number; actions_critiques: number;
  exportations: number; derniere_synchronisation: string | null;
};

export type Resume = { phrases: string[]; total: number; critiques: number; a_surveiller: number; hors_horaires: number };

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// ── Icônes (traits Feather-style, jamais d'emoji) ──────────────────────────
export type IconKey = "check" | "x" | "flag" | "user" | "edit" | "bell" | "file" | "trash" | "calendar" | "plus" | "key" | "dot" | "copy" | "share" | "inbox" | "eye" | "search" | "chevronDown" | "spark" | "more" | "sliders" | "lock" | "tag";

export function Icon({ name, size = 14, color }: { name: IconKey; size?: number; color: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const, stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const, focusable: false as const };
  switch (name) {
    case "check": return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case "x": return <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case "flag": return <svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
    case "user": return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "edit": return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>;
    case "bell": return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
    case "file": return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case "trash": return <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "plus": return <svg {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case "key": return <svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.777 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m3-3l3 3-3.5 3.5m-3-3L21 4"/></svg>;
    case "copy": return <svg {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
    case "share": return <svg {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
    case "inbox": return <svg {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case "eye": return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "search": return <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case "chevronDown": return <svg {...p}><polyline points="6 9 12 15 18 9"/></svg>;
    case "spark": return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case "more": return <svg {...p}><circle cx="5" cy="12" r="1.2" fill={color}/><circle cx="12" cy="12" r="1.2" fill={color}/><circle cx="19" cy="12" r="1.2" fill={color}/></svg>;
    case "sliders": return <svg {...p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>;
    case "lock": return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "tag": return <svg {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
    case "dot": default: return <svg {...p}><circle cx="12" cy="12" r="4" fill={color} stroke="none"/></svg>;
  }
}

// ── Style des actions (icône + couleur) ────────────────────────────────────
// Les LIBELLÉS vivent dans lib/journalLibelles.ts (module pur, partagé avec
// l'export serveur) ; ici seulement la présentation. Une action absente de
// LIBELLES_ACTIONS s'affiche en code brut (police mono), sans libellé inventé.
type ActionStyle = { iconKey: IconKey; couleur: (C: ThemeTokens) => string };
type ActionMeta = ActionStyle & { label: string };

const ACTION_STYLE: Record<string, ActionStyle> = {
  // Rendez-vous
  rdv_accepte:          { iconKey: "check", couleur: C => C.green },
  rdv_refuse:           { iconKey: "x", couleur: C => C.red },
  rdv_termine:          { iconKey: "flag", couleur: C => C.purple },
  rdv_absent:           { iconKey: "user", couleur: C => C.orange },
  rdv_confirme:         { iconKey: "check", couleur: C => C.green },
  rdv_annule:           { iconKey: "x", couleur: C => C.orange },
  rdv_validation_annulee: { iconKey: "x", couleur: C => C.orange },
  suivi_rdv_modifie:    { iconKey: "edit", couleur: C => C.blue },
  // Clients
  note_client_modifiee: { iconKey: "edit", couleur: C => C.blue },
  note_client_ajoutee:  { iconKey: "plus", couleur: C => C.blue },
  rappel_envoye:        { iconKey: "bell", couleur: C => C.gold },
  avis_repondu:         { iconKey: "edit", couleur: C => C.blue },
  // Documents
  document_ajoute:      { iconKey: "file", couleur: C => C.green },
  document_supprime:    { iconKey: "trash", couleur: C => C.red },
  document_citoyen_demande: { iconKey: "file", couleur: C => C.blue },
  document_citoyen_envoye: { iconKey: "file", couleur: C => C.blue },
  document_institutionnel_depose: { iconKey: "file", couleur: C => C.green },
  // Tâches
  tache_creee:          { iconKey: "check", couleur: C => C.teal },
  tache_modifiee:       { iconKey: "edit", couleur: C => C.teal },
  tache_supprimee:      { iconKey: "trash", couleur: C => C.red },
  // Agenda
  evenement_cree:       { iconKey: "calendar", couleur: C => C.orange },
  evenement_modifie:    { iconKey: "edit", couleur: C => C.orange },
  evenement_supprime:   { iconKey: "trash", couleur: C => C.red },
  // Équipe
  membre_cree:          { iconKey: "plus", couleur: C => C.gold },
  membre_modifie:       { iconKey: "edit", couleur: C => C.gold },
  membre_supprime:      { iconKey: "trash", couleur: C => C.red },
  membre_acces_refuse:  { iconKey: "lock", couleur: C => C.red },
  invitation_non_reconnue: { iconKey: "flag", couleur: C => C.red },
  responsable_modifie:  { iconKey: "edit", couleur: C => C.gold },
  // Sécurité du compte
  pin_change_personnel: { iconKey: "key", couleur: C => C.t2 },
  pin_defini:           { iconKey: "key", couleur: C => C.green },
  pin_retire:           { iconKey: "key", couleur: C => C.orange },
  totp_active:          { iconKey: "lock", couleur: C => C.green },
  totp_desactive:       { iconKey: "lock", couleur: C => C.orange },
  passkey_ajoutee:      { iconKey: "key", couleur: C => C.green },
  passkey_retiree:      { iconKey: "key", couleur: C => C.orange },
  appareil_deconnecte:  { iconKey: "lock", couleur: C => C.orange },
  appareils_deconnectes: { iconKey: "lock", couleur: C => C.orange },
  reauth_reussie:       { iconKey: "check", couleur: C => C.green },
  reauth_echec:         { iconKey: "x", couleur: C => C.orange },
  connexion:            { iconKey: "user", couleur: C => C.purple },
  // Projets et notes
  projet_cree:          { iconKey: "plus", couleur: C => C.purple },
  projet_modifie:       { iconKey: "edit", couleur: C => C.purple },
  projet_supprime:      { iconKey: "trash", couleur: C => C.red },
  note_creee:           { iconKey: "plus", couleur: C => C.teal },
  note_modifiee:        { iconKey: "edit", couleur: C => C.teal },
  note_supprimee:       { iconKey: "trash", couleur: C => C.red },
  // Communication
  message_envoye:       { iconKey: "share", couleur: C => C.blue },
  message_recu:         { iconKey: "share", couleur: C => C.blue },
  // Établissement et compte
  disponibilites_modifiees: { iconKey: "calendar", couleur: C => C.orange },
  pause_reservations_activee: { iconKey: "flag", couleur: C => C.orange },
  pause_reservations_levee: { iconKey: "check", couleur: C => C.green },
  changement_profil_sensible: { iconKey: "edit", couleur: C => C.orange },
  modification_texte_public: { iconKey: "edit", couleur: C => C.blue },
  changement_profil_complement_fourni: { iconKey: "check", couleur: C => C.blue },
  preferences_notification_modifiees: { iconKey: "bell", couleur: C => C.blue },
  suppression_compte_demandee: { iconKey: "trash", couleur: C => C.orange },
  suppression_compte_annulee: { iconKey: "x", couleur: C => C.green },
  // Paiements
  recu_verifie:         { iconKey: "check", couleur: C => C.green },
  export_transactions:  { iconKey: "file", couleur: C => C.t2 },
  export_rapport:       { iconKey: "file", couleur: C => C.t2 },
  // Journal
  export_journal:       { iconKey: "file", couleur: C => C.t2 },
  export_verifie:       { iconKey: "check", couleur: C => C.green },
  export_ecran:         { iconKey: "file", couleur: C => C.t2 },
  // Offres partenaires
  offre_creee:          { iconKey: "tag", couleur: C => C.gold },
  offre_modifiee:       { iconKey: "edit", couleur: C => C.gold },
  offre_soumise:        { iconKey: "flag", couleur: C => C.blue },
  offre_suspendue:      { iconKey: "x", couleur: C => C.orange },
  offre_archivee:       { iconKey: "inbox", couleur: C => C.orange },
  offre_supprimee:      { iconKey: "trash", couleur: C => C.red },
  offre_approuvee:      { iconKey: "check", couleur: C => C.green },
  offre_refusee:        { iconKey: "x", couleur: C => C.orange },
  offre_suspendue_admin: { iconKey: "x", couleur: C => C.orange },
  // Services payants
  service_cree:          { iconKey: "plus", couleur: C => C.green },
  service_prix_modifie:  { iconKey: "edit", couleur: C => C.gold },
  service_suspendu:      { iconKey: "x", couleur: C => C.orange },
  service_reactive:      { iconKey: "check", couleur: C => C.green },
  service_supprime:      { iconKey: "trash", couleur: C => C.red },
};

// Libellé (module partagé) + style (ici). Action sans libellé : code brut.
export function meta(action: string): ActionMeta & { brut: boolean } {
  const style = ACTION_STYLE[action];
  if (actionALibelle(action) && style) return { ...style, label: LIBELLES_ACTIONS[action], brut: false };
  return { iconKey: "dot", couleur: (C: ThemeTokens) => C.t2, label: action, brut: true };
}

export function libelleLigne(e: Entree): string {
  return libelleAction(e.action, e.details);
}

// Listes de filtres, libellés de cible : module partagé, réexportés pour l'écran.
export { CATEGORIES, NIVEAUX, PLATEFORMES, libelleCible };

export { MEMBRE_ROLES };

export const RISQUE_META: Record<RisqueJournal, { label: string; couleur: (C: ThemeTokens) => string }> = {
  vert: { label: "Normal", couleur: C => C.green },
  orange: { label: "À surveiller", couleur: C => C.orange },
  rouge: { label: "Critique", couleur: C => C.red },
};

export function risqueDe(e: Entree): RisqueJournal {
  return scoreRisque(e.action, e.niveau, e.details || {});
}

// ── Utilitaires de format ──────────────────────────────────────────────────
export function initiales(nom: string): string {
  return nom.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const FORMAT_DATE_COURTE = new Intl.DateTimeFormat("fr-FR", { timeZone: FUSEAU_GUINEE, day: "numeric", month: "short" });

// « 22 oct. · 11:48 PM » — lève l'ambiguïté d'une liste qui s'étale sur
// plusieurs jours (fuseau de Conakry).
export function dateCourteHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${FORMAT_DATE_COURTE.format(d)} · ${heureDepuisHorodatage(d)}`;
}

// Valeur de details/ancienne_valeur/nouvelle_valeur → texte, jamais « [object Object] ».
export function formaterValeur(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return "—"; }
}

export function cleLisible(k: string): string {
  const t = k.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Date jj/mm/aaaa ↔ ISO (aaaa-mm-jj) ─────────────────────────────────────
export function isoVersTexte(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function texteVersIso(t: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.trim());
  if (!m) return null;
  const [, j, mo, a] = m;
  const d = new Date(Date.UTC(Number(a), Number(mo) - 1, Number(j)));
  if (d.getUTCFullYear() !== Number(a) || d.getUTCMonth() !== Number(mo) - 1 || d.getUTCDate() !== Number(j)) return null;
  return `${a}-${mo}-${j}`;
}

function masquerSaisieDate(s: string): string {
  const c = s.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

export function styleChamp(C: ThemeTokens, invalide = false): CSSProperties {
  return {
    ["--yelen-focus" as string]: C.gold,
    width: "100%", boxSizing: "border-box", height: "40px", backgroundColor: C.bgCard,
    border: `1px solid ${invalide ? C.red : C.border2}`, borderRadius: "10px", padding: "0 12px",
    fontSize: "13px", color: C.t1, fontFamily: "inherit",
  };
}

// Champ texte jj/mm/aaaa : masque de saisie, validation au blur/Entrée, message
// d'erreur associé, sélecteur natif en repli (bouton calendrier). `valeur` est
// l'ISO du jour appliqué ; le parent remonte la clé quand il le change.
export function ChampDate({ C, label, valeur, erreurExterne, onValider, onEffacer }: {
  C: ThemeTokens; label: string; valeur: string; erreurExterne?: string | null;
  onValider: (iso: string) => void; onEffacer: () => void;
}) {
  const uid = useId();
  const [texte, setTexte] = useState(isoVersTexte(valeur));
  const [erreur, setErreur] = useState<string | null>(null);
  const refNatif = useRef<HTMLInputElement>(null);
  const message = erreur ?? erreurExterne ?? null;

  const valider = () => {
    if (texte.trim() === "") { setErreur(null); if (valeur) onEffacer(); return; }
    const iso = texteVersIso(texte);
    if (!iso) { setErreur("Date invalide : saisissez jj/mm/aaaa."); return; }
    setErreur(null);
    if (iso !== valeur) onValider(iso);
  };

  const ouvrirCalendrier = () => {
    const el = refNatif.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };

  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={`${uid}-champ`} style={{ display: "block", color: C.t2, fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          id={`${uid}-champ`} type="text" inputMode="numeric" autoComplete="off" placeholder="jj/mm/aaaa"
          value={texte} aria-invalid={message ? true : undefined} aria-describedby={message ? `${uid}-err` : undefined}
          className="yelen-focus-ring"
          onChange={e => { setTexte(masquerSaisieDate(e.target.value)); setErreur(null); }}
          onBlur={valider}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); valider(); } }}
          style={{ ...styleChamp(C, !!message), paddingRight: "40px" }}
        />
        <button type="button" className="yelen-focus-ring" aria-label={`Choisir ${label.toLowerCase()} dans le calendrier`} onClick={ouvrirCalendrier}
          style={{ ["--yelen-focus" as string]: C.gold, position: "absolute", right: "4px", top: "4px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "8px", cursor: "pointer" }}>
          <Icon name="calendar" size={15} color={C.t2}/>
        </button>
        <input ref={refNatif} type="date" tabIndex={-1} aria-hidden="true" value={valeur}
          onChange={e => { if (e.target.value) { setTexte(isoVersTexte(e.target.value)); setErreur(null); onValider(e.target.value); } }}
          style={{ position: "absolute", right: 0, bottom: 0, width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }}/>
      </div>
      {message && <div id={`${uid}-err`} role="alert" style={{ color: C.red, fontSize: "12px", marginTop: "4px" }}>{message}</div>}
    </div>
  );
}

// ── Menu d'actions accessible (⋯ et Exporter) ──────────────────────────────
export type ItemMenu = { label: string; onSelect: () => void };

export function MenuPopover({ C, items, renderTrigger, minWidth = 200 }: {
  C: ThemeTokens; items: ItemMenu[]; minWidth?: number;
  renderTrigger: (p: { ouvert: boolean; basculer: () => void; aria: { "aria-haspopup": "menu"; "aria-expanded": boolean } }) => ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const refWrap = useRef<HTMLDivElement>(null);
  const refMenu = useRef<HTMLDivElement>(null);

  const fermer = useCallback((rendreFocus: boolean) => {
    setOuvert(false);
    if (rendreFocus) refWrap.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    refMenu.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const dehors = (e: MouseEvent) => { if (refWrap.current && !refWrap.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const surTouche = (e: React.KeyboardEvent) => {
    const els = Array.from(refMenu.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermer(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Tab") setOuvert(false);
  };

  return (
    <div ref={refWrap} style={{ position: "relative", display: "inline-block" }}>
      {renderTrigger({ ouvert, basculer: () => setOuvert(o => !o), aria: { "aria-haspopup": "menu", "aria-expanded": ouvert } })}
      {ouvert && (
        <div ref={refMenu} role="menu" onKeyDown={surTouche}
          style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "12px", padding: "6px", minWidth: `${minWidth}px`, boxShadow: C.shadow }}>
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" tabIndex={-1} className="yelen-focus-ring"
              onClick={() => { fermer(false); it.onSelect(); }}
              style={{ ["--yelen-focus" as string]: C.gold, display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: "8px", padding: "10px 12px", minHeight: "40px", color: C.t1, fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Éléments de liste ──────────────────────────────────────────────────────
export function ClientBadge({ C, action }: { C: ThemeTokens; action: string }) {
  if (action !== "message_envoye" && action !== "message_recu") return null;
  const couleur = action === "message_envoye" ? C.gold : C.blue;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", backgroundColor: `${couleur}20`, color: C.t1, border: `1px solid ${couleur}50`, borderRadius: "6px", padding: "1px 7px", fontSize: "11px", fontWeight: 600, flexShrink: 0 }}>
      Client
    </span>
  );
}

export function NiveauTexte({ C, risque }: { C: ThemeTokens; risque: RisqueJournal }) {
  const r = RISQUE_META[risque];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: C.t2, fontSize: "12px", fontWeight: 600 }}>
      <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: r.couleur(C), flexShrink: 0 }}/>
      {r.label}
    </span>
  );
}

export function LibelleAction({ C, e, taille = 13, gras = 600 }: { C: ThemeTokens; e: Entree; taille?: number; gras?: number }) {
  const m = meta(e.action);
  return m.brut
    ? <code style={{ fontFamily: MONO, fontSize: `${taille - 1}px`, color: C.t2 }}>{e.action}</code>
    : <span style={{ fontSize: `${taille}px`, fontWeight: gras, color: C.t1 }}>{libelleLigne(e)}</span>;
}

export function LigneJournal({ C, e, roleLabel, maintenant, onOuvrir, onCopier, onPartager }: {
  C: ThemeTokens; e: Entree; roleLabel: string | null; maintenant: number;
  onOuvrir: () => void; onCopier: () => void; onPartager: () => void;
}) {
  const m = meta(e.action);
  const cible = e.cible_table ? libelleCible(e.cible_table) : null;
  return (
    <li className="jr-ligne" style={{ listStyle: "none", display: "flex", alignItems: "stretch", gap: "4px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
      <button type="button" onClick={onOuvrir} className="yelen-focus-ring jr-ligne-main"
        style={{ ["--yelen-focus" as string]: C.gold, flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", minHeight: "56px", background: "none", border: "none", borderRadius: "10px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
        <span aria-hidden="true" style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: `${m.couleur(C)}20`, color: C.t1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>{initiales(e.membre_nom)}</span>
        <span style={{ flex: 1, minWidth: 0, display: "block" }}>
          <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", color: C.t1, fontSize: "13px" }}>
            <span style={{ fontWeight: 600 }}>{e.membre_nom}</span>
            {roleLabel && <span style={{ color: C.t2 }}>· {roleLabel}</span>}
            <ClientBadge C={C} action={e.action}/>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
            <Icon name={m.iconKey} size={13} color={m.couleur(C)}/>
            <LibelleAction C={C} e={e}/>
          </span>
          <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 12px", marginTop: "4px", color: C.t2, fontSize: "12px" }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{heureDepuisHorodatage(e.created_at)} · {libelleRelatif(new Date(e.created_at), new Date(maintenant))}</span>
            <NiveauTexte C={C} risque={risqueDe(e)}/>
            {cible && (cible.brut
              ? <span>Cible : <code style={{ fontFamily: MONO }}>{cible.texte}</code></span>
              : <span>Cible : {cible.texte}</span>)}
          </span>
        </span>
      </button>
      <div style={{ display: "flex", alignItems: "center", paddingRight: "6px" }}>
        <MenuPopover C={C} minWidth={190}
          items={[
            { label: "Voir le détail", onSelect: onOuvrir },
            { label: "Copier la référence", onSelect: onCopier },
            { label: "Partager", onSelect: onPartager },
          ]}
          renderTrigger={({ basculer, aria }) => (
            <button type="button" onClick={basculer} {...aria} aria-label={`Actions pour l'événement ${libelleLigne(e)}`} className="yelen-focus-ring jr-cible-tactile"
              style={{ ["--yelen-focus" as string]: C.gold, width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "8px", cursor: "pointer" }}>
              <Icon name="more" size={18} color={C.t2}/>
            </button>
          )}/>
      </div>
    </li>
  );
}

export function KpiCarte({ C, label, valeur, couleur, onClick }: {
  C: ThemeTokens; label: string; valeur: string | number; couleur: string; onClick?: () => void;
}) {
  const contenu = (
    <>
      <span style={{ display: "block", color: couleur, fontSize: "20px", fontWeight: 600, fontVariantNumeric: "tabular-nums", lineHeight: 1.2, overflowWrap: "anywhere" }}>{valeur}</span>
      <span style={{ display: "block", color: C.t2, fontSize: "12px", marginTop: "2px", lineHeight: 1.3 }}>{label}</span>
    </>
  );
  const base: CSSProperties = { backgroundColor: C.bgCard, borderRadius: "10px", padding: "12px 14px", border: `1px solid ${C.border}`, textAlign: "left", minWidth: 0, fontFamily: "inherit" };
  return onClick
    ? <button type="button" onClick={onClick} className="yelen-focus-ring" style={{ ...base, ["--yelen-focus" as string]: C.gold, cursor: "pointer" }}>{contenu}</button>
    : <div style={base}>{contenu}</div>;
}

export function PuceChoix({ C, actif, onClick, children }: { C: ThemeTokens; actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif} className="yelen-focus-ring jr-puce"
      style={{ ["--yelen-focus" as string]: C.gold, flexShrink: 0, backgroundColor: actif ? `${C.gold}1F` : C.bgCard, border: `1px solid ${actif ? C.gold : C.border2}`, borderRadius: "20px", padding: "0 14px", height: "32px", color: C.t1, fontSize: "13px", fontWeight: actif ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}

export function SqueletteLignes({ C, nombre = 6 }: { C: ThemeTokens; nombre?: number }) {
  return (
    <div role="status" aria-label="Chargement du journal" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {Array.from({ length: nombre }, (_, i) => (
        <div key={i} className="jr-squelette" aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", minHeight: "56px", backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "50%", backgroundColor: C.bg3, flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ width: "35%", height: "12px", borderRadius: "6px", backgroundColor: C.bg3 }}/>
            <div style={{ width: "55%", height: "12px", borderRadius: "6px", backgroundColor: C.bg3, marginTop: "8px" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}
