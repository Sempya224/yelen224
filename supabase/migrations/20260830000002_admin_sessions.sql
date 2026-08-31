-- Admin Sessions — Mission Hardening Admin, point 7 (30/08/2026).
--
-- Contexte : admin_users.session_revoked_at (migration 20260830000001,
-- amendée le même jour avant exécution) ne permettait de révoquer que
-- "tout le compte à la fois" — impossible de révoquer une session
-- précise, de faire tourner l'ID de session après réauthentification, ou
-- de lister/détecter des connexions individuelles. Cette table remplace
-- ce mécanisme par une ligne par session admin active.
--
-- Le JWT admin porte désormais un claim `sid` (session id = cette
-- clé primaire). lib/adminAuth.ts vérifie la session par ce `sid`,
-- pas par comparaison de timestamp global.

CREATE TABLE admin_sessions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id         uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Fenêtre glissante d'inactivité (point 7 : "expiration d'inactivité"),
  -- distincte de expires_at (absolue, miroir de l'exp du JWT — 8h).
  -- Mise à jour à chaque requête authentifiée réussie.
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  -- Vocabulaire volontairement non contraint par CHECK (comme
  -- auth_security_events.outcome) : 'logout', 'revoked_all_password_change',
  -- 'revoked_all_2fa_disable', 'inactivity_timeout', 'admin_revoked_by_super_admin'...
  revoked_reason   text,
  -- Réauthentification récente (point 5, fenêtre courte côté application
  -- — lib/adminAuth.ts) : posé par /api/admin/auth/reauth, jamais par le
  -- login initial (une connexion n'est pas une "ré"-authentification).
  reauth_at        timestamptz,
  ip               text,
  user_agent       text,
  device_label     text
);

CREATE INDEX admin_sessions_admin_id_idx ON admin_sessions (admin_id) WHERE revoked_at IS NULL;

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, comme
-- partout où l'appelant n'a pas de session Supabase Auth native.
