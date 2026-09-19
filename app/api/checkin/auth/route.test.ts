import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// app/api/checkin/auth — étape 2 (PIN) du flux "badge QR puis PIN"
// (revirement produit 13/09/2026). Le body attendu est désormais
// { challengeToken, pin }, plus { identifiant, pin } — challengeToken vient
// de app/api/checkin/agent/identify (étape 1, testée séparément).
// ─────────────────────────────────────────────────────────────────────────

const { creerSessionCheckin, signerJetonCheckin, verifierDefiCheckin } = vi.hoisted(() => ({
  creerSessionCheckin: vi.fn(async () => "session-1"),
  signerJetonCheckin: vi.fn(async () => "jwt-signe"),
  verifierDefiCheckin: vi.fn(),
}));
vi.mock("@/lib/checkinAuth", () => ({
  creerSessionCheckin, signerJetonCheckin, verifierDefiCheckin,
  CHECKIN_COOKIE_NAME: "yelen224_checkin_session",
  CHECKIN_SESSION_TTL_MS: 8 * 60 * 60 * 1000,
}));

vi.mock("@/lib/edgeSecurity", () => ({ extraireIpClient: vi.fn(() => "1.2.3.4") }));
vi.mock("@/lib/security/authSecurity", () => ({
  resoudreDeviceId: vi.fn(() => ({ deviceId: "device-1", estNouveau: false })),
  poserCookieDeviceSiNecessaire: vi.fn(),
  evaluerTentative: vi.fn(async () => ({ state: "normal" })),
  enregistrerTentative: vi.fn(async () => ({ state: "normal" })),
  messageSecurite: vi.fn(() => "Bloqué"),
}));

const { bcryptCompare } = vi.hoisted(() => ({ bcryptCompare: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: bcryptCompare } }));

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { membres: Ligne[]; institutions: Ligne[] }) {
  return {
    from(table: string) {
      const filtres: [string, unknown][] = [];
      const data = table === "institution_membres" ? seed.membres : table === "institutions" ? seed.institutions : [];
      const builder = {
        select() { return builder; },
        eq(col: string, val: unknown) { filtres.push([col, val]); return builder; },
        async maybeSingle() {
          const rows = data.filter((r) => filtres.every(([c, v]) => r[c] === v));
          return { data: rows[0] ?? null, error: null };
        },
        update(patch: Ligne) {
          return {
            eq(col: string, val: unknown) {
              const row = data.find((r) => r[col] === val);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
      return builder;
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxSupabaseCourant) }));

let fauxSupabaseCourant: ReturnType<typeof creerFauxSupabase>;
let membresSeedActuel: Ligne[];

const INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const MEMBRE_ID = "m1";

function membreBase(overrides: Ligne = {}): Ligne {
  return {
    id: MEMBRE_ID, institution_id: INSTITUTION_A, pin_hash: "hash", role: "agent", actif: true,
    prenom: "Mariama", failed_attempts: 0, locked_until: null, checkin_qr_revoked_at: null,
    ...overrides,
  };
}

async function importRoute() { return await import("./route"); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  membresSeedActuel = [membreBase()];
  fauxSupabaseCourant = creerFauxSupabase({ membres: membresSeedActuel, institutions: [{ id: INSTITUTION_A, statut: "validee" }] });
  verifierDefiCheckin.mockResolvedValue({ membreId: MEMBRE_ID, institutionId: INSTITUTION_A });
});

function req(body: unknown) {
  return new NextRequest("http://localhost/api/checkin/auth", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/checkin/auth (étape 2, après scan du badge)", () => {
  it("champs manquants -> 400", async () => {
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "x" }));
    expect(res.status).toBe(400);
  });

  it("challengeToken invalide/expiré -> 401 CHALLENGE_EXPIRED, avant toute lecture du membre", async () => {
    verifierDefiCheckin.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "perime", pin: "1234" }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.code).toBe("CHALLENGE_EXPIRED");
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it("badge révoqué entre le scan et la saisie du PIN -> 401 CHALLENGE_EXPIRED", async () => {
    membresSeedActuel[0].checkin_qr_revoked_at = new Date().toISOString();
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "1234" }));
    expect(res.status).toBe(401);
  });

  it("compte verrouillé (locked_until futur) -> 429, avant même de vérifier le PIN", async () => {
    membresSeedActuel[0].locked_until = new Date(Date.now() + 60_000).toISOString();
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "1234" }));
    expect(res.status).toBe(429);
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it("PIN incorrect -> 401, compteur incrémenté, verrouillage 30 min à la 5e tentative", async () => {
    bcryptCompare.mockResolvedValue(false);
    membresSeedActuel[0].failed_attempts = 4;
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "0000" }));
    expect(res.status).toBe(401);
    expect(membresSeedActuel[0].failed_attempts).toBe(5);
    const lockedUntil = membresSeedActuel[0].locked_until as string;
    const minutes = (new Date(lockedUntil).getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it("PIN correct mais rôle sans appointment.check_in -> 403 FORBIDDEN_ROLE, aucune session créée", async () => {
    bcryptCompare.mockResolvedValue(true);
    membresSeedActuel[0].role = "comptable";
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "1234" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN_ROLE");
    expect(creerSessionCheckin).not.toHaveBeenCalled();
  });

  it("institution suspendue -> 403, aucune session créée", async () => {
    bcryptCompare.mockResolvedValue(true);
    fauxSupabaseCourant = creerFauxSupabase({ membres: membresSeedActuel, institutions: [{ id: INSTITUTION_A, statut: "suspendue" }] });
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "1234" }));
    expect(res.status).toBe(403);
    expect(creerSessionCheckin).not.toHaveBeenCalled();
  });

  it("badge d'un membre d'une autre institution que le challenge -> 401, sans fuite", async () => {
    verifierDefiCheckin.mockResolvedValue({ membreId: MEMBRE_ID, institutionId: "autre-institution" });
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "1234" }));
    expect(res.status).toBe(401);
  });

  it("badge + PIN corrects -> 200, session créée, cookie posé", async () => {
    bcryptCompare.mockResolvedValue(true);
    const { POST } = await importRoute();
    const res = await POST(req({ challengeToken: "tok", pin: "1234" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.prenom).toBe("Mariama");
    expect(creerSessionCheckin).toHaveBeenCalledWith(expect.objectContaining({ membreId: MEMBRE_ID, institutionId: INSTITUTION_A }));
    expect(res.cookies.get("yelen224_checkin_session")?.value).toBe("jwt-signe");
  });
});
