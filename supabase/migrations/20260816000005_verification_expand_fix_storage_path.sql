-- Trust — Lot 2.4, correctif EXPAND trouvé par test réel (16/08/2026).
--
-- BUG RÉEL : la fonction deposer_nouvelle_version_document()
-- (20260816000002) et les routes réécrites (documents/route.ts) référencent
-- une colonne `storage_path`, mais 20260816000001 ne l'a jamais créée —
-- seul le renommage `url` -> `storage_path` était DOCUMENTÉ comme
-- recommandé (YELEN_TRUST_VERIFICATION_DATA_MODEL.md section D) sans
-- jamais être réellement écrit dans une migration. Trouvé en exécutant
-- le test 5 de concurrence : `column "storage_path" of relation
-- "documents_institution" does not exist`.
--
-- Confirmé sans risque : aucune route ne lit `url` en sortie (audit des
-- writers, YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md section 1) — un
-- simple RENAME préserve les 2 lignes existantes (leurs chemins Storage
-- réels restent identiques, seul le nom de colonne change).

ALTER TABLE documents_institution RENAME COLUMN url TO storage_path;

COMMENT ON COLUMN documents_institution.storage_path IS
  'Chemin privé dans le bucket Storage "documents" — jamais une URL publique (renommé depuis `url` le 16/08/2026 pour refléter sa vraie nature, colonne pré-existante avant les migrations Trust).';
