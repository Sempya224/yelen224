"use client";

// Briques présentationnelles de l'écran "Collaboration" (refonte UI
// 20/10/2026, références Slack / Linear / Intercom). Aucune requête, aucun
// envoi de message ici : CollaborationTab.tsx garde tout l'état, les
// handlers, le polling et la logique du fil de conversation.
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";

function abonnerReseau(notifier: () => void): () => void {
  window.addEventListener("online", notifier);
  window.addEventListener("offline", notifier);
  return () => { window.removeEventListener("online", notifier); window.removeEventListener("offline", notifier); };
}
// Le fil se rafraîchit par polling (pas de realtime) : l'indicateur reflète
// donc l'état réseau du navigateur, seule source d'état disponible.
function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerReseau, () => navigator.onLine, () => true);
}

export function CollabStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .clx-page{max-width:1440px;margin:0 auto;padding:24px 24px 24px}
      @media(min-width:1024px){.clx-page{padding:24px 32px 24px}}
      .clx-shell{display:flex;height:calc(100vh - 190px);min-height:520px;background:${C.bgCard};border:1px solid ${C.border};border-radius:12px;overflow:hidden}
      .clx-list{width:100%;display:flex;flex-direction:column;min-width:0}
      .clx-pane{display:flex;flex:1;min-width:0;flex-direction:column}
      .clx-back{display:inline-flex}
      .clx-shell[data-vue="liste"] .clx-pane{display:none}
      .clx-shell[data-vue="fil"] .clx-list{display:none}
      @media(min-width:1024px){
        .clx-list{width:360px;flex-shrink:0;border-right:1px solid ${C.border}}
        .clx-shell[data-vue="liste"] .clx-pane,.clx-shell[data-vue="fil"] .clx-list{display:flex}
        .clx-back{display:none}
      }
      .clx-row:hover{background-color:${C.bgCard2}}
      .clx-row:focus-visible,.clx-btn:focus-visible,.clx-input:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      .clx-skel{background:${C.bg3};border-radius:6px;animation:clxPulse 1.4s ease-in-out infinite}
      @keyframes clxPulse{0%,100%{opacity:1}50%{opacity:.5}}
      .clx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
      @media(prefers-reduced-motion:reduce){.clx-skel{animation:none}.clx-btn,.clx-row{transition:none!important}}
    `}</style>
  );
}

// ── En-tête ──────────────────────────────────────────────────────────────
export function CollabHeader({ C, mentionsNonLues, onSearchMessages, onMentions, onNew }: {
  C: ThemeTokens; mentionsNonLues: number; onSearchMessages: () => void; onMentions: () => void; onNew: () => void;
}) {
  const ui = toUiTokens(C);
  const enLigne = useEnLigne();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 16px", minHeight: "72px", marginBottom: "16px" }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ color: C.t1, fontSize: "24px", fontWeight: 600, lineHeight: 1.25, margin: "0 0 4px" }}>Collaboration</h1>
        <p style={{ color: C.t2, fontSize: "13.5px", margin: 0 }}>Échangez simplement avec les membres de votre équipe.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {!enLigne && <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: C.t3, fontSize: "12px" }}><span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: C.t3 }}/>Hors ligne</span>}
        <button type="button" onClick={onSearchMessages} className="clx-btn tap" aria-label="Rechercher dans les messages" title="Rechercher dans les messages"
          style={{ width: "36px", height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t2, cursor: "pointer" }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button type="button" onClick={onMentions} className="clx-btn tap" aria-label={mentionsNonLues > 0 ? `Mentions, ${mentionsNonLues} non lue${mentionsNonLues > 1 ? "s" : ""}` : "Mentions"}
          style={{ height: "36px", padding: "0 12px", display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: `1px solid ${C.border2}`, borderRadius: "8px", color: C.t1, fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
          Mentions
          {mentionsNonLues > 0 && <span style={{ minWidth: "18px", height: "18px", borderRadius: "9px", backgroundColor: C.gold, color: "#000", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px", fontVariantNumeric: "tabular-nums" }}>{mentionsNonLues}</span>}
        </button>
        <Button tokens={ui} className="tap" variant="primary" size="md" onClick={onNew} style={{ height: "36px" }}
          icon={<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>
          Nouvelle conversation
        </Button>
      </div>
    </div>
  );
}

// ── Panneau gauche ───────────────────────────────────────────────────────
export function ConversationSearch({ C, value, onChange }: { C: ThemeTokens; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // L'écran reste monté en arrière-plan : on n'agit que s'il est visible.
      if (!ref.current || ref.current.offsetParent === null) return;
      e.preventDefault();
      ref.current.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div style={{ position: "relative" }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input ref={ref} className="clx-input" value={value} onChange={e => onChange(e.target.value)} aria-label="Rechercher une conversation" placeholder="Rechercher une conversation…"
        style={{ width: "100%", height: "40px", boxSizing: "border-box", backgroundColor: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "0 34px", color: C.t1, fontSize: "14px", fontFamily: "inherit" }}/>
      {value ? (
        <button type="button" className="clx-btn tap" aria-label="Effacer la recherche" onClick={() => { onChange(""); ref.current?.focus(); }}
          style={{ position: "absolute", right: "7px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", borderRadius: "6px", background: "none", border: "none", color: C.t3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      ) : (
        <kbd aria-hidden="true" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.t3, border: `1px solid ${C.border2}`, borderRadius: "4px", padding: "0 5px", fontFamily: "inherit" }}>/</kbd>
      )}
    </div>
  );
}

export function ConversationFilters({ C, items, active, onChange }: { C: ThemeTokens; items: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div role="group" aria-label="Filtrer les conversations" style={{ display: "flex", border: `1px solid ${C.border2}`, borderRadius: "8px", overflow: "hidden", marginTop: "10px" }}>
      {items.map((it, i) => {
        const on = it.key === active;
        return (
          <button key={it.key} type="button" aria-pressed={on} onClick={() => onChange(it.key)} className="clx-btn tap"
            style={{ flex: 1, height: "32px", border: "none", borderLeft: i > 0 ? `1px solid ${C.border2}` : "none", backgroundColor: on ? C.bg3 : "transparent", color: on ? C.t1 : C.t2, fontSize: "12.5px", fontWeight: on ? 600 : 500, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
            {it.label}
            {it.count !== undefined && it.count > 0 && <span style={{ minWidth: "16px", height: "16px", borderRadius: "8px", backgroundColor: C.gold, color: "#000", fontSize: "10.5px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontVariantNumeric: "tabular-nums" }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ListSectionLabel({ C, children, icon }: { C: ThemeTokens; children: ReactNode; icon?: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "12px 16px 4px", color: C.t3, fontSize: "12px", fontWeight: 500 }}>{icon}{children}</div>;
}

// Navigation clavier de la liste : flèches haut/bas déplacent le focus entre
// les lignes (Entrée/Espace sélectionnent, gérés par chaque ligne).
export function onListKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const lignes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-clx-row]"));
  const i = lignes.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  lignes[Math.min(lignes.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
}

export function ListSkeleton() {
  return (
    <div role="status" aria-label="Chargement des conversations" style={{ padding: "8px 16px" }}>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", height: "64px" }}>
          <div className="clx-skel" style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div className="clx-skel" style={{ width: "55%", height: "12px", marginBottom: "8px" }}/>
            <div className="clx-skel" style={{ width: "80%", height: "10px" }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListMessage({ C, titre, texte, action }: { C: ThemeTokens; titre: string; texte: string; action?: { label: string; onClick: () => void; primaire?: boolean } }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px", display: "block" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>{titre}</div>
      <div style={{ color: C.t2, fontSize: "13px", lineHeight: 1.5 }}>{texte}</div>
      {action && <div style={{ marginTop: "14px" }}><Button tokens={toUiTokens(C)} className="tap" variant={action.primaire ? "primary" : "secondary"} size="sm" onClick={action.onClick}>{action.label}</Button></div>}
    </div>
  );
}

// ── Panneau droit ────────────────────────────────────────────────────────
export function PaneEmpty({ C, onNew }: { C: ThemeTokens; onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "24px", textAlign: "center" }}>
      <div aria-hidden="true" style={{ width: "72px", height: "72px", borderRadius: "50%", backgroundColor: `${C.gold}12`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div style={{ color: C.t1, fontSize: "16px", fontWeight: 600 }}>Choisissez une conversation</div>
      <div style={{ color: C.t2, fontSize: "13px", marginBottom: "10px" }}>ou lancez-en une nouvelle avec un collègue.</div>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={onNew}>Nouvelle conversation</Button>
    </div>
  );
}

export function PaneHeader({ C, nom, sousTitre, groupe, onBack }: { C: ThemeTokens; nom: string; sousTitre: string; groupe: boolean; onBack: () => void }) {
  return (
    <div style={{ height: "56px", flexShrink: 0, display: "flex", alignItems: "center", gap: "12px", padding: "0 16px", borderBottom: `1px solid ${C.border}` }}>
      <button type="button" className="clx-back clx-btn tap" onClick={onBack} aria-label="Retour à la liste des conversations"
        style={{ alignItems: "center", gap: "4px", background: "none", border: "none", color: C.t2, fontSize: "13px", cursor: "pointer", padding: "4px 0" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Retour
      </button>
      <span aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {groupe ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        ) : (nom.slice(0, 1).toUpperCase() || "?")}
      </span>
      <div style={{ minWidth: 0 }}>
        <div title={nom} style={{ color: C.t1, fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nom || "…"}</div>
        {sousTitre && <div style={{ color: C.t3, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sousTitre}</div>}
      </div>
    </div>
  );
}

export function DateSeparator({ C, label }: { C: ThemeTokens; label: string }) {
  return (
    <div role="separator" style={{ display: "flex", alignItems: "center", gap: "12px", margin: "6px 0" }}>
      <div style={{ flex: 1, height: "1px", backgroundColor: C.border }}/>
      <span style={{ color: C.t3, fontSize: "12px" }}>{label}</span>
      <div style={{ flex: 1, height: "1px", backgroundColor: C.border }}/>
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div role="status" aria-label="Chargement des messages" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {[["60%", "flex-start"], ["45%", "flex-end"], ["70%", "flex-start"]].map(([w, a], i) => (
        <div key={i} className="clx-skel" style={{ width: w, height: "44px", borderRadius: "14px", alignSelf: a }}/>
      ))}
    </div>
  );
}

export function jourMessage(iso: string, maintenant: number): string {
  const d = new Date(iso);
  const auj = new Date(maintenant);
  const j0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const a0 = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).getTime();
  const diff = Math.round((a0 - j0) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
