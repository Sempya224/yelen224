-- TRUST — Lot 2.4, tests séquentiels (scénarios 1-4, 7-11 du plan
-- YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md, section 6, + les tests
-- de contournement exigés par le CEO au Lot 2.4).
--
-- À exécuter par Bryan, bloc par bloc, dans le SQL Editor Supabase, sur un
-- ENVIRONNEMENT DE TEST (institution de test dédiée, jamais des données de
-- production réelles) — voir la mise en garde de la section "Environnement"
-- du rapport de migration avant de lancer quoi que ce soit ici.
--
-- Convention : chaque bloc est numéroté et indépendant, avec le résultat
-- ATTENDU en commentaire juste après. Coller le résultat RÉEL obtenu (pas
-- seulement "OK"/"KO") dans docs/product/YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md.
-- Un bloc non exécuté = NOT VERIFIED, jamais présumé (consigne CEO item 7).

-- ============================================================
-- Préparation — créer une institution de test dédiée si aucune n'existe.
-- Remplacer <TEST_INSTITUTION_ID> et <TEST_MEMBRE_ID> ci-dessous par les
-- valeurs réelles une fois cette institution/membre créés (ou réutiliser
-- une institution de test déjà existante).
-- ============================================================
-- SELECT id FROM institutions WHERE name ILIKE '%test%' LIMIT 5;
-- SELECT id, institution_id FROM institution_membres WHERE institution_id = '<TEST_INSTITUTION_ID>';

-- ============================================================
-- TEST 1 — Première soumission
-- ============================================================
SELECT * FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'piece_identite', 'test-v1.pdf',
  '<TEST_INSTITUTION_ID>/piece_identite/00000000-0000-0000-0000-000000000001.pdf',
  'hash-fictif-v1', '<TEST_MEMBRE_ID>'::uuid
);
-- ATTENDU : 1 ligne, numero_version=1, statut_actif=true, remplace_version_id=NULL, statut='recu'.

SELECT id, numero_version, statut_actif, remplace_version_id, statut
FROM documents_institution
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite';
-- ATTENDU : exactement 1 ligne, celle créée ci-dessus.

-- ============================================================
-- TEST 2 — Remplacement après rejet
-- ============================================================
-- 2a. Simuler un examen/rejet sur la ligne V1 (opération admin normale,
-- transition légitime autorisée par le trigger : recu -> rejete).
UPDATE documents_institution
SET statut = 'rejete', motif_rejet = 'Test — document illisible', examine_le = now(), examine_par = (SELECT id FROM admin_users LIMIT 1)
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND statut_actif;

-- 2b. Nouvelle soumission (V2).
SELECT * FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'piece_identite', 'test-v2.pdf',
  '<TEST_INSTITUTION_ID>/piece_identite/00000000-0000-0000-0000-000000000002.pdf',
  'hash-fictif-v2', '<TEST_MEMBRE_ID>'::uuid
);

SELECT id, numero_version, statut_actif, remplace_version_id, statut, motif_rejet
FROM documents_institution
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite'
ORDER BY numero_version;
-- ATTENDU : 2 lignes.
--   V1 : numero_version=1, statut_actif=FALSE, statut='rejete', motif_rejet INTACT ("Test — document illisible").
--   V2 : numero_version=2, statut_actif=TRUE, remplace_version_id=<id de V1>, statut='recu'.

-- ============================================================
-- TEST 3 — Remplacement après complément demandé (même logique que test 2)
-- ============================================================
UPDATE documents_institution
SET statut = 'complement_demande', motif_rejet = 'Test — page manquante', examine_le = now(), examine_par = (SELECT id FROM admin_users LIMIT 1)
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND statut_actif;

SELECT * FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'piece_identite', 'test-v3.pdf',
  '<TEST_INSTITUTION_ID>/piece_identite/00000000-0000-0000-0000-000000000003.pdf',
  'hash-fictif-v3', '<TEST_MEMBRE_ID>'::uuid
);
-- ATTENDU : V3 créée (numero_version=3, statut_actif=true, remplace_version_id=<id V2>) ;
-- V2 désactivée, statut='complement_demande' intact.

-- ============================================================
-- TEST 4 — Remplacement après validation (doit être bloqué CÔTÉ ROUTE,
-- pas par le RPC lui-même — voir plan d'implémentation section 1,
-- "ce que la fonction ne fait pas"). Ce bloc vérifie que le RPC LUI-MÊME
-- n'empêche PAS l'opération (comportement voulu, séparation mécanisme/
-- politique) — c'est bien à app/api/institution/documents/route.ts
-- (pré-check statut IN ('recu','valide') + statut_actif=true) de refuser.
-- ============================================================
UPDATE documents_institution
SET statut = 'valide', examine_le = now(), examine_par = (SELECT id FROM admin_users LIMIT 1)
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND statut_actif;

-- Test manuel (pas SQL) : appeler POST /api/institution/documents avec ce
-- même (institution, type) depuis un compte de test → ATTENDU : 409
-- "Ce document est déjà en cours d'examen ou validé...", AVANT tout appel
-- au RPC (vérifier dans les logs serveur qu'aucun appel RPC n'a eu lieu).

-- ============================================================
-- TEST 7 — Modification d'une preuve historique (doit échouer)
-- ============================================================
UPDATE documents_institution SET soumis_le = now()
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND statut <> 'recu' LIMIT 1;
-- ATTENDU : ERROR — "documents_institution: cette version est figée..."

-- Variante — tentative de contournement explicitement exigée par le CEO :
-- modifier une colonne protégée SANS toucher à `statut`.
UPDATE documents_institution SET examine_par = (SELECT id FROM admin_users OFFSET 1 LIMIT 1)
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND statut = 'valide';
-- ATTENDU : ERROR — "documents_institution: décision déjà prise pour cette version, immuable..."

UPDATE documents_institution SET motif_rejet = 'falsifié'
WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND statut = 'valide';
-- ATTENDU : même ERROR (motif_rejet fait partie du garde étendu, section 2 du plan d'implémentation).

-- ============================================================
-- TEST 8 — Suppression (doit échouer)
-- ============================================================
DELETE FROM documents_institution WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'piece_identite' AND numero_version = 1;
-- ATTENDU : ERROR — "documents_institution: suppression interdite..."

-- ============================================================
-- TEST 9 — Falsification de soumis_par_membre_id (membre d'une AUTRE institution)
-- ============================================================
-- Remplacer <AUTRE_INSTITUTION_MEMBRE_ID> par un membre_id appartenant à
-- une institution DIFFÉRENTE de <TEST_INSTITUTION_ID>.
SELECT * FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'rccm', 'test-fraude.pdf',
  '<TEST_INSTITUTION_ID>/rccm/00000000-0000-0000-0000-000000000099.pdf',
  'hash-fictif', '<AUTRE_INSTITUTION_MEMBRE_ID>'::uuid
);
-- ATTENDU : ERROR — "deposer_nouvelle_version_document: membre non autorisé pour cette institution..."
SELECT count(*) FROM documents_institution WHERE institution_id = '<TEST_INSTITUTION_ID>' AND type = 'rccm';
-- ATTENDU : 0 (aucune ligne créée malgré la tentative).

-- ============================================================
-- TEST — accès direct en contournant le RPC (rappel de la règle
-- d'architecture CEO : service_role garde l'accès direct, mais ne doit
-- jamais être utilisé pour ça). Ce bloc vérifie que la base ne l'empêche
-- PAS techniquement (comportement assumé, voir rapport de migration,
-- "risque résiduel service_role") — sert à documenter, pas à faire échouer.
-- ============================================================
INSERT INTO documents_institution (institution_id, type, nom, storage_path, statut, soumis_le, numero_version, statut_actif, soumis_par_membre_id)
VALUES ('<TEST_INSTITUTION_ID>', 'diplome_ordre', 'contournement.pdf', '<TEST_INSTITUTION_ID>/diplome_ordre/manuel.pdf', 'recu', now(), 1, true, '<TEST_MEMBRE_ID>');
-- ATTENDU (documenté, pas un échec du test) : cette insertion RÉUSSIT —
-- confirme que service_role peut toujours contourner le RPC techniquement.
-- C'est le risque résiduel assumé par le CEO (Lot 2.4, "nous ne révoquons
-- pas son accès direct dans ce lot"), pas un bug. Nettoyer cette ligne de
-- test après vérification :
-- DELETE FROM documents_institution WHERE nom = 'contournement.pdf'; -- (échouera aussi, immuable — utiliser l'échappatoire ci-dessous UNIQUEMENT sur cette ligne de test)
-- SET LOCAL app.autoriser_correction_documents_institution = 'on';
-- DELETE FROM documents_institution WHERE nom = 'contournement.pdf';

-- ============================================================
-- TEST 10 — Décision référence V1 puis V2 est soumise (snapshot figé)
-- ============================================================
-- 10a. Décision sur la version active courante (utiliser l'id réel affiché
-- par le SELECT du TEST 3 pour la ligne V3, ou toute version active).
-- Remplacer <ID_VERSION_ACTIVE> et <TEST_ADMIN_ID> ci-dessous.
INSERT INTO verification_decisions (institution_id, axe, type_decision, niveau_preuve, examinateur_admin_id, examinateur_nom, justification)
VALUES ('<TEST_INSTITUTION_ID>', 'identite', 'accordee', 'profil_verifie', '<TEST_ADMIN_ID>', 'Admin Test', 'Test Lot 2.4 — pièce jugée conforme')
RETURNING id, decision_id;
-- Noter le `id` retourné comme <DECISION_ID>.

INSERT INTO verification_decision_preuves (
  decision_id, document_institution_id, type_snapshot, numero_version_snapshot,
  statut_snapshot, storage_path_snapshot, hash_integrite_snapshot,
  soumis_le_snapshot, examine_le_snapshot, examine_par_nom_snapshot
)
SELECT '<DECISION_ID>', id, type, numero_version, statut, storage_path, hash_integrite, soumis_le, examine_le, 'Admin Test'
FROM documents_institution WHERE id = '<ID_VERSION_ACTIVE>';

SELECT statut_snapshot, storage_path_snapshot FROM verification_decision_preuves WHERE decision_id = '<DECISION_ID>';
-- Noter le résultat AVANT le 10b.

-- 10b. Nouvelle version soumise ensuite (renouvellement).
SELECT * FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'piece_identite', 'test-v4-renouvellement.pdf',
  '<TEST_INSTITUTION_ID>/piece_identite/00000000-0000-0000-0000-000000000004.pdf',
  'hash-fictif-v4', '<TEST_MEMBRE_ID>'::uuid
);

SELECT statut_snapshot, storage_path_snapshot FROM verification_decision_preuves WHERE decision_id = '<DECISION_ID>';
-- ATTENDU : IDENTIQUE au résultat noté avant 10b — le snapshot ne bouge jamais,
-- même si documents_institution.statut_actif de la ligne référencée est
-- maintenant `false`.

-- ============================================================
-- TEST 11 — Reconstruction historique complète de la décision
-- ============================================================
SELECT
  vd.decision_id, vd.axe, vd.type_decision, vd.niveau_preuve,
  vd.examinateur_nom, vd.decide_le, vd.justification, vd.expire_le,
  vdp.type_snapshot, vdp.numero_version_snapshot, vdp.statut_snapshot,
  vdp.storage_path_snapshot, vdp.hash_integrite_snapshot,
  vdp.soumis_le_snapshot, vdp.examine_le_snapshot, vdp.examine_par_nom_snapshot
FROM verification_decisions vd
JOIN verification_decision_preuves vdp ON vdp.decision_id = vd.id
WHERE vd.id = '<DECISION_ID>';
-- ATTENDU : une ligne complète, toutes les colonnes de la "règle
-- fondamentale" du CEO renseignées, sans dépendre de l'état courant de
-- documents_institution.

-- ============================================================
-- Tentative de falsification sur verification_decisions/verification_decision_preuves
-- ============================================================
UPDATE verification_decisions SET justification = 'modifié après coup' WHERE id = '<DECISION_ID>';
-- ATTENDU : ERROR — "verification_decisions est immuable..."
DELETE FROM verification_decision_preuves WHERE decision_id = '<DECISION_ID>';
-- ATTENDU : ERROR — "verification_decision_preuves est immuable..."

-- ============================================================
-- Tentative de suppression d'une preuve référencée par une décision (RESTRICT)
-- ============================================================
DELETE FROM documents_institution WHERE id = '<ID_VERSION_ACTIVE>';
-- ATTENDU : ERROR — soit le trigger d'immuabilité (DELETE bloqué en premier),
-- soit la contrainte FK RESTRICT si l'échappatoire du trigger était activée
-- par erreur — dans les deux cas, la ligne référencée par une décision ne
-- doit jamais pouvoir disparaître.
