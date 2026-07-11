-- Migration : biométrie/PIN/remember-me pour connexion institution (10/07/2026)
CREATE TABLE institution_webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE institution_webauthn_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE institutions ADD COLUMN pin_hash text;

CREATE TABLE institution_remember_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE institution_remember_tokens ENABLE ROW LEVEL SECURITY;