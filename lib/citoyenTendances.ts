// Dérivation déterministe des tendances de RDV d'un citoyen (secteur/établissement/jour
// les plus fréquents), généralisée depuis app/menu/vos-tendances/vos-tendances-client.tsx
// (qui garde sa propre copie inline — non modifié pour limiter le risque de régression).
// Même discipline que lib/reputationScore.ts / lib/citoyenSecurite.ts : zéro IA, zéro
// score visible, seuil minimum de preuve avant d'afficher un motif.

export const SEUIL_MINIMUM_RDV = 3;

export const SECTEUR_LABEL: Record<string, string> = {
  "santé": "Santé", "administratif": "Administratif", "financier": "Institutions financières",
  "juridique": "Juridique", "beauté_bien_etre": "Beauté & bien-être", "commerce": "Commerce",
  "artisanat": "Artisanat", "services_divers": "Services divers",
};

export const JOURS_LABEL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export type RdvPourTendance = {
  institutionId: string | null;
  institutionNom: string | null;
  secteur: string | null;
  dateRdv: string;
};

export type TendancesCitoyen = {
  suffisant: boolean;
  secteurTop: string | null;
  secteurTopLabel: string | null;
  etablissementTopId: string | null;
  etablissementTopNom: string | null;
  jourTop: number | null;
  jourTopLabel: string | null;
};

function top<K>(m: Map<K, number>): K | null {
  let meilleur: K | null = null, max = 0;
  for (const [k, v] of m) if (v > max) { max = v; meilleur = k; }
  return meilleur;
}

export function deriverTendancesCitoyen(rdvs: RdvPourTendance[]): TendancesCitoyen {
  const vide: TendancesCitoyen = {
    suffisant: false, secteurTop: null, secteurTopLabel: null,
    etablissementTopId: null, etablissementTopNom: null, jourTop: null, jourTopLabel: null,
  };
  if (rdvs.length < SEUIL_MINIMUM_RDV) return vide;

  const parSecteur = new Map<string, number>();
  const parEtablissement = new Map<string, number>();
  const parJour = new Map<number, number>();
  const nomParId = new Map<string, string>();

  for (const r of rdvs) {
    if (r.secteur) parSecteur.set(r.secteur, (parSecteur.get(r.secteur) ?? 0) + 1);
    if (r.institutionId) {
      parEtablissement.set(r.institutionId, (parEtablissement.get(r.institutionId) ?? 0) + 1);
      if (r.institutionNom) nomParId.set(r.institutionId, r.institutionNom);
    }
    if (r.dateRdv) {
      const jour = new Date(r.dateRdv).getDay();
      parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
    }
  }

  const secteurTop = top(parSecteur);
  const etablissementTopId = top(parEtablissement);
  const jourTop = top(parJour);

  return {
    suffisant: true,
    secteurTop,
    secteurTopLabel: secteurTop ? (SECTEUR_LABEL[secteurTop] ?? secteurTop) : null,
    etablissementTopId,
    etablissementTopNom: etablissementTopId ? (nomParId.get(etablissementTopId) ?? null) : null,
    jourTop,
    jourTopLabel: jourTop !== null ? JOURS_LABEL[jourTop] : null,
  };
}
