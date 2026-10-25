"use client";

// Barre d'outils de l'onglet Membres : recherche, filtres Rôle/Statut,
// puces de filtres actifs amovibles, compteur. Présentation pure — la
// logique de filtrage reste dans EquipeTab (`membresFiltres`).
import type { ThemeTokens } from "../../theme";
import type { MembreRole } from "@/lib/institutionPermissions";

export type FiltreRole = "tous" | MembreRole;
export type FiltreStatut = "tous" | "invitations" | "suspendus";

const STATUT_OPTIONS: { value: FiltreStatut; label: string }[] = [
  { value: "tous", label: "Tous les statuts" },
  { value: "invitations", label: "En attente" },
  { value: "suspendus", label: "Suspendus" },
];

export function MembersToolbar({ C, recherche, onRecherche, role, onRole, statut, onStatut, roles, total, onReset }: {
  C: ThemeTokens; recherche: string; onRecherche: (v: string) => void;
  role: FiltreRole; onRole: (v: FiltreRole) => void;
  statut: FiltreStatut; onStatut: (v: FiltreStatut) => void;
  roles: { value: MembreRole; label: string }[]; total: number; onReset: () => void;
}) {
  const roleLabel = roles.find(r => r.value === role)?.label;
  const statutLabel = STATUT_OPTIONS.find(s => s.value === statut)?.label;
  const filtreActif = role !== "tous" || statut !== "tous" || recherche.trim() !== "";

  const controle: React.CSSProperties = {
    height: "36px", borderRadius: "8px", border: `1px solid ${C.border2}`, backgroundColor: C.bgCard,
    color: C.t1, fontSize: "14px", padding: "0 12px",
  };

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ position: "relative", width: "340px", maxWidth: "100%" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: "absolute", left: "11px", top: "10px" }}>
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search" aria-label="Rechercher un membre" value={recherche}
            onChange={e => onRecherche(e.target.value)} placeholder="Rechercher un membre…"
            style={{ ...controle, width: "100%", paddingLeft: "34px" }}
          />
        </div>
        <select aria-label="Filtrer par rôle" value={role} onChange={e => onRole(e.target.value as FiltreRole)} style={controle}>
          <option value="tous">Tous les rôles</option>
          {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select aria-label="Filtrer par statut" value={statut} onChange={e => onStatut(e.target.value as FiltreStatut)} style={controle}>
          {STATUT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span aria-live="polite" style={{ marginLeft: "auto", color: C.t3, fontSize: "13px" }}>
          {total} membre{total > 1 ? "s" : ""}
        </span>
      </div>

      {filtreActif && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
          {recherche.trim() !== "" && <Chip C={C} label={`« ${recherche.trim()} »`} onRemove={() => onRecherche("")}/>}
          {role !== "tous" && roleLabel && <Chip C={C} label={`Rôle : ${roleLabel}`} onRemove={() => onRole("tous")}/>}
          {statut !== "tous" && statutLabel && <Chip C={C} label={`Statut : ${statutLabel}`} onRemove={() => onStatut("tous")}/>}
          <button onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", color: C.t2, fontSize: "13px", fontWeight: 600, padding: "4px 6px" }}>Réinitialiser</button>
        </div>
      )}
    </div>
  );
}

function Chip({ C, label, onRemove }: { C: ThemeTokens; label: string; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: C.bg3, color: C.t1, fontSize: "12px", fontWeight: 500, padding: "4px 6px 4px 10px", borderRadius: "14px" }}>
      {label}
      <button onClick={onRemove} aria-label={`Retirer le filtre ${label}`} style={{ background: "none", border: "none", cursor: "pointer", color: C.t3, display: "flex", padding: "2px" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </span>
  );
}
