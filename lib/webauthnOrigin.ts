import type { NextRequest } from "next/server";

// Résolution rpID/origin WebAuthn — extraite pour l'admin entry (Lot 3,
// 30/08/2026) plutôt que dupliquée une 9e fois. Logique strictement
// identique aux 8 copies déjà existantes (citoyen : securite/webauthn/{auth,register}-{options,verify} ;
// institution : auth/webauthn/{auth,register}-{options,verify}), jamais
// modifiées par cette extraction — priorité à NEXT_PUBLIC_APP_URL (ancrage
// explicite du domaine de prod), repli sur l'URL réelle de la requête (dev
// local / deploy previews Netlify). Aucune logique spécifique à un domaine
// dans aucune des 8 copies auditées (docs/security/YELEN_ADMIN_ENTRY_V2_AUDIT.md,
// section 4) : un seul Relying Party pour toute l'application, donc
// réutilisable tel quel ici.
export function getWebAuthnOrigin(request: NextRequest): { rpID: string; expectedOrigin: string } {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    try {
      const u = new URL(envUrl);
      return { rpID: u.hostname, expectedOrigin: u.origin };
    } catch {}
  }
  const u = new URL(request.url);
  return { rpID: u.hostname, expectedOrigin: u.origin };
}

export function getWebAuthnRpID(request: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    try { return new URL(envUrl).hostname; } catch {}
  }
  return new URL(request.url).hostname;
}
