import { VILLES_GUINEE, type VilleGuinee } from "./villes";

// Coordonnées approximatives des 33 préfectures + Conakry (point de la
// capitale préfectorale, pas un centroïde administratif précis) — sourcées
// via recherche externe (Wikipédia, pages dédiées par ville) le 06/08/2026,
// recoupées avec plusieurs sources indépendantes pour les principales
// villes (Boké, Fria, Gaoual, Koundara, Dabola, Dinguiraye concordantes à
// ~0.01° près). Aucune coordonnée par institution n'existait déjà dans le
// projet (audit confirmé, y compris lib/guineeRegionsGeo.ts qui ne contient
// que des tracés de région déjà projetés, pas des points GPS).
//
// Usage strict : uniquement pour centrer PAR DÉFAUT la carte du sélecteur de
// position d'une institution (components/LocationPicker.tsx) sur la bonne
// ville avant que l'institution ne place elle-même son repère précis —
// jamais utilisé comme position finale d'une institution, jamais écrit dans
// institutions.latitude/longitude directement.
export const VILLE_COORDONNEES: Record<VilleGuinee, { lat: number; lng: number }> = {
  "Conakry": { lat: 9.517, lng: -13.700 },
  "Boké": { lat: 10.933, lng: -14.300 },
  "Boffa": { lat: 10.167, lng: -14.033 },
  "Fria": { lat: 10.450, lng: -13.533 },
  "Gaoual": { lat: 11.750, lng: -13.200 },
  "Koundara": { lat: 12.483, lng: -13.300 },
  "Dabola": { lat: 10.750, lng: -11.117 },
  "Dinguiraye": { lat: 11.300, lng: -10.717 },
  "Faranah": { lat: 10.033, lng: -10.733 },
  "Kissidougou": { lat: 9.183, lng: -10.100 },
  "Kankan": { lat: 10.383, lng: -9.300 },
  "Kérouané": { lat: 9.267, lng: -9.017 },
  "Kouroussa": { lat: 10.650, lng: -9.883 },
  "Mandiana": { lat: 10.633, lng: -8.683 },
  "Siguiri": { lat: 11.423, lng: -9.169 },
  "Coyah": { lat: 9.706, lng: -13.384 },
  "Dubréka": { lat: 9.792, lng: -13.523 },
  "Forécariah": { lat: 9.430, lng: -13.089 },
  "Kindia": { lat: 10.057, lng: -12.866 },
  "Télimélé": { lat: 10.905, lng: -13.043 },
  "Koubia": { lat: 11.583, lng: -11.900 },
  "Labé": { lat: 11.318, lng: -12.283 },
  "Lélouma": { lat: 11.183, lng: -12.483 },
  "Mali": { lat: 12.083, lng: -12.300 },
  "Tougué": { lat: 11.450, lng: -11.667 },
  "Dalaba": { lat: 10.683, lng: -12.250 },
  "Mamou": { lat: 10.375, lng: -12.091 },
  "Pita": { lat: 11.059, lng: -12.397 },
  "Beyla": { lat: 8.690, lng: -8.630 },
  "Guéckédou": { lat: 8.568, lng: -10.133 },
  "Lola": { lat: 7.800, lng: -8.533 },
  "Macenta": { lat: 8.542, lng: -9.470 },
  "Nzérékoré": { lat: 7.756, lng: -8.818 },
  "Yomou": { lat: 7.567, lng: -9.283 },
};

// Conakry — fallback ultime si la ville de l'institution n'est pas (encore)
// reconnue parmi VILLES_GUINEE.
export const GUINEE_CENTRE_DEFAUT = { lat: 9.6412, lng: -13.5784 };

export function coordonneesParVille(ville: string | null | undefined): { lat: number; lng: number } {
  if (ville && (VILLES_GUINEE as readonly string[]).includes(ville)) {
    return VILLE_COORDONNEES[ville as VilleGuinee];
  }
  return GUINEE_CENTRE_DEFAUT;
}
