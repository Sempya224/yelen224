// Types et helpers de l'écran Équipe & Accès, déplacés tels quels depuis
// EquipeTab.tsx (refonte UI 20/10/2026) pour être partagés avec les
// composants de présentation de ce dossier. Aucune logique modifiée.
import type { ThemeTokens } from "../../theme";
import type { MembreRole } from "@/lib/institutionPermissions";
import { heureDepuisHorodatage } from "@/lib/heure";

export type DerniereActivite = { action: string; created_at: string };
export type Membre = {
  id: string; identifiant: string | null; prenom: string; nom: string; role: MembreRole;
  actif: boolean; compte_principal: boolean; doit_changer_pin: boolean;
  locked_until: string | null; derniere_connexion: string | null; fonction: string | null;
  derniere_activite: DerniereActivite | null; created_at: string;
  checkin_qr_generated_at?: string | null; checkin_qr_revoked_at?: string | null;
  acces_restreints?: string[] | null;
};
export type StatutMembre = "verrouille" | "suspendu" | "invitation" | "actif";

export function roleColor(r: MembreRole, C: ThemeTokens): string {
  if (r === "admin") return C.gold;
  if (r === "comptable") return C.purple;
  if (r === "superviseur") return C.orange;
  if (r === "dirigeant") return C.teal;
  return C.blue;
}

export function estVerrouille(m: Membre): boolean {
  return !!m.locked_until && new Date(m.locked_until).getTime() > Date.now();
}
export function estInvitationEnAttente(m: Membre): boolean {
  return m.doit_changer_pin && !m.derniere_connexion;
}
export function statutDe(m: Membre): StatutMembre {
  if (estVerrouille(m)) return "verrouille";
  if (!m.actif) return "suspendu";
  if (estInvitationEnAttente(m)) return "invitation";
  return "actif";
}
export const STATUT_LABEL: Record<StatutMembre, string> = { actif: "Actif", invitation: "En attente", suspendu: "Suspendu", verrouille: "Verrouillé" };
export function statutColor(s: StatutMembre, C: ThemeTokens): string {
  if (s === "actif") return C.green;
  if (s === "invitation") return C.orange;
  if (s === "suspendu") return C.red;
  return "#8B0000";
}

export function formatRelatif(iso: string | null): string {
  if (!iso) return "Jamais connecté";
  const d = new Date(iso);
  const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  const hier = new Date(aujourdhui); hier.setDate(hier.getDate() - 1);
  const cible = new Date(d); cible.setHours(0, 0, 0, 0);
  const heure = heureDepuisHorodatage(d);
  if (cible.getTime() === aujourdhui.getTime()) return `Aujourd'hui, ${heure}`;
  if (cible.getTime() === hier.getTime()) return `Hier, ${heure}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
export function formatAction(action: string): string {
  const s = action.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
