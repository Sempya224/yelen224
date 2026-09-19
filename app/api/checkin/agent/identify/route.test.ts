import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

const { signerDefiCheckin } = vi.hoisted(() => ({ signerDefiCheckin: vi.fn(async () => "challenge-jwt") }));
vi.mock("@/lib/checkinAuth", () => ({
  signerDefiCheckin,
  hashAgentQrToken: (token: string) => createHash("sha256").update(token).digest("hex"),
}));

vi.mock("@/lib/edgeSecurity", () => ({ extraireIpClient: vi.fn(() => "1.2.3.4") }));
vi.mock("@/lib/security/authSecurity", () => ({
  resoudreDeviceId: vi.fn(() => ({ deviceId: "device-1", estNouveau: false })),
  poserCookieDeviceSiNecessaire: vi.fn(),
  evaluerTentative: vi.fn(async () => ({ state: "normal" })),
  enregistrerTentative: vi.fn(async () => ({ state: "normal" })),
  messageSecurite: vi.fn(() => "Bloqué"),
}));

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { membres: Ligne[] }) {
  return {
    from(table: string) {
      if (table !== "institution_membres") throw new Error(`table non simulée: ${table}`);
      const filtres: [string, unknown][] = [];
      const builder = {
        select() { return builder; },
        eq(col: string, val: unknown) { filtres.push([col, val]); return builder; },
        async maybeSingle() {
          const rows = seed.membres.filter((r) => filtres.every(([c, v]) => r[c] === v));
          return { data: rows[0] ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxSupabaseCourant) }));

let fauxSupabaseCourant: ReturnType<typeof creerFauxSupabase>;

const INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const TOKEN_VALIDE = "badge-token-secret";
const HASH_VALIDE = createHash("sha256").update(TOKEN_VALIDE).digest("hex");

async function importRoute() { return await import("./route"); }

function req(body: unknown) {
  return new NextRequest("http://localhost/api/checkin/agent/identify", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  fauxSupabaseCourant = creerFauxSupabase({
    membres: [{ id: "m1", institution_id: INSTITUTION_A, prenom: "Mariama", role: "agent", actif: true, checkin_qr_hash: HASH_VALIDE, checkin_qr_revoked_at: null }],
  });
});

describe("POST /api/checkin/agent/identify", () => {
  it("token manquant -> 400", async () => {
    const { POST } = await importRoute();
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("badge inconnu -> 401 générique BADGE_INVALIDE", async () => {
    const { POST } = await importRoute();
    const res = await POST(req({ token: "inconnu" }));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.code).toBe("BADGE_INVALIDE");
  });

  it("badge révoqué -> même 401 générique (pas de distinction observable)", async () => {
    fauxSupabaseCourant = creerFauxSupabase({
      membres: [{ id: "m1", institution_id: INSTITUTION_A, prenom: "Mariama", role: "agent", actif: true, checkin_qr_hash: HASH_VALIDE, checkin_qr_revoked_at: new Date().toISOString() }],
    });
    const { POST } = await importRoute();
    const res = await POST(req({ token: TOKEN_VALIDE }));
    expect(res.status).toBe(401);
  });

  it("badge valide mais rôle sans appointment.check_in -> même 401 générique", async () => {
    fauxSupabaseCourant = creerFauxSupabase({
      membres: [{ id: "m1", institution_id: INSTITUTION_A, prenom: "Mariama", role: "comptable", actif: true, checkin_qr_hash: HASH_VALIDE, checkin_qr_revoked_at: null }],
    });
    const { POST } = await importRoute();
    const res = await POST(req({ token: TOKEN_VALIDE }));
    expect(res.status).toBe(401);
    expect(signerDefiCheckin).not.toHaveBeenCalled();
  });

  it("badge valide, rôle autorisé -> 200, challengeToken + prénom", async () => {
    const { POST } = await importRoute();
    const res = await POST(req({ token: TOKEN_VALIDE }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.challengeToken).toBe("challenge-jwt");
    expect(body.prenom).toBe("Mariama");
    expect(signerDefiCheckin).toHaveBeenCalledWith({ membreId: "m1", institutionId: INSTITUTION_A });
  });
});
