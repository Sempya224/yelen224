"use client";

// Briques présentationnelles des popovers du header (étape 2 bis, 20/10/2026).
// Le conteneur (HeaderPopover) reste dans layout.tsx ; ici uniquement les
// états vides, le pied et les éléments de liste partagés.
import { Button } from "@/components/ui/Button";
import { type ThemeTokens, toUiTokens } from "../theme";

export function PopoverStyles({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .hp-item:hover{background-color:${C.bgCard2}}
      .hp-item:focus-visible,.hp-close:focus-visible{outline:2px solid ${C.gold};outline-offset:-2px}
      @media(prefers-reduced-motion:reduce){.header-popover-panel{animation:none!important}}
    `}</style>
  );
}

export const popoverItem = (C: ThemeTokens): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "12px", width: "100%", minHeight: "40px", padding: "0 10px", boxSizing: "border-box",
  color: C.t1, fontSize: "14px", fontWeight: 400, background: "none", border: "none", textAlign: "left", cursor: "pointer", borderRadius: "8px", textDecoration: "none", fontFamily: "inherit",
});

export function PopoverSection({ C, titre, children }: { C: ThemeTokens; titre: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "12px" }}>
      <h3 style={{ margin: "0 0 6px 10px", color: C.t3, fontSize: "12px", fontWeight: 500 }}>{titre}</h3>
      {children}
    </section>
  );
}

export function PopoverChevron({ C }: { C: ThemeTokens }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
}

export function PopoverEmpty({ C, icone, titre, aide }: { C: ThemeTokens; icone: React.ReactNode; titre: string; aide?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "24px 8px 16px", color: C.t3 }}>
      <div aria-hidden="true" style={{ display: "flex", justifyContent: "center" }}>{icone}</div>
      <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, marginTop: "8px" }}>{titre}</div>
      {aide && <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px", lineHeight: 1.5 }}>{aide}</div>}
    </div>
  );
}

// Pied unique : bouton SECONDAIRE pleine largeur (jamais d'orange plein).
export function PopoverFooter({ C, label, onClick }: { C: ThemeTokens; label: string; onClick: () => void }) {
  return (
    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
      <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="md" fullWidth onClick={onClick}>{label}</Button>
    </div>
  );
}

export const IcoVideRdv = <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
export const IcoVideQuestion = <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.3.9-1.3 1.7"/></svg>;
