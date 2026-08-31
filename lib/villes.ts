// Les 33 préfectures de Guinée (7 régions administratives) + Conakry (zone spéciale, capitale).
// Regroupées par région pour rester lisible, exportées à plat pour les <select>.
export const VILLES_GUINEE = [
  "Conakry",
  // Région de Boké
  "Boké", "Boffa", "Fria", "Gaoual", "Koundara",
  // Région de Faranah
  "Dabola", "Dinguiraye", "Faranah", "Kissidougou",
  // Région de Kankan
  "Kankan", "Kérouané", "Kouroussa", "Mandiana", "Siguiri",
  // Région de Kindia
  "Coyah", "Dubréka", "Forécariah", "Kindia", "Télimélé",
  // Région de Labé
  "Koubia", "Labé", "Lélouma", "Mali", "Tougué",
  // Région de Mamou
  "Dalaba", "Mamou", "Pita",
  // Région de Nzérékoré
  "Beyla", "Guéckédou", "Lola", "Macenta", "Nzérékoré", "Yomou",
] as const;

export type VilleGuinee = typeof VILLES_GUINEE[number];

// Rattachement préfecture → région administrative (même regroupement
// officiel que ci-dessus, rendu exploitable en code pour les agrégations
// géographiques du Centre d'Analyse — clés alignées sur RegionKey de
// lib/guineeRegionsGeo.ts).
export const REGION_PAR_VILLE: Record<string, string> = {
  Conakry: "conakry",
  Boké: "boke", Boffa: "boke", Fria: "boke", Gaoual: "boke", Koundara: "boke",
  Dabola: "faranah", Dinguiraye: "faranah", Faranah: "faranah", Kissidougou: "faranah",
  Kankan: "kankan", Kérouané: "kankan", Kouroussa: "kankan", Mandiana: "kankan", Siguiri: "kankan",
  Coyah: "kindia", Dubréka: "kindia", Forécariah: "kindia", Kindia: "kindia", Télimélé: "kindia",
  Koubia: "labe", Labé: "labe", Lélouma: "labe", Mali: "labe", Tougué: "labe",
  Dalaba: "mamou", Mamou: "mamou", Pita: "mamou",
  Beyla: "nzerekore", Guéckédou: "nzerekore", Lola: "nzerekore", Macenta: "nzerekore", Nzérékoré: "nzerekore", Yomou: "nzerekore",
};

export const REGIONS_GUINEE_LABELS: Record<string, string> = {
  conakry: "Conakry", boke: "Boké", faranah: "Faranah", kankan: "Kankan",
  kindia: "Kindia", labe: "Labé", mamou: "Mamou", nzerekore: "Nzérékoré",
};
