// Taxonomie centralisée des équipements Hôtel (chantier "Équipements
// structurés", 21/08/2026, décision Bryan). Remplace, pour l'hôtellerie
// uniquement, le texte libre "Équipements & règles" (informations_importantes)
// par une donnée exploitable (recherche/filtres/comparaison à terme,
// affichage uniforme immédiatement). Booking.com a servi de référence de
// FORME (grille catégorisée, icône + libellé) — jamais de contenu copié :
// la liste ci-dessous est pensée pour la réalité des hôtels en Guinée
// (groupe électrogène/délestage, énergie solaire — pas pertinents dans un
// contexte occidental où Booking les omet).
//
// Séparation stricte établissement/chambre (retour Bryan 21/08/2026) : un
// groupe électrogène de l'hôtel ne veut pas dire que chaque chambre a la
// climatisation — deux listes, deux colonnes, jamais fusionnées.
// - ÉTABLISSEMENT → institutions.equipements_etablissement (jsonb, array
//   de codes) — coché une fois pour tout l'hôtel (ConfigurationHotelTab.tsx).
// - CHAMBRE → paid_services.equipements_chambre (jsonb, array de codes),
//   par chambre individuelle (ServicesHotelTab.tsx, ChambreForm).
//
// Source unique : dashboard (checklist de saisie) et fiche publique
// (grille d'affichage) importent exactement les mêmes codes/labels/
// catégories/icônes d'ici — jamais une 2e liste qui pourrait diverger.
// Les routes serveur (profile/route.ts, services/route.ts) importent
// uniquement les codes plats (*_CODES ci-dessous) pour valider — elles
// n'ont aucun besoin des icônes React.
import type { ReactNode } from "react";

export type EquipementItem = { code: string; label: string; icon: (color: string) => ReactNode };
export type EquipementCategorie = { id: string; label: string; items: EquipementItem[] };

// Icônes trait, un seul niveau de détail (même langage que
// IllustrationEquipe/EmptyState du dashboard institution) — stroke
// currentColor piloté par le paramètre `color`, jamais de fill plein.
const s = (color: string) => ({ stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" as const });

const Icon = {
  bolt: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"/></svg>,
  sun: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  plug: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M9 2v4M15 2v4M7 8h10l-1 6a4 4 0 0 1-4 4 4 4 0 0 1-4-4z"/><path d="M12 18v4"/></svg>,
  wifi: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M2 8.5a16 16 0 0 1 20 0"/><path d="M5.5 12.5a11 11 0 0 1 13 0"/><path d="M9 16.5a6 6 0 0 1 6 0"/><circle cx="12" cy="20" r="1" fill={c} stroke="none"/></svg>,
  restaurant: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M6 2v8a2 2 0 0 0 4 0V2M8 10v12M18 2c-2 0-3 3-3 6s1 4 3 4 3-1 3-4-1-6-3-6zM18 12v10"/></svg>,
  bar: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M4 3h16l-7 9v7h3M13 12v7H9"/></svg>,
  breakfast: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M4 8h13a3 3 0 0 1 0 6h-1"/><path d="M4 8v7a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8"/><path d="M7 2c-1 1-1 2 0 3M10 2c-1 1-1 2 0 3"/></svg>,
  roomService: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M3 19h18M4 19a8 8 0 0 1 16 0"/><circle cx="12" cy="6" r="1.4" fill={c} stroke="none"/><path d="M12 8v2"/></svg>,
  pool: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M2 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/><path d="M2 21c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/><path d="M7 13V4l10 4-6 3"/></svg>,
  garden: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M12 22V12"/><path d="M12 12C7 12 5 9 5 5c4 0 7 2 7 7z"/><path d="M12 12c5 0 7-3 7-7-4 0-7 2-7 7z"/></svg>,
  terrace: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M3 8l9-5 9 5"/><path d="M5 8v11M19 8v11M3 19h18"/><path d="M9 19v-6h6v6"/></svg>,
  conference: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>,
  gym: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M4 8v8M20 8v8"/><path d="M2 10v4M22 10v4"/><path d="M7 12h10"/><path d="M7 9v6M17 9v6"/></svg>,
  clock24: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  laundry: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M8 6h.01M11 6h.01"/></svg>,
  cleaning: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M15 3l6 6-9 9-6-6z"/><path d="M9 15l-5 5M4 21l1-3"/></svg>,
  parking: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 16V7h4a3 3 0 0 1 0 6H9"/></svg>,
  shuttle: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M3 16V9a2 2 0 0 1 2-2h9l4 4v5"/><path d="M3 16h15"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="16.5" cy="17.5" r="1.6"/></svg>,
  shield: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M12 21s8-3.5 8-10V6l-8-3-8 3v5c0 6.5 8 10 8 10z"/></svg>,
  cctv: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="2" y="8" width="12" height="7" rx="1.5"/><path d="M14 10l6-3v9l-6-3"/><path d="M6 15v2"/></svg>,
  extinguisher: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M10 8h5l3-4"/><rect x="8" y="8" width="7" height="13" rx="2"/><path d="M11 4h2v4h-2z"/></svg>,
  safe: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 10v4"/></svg>,
  ac: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M12 2v20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1M2 12h20"/></svg>,
  fan: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><circle cx="12" cy="12" r="1.4" fill={c} stroke="none"/><path d="M12 12c0-4 2-7 5-7s3 3 0 4-5 3-5 3zM12 12c-4 0-7 2-7 5s3 3 4 0 3-5 3-5zM12 12c4 0 7-2 7-5s-3-3-4 0-3 5-3 5z"/></svg>,
  drop: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>,
  tv: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>,
  fridge: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="6" y="2" width="12" height="20" rx="1.5"/><path d="M6 10h12M9 5v3M9 14v3"/></svg>,
  bath: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M5 12V7a2 2 0 0 1 3.5-1.3"/><path d="M4 19l-1 2M20 19l1 2"/></svg>,
  shower: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M6 8a6 6 0 0 1 12 0"/><path d="M4 8h16"/><path d="M8 12v1M12 12v1M16 12v1M8 16v1M12 16v1M16 16v1M8 20v1M12 20v1M16 20v1"/></svg>,
  tub: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M4 12V6a2 2 0 0 1 4 0"/><path d="M2 12h20v2a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z"/><path d="M4 19l-1 2M21 19l1 2"/></svg>,
  balcony: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="3" y="3" width="18" height="8" rx="1"/><path d="M5 11v10M19 11v10M5 21h14M5 15h14"/></svg>,
  desk: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><path d="M3 8h18M3 8v11M21 8v11M6 8v4h5V8"/></svg>,
  wardrobe: (c: string) => <svg width="18" height="18" viewBox="0 0 24 24" {...s(c)}><rect x="5" y="2" width="14" height="20" rx="1.5"/><path d="M12 2v20"/><circle cx="10" cy="12" r="0.8" fill={c} stroke="none"/><circle cx="14" cy="12" r="0.8" fill={c} stroke="none"/></svg>,
};

export const EQUIPEMENTS_ETABLISSEMENT: EquipementCategorie[] = [
  {
    id: "energie", label: "Énergie & continuité", items: [
      { code: "groupe_electrogene", label: "Groupe électrogène", icon: Icon.plug },
      { code: "energie_solaire", label: "Énergie solaire", icon: Icon.sun },
      { code: "alimentation_secours", label: "Alimentation de secours", icon: Icon.bolt },
    ],
  },
  {
    id: "connectivite", label: "Connectivité", items: [
      { code: "wifi", label: "Wi-Fi", icon: Icon.wifi },
    ],
  },
  {
    id: "restauration", label: "Restauration", items: [
      { code: "restaurant", label: "Restaurant", icon: Icon.restaurant },
      { code: "bar", label: "Bar", icon: Icon.bar },
      { code: "petit_dejeuner", label: "Petit-déjeuner", icon: Icon.breakfast },
      { code: "room_service", label: "Room service", icon: Icon.roomService },
    ],
  },
  {
    id: "installations", label: "Installations", items: [
      { code: "piscine", label: "Piscine", icon: Icon.pool },
      { code: "jardin", label: "Jardin", icon: Icon.garden },
      { code: "terrasse", label: "Terrasse", icon: Icon.terrace },
      { code: "salle_conference", label: "Salle de conférence", icon: Icon.conference },
      { code: "salle_sport", label: "Salle de sport", icon: Icon.gym },
    ],
  },
  {
    id: "services", label: "Services", items: [
      { code: "reception_24h", label: "Réception 24h/24", icon: Icon.clock24 },
      { code: "blanchisserie", label: "Blanchisserie", icon: Icon.laundry },
      { code: "menage", label: "Ménage", icon: Icon.cleaning },
      { code: "parking", label: "Parking", icon: Icon.parking },
      { code: "navette", label: "Navette", icon: Icon.shuttle },
    ],
  },
  {
    id: "securite", label: "Sécurité", items: [
      { code: "securite_24h", label: "Sécurité 24h/24", icon: Icon.shield },
      { code: "videosurveillance", label: "Vidéosurveillance", icon: Icon.cctv },
      { code: "extincteurs", label: "Extincteurs", icon: Icon.extinguisher },
      { code: "coffre_fort", label: "Coffre-fort", icon: Icon.safe },
    ],
  },
];

export const EQUIPEMENTS_CHAMBRE: EquipementCategorie[] = [
  {
    id: "confort", label: "Confort", items: [
      { code: "climatisation", label: "Climatisation", icon: Icon.ac },
      { code: "ventilateur", label: "Ventilateur", icon: Icon.fan },
      { code: "eau_chaude", label: "Eau chaude", icon: Icon.drop },
      { code: "tv", label: "TV", icon: Icon.tv },
      { code: "minibar", label: "Réfrigérateur / minibar", icon: Icon.fridge },
      { code: "coffre_fort", label: "Coffre-fort", icon: Icon.safe },
    ],
  },
  {
    id: "salle_bain", label: "Salle de bain", items: [
      { code: "salle_bain_privee", label: "Salle de bain privée", icon: Icon.bath },
      { code: "douche", label: "Douche", icon: Icon.shower },
      { code: "baignoire", label: "Baignoire", icon: Icon.tub },
    ],
  },
  {
    id: "chambre", label: "Chambre", items: [
      { code: "balcon", label: "Balcon", icon: Icon.balcony },
      { code: "bureau", label: "Bureau", icon: Icon.desk },
      { code: "armoire", label: "Armoire", icon: Icon.wardrobe },
    ],
  },
];

// Listes plates de codes valides — utilisées pour la validation serveur
// (profile/route.ts, services/route.ts) : import léger, aucune JSX
// nécessaire côté route.
export const CODES_EQUIPEMENTS_ETABLISSEMENT: string[] = EQUIPEMENTS_ETABLISSEMENT.flatMap(c => c.items.map(i => i.code));
export const CODES_EQUIPEMENTS_CHAMBRE: string[] = EQUIPEMENTS_CHAMBRE.flatMap(c => c.items.map(i => i.code));

function findItem(code: string, categories: EquipementCategorie[]): EquipementItem | null {
  for (const cat of categories) {
    const found = cat.items.find(i => i.code === code);
    if (found) return found;
  }
  return null;
}

export function labelEquipementEtablissement(code: string): string | null {
  return findItem(code, EQUIPEMENTS_ETABLISSEMENT)?.label ?? null;
}
export function labelEquipementChambre(code: string): string | null {
  return findItem(code, EQUIPEMENTS_CHAMBRE)?.label ?? null;
}
