import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// YELEN Accueil — app/api/checkin/scan (voir
// docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md). Vérifie que cette route
// applique bien les mêmes barrières que /api/qr/validate (GAP-05-01/
// GAP-07-01) via lib/qrValidation.ts partagé, plus ses propres états de
// session (absente/invalide -> 401, verrouillée -> 423).
// ─────────────────────────────────────────────────────────────────────────

const { getEtatSessionCheckin, chargerMembreCheckinActif, toucherActiviteCheckin } = vi.hoisted(() => ({
  getEtatSessionCheckin: vi.fn(),
  chargerMembreCheckinActif: vi.fn(),
  toucherActiviteCheckin: vi.fn(async () => {}),
}));
vi.mock("@/lib/checkinAuth", () => ({ getEtatSessionCheckin, chargerMembreCheckinActif, toucherActiviteCheckin }));

vi.mock("@/lib/rdvGating", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/rdvGating")>();
  return { ...reel, creneauEstOuvert: vi.fn(() => true) };
});

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { rdv: Ligne[]; users: Ligne[] }) {
  function joindre(row: Ligne): Ligne {
    const user = seed.users.find((u) => u.id === row.citoyen_id) ?? null;
    return { ...row, users: user };
  }
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
          return { data: joindre(rows[0]), error: null };
        },
        async maybeSingle() {
          const rows = seed.rdv.filter((r) => filtres.every(([c, v]) => r[c] === v));
          return { data: rows[0] ? joindre(rows[0]) : null, error: null };
        },
      };
      return builder;
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxSupabaseCourant) }));
vi.mock("@/lib/security/authSecurity", () => ({
  resoudreDeviceId: vi.fn(() => ({ deviceId: "device-1", estNouveau: false })),
  poserCookieDeviceSiNecessaire: vi.fn(),
  evaluerTentative: vi.fn(async () => ({ state: "normal" })),
  enregistrerTentative: vi.fn(async () => ({ state: "normal" })),
  messageSecurite: vi.fn(() => "Bloqué"),
}));
vi.mock("@/lib/edgeSecurity", () => ({ extraireIpClient: vi.fn(() => "1.2.3.4") }));

let fauxSupabaseCourant: ReturnType<typeof creerFauxSupabase>;

const INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const RDV_ID = "33333333-3333-3333-3333-333333333333";
const CITOYEN_ID = "44444444-4444-4444-4444-444444444444";

function rdvBase(overrides: Ligne = {}): Ligne {
  return {
    id: RDV_ID, date_rdv: "2026-09-13", heure_rdv: "10:00", statut: "en_attente", presence_status: null,
    institution_id: INSTITUTION_A, citoyen_id: CITOYEN_ID, objet: "Consultation",
    qr_token: "token-valide", qr_expires_at: new Date(Date.now() + 3600_000).toISOString(), qr_regenere_le: null,
    code_secours: "AB7K92QF", code_secours_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

async function importRoute() { return await import("./route"); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  fauxSupabaseCourant = creerFauxSupabase({
    rdv: [rdvBase()],
    users: [{ id: CITOYEN_ID, nom: "Diallo", prenom: "Aïssatou", phone: "+224600000000" }],
  });
});

describe("POST /api/checkin/scan — session", () => {
  it("session absente -> 401", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "absente" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ qr_payload: JSON.stringify({ t: "token-valide", r: RDV_ID, i: INSTITUTION_A }) }) });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("session verrouillée -> 423", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "verrouillee", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ qr_payload: "{}" }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(423);
    expect(body.code).toBe("SESSION_LOCKED");
  });

  it("session valide mais rôle sans appointment.check_in -> 403", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "comptable" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ qr_payload: JSON.stringify({ t: "token-valide", r: RDV_ID, i: INSTITUTION_A }) }) });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("agent autorisé, QR valide -> 200, réponse minimale (pas de téléphone/nom complet)", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ qr_payload: JSON.stringify({ t: "token-valide", r: RDV_ID, i: INSTITUTION_A }) }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rdv.citoyen_affichage).toContain("Aïssatou");
    expect(JSON.stringify(body)).not.toContain("+224600000000");
    expect(JSON.stringify(body)).not.toContain("Diallo");
  });

  it("code manuel valide -> résout vers le même RDV, réponse minimale", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ code_manuel: "ab7k92qf" }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rdv.id).toBe(RDV_ID);
  });

  it("code manuel inconnu -> 404, aucune fuite", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: INSTITUTION_A, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ code_manuel: "ZZZZZZZZ" }) });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("QR d'une autre institution (falsifié) -> 403 rapide sans lecture du RDV", async () => {
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: "autre-institution", membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ qr_payload: JSON.stringify({ t: "token-valide", r: RDV_ID, i: INSTITUTION_A }) }) });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("champ i du payload falsifié pour correspondre à sa propre institution -> bloqué par le filtre institution_id en base (GAP-07-01), sans fuite", async () => {
    const AUTRE_INSTITUTION = "99999999-9999-9999-9999-999999999999";
    getEtatSessionCheckin.mockResolvedValue({ etat: "ok", ctx: { institutionId: AUTRE_INSTITUTION, membreId: "m1", sid: "s1" } });
    chargerMembreCheckinActif.mockResolvedValue({ role: "agent" });
    const { POST } = await importRoute();
    // Le RDV appartient réellement à INSTITUTION_A ; l'agent falsifie `i`
    // pour qu'il corresponde à sa propre institution et passer le contrôle
    // rapide côté payload — la vraie barrière est le filtre institution_id
    // dans validerScanQr (lib/qrValidation.ts).
    const req = new NextRequest("http://localhost/api/checkin/scan", { method: "POST", body: JSON.stringify({ qr_payload: JSON.stringify({ t: "token-valide", r: RDV_ID, i: AUTRE_INSTITUTION }) }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Diallo");
  });
});
