"use client";

// Coquille du modal « Ajouter un membre » (refonte UI 20/10/2026) :
// overlay, dialogue accessible (role=dialog, focus piégé, Échap, retour du
// focus au déclencheur), en-tête et pied fixes, corps défilant avec ombres
// quand du contenu est caché. Aucune logique métier — le contenu des
// étapes et les handlers restent dans EquipeTab.
import { useEffect, useId, useRef, useState } from "react";
import type { ThemeTokens } from "../../theme";
import { Button } from "@/components/ui/Button";
import { toUiTokens } from "../../theme";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function DialogShell({ C, title, subtitle, stepLabel, onRequestClose, footer, children }: {
  C: ThemeTokens; title: string; subtitle?: string; stepLabel?: string;
  onRequestClose: () => void; footer: React.ReactNode; children: React.ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [ombreHaut, setOmbreHaut] = useState(false);
  const [ombreBas, setOmbreBas] = useState(false);

  // Focus initial sur le premier champ marqué data-autofocus (sinon le
  // premier élément focusable) ; au démontage, le focus retourne à
  // l'élément qui était actif à l'ouverture (bouton « Inviter un membre »).
  useEffect(() => {
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cible = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    cible?.focus();
    return () => { precedent?.focus(); };
  }, []);

  function majOmbres() {
    const el = bodyRef.current;
    if (!el) return;
    setOmbreHaut(el.scrollTop > 2);
    setOmbreBas(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }
  useEffect(() => {
    majOmbres();
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(majOmbres);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  });

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onRequestClose(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const premier = items[0], dernier = items[items.length - 1];
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }

  const ombre = (haut: boolean): React.CSSProperties => ({
    position: "absolute", left: 0, right: 0, [haut ? "top" : "bottom"]: 0, height: "10px", pointerEvents: "none",
    background: `linear-gradient(${haut ? "to bottom" : "to top"}, rgba(0,0,0,0.12), transparent)`,
  });

  return (
    <div className="eq-dlg-overlay" onClick={onRequestClose}>
      <style>{`
        .eq-dlg-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;animation:fadeIn 0.2s ease}
        .eq-dlg{--eq-accent:${C.gold};--eq-hover:${C.t3};position:relative;width:100%;max-width:740px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:${C.bgCard};border:1px solid ${C.border2};border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,0.25)}
        .eq-field:hover{border-color:var(--eq-hover)!important}
        .eq-field:focus-visible,.eq-radio:focus-visible,.eq-check:focus-visible{outline:2px solid var(--eq-accent);outline-offset:2px}
        .eq-anim{transition:background-color 150ms ease,border-color 150ms ease,opacity 150ms ease}
        @media (prefers-reduced-motion: reduce){.eq-anim,.eq-dlg-overlay{transition:none!important;animation:none!important}}
        @media (max-width:767px){
          .eq-dlg-overlay{padding:0;align-items:stretch}
          .eq-dlg{max-width:none;max-height:100svh;height:100svh;border-radius:0;border:none}
          .eq-name-grid,.eq-role-grid,.eq-perm-grid{grid-template-columns:1fr!important}
        }
      `}</style>
      <div ref={dialogRef} className="eq-dlg" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div style={{ flexShrink: 0, padding: "24px 24px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={{ color: C.t1, fontSize: "20px", fontWeight: 600, margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ color: C.t3, fontSize: "13px", margin: "4px 0 0" }}>{subtitle}</p>}
            {stepLabel && <p style={{ color: C.t3, fontSize: "12px", margin: "6px 0 0", fontWeight: 500 }}>{stepLabel}</p>}
          </div>
          <button onClick={onRequestClose} aria-label="Fermer" className="tap" style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "8px", border: "none", backgroundColor: "transparent", color: C.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div ref={bodyRef} onScroll={majOmbres} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 24px 24px" }}>
            <div>{children}</div>
          </div>
          {ombreHaut && <div aria-hidden="true" style={ombre(true)}/>}
          {ombreBas && <div aria-hidden="true" style={ombre(false)}/>}
        </div>

        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "14px 24px" }}>{footer}</div>
      </div>
    </div>
  );
}

// Pied du dialogue : message d'aide à gauche (ce qui manque), actions
// alignées à droite en largeur automatique. « Continuer » est un bouton
// neutre tant que le formulaire est incomplet (jamais un orange pâle
// trompeur), plein `C.gold` quand il est valide.
export function DialogFooter({ C, message, secondary, primary }: {
  C: ThemeTokens; message?: string;
  secondary: { label: string; onClick: () => void; disabled?: boolean };
  primary: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean };
}) {
  const tokens = toUiTokens(C);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
      <p aria-live="polite" style={{ flex: "1 1 200px", margin: 0, color: C.t3, fontSize: "12.5px" }}>{message}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
        <Button tokens={tokens} className="tap" variant="ghost" size="md" disabled={secondary.disabled} onClick={secondary.onClick}>{secondary.label}</Button>
        <Button
          tokens={tokens} className="tap" size="md"
          variant={primary.disabled && !primary.loading ? "secondary" : "primary"}
          disabled={primary.disabled} loading={primary.loading} onClick={primary.onClick}
        >{primary.label}</Button>
      </div>
    </div>
  );
}
