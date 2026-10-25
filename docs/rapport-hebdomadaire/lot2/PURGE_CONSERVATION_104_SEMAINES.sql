-- Purge de conservation : 104 semaines (≈ 2 ans) — MANUELLE, jamais
-- planifiée tant que Bryan n'a pas tranché. À exécuter dans le SQL Editor,
-- étape par étape. Rien n'est supprimé automatiquement.
--
-- Périmètre : tout ce qui concerne une semaine plus ancienne que le seuil,
-- dans les TROIS tables (rapports et toutes leurs versions, journal des
-- tentatives, réservations d'envoi). Les trois sont purgées ensemble, jamais
-- une seule, pour ne pas laisser de références orphelines.
-- Le contenu est agrégé (aucune donnée personnelle) : la durée est un choix
-- d'usage, à valider au regard des besoins métier et des obligations
-- applicables.

-- 1. Seuil (lundi de la semaine la plus ancienne conservée) et volumes concernés.
WITH seuil AS (
  SELECT (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7 * 104) AS lundi_min
)
SELECT (SELECT lundi_min FROM seuil) AS lundi_min,
       (SELECT count(*) FROM institution_rapports_hebdo, seuil WHERE semaine_debut < seuil.lundi_min) AS rapports,
       (SELECT count(*) FROM institution_rapports_hebdo_executions, seuil WHERE semaine_debut < seuil.lundi_min) AS tentatives,
       (SELECT count(*) FROM institution_rapports_hebdo_envois, seuil WHERE semaine_debut < seuil.lundi_min) AS envois;

-- 2. Purge (transaction). Vérifier les volumes de l'étape 1 AVANT.
-- L'ordre respecte les clés étrangères : envois et journal référencent les
-- rapports. Les versions d'une même semaine sont supprimées dans la même
-- instruction (le chaînage remplace_id reste cohérent).
BEGIN;
SET LOCAL app.autoriser_correction_rapport_hebdo = 'on';
DELETE FROM institution_rapports_hebdo_envois
 WHERE semaine_debut < (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7 * 104);
DELETE FROM institution_rapports_hebdo_executions
 WHERE semaine_debut < (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7 * 104);
DELETE FROM institution_rapports_hebdo
 WHERE semaine_debut < (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7 * 104);
-- Contrôle avant de valider : doit renvoyer 0.
SELECT count(*) AS restant_ancien FROM institution_rapports_hebdo
 WHERE semaine_debut < (date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7 * 104);
-- COMMIT;   <- à décommenter seulement si les chiffres sont conformes, sinon ROLLBACK;
ROLLBACK;
