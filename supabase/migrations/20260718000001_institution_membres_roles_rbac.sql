-- RBAC Enterprise Yelen PRO — élargit institution_membres.role de 3 à 5
-- valeurs (ajoute superviseur, dirigeant). Contrainte CHECK inline non
-- nommée dans la migration d'origine (20260714000001_institution_membres.sql
-- ligne 8) → nom auto-généré par Postgres : institution_membres_role_check.
-- Confirmer ce nom avant exécution avec : \d institution_membres
-- (si le nom diffère, adapter le DROP CONSTRAINT ci-dessous en conséquence).
ALTER TABLE institution_membres
  DROP CONSTRAINT IF EXISTS institution_membres_role_check;

ALTER TABLE institution_membres
  ADD CONSTRAINT institution_membres_role_check
  CHECK (role IN ('admin', 'agent', 'comptable', 'superviseur', 'dirigeant'));
