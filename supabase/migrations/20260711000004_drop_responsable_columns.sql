-- Migration 3 : suppression de institutions.responsable_prenom/nom/role (11/07/2026)
-- Split-brain corrige en Lot 4 : institution_responsables (migration
-- 20260711000002) est desormais la seule source de verite pour le
-- responsable d'une institution. app/api/institution/auth/register/route.ts
-- ecrit dans institution_responsables, plus jamais dans ces 3 colonnes.
-- Grep exhaustif effectue en Lot 4 : aucune lecture/ecriture residuelle de
-- institutions.responsable_* ailleurs dans le code applicatif.
--
-- ⚠️ NE PAS EXECUTER avant que Lot 4 soit deploye en production ET verifie
-- (inscription institution cree bien une ligne institution_responsables,
-- onglet Profil Responsable du dashboard fonctionne). Execution manuelle
-- via SQL Editor par Bryan uniquement, comme tout DDL sur ce projet.
ALTER TABLE institutions
  DROP COLUMN responsable_prenom,
  DROP COLUMN responsable_nom,
  DROP COLUMN responsable_role;
