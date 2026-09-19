-- Chantier Taxonomie des activités — Phase 1, migration 5/8. Table de
-- jonction unique pour l'activité principale (obligatoire, une seule par
-- institution) et jusqu'à 3 activités secondaires (optionnelles) — un
-- flag `principale` plutôt qu'une FK directe + une table séparée pour les
-- secondaires (spec §12, choix explicite pour rester simple).
--
-- Le nombre maximum de 3 secondaires et l'unicité de la ligne
-- `principale=true` sont des règles métier légères, appliquées côté route
-- API (même discipline que capacite_par_creneau/paid_services) — pas un
-- CHECK SQL, qui ne peut pas exprimer "au plus une ligne par institution"
-- sans un index partiel dédié (ajouté ci-dessous, qui couvre exactement
-- ce cas précis).
CREATE TABLE institution_activites (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  activite_id    uuid NOT NULL REFERENCES activites(id),
  principale     boolean NOT NULL DEFAULT false,
  ordre          integer NOT NULL DEFAULT 0,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, activite_id)
);

-- Garantit qu'une institution n'a jamais plus d'une activité principale
-- au niveau base — filet de sécurité en plus du contrôle applicatif.
CREATE UNIQUE INDEX institution_activites_principale_unique
  ON institution_activites (institution_id)
  WHERE principale;

ALTER TABLE institution_activites ENABLE ROW LEVEL SECURITY;

-- Lecture publique : jointure vers des institutions déjà publiques
-- (policy institutions_public_read existante), même principe que
-- activite_categories/activites. Écriture service_role uniquement.
CREATE POLICY institution_activites_public_read ON institution_activites
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM institutions i WHERE i.id = institution_activites.institution_id AND i.statut = 'validee')
  );

REVOKE INSERT, UPDATE, DELETE ON institution_activites FROM PUBLIC, anon, authenticated;
