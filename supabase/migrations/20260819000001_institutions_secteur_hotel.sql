-- Migration : ajout du secteur "hotel" (19/08/2026)
-- Chantier Hôtel V1 vitrine (docs/ui/YELEN_HOTEL_MODEL_AUDIT.md, Partie 8/15,
-- Phase 1). Seule migration requise pour la V1 : élargit la liste des
-- valeurs autorisées de institutions.secteur de 8 à 9, aucun backfill (aucune
-- ligne existante ne peut déjà valoir 'hotel'), donc l'ordre DROP puis ADD
-- est sûr sans jamais laisser la table temporairement sans contrainte pour
-- une transaction concurrente (DDL Postgres dans une seule transaction).
BEGIN;

ALTER TABLE institutions
  DROP CONSTRAINT institutions_secteur_check;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_secteur_check
    CHECK (secteur IS NULL OR secteur IN (
      'sante','administratif','financier','juridique','beaute_bien_etre',
      'commerce','artisanat','services_divers','hotel'
    ));

COMMIT;
