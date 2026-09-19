import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// GAP-05-01 / GAP-07-01 (13/09/2026) — cette route ne vérifiait auparavant
// ni le rôle du membre (appointment.check_in), ni que le RDV chargé au POST
// appartenait réellement à son institution (le champ `i` du payload JSON,
// fourni par le client, n'était comparé qu'à lui-même). Ces tests couvrent
// exactement les 6 scénarios demandés par Bryan avant tout commit :
// 401 non authentifié, 403 rôle non autorisé, 200 agent autorisé/bonne
// institution, échec sans fuite si RDV d'une autre institution, cohérence
// sur un QR déjà validé, impossibilité de contourner via le corps requête.
// ─────────────────────────────────────────────────────────────────────────

const { getAuthenticatedMembre } = vi.hoisted(() => ({ getAuthenticatedMembre: vi.fn() }));
vi.mock("@/lib/institutionAuth", () => ({ getAuthenticatedMembre }));

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

function creerFauxSupabase(seed: { rdv: Ligne[]; users: Ligne[]; institutions: Ligne[] }) {
  function appliquerFiltres(rows: Ligne[], filtres: [string, unknown][]) {
    return rows.filter((r) => filtres.every(([col, val]) => r[col] === val));
  }
  function joindre(row: Ligne): Ligne {
    const user = seed.users.find((u) => u.id === row.citoyen_id) ?? null;
    const inst = seed.institutions.find((i) => i.id === row.institution_id) ?? null;
    return { ...row, users: user, institutions: inst };
  }
  return {
    from(table: string) {
      if (table !== "rdv") throw new Error(`table non simulée: ${table}`);
      const filtres: [string, unknown][] = [];
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filtres.push([col, val]);
          return builder;
        },
        async single() {
          const rows = appliquerFiltres(seed.rdv, filtres);
          if (rows.length !== 1) return { data: null, error: { message: "no rows" } };
          return { data: joindre(rows[0]), error: null };
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

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => fauxSupabaseCourant),
}));

let fauxSupabaseCourant: ReturnType<typeof creerFauxSupabase>;
let rdvSeedActuel: Ligne[];

const INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const INSTITUTION_B = "22222222-2222-2222-2222-222222222222";
const RDV_ID = "33333333-3333-3333-3333-333333333333";
const CITOYEN_ID = "44444444-4444-4444-4444-444444444444";

function rdvBase(overrides: Ligne = {}): Ligne {
  return {
    id: RDV_ID,
    date_rdv: "2026-09-13",
    heure_rdv: "10:00",
    statut: "en_attente",
    presence_status: null,
    institution_id: INSTITUTION_A,
    citoyen_id: CITOYEN_ID,
    objet: "Consultation",
    qr_token: "token-valide",
    qr_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    qr_regenere_le: null,
    ...overrides,
  };
}

function payloadPourRdv(rdv: Ligne, instIdMensonger?: string): string {
  return JSON.stringify({
    t: rdv.qr_token,
    r: rdv.id,
    i: instIdMensonger ?? rdv.institution_id,
    d: rdv.date_rdv,
  });
}

async function importRoute() {
  return await import("./route");
}

beforeEach(() => {
  vi.clearAllMocks();
  // route.ts crée son client Supabase une seule fois au chargement du
  // module (`const supabase = createClient(...)` en tête de fichier) — sans
  // ce reset, seul le premier test verrait sa fausse base de données prise
  // en compte, les suivants réutiliseraient la référence figée au premier
  // import du module.
  vi.resetModules();
  rdvSeedActuel = [rdvBase()];
  fauxSupabaseCourant = creerFauxSupabase({
    rdv: rdvSeedActuel,
    users: [{ id: CITOYEN_ID, nom: "Diallo", prenom: "Aïssatou", phone: "+224600000000" }],
    institutions: [{ id: INSTITUTION_A, name: "Institution A" }, { id: INSTITUTION_B, name: "Institution B" }],
  });
});

describe("POST /api/qr/validate — autorisation (GAP-05-01/GAP-07-01)", () => {
  it("1. non authentifié -> 401", async () => {
    getAuthenticatedMembre.mockResolvedValue(null);
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "POST",
      body: JSON.stringify({ qr_payload: payloadPourRdv(rdvBase()) }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("2. authentifié mais rôle sans appointment.check_in (comptable) -> 403, aucune donnée du RDV renvoyée", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_A, membreId: "m1", role: "comptable" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "POST",
      body: JSON.stringify({ qr_payload: payloadPourRdv(rdvBase()) }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(JSON.stringify(body)).not.toContain("Diallo");
    expect(JSON.stringify(body)).not.toContain(RDV_ID);
  });

  it("3. agent autorisé, bonne institution -> 200, RDV renvoyé", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_A, membreId: "m1", role: "agent" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "POST",
      body: JSON.stringify({ qr_payload: payloadPourRdv(rdvBase()) }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.rdv.id).toBe(RDV_ID);
  });

  it("4. agent autorisé mais rattaché à une autre institution -> refus sans fuite, même en falsifiant le champ i du payload", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_B, membreId: "m2", role: "agent" });
    const { POST } = await importRoute();
    // Le RDV appartient réellement à INSTITUTION_A ; l'agent B falsifie le
    // champ `i` du payload pour qu'il corresponde à sa propre institution et
    // passer le contrôle rapide côté payload — la vraie barrière est
    // désormais le filtre institution_id en base (GAP-07-01).
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "POST",
      body: JSON.stringify({ qr_payload: payloadPourRdv(rdvBase(), INSTITUTION_B) }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Diallo");
    expect(JSON.stringify(body)).not.toContain("+224600000000");
  });

  it("5. QR déjà validé (presence_status=present) -> 400 cohérent, pas un 200 fantôme", async () => {
    fauxSupabaseCourant = creerFauxSupabase({
      rdv: [rdvBase({ presence_status: "present" })],
      users: [{ id: CITOYEN_ID, nom: "Diallo", prenom: "Aïssatou", phone: "+224600000000" }],
      institutions: [{ id: INSTITUTION_A, name: "Institution A" }],
    });
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_A, membreId: "m1", role: "agent" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "POST",
      body: JSON.stringify({ qr_payload: payloadPourRdv(rdvBase()) }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("6. un champ 'role'/'institutionId' ajouté dans le corps de la requête n'a aucun effet — seule l'identité issue du cookie JWT (mock getAuthenticatedMembre) compte", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_A, membreId: "m1", role: "comptable" });
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "POST",
      body: JSON.stringify({
        qr_payload: payloadPourRdv(rdvBase()),
        role: "admin",
        institutionId: INSTITUTION_A,
        membreId: "quelquun-dautre",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/qr/validate — autorisation (GAP-05-01)", () => {
  it("1. non authentifié -> 401", async () => {
    getAuthenticatedMembre.mockResolvedValue(null);
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "PUT",
      body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("2. rôle sans appointment.check_in -> 403, aucune écriture effectuée", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_A, membreId: "m1", role: "dirigeant" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "PUT",
      body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect(rdvSeedActuel[0].presence_status).toBeNull();
  });

  it("3. agent autorisé, bonne institution -> 200, présence confirmée", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_A, membreId: "m1", role: "agent" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "PUT",
      body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }),
    });
    const res = await PUT(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("4. agent d'une autre institution -> RDV introuvable, aucune confirmation possible", async () => {
    getAuthenticatedMembre.mockResolvedValue({ institutionId: INSTITUTION_B, membreId: "m2", role: "agent" });
    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/qr/validate", {
      method: "PUT",
      body: JSON.stringify({ rdv_id: RDV_ID, action: "present" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(404);
  });
});
