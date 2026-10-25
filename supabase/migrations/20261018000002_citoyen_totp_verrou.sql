-- Verrou TOTP citoyen persisté (chantier "Limites d'authentification et
-- protection contre les abus", Priorité 2 validée CEO le 18/10/2026) —
-- app/api/citoyen/auth/totp/login-verify/route.ts utilisait une Map en
-- mémoire locale (failedAttempts), non partagée entre instances
-- serverless Netlify, remise à zéro à chaque redémarrage/déploiement.
-- Mirroring de institution_membres.failed_attempts/locked_until (son
-- équivalent institution avait déjà migré, seul le citoyen a été oublié).
--
-- Seuil durci par rapport à l'ancien comportement en mémoire (5 essais /
-- 5 min) — 4 essais / 15 min (chantier Priorité 2, décision "plus
-- strict" du 18/10/2026) : un 2e facteur déjà authentifié par le 1er
-- facteur (OTP téléphone) justifie une fenêtre de blocage plus longue
-- qu'un simple essai de mot de passe.
ALTER TABLE users
  ADD COLUMN totp_failed_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN totp_locked_until timestamptz;
