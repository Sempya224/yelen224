"use client";

// Choix du rôle en cartes radio (refonte UI 20/10/2026). Vraie sémantique
// radiogroup : tabindex itinérant, flèches qui sélectionnent. La liste des
// rôles et leurs descriptions viennent du code existant (ROLES).
import { useRef } from "react";
import type { ThemeTokens } from "../../theme";
import type { MembreRole } from "@/lib/institutionPermissions";

// Rôles à accès étendu signalés par un badge (admin = accès total,
// dirigeant = vue exécutive sur les données sensibles).
const ROLES_ACCES_ETENDU: readonly MembreRole[] = ["admin", "dirigeant"];

export function RoleRadioCards({ C, roles, value, onChange }: {
  C: ThemeTokens; roles: { value: MembreRole; label: string; description: string }[]; value: MembreRole; onChange: (r: MembreRole) => void;
}) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const suiv = e.key === "ArrowRight" || e.key === "ArrowDown";
    const prec = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!suiv && !prec) return;
    e.preventDefault();
    const next = roles[(index + (suiv ? 1 : -1) + roles.length) % roles.length].value;
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <section aria-labelledby="eq-role-titre">
      <h3 id="eq-role-titre" style={{ color: C.t1, fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>Rôle du membre</h3>
      <p style={{ color: C.t3, fontSize: "12.5px", margin: "0 0 12px" }}>Le rôle définit ce que cette personne peut voir et faire.</p>
      <div role="radiogroup" aria-labelledby="eq-role-titre" className="eq-role-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {roles.map((r, i) => {
          const selected = r.value === value;
          return (
            <div
              key={r.value} ref={el => { refs.current[r.value] = el; }}
              role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1}
              onClick={() => onChange(r.value)} onKeyDown={e => onKeyDown(e, i)}
              className="eq-radio eq-anim"
              style={{
                position: "relative", cursor: "pointer", borderRadius: "10px", padding: "14px 40px 14px 14px",
                border: selected ? `1.5px solid ${C.gold}` : `1px solid ${C.border2}`,
                backgroundColor: selected ? `${C.gold}14` : C.bgCard,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ color: C.t1, fontSize: "14px", fontWeight: 600 }}>{r.label}</span>
                {ROLES_ACCES_ETENDU.includes(r.value) && (
                  <span style={{ color: C.orange, backgroundColor: `${C.orange}1a`, fontSize: "11px", fontWeight: 600, padding: "1px 8px", borderRadius: "10px" }}>Accès étendu</span>
                )}
              </div>
              <p style={{ color: C.t3, fontSize: "12.5px", lineHeight: 1.45, margin: "4px 0 0" }}>{r.description}</p>
              {selected && (
                <span aria-hidden="true" style={{ position: "absolute", top: "12px", right: "12px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
