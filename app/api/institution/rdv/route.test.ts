import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// Mission A, étape 3 (22/10/2026) — jointure RDV <-> réservation payante de
// GET /api/institution/rdv. Avant : par créneau (date + heure), sans citoyen,
// donc deux citoyens au même horaire se voyaient attribuer le paiement l'un
// de l'autre, et les réservations annulées étaient ignorées (un RDV payant
// annulé apparaissait « Gratuit »). Données fictives.
// ─────────────────────────────────────────────────────────────────────────

type Ligne = Record<string, unknown>;

const INSTITUTION = "i0000000-0000-0000-0000-000000000001";
const C1 = "c0000000-0000-0000-0000-000000000001";
const C2 = "c0000000-0000-0000-0000-000000000002";
const C3 = "c0000000-0000-0000-0000-000000000003";
const CRENEAU = { date_rdv: "2026-08-06", heure_rdv: "01:40:00" };

vi.mock("@/lib/institutionAuth", () => ({
  getAuthenticatedMembre: vi.fn(async () => ({ institutionId: "i0000000-0000-0000-0000-000000000001", membreId: "m1", role: "admin", accesRestreints: [] })),
}));

let tables: Record<string, Ligne[]>;

function creerFauxSupabase() {
  return {
    from(table: string) {
      if (!(table in tables)) throw new Error(`table non simulée: ${table}`);
      const predicats: ((r: Ligne) => boolean)[] = [];
      let limite: number | null = null;
      const builder = {
        select() { return builder; },
        eq(col: string, val: unknown) { predicats.push((r) => r[col] === val); return builder; },
        in(col: string, vals: unknown[]) { predicats.push((r) => vals.includes(r[col])); return builder; },
        order() { return builder; },
        limit(n: number) { limite = n; return builder; },
        then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
          let rows = tables[table].filter((r) => predicats.every((p) => p(r)));
          if (limite !== null) rows = rows.slice(0, limite);
          return Promise.resolve({ data: rows, error: null }).then(onOk, onErr);
        },
      };
      return builder;
    },
  };
}
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxCourant) }));
let fauxCourant: ReturnType<typeof creerFauxSupabase>;

function rdv(id: string, citoyen: string, qrToken: string | null, extra: Ligne = {}): Ligne {
  return { id, institution_id: INSTITUTION, citoyen_id: citoyen, ...CRENEAU, statut: "nouveau", qr_token: qrToken, objet: "[Transfert]", created_at: "2026-08-01T10:00:00Z", ...extra };
}
function reservation(id: string, citoyen: string, code: string, rdvId: string | null, extra: Ligne = {}): Ligne {
  return {
    id, institution_id: INSTITUTION, citoyen_id: citoyen, confirmation_code: code, rdv_id: rdvId, statut: "en_attente",
    paid_services: { nom: "Transfert d'argent", prix: 2000 }, ...extra,
  };
}

type RdvReponse = { id: string; est_payant: boolean; service_payant_nom: string | null; service_payant_prix: number | null; booking_payant_id: string | null } & Ligne;
async function appeler(): Promise<{ status: number; rdvs: RdvReponse[]; brut: string }> {
  const { GET } = await import("./route");
  const res = await GET(new NextRequest("http://localhost/api/institution/rdv"));
  const brut = await res.text();
  return { status: res.status, rdvs: (JSON.parse(brut).rdvs ?? []) as RdvReponse[], brut };
}
const parId = (rdvs: RdvReponse[], id: string) => rdvs.find((r) => r.id === id)!;

beforeEach(() => {
  vi.resetModules();
  tables = {
    users: [
      { id: C1, prenom: "Aïssatou", nom: "Test", phone: "+224600000001", photo_url: null },
      { id: C2, prenom: "Moussa", nom: "Exemple", phone: "+224600000002", photo_url: null },
      { id: C3, prenom: "Fatoumata", nom: "Fictive", phone: "+224600000003", photo_url: null },
    ],
    rdv: [],
    paid_bookings: [],
    avis: [],
  };
  fauxCourant = creerFauxSupabase();
});

describe("GET /api/institution/rdv — jointure paiement", () => {
  it("deux RDV au même créneau (un payant, un gratuit) : seul le payant est marqué", async () => {
    tables.rdv.push(rdv("RA", C1, "111111"), rdv("RB", C2, null));
    tables.paid_bookings.push(reservation("BA", C1, "111111", "RA"));
    const { status, rdvs } = await appeler();
    expect(status).toBe(200);
    expect(parId(rdvs, "RA")).toMatchObject({ est_payant: true, service_payant_nom: "Transfert d'argent", service_payant_prix: 2000, booking_payant_id: "BA" });
    expect(parId(rdvs, "RB")).toMatchObject({ est_payant: false, service_payant_nom: null, service_payant_prix: null, booking_payant_id: null });
  });

  it("deux RDV payants au même créneau : chacun garde SA réservation", async () => {
    tables.rdv.push(rdv("RA", C1, "111111"), rdv("RB", C2, "222222"));
    tables.paid_bookings.push(reservation("BA", C1, "111111", "RA"), reservation("BB", C2, "222222", "RB", { paid_services: { nom: "Ouverture de compte", prix: 5000 } }));
    const { rdvs } = await appeler();
    expect(parId(rdvs, "RA").booking_payant_id).toBe("BA");
    expect(parId(rdvs, "RB")).toMatchObject({ booking_payant_id: "BB", service_payant_nom: "Ouverture de compte", service_payant_prix: 5000 });
  });

  it("RDV payant dont la réservation est annulée : toujours marqué payant, jamais « Gratuit »", async () => {
    tables.rdv.push(rdv("RA", C1, "111111", { statut: "annule" }));
    tables.paid_bookings.push(reservation("BA", C1, "111111", "RA", { statut: "annule" }));
    const { rdvs } = await appeler();
    expect(parId(rdvs, "RA")).toMatchObject({ est_payant: true, booking_payant_id: "BA" });
  });

  it("rdv_id vide, un seul RDV pour code + citoyen : repli accepté", async () => {
    tables.rdv.push(rdv("RC", C3, "333333"), rdv("RB", C2, null));
    tables.paid_bookings.push(reservation("BC", C3, "333333", null));
    const { rdvs } = await appeler();
    expect(parId(rdvs, "RC")).toMatchObject({ est_payant: true, booking_payant_id: "BC" });
    expect(parId(rdvs, "RB").est_payant).toBe(false);
  });

  it("rdv_id vide et deux RDV pour ce code + citoyen : aucun marqué (ambigu)", async () => {
    tables.rdv.push(rdv("RC1", C3, "333333"), rdv("RC2", C3, "333333"));
    tables.paid_bookings.push(reservation("BC", C3, "333333", null));
    const { rdvs } = await appeler();
    expect(parId(rdvs, "RC1").est_payant).toBe(false);
    expect(parId(rdvs, "RC2").est_payant).toBe(false);
  });

  it("rdv_id vide et deux réservations pour ce code + citoyen : aucun RDV marqué (ambigu)", async () => {
    tables.rdv.push(rdv("RC", C3, "333333"));
    tables.paid_bookings.push(reservation("BC1", C3, "333333", null), reservation("BC2", C3, "333333", null));
    expect(parId((await appeler()).rdvs, "RC").est_payant).toBe(false);
  });

  it("réservation sans aucun lien fiable : aucun RDV du même créneau n'est marqué payant", async () => {
    tables.rdv.push(rdv("RB", C2, null), rdv("RD", C1, null)); // même créneau que la réservation orpheline
    tables.paid_bookings.push(reservation("BX", C1, "999999", null, { ...CRENEAU }));
    const { rdvs } = await appeler();
    expect(parId(rdvs, "RB").est_payant).toBe(false);
    expect(parId(rdvs, "RD").est_payant).toBe(false);
  });

  it("rdv_id prioritaire sur le repli : un autre RDV portant le même code n'est pas marqué", async () => {
    tables.rdv.push(rdv("R1", C1, null), rdv("R2", C1, "111111"));
    tables.paid_bookings.push(reservation("B1", C1, "111111", "R1"));
    const { rdvs } = await appeler();
    expect(parId(rdvs, "R1").booking_payant_id).toBe("B1");
    expect(parId(rdvs, "R2").est_payant).toBe(false);
  });

  it("qr_token n'est jamais renvoyé au navigateur", async () => {
    tables.rdv.push(rdv("RA", C1, "SECRET-TOKEN-123"));
    tables.paid_bookings.push(reservation("BA", C1, "111111", "RA"));
    const { rdvs, brut } = await appeler();
    expect("qr_token" in parId(rdvs, "RA")).toBe(false);
    expect(brut).not.toContain("SECRET-TOKEN-123");
  });

  it("la forme de la réponse est inchangée", async () => {
    tables.rdv.push(rdv("RA", C1, "111111"));
    tables.paid_bookings.push(reservation("BA", C1, "111111", "RA"));
    const { rdvs } = await appeler();
    const r = parId(rdvs, "RA");
    for (const cle of ["id", "objet", "date_rdv", "heure_rdv", "statut", "citoyen_id", "citoyen_nom", "citoyen_phone", "citoyen_photo", "est_payant", "service_payant_nom", "service_payant_prix", "booking_payant_id"]) {
      expect(cle in r).toBe(true);
    }
    expect(r.citoyen_nom).toBe("Aïssatou Test");
  });
});
