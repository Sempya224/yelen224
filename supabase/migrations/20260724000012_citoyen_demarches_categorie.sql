-- Enrichissement "Mes démarches" (retour Bryan, 22/07/2026) : reconnaître
-- explicitement l'usage entrepreneur/chef d'entreprise en plus du citoyen
-- ordinaire — les deux utilisaient déjà l'écran sans distinction, mais
-- rien ne le signalait ni ne permettait de s'y retrouver une fois les
-- démarches personnelles et professionnelles mélangées.
--
-- Colonne nullable, aucune valeur par défaut : les démarches déjà créées
-- restent "non catégorisées" (traitées comme visibles dans tous les
-- filtres), pas de backfill inventé.
ALTER TABLE citoyen_demarches
  ADD COLUMN categorie text CHECK (categorie IN ('personnel', 'professionnel'));
