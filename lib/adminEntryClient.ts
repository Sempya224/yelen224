import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

// Admin Entry Security V2 — Lot 3 (30/08/2026). Cérémonie WebAuthn côté
// navigateur — même pattern que lib/auth/citoyenBiometrie.ts (source
// unique déjà établie dans ce projet pour startRegistration/startAuthentication),
// adapté à l'absence d'identifiant (Option A : ni accessToken/citoyenId ni
// institutionId transmis, la session admin réelle passe par le cookie
// yelen224_admin_session pour register-*, aucune session pour auth-*).

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}

export type EntreeAdminResult = { ok: true } | { ok: false; reason: "unsupported" | "not_configured" | "cancelled" | "server_error" };

/** Page publique /entree-admin — établit le grant temporaire, jamais une session. */
export async function authentifierEntreeAdmin(): Promise<EntreeAdminResult> {
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return { ok: false, reason: "unsupported" };

    const optRes = await fetch("/api/admin/entry/webauthn/auth-options", { method: "POST" });
    const optData = await optRes.json();
    if (!optRes.ok) {
      return { ok: false, reason: optData.code === "NOT_CONFIGURED" ? "not_configured" : "server_error" };
    }

    let assertion;
    try {
      assertion = await startAuthentication({ optionsJSON: optData.options });
    } catch (err) {
      console.error("[ADMIN ENTRY] startAuthentication annulé/échoué:", err);
      return { ok: false, reason: "cancelled" };
    }

    const verifyRes = await fetch("/api/admin/entry/webauthn/auth-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: assertion, challengeToken: optData.challengeToken }),
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      console.error("[ADMIN ENTRY] auth-verify error:", data.error);
      return { ok: false, reason: "server_error" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[ADMIN ENTRY] Erreur:", err);
    return { ok: false, reason: "server_error" };
  }
}

/** Écran admin authentifié (/admin/security/entree) — enrôle un nouveau credential d'entrée. */
export async function enrolerCredentialEntreeAdmin(deviceLabel?: string): Promise<EntreeAdminResult> {
  try {
    const optRes = await fetch("/api/admin/entry/webauthn/register-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceLabel }),
    });
    const optData = await optRes.json();
    if (!optRes.ok) { console.error("[ADMIN ENTRY] register-options error:", optData.error); return { ok: false, reason: "server_error" }; }

    let attestation;
    try {
      attestation = await startRegistration({ optionsJSON: optData.options });
    } catch (err) {
      console.error("[ADMIN ENTRY] startRegistration annulé/échoué:", err);
      return { ok: false, reason: "cancelled" };
    }

    const verifyRes = await fetch("/api/admin/entry/webauthn/register-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: attestation, challengeToken: optData.challengeToken, deviceLabel }),
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      console.error("[ADMIN ENTRY] register-verify error:", data.error);
      return { ok: false, reason: "server_error" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[ADMIN ENTRY] Erreur enrôlement:", err);
    return { ok: false, reason: "server_error" };
  }
}
