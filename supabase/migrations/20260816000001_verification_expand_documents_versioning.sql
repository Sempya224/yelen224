-- Trust — Lot 2.4, stade EXPAND (1/3). Ajoute le versionnement à
-- documents_institution SANS toucher à la contrainte existante ni au
-- comportement applicatif actuel — additif et sûr à exécuter seul.
-- Conception : docs/product/YELEN_TRUST_VERIFICATION_DATA_MODEL.md
-- (sections D/H), docs/product/YELEN_TRUST_DATA_AUDIT.md (section 1, le
-- constat d'origine : chaque resoumission écrasait la preuve précédente).
--
-- ⚠️ IMPORTANT POUR BRYAN : ce fichier NE modifie PAS encore la contrainte
-- UNIQUE(institution_id, type) ni n'ajoute le trigger d'immuabilité — ça
-- reste dans 20260816000004 (stade SWITCH), à déployer uniquement en même
-- temps que le code applicatif réécrit (jamais avant). Ce fichier-ci est
-- sûr à exécuter seul, sans aucune coordination de déploiement.
--
-- Avant d'exécuter ce fichier, exécuter l'inventaire de
-- docs/product/YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md (section
-- "Étape 0 — Inventaire") et coller les résultats dans ce rapport.

ALTER TABLE documents_institution
  ADD COLUMN numero_version integer NOT NULL DEFAULT 1,
  ADD COLUMN statut_actif boolean NOT NULL DEFAULT true,
  ADD COLUMN remplace_version_id uuid REFERENCES documents_institution(id) ON DELETE SET NULL,
  ADD COLUMN soumis_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN hash_integrite text;

COMMENT ON COLUMN documents_institution.numero_version IS
  'Rang de version pour ce (institution_id, type). Toute ligne existante avant cette migration devient version 1 par le DEFAULT — aucune n''a jamais été remplacée (aucune route n''a jamais écrit valide/rejete/examine_par avant ce lot, confirmé YELEN_TRUST_DATA_AUDIT.md).';
COMMENT ON COLUMN documents_institution.statut_actif IS
  'Au plus une ligne active par (institution_id, type) — appliqué par l''index unique partiel du stade SWITCH (20260816000004), pas encore par ce fichier.';
COMMENT ON COLUMN documents_institution.remplace_version_id IS
  'Chaîne vers la version précédemment active au moment de cette soumission. NULL pour une première soumission.';
COMMENT ON COLUMN documents_institution.soumis_par_membre_id IS
  'Membre institution ayant déposé cette version — dérivé de la session authentifiée par la route appelante, jamais accepté depuis le corps de la requête. NULL pour les lignes historiques (donnée jamais capturée avant ce lot, perte assumée, voir rapport de migration).';
COMMENT ON COLUMN documents_institution.hash_integrite IS
  'SHA-256 du fichier au moment du dépôt, calculé côté serveur. NULL pour les lignes historiques.';

-- Correction rétroactive de least-privilege (YELEN_TRUST_DATA_AUDIT.md
-- section 3) — cette table n'a jamais eu de policy (deny-by-default par
-- RLS déjà actif), mais les GRANT larges anon/authenticated hérités par
-- défaut n'avaient jamais été explicitement révoqués. Aucune régression
-- possible : aucune route legitime n'accède à cette table autrement que
-- via service_role.
REVOKE ALL ON documents_institution FROM PUBLIC, anon, authenticated;
