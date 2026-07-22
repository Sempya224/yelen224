// Extrait de app/rdv/[id]/page.tsx (18/07/2026, Lot F chantier Favoris
// citoyen — "prochain créneau disponible") pour être réutilisé côté
// serveur (api/citoyen/favoris) — un fichier "use client" ne se réimporte
// pas proprement depuis une route API. Logique inchangée, un seul point
// de vérité désormais sur le format `institutions.disponibilites`
// (tableau de chaînes : ISO "2026-07-20T09:00", hebdomadaire "Lundi
// 09:00", ou quotidien "09:00").
export type CreneauSlot = { key: string; dateRdv: string; heureRdv: string };

const FR_DAYS: Record<string, number> = {
  lun: 1, lundi: 1, mar: 2, mardi: 2, mer: 3, mercredi: 3, jeu: 4, jeudi: 4,
  ven: 5, vendredi: 5, sam: 6, samedi: 6, dim: 0, dimanche: 0,
};

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Génère toutes les occurrences (sur `days` jours) d'un pattern hebdomadaire "Lun 09:00". */
export function generateSlotsInRange(raw: unknown, days: number): CreneauSlot[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try { data = JSON.parse(t); } catch { data = t.split(/[\n,;]/).map(s => s.trim()).filter(Boolean); }
  }
  if (!Array.isArray(data)) return [];

  const out: CreneauSlot[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const item of data) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;

    const mIso = /^(\d{4}-\d{2}-\d{2})[T\s]+(\d{2}:\d{2})/.exec(t);
    if (mIso) {
      const d = new Date(mIso[1] + "T00:00:00");
      if (d >= today) out.push({ key: `iso-${t}`, dateRdv: mIso[1], heureRdv: mIso[2].slice(0, 5) });
      continue;
    }

    const mDay = /^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2}:\d{2})$/.exec(t);
    if (mDay) {
      const targetDow = FR_DAYS[mDay[1].toLowerCase().trim()];
      if (targetDow === undefined) continue;
      const heureRdv = mDay[2].padStart(5, "0");
      const [hh, mm] = heureRdv.split(":").map(Number);
      for (let offset = 0; offset < days; offset++) {
        const d = new Date(today); d.setDate(today.getDate() + offset);
        if (d.getDay() !== targetDow) continue;
        if (offset === 0 && hh * 60 + mm <= nowMinutes) continue;
        const dateRdv = toISODate(d);
        out.push({ key: `day-${dateRdv}-${heureRdv}`, dateRdv, heureRdv });
      }
      continue;
    }

    const mTime = /^(\d{1,2}:\d{2})$/.exec(t);
    if (mTime) {
      const heureRdv = mTime[1].padStart(5, "0");
      const [hh, mm] = heureRdv.split(":").map(Number);
      for (let offset = 0; offset < days; offset++) {
        const d = new Date(today); d.setDate(today.getDate() + offset);
        if (offset === 0 && hh * 60 + mm <= nowMinutes) continue;
        const dateRdv = toISODate(d);
        out.push({ key: `time-${dateRdv}-${heureRdv}`, dateRdv, heureRdv });
      }
    }
  }
  return out.sort((a, b) => (a.dateRdv + a.heureRdv).localeCompare(b.dateRdv + b.heureRdv));
}
