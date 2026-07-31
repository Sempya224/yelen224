-- Enrichissement du design de l'écran Offres (chantier 26/07/2026, refonte
-- niveau US façon MoneyLion) : lignes de faits clé/valeur affichées
-- directement sur la carte (ex. "Frais mensuel : 8$"), et listes
-- avantages/limites (onglets Pros/Cons de la fiche détail). Saisies par
-- le partenaire lui-même dans MesOffresTab.tsx, comme le reste du
-- contenu d'une offre.
ALTER TABLE offres
  ADD COLUMN faits jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN avantages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN limites jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN offres.faits IS 'Tableau de {label, valeur} affiché en lignes sur la carte, ex. [{"label":"Frais mensuel","valeur":"8 000 GNF"}]';
COMMENT ON COLUMN offres.avantages IS 'Tableau de chaînes — onglet "Avantages" de la fiche détail';
COMMENT ON COLUMN offres.limites IS 'Tableau de chaînes — onglet "Limites" de la fiche détail';
