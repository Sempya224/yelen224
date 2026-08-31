// Validation d'URL externe (institutions.website) — chantier P0 Stored XSS,
// décision CEO 17/08/2026 (voir docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT_PHASE_0_5.md
// §1 pour la chaîne de preuve, §9 pour les règles). Allow-list stricte
// http/https appliquée sur `.protocol` APRÈS parsing réel par `URL` — jamais
// une regex/denylist sur la chaîne brute : "javascript://x" est
// syntaxiquement une URL valide (le "//" n'est qu'une convention de syntaxe,
// pas une garantie de schéma web), seul `.protocol` après parsing le
// distingue fiablement d'une vraie URL http(s).
//
// Deux fonctions à usage strictement différent, jamais interchangeables :
// - validerUrlExterne() : ÉCRITURE. Strict — refuse toute valeur sans schéma
//   explicite http(s)://, ne devine jamais. Force les nouvelles saisies à
//   être propres dès le départ (retour clair à l'utilisateur).
// - urlExterneSure() : AFFICHAGE. Tolère l'absence de schéma (retente avec
//   "https://" préfixé) pour ne jamais casser un `website` déjà en base
//   saisi avant ce chantier sans protocole (ex. "nimba-sms.com") — reste
//   strict sur le protocole final : javascript:/data:/file:/etc. sont
//   toujours rejetés, y compris via ce fallback ("https://" + "javascript:
//   alert(1)" ne produit jamais un hostname valide, donc jamais d'URL
//   valide au sens du parseur — échoue proprement).

const SCHEMES_AUTORISES = new Set(["http:", "https:"]);

export type UrlValidationResult =
  | { valid: true; url: string }
  | { valid: false; error: string };

/** Écriture (API institution : profil, inscription). Champ optionnel :
 * une chaîne vide/blanche est valide (rien à stocker). Toute valeur non
 * vide DOIT déjà contenir un schéma http:// ou https:// explicite. */
export function validerUrlExterne(input: string | null | undefined): UrlValidationResult {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return { valid: true, url: "" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Ce lien ne semble pas valide. Utilisez un format complet, par exemple https://exemple.com" };
  }

  if (!SCHEMES_AUTORISES.has(parsed.protocol)) {
    return { valid: false, error: "Seuls les liens commençant par http:// ou https:// sont acceptés." };
  }

  return { valid: true, url: parsed.toString() };
}

/** Affichage (rendu d'un `<a href>` à partir d'une valeur déjà en base,
 * potentiellement saisie avant ce chantier ou jamais validée). Ne throw
 * jamais, renvoie `null` si aucune interprétation http(s) valide n'est
 * possible — l'appelant doit alors ne PAS construire de lien cliquable. */
export function urlExterneSure(input: string | null | undefined): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;

  // Le fallback "https://" + valeur n'est tenté QUE si la chaîne originale
  // ne déclare déjà aucun schéma ("://" absent) — sinon on respecte le
  // schéma explicitement fourni (et on le rejette s'il n'est pas dans
  // l'allow-list, sans essayer de le "sauver").
  const tentatives = trimmed.includes("://") ? [trimmed] : [trimmed, `https://${trimmed}`];

  for (const tentative of tentatives) {
    try {
      const parsed = new URL(tentative);
      if (SCHEMES_AUTORISES.has(parsed.protocol)) return parsed.toString();
    } catch {
      // essai suivant
    }
  }

  return null;
}
