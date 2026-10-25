"use client";

// Tableau « Mes clients » (refonte UI 20/10/2026) : colonnes lisibles,
// lignes de 64 px, ligne entière cliquable (clavier : Tab + Entrée).
// Présentation pure — l'ordre vient de `sortBy` côté MesClientsTab, aucun
// tri de colonne n'est ajouté (les segments SONT le tri).
import type { ThemeTokens } from "../../theme";
import { StatusBadge } from "./StatusBadge";

export type ClientLigne = {
  id: string; nom: string; phone: string; nb_rdv: number;
  dernier_rdv: string; dernier_statut: string; est_nouveau: boolean; note: string;
};

function relatif(iso: string): string {
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j < 1) return "Aujourd'hui";
  if (j === 1) return "Hier";
  if (j < 30) return `Il y a ${j} j`;
  if (j < 365) return `Il y a ${Math.floor(j / 30)} mois`;
  const a = Math.floor(j / 365);
  return `Il y a ${a} ${a > 1 ? "ans" : "an"}`;
}
function absolue(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const COLONNES = ["Client", "Rendez-vous", "Dernier rendez-vous", "Dernier statut", ""];

export function ClientsTable<T extends ClientLigne>({ C, clients, total, selectedId, onSelect }: {
  C: ThemeTokens; clients: T[]; total: number; selectedId: string | null; onSelect: (c: T) => void;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}` }}>
              {COLONNES.map((h, i) => (
                <th key={i} scope="col" style={{ position: "sticky", top: 0, textAlign: "left", padding: "10px 16px", color: C.t3, fontSize: "12px", fontWeight: 500, whiteSpace: "nowrap", ...(i === COLONNES.length - 1 ? { width: "48px" } : {}) }}>
                  {h || <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Ouvrir la fiche</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr
                key={c.id} className="tap" tabIndex={0}
                onClick={() => onSelect(c)} onKeyDown={e => { if (e.key === "Enter") onSelect(c); }}
                style={{ height: "64px", cursor: "pointer", borderBottom: i < clients.length - 1 ? `1px solid ${C.border}` : "none", backgroundColor: selectedId === c.id ? `${C.gold}0f` : "transparent" }}
              >
                <td style={{ padding: "0 16px", maxWidth: "320px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div aria-hidden="true" style={{ position: "relative", width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.bg3, color: C.t2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 600, flexShrink: 0 }}>
                      {c.nom.slice(0, 2).toUpperCase()}
                      {c.est_nouveau && <span style={{ position: "absolute", top: "-1px", right: "-1px", width: "9px", height: "9px", borderRadius: "50%", backgroundColor: C.gold, border: `1.5px solid ${C.bgCard}` }}/>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span title={c.nom} style={{ color: C.t1, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nom}</span>
                        {c.est_nouveau && <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Nouveau client</span>}
                        {c.nb_rdv >= 5 && <span style={{ flexShrink: 0, backgroundColor: `${C.orange}1a`, color: C.orange, fontSize: "11px", fontWeight: 600, padding: "1px 7px", borderRadius: "8px" }}>VIP</span>}
                      </div>
                      {c.phone && <div style={{ color: C.t3, fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{c.phone}</div>}
                      {c.note && <div title={c.note} style={{ color: C.t3, fontSize: "12px", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>&quot;{c.note}&quot;</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "0 16px", color: C.t1, fontSize: "14px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.nb_rdv} RDV</td>
                <td style={{ padding: "0 16px", color: C.t2, fontSize: "13px", whiteSpace: "nowrap" }}>
                  <span title={absolue(c.dernier_rdv)}>{relatif(c.dernier_rdv)}</span>
                </td>
                <td style={{ padding: "0 16px", minWidth: "130px" }}>
                  {c.dernier_statut ? <StatusBadge C={C} statut={c.dernier_statut}/> : <span style={{ color: C.t3 }}>—</span>}
                </td>
                <td style={{ padding: "0 12px", textAlign: "right" }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px", color: C.t3, fontSize: "12px" }}>
        {clients.length === 0 ? `0 sur ${total}` : `1–${clients.length} sur ${total}`}
      </div>
    </div>
  );
}

export function ClientsSkeleton({ C }: { C: ThemeTokens }) {
  return (
    <div role="status" aria-label="Chargement des clients" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", backgroundColor: C.bgCard, overflow: "hidden" }}>
      <div style={{ height: "40px", backgroundColor: C.bgCard2, borderBottom: `1px solid ${C.border}` }}/>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ height: "64px", display: "flex", alignItems: "center", gap: "12px", padding: "0 16px", borderBottom: i < 3 ? `1px solid ${C.border}` : "none" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: C.bg3 }}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ width: "28%", height: "11px", borderRadius: "5px", backgroundColor: C.bg3 }}/>
            <div style={{ width: "16%", height: "9px", borderRadius: "4px", backgroundColor: C.bg3 }}/>
          </div>
        </div>
      ))}
    </div>
  );
}
