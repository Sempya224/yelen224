-- ⚠️ NOTE AJOUTÉE 16/08/2026 (Lot 2.4 "Trust", stade CONTRACT, cosmétique
-- uniquement — AUCUNE réexécution de ce fichier, la base réelle est déjà
-- saine) :
-- 1. Ligne 26 ci-dessous référence `admins(id)` — nom de table déjà
--    renommé en `admin_users` par une migration antérieure
--    (20260709000002). La contrainte réelle en production référence
--    correctement `admin_users(id)` (confirmé par requête SQL de Bryan le
--    16/08/2026) — seul ce fichier sur disque est resté périmé, très
--    probablement corrigé à la main au moment de l'exécution originale
--    sans jamais être reporté ici. Voir GAP-06-06,
--    docs/security/YELEN_SECURITY_GAP_ANALYSIS.md.
-- 2. Le paragraphe "Un renvoi de document met à jour la ligne existante
--    (upsert...)" ci-dessous décrit un comportement désormais SUPERSEDÉ :
--    ce comportement écrasait la preuve précédente à chaque resoumission
--    (violation de l'invariant "aucune preuve historique détruite",
--    docs/product/YELEN_TRUST_MODEL.md). Remplacé par un modèle de
--    versionnement (docs/product/YELEN_TRUST_VERIFICATION_DATA_MODEL.md),
--    voir les migrations 20260816000001 à 20260816000004.
--
-- Migration Lot A : workflow de statut pour documents_institution (11/07/2026)
-- Refonte complete de l'ecran Documents institutionnels. Jusqu'ici la table
-- documents_institution (id, institution_id, nom, url, type, cree_le)
-- n'etait utilisee par AUCUN code — l'ancien ecran /institution/document
-- ecrivait directement dans institutions.document_officiel / documents_urls,
-- sans statut par document, sans motif de rejet exploitable cote client.
--
-- Nouveau modele : une ligne par (institution_id, type de document requis),
-- type = slug (rccm, piece_identite, diplome_ordre, preuve_domicile,
-- nomination_habilitation...) determine par institutions.statut_juridique.
-- Un renvoi de document met a jour la ligne existante (upsert sur la
-- contrainte UNIQUE ci-dessous) plutot que d'en creer une nouvelle.
--
-- ⚠️ Verifier avant execution qu'aucune ligne existante ne viole la future
-- contrainte UNIQUE (doublons sur institution_id+type) :
--   SELECT institution_id, type, count(*) FROM documents_institution
--   GROUP BY institution_id, type HAVING count(*) > 1;

CREATE TYPE statut_document AS ENUM ('recu', 'valide', 'complement_demande', 'rejete');

ALTER TABLE documents_institution
  ADD COLUMN statut statut_document NOT NULL DEFAULT 'recu',
  ADD COLUMN motif_rejet text,
  ADD COLUMN soumis_le timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN examine_le timestamptz,
  ADD COLUMN examine_par uuid REFERENCES admins(id);

ALTER TABLE documents_institution
  ADD CONSTRAINT documents_institution_institution_type_unique UNIQUE (institution_id, type);

-- Pas de policy RLS ajoutee volontairement — accès exclusivement via routes
-- service_role (upload citoyen, lecture/decision admin), meme pattern que
-- institution_responsables. Le client ne voit jamais `url`, uniquement
-- type/statut/motif_rejet via une route dediee qui exclut `url` du select.
ALTER TABLE documents_institution ENABLE ROW LEVEL SECURITY;
