-- 2FA TOTP institution (chantier 2/2 sécurité, 25/07/2026) — par membre,
-- pas par institution (décision Bryan 25/07/2026) : chaque membre de
-- institution_membres (admin, agent, comptable, superviseur, dirigeant —
-- y compris le compte_principal fondateur) active sa propre 2FA,
-- indépendante des autres. Mêmes noms de colonnes que admin_users/users
-- pour cohérence.
ALTER TABLE institution_membres
  ADD COLUMN totp_secret text,
  ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_backup_codes text[];
