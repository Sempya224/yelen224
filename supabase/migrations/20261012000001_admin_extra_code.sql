-- Troisième facteur admin, après mot de passe + 2FA TOTP (demande Bryan
-- 12/10/2026) : un code à 8-16 chiffres choisi par l'admin lui-même,
-- configuré depuis /admin/security, exigé à la connexion si activé.
-- Pas de codes de secours (décision assumée) : en cas d'oubli, Bryan
-- désactive manuellement extra_code_enabled via l'éditeur SQL sur son
-- propre compte, même logique que le reste du projet (il exécute tout
-- le SQL lui-même).
alter table admin_users
  add column if not exists extra_code_hash text,
  add column if not exists extra_code_enabled boolean not null default false;
