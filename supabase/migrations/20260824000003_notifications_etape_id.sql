-- Lot 5 "Mes démarches → organisation personnelle" (24/08/2026) — colonne
-- additive nullable sur `notifications`, même pattern que `demarche_id`
-- (migration 20260822000001_notifications_demarche_id.sql). Nécessaire
-- pour dédupliquer les rappels au niveau d'une étape individuelle
-- (rappel_jours_avant sur citoyen_demarche_etapes, ajouté par
-- 20260824000002) — `demarche_id` seul ne suffit pas : une démarche peut
-- avoir plusieurs étapes avec chacune son propre rappel, il faut la clé
-- de dédup la plus précise (l'étape), pas seulement la démarche.
-- Aucune régression : colonne nullable, NULL pour toute notification déjà
-- en base ou tout type qui ne concerne pas une étape.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS etape_id uuid REFERENCES citoyen_demarche_etapes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_etape_id ON notifications(etape_id) WHERE etape_id IS NOT NULL;
