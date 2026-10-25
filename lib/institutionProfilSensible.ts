// Politique de revérification des changements sensibles du profil
// d'établissement (docs/product/YELEN_REVERIFICATION_POLICY.md) — logique pure,
// sans accès base ni session, pour que api/institution/profile (route.ts) reste
// lisible et testable. La source de vérité du diff est la fonction SQL
// appliquer_modifications_sensibles (recalculée sous verrou) : le calcul d'ici
// ne sert qu'à répondre tôt 403 REAUTH_REQUIRED, avant toute écriture.

// Clés du corps de requête transmises à la fonction SQL (niveau B + activités
// secondaires, qui voyagent avec l'activité principale mais restent de niveau A).
export const CLES_RPC_PROFIL = [
  "name", "ville", "adresse", "latitude", "longitude",
  "activite_categorie_id", "activite_principale_id", "activites_secondaires_ids",
] as const;
export type CleRpcProfil = (typeof CLES_RPC_PROFIL)[number];
const CLES_RPC_SET: ReadonlySet<string> = new Set(CLES_RPC_PROFIL);
export function estCleRpcProfil(cle: string): cle is CleRpcProfil {
  return CLES_RPC_SET.has(cle);
}

export type ChampSensible = "name" | "ville" | "adresse" | "coordonnees" | "activite";

export type ProfilSensibleActuel = {
  name: string | null;
  ville: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  activite_categorie_id: string | null;
  activite_principale_id: string | null;
};

// Miroir de public.normaliser_texte_profil : NFC, espaces réduits, trim,
// insensible à la casse. Un accent différent reste une vraie différence.
export function normaliserTexteProfil(valeur: unknown): string {
  if (typeof valeur !== "string") return "";
  return valeur.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

// 6 décimales ≈ 0,1 m — même seuil que la fonction SQL.
function arrondi6(n: number | null): number | null {
  return n === null ? null : Math.round(n * 1e6) / 1e6;
}

// Coordonnée reçue du client → nombre ou null ; undefined si non convertible
// (la route répond alors 400, jamais de cast SQL qui échouerait en 500).
export function versCoordonnee(valeur: unknown): number | null | undefined {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === "string") {
    if (valeur.trim() === "") return null;
    const n = Number(valeur);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : undefined;
  return undefined;
}

function idOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur !== "" ? valeur : null;
}

export function champsSensiblesModifies(
  actuel: ProfilSensibleActuel,
  champs: Partial<Record<CleRpcProfil, unknown>>
): ChampSensible[] {
  const modifies: ChampSensible[] = [];

  if ("name" in champs && normaliserTexteProfil(champs.name) !== normaliserTexteProfil(actuel.name)) modifies.push("name");
  if ("ville" in champs && normaliserTexteProfil(champs.ville) !== normaliserTexteProfil(actuel.ville)) modifies.push("ville");
  if ("adresse" in champs && normaliserTexteProfil(champs.adresse) !== normaliserTexteProfil(actuel.adresse)) modifies.push("adresse");

  if ("latitude" in champs || "longitude" in champs) {
    const lat = "latitude" in champs ? (versCoordonnee(champs.latitude) ?? null) : actuel.latitude;
    const lng = "longitude" in champs ? (versCoordonnee(champs.longitude) ?? null) : actuel.longitude;
    if (arrondi6(lat) !== arrondi6(actuel.latitude) || arrondi6(lng) !== arrondi6(actuel.longitude)) modifies.push("coordonnees");
  }

  if ("activite_categorie_id" in champs || "activite_principale_id" in champs) {
    const cat = "activite_categorie_id" in champs ? idOuNull(champs.activite_categorie_id) : actuel.activite_categorie_id;
    const princ = "activite_principale_id" in champs ? idOuNull(champs.activite_principale_id) : actuel.activite_principale_id;
    if (cat !== actuel.activite_categorie_id || princ !== actuel.activite_principale_id) modifies.push("activite");
  }

  return modifies;
}

// Erreur dédiée levée par la fonction SQL quand la réauthentification n'est
// plus valide en base (SQLSTATE YR001, message REAUTH_REQUIRED).
export function estErreurReauthRpc(erreur: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erreur) return false;
  return erreur.code === "YR001" || (erreur.message ?? "").includes("REAUTH_REQUIRED");
}

export type DemandeCreee = { numero: string; champ: string };

// Réponse jsonb de la fonction SQL → liste sûre (jamais les identifiants).
export function extraireDemandesCreees(data: unknown): DemandeCreee[] {
  if (typeof data !== "object" || data === null) return [];
  const demandes = (data as { demandes?: unknown }).demandes;
  if (!Array.isArray(demandes)) return [];
  const resultat: DemandeCreee[] = [];
  for (const d of demandes) {
    if (typeof d === "object" && d !== null) {
      const { numero, champ } = d as { numero?: unknown; champ?: unknown };
      if (typeof numero === "string" && typeof champ === "string") resultat.push({ numero, champ });
    }
  }
  return resultat;
}

export type DemandeCreeeAvecId = DemandeCreee & { id: string };

// Variante pour le journal d'activité interne : garde l'identifiant de la demande
// (cible de la ligne de journal) — jamais renvoyée au client.
export function extraireDemandesAvecId(data: unknown): DemandeCreeeAvecId[] {
  if (typeof data !== "object" || data === null) return [];
  const demandes = (data as { demandes?: unknown }).demandes;
  if (!Array.isArray(demandes)) return [];
  const resultat: DemandeCreeeAvecId[] = [];
  for (const d of demandes) {
    if (typeof d === "object" && d !== null) {
      const { id, numero, champ } = d as { id?: unknown; numero?: unknown; champ?: unknown };
      if (typeof id === "string" && typeof numero === "string" && typeof champ === "string") resultat.push({ id, numero, champ });
    }
  }
  return resultat;
}

// Valeurs avant / après d'un champ logique pour le journal d'activité. Seules
// les valeurs du champ concerné sont retenues (jamais le corps entier de la requête).
export function valeursAvantApres(
  champ: string,
  actuel: ProfilSensibleActuel,
  champs: Partial<Record<CleRpcProfil, unknown>>
): { avant: Record<string, unknown>; apres: Record<string, unknown> } | null {
  switch (champ) {
    case "name":
    case "ville":
    case "adresse":
      return { avant: { [champ]: actuel[champ] }, apres: { [champ]: champs[champ] ?? null } };
    case "coordonnees":
      return {
        avant: { latitude: actuel.latitude, longitude: actuel.longitude },
        apres: {
          latitude: "latitude" in champs ? (versCoordonnee(champs.latitude) ?? null) : actuel.latitude,
          longitude: "longitude" in champs ? (versCoordonnee(champs.longitude) ?? null) : actuel.longitude,
        },
      };
    case "activite":
      return {
        avant: { activite_categorie_id: actuel.activite_categorie_id, activite_principale_id: actuel.activite_principale_id },
        apres: {
          activite_categorie_id: "activite_categorie_id" in champs ? idOuNull(champs.activite_categorie_id) : actuel.activite_categorie_id,
          activite_principale_id: "activite_principale_id" in champs ? idOuNull(champs.activite_principale_id) : actuel.activite_principale_id,
        },
      };
    default:
      return null;
  }
}

// ── Publication différée (docs/product/YELEN_REVERIFICATION_POLICY.md) ───────
// institutions.* = valeurs PUBLIÉES (celles que voit le citoyen). Pour un
// établissement validé, un changement sensible reste une proposition
// (institution_change_requests, état a_examiner) jusqu'à la décision d'un admin.
// L'établissement, lui, voit SA proposition dans son espace : valeur effective =
// valeur publiée, surchargée par les propositions en attente.
export type PropositionEnAttente = { champ: string; nouvelle_valeur: unknown };

function objetOuNull(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null;
}
function texteOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" ? valeur : null;
}
function nombreOuNull(valeur: unknown): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

export function appliquerPropositions(publie: ProfilSensibleActuel, propositions: readonly PropositionEnAttente[]): ProfilSensibleActuel {
  const effectif: ProfilSensibleActuel = { ...publie };
  for (const p of propositions) {
    switch (p.champ) {
      case "name": effectif.name = texteOuNull(p.nouvelle_valeur); break;
      case "ville": effectif.ville = texteOuNull(p.nouvelle_valeur); break;
      case "adresse": effectif.adresse = texteOuNull(p.nouvelle_valeur); break;
      case "coordonnees": {
        const o = objetOuNull(p.nouvelle_valeur);
        if (o) { effectif.latitude = nombreOuNull(o.latitude); effectif.longitude = nombreOuNull(o.longitude); }
        break;
      }
      case "activite": {
        const o = objetOuNull(p.nouvelle_valeur);
        if (o) { effectif.activite_categorie_id = texteOuNull(o.activite_categorie_id); effectif.activite_principale_id = texteOuNull(o.activite_principale_id); }
        break;
      }
      default: break;
    }
  }
  return effectif;
}

// Champs logiques ayant une proposition en attente (affichage « en attente »).
export function champsEnAttente(propositions: readonly PropositionEnAttente[]): string[] {
  return [...new Set(propositions.map(p => p.champ))];
}

// Réponse jsonb de la fonction SQL : champs appliqués directement (établissement
// non encore public) ou propositions retirées (remplacées / retour à la valeur publiée).
export function extraireListeChamps(data: unknown, cle: "appliquees" | "retirees"): string[] {
  if (typeof data !== "object" || data === null) return [];
  const liste = (data as Record<string, unknown>)[cle];
  return Array.isArray(liste) ? liste.filter((c): c is string => typeof c === "string") : [];
}
