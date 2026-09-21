"use client";

// Helpers visuels partagés par tous les écrans "Yelen Business" (Compte,
// Contrat, et les suivants) — extraits de YelenCompteTab.tsx pour éviter
// de redupliquer ce traitement honnête des champs pas encore construits
// à chaque nouvel écran de la section.
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { toCardTokens, type ThemeTokens } from "../theme";
import { SectionHeader } from "../dashboardShared";

// Pastille de statut — jamais d'emoji dans Yelen (retour Bryan
// 18/09/2026), toujours un SVG/élément sobre à la place.
export function StatusDot({ couleur, size = 8 }: { couleur: string; size?: number }) {
  return <span style={{ display: "inline-block", width: `${size}px`, height: `${size}px`, borderRadius: "50%", backgroundColor: couleur, flexShrink: 0 }}/>;
}

// "Bientôt disponible" = la fonctionnalité elle-même n'existe pas encore
// côté produit. "Non défini" = le concept existe mais aucune valeur n'est
// encore rattachée à ce compte précis (ex. dates contractuelles).
// Jamais une valeur fabriquée à la place, même style que PerformancesStub
// (CentreAnalyseTab.tsx) : le champ reste visible dans sa grille, marqué
// clairement plutôt que masqué ou inventé.
export function ChampBientot({ label, C, texte = "Bientôt disponible" }: { label: string; C: ThemeTokens; texte?: string }) {
  return (
    <div>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
      <div style={{ color: C.t3, fontSize: "13px", fontWeight: 600 }}>— <span style={{ fontSize: "10px", fontWeight: 700, backgroundColor: C.bg3, padding: "2px 7px", borderRadius: "8px", marginLeft: "4px" }}>{texte}</span></div>
    </div>
  );
}

export function Champ({ label, valeur, mono, C }: { label: string; valeur: React.ReactNode; mono?: boolean; C: ThemeTokens }) {
  return (
    <div>
      <div style={{ color: C.t3, fontSize: "10px", fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
      <div style={{ color: C.t1, fontSize: "13px", fontWeight: 700, fontFamily: mono ? "monospace" : undefined }}>{valeur}</div>
    </div>
  );
}

// Menu d'actions "⋯" générique — le contenu (libellés/handlers) reste
// défini par l'écran appelant, seul le mécanisme d'ouverture/fermeture
// est partagé.
export function MenuActions({ C, items }: { C: ThemeTokens; items: { label: string; onClick: () => void }[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOuvert(o => !o)} className="tap" aria-label="Actions" style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: C.bg3, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: C.t2 }}><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
      </button>
      {ouvert && (
        <>
          <div onClick={() => setOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }}/>
          <div style={{ position: "absolute", top: "40px", right: 0, zIndex: 50, backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "6px", minWidth: "220px", boxShadow: "0 12px 28px rgba(0,0,0,0.25)" }}>
            {items.map(it => (
              <button key={it.label} onClick={() => { setOuvert(false); it.onClick(); }} className="tap" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "9px 10px", borderRadius: "8px", color: C.t1, fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SectionBientot({ titre, sousTitre, texte, C, accent }: { titre: string; sousTitre: string; texte: string; C: ThemeTokens; accent?: string }) {
  return (
    <Card tokens={toCardTokens(C)} padding="16px" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <SectionHeader label={titre} accent={accent ?? C.t3}/>
        <span style={{ fontSize: "9px", fontWeight: 800, backgroundColor: C.bg3, color: C.t3, padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase", letterSpacing: "0.3px" }}>Bientôt disponible</span>
      </div>
      <p style={{ color: C.t3, fontSize: "11px", marginBottom: "10px", lineHeight: 1.5 }}>{sousTitre}</p>
      <p style={{ color: C.t3, fontSize: "12px", lineHeight: 1.6 }}>{texte}</p>
    </Card>
  );
}
