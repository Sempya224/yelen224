import { describe, it, expect } from "vitest";
import { delaiRestant, heureAmPm, heureDepuisHorodatage, libelleDateRelativeRdv, libelleRelatif } from "@/lib/heure";

const a = (hh: number, mm = 0, jour = 21) => new Date(2026, 9, jour, hh, mm, 0, 0);

describe("heureAmPm", () => {
  it.each([
    ["08:01:00", "8:01 AM"],
    ["00:05", "12:05 AM"],
    ["12:00:00", "12:00 PM"],
    ["14:30:00", "2:30 PM"],
    ["23:59", "11:59 PM"],
  ])("%s -> %s", (entree, attendu) => expect(heureAmPm(entree)).toBe(attendu));

  it.each([null, undefined, "", "abc", "24:00", "10:75"])("valeur invalide %s -> chaîne vide", (v) => expect(heureAmPm(v)).toBe(""));
});

describe("heureDepuisHorodatage (fuseau Conakry, UTC+0)", () => {
  it("indépendant du fuseau de la machine", () => {
    expect(heureDepuisHorodatage("2026-10-21T08:01:00Z")).toBe("8:01 AM");
    expect(heureDepuisHorodatage("2026-10-21T13:05:00Z")).toBe("1:05 PM");
    expect(heureDepuisHorodatage("2026-10-21T00:00:00Z")).toBe("12:00 AM");
  });
  it("ne contient jamais d'espace insécable", () => {
    expect(heureDepuisHorodatage("2026-10-21T13:05:00Z")).not.toMatch(/[  ]/);
  });
  it.each([null, undefined, "", "pas une date"])("valeur invalide %s -> chaîne vide", (v) => expect(heureDepuisHorodatage(v)).toBe(""));
});

describe("libelleRelatif et delaiRestant", () => {
  it("passé, futur, instant", () => {
    expect(libelleRelatif(a(8), a(10))).toBe("il y a 2 h");
    expect(libelleRelatif(a(10, 25), a(10))).toBe("dans 25 min");
    expect(libelleRelatif(a(10, 0), a(10, 0))).toBe("à l'instant");
    expect(libelleRelatif(a(8, 0, 24), a(8, 0, 21))).toBe("dans 3 j");
  });
  it("même précision que le compte à rebours : heures + minutes, jours + heures", () => {
    expect(libelleRelatif(a(11, 45), a(10))).toBe("dans 1 h 45 min");
    expect(libelleRelatif(a(8, 10), a(10))).toBe("il y a 1 h 50 min");
    expect(libelleRelatif(a(16, 0, 23), a(8, 0, 21))).toBe("dans 2 j 8 h");
    expect(libelleRelatif(a(8, 0, 21), a(16, 0, 23))).toBe("il y a 2 j 8 h");
  });
  it("au-delà de 30 jours : en mois", () => {
    const base = new Date(2026, 9, 21, 8, 0);
    const il = (jours: number) => new Date(base.getTime() - jours * 86400000);
    expect(libelleRelatif(il(29), base)).toBe("il y a 29 j");
    expect(libelleRelatif(il(30), base)).toBe("il y a 1 mois");
    expect(libelleRelatif(il(59), base)).toBe("il y a 1 mois");
    expect(libelleRelatif(il(65), base)).toBe("il y a 2 mois");
    expect(libelleRelatif(new Date(base.getTime() + 95 * 86400000), base)).toBe("dans 3 mois");
  });
  it("compte à rebours", () => {
    expect(delaiRestant(a(10, 30), a(10, 5))).toBe("25 min restantes");
    expect(delaiRestant(a(12, 30), a(10, 30))).toBe("2 h restantes");
    expect(delaiRestant(a(12, 15), a(10, 30))).toBe("1 h 45 min restantes");
    expect(delaiRestant(a(10, 30), a(10, 30))).toBe("délai dépassé");
    expect(delaiRestant(a(10, 0), a(10, 30))).toBe("délai dépassé");
  });
});

describe("libelleDateRelativeRdv", () => {
  it("aujourd'hui, demain, hier", () => {
    expect(libelleDateRelativeRdv("2026-10-21", "10:00:00", a(8))).toBe("Aujourd'hui, 10:00 AM · dans 2 h");
    expect(libelleDateRelativeRdv("2026-10-21", "08:00", a(10))).toBe("Aujourd'hui, 8:00 AM · il y a 2 h");
    expect(libelleDateRelativeRdv("2026-10-21", "08:01", a(10))).toBe("Aujourd'hui, 8:01 AM · il y a 1 h 59 min");
    expect(libelleDateRelativeRdv("2026-10-23", "16:00", a(8, 0, 21))).toMatch(/· dans 2 j 8 h$/);
    expect(libelleDateRelativeRdv("2026-10-22", "09:00", a(10))).toMatch(/^Demain, 9:00 AM · dans /);
    expect(libelleDateRelativeRdv("2026-10-20", "15:00", a(10))).toMatch(/^Hier, 3:00 PM · il y a /);
  });
  it("date lointaine : jour court, jamais d'heure 24 h", () => {
    const l = libelleDateRelativeRdv("2026-11-05", "14:30", a(10));
    expect(l).toContain("2:30 PM");
    expect(l).not.toContain("14:30");
  });
  it("date invalide -> chaîne vide", () => {
    expect(libelleDateRelativeRdv("n/a", "10:00", a(10))).toBe("");
  });
});
