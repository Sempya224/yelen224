-- Migration : demandes de suppression de compte institution, délai de grâce (12/07/2026)
-- Pas de nouvelle valeur sur l'enum statut_institution (ALTER TYPE ... ADD VALUE est
-- irréversible et risquerait de casser des switch(statut) existants ailleurs dans le code).
-- Le signal "compte en cours de suppression" est simplement : une ligne existe avec
-- cancelled_at IS NULL AND purged_at IS NULL. Les routes de connexion (verify-otp,
-- pin/verify, webauthn/auth-verify) doivent vérifier cette condition et bloquer l'accès
-- normal au dashboard si vraie, au profit d'un écran "compte en cours de suppression".
-- Purge réelle après scheduled_purge_at : aucune infra cron dans le projet, reste une
-- action manuelle déclenchée par Bryan (cf. plan).
CREATE TABLE institution_deletion_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
  motif text NOT NULL, -- trop_cher | pas_assez_rdv | autre_solution | fermeture | autre
  commentaire text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_purge_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  purged_at timestamptz
);
ALTER TABLE institution_deletion_requests ENABLE ROW LEVEL SECURITY;
