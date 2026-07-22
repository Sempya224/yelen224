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
