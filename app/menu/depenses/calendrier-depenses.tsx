"use client";

import { useMemo, useState } from "react";
import { formatGNF } from "@/lib/depenses";

// Lot 7 "Mes dépenses V2" (24/08/2026) — vue calendrier, composant dédié
// et autonome (pas de couplage aux types Depense/PaiementRdv de
// depenses-client.tsx, qui ne sont pas exportés) : le parent adapte ses
// lignes vers cette forme minimale au moment de l'appel. Inspiré du
// pattern de grille de AgendaSection.tsx (espace de travail institution)
// sans réutilisation directe — ce composant est scopé RDV/institution,
// pas généraliste.
export type LigneCalendrier = { id: string; montant: number; date_depense: string; label: string };

const JOURS_SEMAINE = ["L", "M", "M", "J", "V", "S", "D"];

function cleJour(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Grille 6 semaines (toujours assez pour couvrir n'importe quel mois),
// lundi en première colonne (convention FR, contrairement à
// getDay()==0 pour dimanche en JS).
function construireGrille(moisAffiche: Date): Date[] {
  const premierJourMois = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth(), 1);
  const decalage = (premierJourMois.getDay() + 6) % 7;
  const debut = new Date(premierJourMois); debut.setDate(debut.getDate() - decalage);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(debut); d.setDate(d.getDate() + i); return d; });
}

export function CalendrierDepenses({ lignes, card, card2, t1, t2, t3, brd, isDark, ombre, onFermer }: {
  lignes: LigneCalendrier[];
  card: string; card2: string; t1: string; t2: string; t3: string; brd: string; isDark: boolean; ombre: string;
  onFermer: () => void;
}) {
  const [moisAffiche, setMoisAffiche] = useState(() => new Date());
  const [jourSelectionne, setJourSelectionne] = useState<string | null>(null);

  const parJour = useMemo(() => {
    const map = new Map<string, LigneCalendrier[]>();
    for (const l of lignes) {
      const cle = cleJour(new Date(l.date_depense));
      map.set(cle, [...(map.get(cle) ?? []), l]);
    }
    return map;
  }, [lignes]);

  const grille = useMemo(() => construireGrille(moisAffiche), [moisAffiche]);
  const aujourdHui = cleJour(new Date());

  // Intensité relative (pour la couleur des jours) — sur les seuls jours
  // du mois affiché qui ont une dépense, pour ne pas écraser l'échelle
  // avec un mois entier de zéros.
  const maxJour = useMemo(() => {
    let max = 0;
    for (const d of grille) {
      if (d.getMonth() !== moisAffiche.getMonth()) continue;
      const total = (parJour.get(cleJour(d)) ?? []).reduce((s, l) => s + l.montant, 0);
      if (total > max) max = total;
    }
    return max;
  }, [grille, parJour, moisAffiche]);

  const lignesJourSelectionne = jourSelectionne ? (parJour.get(jourSelectionne) ?? []) : [];
  const totalJourSelectionne = lignesJourSelectionne.reduce((s, l) => s + l.montant, 0);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, backgroundColor: isDark ? "#0A0A0F" : "#F2F2F7", overflowY: "auto", animation: "screenIn 0.2s ease" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: isDark ? "rgba(7,7,22,0.97)" : "rgba(242,242,247,0.97)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${brd}`, padding: "env(safe-area-inset-top) 16px 0" }}>
        <div style={{ height: "52px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <button onClick={onFermer} className="tap" aria-label="Fermer" style={{ justifySelf: "start", width: "36px", height: "36px", borderRadius: "9px", background: card2, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div style={{ color: t1, fontSize: "14px", fontWeight: "800" }}>Calendrier des dépenses</div>
          <div/>
        </div>
      </header>

      <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom) + 32px)", maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <button onClick={() => setMoisAffiche((d) => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })} className="tap" aria-label="Mois précédent" style={{ width: "32px", height: "32px", borderRadius: "50%", background: card, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button onClick={() => { setMoisAffiche(new Date()); setJourSelectionne(null); }} className="tap" style={{ background: "none", border: "none", color: t1, fontSize: "15px", fontWeight: "800", textTransform: "capitalize", cursor: "pointer" }}>
            {moisAffiche.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </button>
          <button onClick={() => setMoisAffiche((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })} className="tap" aria-label="Mois suivant" style={{ width: "32px", height: "32px", borderRadius: "50%", background: card, border: `1px solid ${brd}`, display: "flex", alignItems: "center", justifyContent: "center", color: t1, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6 6 6"/></svg>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "6px" }}>
          {JOURS_SEMAINE.map((j, i) => (
            <div key={i} style={{ textAlign: "center", color: t3, fontSize: "10.5px", fontWeight: "800" }}>{j}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px", marginBottom: "20px" }}>
          {grille.map((d) => {
            const cle = cleJour(d);
            const horsMois = d.getMonth() !== moisAffiche.getMonth();
            const total = (parJour.get(cle) ?? []).reduce((s, l) => s + l.montant, 0);
            const intensite = maxJour > 0 ? total / maxJour : 0;
            const selectionne = jourSelectionne === cle;
            const estAujourdhui = cle === aujourdHui;
            return (
              <button
                key={cle} onClick={() => setJourSelectionne((prev) => (prev === cle ? null : cle))} className="tap"
                style={{
                  aspectRatio: "1", borderRadius: "10px", border: selectionne ? "2px solid #F5A623" : estAujourdhui ? `1px solid #F5A623` : "1px solid transparent",
                  background: horsMois ? "transparent" : total > 0 ? `rgba(245,166,35,${0.08 + intensite * 0.3})` : card,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", cursor: horsMois ? "default" : "pointer", padding: 0,
                  opacity: horsMois ? 0.3 : 1,
                }}
                disabled={horsMois}
              >
                <span style={{ color: t1, fontSize: "11.5px", fontWeight: estAujourdhui ? "900" : "600" }}>{d.getDate()}</span>
                {total > 0 && !horsMois && <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#F5A623" }}/>}
              </button>
            );
          })}
        </div>

        {jourSelectionne ? (
          <div style={{ backgroundColor: card, borderRadius: "18px", padding: "16px", boxShadow: ombre }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ color: t1, fontSize: "13.5px", fontWeight: "800", textTransform: "capitalize" }}>
                {new Date(jourSelectionne).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div style={{ color: t1, fontSize: "13.5px", fontWeight: "900" }}>{formatGNF(totalJourSelectionne)}</div>
            </div>
            {lignesJourSelectionne.length === 0 ? (
              <div style={{ color: t3, fontSize: "12.5px" }}>Aucune dépense ce jour-là.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {lignesJourSelectionne.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${brd}` }}>
                    <span style={{ color: t2, fontSize: "12.5px", fontWeight: "600" }}>{l.label}</span>
                    <span style={{ color: t1, fontSize: "12.5px", fontWeight: "800", flexShrink: 0 }}>{formatGNF(l.montant)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: t3, fontSize: "12.5px", textAlign: "center", padding: "10px" }}>Touchez un jour pour voir le détail.</div>
        )}
      </div>
    </div>
  );
}
