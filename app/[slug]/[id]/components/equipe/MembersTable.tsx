"use client";

// Tableau des membres (refonte UI 20/10/2026) — lignes denses, description
// du rôle en infobulle, statut avec pastille. Présentation pure : la
// sélection ouvre la fiche existante (MembreDetailModal) via `onSelect`.
import type { ThemeTokens } from "../../theme";
import type { MembreRole } from "@/lib/institutionPermissions";
import { type Membre, statutDe, STATUT_LABEL, statutColor, roleColor, formatRelatif, formatAction } from "./shared";

type RoleInfo = { value: MembreRole; label: string; description: string };

const COLONNES = ["Membre", "Rôle", "Dernière activité", "Dernière connexion", "Statut", ""];

export function MembersTable({ C, membres, total, roles, onSelect }: {
  C: ThemeTokens; membres: Membre[]; total: number; roles: RoleInfo[]; onSelect: (m: Membre) => void;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "820px", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}` }}>
              {COLONNES.map((h, i) => (
                <th key={i} scope="col" style={{ position: "sticky", top: 0, textAlign: "left", padding: "10px 16px", color: C.t3, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap", ...(i === COLONNES.length - 1 ? { width: "56px" } : {}) }}>
                  {h || <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {membres.map((m, i) => {
              const statut = statutDe(m);
              const info = roles.find(r => r.value === m.role);
              const rc = roleColor(m.role, C);
              const sc = statutColor(statut, C);
              const nomComplet = `${m.prenom} ${m.nom}`;
              return (
                <tr
                  key={m.id} onClick={() => onSelect(m)} className="tap" tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter") onSelect(m); }}
                  style={{ height: "60px", borderBottom: i < membres.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", opacity: m.actif ? 1 : 0.65 }}
                >
                  <td style={{ padding: "0 16px", maxWidth: "260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: `${rc}1f`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600, color: rc, flexShrink: 0 }}>
                        {m.prenom.slice(0, 1).toUpperCase()}{m.nom.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {nomComplet}{m.compte_principal && <span style={{ color: C.t3, fontWeight: 400 }}> · Principal</span>}
                        </div>
                        {m.fonction && <div style={{ color: C.t3, fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.fonction}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "0 16px", whiteSpace: "nowrap" }}>
                    <span title={info?.description} style={{ color: rc, fontSize: "12px", fontWeight: 600, backgroundColor: `${rc}1a`, padding: "3px 10px", borderRadius: "12px" }}>{info?.label}</span>
                  </td>
                  <td style={{ padding: "0 16px", maxWidth: "200px" }}>
                    <div style={{ color: C.t1, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.derniere_activite ? formatAction(m.derniere_activite.action) : "Compte créé"}
                    </div>
                    <div style={{ color: C.t3, fontSize: "12px" }}>{formatRelatif(m.derniere_activite ? m.derniere_activite.created_at : m.created_at)}</div>
                  </td>
                  <td style={{ padding: "0 16px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>{formatRelatif(m.derniere_connexion)}</td>
                  <td style={{ padding: "0 16px", minWidth: "120px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", color: C.t1, fontSize: "13px", fontWeight: 500 }}>
                      <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: sc }}/>
                      {STATUT_LABEL[statut]}
                    </span>
                  </td>
                  <td style={{ padding: "0 12px", textAlign: "right" }}>
                    <button
                      onClick={e => { e.stopPropagation(); onSelect(m); }}
                      aria-label={`Ouvrir la fiche de ${nomComplet}`}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, width: "32px", height: "32px", borderRadius: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", color: C.t3, fontSize: "12px" }}>
        {membres.length === 0 ? `0 sur ${total}` : `1–${membres.length} sur ${total}`}
      </div>
    </div>
  );
}

// Squelette de chargement initial — mêmes dimensions que le tableau réel.
export function MembersSkeleton({ C }: { C: ThemeTokens }) {
  return (
    <div role="status" aria-label="Chargement des membres" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard, overflow: "hidden" }}>
      <div style={{ height: "40px", backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}` }}/>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ height: "60px", display: "flex", alignItems: "center", gap: "12px", padding: "0 16px", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: C.bg3 }}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ width: "30%", height: "10px", borderRadius: "5px", backgroundColor: C.bg3 }}/>
            <div style={{ width: "18%", height: "8px", borderRadius: "4px", backgroundColor: C.bg3 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}
