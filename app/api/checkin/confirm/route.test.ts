import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getEtatSessionCheckin, chargerMembreCheckinActif, toucherActiviteCheckin } = vi.hoisted(() => ({
  getEtatSessionCheckin: vi.fn(),
  chargerMembreCheckinActif: vi.fn(),
  toucherActiviteCheckin: vi.fn(async () => {}),
}));
vi.mock("@/lib/checkinAuth", () => ({ getEtatSessionCheckin, chargerMembreCheckinActif, toucherActiviteCheckin }));

vi.mock("@/lib/journalActivite", () => ({
  enregistrerAction: vi.fn(async () => {}),
  getMembreNomPourJournal: vi.fn(async () => "Agent Test"),
}));
vi.mock("@/lib/notificationEngine", () => ({
  notifierArrivee: vi.fn(async () => {}),
  notifierPriseEnCharge: vi.fn(async () => {}),
  logRdvEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/rdvGating", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/rdvGating")>();
  return { ...reel, creneauEstOuvert: vi.fn(() => true), absenceDeclarable: vi.fn(() => true) };
});
vi.mock("@/lib/rdvRestrictions", () => ({
  chargerRestrictionActive: vi.fn(async () => null),
  notifierSiEscalade: vi.fn(async () => {}),
}));
vi.mock("@/lib/rewardsEngine", () => ({
  accorderPoints: vi.fn(async () => {}),
}));

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { rdv: Ligne[] }) {
  return {
    from(table: string) {
      if (table !== "rdv") throw new Error(`table non simulée: ${table}`);
      const filtres: [string, unknown][] = [];
      const builder = {
        select() { return builder; },
        eq(col: string, val: unknown) { filtres.push([col, val]); return builder; },
        async single() {
          const rows = seed.rdv.filter((r) => filtres.every(([c, v]) => r[c] === v));
          if (rows.length !== 1) return { data: null, error: { message: "no rows" } };
          return { data: { ...rows[0], institutions: { name: "Institution A" }, users: { prenom: "Aïssatou", nom: "Diallo", phone: "+224600000000" } }, error: null };
        },
        update(patch: Ligne) {
          return {
            eq(col: string, val: unknown) {
              const row = seed.rdv.find((r) => r[col] === val);
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
let rdvSeedActuel: Ligne[];

const INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const RDV_ID = "33333333-3333-3333-3333-333333333333";

function rdvBase(overrides: Ligne = {}): Ligne {
  return {
    id: RDV_ID, institution_id: INSTITUTION_A, citoyen_id: "44444444-4444-4444-4444-444444444444",
    date_rdv: "2026-09-13", heure_rdv: "10:00", statut: "en_attente",
    qr_expires_at: new Date(Date.now() + 3600_000).toISOString(), qr_regenere_le: null, presence_status: null,
    ...overrides,
  };
}

async function importRoute() { return await import("./route"); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  rdvSeedActuel = [rdvBase()];
  fauxSupabaseCourant = creerFauxSupabase({ rdv: rdvSeedActuel });
});

describe("PUT /api/checkin/confirm — session et permissions", () => {
  it("session absente -> 401", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "absente" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/confirm", { method: "PUT", body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }) });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("session verrouillée -> 423", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "verrouillee", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/confirm", { method: "PUT", body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }) });
    const res = await PUT(req);
    expect(res.status).toBe(423);
  });

  it("rôle sans appointment.check_in -> 403, aucune écriture", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "dirigeant" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/confirm", { method: "PUT", body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }) });
    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect(rdvSeedActuel[0].presence_status).toBeNull();
  });

  it("agent autorisé -> 200, réponse minimale (pas de nom/téléphone)", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/confirm", { method: "PUT", body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }) });
    const res = await PUT(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).not.toContain("Diallo");
    expect(JSON.stringify(body)).not.toContain("+224600000000");
  });

  it("agent d'une autre institution -> 404, aucune confirmation possible", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: "autre-institution", membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/confirm", { method: "PUT", body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }) });
    const res = await PUT(req);
    expect(res.status).toBe(404);
  });
});
