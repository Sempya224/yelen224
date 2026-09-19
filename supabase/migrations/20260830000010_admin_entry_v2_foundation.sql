-- Admin Entry Security V2 — Lot 1 : fondation WebAuthn + modèle de données
-- uniquement (décision CEO, docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md).
-- Aucune route, aucune modification de proxy.ts, ADMIN_ENTRY_TOKEN reste
-- l'unique mécanisme actif tant que ce Lot n'est pas suivi des suivants.
--
-- Schémas copiés à l'identique des patterns déjà vérifiés dans le code réel
-- (audit YELEN_ADMIN_ENTRY_V2_AUDIT.md) :
--  - admin_entry_webauthn_credentials : même forme que
--    institution_webauthn_credentials (20260710000002), sans colonne
--    d'identité admin individuelle — un credential appartient au droit
--    d'entrée, jamais à un compte précis (séparation actée section 1 de la
--    décision). revoked_at ajouté (absent des tables webauthn existantes)
--    pour la révocation individuelle prévue section 3 de la décision, sans
--    jamais supprimer la ligne (historique conservé, même principe que
--    institution_remember_tokens.status='revoked').
--  - admin_entry_grants : nouveau, forme définie section 4 de la décision.
--  - auth_admin_entry_device_security / auth_admin_entry_ip_security :
--    copie exacte de auth_admin_device_security/auth_admin_ip_security
--    (20260830000009) — troisième TableSet isolé du même mécanisme
--    paramétré, zéro nouvelle logique d'escalade.

CREATE TABLE admin_entry_webauthn_credentials (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  credential_id text NOT NULL UNIQUE,
  public_key   text NOT NULL,
  counter      bigint NOT NULL DEFAULT 0,
  device_label text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX admin_entry_webauthn_credentials_active_idx ON admin_entry_webauthn_credentials (id) WHERE revoked_at IS NULL;
ALTER TABLE admin_entry_webauthn_credentials ENABLE ROW LEVEL SECURITY;
-- Aucune policy — accès exclusivement service_role, même convention que
-- institution_webauthn_credentials/citoyen_webauthn_credentials.

CREATE TABLE admin_entry_grants (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cookie_hash text NOT NULL UNIQUE,
  factor_used text NOT NULL,   -- 'webauthn' aujourd'hui, extensible sans migration (section 1 de la décision)
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text
);
CREATE INDEX admin_entry_grants_active_idx ON admin_entry_grants (cookie_hash) WHERE revoked_at IS NULL;
ALTER TABLE admin_entry_grants ENABLE ROW LEVEL SECURITY;
-- Aucune policy — accès exclusivement service_role, même convention que admin_sessions.

CREATE TABLE auth_admin_entry_device_security (
  device_id                uuid PRIMARY KEY,
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  ip_last                  text,
  window_started_at        timestamptz NOT NULL DEFAULT now(),
  attempts_in_window       int NOT NULL DEFAULT 0,
  state                    text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at         timestamptz NOT NULL DEFAULT now(),
  blocked_until            timestamptz,
  block_cycles_24h         int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason           text
);

CREATE TABLE auth_admin_entry_ip_security (
  ip                       text PRIMARY KEY,
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  window_started_at        timestamptz NOT NULL DEFAULT now(),
  attempts_in_window       int NOT NULL DEFAULT 0,
  state                    text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at         timestamptz NOT NULL DEFAULT now(),
  blocked_until            timestamptz,
  block_cycles_24h         int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason           text
);

CREATE INDEX auth_admin_entry_device_security_state_idx ON auth_admin_entry_device_security (state) WHERE state <> 'normal';
CREATE INDEX auth_admin_entry_ip_security_state_idx ON auth_admin_entry_ip_security (state) WHERE state <> 'normal';

ALTER TABLE auth_admin_entry_device_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_admin_entry_ip_security ENABLE ROW LEVEL SECURITY;
-- Aucune policy — accès exclusivement service_role, comme auth_admin_device_security/auth_admin_ip_security.
