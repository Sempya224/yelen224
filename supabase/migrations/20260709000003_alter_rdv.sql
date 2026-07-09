-- Migration : rdv — alignement avec le modèle du code (audit 09/07/2026)
ALTER TABLE rdv RENAME COLUMN cree_le TO created_at;

ALTER TABLE rdv ADD COLUMN objet text;
ALTER TABLE rdv ADD COLUMN pour_autre boolean NOT NULL DEFAULT false;
ALTER TABLE rdv ADD COLUMN nom_autre text;
ALTER TABLE rdv ADD COLUMN phone_autre text;
ALTER TABLE rdv ADD COLUMN presence boolean;
ALTER TABLE rdv ADD COLUMN presence_status text;
ALTER TABLE rdv ADD COLUMN presence_confirmed_at timestamptz;
ALTER TABLE rdv ADD COLUMN qr_token text;
ALTER TABLE rdv ADD COLUMN qr_expires_at timestamptz;
ALTER TABLE rdv ADD COLUMN conversation_terminee boolean NOT NULL DEFAULT false;
ALTER TABLE rdv ADD COLUMN motif_annulation text;
ALTER TABLE rdv ADD COLUMN motif_report text;
ALTER TABLE rdv ADD COLUMN avis_demande boolean NOT NULL DEFAULT false;
ALTER TABLE rdv ADD COLUMN depasse_notifie boolean NOT NULL DEFAULT false;
ALTER TABLE rdv ADD COLUMN termine_at timestamptz;
ALTER TABLE rdv ADD COLUMN termine_par uuid REFERENCES institutions(id);