-- Durcissement OTP institution (chantier "Limites d'authentification et
-- protection contre les abus", Priorité 1 validée CEO le 18/10/2026) —
-- institution_otp.code était stocké en clair et comparé par égalité SQL
-- (app/api/institution/auth/verify-otp/route.ts), contrairement au flux
-- citoyen (lib/auth/otp.ts) qui hache en bcrypt depuis le 25/07/2026.
--
-- Ajout de code_hash (nullable) plutôt que remplacement direct de code :
-- aucune ligne existante n'a besoin d'être migrée (fenêtre de vie de 10
-- minutes, toute ligne antérieure à ce déploiement est déjà expirée et
-- inerte) — code reste présent temporairement pour ne jamais casser un
-- déploiement en cours (ancien code encore actif pendant le rollout),
-- rendu nullable ici, à supprimer dans une migration de suivi une fois
-- confirmé qu'aucune route ne le lit plus.
--
-- Index composite : send-otp invalide désormais les codes précédents à
-- chaque nouvel envoi (voir route), donc au plus 1 ligne active par
-- numéro en régime normal — mais verify-otp doit pouvoir retrouver les
-- quelques lignes récentes non expirées pour un numéro sans scan complet
-- de la table en cas d'anomalie (garde-fou, voir proposition technique).
ALTER TABLE institution_otp ADD COLUMN code_hash text;
ALTER TABLE institution_otp ALTER COLUMN code DROP NOT NULL;

CREATE INDEX institution_otp_phone_expires_idx ON institution_otp (phone, expires_at DESC);
