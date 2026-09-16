-- Chantier "YELEN Accueil" (check-in mobile isolé du dashboard, voir
-- docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md). Session dédiée au
-- scope "appointment.check_in" — jamais réutilisable pour ouvrir le
-- dashboard institution, contrairement à institution_sessions.
-- Même convention que institution_sessions/employee sessions : RLS
-- activé, aucune policy (accès service_role exclusivement, aucun appelant
-- de cette table n'a de session Supabase Auth).
CREATE TABLE checkin_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
);
ALTER TABLE checkin_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_checkin_sessions_membre_actif ON checkin_sessions(membre_id) WHERE revoked_at IS NULL;

-- Code manuel de secours pour la confirmation de présence des RDV
-- gratuits (caméra/écran client indisponible) — décision Bryan
-- 13/09/2026. Même cycle de vie que qr_token/qr_expires_at (régénérés
-- ensemble dans app/api/qr/generate/route.ts), distinct de
-- paid_bookings.confirmation_code (RDV payants, hors périmètre).
ALTER TABLE rdv
  ADD COLUMN code_secours text,
  ADD COLUMN code_secours_expires_at timestamptz;

CREATE UNIQUE INDEX idx_rdv_code_secours_actif ON rdv(code_secours) WHERE code_secours IS NOT NULL;
