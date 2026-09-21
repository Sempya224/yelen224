-- Yelen Community — Publications V2, planification/suppression (16/09/2026,
-- brief CEO). Décision Bryan 16/09/2026 : la planification NE contourne
-- jamais la validation Yelen — elle ne fait que retarder l'ENTRÉE dans la
-- file de modération. À `scheduled_at`, un job programmé (voir
-- 20260916000013) fait simplement passer le statut de 'planifiee' à
-- 'en_attente_validation' (le flux normal, inchangé, prend le relais) —
-- jamais un passage direct à 'publiee'.
--
-- `traite_le` (nouveau) — comble un vrai trou trouvé en session : la route
-- d'approbation admin pose déjà `valide_le`, mais celle de refus ne posait
-- aucun horodatage, rendant impossible d'afficher "refusée le [date]" avec
-- une vraie date. `traite_le` est posé sur LES DEUX décisions (approbation
-- ET refus) ; `valide_le` reste inchangé (uniquement sur approbation, pour
-- ne rien casser du code existant qui le lit déjà).
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS traite_le timestamptz;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_statut_check;
ALTER TABLE posts ADD CONSTRAINT posts_statut_check
  CHECK (statut IN ('en_attente_validation', 'publiee', 'refusee', 'planifiee'));
