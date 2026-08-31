-- Documents clients — Lot 1 : lifecycle core (décision CEO 09/08/2026, case
-- management niveau NIST SP 800-171r3 / OWASP Unrestricted File Upload,
-- même discipline que /signalements-lot1). Ce lot ne touche PAS l'UI
-- (2 écrans existants recevront un relabeling mécanique dans un fichier
-- séparé de ce même lot, pas une refonte).
--
-- Décisions actées avec Bryan (4 questions) avant cette migration :
-- 1. Reçu et À vérifier restent 2 statuts séparés (pas de fusion).
-- 2. Expiration = seulement la date limite de réponse à une demande
--    (date_limite) — pas de rétention/validité post-archivage (aurait
--    inventé des règles par type de document non définies aujourd'hui).
-- 3. ActionKey dédiées ajoutées côté RBAC (fichier séparé).
-- 4. Le flux "envoi" (institution → citoyen) reste simple : statut
--    "disponible" direct, jamais de pipeline à_vérifier/validé (se
--    "valider soi-même" n'a pas de sens métier).
--
-- Conséquence : le statut "Expiré" du brief n'est PAS stocké — dérivé à la
-- lecture (statut='en_attente' AND date_limite < now()) plutôt que
-- d'ajouter un job cron dédié pour ce lot. "Demandé" (brief) devient
-- l'événement d'audit 'created' de document_events, pas un statut séparé
-- de 'en_attente' (aucune valeur distincte observable entre les deux).
--
-- ⚠️ 2 INCIDENTS réels du 09/08/2026, corrigés dans cette version finale :
-- (a) 1ère tentative : backfill AVANT le nouveau CHECK → les nouvelles
--     valeurs ('recu'/'disponible'/'archive') violaient l'ancien CHECK
--     (4 valeurs seulement), ERROR 23514.
-- (b) 2e tentative : nouveau CHECK AVANT le backfill → ADD CONSTRAINT valide
--     IMMÉDIATEMENT toutes les lignes existantes, donc les lignes encore
--     sur l'ancienne valeur ('televerse'/'envoye'/'annule', absente du
--     nouveau CHECK) le violaient tout autant, même erreur.
-- Ordre correct (celui ci-dessous) : retirer la contrainte, backfiller
-- SANS AUCUN CHECK actif, remettre la contrainte stricte seulement une
-- fois que toutes les lignes sont déjà conformes. Fichier entièrement
-- idempotent (IF NOT EXISTS / DROP...IF EXISTS partout), rejouable sans
-- risque quel que soit l'état où une tentative précédente s'est arrêtée.

-- 1) Nouvelles colonnes lifecycle.
ALTER TABLE citoyen_documents
  ADD COLUMN IF NOT EXISTS date_limite timestamptz,
  ADD COLUMN IF NOT EXISTS motif_refus text
             CHECK (motif_refus IN ('illisible','expire','mauvais_document','informations_incorrectes','incomplet','autre')),
  ADD COLUMN IF NOT EXISTS motif_refus_detail text,
  ADD COLUMN IF NOT EXISTS valide_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valide_le timestamptz,
  ADD COLUMN IF NOT EXISTS refuse_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refuse_le timestamptz,
  ADD COLUMN IF NOT EXISTS archive_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_le timestamptz,
  -- Refus → nouvelle demande (brief §12/14) : posée sur la NOUVELLE ligne
  -- de demande créée après un refus, pointant vers le document refusé
  -- qu'elle remplace. Même pattern que signalements.doublon_de_signalement_id.
  ADD COLUMN IF NOT EXISTS remplace_document_id uuid REFERENCES citoyen_documents(id) ON DELETE SET NULL;

-- 2) Retire la contrainte existante (aucun CHECK actif pendant le backfill).
ALTER TABLE citoyen_documents DROP CONSTRAINT IF EXISTS citoyen_documents_statut_check;

-- 3) Backfill — sûr maintenant, aucune contrainte ne peut le bloquer.
UPDATE citoyen_documents SET statut = 'recu' WHERE statut = 'televerse';
UPDATE citoyen_documents SET statut = 'disponible' WHERE statut = 'envoye';
UPDATE citoyen_documents SET statut = 'archive' WHERE statut = 'annule';

-- 4) Nouveau CHECK strict (7 valeurs) — ajouté seulement une fois toutes
-- les lignes déjà conformes, ADD CONSTRAINT ne peut donc plus échouer.
ALTER TABLE citoyen_documents
  ADD CONSTRAINT citoyen_documents_statut_check
    CHECK (statut IN ('en_attente','recu','a_verifier','valide','refuse','archive','disponible'));

-- 5) Garde-fou de complétude, même esprit que signalements_resolution_complete :
-- un refus doit toujours porter son motif.
ALTER TABLE citoyen_documents DROP CONSTRAINT IF EXISTS citoyen_documents_refus_complete;
ALTER TABLE citoyen_documents
  ADD CONSTRAINT citoyen_documents_refus_complete
    CHECK (statut <> 'refuse' OR motif_refus IS NOT NULL);

-- 6) Index manquants signalés par l'audit (citoyen_id/rdv_id/statut) — la
-- table n'avait que sa PK + un index sur institution_id
-- (20260808000003_index_citoyen_documents_evenements_agenda.sql).
CREATE INDEX IF NOT EXISTS idx_citoyen_documents_citoyen ON citoyen_documents(citoyen_id);
CREATE INDEX IF NOT EXISTS idx_citoyen_documents_rdv ON citoyen_documents(rdv_id);
CREATE INDEX IF NOT EXISTS idx_citoyen_documents_statut ON citoyen_documents(statut);
