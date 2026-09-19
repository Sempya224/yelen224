"use client";

// Bottom analytics "Mes offres" (chantier "Centre de pilotage des offres",
// 02/08/2026) — Top offres (vues réelles), Activité récente (Journal
// d'activité institution, cible_table="offres"), Modération (compteurs
// réels valide_le/motif_refus, pas un historique multi-refus), Calendrier
// (stub "Bientôt disponible" — la planification de publication n'est pas
// construite dans ce chantier, décision Bryan).
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { T, type ThemeTokens } from "../theme";
import { type Offre } from "./MesOffresTab";

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  return `Il y a ${Math.floor(h / 24)} j`;
}

function panelStyle(C: ThemeTokens): React.CSSProperties {
  return { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "18px" };
}

export function MesOffresAnalytics({ items, vuesParOffre }: {
  items: Offre[];
  vuesParOffre: Record<string, { vues: number; clics: number }>;
}) {
  const { theme } = useTheme();
  const C = T[theme] as ThemeTokens;
  const [journal, setJournal] = useState<JournalEntree[]>([]);

  const ids = items.map(o => o.id).join(",");
  useEffect(() => {
    if (!ids) return;
    (async () => {
      const res = await fetch(`/api/institution/journal?cible_ids=${ids}&limit=30`);
      const j = await res.json().catch(() => null);
      if (res.ok && j) setJournal(j.entrees ?? []);
    })();
  }, [ids]);

  const topOffres = [...items]
    .sort((a, b) => (vuesParOffre[b.id]?.vues ?? 0) - (vuesParOffre[a.id]?.vues ?? 0))
    .slice(0, 5);

  const enAttente = items.filter(o => o.statut === "en_attente_validation").length;
  const approuvees = items.filter(o => !!o.valide_le).length;
  const refusees = items.filter(o => o.motif_refus).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "16px", marginTop: "20px" }}>
      <div style={panelStyle(C)}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Top offres</div>
        {topOffres.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "12px" }}>Aucune donnée pour le moment.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {topOffres.map((o, i) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ width: "20px", color: C.t3, fontSize: "11px", fontWeight: 800 }}>{i + 1}</span>
                <span style={{ flex: 1, color: C.t1, fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.titre}</span>
                <span style={{ color: C.t3, fontSize: "11px", flexShrink: 0 }}>{vuesParOffre[o.id]?.vues ?? 0} vues</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle(C)}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Activité récente</div>
        {journal.length === 0 ? (
          <div style={{ color: C.t3, fontSize: "12px" }}>Aucune activité pour le moment.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {journal.slice(0, 8).map(e => (
              <div key={e.id} style={{ fontSize: "12px" }}>
                <div style={{ color: C.t2 }}>
                  <strong style={{ color: C.t1 }}>{e.membre_nom}</strong> {ACTION_LABELS[e.action] ?? e.action}
                </div>
                <div style={{ color: C.t3, fontSize: "10.5px", marginTop: "2px" }}>{timeAgo(e.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={panelStyle(C)}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Modération</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
            <span style={{ color: C.t2 }}>En attente</span>
            <span style={{ color: C.orange, fontWeight: 800 }}>{enAttente}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
            <span style={{ color: C.t2 }}>Approuvées (au moins une fois)</span>
            <span style={{ color: C.green, fontWeight: 800 }}>{approuvees}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
            <span style={{ color: C.t2 }}>Refusées (au moins une fois)</span>
            <span style={{ color: C.red, fontWeight: 800 }}>{refusees}</span>
          </div>
        </div>
      </div>

      <div style={panelStyle(C)}>
        <div style={{ color: C.t1, fontSize: "13px", fontWeight: 800, marginBottom: "14px" }}>Calendrier de publication</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "16px 8px", textAlign: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div style={{ color: C.t3, fontSize: "11.5px", lineHeight: 1.6 }}>Bientôt disponible — nécessite la planification de publication.</div>
        </div>
      </div>
    </div>
  );
}
