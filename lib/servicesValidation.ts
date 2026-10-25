// Validation du corps des routes POST/PATCH /api/institution/services
// (Lot 1a, API Services). Module PUR, testé : aucune valeur invalide n'est
// plus ignorée ni effacée en silence — une valeur fournie mais invalide
// renvoie un échec avec code stable et message français. Une valeur
// explicitement null (champ facultatif) reste un effacement volontaire.
//
// prix_promo / promo_actif : jamais lus ici (la promo n'est appliquée nulle
// part côté citoyen — décision Lot 1a). est_chambre : fixé à la création
// seulement, immuable ensuite (ignoré en modification).

export const SERVICE_LIMITES = {
  PRIX_MAX: 100_000_000,
  DUREE_MIN: 1,
  DUREE_MAX: 1440,
  NOM_MAX: 120,
  DESCRIPTION_MAX: 2000,
  DESCRIPTION_COURTE_MAX: 300,
  A_SAVOIR_MAX: 2000,
  TAXE_MAX: 100,
  CATEGORIE_MAX: 80,
  UNITE_PRIX_MAX: 40,
  LOCALISATION_MAX: 120,
  URL_MAX: 500,
  NOMBRE_UNITES_MAX: 1000,
  CAPACITE_MAX: 1000,
  SUPERFICIE_MAX: 9999.99,
  CHAMPS_COMPLEMENTAIRES_MAX: 10,
  CHAMP_LABEL_MAX: 80,
  HORAIRES_MAX: 7,
  PHOTOS_MAX: 5,
  LISTE_TEXTE_MAX: 20,
} as const;

export type CodeErreurService =
  | "CORPS_INVALIDE" | "CORPS_VIDE" | "NOM_INVALIDE" | "PRIX_INVALIDE" | "DUREE_INVALIDE"
  | "DESCRIPTION_TROP_LONGUE" | "TAXE_INVALIDE" | "CATEGORIE_INVALIDE" | "NOMBRE_UNITES_INVALIDE"
  | "CAPACITE_INVALIDE" | "SUPERFICIE_INVALIDE" | "CHAMP_INVALIDE";

const MESSAGES: Record<CodeErreurService, string> = {
  CORPS_INVALIDE: "La requête est invalide.",
  CORPS_VIDE: "Aucune modification à enregistrer.",
  NOM_INVALIDE: `Le nom du service est obligatoire (1 à ${SERVICE_LIMITES.NOM_MAX} caractères).`,
  PRIX_INVALIDE: `Le prix doit être un nombre entier supérieur à 0 et inférieur ou égal à ${SERVICE_LIMITES.PRIX_MAX.toLocaleString("fr-FR")}.`,
  DUREE_INVALIDE: `La durée doit être un nombre entier de minutes entre ${SERVICE_LIMITES.DUREE_MIN} et ${SERVICE_LIMITES.DUREE_MAX}.`,
  DESCRIPTION_TROP_LONGUE: "Un des textes de description est trop long.",
  TAXE_INVALIDE: `Le taux de taxe doit être un nombre compris entre 0 et ${SERVICE_LIMITES.TAXE_MAX}.`,
  CATEGORIE_INVALIDE: `La catégorie ne doit pas dépasser ${SERVICE_LIMITES.CATEGORIE_MAX} caractères.`,
  NOMBRE_UNITES_INVALIDE: `Le nombre d'unités doit être un entier entre 1 et ${SERVICE_LIMITES.NOMBRE_UNITES_MAX}.`,
  CAPACITE_INVALIDE: `La capacité doit être un nombre entier entre 0 et ${SERVICE_LIMITES.CAPACITE_MAX} (au moins 1 pour la capacité maximale).`,
  SUPERFICIE_INVALIDE: `La superficie doit être un nombre supérieur à 0 et inférieur ou égal à ${SERVICE_LIMITES.SUPERFICIE_MAX} m².`,
  CHAMP_INVALIDE: "Une des valeurs envoyées est invalide.",
};

export type ResultatValidationService =
  | { ok: true; champs: Record<string, unknown> }
  | { ok: false; code: CodeErreurService; message: string };

function echec(code: CodeErreurService, message?: string): ResultatValidationService {
  return { ok: false, code, message: message ?? MESSAGES[code] };
}

const TYPES_PRESTATION = ["reservable", "commandable", "supplement", "horaires_limites", "inclus", "sur_demande", "indisponible"];
const PUBLIC_CIBLE_VALEURS = ["individuel", "couple", "famille", "groupe"];
const TYPES_CHAMP = ["texte", "tel", "numero"];

function estEntierDans(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

// Texte libre, éventuellement vide (→ null). `undefined` n'arrive jamais ici.
function texteNullable(v: unknown, max: number): { ok: true; valeur: string | null } | { ok: false; tropLong: boolean } {
  if (v === null) return { ok: true, valeur: null };
  if (typeof v !== "string") return { ok: false, tropLong: false };
  const t = v.trim();
  if (t.length > max) return { ok: false, tropLong: true };
  return { ok: true, valeur: t === "" ? null : t };
}

function listeTexteLibre(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.filter((v): v is string => typeof v === "string" && v.trim() !== "").map(v => v.trim());
  return [...new Set(items)].slice(0, SERVICE_LIMITES.LISTE_TEXTE_MAX);
}

function champsComplementairesValides(raw: unknown): { label: string; type: string; requis: boolean }[] | null {
  if (!Array.isArray(raw) || raw.length > SERVICE_LIMITES.CHAMPS_COMPLEMENTAIRES_MAX) return null;
  const out: { label: string; type: string; requis: boolean }[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") return null;
    const { label, type, requis } = c as Record<string, unknown>;
    if (typeof label !== "string" || label.trim() === "" || label.trim().length > SERVICE_LIMITES.CHAMP_LABEL_MAX) return null;
    if (typeof type !== "string" || !TYPES_CHAMP.includes(type)) return null;
    if (typeof requis !== "boolean") return null;
    out.push({ label: label.trim(), type, requis });
  }
  return out;
}

export function validerChampsService(
  body: unknown,
  mode: "creation" | "modification",
  options: { codesEquipementsValides: readonly string[] },
): ResultatValidationService {
  if (!body || typeof body !== "object" || Array.isArray(body)) return echec("CORPS_INVALIDE");
  const b = body as Record<string, unknown>;
  const creation = mode === "creation";
  const champs: Record<string, unknown> = {};
  const fourni = (k: string) => b[k] !== undefined;

  if (creation || fourni("nom")) {
    const nom = typeof b.nom === "string" ? b.nom.trim() : "";
    if (nom.length < 1 || nom.length > SERVICE_LIMITES.NOM_MAX) return echec("NOM_INVALIDE");
    champs.nom = nom;
  }
  if (creation || fourni("prix")) {
    if (!estEntierDans(b.prix, 1, SERVICE_LIMITES.PRIX_MAX)) return echec("PRIX_INVALIDE");
    champs.prix = b.prix;
  }
  if (creation || fourni("duree_minutes")) {
    if (!estEntierDans(b.duree_minutes, SERVICE_LIMITES.DUREE_MIN, SERVICE_LIMITES.DUREE_MAX)) return echec("DUREE_INVALIDE");
    champs.duree_minutes = b.duree_minutes;
  }

  // Textes descriptifs : trop long → DESCRIPTION_TROP_LONGUE, autre type → CHAMP_INVALIDE.
  const textesDescriptifs: [string, number][] = [
    ["description", SERVICE_LIMITES.DESCRIPTION_MAX],
    ["description_courte", SERVICE_LIMITES.DESCRIPTION_COURTE_MAX],
    ["a_savoir", SERVICE_LIMITES.A_SAVOIR_MAX],
  ];
  for (const [cle, max] of textesDescriptifs) {
    if (fourni(cle)) {
      const r = texteNullable(b[cle], max);
      if (!r.ok) return r.tropLong ? echec("DESCRIPTION_TROP_LONGUE") : echec("CHAMP_INVALIDE");
      champs[cle] = r.valeur;
    } else if (creation) champs[cle] = null;
  }

  if (fourni("categorie")) {
    const r = texteNullable(b.categorie, SERVICE_LIMITES.CATEGORIE_MAX);
    if (!r.ok) return echec("CATEGORIE_INVALIDE");
    champs.categorie = r.valeur;
  } else if (creation) champs.categorie = null;

  const textesCourts: [string, number][] = [
    ["unite_prix", SERVICE_LIMITES.UNITE_PRIX_MAX],
    ["localisation", SERVICE_LIMITES.LOCALISATION_MAX],
    ["video_url", SERVICE_LIMITES.URL_MAX],
  ];
  for (const [cle, max] of textesCourts) {
    if (fourni(cle)) {
      const r = texteNullable(b[cle], max);
      if (!r.ok) return echec("CHAMP_INVALIDE");
      champs[cle] = r.valeur;
    } else if (creation) champs[cle] = null;
  }

  if (fourni("taux_taxe")) {
    const t = b.taux_taxe;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > SERVICE_LIMITES.TAXE_MAX) return echec("TAXE_INVALIDE");
    champs.taux_taxe = t;
  } else if (creation) champs.taux_taxe = 0;

  if (fourni("champs_complementaires")) {
    const c = champsComplementairesValides(b.champs_complementaires);
    if (c === null) return echec("CHAMP_INVALIDE", "Les informations demandées au citoyen sont invalides (10 champs maximum, libellé obligatoire).");
    champs.champs_complementaires = c;
  } else if (creation) champs.champs_complementaires = [];

  if (fourni("is_active")) {
    if (typeof b.is_active !== "boolean") return echec("CHAMP_INVALIDE");
    champs.is_active = b.is_active;
  } else if (creation) champs.is_active = true;

  if (fourni("type_prestation")) {
    if (b.type_prestation !== null && (typeof b.type_prestation !== "string" || !TYPES_PRESTATION.includes(b.type_prestation))) return echec("CHAMP_INVALIDE");
    champs.type_prestation = b.type_prestation;
  } else if (creation) champs.type_prestation = null;

  if (fourni("horaires")) {
    if (b.horaires !== null && (!Array.isArray(b.horaires) || b.horaires.length > SERVICE_LIMITES.HORAIRES_MAX || b.horaires.some(h => !h || typeof h !== "object"))) return echec("CHAMP_INVALIDE");
    champs.horaires = Array.isArray(b.horaires) && b.horaires.length > 0 ? b.horaires : null;
  } else if (creation) champs.horaires = null;

  // est_chambre : posé à la création seulement (immuable ensuite).
  if (creation) {
    if (b.est_chambre !== undefined && typeof b.est_chambre !== "boolean") return echec("CHAMP_INVALIDE");
    champs.est_chambre = b.est_chambre === true;
  }

  if (fourni("photos")) {
    if (!Array.isArray(b.photos)) return echec("CHAMP_INVALIDE");
    champs.photos = b.photos
      .filter((p): p is string => typeof p === "string" && p.trim() !== "" && p.length <= SERVICE_LIMITES.URL_MAX)
      .slice(0, SERVICE_LIMITES.PHOTOS_MAX);
  } else if (creation) champs.photos = [];

  if (fourni("video_duree_secondes")) {
    const d = b.video_duree_secondes;
    if (d !== null && (typeof d !== "number" || !Number.isFinite(d) || d <= 0)) return echec("CHAMP_INVALIDE");
    champs.video_duree_secondes = d === null ? null : Math.round(d);
  } else if (creation) champs.video_duree_secondes = null;

  if (fourni("equipements_chambre")) {
    const e = b.equipements_chambre;
    if (e !== null && !Array.isArray(e)) return echec("CHAMP_INVALIDE");
    champs.equipements_chambre = Array.isArray(e)
      ? [...new Set(e.filter((code): code is string => typeof code === "string" && options.codesEquipementsValides.includes(code)))]
      : null;
  } else if (creation) champs.equipements_chambre = null;

  if (fourni("nombre_unites")) {
    if (b.nombre_unites !== null && !estEntierDans(b.nombre_unites, 1, SERVICE_LIMITES.NOMBRE_UNITES_MAX)) return echec("NOMBRE_UNITES_INVALIDE");
    champs.nombre_unites = b.nombre_unites;
  } else if (creation) champs.nombre_unites = null;

  if (fourni("capacite_max")) {
    if (b.capacite_max !== null && !estEntierDans(b.capacite_max, 1, SERVICE_LIMITES.CAPACITE_MAX)) return echec("CAPACITE_INVALIDE");
    champs.capacite_max = b.capacite_max;
  } else if (creation) champs.capacite_max = null;
  for (const cle of ["capacite_adultes", "capacite_enfants"] as const) {
    if (fourni(cle)) {
      if (b[cle] !== null && !estEntierDans(b[cle], 0, SERVICE_LIMITES.CAPACITE_MAX)) return echec("CAPACITE_INVALIDE");
      champs[cle] = b[cle];
    } else if (creation) champs[cle] = null;
  }

  if (fourni("superficie_m2")) {
    const s = b.superficie_m2;
    if (s !== null && (typeof s !== "number" || !Number.isFinite(s) || s <= 0 || s > SERVICE_LIMITES.SUPERFICIE_MAX)) return echec("SUPERFICIE_INVALIDE");
    champs.superficie_m2 = s;
  } else if (creation) champs.superficie_m2 = null;

  for (const cle of ["inclus", "non_inclus"] as const) {
    if (fourni(cle)) {
      if (!Array.isArray(b[cle])) return echec("CHAMP_INVALIDE");
      champs[cle] = listeTexteLibre(b[cle]);
    } else if (creation) champs[cle] = [];
  }
  if (fourni("public_cible")) {
    if (!Array.isArray(b.public_cible)) return echec("CHAMP_INVALIDE");
    champs.public_cible = [...new Set(b.public_cible.filter((v): v is string => typeof v === "string" && PUBLIC_CIBLE_VALEURS.includes(v)))];
  } else if (creation) champs.public_cible = [];

  if (!creation && Object.keys(champs).length === 0) return echec("CORPS_VIDE");
  return { ok: true, champs };
}
