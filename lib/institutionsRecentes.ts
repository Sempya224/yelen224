// Établissements récemment consultés — façon Booking.com "Continue your
// search" (retour Bryan 25/07/2026). Purement local (localStorage, aucune
// table ni compte requis) : c'est un historique de navigation personnel, pas
// une donnée qui a besoin d'être synchronisée entre appareils. Retirer un
// établissement via le X ne fait que le sortir de cette liste — le revisiter
// l'y remet naturellement (pas de "liste noire" séparée à maintenir).
const KEY = "yelen224_institutions_recentes";
const MAX = 10;

export type InstitutionRecente = {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  ville: string;
};

function lire(): InstitutionRecente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function institutionsRecentes(): InstitutionRecente[] {
  return lire();
}

export function enregistrerInstitutionConsultee(inst: InstitutionRecente) {
  if (typeof window === "undefined") return;
  try {
    const next = [inst, ...lire().filter(i => i.id !== inst.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function retirerInstitutionRecente(id: string): InstitutionRecente[] {
  if (typeof window === "undefined") return [];
  const next = lire().filter(i => i.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}
