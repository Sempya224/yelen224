-- Verrouillage de compte admin persistant (19/07/2026)
-- Complète le rate-limit par IP existant (en mémoire, login/route.ts) —
-- celui-ci ne survit pas à un changement d'IP ni à un redémarrage du
-- process. Le verrouillage par compte est le filet de sécurité qui
-- reste même si l'attaquant change d'IP.
ALTER TABLE admin_users ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN locked_until timestamptz;
