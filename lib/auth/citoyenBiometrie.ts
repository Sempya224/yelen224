import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/lib/supabase";

// WebAuthn citoyen réel, vérifié serveur (Lot C, 18/07/2026). Extrait de
// app/page.tsx (18/07/2026, correctif Lot E) pour être réutilisé aussi par
// l'écran Sécurité (app/compte/securite) sans dupliquer la cérémonie
// WebAuthn — un seul point de vérité, comme app/institution/connexion/page.tsx
// et ParametresTab.tsx côté institution.

/** Vérifie si WebAuthn est supporté sur l'appareil */
export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}

export type RegisterBiometrieResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "cancelled" | "server_error" };

/**
 * Enregistre la biométrie de l'utilisateur (première fois) — exige une
 * session Supabase active. `deviceLabel` optionnel (ex. "iPhone de Bryan")
 * — transmis à register-verify qui le stocke déjà (Lot C), mirroring le
 * popup de nommage côté institution (ParametresTab.tsx) : l'écran Sécurité
 * (Lot E) le demande maintenant avant de lancer la cérémonie WebAuthn, ce
 * qui manquait initialement.
 *
 * Retourne une raison d'échec distincte plutôt qu'un simple booléen : sur
 * PC sans capteur biométrique (Windows Hello non configuré, pas de
 * Touch ID), `isUserVerifyingPlatformAuthenticatorAvailable()` renvoie
 * correctement `false` — ce n'est pas un bug, mais un message générique
 * "échec, réessayez" induirait Bryan en erreur en testant sur PC.
 */
export async function registerBiometrie(userId: string, deviceLabel?: string): Promise<RegisterBiometrieResult> {
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return { ok: false, reason: "unsupported" };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, reason: "server_error" };

    const optRes = await fetch("/api/citoyen/securite/webauthn/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token }),
    });
    const optData = await optRes.json();
    if (!optRes.ok) { console.error("WebAuthn register-options error:", optData.error); return { ok: false, reason: "server_error" }; }

    let attestation;
    try {
      attestation = await startRegistration({ optionsJSON: optData.options });
    } catch (err) {
      console.error("WebAuthn startRegistration cancelled/failed:", err);
      return { ok: false, reason: "cancelled" };
    }

    const verifyRes = await fetch("/api/citoyen/securite/webauthn/register-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token, credential: attestation, challengeToken: optData.challengeToken, deviceLabel }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) { console.error("WebAuthn register-verify error:", verifyData.error); return { ok: false, reason: "server_error" }; }

    localStorage.setItem("yelen224_bio_registered", "1");
    return { ok: true };
  } catch (err) {
    console.error("WebAuthn register error:", err);
    return { ok: false, reason: "server_error" };
  }
}

/** Authentifie via biométrie (empreinte / Face ID) — établit une vraie session Supabase au succès */
export async function authenticateBiometrie(userId: string): Promise<boolean> {
  try {
    const optRes = await fetch("/api/citoyen/securite/webauthn/auth-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ citoyenId: userId }),
    });
    const optData = await optRes.json();
    if (!optRes.ok) { console.error("WebAuthn auth-options error:", optData.error); return false; }

    let assertion;
    try {
      assertion = await startAuthentication({ optionsJSON: optData.options });
    } catch (err) {
      console.error("WebAuthn startAuthentication cancelled/failed:", err);
      return false;
    }

    const verifyRes = await fetch("/api/citoyen/securite/webauthn/auth-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ citoyenId: userId, credential: assertion, challengeToken: optData.challengeToken }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.tokenHash) { console.error("WebAuthn auth-verify error:", verifyData.error); return false; }

    const { error: sessionError } = await supabase.auth.verifyOtp({ token_hash: verifyData.tokenHash, type: "email" });
    if (sessionError) { console.error("WebAuthn session redeem error:", sessionError.message); return false; }

    return true;
  } catch (err) {
    console.error("WebAuthn auth error:", err);
    return false;
  }
}
