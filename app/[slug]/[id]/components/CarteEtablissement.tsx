"use client";

// Carte « établissement » en tête de l'écran Paramètres (extraite de
// layout.tsx). Affichage seul : aucune donnée n'est ajoutée à celles déjà
// chargées avec `inst`. Pas d'état d'erreur ici — le chargement de `inst`
// échoue en erreur globale plein écran dans layout.tsx, sans handler de
// rechargement ; tant que `inst` est null on affiche un skeleton.
import Image from "next/image";
import { toUiTokens, type ThemeTokens } from "../theme";
import { Button } from "@/components/ui/Button";

export type EtablissementCarte = {
  name: string;
  category: string;
  ville: string;
  logo: string | null;
  statut?: string;
  badge_verifie: boolean;
};

const INFO_VALIDE = "Votre inscription a été acceptée par l'équipe Yelen.";
const INFO_VERIFIE = "Le badge de confiance accordé par l'équipe Yelen à votre établissement.";

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  return mots.slice(0, 2).map(m => m[0]).join("").toUpperCase();
}

function Badge({ C, label, info }: { C: ThemeTokens; label: string; info: string }) {
  return (
    <span
      className="cet-badge yelen-focus-ring"
      tabIndex={0}
      data-tip={info}
      aria-label={`${label} : ${info}`}
      style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: C.greenL, color: C.green, fontSize: "12px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", position: "relative", cursor: "help" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      {label}
    </span>
  );
}

export function CarteEtablissement({ C, inst, onModifier }: { C: ThemeTokens; inst: EtablissementCarte | null; onModifier: () => void }) {
  const carte: React.CSSProperties = { backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "20px", boxSizing: "border-box" };

  if (!inst) {
    return (
      <div className="cet-carte" style={carte} aria-busy="true" aria-label="Chargement du profil de l'établissement">
        <style>{`@keyframes cet-pulse{0%,100%{opacity:1}50%{opacity:.5}}@media (prefers-reduced-motion: reduce){.cet-skel{animation:none!important}}`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="cet-skel" style={{ width: "56px", height: "56px", borderRadius: "14px", backgroundColor: C.bg3, flexShrink: 0, animation: "cet-pulse 1.4s ease-in-out infinite" }}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="cet-skel" style={{ height: "16px", width: "55%", borderRadius: "6px", backgroundColor: C.bg3, animation: "cet-pulse 1.4s ease-in-out infinite" }}/>
            <div className="cet-skel" style={{ height: "12px", width: "35%", borderRadius: "6px", backgroundColor: C.bg3, animation: "cet-pulse 1.4s ease-in-out infinite" }}/>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cet-carte" style={carte}>
      <style>{`
        .cet-ligne{display:flex;align-items:center;gap:16px}
        .cet-action{flex-shrink:0}
        .cet-badge[data-tip]::after{content:attr(data-tip);position:absolute;left:0;top:calc(100% + 6px);width:max-content;max-width:min(260px,70vw);background:${C.bgCard2};color:${C.t1};border:1px solid ${C.border2};border-radius:8px;padding:8px 10px;font-size:12px;font-weight:400;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .14s;z-index:20}
        .cet-badge[data-tip]:hover::after,.cet-badge[data-tip]:focus-visible::after{opacity:1}
        @media (prefers-reduced-motion: reduce){.cet-badge[data-tip]::after{transition:none}}
        @media (max-width:560px){.cet-ligne{flex-direction:column;align-items:stretch}.cet-action{width:100%}.cet-action button{width:100%}}
      `}</style>
      <div className="cet-ligne">
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: 0 }}>
          {inst.logo ? (
            <div style={{ position: "relative", width: "56px", height: "56px", borderRadius: "14px", overflow: "hidden", border: `1px solid ${C.border2}`, flexShrink: 0 }}>
              <Image src={inst.logo} alt="" fill sizes="56px" style={{ objectFit: "cover" }}/>
            </div>
          ) : (
            <div aria-hidden="true" style={{ width: "56px", height: "56px", borderRadius: "14px", backgroundColor: `${C.gold}18`, border: `1px solid ${C.gold}30`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 600, flexShrink: 0 }}>
              {initiales(inst.name)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.t1, fontSize: "18px", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</div>
            <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.category} · {inst.ville}</div>
            {(inst.statut === "validee" || inst.badge_verifie) && (
              <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                {inst.statut === "validee" && <Badge C={C} label="Compte validé" info={INFO_VALIDE}/>}
                {inst.badge_verifie && <Badge C={C} label="Vérifié" info={INFO_VERIFIE}/>}
              </div>
            )}
          </div>
        </div>
        <div className="cet-action">
          <Button tokens={toUiTokens(C)} variant="secondary" size="md" onClick={onModifier} ariaLabel="Modifier le profil de l'établissement" className="tap">Modifier</Button>
        </div>
      </div>
    </div>
  );
}
