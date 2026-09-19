-- auth_security_events — amendement suite à drift constaté le 30/08/2026.
--
-- Contexte : 20260828000004_auth_security.sql (dépôt) décrivait
-- endpoint_category comme nullable (exception pour les événements
-- 'admin_unblock', sans catégorie d'endpoint précise) et 7 valeurs
-- possibles (les 5 d'origine + 'admin_login'/'employee_login' ajoutées
-- le 30/08/2026 pour couvrir Lot 2 sécurité). Vérification en base par
-- Bryan (SQL Editor, 30/08/2026) a montré que la table réellement
-- exécutée (jamais annotée "exécuté par Bryan" dans le fichier d'origine,
-- retrouvée a posteriori) avait endpoint_category NOT NULL sans
-- exception, et seulement les 5 valeurs d'origine — le code du Lot 2
-- (admin/auth/login, clock/auth/login) écrit déjà 'admin_login'/
-- 'employee_login', qui aurait échoué contre ce schéma réel.
--
-- auth_device_security/auth_ip_security vérifiées séparément le même
-- jour : aucun écart, colonne par colonne — pas concernées ici.
--
-- Sans risque pour les lignes déjà existantes (24 au moment du
-- diagnostic) : on ne fait qu'élargir des contraintes, jamais les
-- resserrer.

ALTER TABLE auth_security_events ALTER COLUMN endpoint_category DROP NOT NULL;

ALTER TABLE auth_security_events
  ADD CONSTRAINT auth_security_events_attempt_a_categorie
  CHECK (event_type <> 'attempt' OR endpoint_category IS NOT NULL);

ALTER TABLE auth_security_events DROP CONSTRAINT auth_security_events_endpoint_category_check;

ALTER TABLE auth_security_events
  ADD CONSTRAINT auth_security_events_endpoint_category_check
  CHECK (endpoint_category = ANY (ARRAY[
    'citoyen_login','citoyen_register',
    'institution_login','institution_register','recuperation',
    'admin_login','employee_login'
  ]));
