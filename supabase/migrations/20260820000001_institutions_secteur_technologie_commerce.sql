-- Migration : retrait de "commerce", ajout de "technologie_numerique" (20/08/2026)
-- Décision CEO (docs/audits/TAXONOMIE_YELEN_COMMERCE_TECHNOLOGIE_AUDIT.md) :
-- Commerce retiré pour positionnement produit, indépendant du cas Nimba SMS.
-- Vérifié en base avant cette migration (§5/§20 de l'audit) : 0 institution
-- avec secteur='commerce', 0 paid_services.categorie contenant "commerce"
-- — aucun backfill nécessaire, DROP+ADD sûr en une seule transaction.
BEGIN;

ALTER TABLE institutions
  DROP CONSTRAINT institutions_secteur_check;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_secteur_check
    CHECK (secteur IS NULL OR secteur IN (
      'sante','administratif','financier','juridique','beaute_bien_etre',
      'artisanat','services_divers','hotel','technologie_numerique'
    ));

COMMIT;
