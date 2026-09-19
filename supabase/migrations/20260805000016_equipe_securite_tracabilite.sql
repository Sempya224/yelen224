-- Refonte Enterprise écran Équipe (mission CEO 05/08/2026, Product
-- Hardening). Le verrouillage de institution_membres était en mémoire
-- (Map dans app/api/institution/auth/membre/login/route.ts, perdu à
-- chaque redémarrage/instance multiple) — pas une donnée affichable de
-- façon fiable dans un badge "Compte verrouillé". derniere_connexion
-- n'existait pas du tout. Même pattern que employee_credentials (Clock
-- In Shift, migration 20260805000004) et admin_users
-- (20260719000002_admin_account_lockout.sql).
ALTER TABLE institution_membres
  ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN derniere_connexion timestamptz;
