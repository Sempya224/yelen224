"use client";

// Briques présentationnelles de l'écran "Questions des clients" (refonte UI
// 20/10/2026, références Stripe / Linear / Help Scout). Aucune requête ici :
// QuestionsClientsTab.tsx garde l'état, `repondre`, `load` et le filtrage.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";

// ── Formatage d'affichage ────────────────────────────────────────────────
export function nomPropre(nom: string): string {
  return nom.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, c: string) => sep + c.toUpperCase());
}
function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0][0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase();
}
export function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function dateRelative(iso: string, maintenant: number): string {
  const sec = Math.round((new Date(iso).getTime() - maintenant) / 1000);
  const a = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.trunc(sec / 60), "minute");
  if (a < 86400) return rtf.format(Math.trunc(sec / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.trunc(sec / 86400), "day");
  if (a < 86400 * 365) return rtf.format(Math.trunc(sec / (86400 * 30)), "month");
  return rtf.format(Math.trunc(sec / (86400 * 365)), "year");
}

export function QuestionsStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .qcx-page{max-width:1000px;margin:0 auto;padding:24px 24px 48px}
      @media(min-width:1024px){.qcx-page{padding:28px 32px 48px}}
      .qcx-card:hover{border-color:${C.border2}!important}
      .qcx-btn:focus-visible,.qcx-input:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
      .qcx-clamp3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .qcx-clamp4{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
      .qcx-skel{background:${C.bg3};border-radius:6px;animation:qcxPulse 1.4s ease-in-out infinite}
      @keyframes qcxPulse{0%,100%{opacity:1}50%{opacity:.5}}
      .qcx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      @media(prefers-reduced-motion:reduce){.qcx-skel{animation:none}.qcx-btn{transition:none!important}}
    `}</style>
  );
}

// ── En-tête ──────────────────────────────────────────────────────────────
export function QuestionsHeader({ C, actions }: { C: ThemeTokens; actions: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px 16px", flexWrap: "wrap", marginBottom: "20px" }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Questions des clients</h1>
        <p style={{ color: C.t2, fontSize: "13.5px", lineHeight: 1.55, margin: 0, maxWidth: "65ch" }}>
          Questions publiques posées par des citoyens avant de prendre rendez-vous — une fois que vous y répondez, elles s&apos;affichent sur votre fiche pour aider les prochains visiteurs.
        </p>
      </div>
      <div style={{ flexShrink: 0 }}>{actions}</div>
    </div>
  );
}

// ── Barre d'outils ───────────────────────────────────────────────────────
export function QuestionsToolbar({ C, active, search, onSearch, tabs, tabActif, onTab, tri, onTri, total, filtreActif, onReset }: {
  C: ThemeTokens; active: boolean; search: string; onSearch: (v: string) => void;
  tabs: { key: string; label: string; count: number; attention?: boolean }[]; tabActif: string; onTab: (k: string) => void;
  tri: string; onTri: (v: string) => void; total: number; filtreActif: boolean; onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: "16px" }}>
      <div style={{ position: "relative", width: "320px", maxWidth: "100%" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input ref={inputRef} className="qcx-input" value={search} onChange={e => onSearch(e.target.value)} aria-label="Rechercher une question" placeholder="Rechercher une question ou un citoyen…"
          style={{ width: "100%", height: "36px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 32px", color: C.t1, fontSize: "13.5px", fontFamily: "inherit" }}/>
        {search ? (
          <button type="button" className="qcx-btn tap" aria-label="Effacer la recherche" onClick={() => { onSearch(""); inputRef.current?.focus(); }}
            style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ) : (
          <kbd aria-hidden="true" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
        )}
      </div>

      <div role="group" aria-label="Filtrer par statut" style={{ display: "flex", gap: "2px" }}>
        {tabs.map(t => {
          const on = t.key === tabActif;
          return (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => onTab(t.key)} className="qcx-btn tap"
              style={{ height: "36px", padding: "0 10px", background: "none", border: "none", borderBottom: `2px solid ${on ? C.gold : "transparent"}`, color: on ? C.t1 : C.t2, fontSize: "13.5px", fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {t.label}
              {t.attention && <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: C.orange }}/>}
              <span style={{ color: C.t3, fontSize: "12px", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      <select aria-label="Trier les questions" value={tri} onChange={e => onTri(e.target.value)} className="qcx-input"
        style={{ height: "34px", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 10px", color: C.t1, fontSize: "13px", fontFamily: "inherit" }}>
        <option value="">Trier par</option>
        <option value="recentes">Plus récentes</option>
        <option value="anciennes">Plus anciennes</option>
      </select>

      {filtreActif && <button type="button" className="qcx-btn tap" onClick={onReset} style={{ background: "none", border: "none", color: C.t2, fontSize: "12.5px", textDecoration: "underline", cursor: "pointer", padding: "2px 4px" }}>Réinitialiser</button>}
      <span aria-live="polite" style={{ marginLeft: "auto", color: C.t2, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{total} question{total > 1 ? "s" : ""}</span>
    </div>
  );
}

// ── Carte question / réponse ─────────────────────────────────────────────
function ClampText({ C, texte, lignes, seuil, style }: { C: ThemeTokens; texte: string; lignes: 3 | 4; seuil: number; style: React.CSSProperties }) {
  const [etendu, setEtendu] = useState(false);
  const long = texte.length > seuil || texte.split("\n").length > lignes;
  return (
    <>
      <p className={long && !etendu ? (lignes === 3 ? "qcx-clamp3" : "qcx-clamp4") : undefined} style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", ...style }}>{texte}</p>
      {long && <button type="button" className="qcx-btn tap" aria-expanded={etendu} onClick={() => setEtendu(v => !v)} style={{ background: "none", border: "none", padding: "4px 0 0", color: C.t1, fontSize: "13px", fontWeight: 500, textDecoration: "underline", cursor: "pointer" }}>{etendu ? "Voir moins" : "Voir plus"}</button>}
    </>
  );
}

export function QuestionStatusBadge({ C, repondue }: { C: ThemeTokens; repondue: boolean }) {
  const color = repondue ? C.green : C.orange;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: `${color}1c`, color, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "currentColor" }}/>
      {repondue ? "Répondue" : "En attente"}
    </span>
  );
}

function AnswerBlock({ C, reponse, reponseLe }: { C: ThemeTokens; reponse: string; reponseLe: string | null }) {
  return (
    <div style={{ marginTop: "12px", marginLeft: "12px", padding: "10px 14px", backgroundColor: C.bgCard2, borderLeft: `2px solid ${C.gold}`, borderRadius: "0 8px 8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", color: C.t3, fontSize: "12px", marginBottom: "4px" }}>
        <span>Votre réponse{reponseLe ? ` · ${dateLongue(reponseLe)}` : ""}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "20px", padding: "0 6px", borderRadius: "5px", backgroundColor: C.bg3, color: C.t2, fontWeight: 500 }}>
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Publique
        </span>
      </div>
      <ClampText C={C} texte={reponse} lignes={4} seuil={260} style={{ color: C.t2, fontSize: "14px", lineHeight: 1.55 }}/>
    </div>
  );
}

export type QuestionData = { id: string; citoyen_nom: string; question: string; reponse: string | null; reponse_le: string | null; created_at: string };
export function QuestionCard({ C, q, maintenant, readOnly, frequente, composerOuvert, brouillon, envoi, onOuvrir, onChangeBrouillon, onAnnuler, onPublier }: {
  C: ThemeTokens; q: QuestionData; maintenant: number; readOnly: boolean; frequente: number;
  composerOuvert: boolean; brouillon: string; envoi: boolean;
  onOuvrir: () => void; onChangeBrouillon: (v: string) => void; onAnnuler: () => void; onPublier: () => void;
}) {
  const ui = toUiTokens(C);
  const nom = nomPropre(q.citoyen_nom);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (composerOuvert) areaRef.current?.focus(); }, [composerOuvert]);
  return (
    <article className="qcx-card" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initiales(nom)}</span>
          <span title={nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom || "Citoyen"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {frequente > 1 && <span style={{ height: "22px", padding: "0 8px", borderRadius: "6px", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", display: "inline-flex", alignItems: "center", fontVariantNumeric: "tabular-nums" }}>Question fréquente ×{frequente}</span>}
          <QuestionStatusBadge C={C} repondue={!!q.reponse}/>
          <span title={dateLongue(q.created_at)} style={{ color: C.t3, fontSize: "13px", whiteSpace: "nowrap" }}>{dateRelative(q.created_at, maintenant)}</span>
        </div>
      </div>

      <ClampText C={C} texte={q.question} lignes={3} seuil={200} style={{ color: C.t1, fontSize: "15px", fontWeight: 600, lineHeight: 1.5 }}/>

      {q.reponse ? (
        <AnswerBlock C={C} reponse={q.reponse} reponseLe={q.reponse_le}/>
      ) : readOnly ? (
        <p style={{ color: C.t3, fontSize: "13px", margin: "12px 0 0" }}>En attente de réponse.</p>
      ) : composerOuvert ? (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <textarea ref={areaRef} className="qcx-input" value={brouillon} onChange={e => onChangeBrouillon(e.target.value)} rows={3}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (brouillon.trim() && !envoi) onPublier(); } }}
            aria-label="Votre réponse" placeholder="Votre réponse (publiée sur la fiche)…"
            style={{ width: "100%", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "10px 12px", color: C.t1, fontSize: "14px", lineHeight: 1.5, fontFamily: "inherit", resize: "vertical" }}/>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <Button tokens={ui} className="tap" variant="primary" size="sm" loading={envoi} disabled={!brouillon.trim()} onClick={onPublier}>Publier</Button>
            <Button tokens={ui} className="tap" variant="secondary" size="sm" disabled={envoi} onClick={onAnnuler}>Annuler</Button>
            <span style={{ color: C.t3, fontSize: "12px" }}>Ctrl + Entrée pour publier</span>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "12px" }}>
          <Button tokens={ui} className="tap" variant="primary" size="sm" onClick={onOuvrir}
            icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>}>
            Répondre
          </Button>
        </div>
      )}
    </article>
  );
}

// ── États ────────────────────────────────────────────────────────────────
export function QuestionsSkeleton() {
  return (
    <div role="status" aria-label="Chargement des questions" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {[0, 1, 2].map(i => <div key={i} className="qcx-skel" style={{ height: "128px", borderRadius: "12px" }}/>)}
    </div>
  );
}

export function QuestionsMessage({ C, icone, titre, texte, action }: { C: ThemeTokens; icone: ReactNode; titre: string; texte: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "40px 20px", textAlign: "center" }}>
      <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", marginBottom: "10px", color: C.t3 }}>{icone}</div>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.55, maxWidth: "420px", margin: "0 auto" }}>{texte}</div>
      {action && <div style={{ marginTop: "14px" }}><Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={action.onClick}>{action.label}</Button></div>}
    </div>
  );
}
