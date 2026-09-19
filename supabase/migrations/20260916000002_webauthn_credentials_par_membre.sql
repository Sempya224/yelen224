-- Passkeys par membre (16/09/2026) — jusqu'ici institution_webauthn_credentials
-- n'authentifiait QUE le compte principal (institution_id seul, jamais de
-- notion de membre). Colonne nullable ajoutée pour permettre à un membre
-- d'équipe (agent/comptable/superviseur/dirigeant/admin) d'enregistrer SA
-- PROPRE clé d'accès, en plus de son identifiant+PIN — sans toucher aux
-- lignes existantes (membre_id NULL = credential historique du compte
-- principal, comportement inchangé).
ALTER TABLE institution_webauthn_credentials ADD COLUMN membre_id uuid REFERENCES institution_membres(id) ON DELETE CASCADE;
CREATE INDEX institution_webauthn_credentials_membre_id_idx ON institution_webauthn_credentials (membre_id) WHERE membre_id IS NOT NULL;
