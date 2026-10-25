import { describe, expect, it } from "vitest";
import type { RapportExecutif } from "@/lib/rapportsAggregation";
import { calculerHashContenu, type EnveloppeExport } from "./canonique";
import {
  construireFiltresRapportSignes, construireModeleRapport, libelleVariation, mentionLimiteRapport, sectionsPdfRapport,
} from "./rapportsLignes";

function rapport(surcharge: Partial<RapportExecutif> = {}): RapportExecutif {
  const k = (montant: number, nb: number, delta: number | null) => ({ montant, nb, delta });
  const serie = (label: string, montant: number, ventes: number) => ({ label, montant, ventes });
  return {
    genere_le: "2026-10-25T10:00:00.000Z",
    kpi: { aujourdhui: k(50000, 1, null), semaine: k(300000, 4, 12.5), mois: k(900000, 12, -3.2), annee: k(9000000, 120, 0) },
    sparklines: { aujourdhui: [], semaine: [], mois: [], annee: [] },
    evolution: { jour: [], semaine: [], mois: [], annee: [serie("Jan", 100000, 2), serie("Fév", 250000, 5)] },
    top_services: [
      { id: "s1", nom: "Consultation", categorie: "Santé", nb: 80, montant: 6000000, delta: 8, partCA: 66.7, dureeMinutes: 30 },
      { id: "s2", nom: "=CMD()", categorie: "Divers", nb: 5, montant: 250000, delta: null, partCA: 2.8, dureeMinutes: null },
    ],
    repartition_categories: [{ categorie: "Santé", montant: 6000000, pct: 66.7 }, { categorie: "Divers", montant: 250000, pct: 2.8 }],
    activite_jour: [], meilleur_jour_semaine: null,
    resume: ["Le chiffre d'affaires du mois est en baisse.", "Consultation est le service le plus vendu."],
    ...surcharge,
  };
}

function enveloppe(lignes: Record<string, string | number | null>[]): EnveloppeExport {
  return {
    reference: "YL-EXP-2026-00000003", type: "rapport_financier", format: "xlsx", institution_id: "11111111-1111-1111-1111-111111111111",
    auteur_id: null, role: "admin", filtres: { perimetre: "annee_en_cours_et_precedente" }, nb_lignes: lignes.length,
    version_gabarit: "rapport-financier-1", cree_le: "2026-10-25T10:05:00.000Z", lignes,
  };
}

describe("contenu signé du rapport", () => {
  it("aplatit chaque section en lignes { section, ... } avec montants et pourcentages en nombres", () => {
    const m = construireModeleRapport(rapport());
    const parSection = (s: string) => m.lignes.filter(l => l.section === s);
    expect(parSection("meta")).toEqual([{ section: "meta", genere_le: "2026-10-25T10:00:00.000Z" }]);
    expect(parSection("kpi")).toHaveLength(4);
    expect(parSection("kpi")[1]).toEqual({ section: "kpi", periode: "Cette semaine", montant: 300000, ventes: 4, variation_pct: 12.5 });
    expect(parSection("kpi")[0].variation_pct).toBeNull();
    expect(parSection("top_services")).toHaveLength(2);
    expect(parSection("top_services")[0]).toMatchObject({ service: "Consultation", ventes: 80, montant: 6000000, variation_pct: 8, part_ca_pct: 66.7, duree_min: 30 });
    expect(parSection("top_services")[1].duree_min).toBeNull();
    expect(parSection("repartition_categories")).toHaveLength(2);
    expect(parSection("evolution_mensuelle")).toEqual([
      { section: "evolution_mensuelle", mois: "Jan", montant: 100000, ventes: 2 },
      { section: "evolution_mensuelle", mois: "Fév", montant: 250000, ventes: 5 },
    ]);
    expect(parSection("resume")).toHaveLength(2);
    expect(m.lignes).toHaveLength(1 + 4 + 2 + 2 + 2 + 2);
  });
  it("retrouve cellule par cellule les lignes signées dans les 4 feuilles du fichier", () => {
    const m = construireModeleRapport(rapport());
    expect(m.feuilles.map(f => f.nom)).toEqual(["Résumé", "Top services", "Répartition catégories", "Évolution mensuelle"]);
    const sections = ["kpi", "top_services", "repartition_categories", "evolution_mensuelle"];
    const sansSection = (l: Record<string, string | number | null>) => { const copie = { ...l }; delete copie.section; return copie; };
    m.feuilles.forEach((f, i) => {
      const signees = m.lignes.filter(l => l.section === sections[i]).map(sansSection);
      expect(f.lignes).toEqual(signees);
    });
    expect(m.feuilles[0].synthese).toEqual(rapport().resume);
  });
  it("neutralise l'injection de formule dans les textes", () => {
    const l = construireModeleRapport(rapport()).lignes.find(x => x.section === "top_services" && x.ventes === 5)!;
    expect(l.service).toBe("'=CMD()");
  });
  it("détecte l'altération d'un montant, d'un pourcentage ou d'une phrase", () => {
    const m = construireModeleRapport(rapport());
    const original = calculerHashContenu(enveloppe(m.lignes));
    const modifier = (f: (l: Record<string, string | number | null>) => boolean, cle: string, valeur: string | number | null) =>
      calculerHashContenu(enveloppe(m.lignes.map(l => (f(l) ? { ...l, [cle]: valeur } : l))));
    expect(modifier(l => l.section === "kpi" && l.periode === "Ce mois", "montant", 1)).not.toBe(original);
    expect(modifier(l => l.section === "top_services" && l.service === "Consultation", "part_ca_pct", 99)).not.toBe(original);
    expect(modifier(l => l.section === "resume" && l.phrase !== undefined, "phrase", "autre")).not.toBe(original);
    expect(calculerHashContenu(enveloppe([...m.lignes].reverse()))).toBe(original);
  });
  it("signe la limite de réservations seulement si elle est atteinte", () => {
    expect(construireFiltresRapportSignes(false, 5000)).toEqual({ perimetre: "annee_en_cours_et_precedente" });
    expect(construireFiltresRapportSignes(true, 5000)).toEqual({ perimetre: "annee_en_cours_et_precedente", limite_reservations: 5000, limite_atteinte: true });
    expect(mentionLimiteRapport(5000)).toBe("Chiffres calculés sur les 5000 réservations les plus récentes.");
  });
});

describe("sections du PDF du rapport", () => {
  it("produit cartes KPI, résumé, top services et répartition", () => {
    const s = sectionsPdfRapport(rapport());
    expect(s.map(x => x.type)).toEqual(["kpis", "liste", "tableau", "tableau"]);
    const kpis = s[0];
    if (kpis.type !== "kpis") throw new Error("sections inattendues");
    expect(kpis.items.map(i => i.label)).toEqual(["Aujourd'hui", "Cette semaine", "Ce mois", "Cette année"]);
    expect(kpis.items[0]).toMatchObject({ valeur: "50 000 GNF", detail: "— · 1 vente", ton: "neutre" });
    expect(kpis.items[1]).toMatchObject({ valeur: "300 000 GNF", detail: "+12.5% · 4 ventes", ton: "positif" });
    expect(kpis.items[2]).toMatchObject({ detail: "-3.2% · 12 ventes", ton: "negatif" });
    const top = s[2];
    if (top.type !== "tableau") throw new Error("sections inattendues");
    expect(top.lignes[0]).toMatchObject({ service: "Consultation", montant: "6 000 000 GNF", variation: "+8%", part: "66.7%" });
    expect(libelleVariation(null)).toBe("—");
  });
});
