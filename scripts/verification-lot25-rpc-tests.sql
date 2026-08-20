-- TRUST — Lot 2.5, étape 3 : tests directs de prendre_decision_verification(),
-- AVANT toute UI, conformément à l'ordre imposé par le CEO.
--
-- À exécuter par Bryan, bloc par bloc, dans le SQL Editor Supabase, sur
-- une institution de test jetable (jamais des données réelles — voir
-- CLAUDE.md, aucune institution vraie active à ce jour).
--
-- Convention : chaque bloc numéroté correspond à un des 15 points exigés
-- par le CEO. 2 points sont explicitement NOT APPLICABLE au RPC lui-même
-- (documentés comme tels, pas fabriqués) : #10 "responsable modifié"
-- (institution_responsables n'est jamais lu par cette fonction — hors
-- périmètre par conception) et une partie de #6 "absence de permission"
-- (l'EXECUTE est déjà restreint à service_role au niveau SQL — la vraie
-- vérification de permission applicative institutions.verify vit dans la
-- route, testée à l'étape 5, pas ici).
--
-- Coller chaque résultat RÉEL dans le rapport, jamais présumer.

-- ============================================================
-- SETUP — institution de test + admin réel + 2 preuves actives
-- (identité + autorité)
-- ============================================================
INSERT INTO institutions (id, name, email, statut, statut_juridique, plan, secteur, slug)
VALUES (gen_random_uuid(), 'Test Lot 2.5 (jetable)', 'test-lot25@example.invalid', 'en_attente', 'prive_formel', 'essentiel', 'commerce', 'test-lot25-' || substr(gen_random_uuid()::text, 1, 8))
RETURNING id;
-- Noter <TEST_INSTITUTION_ID>.

INSERT INTO institution_membres (institution_id, prenom, nom, role, actif, compte_principal)
VALUES ('<TEST_INSTITUTION_ID>', 'Test', 'Lot25', 'admin', true, true)
RETURNING id;
-- Noter <TEST_MEMBRE_ID>.

SELECT id, email, role FROM admin_users WHERE is_active LIMIT 1;
-- Noter <TEST_ADMIN_ID>.

-- Preuve pour l'axe identité (piece_identite) — via le RPC déjà validé au Lot 2.4.
SELECT id FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'piece_identite', 'test-identite.pdf',
  '<TEST_INSTITUTION_ID>/piece_identite/00000000-0000-0000-0000-000000000001.pdf',
  'hash-identite', '<TEST_MEMBRE_ID>'::uuid
);
-- Noter <DOC_IDENTITE_ID>.

-- Preuve pour l'axe autorité (rccm, faute de nomination_habilitation
-- explicitement requis pour prive_formel — peu importe pour ce test, seul
-- le statut_actif=true compte pour la fonction).
SELECT id FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'rccm', 'test-autorite.pdf',
  '<TEST_INSTITUTION_ID>/rccm/00000000-0000-0000-0000-000000000002.pdf',
  'hash-autorite', '<TEST_MEMBRE_ID>'::uuid
);
-- Noter <DOC_AUTORITE_ID>.

-- ============================================================
-- TEST 1 + 2 — décision valide, axe Identité (accordee)
-- ============================================================
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'accordee', 'profil_verifie',
  'Test Lot 2.5 — pièce jugée conforme', NULL, '<TEST_ADMIN_ID>'::uuid,
  NULL, NULL, ARRAY['<DOC_IDENTITE_ID>']::uuid[]
);
-- ATTENDU : 1 ligne, decision_id='YL-VER-...', examinateur_nom dérivé
-- (pas NULL), decision_precedente_id=NULL (première décision sur cet axe).
-- Noter <DECISION_IDENTITE_1_ID>.

-- ============================================================
-- TEST 3 — décision valide, axe Autorité (accordee), preuve différente
-- ============================================================
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'autorite', 'accordee', 'profil_verifie',
  'Test Lot 2.5 — RCCM conforme', NULL, '<TEST_ADMIN_ID>'::uuid,
  NULL, NULL, ARRAY['<DOC_AUTORITE_ID>']::uuid[]
);
-- ATTENDU : 1 ligne, axe='autorite', decision_precedente_id=NULL (premher
-- décision sur CET axe — indépendant de la décision identité ci-dessus,
-- confirme la séparation des axes).
-- Noter <DECISION_AUTORITE_1_ID>.

-- ============================================================
-- TEST 4 — complément demandé (sur identité, remplace la décision 1)
-- ============================================================
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'complement_demande', NULL,
  'Test Lot 2.5 — photo illisible', 'Merci de renvoyer une pièce plus lisible',
  '<TEST_ADMIN_ID>'::uuid, NULL, '<DECISION_IDENTITE_1_ID>'::uuid, NULL
);
-- ATTENDU : nouvelle décision, decision_precedente_id=<DECISION_IDENTITE_1_ID>.
-- Noter <DECISION_IDENTITE_2_ID>.

-- ============================================================
-- TEST 5 — rejet (sur autorité, remplace la décision 3)
-- ============================================================
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'autorite', 'rejetee', NULL,
  'Test Lot 2.5 — RCCM invalide, numéro incohérent', NULL,
  '<TEST_ADMIN_ID>'::uuid, NULL, '<DECISION_AUTORITE_1_ID>'::uuid, NULL
);
-- ATTENDU : succès, aucune preuve requise pour un rejet.

-- ============================================================
-- TEST 6 — absence de permission (admin inexistant/inactif)
-- ============================================================
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'accordee', 'profil_verifie',
  'Test', NULL, '00000000-0000-0000-0000-000000000000'::uuid,
  NULL, '<DECISION_IDENTITE_2_ID>'::uuid, ARRAY['<DOC_IDENTITE_ID>']::uuid[]
);
-- ATTENDU : ERROR — "examinateur inconnu ou inactif".

-- ============================================================
-- TEST 7 — preuve inexistante
-- ============================================================
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'accordee', 'profil_verifie',
  'Test', NULL, '<TEST_ADMIN_ID>'::uuid,
  NULL, '<DECISION_IDENTITE_2_ID>'::uuid, ARRAY['00000000-0000-0000-0000-000000000099']::uuid[]
);
-- ATTENDU : ERROR — "preuve inconnue".

-- ============================================================
-- TEST 8 + 9 — preuve remplacée / périmée pendant l'examen
-- ============================================================
-- 8a. Remplacer la preuve identité par une nouvelle version (simule un
-- renvoi de document pendant que l'admin a le dossier ouvert).
SELECT id FROM deposer_nouvelle_version_document(
  '<TEST_INSTITUTION_ID>'::uuid, 'piece_identite', 'test-identite-v2.pdf',
  '<TEST_INSTITUTION_ID>/piece_identite/00000000-0000-0000-0000-000000000003.pdf',
  'hash-identite-v2', '<TEST_MEMBRE_ID>'::uuid
);
-- 8b. Tentative de décision référençant l'ANCIENNE preuve (<DOC_IDENTITE_ID>,
-- désormais statut_actif=false).
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'accordee', 'profil_verifie',
  'Test', NULL, '<TEST_ADMIN_ID>'::uuid,
  NULL, '<DECISION_IDENTITE_2_ID>'::uuid, ARRAY['<DOC_IDENTITE_ID>']::uuid[]
);
-- ATTENDU : ERROR — "n'est plus la version active — elle a été remplacée
-- pendant l'examen". Couvre à la fois #8 (remplacée) et #9 (périmée) —
-- même garde, deux formulations du même scénario.

-- ============================================================
-- TEST 10 — responsable modifié pendant l'examen
-- ============================================================
-- NOT APPLICABLE à cette fonction — institution_responsables n'est jamais
-- lu par prendre_decision_verification (hors périmètre par conception,
-- voir docs/product/YELEN_TRUST_VERIFICATION_ADMIN_WORKFLOW.md section 2
-- "Autorité" : aucune preuve n'y est aujourd'hui rattachée). Rien à tester
-- ici — ne pas fabriquer un test qui ne correspond à aucun code réel.

-- ============================================================
-- TEST 11 + 12 — décision concurrente / seconde décision contradictoire
-- ============================================================
-- Admin A ouvre le dossier (voit <DECISION_IDENTITE_2_ID> comme dernière
-- décision identité). Admin B décide entretemps (utilise le même
-- <TEST_ADMIN_ID> ici pour simplifier — le mécanisme ne dépend pas de
-- l'identité de l'admin, seulement de decision_precedente_id) :
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'rejetee', NULL,
  'Test Lot 2.5 — Admin B décide en premier', NULL, '<TEST_ADMIN_ID>'::uuid,
  NULL, '<DECISION_IDENTITE_2_ID>'::uuid, NULL
);
-- ATTENDU : succès. Noter <DECISION_IDENTITE_3_ID>.

-- Admin A tente maintenant sa décision avec son état PÉRIMÉ
-- (<DECISION_IDENTITE_2_ID>, plus la vraie dernière décision) :
SELECT * FROM prendre_decision_verification(
  '<TEST_INSTITUTION_ID>'::uuid, 'identite', 'accordee', 'profil_verifie',
  'Test Lot 2.5 — Admin A avec état périmé', NULL, '<TEST_ADMIN_ID>'::uuid,
  NULL, '<DECISION_IDENTITE_2_ID>'::uuid, ARRAY['<DOC_IDENTITE_ID>']::uuid[]
);
-- ATTENDU OBLIGATOIRE (CEO) : ERROR explicite "une autre décision a déjà
-- été prise entretemps par ... — rechargez le dossier". AUCUNE nouvelle
-- décision créée. Vérifier ensuite :
SELECT count(*) FROM verification_decisions WHERE institution_id = '<TEST_INSTITUTION_ID>' AND axe = 'identite';
-- ATTENDU : 3 (pas 4) — la tentative d'Admin A n'a rien créé.

-- ============================================================
-- TEST 13 — rollback (réutilise le patron du Lot 2.4 — fonction jumelle)
-- ============================================================
-- SQL à exécuter une fois (SQL Editor) :
--   CREATE OR REPLACE FUNCTION prendre_decision_verification_test_echec(
--     p_institution_id uuid, p_axe text
--   ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
--   BEGIN
--     PERFORM pg_advisory_xact_lock(hashtext('verif_decision:' || p_institution_id::text || ':' || p_axe));
--     RAISE EXCEPTION 'ECHEC FORCE — test rollback Lot 2.5';
--   END; $$;
--   GRANT EXECUTE ON FUNCTION prendre_decision_verification_test_echec(uuid,text) TO service_role;
SELECT count(*) FROM verification_decisions WHERE institution_id = '<TEST_INSTITUTION_ID>' AND axe = 'autorite';
-- Noter le compte AVANT (attendu : 2, décisions 3/5 de ce script).
SELECT prendre_decision_verification_test_echec('<TEST_INSTITUTION_ID>'::uuid, 'autorite');
-- ATTENDU : ERROR "ECHEC FORCE...".
SELECT count(*) FROM verification_decisions WHERE institution_id = '<TEST_INSTITUTION_ID>' AND axe = 'autorite';
-- ATTENDU : IDENTIQUE au compte d'avant — rien n'a été inséré malgré la
-- prise du verrou avant l'échec (démontre que le verrou lui-même ne
-- "réserve" rien tant que la transaction n'a pas COMMIT).
-- Nettoyage : DROP FUNCTION prendre_decision_verification_test_echec(uuid,text);

-- ============================================================
-- TEST 14 — tentative de contournement direct (documente le risque
-- résiduel déjà acté pour service_role, ne doit pas échouer — c'est
-- attendu, pas un bug)
-- ============================================================
INSERT INTO verification_decisions (institution_id, axe, type_decision, niveau_preuve, examinateur_admin_id, examinateur_nom, justification)
VALUES ('<TEST_INSTITUTION_ID>', 'identite', 'accordee', 'profil_verifie', '<TEST_ADMIN_ID>', 'Contournement Test', 'Insert direct, bypass du RPC')
RETURNING id, decision_id;
-- ATTENDU (documenté, pas un échec du test) : RÉUSSIT — confirme que
-- service_role garde l'accès direct (risque résiduel déjà acté CEO/Lot 2.4,
-- pas de nouvelle contrainte DB empêchant ce contournement). La table
-- reste immuable APRÈS coup (UPDATE/DELETE toujours bloqués), seul
-- l'INSERT initial n'est pas protégé par le RPC si on le contourne.

-- ============================================================
-- TEST 15 — reconstruction complète de l'historique (inchangé après tout ça)
-- ============================================================
SELECT decision_id, axe, type_decision, examinateur_nom, decide_le, decision_precedente_id
FROM verification_decisions
WHERE institution_id = '<TEST_INSTITUTION_ID>'
ORDER BY axe, decide_le;
-- ATTENDU : chaîne complète et cohérente par axe (identite: 4 lignes dont
-- la dernière liée à decision_precedente_id de la précédente ; autorite:
-- 2 lignes + la ligne de contournement du test 14, qui elle a
-- decision_precedente_id=NULL car insérée hors RPC — signal visible dans
-- l'historique lui-même que cette ligne n'a pas suivi le mécanisme normal,
-- point à noter).

-- ============================================================
-- NETTOYAGE (une fois tous les résultats collés dans le rapport)
-- ============================================================
-- BEGIN;
-- SET LOCAL app.autoriser_correction_verification_decisions = 'on';
-- SET LOCAL app.autoriser_correction_verification_decision_preuves = 'on';
-- SET LOCAL app.autoriser_correction_documents_institution = 'on';
-- SET LOCAL app.autoriser_correction_journal = 'on';
-- SET LOCAL app.autoriser_correction_signalement = 'on';
-- DELETE FROM verification_decision_preuves WHERE decision_id IN (SELECT id FROM verification_decisions WHERE institution_id = '<TEST_INSTITUTION_ID>');
-- DELETE FROM verification_decisions WHERE institution_id = '<TEST_INSTITUTION_ID>';
-- DELETE FROM documents_institution WHERE institution_id = '<TEST_INSTITUTION_ID>';
-- DELETE FROM institution_membres WHERE institution_id = '<TEST_INSTITUTION_ID>';
-- DELETE FROM institutions WHERE id = '<TEST_INSTITUTION_ID>';
-- COMMIT;
