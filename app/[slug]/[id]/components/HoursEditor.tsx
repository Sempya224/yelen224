"use client";

// Éditeur des horaires d'ouverture (refonte ProfilEntrepriseTab, Étape B,
// 19/10/2026) — même shape `Horaire[]`/mêmes handlers que l'ancien bloc
// inline (aucun changement de schéma ni de sémantique institutions.horaires),
// ajoute uniquement : résumé lisible (regroupement des jours consécutifs
// identiques), actions rapides, validation fin>début inline. Champs heure en
// 140px (au lieu de 100% de la ligne) — cohérent avec la seule autre config
// d'horaires d'ouverture du dashboard (DisponibilitesTab.tsx::TimeSelect,
// déjà 24h), pas en conflit avec la règle produit "AM/PM partout" qui a déjà
// cette exception documentée pour les horaires d'ouverture.
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens, toUiTokens } from "../theme";
import { Button } from "@/components/ui/Button";
import { inputFieldStyle as fieldInput } from "./FormField";

export type Horaire = { jour: string; ouvert: boolean; debut: string; fin: string };

function abrege(jour: string): string {
  return jour.slice(0, 3);
}

// Regroupe les jours consécutifs ayant exactement le même état (ouvert/fermé
// + mêmes heures) — l'ordre du tableau est toujours Lundi→Dimanche, donc une
// simple comparaison au groupe précédent suffit, pas besoin de tri.
function resumerHoraires(horaires: Horaire[]): string {
  const groupes: { jours: string[]; ouvert: boolean; debut: string; fin: string }[] = [];
  for (const h of horaires) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.ouvert === h.ouvert && dernier.debut === h.debut && dernier.fin === h.fin) {
      dernier.jours.push(h.jour);
    } else {
      groupes.push({ jours: [h.jour], ouvert: h.ouvert, debut: h.debut, fin: h.fin });
    }
  }
  return groupes.map(g => {
    const label = g.jours.length > 1 ? `${abrege(g.jours[0])}–${abrege(g.jours[g.jours.length - 1])}` : abrege(g.jours[0]);
    return g.ouvert ? `${label} ${g.debut}–${g.fin}` : `${label} fermé`;
  }).join(" · ");
}

export function HoursEditor({ horaires, onUpdate, onBulkUpdate }: {
  horaires: Horaire[];
  onUpdate: (idx: number, field: keyof Horaire, value: string | boolean) => void;
  onBulkUpdate: (horaires: Horaire[]) => void;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [ouvert, setOuvert] = useState(true);
  const lundi = horaires.find(h => h.jour === "Lundi");

  const copierLundiVersOuvres = () => {
    if (!lundi) return;
    onBulkUpdate(horaires.map(h => h.ouvert ? { ...h, debut: lundi.debut, fin: lundi.fin } : h));
  };
  const appliquerATous = () => {
    if (!lundi) return;
    onBulkUpdate(horaires.map(h => ({ ...h, ouvert: lundi.ouvert, debut: lundi.debut, fin: lundi.fin })));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "4px 8px 12px" }}>
        <button type="button" onClick={() => setOuvert(o => !o)} className="tap" aria-expanded={ouvert} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: ouvert ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>
          <span style={{ color: C.t2, fontSize: "11.5px", fontWeight: "600", textAlign: "left" }}>{resumerHoraires(horaires)}</span>
        </button>
        {ouvert && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={copierLundiVersOuvres}>
              Copier le lundi vers tous les jours ouvrés
            </Button>
            <Button tokens={toUiTokens(C)} className="tap" variant="secondary" size="sm" onClick={appliquerATous}>
              Appliquer à tous
            </Button>
          </div>
        )}
      </div>
      {ouvert && horaires.map((h, i) => {
        const erreur = h.ouvert && h.fin <= h.debut;
        return (
          <div key={h.jour}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: "10px", alignItems: "center", padding: "8px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div onClick={() => onUpdate(i, "ouvert", !h.ouvert)} className="tap" style={{ width: "34px", height: "20px", borderRadius: "10px", backgroundColor: h.ouvert ? C.gold : C.bg3, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "2px", left: h.ouvert ? "16px" : "2px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: h.ouvert ? "#000" : C.t3, transition: "left 0.15s" }}/>
                </div>
                <span style={{ color: h.ouvert ? C.t1 : C.t3, fontSize: "12px", fontWeight: "700" }}>{h.jour}</span>
              </div>
              {h.ouvert ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input type="time" value={h.debut} onChange={e => onUpdate(i, "debut", e.target.value)} style={{ ...fieldInput(C), width: "140px", padding: "7px 9px", fontSize: "12px", border: `1px solid ${erreur ? C.red : C.border}` }}/>
                  <span style={{ color: C.t3, fontSize: "11px" }}>→</span>
                  <input type="time" value={h.fin} onChange={e => onUpdate(i, "fin", e.target.value)} style={{ ...fieldInput(C), width: "140px", padding: "7px 9px", fontSize: "12px", border: `1px solid ${erreur ? C.red : C.border}` }}/>
                </div>
              ) : (
                <span style={{ color: C.t3, fontSize: "12px", fontStyle: "italic" }}>Fermé ce jour</span>
              )}
              <span/>
            </div>
            {erreur && (
              <p role="alert" style={{ color: C.red, fontSize: "10.5px", fontWeight: "600", margin: "0 0 4px 108px" }}>
                L&apos;heure de fin doit être après l&apos;heure de début.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
