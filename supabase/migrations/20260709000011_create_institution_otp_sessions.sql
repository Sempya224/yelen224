-- Migration : création institution_otp + institution_sessions (audit 09/07/2026)
CREATE TABLE institution_otp (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE institution_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  phone text NOT NULL,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institution_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_sessions ENABLE ROW LEVEL SECURITY;