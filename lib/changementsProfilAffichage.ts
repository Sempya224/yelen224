// Mise en forme (admin) des valeurs avant/après d'une demande d'examen de
// changement de profil — logique pure. Les valeurs sont stockées en jsonb
// (institution_change_requests.ancienne_valeur / nouvelle_valeur) : chaîne pour
// name/ville/adresse, {latitude, longitude} pour coordonnees,
// {activite_categorie_id, activite_principale_id} pour activite. Pour
// l'activité, les identifiants sont traduits en libellés par l'appelant
// (requêtes séparées, jamais d'embed PostgREST).

export type ChampDemande = "name" | "ville" | "adresse" | "coordonnees" | "activite";

export const LIBELLE_CHAMP: Record<ChampDemande, string> = {
  name: "Nom",
  ville: "Ville",
  adresse: "Adresse",
  coordonnees: "Coordonnées",
  activite: "Catégorie et activité",
};

export function estChampDemande(valeur: unknown): valeur is ChampDemande {
  return typeof valeur === "string" && valeur in LIBELLE_CHAMP;
}

export type LibellesActivite = {
  categories: ReadonlyMap<string, string>;
  activites: ReadonlyMap<string, string>;
};

function formaterCoordonnee(valeur: unknown): string {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur.toFixed(6) : "—";
}

function objet(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null;
}

export function formaterValeurDemande(champ: ChampDemande, valeur: unknown, libelles: LibellesActivite): string {
  if (champ === "coordonnees") {
    const o = objet(valeur);
    if (!o) return "—";
    return `${formaterCoordonnee(o.latitude)}, ${formaterCoordonnee(o.longitude)}`;
  }
  if (champ === "activite") {
    const o = objet(valeur);
    if (!o) return "—";
    const categorie = typeof o.activite_categorie_id === "string" ? libelles.categories.get(o.activite_categorie_id) : undefined;
    const activite = typeof o.activite_principale_id === "string" ? libelles.activites.get(o.activite_principale_id) : undefined;
    if (!categorie && !activite) return "—";
    return [categorie ?? "Catégorie inconnue", activite ?? "Activité inconnue"].join(" › ");
  }
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur : "—";
}

// Identifiants à traduire en libellés pour un ensemble de demandes.
export function idsActiviteReferences(valeurs: unknown[]): { categories: string[]; activites: string[] } {
  const categories = new Set<string>();
  const activites = new Set<string>();
  for (const v of valeurs) {
    const o = objet(v);
    if (!o) continue;
    if (typeof o.activite_categorie_id === "string") categories.add(o.activite_categorie_id);
    if (typeof o.activite_principale_id === "string") activites.add(o.activite_principale_id);
  }
  return { categories: [...categories], activites: [...activites] };
}

const COMMENTAIRE_NOTIF_MAX = 300;

// Texte de la notification envoyée à l'établissement quand l'équipe Yelen a
// examiné une demande (docs/product/YELEN_REVERIFICATION_POLICY.md §3).
// « conforme » : rien à faire. « a_corriger » : le commentaire est repris tel
// quel (tronqué) — la correction reste une action explicite du responsable.
export function composerMessageExamen(champ: string, decision: "conforme" | "a_corriger", commentaire: string | null): string {
  const libelle = estChampDemande(champ) ? LIBELLE_CHAMP[champ] : "profil";
  if (decision === "conforme") {
    return `L'équipe Yelen a approuvé votre modification (${libelle}) : elle est maintenant visible par les citoyens. Aucune action n'est nécessaire de votre part.`;
  }
  const texte = (commentaire ?? "").trim();
  const extrait = texte.length > COMMENTAIRE_NOTIF_MAX ? `${texte.slice(0, COMMENTAIRE_NOTIF_MAX).trimEnd()}…` : texte;
  return `L'équipe Yelen n'a pas publié votre modification (${libelle}) : « ${extrait} ». Les citoyens continuent de voir l'information précédente. Vous pouvez proposer une nouvelle valeur dans Entreprise.`;
}

// ── Compléments répétables (Lot 2) ───────────────────────────────────────────
// Journal d'échanges d'une demande ouverte : l'admin demande un complément
// (`complement_demande`), l'établissement répond (`complement_fourni`), et ainsi
// de suite autant de fois que nécessaire. L'état se DÉDUIT du dernier événement.
export type TypeEvenementDemande = "complement_demande" | "complement_fourni" | "acces_restreint" | "relance_envoyee";

// Relance automatique des propositions anciennes : paliers d'inactivité (jours) à
// partir desquels l'établissement est relancé. DOIT rester aligné sur la fonction
// SQL relancer_propositions_anciennes (migration 20261020000005), vérifié par test.
export const PALIERS_RELANCE_JOURS = [7, 14] as const;

// Palier atteint pour une inactivité donnée (0 = aucun).
export function palierRelance(joursInactivite: number): 0 | 7 | 14 {
  if (joursInactivite >= PALIERS_RELANCE_JOURS[1]) return 14;
  if (joursInactivite >= PALIERS_RELANCE_JOURS[0]) return 7;
  return 0;
}

// Libellé de la chronologie admin pour un événement « relance_envoyee » dont le
// message est le marqueur SQL (relance_7j / relance_14j).
export function libelleRelance(marqueur: string | null): string {
  const jours = /^relance_(\d+)j$/.exec(marqueur ?? "")?.[1];
  return jours ? `Relance automatique envoyée à l'établissement (${jours} jours sans activité)` : "Relance automatique envoyée à l'établissement";
}
export type EvenementDemande = { type: TypeEvenementDemande; created_at: string };

export type EtatComplement = "aucun" | "demande" | "fourni";

// Seuls les événements de complément comptent : une restriction d'accès
// (« acces_restreint », Lot 3) ne change pas l'état d'un échange en cours.
export function etatComplement(evenements: readonly EvenementDemande[]): EtatComplement {
  const complements = evenements.filter(e => e.type === "complement_demande" || e.type === "complement_fourni");
  if (complements.length === 0) return "aucun";
  const dernier = [...complements].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  return dernier?.type === "complement_demande" ? "demande" : "fourni";
}

const MOTIF_NOTIF_MAX = 300;

// Notification envoyée à l'établissement quand l'équipe Yelen demande un complément.
export function composerMessageComplement(champ: string, motif: string, typesDocumentsLibelles: readonly string[]): string {
  const libelle = estChampDemande(champ) ? LIBELLE_CHAMP[champ] : "profil";
  const texte = motif.trim();
  const extrait = texte.length > MOTIF_NOTIF_MAX ? `${texte.slice(0, MOTIF_NOTIF_MAX).trimEnd()}…` : texte;
  const pieces = typesDocumentsLibelles.length > 0 ? ` Documents attendus : ${typesDocumentsLibelles.join(", ")}.` : "";
  return `L'équipe Yelen demande un complément pour votre modification (${libelle}) : « ${extrait} ».${pieces} Déposez les pièces dans l'onglet Documents, puis répondez depuis l'écran Entreprise. Les citoyens continuent de voir l'information précédente.`;
}

// ── Restriction d'accès (Lot 3) ──────────────────────────────────────────────
const MOTIF_RESTRICTION_NOTIF_MAX = 300;

// Notification envoyée à l'établissement quand l'accès citoyen est restreint à la
// suite de l'examen d'une de ses propositions. Reprend la logique de la suspension
// existante (référence, durée, voie de révision) et nomme la demande concernée.
export function composerMessageRestriction(champ: string, motif: string, reference: string, jusquAu: string | null): string {
  const libelle = estChampDemande(champ) ? LIBELLE_CHAMP[champ] : "profil";
  const texte = motif.trim();
  const extrait = texte.length > MOTIF_RESTRICTION_NOTIF_MAX ? `${texte.slice(0, MOTIF_RESTRICTION_NOTIF_MAX).trimEnd()}…` : texte;
  const fin = jusquAu ? ` jusqu'au ${new Date(jusquAu).toLocaleDateString("fr-FR")}` : " jusqu'à nouvel ordre";
  return `À la suite de l'examen de votre modification (${libelle}), l'équipe Yelen a restreint l'accès citoyen à votre établissement${fin}. Motif : « ${extrait} ». Vous n'êtes plus visible par les citoyens tant que cette restriction n'est pas levée. Référence : ${reference}. Vous pouvez demander une révision depuis votre espace.`;
}
