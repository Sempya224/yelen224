-- 2FA TOTP citoyen (chantier 1/2 sécurité, 25/07/2026) — même noms de
-- colonnes que admin_users pour cohérence. Pas de password_changed_at :
-- le citoyen n'a pas de mot de passe (auth réelle = téléphone + OTP).
-- totp_secret en clair est nécessaire (relu à chaque vérification),
-- protégé par le fait que seul le service_role accède jamais à `users`
-- pour ces colonnes. totp_backup_codes stocke des hash bcrypt, un code
-- retiré du tableau une fois utilisé (usage unique).
ALTER TABLE users
  ADD COLUMN totp_secret text,
  ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_backup_codes text[];
