import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { ActivationSecurite } from "@/lib/institutionAuth";

// ─────────────────────────────────────────────────────────────────────────
// GAP-08-05 (23/10/2026) — MFA obligatoire des membres institution,
// appliquée côté serveur par proxy.ts (lib/security/institutionMfaGate.ts).
// Les tests passent par proxy() lui-même : ils prouvent que la garde est
// réellement branchée au point d'entrée, pas seulement que le module
// fonctionne isolément. Seules les deux lectures de session/état MFA sont
// simulées.
// ─────────────────────────────────────────────────────────────────────────

vi.hoisted(() => {
  // proxy.ts crée un client Supabase au chargement : valeurs factices (mêmes
  // placeholders que .github/workflows/ci.yml), aucun appel réseau.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "placeholder-service-role-key-for-ci-build-only";
  process.env.ADMIN_JWT_SECRET ??= "placeholder-secret-for-ci-build-only-0000000000000000";
});

const { getAuthenticatedMembre, evaluerActivationSecurite } = vi.hoisted(() => ({
  getAuthenticatedMembre: vi.fn(),
  evaluerActivationSecurite: vi.fn(),
}));
vi.mock("@/lib/institutionAuth", () => ({ getAuthenticatedMembre, evaluerActivationSecurite }));
vi.mock("@/lib/edgeSecurity", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/edgeSecurity")>();
  return { ...reel, logSecurite: vi.fn() };
});

const MEMBRE = { institutionId: "inst-1", membreId: "membre-1", role: "agent", sid: "sid-1", reauthAt: null, accesRestreints: null };
const MAINTENANT = new Date("2026-10-23T12:00:00.000Z").getTime();

function activation(etat: "bloque" | "dans_le_delai" | "mfa_active" | "non_concerne", deadlineMs = MAINTENANT - 3600_000): ActivationSecurite {
  const deadline = new Date(deadlineMs).toISOString();
  switch (etat) {
    case "bloque": return { requise: true, bloque: true, deadline, totpActif: false, passkeyActive: false };
    case "dans_le_delai": return { requise: true, bloque: false, deadline, totpActif: false, passkeyActive: false };
    case "mfa_active": return { requise: false, bloque: false, deadline: null, totpActif: true, passkeyActive: false };
    case "non_concerne": return { requise: false, bloque: false, deadline: null, totpActif: false, passkeyActive: false };
  }
}

function requete(chemin: string, methode = "GET") {
  // User-agent explicite : proxy.ts refuse un UA vide (estUserAgentSuspect).
  return new NextRequest(`https://yelen224.example${chemin}`, {
    method: methode,
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0" },
  });
}

const laissePasser = (res: Response) => res.headers.get("x-middleware-next") === "1";

// Liste figée volontairement ici (et comparée à la liste réelle en fin de
// fichier) : toute exemption ajoutée/retirée dans institutionMfaGate.ts doit
// être une décision visible dans ce test, jamais un changement silencieux.
// Méthode testée = méthode autorisée (POST pour une exemption sans
// restriction de méthode).
const EXEMPTIONS_ATTENDUES: [string, string][] = [
  ["POST", "/api/institution/auth/logout"],
  ["POST", "/api/institution/auth/lookup"],
  ["POST", "/api/institution/auth/register"],
  ["POST", "/api/institution/auth/send-otp"],
  ["POST", "/api/institution/auth/verify-otp"],
  ["POST", "/api/institution/auth/membre/login"],
  ["POST", "/api/institution/auth/pin/verify"],
  ["POST", "/api/institution/auth/totp/login-verify"],
  ["POST", "/api/institution/auth/remember/check"],
  ["POST", "/api/institution/auth/remember/forget"],
  ["POST", "/api/institution/auth/webauthn/auth-options"],
  ["POST", "/api/institution/auth/webauthn/auth-verify"],
  ["POST", "/api/institution/auth/webauthn/membre/auth-options"],
  ["POST", "/api/institution/auth/webauthn/membre/auth-verify"],
  ["GET", "/api/institution/auth/security-activation-status"],
  ["POST", "/api/institution/securite/totp/setup"],
  ["POST", "/api/institution/securite/totp/verify"],
  ["GET", "/api/institution/security-status"],
  ["GET", "/api/institution/auth/webauthn/membre"],
  ["POST", "/api/institution/auth/webauthn/membre/register-options"],
  ["POST", "/api/institution/auth/webauthn/membre/register-verify"],
  ["GET", "/api/institution/profile"],
];

let proxy: (req: NextRequest) => Promise<Response>;
let ROUTES_EXEMPTEES_MFA: typeof import("./institutionMfaGate").ROUTES_EXEMPTEES_MFA;
let viderCacheGardeMfa: () => void;

beforeAll(async () => {
  ({ proxy } = await import("@/proxy"));
  ({ ROUTES_EXEMPTEES_MFA, viderCacheGardeMfa } = await import("./institutionMfaGate"));
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  viderCacheGardeMfa();
  getAuthenticatedMembre.mockResolvedValue(MEMBRE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GAP-08-05 — membre dont le délai de 24h est dépassé, sans MFA", () => {
  beforeEach(() => evaluerActivationSecurite.mockResolvedValue(activation("bloque")));

  it.each([
    ["GET", "/api/institution/rdv"],
    ["POST", "/api/institution/rdv/statut"],
    ["GET", "/api/institution/clients"],
    ["DELETE", "/api/institution/services"],
    ["PUT", "/api/institution/profile"],
    ["POST", "/api/qr/validate"],
  ])("%s %s -> 403 MFA_REQUISE, avec l'échéance", async (methode, chemin) => {
    const res = await proxy(requete(chemin, methode));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("MFA_REQUISE");
    expect(body.deadline).toBe(new Date(MAINTENANT - 3600_000).toISOString());
    expect(laissePasser(res)).toBe(false);
  });

  it.each([
    ["POST", "/api/institution/securite/totp/disable"],
    ["POST", "/api/institution/securite/totp/backup-codes/regenerate"],
    ["POST", "/api/institution/auth/webauthn/revoke"],
    ["POST", "/api/institution/auth/deletion/request"],
    ["POST", "/api/institution/auth/pin/set"],
    ["POST", "/api/institution/auth/remember/revoke-all"],
    // Correspondance exacte, jamais un préfixe :
    ["GET", "/api/institution/auth/security-activation-status/extra"],
    ["POST", "/api/institution/securite/totp/setup-autre"],
  ])("route non exemptée ou voisine d'une exemption : %s %s -> 403", async (methode, chemin) => {
    const res = await proxy(requete(chemin, methode));
    expect(res.status).toBe(403);
  });

  it.each(EXEMPTIONS_ATTENDUES)("route exemptée toujours accessible : %s %s", async (methode, chemin) => {
    const res = await proxy(requete(chemin, methode));
    expect(laissePasser(res)).toBe(true);
  });

  it("route exemptée avec / final : toujours accessible", async () => {
    const res = await proxy(requete("/api/institution/auth/logout/", "POST"));
    expect(laissePasser(res)).toBe(true);
  });

  it("route hors périmètre institution (citoyen, admin public) : jamais évaluée", async () => {
    const res = await proxy(requete("/api/citoyen/activites"));
    expect(laissePasser(res)).toBe(true);
    expect(getAuthenticatedMembre).not.toHaveBeenCalled();
  });
});

describe("GAP-08-05 — sessions acceptées", () => {
  it.each([
    ["MFA active (TOTP)", "mfa_active"],
    ["membre non concerné (compte principal / antérieur au chantier)", "non_concerne"],
    ["encore dans son délai de 24h", "dans_le_delai"],
  ] as const)("%s -> laisse passer", async (_libelle, etat) => {
    evaluerActivationSecurite.mockResolvedValue(activation(etat, MAINTENANT + 3600_000));
    const res = await proxy(requete("/api/institution/rdv"));
    expect(laissePasser(res)).toBe(true);
  });

  it("aucune session membre -> laisse passer (la route renvoie elle-même son 401), aucune lecture MFA", async () => {
    getAuthenticatedMembre.mockResolvedValue(null);
    const res = await proxy(requete("/api/institution/rdv"));
    expect(laissePasser(res)).toBe(true);
    expect(evaluerActivationSecurite).not.toHaveBeenCalled();
  });
});

describe("GAP-08-05 — bascule à l'échéance et sortie du blocage (cache)", () => {
  it("membre dans son délai : bloqué dès l'échéance passée, même s'il était en cache", async () => {
    const deadline = MAINTENANT + 30_000;
    evaluerActivationSecurite.mockResolvedValue(activation("dans_le_delai", deadline));
    expect(laissePasser(await proxy(requete("/api/institution/rdv")))).toBe(true);

    vi.setSystemTime(deadline + 1_000);
    evaluerActivationSecurite.mockResolvedValue(activation("bloque", deadline));
    const res = await proxy(requete("/api/institution/rdv"));
    expect(res.status).toBe(403);
  });

  it("membre bloqué jamais mis en cache : débloqué à la requête qui suit l'activation", async () => {
    evaluerActivationSecurite.mockResolvedValue(activation("bloque"));
    expect((await proxy(requete("/api/institution/rdv"))).status).toBe(403);

    evaluerActivationSecurite.mockResolvedValue(activation("mfa_active"));
    expect(laissePasser(await proxy(requete("/api/institution/rdv")))).toBe(true);
  });

  it("membre conforme mis en cache 60 s : pas de relecture à chaque requête", async () => {
    evaluerActivationSecurite.mockResolvedValue(activation("mfa_active"));
    await proxy(requete("/api/institution/rdv"));
    await proxy(requete("/api/institution/clients"));
    expect(evaluerActivationSecurite).toHaveBeenCalledTimes(1);

    vi.setSystemTime(MAINTENANT + 61_000);
    await proxy(requete("/api/institution/rdv"));
    expect(evaluerActivationSecurite).toHaveBeenCalledTimes(2);
  });
});

describe("GAP-08-05 — la liste des exemptions est exactement celle validée", () => {
  it("aucune exemption ajoutée ou retirée sans mise à jour de ce test", () => {
    const reelles = ROUTES_EXEMPTEES_MFA.map((e) => `${e.methodes?.join("|") ?? "*"} ${e.chemin}`).sort();
    const attendues = EXEMPTIONS_ATTENDUES.map(([m, c]) => {
      const e = ROUTES_EXEMPTEES_MFA.find((x) => x.chemin === c);
      return `${e?.methodes ? m : "*"} ${c}`;
    }).sort();
    expect(reelles).toEqual(attendues);
    expect(ROUTES_EXEMPTEES_MFA.every((e) => e.motif.length > 20)).toBe(true);
  });
});
