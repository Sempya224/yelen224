-- Écran "Sécurité" admin (24/07/2026) — changement de mot de passe en
-- libre-service + 2FA TOTP. totp_secret en clair est nécessaire
-- (l'algorithme TOTP doit le relire à chaque vérification, contrairement
-- à un mot de passe hashé) — protégé uniquement par le fait que seul le
-- service_role accède jamais à admin_users, comme le reste de la table.
-- totp_backup_codes stocke des hash bcrypt (jamais les codes en clair),
-- un code est retiré du tableau une fois utilisé (usage unique).
ALTER TABLE admin_users
  ADD COLUMN password_changed_at timestamptz,
  ADD COLUMN totp_secret text,
  ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_backup_codes text[];
