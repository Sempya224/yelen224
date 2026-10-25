-- ROLLBACK du Lot 2 (v2, proposition, non exécuté). À exécuter par Bryan.
-- DESTRUCTIF : supprime tous les instantanés, le journal des tentatives et les
-- réservations d'envoi. Rien d'autre ne dépend de ces objets tant que les
-- Lots 3+ (route, cron, notifications) ne sont pas branchés. S'ils le sont :
-- DÉSACTIVER d'abord le cron et la route, sinon les appels échoueront.
-- Les notifications déjà insérées dans `notifications` ne sont PAS retirées
-- (aucun lien vers ces tables).

-- 0. Contrôle avant destruction (noter les volumes).
SELECT (SELECT count(*) FROM institution_rapports_hebdo) AS rapports,
       (SELECT count(*) FROM institution_rapports_hebdo_executions) AS tentatives,
       (SELECT count(*) FROM institution_rapports_hebdo_envois) AS envois;

BEGIN;
DROP VIEW IF EXISTS institution_rapports_hebdo_etat;
DROP FUNCTION IF EXISTS institution_rapport_hebdo_terminer_envoi(uuid, date, text, boolean, text);
DROP FUNCTION IF EXISTS institution_rapport_hebdo_reserver_envoi(uuid, date, text, uuid);
DROP FUNCTION IF EXISTS institution_rapport_hebdo_journaliser_echec(uuid, date, text, integer);
DROP FUNCTION IF EXISTS institution_rapport_hebdo_enregistrer(uuid, date, integer, boolean, jsonb, timestamptz, boolean, text, integer, integer);
-- Tables qui référencent institution_rapports_hebdo(id) d'abord.
DROP TABLE IF EXISTS institution_rapports_hebdo_envois;
DROP TABLE IF EXISTS institution_rapports_hebdo_executions;
-- DROP TABLE ne déclenche pas le trigger BEFORE DELETE : pas besoin de
-- l'échappatoire. Les triggers sont supprimés avec leurs tables.
DROP TABLE IF EXISTS institution_rapports_hebdo;
DROP FUNCTION IF EXISTS institution_rapports_hebdo_proteger();
COMMIT;

-- Vérification : les deux requêtes doivent renvoyer 0 ligne.
SELECT relname FROM pg_class WHERE relname LIKE 'institution_rapports_hebdo%';
SELECT proname FROM pg_proc WHERE proname LIKE 'institution_rapport%hebdo%';
