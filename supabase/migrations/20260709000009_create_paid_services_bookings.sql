-- Migration : création paid_services + paid_bookings (audit 09/07/2026)
CREATE TYPE statut_paid_booking AS ENUM ('en_attente', 'confirme', 'termine', 'no_show', 'annule');

CREATE TABLE paid_services (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nom text NOT NULL,
  prix numeric NOT NULL,
  duree_minutes integer NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paid_bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id uuid NOT NULL REFERENCES paid_services(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  date_rdv date NOT NULL,
  heure_rdv time NOT NULL,
  confirmation_code text NOT NULL,
  statut statut_paid_booking NOT NULL DEFAULT 'en_attente',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE paid_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_bookings ENABLE ROW LEVEL SECURITY;