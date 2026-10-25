import { describe, it, expect } from "vitest";
import { messageControleBase } from "./reservationErreurs";

describe("messageControleBase", () => {
  it("traduit chaque code de contrôle en message français sans fuite technique", () => {
    for (const code of ["INSTITUTION_INDISPONIBLE", "DATE_PASSEE", "DATES_INVALIDES", "PRIX_INVALIDE"]) {
      const m = messageControleBase(`P0001: ${code} CONTEXT: PL/pgSQL function paid_bookings_figer_montant()`);
      expect(m).toBeTruthy();
      expect(m).not.toContain(code);
      expect(m).not.toContain("PL/pgSQL");
    }
  });

  it("renvoie null pour un code inconnu, vide ou absent", () => {
    expect(messageControleBase("duplicate key value")).toBeNull();
    expect(messageControleBase("")).toBeNull();
    expect(messageControleBase(null)).toBeNull();
    expect(messageControleBase(undefined)).toBeNull();
  });
});
