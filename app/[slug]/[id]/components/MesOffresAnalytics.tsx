"use client";

// Panneaux d'analyse "Mes offres" (chantier "Centre de pilotage des offres",
// 02/08/2026, réorganisés en onglets le 20/10/2026) — Top offres (vues
// réelles, onglet Performance), puis Activité récente (Journal d'activité
// institution, cible_table="offres"), Modération (compteurs réels
// valide_le/motif_refus, pas un historique multi-refus) et Calendrier
// (stub "Bientôt disponible" — la planification de publication n'est pas
// construite, décision Bryan) dans l'onglet Activité et modération.
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { type Offre } from "./MesOffresTab";
import { dateRelative, dateHeure } from "./MesOffresUi";

type JournalEntree = { id: string; membre_nom: string; action: string; cible_id: string | null; created_at: string };

const ACTION_LABELS: Record<string, string> = {
  offre_creee: "a créé l'offre",
  offre_modifiee: "a modifié l'offre",
  offre_soumise: "a soumis l'offre à la modération",
  offre_suspendue: "a suspendu l'offre",
  offre_archivee: "a archivé l'offre",
  offre_supprimee: "a supprimé l'offre",
  offre_approuvee: "a approuvé l'offre",
  offre_refusee: "a refusé l'offre",
  offre_suspendue_admin: "a suspendu l'offre",
};

function panelStyle(C: ThemeTokens): React.CSSProperties {
  return { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px" };
}
const titreStyle = (C: ThemeTokens): React.CSSProperties => ({ color: C.t1, fontSize: "16px", fontWeight: 600, margin: "0 0 14px" });

export function MesOffresTopOffres({ items, vuesParOffre }: {
  items: Offre[];
  vuesParOffre: Record<string, { vues: number; clics: number }>;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const topOffres = [...items]
    .sort((a, b) => (vuesParOffre[b.id]?.vues ?? 0) - (vuesParOffre[a.id]?.vues ?? 0))
    .slice(0, 5);
  const maxVues = Math.max(1, ...topOffres.map(o => vuesParOffre[o.id]?.vues ?? 0));

  return (
    <div style={panelStyle(C)}>
      <h2 style={titreStyle(C)}>Top offres</h2>
      {topOffres.length === 0 ? (
        <div style={{ color: C.t2, fontSize: "13px" }}>Aucune donnée pour le moment.</div>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          {topOffres.map((o, i) => {
            const v = vuesParOffre[o.id]?.vues ?? 0;
            return (
              <li key={o.id}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ width: "18px", color: C.t3, fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <span title={o.titre} style={{ flex: 1, minWidth: 0, color: C.t1, fontSize: "14px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.titre}</span>
                  <span style={{ color: C.t2, fontSize: "13px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{v} vue{v > 1 ? "s" : ""}</span>
                </div>
                <div aria-hidden="true" style={{ height: "3px", borderRadius: "2px", backgroundColor: C.bg3, margin: "6px 0 0 28px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(v / maxVues) * 100}%`, backgroundColor: C.gold, borderRadius: "2px" }}/>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function MesOffresActivite({ items }: { items: Offre[] }) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [journal, setJournal] = useState<JournalEntree[]>([]);
  const [maintenant] = useState(() => Date.now());

  const ids = items.map(o => o.id).join(",");
  useEffect(() => {
    if (!ids) return;
    (async () => {
      const res = await fetch(`/api/institution/journal?cible_ids=${ids}&limit=30`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setJournal(j.entrees ?? []);
    })();
  }, [ids]);

  // Regroupement à l'affichage seulement : des événements consécutifs de
  // même auteur et même action ("a soumis l'offre à la modération" ×4)
  // deviennent une ligne "×4" — les données du journal ne sont pas modifiées.
  const groupes: { entree: JournalEntree; n: number }[] = [];
  for (const e of journal) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.entree.membre_nom === e.membre_nom && dernier.entree.action === e.action) dernier.n += 1;
    else groupes.push({ entree: e, n: 1 });
  }

  const enAttente = items.filter(o => o.statut === "en_attente_validation").length;
  const approuvees = items.filter(o => !!o.valide_le).length;
  const refusees = items.filter(o => o.motif_refus).length;
  const ligne = (label: string, valeur: number, color: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", fontSize: "14px" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "8px", color: C.t2 }}>
        <span aria-hidden="true" style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: color, flexShrink: 0 }}/>{label}
      </span>
      <span style={{ color: C.t1, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{valeur}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "16px", alignItems: "stretch" }}>
        <div style={{ ...panelStyle(C), display: "flex", flexDirection: "column", minHeight: "240px" }}>
          <h2 style={titreStyle(C)}>Activité récente</h2>
          {groupes.length === 0 ? (
            <div style={{ color: C.t2, fontSize: "13px" }}>Aucune activité pour le moment.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "320px", overflowY: "auto" }}>
              {groupes.map(({ entree: e, n }, i) => (
                <li key={e.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "9px 0", borderBottom: i < groupes.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ color: C.t2, fontSize: "14px", minWidth: 0, overflowWrap: "anywhere" }}>
                    <strong style={{ color: C.t1, fontWeight: 500 }}>{e.membre_nom}</strong> {ACTION_LABELS[e.action] ?? e.action}
                    {n > 1 && <span style={{ color: C.t3, marginLeft: "6px", fontVariantNumeric: "tabular-nums" }}>· ×{n}</span>}
                  </span>
                  <span title={dateHeure(e.created_at)} style={{ color: C.t3, fontSize: "12px", flexShrink: 0, whiteSpace: "nowrap" }}>{dateRelative(e.created_at, maintenant)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={panelStyle(C)}>
          <h2 style={titreStyle(C)}>Modération</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {ligne("En attente", enAttente, C.orange)}
            {ligne("Approuvées (au moins une fois)", approuvees, C.green)}
            {ligne("Refusées (au moins une fois)", refusees, C.red)}
          </div>
        </div>
      </div>

      <div style={{ ...panelStyle(C), padding: "14px 20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.6" strokeLinecap="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h2 style={{ color: C.t1, fontSize: "16px", fontWeight: 600, margin: 0 }}>Calendrier de publication</h2>
          <div style={{ color: C.t2, fontSize: "13px", marginTop: "2px" }}>Nécessite la planification de publication.</div>
        </div>
        <span style={{ fontSize: "12px", fontWeight: 600, color: C.t2, backgroundColor: C.bg3, borderRadius: "6px", padding: "2px 8px" }}>Bientôt disponible</span>
      </div>
    </div>
  );
}
