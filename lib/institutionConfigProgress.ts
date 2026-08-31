// Dérive l'état de complétion du Centre de configuration institution
// (Setup Center post-inscription) à partir des données réelles en base —
// jamais de variable frontend, jamais de table de progression dédiée.
// Fonctions pures, importables côté serveur (route API) et côté client
// (page.tsx), pour ne jamais avoir deux définitions divergentes de ce
// qu'est une étape "faite".

// Gère array direct et JSON string (mêmes formats que parseToRules côté
// DisponibilitesTab) — reprise à l'identique de la version déjà corrigée
// dans page.tsx (l'étape "Disponibilités" du bandeau de progression
// vérifiait auparavant !!inst.adresse, un champ sans rapport, au lieu de
// l'état réel des créneaux enregistrés).
export function hasDisponibilites(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

// Équivalent hôtel de hasDisponibilites() ci-dessus — l'onglet
// Disponibilités (créneaux horaires + durée en minutes) ne s'applique pas
// à l'hôtellerie (retour Bryan 21/08/2026, docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md) :
// la vraie notion "présence et horaires" pour un hôtel, ce sont les
// horaires Ouvert/Fermé publics (institutions.horaires, réglés dans
// Profil Entreprise), pas des créneaux de RDV. Structure Horaire[] :
// {jour, ouvert, debut, fin} (lib/disponibilites.ts, ProfilEntrepriseTab.tsx).
export function hasHorairesReception(raw: unknown): boolean {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return false; }
  }
  if (!Array.isArray(parsed)) return false;
  return parsed.some((h) => h && typeof h === "object" && (h as { ouvert?: unknown }).ouvert === true && !!(h as { debut?: unknown }).debut && !!(h as { fin?: unknown }).fin);
}
