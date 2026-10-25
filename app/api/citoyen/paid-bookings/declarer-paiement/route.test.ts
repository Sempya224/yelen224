import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Lot 1a — montant figé à la déclaration : prix × nuits pour un séjour hôtel,
// prix seul sinon, jamais recalculé si montant_paye est déjà figé, erreurs
// génériques. Données fictives.

type Ligne = Record<string, unknown>;

const CITOYEN = "c0000000-0000-0000-0000-000000000001";
const AUTRE_CITOYEN = "c0000000-0000-0000-0000-000000000002";

vi.mock("@/lib/citoyenAuth", () => ({ verifierCitoyenToken: vi.fn(async () => ({ id: mocksCitoyen.id })) }));
const mocksCitoyen = vi.hoisted(() => ({ id: "c0000000-0000-0000-0000-000000000001" }));

let bookings: Ligne[];
let prixService: number | null;
let erreurLecture: { message: string } | null;
let erreurEcriture: { message: string } | null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from() {
      const predicats: ((r: Ligne) => boolean)[] = [];
      let update: Ligne | null = null;
      const builder = {
        select() { return builder; },
        update(p: Ligne) { update = p; return builder; },
        eq(col: string, val: unknown) { predicats.push((r) => r[col] === val); return builder; },
        async maybeSingle() {
          if (erreurLecture) return { data: null, error: erreurLecture };
          const r = bookings.find((b) => predicats.every((p) => p(b)));
          return { data: r ? { ...r, paid_services: prixService === null ? null : { prix: prixService } } : null, error: null };
        },
        then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
          if (erreurEcriture) return Promise.resolve({ error: erreurEcriture }).then(onOk, onErr);
          bookings.filter((b) => predicats.every((p) => p(b))).forEach((b) => Object.assign(b, update));
          return Promise.resolve({ error: null }).then(onOk, onErr);
        },
      };
      return builder;
    },
  })),
}));

function reservation(extra: Ligne = {}): Ligne {
  return {
    id: "B1", citoyen_id: CITOYEN, statut: "en_attente", montant_paye: null, declare_le: null,
    date_rdv: "2026-08-06", date_depart: null, ...extra,
  };
}
const requete = (corps: unknown) =>
  new NextRequest("http://localhost/api/citoyen/paid-bookings/declarer-paiement", {
    method: "POST", headers: { authorization: "Bearer jeton" }, body: JSON.stringify(corps),
  });
async function importRoute() { return await import("./route"); }

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocksCitoyen.id = CITOYEN;
  bookings = [reservation()];
  prixService = 150000;
  erreurLecture = null;
  erreurEcriture = null;
});

describe("declarer-paiement — montant figé", () => {
  it("service non hôtel : prix seul", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.montant).toBe(150000);
    expect(bookings[0]).toMatchObject({ montant_paye: 150000, montant_declare_citoyen: 150000 });
  });

  it("séjour 1 nuit : prix × 1", async () => {
    bookings = [reservation({ date_depart: "2026-08-07" })];
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect((await res.json()).montant).toBe(150000);
  });

  it("séjour 3 nuits : prix × 3 écrit dans montant_paye ET montant_declare_citoyen", async () => {
    bookings = [reservation({ date_depart: "2026-08-09" })];
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect((await res.json()).montant).toBe(450000);
    expect(bookings[0]).toMatchObject({ montant_paye: 450000, montant_declare_citoyen: 450000 });
    expect(bookings[0].declare_le).toBeTruthy();
  });

  it("montant_paye déjà figé : repris tel quel, jamais multiplié une seconde fois", async () => {
    bookings = [reservation({ date_depart: "2026-08-09", montant_paye: 150000 })];
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect((await res.json()).montant).toBe(150000);
    expect(bookings[0].montant_paye).toBe(150000);
  });

  it("montant figé à la réservation : repris tel quel même si le prix du service a changé depuis", async () => {
    bookings = [reservation({ date_depart: "2026-08-09", montant_total_reserve: 450000 })];
    prixService = 999999;
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect((await res.json()).montant).toBe(450000);
    expect(bookings[0]).toMatchObject({ montant_paye: 450000, montant_declare_citoyen: 450000 });
  });

  it("montant_paye prime sur montant_total_reserve", async () => {
    bookings = [reservation({ montant_paye: 150000, montant_total_reserve: 450000 })];
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect((await res.json()).montant).toBe(150000);
  });

  it("montant figé présent : des dates incohérentes ne bloquent pas la déclaration", async () => {
    bookings = [reservation({ date_depart: "2026-08-06", montant_total_reserve: 150000 })];
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect(res.status).toBe(200);
  });

  it("date de départ ≤ arrivée : 409 DATES_INVALIDES, rien d'écrit", async () => {
    bookings = [reservation({ date_depart: "2026-08-06" })];
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DATES_INVALIDES");
    expect(bookings[0].declare_le).toBeNull();
    expect(bookings[0].montant_paye).toBeNull();
  });

  it("prix du service introuvable : 400 MONTANT_INTROUVABLE", async () => {
    prixService = null;
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("MONTANT_INTROUVABLE");
  });

  it("réservation d'un autre citoyen : 404 ; déjà déclarée : 409", async () => {
    const { POST } = await importRoute();
    mocksCitoyen.id = AUTRE_CITOYEN;
    expect((await POST(requete({ paid_booking_id: "B1" }))).status).toBe(404);
    mocksCitoyen.id = CITOYEN;
    bookings = [reservation({ declare_le: "2026-08-06T01:00:00Z" })];
    const res = await POST(requete({ paid_booking_id: "B1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DEJA_DECLARE");
  });
});

describe("declarer-paiement — erreurs génériques", () => {
  it("erreur de lecture : ERREUR_SERVEUR sans message technique", async () => {
    erreurLecture = { message: 'column "date_depart" does not exist' };
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    const texte = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(texte).toContain("ERREUR_SERVEUR");
    expect(texte).not.toContain("date_depart");
  });

  it("erreur d'écriture : ERREUR_SERVEUR sans message technique", async () => {
    erreurEcriture = { message: "deadlock detected" };
    const { POST } = await importRoute();
    const res = await POST(requete({ paid_booking_id: "B1" }));
    const texte = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(texte).toContain("ERREUR_SERVEUR");
    expect(texte).not.toContain("deadlock");
  });
});
