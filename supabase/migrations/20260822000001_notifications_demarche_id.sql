-- Lot "Home V2 / mécaniques d'engagement" (22/08/2026) — 2 colonnes
-- additives, nullables, sur la table historique `notifications` (comme
-- `rdv_id`, ajoutée le 09/07/2026). Servent de clé de déduplication pour
-- des notifications qui ne concernent ni un RDV ni une institution :
-- - demarche_id : échéance/retard de démarche (supabase/functions/
--   demarches-rappels), même pattern que `rdv_id` pour rappels-rdv.
-- - citoyen_document_id : relance "document toujours en attente"
--   (supabase/functions/documents-relances). `rdv_id` seul ne suffit pas
--   ici — plusieurs documents peuvent être demandés sur le même RDV
--   (citoyen_documents.rdv_id NOT NULL, voir migration 20260724000005),
--   la clé de dédup doit donc être le document précis, pas le RDV.
-- Aucune régression pour les appelants existants : colonnes nullables,
-- NULL par défaut pour toute notification déjà en base ou tout type qui
-- ne concerne ni une démarche ni un document.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS demarche_id uuid REFERENCES citoyen_demarches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS citoyen_document_id uuid REFERENCES citoyen_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_demarche_id ON notifications(demarche_id) WHERE demarche_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_citoyen_document_id ON notifications(citoyen_document_id) WHERE citoyen_document_id IS NOT NULL;
