-- auth_security_events — ajoute 'checkin_login' (connexion identifiant+PIN
-- YELEN Accueil) et 'checkin_code_manuel' (tentatives de code de secours)
-- à la liste des endpoint_category autorisées (chantier YELEN Accueil,
-- 13/09/2026), même geste que
-- 20260830000005_auth_security_events_amendement.sql pour
-- 'admin_login'/'employee_login'. Élargit uniquement, ne resserre rien —
-- sans risque pour les lignes existantes.
--
-- ⚠️ À exécuter dans le même ordre que le reste du chantier
-- authSecurity.ts (toujours non confirmé déployé en production au
-- 13/09/2026, voir docs/security/YELEN_SECURITY_GAP_ANALYSIS.md, GAP-10-01)
-- : cette contrainte ne s'applique qu'une fois
-- 20260828000004_auth_security.sql et son amendement du 30/08 exécutés.

ALTER TABLE auth_security_events DROP CONSTRAINT auth_security_events_endpoint_category_check;

ALTER TABLE auth_security_events
  ADD CONSTRAINT auth_security_events_endpoint_category_check
  CHECK (endpoint_category = ANY (ARRAY[
    'citoyen_login','citoyen_register',
    'institution_login','institution_register','recuperation',
    'admin_login','employee_login','checkin_login','checkin_code_manuel'
  ]));
