-- Migration : notifications — alignement avec le modèle du code (audit 09/07/2026)
DROP POLICY IF EXISTS notif_citoyen_own ON notifications;

ALTER TABLE notifications RENAME COLUMN cree_le TO created_at;
ALTER TABLE notifications DROP COLUMN citoyen_id;
ALTER TABLE notifications DROP COLUMN institution_id;

ALTER TABLE notifications ADD COLUMN destinataire_id uuid NOT NULL;
ALTER TABLE notifications ADD COLUMN destinataire_type text NOT NULL;
ALTER TABLE notifications ADD COLUMN rdv_id uuid REFERENCES rdv(id);

CREATE POLICY notif_destinataire_own ON notifications
  FOR ALL
  USING (auth.uid() = destinataire_id AND destinataire_type = 'citoyen');