-- Lot 5 "Home V2 / mécaniques d'engagement" (22/08/2026) — colonne
-- additive, nullable, même pattern que demarche_id/citoyen_document_id
-- (migration 20260822000001). Sert de clé de déduplication PAR CITOYEN
-- pour la notification "annonce publiée" (supabase/functions/
-- annonces-notifications) : une même annonce doit notifier chaque citoyen
-- concerné une seule fois, jamais deux fois le même citoyen à chaque
-- exécution du cron.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS annonce_id uuid REFERENCES annonces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_annonce_id ON notifications(annonce_id) WHERE annonce_id IS NOT NULL;
