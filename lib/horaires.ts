// Extrait de app/institution/[id]/page.tsx (18/07/2026, chantier Favoris
// citoyen) pour être réutilisé aussi côté serveur (api/citoyen/favoris) —
// un fichier "use client" ne se réimporte pas proprement depuis une route
// API. Logique inchangée, un seul point de vérité désormais.
export type Horaire = { jour: string; ouvert: boolean; debut: string; fin: string; heures?: string };

export const JOURS_SEMAINE = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Parse la colonne institutions.horaires (jsonb, formats hétérogènes historiques). */
export function parseHoraires(v: unknown): Horaire[] {
  if (!v) return [];
  let raw = v;
  if (typeof v === "string") { try { raw = JSON.parse(v); } catch { return []; } }
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map(item => {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if ("ouvert" in o) return { jour: String(o.jour || ""), ouvert: Boolean(o.ouvert), debut: String(o.debut || ""), fin: String(o.fin || "") };
    const jour = String(o.jour || o.day || "").trim();
    const heures = String(o.heures || o.hours || "").trim();
    if (!jour) return null;
    return { jour, ouvert: !heures.toLowerCase().includes("ferm") && heures !== "", debut: "", fin: "", heures };
  }).filter((i): i is Horaire => i !== null);
}

export function isOuvertNow(horaires: Horaire[]): { ouvert: boolean; horaire: Horaire | null } {
  const now = new Date();
  const jourNom = JOURS_SEMAINE[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const h = horaires.find(x => x.jour.toLowerCase() === jourNom.toLowerCase());
  if (!h || !h.ouvert) return { ouvert: false, horaire: h || null };
  if (h.debut && h.fin) {
    const [dh, dm] = h.debut.split(":").map(Number);
    const [fh, fm] = h.fin.split(":").map(Number);
    return { ouvert: minutes >= dh * 60 + dm && minutes <= fh * 60 + fm, horaire: h };
  }
  return { ouvert: true, horaire: h };
}
