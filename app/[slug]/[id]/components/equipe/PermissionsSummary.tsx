"use client";

// « Permissions incluses » en grille compacte (refonte UI 20/10/2026).
// Logique inchangée : un domaine accordé par le rôle peut être décoché
// (retiré pour CE membre), jamais ajouté au-delà du rôle.
import type { ThemeTokens } from "../../theme";
import type { DomaineKey } from "@/lib/institutionPermissions";

export type PermissionLigne = { key: DomaineKey; label: string; accorde: boolean; retire: boolean };

export function PermissionsSummary({ C, permissions, onToggle }: {
  C: ThemeTokens; permissions: PermissionLigne[]; onToggle: (key: DomaineKey) => void;
}) {
  const actifs = permissions.filter(p => p.accorde && !p.retire).length;
  return (
    <section aria-labelledby="eq-perm-titre" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard2, padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
        <h3 id="eq-perm-titre" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: 0 }}>Permissions incluses</h3>
        <span aria-live="polite" style={{ color: C.t3, fontSize: "12.5px" }}>{actifs} sur {permissions.length}</span>
      </div>
      <p style={{ color: C.t3, fontSize: "12.5px", margin: "4px 0 12px" }}>
        Décochez un domaine pour le retirer à ce membre — jamais au-delà de ce que son rôle permet déjà.
      </p>
      <div className="eq-perm-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
        {permissions.map(p => {
          if (!p.accorde) {
            return (
              <div key={p.key} title="Non disponible pour ce rôle" aria-disabled="true" className="eq-anim" style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "32px", color: C.t3, opacity: 0.7, fontSize: "13px" }}>
                <span aria-hidden="true" style={{ width: "16px", textAlign: "center", fontWeight: 600 }}>×</span>
                <span>{p.label}</span>
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Non disponible pour ce rôle</span>
              </div>
            );
          }
          return (
            <label key={p.key} className="eq-anim" style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "32px", cursor: "pointer", fontSize: "13px", color: p.retire ? C.t3 : C.t1 }}>
              <input type="checkbox" className="eq-check" checked={!p.retire} onChange={() => onToggle(p.key)} style={{ width: "16px", height: "16px", accentColor: C.gold, cursor: "pointer", margin: 0 }}/>
              <span style={{ textDecoration: p.retire ? "line-through" : "none" }}>{p.label}</span>
              {p.retire && <span style={{ color: C.orange, fontSize: "11px", fontWeight: 600, marginLeft: "auto" }}>Retiré</span>}
            </label>
          );
        })}
      </div>
    </section>
  );
}
