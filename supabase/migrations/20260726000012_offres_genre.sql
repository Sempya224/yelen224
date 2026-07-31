-- Genre d'offre (26/07/2026) — distinct de "categorie" (secteur du
-- partenaire) : décrit la nature de l'offre elle-même (réduction,
-- cashback, essai gratuit...), affiché en badge coloré côté citoyen.
-- Retour Bryan : toutes les offres se ressemblaient, impossible de savoir
-- de quel type d'offre il s'agissait au premier coup d'œil.
ALTER TABLE offres
  ADD COLUMN genre text NOT NULL DEFAULT 'avantage_exclusif'
  CHECK (genre IN (
    'reduction', 'cashback', 'essai_gratuit', 'cadeau',
    'concours', 'recrutement', 'nouveaute', 'avantage_exclusif'
  ));
