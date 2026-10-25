"use client";

// Briques visuelles de l'écran Support Yelen institution (refonte du
// 24/10/2026, frontend uniquement) — extraites de SupportYelenTab.tsx pour que
// ce dernier ne garde que l'état et les appels API. Aucune logique métier ici :
// tout ce qui touche au réseau, aux statuts et au temps réel reste dans l'écran.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import type { ThemeTokens } from "../theme";
import { YelenLoader } from "@/components/YelenLoader";
import {
  SUPPORT_CATEGORIES_INSTITUTION, SUPPORT_CATEGORIE_INSTITUTION_LABELS,
  type SupportCategorieInstitution, type SupportStatut,
} from "@/lib/supportTicketsConstants";
import { heureDepuisHorodatage, jourConakry, libelleHeureListe, libelleSeparateurJour } from "@/lib/heure";

export type TicketListItem = {
  id: string; numero_public: string; categorie: string; sujet: string;
  statut: SupportStatut; agent_nom: string | null;
  dernier_message: string | null; dernier_message_at: string | null; cree_le: string; non_lus: number;
};
export type TicketMsg = { id: string; expediteur_type: "institution" | "agent"; agent_nom: string | null; contenu: string | null; image_url: string | null; type: "texte" | "image"; cree_le: string };
export type TicketRating = { note: number; raisons: string[]; commentaire: string | null; cree_le: string };
export type TicketDetail = {
  id: string; numero_public: string; categorie: string; sujet: string; statut: SupportStatut;
  agent_nom: string | null; cree_le: string; assigne_le: string | null; position_file: number | null;
  resolu_par: "institution" | "agent" | "system" | null; rating: TicketRating | null;
  messages: TicketMsg[];
};

const P = { pointerEvents: "none" as const };
export const Ic = {
  X:       () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Send:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Check:   () => <svg style={P} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>,
  // Badge "vérifié" — identité officielle Support Yelen (retour Bryan
  // 06/09/2026, "ajouter un badge de vérification"), jamais un emoji.
  Verified: ({ size = 13, color }: { size?: number; color: string }) => (
    <svg style={P} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5l2.6 1.3 2.9-.7 1 2.8 2.6 1.6-.7 2.9.7 2.9-2.6 1.6-1 2.8-2.9-.7L12 21.5l-2.6-1.3-2.9.7-1-2.8-2.6-1.6.7-2.9-.7-2.9 2.6-1.6 1-2.8 2.9.7L12 2.5z" fill={color}/>
      <path d="M8.5 12.3l2.2 2.2 4.3-4.6" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  Plus:    () => <svg style={P} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Back:    () => <svg style={P} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>,
  Star: ({ filled, color }: { filled: boolean; color: string }) => <svg style={P} width="30" height="30" viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

// ── Formatage (helpers de lib/heure.ts uniquement, fuseau Conakry, 12 h) ───
export function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${n} ${n >= 2 ? plurielForme : singulier}`;
}
/** « 5:48 AM » aujourd'hui, « Hier · 5:48 AM », « 24 oct. · 5:48 AM » sinon. */
export function dateHeureCourte(valeur: string): string {
  const now = new Date();
  const jour = libelleHeureListe(valeur, now);
  const heure = heureDepuisHorodatage(valeur);
  if (!jour || !heure) return heure || jour;
  return jour === heure ? heure : `${jour} · ${heure}`;
}
export function separateurJour(valeur: string): string {
  return libelleSeparateurJour(valeur, new Date());
}
export function estMemeJour(a: string, b: string): boolean {
  return jourConakry(a) === jourConakry(b);
}

// ── Statut : point + texte (texte en C.t1/C.t2 pour le contraste AA) ───────
export function statutMeta(s: SupportStatut, C: ThemeTokens): { label: string; dot: string } {
  if (s === "attente_agent") return { label: "En attente d'un agent", dot: C.gold };
  if (s === "en_cours") return { label: "En cours", dot: C.blue };
  if (s === "resolu") return { label: "Résolue", dot: C.green };
  return { label: "Clôturée", dot: C.t3 };
}
export function StatutTexte({ s, C }: { s: SupportStatut; C: ThemeTokens }) {
  const meta = statutMeta(s, C);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.t2, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: meta.dot, flexShrink: 0 }}/>
      {meta.label}
    </span>
  );
}

export function Chip({ children, C }: { children: ReactNode; C: ThemeTokens }) {
  return (
    <span style={{ display: "inline-block", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, fontWeight: 600, color: C.t2, background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" }}>{children}</span>
  );
}

export function SupportStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .support-root{animation:supportIn 0.16s ease}
      @keyframes supportIn{from{opacity:0}to{opacity:1}}
      .support-pane{display:none;min-height:0}
      .support-pane-on{display:flex}
      .support-bar{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
      .support-inner{width:100%;max-width:1200px;margin:0 auto}
      .support-tap{min-height:44px}
      .support-ico{width:44px;height:44px}
      @media (min-width:860px){
        .support-pane{display:flex !important}
        .support-body{flex-direction:row !important}
        .support-list-pane{width:340px;flex-shrink:0;border-right:1px solid ${C.border}}
        .support-tap{min-height:36px}
        .support-ico{width:36px;height:36px}
      }
      .support-row{transition:background-color 0.14s ease}
      .support-row:hover{background-color:${C.bgCard2}}
      .support-cat{transition:background-color 0.14s ease,border-color 0.14s ease}
      .support-cat:hover{background-color:${C.bg3}}
      .support-field{transition:border-color 0.14s ease,box-shadow 0.14s ease}
      .support-field:focus{border-color:${C.gold} !important;box-shadow:0 0 0 3px ${C.gold}25}
      .support-field:focus-visible{outline:none}
      @keyframes supportPulse{0%,100%{opacity:1}50%{opacity:0.5}}
      .support-skel{background:${C.bgCard2};border-radius:8px;animation:supportPulse 1.3s ease-in-out infinite}
      @keyframes support-agent-wave{0%,80%,100%{transform:rotate(0deg)}85%{transform:rotate(-4deg)}90%{transform:rotate(3deg)}95%{transform:rotate(-2deg)}}
      @media (prefers-reduced-motion: no-preference){
        .support-agent-illustration{animation:support-agent-wave 4s ease-in-out infinite;transform-origin:65% 95%}
      }
      @media (prefers-reduced-motion: reduce){
        .support-root,.support-skel{animation:none}
        .support-row,.support-cat,.support-field{transition:none}
      }
    `}</style>
  );
}

// ── Squelettes ─────────────────────────────────────────────────────────────
export function ListeSkeleton() {
  return (
    <div role="status" aria-label="Chargement des demandes" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 12px 12px" }}>
      {[0, 1, 2].map(i => <div key={i} className="support-skel" style={{ height: 76, borderRadius: 12 }}/>)}
    </div>
  );
}
export function FilSkeleton() {
  return (
    <div role="status" aria-label="Chargement de la conversation" style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="support-skel" style={{ height: 14, width: "40%" }}/>
      <div className="support-skel" style={{ height: 56, width: "58%", borderRadius: 14 }}/>
      <div className="support-skel" style={{ height: 40, width: "44%", borderRadius: 14, alignSelf: "flex-end" }}/>
      <div className="support-skel" style={{ height: 64, width: "62%", borderRadius: 14 }}/>
    </div>
  );
}

export function BlocEtat({ C, titre, texte, action }: { C: ThemeTokens; titre: string; texte?: string; action?: ReactNode }) {
  return (
    <div role="status" style={{ textAlign: "center", padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ color: C.t1, fontSize: 14, fontWeight: 700 }}>{titre}</div>
      {texte && <div style={{ color: C.t2, fontSize: 13, lineHeight: 1.55, maxWidth: 300 }}>{texte}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

// ── Ligne de la liste ──────────────────────────────────────────────────────
export function TicketRow({ t, active, onSelect, C }: { t: TicketListItem; active: boolean; onSelect: () => void; C: ThemeTokens }) {
  const date = t.dernier_message_at ?? t.cree_le;
  return (
    <button type="button" onClick={onSelect} aria-current={active ? "true" : undefined} className="support-row tap yelen-focus-ring"
      style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", textAlign: "left", font: "inherit", padding: "12px 14px", borderRadius: 12, border: `1px solid ${active ? C.gold + "50" : C.border}`, background: active ? `${C.gold}12` : C.bgCard, cursor: "pointer", color: C.t1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: C.t1, fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.sujet || "Demande de support"}</span>
        <span style={{ color: C.t2, fontSize: 12, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{dateHeureCourte(date)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Chip C={C}>{t.numero_public}</Chip>
        <StatutTexte s={t.statut} C={C}/>
        {t.non_lus > 0 && (
          <span aria-label={`${pluriel(t.non_lus, "message non lu", "messages non lus")}`} style={{ background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px", marginLeft: "auto" }}>{t.non_lus}</span>
        )}
      </div>
      {t.dernier_message && (
        <div style={{ color: t.non_lus > 0 ? C.t1 : C.t2, fontSize: 12, fontWeight: t.non_lus > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.dernier_message}</div>
      )}
    </button>
  );
}

// ── Catégories : radiogroup de cartes ──────────────────────────────────────
const CAT_ICONS: Record<SupportCategorieInstitution, ReactNode> = {
  compte: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></>,
  facturation: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
  client: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  technique: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>,
  partenariat: <><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></>,
  securite: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  autre: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 1.5-2.3 1.8-2.3 3.3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
};

export function CategorieRadioGroup({ value, onChange, C, describedBy }: { value: SupportCategorieInstitution | null; onChange: (c: SupportCategorieInstitution) => void; C: ThemeTokens; describedBy?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const liste = SUPPORT_CATEGORIES_INSTITUTION;
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % liste.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + liste.length) % liste.length;
    if (next < 0) return;
    e.preventDefault();
    onChange(liste[next]);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-labelledby="support-cat-label" aria-describedby={describedBy} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
      {liste.map((c, i) => {
        const active = value === c;
        const tabbable = active || (value === null && i === 0);
        return (
          <button key={c} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={active} tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(c)} onKeyDown={e => onKey(e, i)} className="support-cat tap yelen-focus-ring support-tap"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${active ? C.gold : C.border2}`, background: active ? `${C.gold}18` : C.bgCard2, color: C.t1, fontSize: 13, fontWeight: 600, textAlign: "left", cursor: "pointer", font: "inherit" }}>
            <span aria-hidden="true" style={{ color: active ? C.goldD : C.t2, display: "flex", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{CAT_ICONS[c]}</svg>
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{SUPPORT_CATEGORIE_INSTITUTION_LABELS[c]}</span>
            {active && <span aria-hidden="true" style={{ color: C.goldD, display: "flex" }}><Ic.Check/></span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Carte d'attente avant prise en charge ──────────────────────────────────
// Miroir de SupportWaitingCard côté citoyen, ton plus professionnel — paliers
// dérivés uniquement de cree_le, jamais un minuteur local repartant de zéro.
export function AttenteAgent({ depuis, positionFile, C }: { depuis: string; positionFile: number | null; C: ThemeTokens }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(depuis).getTime()) / 1000));
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - new Date(depuis).getTime()) / 1000)), 5000);
    return () => clearInterval(interval);
  }, [depuis]);
  const palier = elapsed >= 120 ? "desole" : elapsed >= 60 ? "min1" : elapsed >= 30 ? "sec30" : "initial";
  const message =
    palier === "sec30" ? "Nous recherchons actuellement un agent disponible pour vous répondre." :
    palier === "min1" ? "Merci de patienter, votre message est toujours en attente de prise en charge." :
    palier === "desole" ? "Nous sommes désolés pour cette attente — un agent va prendre votre demande en charge dès que possible." :
    null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px", margin: "8px 0", background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 16 }}>
      <div className="support-agent-illustration" style={{ width: 84, flexShrink: 0 }}>
        <Image src="/illustrations/support-agent-yelen.png" alt="" width={1312} height={1199} style={{ width: "100%", height: "auto", display: "block" }}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ color: C.t1, fontSize: 14, fontWeight: 700 }}>Vous contactez Yelen</span>
          <Ic.Verified size={13} color={C.gold}/>
        </div>
        <div style={{ color: C.t2, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>Support officiel Yelen224 — assistance 100% humaine, sans intelligence artificielle.</div>
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <YelenLoader size={18}/>
          <div style={{ color: C.t1, fontSize: 13, fontWeight: 600 }}>En attente d&apos;un agent Yelen…</div>
        </div>
        {message && <div key={message} style={{ color: C.t2, fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{message}</div>}
        {/* Position réelle uniquement (retour Bryan 06/09/2026, "ne jamais
            afficher une position ou estimation fictive") — pas de temps
            d'attente estimé : aucune moyenne historique fiable n'existe. */}
        {positionFile != null && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.gold, borderRadius: 8, padding: "4px 10px" }}>
            <span style={{ color: "#000", fontSize: 12, fontWeight: 700 }}>Position dans la file : #{positionFile}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fil : séparateur de date et événements système ─────────────────────────
export function SeparateurJour({ date, C }: { date: string; C: ThemeTokens }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 1, textAlign: "center", padding: "8px 0", margin: "6px 0" }}>
      <span style={{ display: "inline-block", color: C.t2, fontSize: 12, fontWeight: 600, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 12px" }}>{separateurJour(date)}</span>
    </div>
  );
}
export function EvenementSysteme({ date, texte, accent, C }: { date: string; texte: string; accent?: boolean; C: ThemeTokens }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: accent ? C.gold : C.t3, flexShrink: 0 }}/>
      <span style={{ color: C.t2, fontSize: 12 }}>{dateHeureCourte(date)} · {texte}</span>
    </div>
  );
}

export function MessageBulle({ m, C }: { m: TicketMsg; C: ThemeTokens }) {
  const mine = m.expediteur_type === "institution";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 14 }}>
      {!mine && <span style={{ color: C.t2, fontSize: 12, fontWeight: 600, marginBottom: 3, marginLeft: 2 }}>{m.agent_nom ?? "Agent Yelen"} · Agent Support Yelen</span>}
      <div style={{ width: "fit-content", maxWidth: "min(70%, 520px)", background: mine ? C.bg3 : C.bgCard2, borderRadius: 14, padding: "9px 13px" }}>
        {m.contenu && <div style={{ color: C.t1, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.contenu}</div>}
      </div>
      <span style={{ color: C.t2, fontSize: 12, marginTop: 4, padding: "0 2px", fontVariantNumeric: "tabular-nums" }}>{heureDepuisHorodatage(m.cree_le)}</span>
    </div>
  );
}

/** Aplatit les messages en éléments avec séparateurs de jour (Fragment : le
 * séparateur sticky se positionne contre le conteneur du fil, pas contre un
 * wrapper par message). */
export function MessagesAvecSeparateurs({ messages, C }: { messages: TicketMsg[]; C: ThemeTokens }) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const showSeparateur = !prev || !estMemeJour(prev.cree_le, m.cree_le);
        return (
          <Fragment key={m.id}>
            {showSeparateur && <SeparateurJour date={m.cree_le} C={C}/>}
            <MessageBulle m={m} C={C}/>
          </Fragment>
        );
      })}
    </>
  );
}

// ── Composer : textarea jusqu'à 5 lignes, Entrée envoie, Maj+Entrée = ligne ─
export function Composer({ value, onChange, onSend, sending, C }: { value: string; onChange: (v: string) => void; onSend: () => void; sending: boolean; C: ThemeTokens }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);
  const vide = !value.trim();
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!vide && !sending) onSend();
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 16, padding: "6px 6px 6px 14px" }}>
      <label htmlFor="support-composer" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Votre message</label>
      <textarea id="support-composer" ref={ref} rows={1} value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        placeholder="Écrire un message…" maxLength={4000}
        style={{ flex: 1, minWidth: 0, resize: "none", background: "none", border: "none", padding: "8px 0", fontSize: 13, lineHeight: "20px", color: C.t1, fontFamily: "inherit", maxHeight: 120 }}/>
      <button type="button" onClick={onSend} disabled={sending || vide} aria-label="Envoyer le message" className="tap yelen-focus-ring support-ico"
        style={{ background: C.gold, color: "#080812", border: "none", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: sending || vide ? "not-allowed" : "pointer", opacity: sending || vide ? 0.5 : 1 }}>
        {sending ? <YelenLoader size={14} color="#080812"/> : <Ic.Send/>}
      </button>
    </div>
  );
}
