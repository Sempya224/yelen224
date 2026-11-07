// Secret des jetons de défi WebAuthn citoyen (4 routes
// app/api/citoyen/securite/webauthn/*). Lu à l'appel, jamais au chargement du
// module : une variable absente ne doit pas faire planter le build ni se
// transformer en clé vide silencieuse (TextEncoder.encode(undefined) renvoie
// un tableau vide, que jose rejette seulement au moment de signer).
// Secret dédié : jamais réutilisé depuis ADMIN_JWT_SECRET ou INSTITUTION_JWT_SECRET
// (systèmes d'auth distincts).
export const WEBAUTHN_SECRET_MIN_LENGTH = 32;

export class WebAuthnSecretError extends Error {
  constructor(public readonly raison: "absent" | "trop_court") {
    super(
      raison === "absent"
        ? "CITOYEN_WEBAUTHN_JWT_SECRET manquant."
        : `CITOYEN_WEBAUTHN_JWT_SECRET trop court (minimum ${WEBAUTHN_SECRET_MIN_LENGTH} caractères).`,
    );
    this.name = "WebAuthnSecretError";
  }
}

export function getWebAuthnJwtSecret(): Uint8Array {
  const valeur = process.env.CITOYEN_WEBAUTHN_JWT_SECRET;
  if (!valeur) throw new WebAuthnSecretError("absent");
  if (valeur.length < WEBAUTHN_SECRET_MIN_LENGTH) throw new WebAuthnSecretError("trop_court");
  return new TextEncoder().encode(valeur);
}

// Point d'entrée des 4 routes : soit le secret, soit une réponse 503
// générique côté client. Le détail reste dans les logs serveur (jamais la
// valeur du secret, seulement la raison).
export function chargerSecretWebAuthn(): { secret: Uint8Array } | { reponse: Response } {
  try {
    return { secret: getWebAuthnJwtSecret() };
  } catch (e) {
    if (!(e instanceof WebAuthnSecretError)) throw e;
    console.error(`[webauthn-citoyen] ${e.message}`);
    return {
      reponse: Response.json(
        { error: "Service temporairement indisponible.", code: "WEBAUTHN_INDISPONIBLE" },
        { status: 503 },
      ),
    };
  }
}
