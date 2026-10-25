"use client";

// Onglet Aperçu : 4 KPI compacts + activité récente. Les valeurs sont
// calculées par EquipeTab (inchangées) ; ce composant ne fait que les
// présenter. "Activité récente" = dernière action connue par membre
// (champ `derniere_activite` déjà renvoyé par l'API), rien d'inventé.
import type { ThemeTokens } from "../../theme";
import { type Membre, formatRelatif, formatAction } from "./shared";

export type KpiItem = {
  label: string; value: string | number; sousTexte?: string; icon: React.ReactNode;
  // Valeur textuelle longue (ex. "Aujourd'hui, 02:18") : police réduite.
  compact?: boolean; onClick?: () => void;
};

export function OverviewKpis({ C, kpis, membres }: { C: ThemeTokens; kpis: KpiItem[]; membres: Membre[] }) {
  const recents = membres
    .filter((m): m is Membre & { derniere_activite: NonNullable<Membre["derniere_activite"]> } => m.derniere_activite !== null)
    .sort((a, b) => b.derniere_activite.created_at.localeCompare(a.derniere_activite.created_at))
    .slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        {kpis.map(k => {
          const contenu = (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ color: C.t3, fontSize: "13px" }}>{k.label}</span>
                <span aria-hidden="true" style={{ color: C.t3, display: "flex" }}>{k.icon}</span>
              </div>
              <div style={{ color: C.t1, fontSize: k.compact ? "19px" : "28px", fontWeight: 600, lineHeight: 1.2, marginTop: "8px" }}>{k.value}</div>
              {k.sousTexte && <div style={{ color: C.t3, fontSize: "12px", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.sousTexte}</div>}
            </>
          );
          const base: React.CSSProperties = { minHeight: "96px", padding: "20px", border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard, textAlign: "left" };
          return k.onClick
            ? <button key={k.label} onClick={k.onClick} className="tap" style={{ ...base, cursor: "pointer" }}>{contenu}</button>
            : <div key={k.label} style={base}>{contenu}</div>;
        })}
      </div>

      <section aria-labelledby="equipe-activite-recente" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard }}>
        <h2 id="equipe-activite-recente" style={{ color: C.t1, fontSize: "16px", fontWeight: 600, padding: "16px 20px", borderBottom: `1px solid ${C.border}`, margin: 0 }}>Activité récente</h2>
        {recents.length === 0 ? (
          <p style={{ color: C.t3, fontSize: "13px", padding: "20px", margin: 0 }}>Aucune activité enregistrée pour le moment.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {recents.map((m, i) => (
              <li key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 20px", borderBottom: i < recents.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "14px" }}>
                  <span style={{ color: C.t1, fontWeight: 600 }}>{m.prenom} {m.nom}</span>
                  <span style={{ color: C.t2 }}> · {formatAction(m.derniere_activite.action)}</span>
                </span>
                <span style={{ color: C.t3, fontSize: "12px", flexShrink: 0 }}>{formatRelatif(m.derniere_activite.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
