// Dérivation de rappels pour la section "Vos démarches en cours" de
// l'Accueil citoyen. Logique de retard/prochaine échéance généralisée
// depuis app/compte/mes-demarches/mes-demarches-client.tsx
// (estEnRetard/texteTempsRestant) — cet écran garde sa propre copie
// inline, non modifié pour limiter le risque de régression. Même
// discipline que lib/citoyenTendances.ts : zéro IA, déterministe,
// aucune démarche affichée si aucune n'est en cours (jamais de section
// vide/cassée).

export type EtapeRappel = { libelle: string; date_echeance: string | null; fait: boolean; ordre: number };

// `categorie`/`priorite` ajoutés le 24/08/2026 pour la modernisation de la
// carte "Vos démarches en cours" (Accueil) — colonnes déjà présentes sur
// citoyen_demarches depuis la migration 20260824000002, jamais remontées
// jusqu'ici jusqu'à cette carte.
export type DemarcheRappel = {
  id: string;
  titre: string;
  institutionNom: string | null;
  dateCible: string | null;
  etapes: EtapeRappel[];
  categorie: "personnel" | "professionnel" | null;
  priorite: "faible" | "normale" | "importante" | "urgente";
};

export type RappelDemarche = {
  id: string;
  titre: string;
  sousTexte: string;
  enRetard: boolean;
  echeanceProche: boolean;
  etapesFaites: number;
  etapesTotal: number;
  institutionNom: string | null;
  categorie: "personnel" | "professionnel" | null;
  priorite: "faible" | "normale" | "importante" | "urgente";
};

function prochaineEtapeNonCochee(d: DemarcheRappel): EtapeRappel | null {
  return d.etapes.filter(e => !e.fait).sort((a, b) => a.ordre - b.ordre)[0] ?? null;
}

// Exportée (25/08/2026, État d'attention — Lot 1) pour être réutilisée par
// lib/citizenStateBuilder.ts sans dupliquer la règle de sélection de la
// prochaine échéance — seule cette fonction sait laquelle, entre les
// étapes non cochées et la date cible, fait foi.
export function prochaineDate(d: DemarcheRappel): Date | null {
  if (d.etapes.length > 0) {
    const dates = d.etapes.filter(e => !e.fait && e.date_echeance).map(e => new Date(e.date_echeance as string));
    if (dates.length === 0) return null;
    return dates.sort((a, b) => a.getTime() - b.getTime())[0];
  }
  return d.dateCible ? new Date(d.dateCible) : null;
}

export function deriverRappelsDemarches(demarches: DemarcheRappel[]): RappelDemarche[] {
  const aujourdHui = new Date(); aujourdHui.setHours(0, 0, 0, 0);
  const dansSeptJours = new Date(aujourdHui); dansSeptJours.setDate(dansSeptJours.getDate() + 7);

  const rappels = demarches.map((d): RappelDemarche => {
    const cible = prochaineDate(d);
    const enRetard = !!cible && cible < aujourdHui;
    const echeanceProche = !!cible && !enRetard && cible <= dansSeptJours;
    const etape = prochaineEtapeNonCochee(d);

    let sousTexte: string;
    if (enRetard && cible) {
      const jours = Math.round((aujourdHui.getTime() - cible.getTime()) / 86400000);
      sousTexte = jours <= 1 ? "En retard depuis hier" : `En retard depuis ${jours} jours`;
    } else if (etape) {
      sousTexte = `Prochaine étape : ${etape.libelle}`;
    } else if (cible) {
      const jours = Math.round((cible.getTime() - aujourdHui.getTime()) / 86400000);
      sousTexte = jours === 0 ? "Échéance aujourd'hui" : jours === 1 ? "Échéance demain" : `Échéance dans ${jours} jours`;
    } else {
      sousTexte = d.institutionNom ? `Avec ${d.institutionNom}` : "En cours";
    }

    return {
      id: d.id, titre: d.titre, sousTexte, enRetard, echeanceProche,
      etapesFaites: d.etapes.filter(e => e.fait).length, etapesTotal: d.etapes.length,
      institutionNom: d.institutionNom, categorie: d.categorie, priorite: d.priorite,
    };
  });

  // Tri stable : en retard d'abord, puis échéance proche, le reste dans
  // l'ordre de création déjà appliqué par la requête (created_at desc).
  return rappels
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (a.r.enRetard !== b.r.enRetard) return a.r.enRetard ? -1 : 1;
      if (a.r.echeanceProche !== b.r.echeanceProche) return a.r.echeanceProche ? -1 : 1;
      return a.i - b.i;
    })
    .map(x => x.r);
}
