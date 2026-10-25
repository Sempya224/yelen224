// Comparaison du moteur sur DONNÉES RÉELLES (Lot 2, préalable à la migration).
// Ignoré tant que la variable RAPPORT_HEBDO_ENTREE n'est pas définie : ne
// touche jamais la base, lit uniquement un fichier JSON exporté par Bryan
// avec docs/rapport-hebdomadaire/lot2/VERIFICATION_MOTEUR.sql (requête B).
// Affiche un tableau par semaine à comparer ligne à ligne avec la requête A.
//   PowerShell : $env:RAPPORT_HEBDO_ENTREE="C:\chemin\entree.json"; npx vitest run lib/rapportHebdo.reel.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { calculerRapportHebdo, derniereSemaineComplete, type EntreeRapportHebdo } from "./rapportHebdo";

const chemin = process.env.RAPPORT_HEBDO_ENTREE;

describe.skipIf(!chemin)("Moteur sur données réelles (comparaison SQL indépendante)", () => {
  it("calcule chaque semaine complète et affiche les indicateurs à comparer", () => {
    const brut = JSON.parse(readFileSync(chemin as string, "utf8")) as Omit<EntreeRapportHebdo, "lundi" | "maintenant" | "clientsServisAvant">;
    const maintenant = new Date();
    const dernier = derniereSemaineComplete(maintenant);
    const premiereDate = [...brut.rdv.map(r => r.created_at), ...brut.paiements.map(p => p.created_at)].sort()[0];
    let lundi = premiereDate ? derniereSemaineCompleteDepuis(new Date(premiereDate)) : dernier.lundi;
    const lignes: Record<string, number | string>[] = [];
    while (lundi <= dernier.lundi) {
      const debutMs = Date.parse(`${lundi}T00:00:00.000Z`);
      const servisAvant = brut.rdv.filter(r => r.statut === "termine" && r.citoyen_id && r.date_rdv < lundi).map(r => r.citoyen_id as string);
      const r = calculerRapportHebdo({ ...brut, lundi, maintenant: maintenant.toISOString(), clientsServisAvant: servisAvant });
      const g = r.rdvGratuits.actuel;
      lignes.push({
        lundi,
        demandes: g.demandesRecues, acceptees: g.acceptees, realisees: g.realisees,
        annulations: g.annulations.total, suspension: g.annulationsParSuspension, absences: g.absences,
        non_traites: g.nonTraites, ecrasements_nq: g.ecrasementsNonQualifies,
        base_realisation: g.tauxRealisation.base, base_annulation: g.tauxAnnulation.base,
        clients_servis: g.clientsDistinctsServis, nouveaux: g.nouveauxClients,
        reservations_payantes: r.paiements.actuel.reservationsRecues,
        encaisse: r.paiements.actuel.encaisse.montant, nb_encaisse: r.paiements.actuel.encaisse.nbEncaissements,
        vide: r.vide ? "oui" : "non",
      });
      lundi = new Date(debutMs + 7 * 86_400_000).toISOString().slice(0, 10);
    }
    console.table(lignes.filter(l => l.vide === "non"));
    expect(lignes.length).toBeGreaterThan(0);
  });
});

function derniereSemaineCompleteDepuis(d: Date): string {
  const jour = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const decalage = (new Date(jour).getUTCDay() + 6) % 7;
  return new Date(jour - decalage * 86_400_000).toISOString().slice(0, 10);
}
