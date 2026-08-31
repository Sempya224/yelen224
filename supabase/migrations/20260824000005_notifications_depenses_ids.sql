-- Lot 12 "Mes dépenses V2 — Notifications intelligentes" (24/08/2026) —
-- 3 colonnes additives nullable sur `notifications`, même pattern que
-- `demarche_id`/`etape_id` (20260822000001/20260824000003) : chacune sert
-- de clé de déduplication pour l'Edge Function citoyen-depenses-alertes
-- (voir supabase/functions/citoyen-depenses-alertes). Aucune régression :
-- colonnes nullable, NULL pour toute notification déjà en base ou tout
-- type qui ne concerne pas les dépenses.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES citoyen_budgets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS objectif_id uuid REFERENCES citoyen_objectifs_financiers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS depense_id uuid REFERENCES citoyen_depenses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_budget_id ON notifications(budget_id) WHERE budget_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_objectif_id ON notifications(objectif_id) WHERE objectif_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_depense_id ON notifications(depense_id) WHERE depense_id IS NOT NULL;
