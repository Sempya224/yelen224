"use client";

// Gabarit d'affichage de l'écran « Sécurité du compte » (23/10/2026) : mêmes
// lignes (≈ 64 px, pastille d'icône 36 px, libellé 14 px, description 13 px)
// que l'accueil Paramètres (ParametresAccueil.tsx), regroupées ici pour être
// partagées avec TotpSection.tsx (variante « ligne »). Affichage seul : aucune
// logique PIN / passkeys / TOTP ici. Textes secondaires en C.t2 (C.t3 échoue
// le contraste AA en thème sombre).
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { ThemeTokens } from "../theme";
import { FUSEAU_GUINEE, heureDepuisHorodatage, libelleRelatif } from "@/lib/heure";

// ─── Dates (fuseau Africa/Conakry, heures en 12 h AM/PM via lib/heure.ts) ───

const FORMAT_JOUR_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: FUSEAU_GUINEE });
const FORMAT_JOUR_LONG = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: FUSEAU_GUINEE });

function versDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** « 23 oct. · 4:36 AM » — chaîne vide si la date est invalide. */
export function dateHeureCourte(iso: string): string {
  const d = versDate(iso);
  return d ? `${FORMAT_JOUR_COURT.format(d)} · ${heureDepuisHorodatage(d)}` : "";
}

/** « 1 août 2026 » — chaîne vide si la date est invalide. */
export function dateLongue(iso: string): string {
  const d = versDate(iso);
  return d ? FORMAT_JOUR_LONG.format(d) : "";
}

/** « il y a 7 h », « à l'instant »… */
export function tempsRelatif(iso: string): string {
  const d = versDate(iso);
  return d ? libelleRelatif(d, new Date()) : "";
}

// ─── Icônes ───

export type NomIcone = "bouclier" | "mot-de-passe" | "cle" | "pin" | "2fa" | "appareil" | "activite" | "telephone" | "email";

export function IconeSecurite({ nom, couleur }: { nom: NomIcone; couleur: string }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: couleur, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (nom) {
    case "bouclier": return <svg {...p}><path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5z"/></svg>;
    case "mot-de-passe": return <svg {...p}><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "cle": return <svg {...p}><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.65-8.65"/><path d="m18 5 3 3"/><path d="m15 8 2 2"/></svg>;
    case "pin": return <svg {...p}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="9.01" y2="7"/><line x1="12" y1="7" x2="12.01" y2="7"/><line x1="15" y1="7" x2="15.01" y2="7"/><line x1="9" y1="11" x2="9.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="15" y1="11" x2="15.01" y2="11"/></svg>;
    case "2fa": return <svg {...p}><rect x="6" y="2" width="12" height="20" rx="2"/><path d="m9.5 12 2 2 3.5-4"/></svg>;
    case "appareil": return <svg {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
    case "activite": return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "telephone": return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case "email": return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>;
  }
}

// ─── Styles partagés (classes, pour media queries et reduced-motion) ───

export function StylesSecurite({ C }: { C: ThemeTokens }) {
  return (
    <style>{`
      .sec-carte{background-color:${C.bgCard};border:1px solid ${C.border};border-radius:12px;overflow:hidden}
      .sec-ligne + .sec-ligne{border-top:1px solid ${C.border}}
      .sec-tete{display:flex;align-items:center;gap:14px;padding:12px 16px;min-height:64px}
      .sec-corps{flex:1;min-width:0}
      .sec-action{display:flex;align-items:center;gap:10px;flex-shrink:0}
      .sec-sous{display:flex;align-items:center;gap:12px;padding:10px 16px 10px 66px;border-top:1px solid ${C.border}}
      .sec-skel{background-color:${C.bg3};border-radius:6px;animation:sec-pulse 1.4s ease-in-out infinite}
      @keyframes sec-pulse{0%,100%{opacity:1}50%{opacity:.5}}
      @media (max-width:560px){
        .sec-tete{flex-wrap:wrap}
        .sec-corps{flex-basis:calc(100% - 50px)}
        .sec-action{width:100%;box-sizing:border-box;padding-left:50px;justify-content:space-between}
        .sec-action button{min-height:44px}
        .sec-sous{flex-wrap:wrap;padding-left:16px}
        .sec-sous .sec-action{padding-left:0}
      }
      @media (prefers-reduced-motion: reduce){.sec-skel{animation:none}}
    `}</style>
  );
}

// ─── Section et lignes ───

export function SectionSecurite({ C, id, titre, children }: { C: ThemeTokens; id: string; titre: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ marginBottom: "24px" }}>
      <h2 id={id} style={{ color: C.t2, fontSize: "12px", fontWeight: 500, margin: "0 0 8px", padding: "0 4px" }}>{titre}</h2>
      <div className="sec-carte">{children}</div>
    </section>
  );
}

/** État en texte (jamais la couleur seule) : coche + libellé quand `ok`. */
export function EtatTexte({ C, libelle, ok }: { C: ThemeTokens; libelle: string; ok?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: ok ? C.t1 : C.t2, fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap" }}>
      {ok && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
      {libelle}
    </span>
  );
}

export function LigneSecurite({ C, icone, titre, description, etat, action, children }: {
  C: ThemeTokens; icone: NomIcone; titre: ReactNode; description?: ReactNode; etat?: ReactNode; action?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="sec-ligne">
      <div className="sec-tete">
        <span aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${C.gold}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <IconeSecurite nom={icone} couleur={C.gold}/>
        </span>
        <div className="sec-corps">
          <div style={{ color: C.t1, fontSize: "14px", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>{titre}</div>
          {description && <div style={{ color: C.t2, fontSize: "13px", marginTop: "1px", lineHeight: 1.45 }}>{description}</div>}
        </div>
        {(etat || action) && <div className="sec-action">{etat}{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** Sous-ligne (une clé d'accès, un appareil…) sous une ligne parente. */
export function SousLigneSecurite({ C, titre, description, action }: { C: ThemeTokens; titre: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sec-sous">
      <div className="sec-corps">
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 500, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>{titre}</div>
        {description && <div style={{ color: C.t2, fontSize: "13px", marginTop: "1px", lineHeight: 1.45 }}>{description}</div>}
      </div>
      {action && <div className="sec-action">{action}</div>}
    </div>
  );
}

// ─── Bandeau de statut et chips ───

export function Chip({ C, children }: { C: ThemeTokens; children: ReactNode }) {
  return <span style={{ backgroundColor: C.bg3, color: C.t2, fontSize: "12px", fontWeight: 500, padding: "3px 9px", borderRadius: "10px", whiteSpace: "nowrap" }}>{children}</span>;
}

export function BandeauStatut({ C, fort, chips }: { C: ThemeTokens; fort: boolean; chips: string[] }) {
  const teinte = fort ? C.green : C.gold;
  return (
    <div role="status" style={{ backgroundColor: C.bgCard, border: `1px solid ${teinte}50`, borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${teinte}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {fort
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={teinte} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5z"/><path d="M9 12l2 2 4-4"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={teinte} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5z"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.t1, fontSize: "15px", fontWeight: 600 }}>{fort ? "Compte protégé" : "Protection de base"}</div>
          {!fort && <div style={{ color: C.t2, fontSize: "13px", marginTop: "1px" }}>Activez une clé d&apos;accès ou la double authentification.</div>}
        </div>
      </div>
      <div role="group" aria-label="Détail des protections" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
        {chips.map(c => <Chip key={c} C={C}>{c}</Chip>)}
      </div>
    </div>
  );
}

// ─── Skeleton aligné sur la mise en page ───

export function SkeletonSecurite({ C }: { C: ThemeTokens }) {
  return (
    <div aria-busy="true" aria-label="Chargement des informations de sécurité">
      <div style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="sec-skel" style={{ width: "36px", height: "36px", borderRadius: "10px" }}/>
          <div className="sec-skel" style={{ height: "16px", width: "40%" }}/>
        </div>
        <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
          <div className="sec-skel" style={{ height: "22px", width: "80px", borderRadius: "10px" }}/>
          <div className="sec-skel" style={{ height: "22px", width: "100px", borderRadius: "10px" }}/>
          <div className="sec-skel" style={{ height: "22px", width: "90px", borderRadius: "10px" }}/>
        </div>
      </div>
      <div className="sec-carte" style={{ marginBottom: "24px" }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="sec-ligne">
            <div className="sec-tete">
              <div className="sec-skel" style={{ width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0 }}/>
              <div className="sec-corps" style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <div className="sec-skel" style={{ height: "14px", width: "45%" }}/>
                <div className="sec-skel" style={{ height: "12px", width: "65%" }}/>
              </div>
              <div className="sec-skel" style={{ height: "32px", width: "92px", borderRadius: "8px", flexShrink: 0 }}/>
            </div>
          </div>
        ))}
      </div>
      <div className="sec-carte">
        {[0, 1].map(i => (
          <div key={i} className="sec-ligne">
            <div className="sec-tete">
              <div className="sec-skel" style={{ width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0 }}/>
              <div className="sec-corps" style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <div className="sec-skel" style={{ height: "14px", width: "50%" }}/>
                <div className="sec-skel" style={{ height: "12px", width: "70%" }}/>
              </div>
              <div className="sec-skel" style={{ height: "32px", width: "92px", borderRadius: "8px", flexShrink: 0 }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modale locale (role="dialog", focus piégé, Échap) ───

const FOCALISABLES = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ModaleSecurite({ C, titre, sousTitre, onClose, children }: { C: ThemeTokens; titre: string; sousTitre?: string; onClose: () => void; children: ReactNode }) {
  const racine = useRef<HTMLDivElement>(null);
  const idTitre = useId();
  const fermer = useRef(onClose);
  useEffect(() => { fermer.current = onClose; });

  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const zone: HTMLElement = el;
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focalisables = () => Array.from(zone.querySelectorAll<HTMLElement>(FOCALISABLES));
    (focalisables()[0] ?? zone).focus();
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); fermer.current(); return; }
      if (e.key !== "Tab") return;
      const liste = focalisables();
      if (liste.length === 0) { e.preventDefault(); return; }
      const premier = liste[0], dernier = liste[liste.length - 1], actif = document.activeElement;
      if (e.shiftKey && (actif === premier || !zone.contains(actif))) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && (actif === dernier || !zone.contains(actif))) { e.preventDefault(); premier.focus(); }
    }
    zone.addEventListener("keydown", surTouche);
    return () => { zone.removeEventListener("keydown", surTouche); precedent?.focus(); };
  }, []);

  return (
    <div onClick={onClose} className="yelen-confirm-overlay" style={{ position: "fixed", inset: 0, zIndex: 900, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s ease" }}>
      <div ref={racine} role="dialog" aria-modal="true" aria-labelledby={idTitre} tabIndex={-1} onClick={e => e.stopPropagation()} className="yelen-confirm-panel" style={{ backgroundColor: C.bgCard, borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: "480px", border: `1px solid ${C.border2}`, borderBottom: "none" }}>
        <div className="yelen-confirm-grip" style={{ width: "36px", height: "4px", borderRadius: "2px", backgroundColor: C.t3, margin: "0 auto 20px" }} />
        <h2 id={idTitre} style={{ color: C.t1, fontSize: "17px", fontWeight: 600, margin: `0 0 ${sousTitre ? "6px" : "16px"}` }}>{titre}</h2>
        {sousTitre && <div style={{ color: C.t2, fontSize: "13px", marginBottom: "16px" }}>{sousTitre}</div>}
        {children}
      </div>
    </div>
  );
}
