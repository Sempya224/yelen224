import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// Mission A (22/10/2026) — api/qr/generate ne doit jamais régénérer le
// qr_token d'un RDV lié à une réservation payante : ce qr_token est le code
// de confirmation (6 chiffres) qui sert de clé de rattachement. Données fictives.
// ─────────────────────────────────────────────────────────────────────────

type Ligne = Record<string, unknown>;

const INSTITUTION = "i0000000-0000-0000-0000-000000000001";
const CITOYEN = "c0000000-0000-0000-0000-000000000001";
const AUTRE_CITOYEN = "c0000000-0000-0000-0000-000000000002";

let tables: Record<string, Ligne[]>;
let ecrituresRdv: { id: unknown; updates: Ligne }[];
let erreurPaidBookings: string | null;

function creerFauxSupabase() {
  return {
    auth: {
      async getUser(token: string) {
        return token === "jeton-citoyen" ? { data: { user: { id: CITOYEN } }, error: null } : { data: { user: null }, error: { message: "jeton invalide" } };
      },
    },
    from(table: string) {
      const predicats: ((r: Ligne) => boolean)[] = [];
      let op: "select" | "update" = "select";
      let payload: Ligne = {};
      let limite: number | null = null;
      function executer(): { data: unknown; error: unknown } {
        if (table === "paid_bookings" && erreurPaidBookings) return { data: null, error: { message: erreurPaidBookings } };
        const rows = tables[table].filter((r) => predicats.every((p) => p(r)));
        if (op === "update") {
          rows.forEach((r) => Object.assign(r, payload));
          rows.forEach((r) => ecrituresRdv.push({ id: r.id, updates: payload }));
          return { data: null, error: null };
        }
        return { data: limite !== null ? rows.slice(0, limite) : rows, error: null };
      }
      const builder = {
        select() { return builder; },
        update(p: Ligne) { op = "update"; payload = p; return builder; },
        eq(col: string, val: unknown) { predicats.push((r) => r[col] === val); return builder; },
        limit(n: number) { limite = n; return builder; },
        async single() {
          const rows = executer().data as Ligne[];
          return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
        },
        then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
          return Promise.resolve(executer()).then(onOk, onErr);
        },
      };
      return builder;
    },
  };
}
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxCourant) }));
let fauxCourant: ReturnType<typeof creerFauxSupabase>;

function rdv(id: string, extra: Ligne = {}): Ligne {
  return {
    id, citoyen_id: CITOYEN, institution_id: INSTITUTION, date_rdv: "2099-01-01", heure_rdv: "10:00:00", statut: "nouveau",
    presence_status: null, qr_token: null, qr_expires_at: null, qr_regenere_le: null, code_secours: null, ...extra,
  };
}
function reservation(id: string, extra: Ligne = {}): Ligne {
  return { id, citoyen_id: CITOYEN, institution_id: INSTITUTION, confirmation_code: "123456", rdv_id: null, ...extra };
}
function requete(rdvId: string, jeton = "jeton-citoyen") {
  return new NextRequest("http://localhost/api/qr/generate", {
    method: "POST", headers: { authorization: `Bearer ${jeton}` }, body: JSON.stringify({ rdv_id: rdvId }),
  });
}
async function importRoute() { return await import("./route"); }

beforeEach(() => {
  vi.resetModules();
  process.env.QR_SECRET_KEY = "secret-de-test";
  ecrituresRdv = [];
  erreurPaidBookings = null;
  tables = { rdv: [rdv("R-GRATUIT")], paid_bookings: [] };
  fauxCourant = creerFauxSupabase();
});

describe("POST /api/qr/generate — protection des RDV payants", () => {
  it("RDV gratuit : le QR est généré et enregistré (comportement inchangé)", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete("R-GRATUIT"));
    const corps = await res.json();
    expect(res.status).toBe(200);
    expect(corps.success).toBe(true);
    expect(typeof corps.qr_token).toBe("string");
    expect(ecrituresRdv.map((e) => e.id)).toEqual(["R-GRATUIT"]);
  });

  it("RDV lié par rdv_id à une réservation payante : 409 RDV_PAYANT, aucun qr_token touché", async () => {
    tables.rdv = [rdv("R-PAYANT", { qr_token: "123456" })];
    tables.paid_bookings = [reservation("B1", { rdv_id: "R-PAYANT" })];
    const { POST } = await importRoute();
    const res = await POST(requete("R-PAYANT"));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.code).toBe("RDV_PAYANT");
    expect(ecrituresRdv).toHaveLength(0);
    expect(tables.rdv[0].qr_token).toBe("123456");
  });

  it("RDV lié par le code (rdv_id vide) : 409 également, aucune écriture", async () => {
    tables.rdv = [rdv("R-PAYANT", { qr_token: "123456" })];
    tables.paid_bookings = [reservation("B1")];
    const { POST } = await importRoute();
    const res = await POST(requete("R-PAYANT"));
    expect(res.status).toBe(409);
    expect(ecrituresRdv).toHaveLength(0);
  });

  it("une réservation d'un autre citoyen au même code ne bloque pas un RDV gratuit", async () => {
    tables.rdv = [rdv("R-GRATUIT", { qr_token: "123456" })];
    tables.paid_bookings = [reservation("B9", { citoyen_id: AUTRE_CITOYEN })];
    const { POST } = await importRoute();
    expect((await POST(requete("R-GRATUIT"))).status).toBe(200);
  });

  it("vérification impossible : 500 et aucune écriture (fail closed)", async () => {
    erreurPaidBookings = "connexion perdue";
    const { POST } = await importRoute();
    const res = await POST(requete("R-GRATUIT"));
    expect(res.status).toBe(500);
    expect(ecrituresRdv).toHaveLength(0);
  });

  it("jeton invalide : 401", async () => {
    const { POST } = await importRoute();
    expect((await POST(requete("R-GRATUIT", "mauvais"))).status).toBe(401);
  });
});
