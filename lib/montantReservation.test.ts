import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculerMontantReservation } from "./montantReservation";
import cas from "./montantReservation.cas.json";

// Cas partagés avec la règle SQL calculer_montant_reservation (migration
// 20261025000001). Le script docs/security/VERIFICATION_MONTANT_RESERVATION.sql
// rejoue les mêmes cas côté base ; ce test garantit que les deux listes ne
// dérivent pas l'une de l'autre.
describe("cas partagés SQL / TypeScript", () => {
  it.each(cas)("$id — $libelle", (c) => {
    const r = calculerMontantReservation({ prix: c.prix, dateRdv: c.dateRdv, dateDepart: c.dateDepart });
    if (c.code) expect(r).toEqual({ ok: false, code: c.code });
    else expect(r).toEqual({ ok: true, montant: c.montant, nuits: c.nuits });
  });

  it("le script de vérification SQL contient exactement ces cas", () => {
    const sql = readFileSync(join(__dirname, "../docs/security/VERIFICATION_MONTANT_RESERVATION.sql"), "utf8");
    const lignes = sql.split("\n").filter(l => l.trim().startsWith("-- cas:")).map(l => l.trim().replace("-- cas: ", ""));
    const attendues = cas.map(c => [c.id, c.prix, c.dateRdv, c.dateDepart ?? "-", c.nuits ?? "-", c.montant ?? "-", c.code ?? "-"].join(" | "));
    expect(lignes).toEqual(attendues);
  });
});

describe("calculerMontantReservation", () => {
  it("1 nuit : prix × 1", () => {
    expect(calculerMontantReservation({ prix: 150000, dateRdv: "2026-08-06", dateDepart: "2026-08-07" }))
      .toEqual({ ok: true, montant: 150000, nuits: 1 });
  });

  it("3 nuits : prix × 3", () => {
    expect(calculerMontantReservation({ prix: 150000, dateRdv: "2026-08-06", dateDepart: "2026-08-09" }))
      .toEqual({ ok: true, montant: 450000, nuits: 3 });
  });

  it("service non hôtel (sans date_depart) : prix seul, quelle que soit la forme de l'absence", () => {
    for (const depart of [null, undefined, ""]) {
      expect(calculerMontantReservation({ prix: 5000, dateRdv: "2026-08-06", dateDepart: depart }))
        .toEqual({ ok: true, montant: 5000, nuits: 1 });
    }
  });

  it("service gratuit (prix 0) : montant 0", () => {
    expect(calculerMontantReservation({ prix: 0, dateRdv: "2026-08-06", dateDepart: "2026-08-08" }))
      .toEqual({ ok: true, montant: 0, nuits: 2 });
  });

  it("départ égal à l'arrivée ou antérieur : DATES_INVALIDES", () => {
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "2026-08-06", dateDepart: "2026-08-06" })).toEqual({ ok: false, code: "DATES_INVALIDES" });
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "2026-08-06", dateDepart: "2026-08-05" })).toEqual({ ok: false, code: "DATES_INVALIDES" });
  });

  it("dates illisibles : DATES_INVALIDES", () => {
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "pas-une-date", dateDepart: "2026-08-07" })).toEqual({ ok: false, code: "DATES_INVALIDES" });
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "2026-08-06", dateDepart: "2026-13-40" })).toEqual({ ok: false, code: "DATES_INVALIDES" });
  });

  it("prix invalide (négatif, NaN, Infinity) : PRIX_INVALIDE", () => {
    for (const prix of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(calculerMontantReservation({ prix, dateRdv: "2026-08-06", dateDepart: null })).toEqual({ ok: false, code: "PRIX_INVALIDE" });
    }
  });

  it("changement d'heure d'été (France) et fin d'année : nombre de nuits calendaire exact", () => {
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "2026-03-28", dateDepart: "2026-03-30" })).toMatchObject({ ok: true, nuits: 2 });
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "2026-12-30", dateDepart: "2027-01-02" })).toMatchObject({ ok: true, nuits: 3 });
  });

  it("une partie heure éventuelle dans la date est ignorée", () => {
    expect(calculerMontantReservation({ prix: 1000, dateRdv: "2026-08-06T22:00:00Z", dateDepart: "2026-08-08" })).toMatchObject({ ok: true, nuits: 2 });
  });
});
