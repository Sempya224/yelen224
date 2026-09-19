-- Révocation institution par session individuelle (dette technique comblée
-- 30/08/2026, même jour que admin_sessions) — remplace
-- institutions.session_revoked_at (GAP-04-04), qui ne pouvait révoquer qu'à
-- l'échelle du compte entier : impossible de "déconnecter cet appareil
-- précis" ou de lister les connexions actives séparément.
--
-- Réutilise institution_sessions (migration 20260709000011) plutôt que de
-- créer une table parallèle — cette table existait déjà comme journal
-- d'audit insert-only des connexions (jamais lue pour l'autorisation, un
-- INSERT par login réussi), jamais mise à jour. On lui ajoute les colonnes
-- nécessaires pour qu'une ligne devienne aussi l'enregistrement de session
-- vivant, sur le même modèle qu'admin_sessions : le JWT institution porte
-- désormais un claim `sid` référençant cette ligne (id, déjà clé primaire).
--
-- `phone` rendu nullable : membre/login (identifiant+PIN) n'a jamais chargé
-- institutions.phone jusqu'ici et va désormais aussi insérer une ligne
-- (c'était le seul flux de connexion institution à ne pas le faire).
--
-- Toute session signée avant ce déploiement n'a pas de claim `sid` — traitée
-- comme invalide par lib/institutionAuth.ts, force une reconnexion (même
-- précédent que le déploiement admin_sessions ce matin).

ALTER TABLE institution_sessions ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE institution_sessions ADD COLUMN expires_at timestamptz;
ALTER TABLE institution_sessions ADD COLUMN revoked_at timestamptz;
-- Vocabulaire volontairement non contraint par CHECK (même choix
-- qu'admin_sessions.revoked_reason) : 'logout', 'password_pin_change',
-- 'totp_disabled', 'deletion_request', 'revoked_all_other_devices'...
ALTER TABLE institution_sessions ADD COLUMN revoked_reason text;
ALTER TABLE institution_sessions ADD COLUMN ip text;

CREATE INDEX institution_sessions_institution_id_idx ON institution_sessions (institution_id) WHERE revoked_at IS NULL;
