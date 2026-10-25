-- Tests du Lot 2 (v2, revue 20/10/2026) : doublons, immuabilité, régénération,
-- conflits, états (vide / calculé / régénéré / échec), journal, envois, accès.
--
-- PRÉCONDITIONS
--   1. La migration MIGRATION_PROPOSEE_20261020000001 est appliquée.
--   2. Exécution par Bryan dans le SQL Editor (rôle postgres).
--   3. Au moins un établissement existe (le premier est utilisé).
--   4. Semaines de test en 2020 : aucune collision avec de vraies données.
--
-- ISOLATION : tout est dans BEGIN ... ROLLBACK, aucune donnée ne persiste.
-- RÉSULTAT ATTENDU : une seule ligne finale
--     resultat = "TOUS LES TESTS AUTOMATISABLES SONT PASSES (T1 a T24)".
--   L'éditeur SQL Supabase n'affiche PAS les NOTICE ("OK Tn" ne sont visibles
--   que dans un client psql) : le critère de réussite est donc cette ligne.
--   Toute anomalie lève une exception "ECHEC Tn" et arrête le script AVANT
--   cette ligne ; la transaction reste alors à annuler : exécuter ROLLBACK;
--   et me transmettre le message d'erreur.
-- ROLLBACK DU SCHÉMA lui-même : ROLLBACK_LOT2.sql.

BEGIN;

DO $$
DECLARE
  v_inst   uuid;
  v_sem    date := DATE '2020-01-06';
  v_gen    timestamptz := TIMESTAMPTZ '2020-01-14 06:00:00+00';
  v_res    record;
  v_etat   record;
  v_id1    uuid;
  v_id2    uuid;
  v_n      integer;
  v_bool   boolean;
  v_txt    text;
BEGIN
  SELECT id INTO v_inst FROM institutions LIMIT 1;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'ECHEC : aucun établissement pour tester'; END IF;

  -- ── Création, idempotence ─────────────────────────────────────────────────
  -- T1 création d'une première version
  SELECT * INTO v_res FROM institution_rapport_hebdo_enregistrer(v_inst, v_sem, 1, false, '{"bloc":"x"}'::jsonb, v_gen);
  IF v_res.out_resultat <> 'cree' OR v_res.out_numero <> 1 THEN RAISE EXCEPTION 'ECHEC T1 : %', v_res; END IF;
  v_id1 := v_res.out_rapport_id;
  RAISE NOTICE 'OK T1 création v1';

  -- T2 idempotence : un cron relancé ne crée rien, le contenu d'origine est conservé
  SELECT * INTO v_res FROM institution_rapport_hebdo_enregistrer(v_inst, v_sem, 1, false, '{"bloc":"y"}'::jsonb, v_gen);
  SELECT count(*) INTO v_n FROM institution_rapports_hebdo WHERE institution_id = v_inst AND semaine_debut = v_sem;
  IF v_res.out_resultat <> 'deja_genere' OR v_res.out_rapport_id <> v_id1 OR v_n <> 1 THEN RAISE EXCEPTION 'ECHEC T2 : % / % lignes', v_res, v_n; END IF;
  RAISE NOTICE 'OK T2 idempotence (1 seule ligne)';

  -- ── Régénération : motif, version attendue, conflit ───────────────────────
  -- T3a régénération sans motif refusée
  BEGIN
    PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, v_sem, 2, false, '{"bloc":"z"}'::jsonb, v_gen, true, NULL, p_version_attendue => 1);
    RAISE EXCEPTION 'ECHEC T3a : régénération sans motif acceptée';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC T3a%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T3a motif obligatoire';
  END;
  -- T3b régénération sans version attendue refusée
  BEGIN
    PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, v_sem, 2, false, '{"bloc":"z"}'::jsonb, v_gen, true, 'Correction du calcul V6');
    RAISE EXCEPTION 'ECHEC T3b : régénération sans version attendue acceptée';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC T3b%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T3b version attendue obligatoire';
  END;

  -- T4 régénération valide : v2 courante, v1 conservée non courante
  SELECT * INTO v_res FROM institution_rapport_hebdo_enregistrer(v_inst, v_sem, 2, false, '{"bloc":"v2"}'::jsonb, v_gen, true, 'Correction du calcul V6', p_version_attendue => 1);
  v_id2 := v_res.out_rapport_id;
  SELECT count(*) INTO v_n FROM institution_rapports_hebdo WHERE institution_id = v_inst AND semaine_debut = v_sem;
  IF v_res.out_resultat <> 'regenere' OR v_res.out_numero <> 2 OR v_n <> 2 THEN RAISE EXCEPTION 'ECHEC T4 : % / % lignes', v_res, v_n; END IF;
  SELECT count(*) INTO v_n FROM institution_rapports_hebdo WHERE institution_id = v_inst AND semaine_debut = v_sem AND est_courante;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ECHEC T4 : % rapports courants', v_n; END IF;
  SELECT est_courante INTO v_bool FROM institution_rapports_hebdo WHERE id = v_id1;
  IF v_bool THEN RAISE EXCEPTION 'ECHEC T4 : la v1 est restée courante'; END IF;
  RAISE NOTICE 'OK T4 régénération : v1 conservée, un seul courant';

  -- T4b conflit : une seconde régénération basée sur la v1 (périmée) n'écrit rien
  SELECT * INTO v_res FROM institution_rapport_hebdo_enregistrer(v_inst, v_sem, 2, false, '{"bloc":"v2bis"}'::jsonb, v_gen, true, 'Seconde correction concurrente', p_version_attendue => 1);
  SELECT count(*) INTO v_n FROM institution_rapports_hebdo WHERE institution_id = v_inst AND semaine_debut = v_sem;
  IF v_res.out_resultat <> 'conflit' OR v_res.out_numero <> 2 OR v_n <> 2 THEN RAISE EXCEPTION 'ECHEC T4b : % / % lignes', v_res, v_n; END IF;
  RAISE NOTICE 'OK T4b conflit : aucune version écrite';

  -- T5 un second rapport courant est impossible (index unique partiel)
  BEGIN
    INSERT INTO institution_rapports_hebdo (institution_id, semaine_debut, semaine_fin, numero_version, est_courante, remplace_id, motif_regeneration, version_moteur, vide, contenu, genere_le)
    VALUES (v_inst, v_sem, v_sem + 6, 3, true, v_id2, 'doublon volontaire', 1, false, '{}'::jsonb, v_gen);
    RAISE EXCEPTION 'ECHEC T5 : deux rapports courants acceptés';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK T5 un seul rapport courant par établissement et semaine';
  END;

  -- ── Immuabilité des rapports ──────────────────────────────────────────────
  -- T6 le contenu est immuable
  BEGIN
    UPDATE institution_rapports_hebdo SET contenu = '{"altere":true}'::jsonb WHERE id = v_id1;
    RAISE EXCEPTION 'ECHEC T6 : UPDATE du contenu accepté';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC T6%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T6 contenu immuable';
  END;
  -- T7 réactivation et suppression refusées
  BEGIN
    UPDATE institution_rapports_hebdo SET est_courante = true WHERE id = v_id1;
    RAISE EXCEPTION 'ECHEC T7a : réactivation acceptée';
  EXCEPTION WHEN raise_exception OR unique_violation THEN
    IF SQLERRM LIKE 'ECHEC T7a%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T7a réactivation refusée';
  END;
  BEGIN
    DELETE FROM institution_rapports_hebdo WHERE id = v_id1;
    RAISE EXCEPTION 'ECHEC T7b : DELETE accepté';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC T7b%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T7b suppression interdite';
  END;

  -- ── Contraintes de période et de type ─────────────────────────────────────
  -- T8a un jour qui n'est pas un lundi est refusé
  BEGIN
    PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, DATE '2020-01-07', 1, false, '{}'::jsonb, v_gen);
    RAISE EXCEPTION 'ECHEC T8a : semaine commençant un mardi acceptée';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK T8a lundi obligatoire';
  END;
  -- T8b un rapport sur une semaine non terminée est refusé
  BEGIN
    PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, DATE '2020-01-13', 1, false, '{}'::jsonb, TIMESTAMPTZ '2020-01-15 12:00:00+00');
    RAISE EXCEPTION 'ECHEC T8b : rapport d''une semaine non terminée accepté';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK T8b semaine terminée obligatoire';
  END;
  -- T8c un contenu qui n'est pas un objet est refusé
  BEGIN
    PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, DATE '2020-01-20', 1, false, '[]'::jsonb, TIMESTAMPTZ '2020-01-28 06:00:00+00');
    RAISE EXCEPTION 'ECHEC T8c : contenu non objet accepté';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK T8c contenu objet obligatoire';
  END;

  -- ── États : calculé / régénéré / vide / échec / jamais tentée ────────────
  -- T16 la semaine régénérée est "regenere" (version 2)
  SELECT * INTO v_etat FROM institution_rapports_hebdo_etat WHERE institution_id = v_inst AND semaine_debut = v_sem;
  IF v_etat.etat <> 'regenere' OR NOT v_etat.est_regenere OR v_etat.numero_version <> 2 THEN RAISE EXCEPTION 'ECHEC T16 : %', v_etat; END IF;
  RAISE NOTICE 'OK T16 état regenere';

  -- T17 une semaine vide CALCULÉE est "vide"
  PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, DATE '2020-02-03', 1, true, '{"vide":true}'::jsonb, TIMESTAMPTZ '2020-02-11 06:00:00+00');
  SELECT * INTO v_etat FROM institution_rapports_hebdo_etat WHERE institution_id = v_inst AND semaine_debut = DATE '2020-02-03';
  IF v_etat.etat <> 'vide' OR v_etat.rapport_id IS NULL THEN RAISE EXCEPTION 'ECHEC T17 : %', v_etat; END IF;
  RAISE NOTICE 'OK T17 état vide (rapport calculé sans activité)';

  -- T18 un ÉCHEC sans aucun rapport est "echec", JAMAIS "vide"
  PERFORM institution_rapport_hebdo_journaliser_echec(v_inst, DATE '2020-02-10', 'Délai dépassé lors du calcul', 1200);
  SELECT * INTO v_etat FROM institution_rapports_hebdo_etat WHERE institution_id = v_inst AND semaine_debut = DATE '2020-02-10';
  IF v_etat.etat <> 'echec' OR v_etat.rapport_id IS NOT NULL OR v_etat.derniere_erreur IS NULL THEN RAISE EXCEPTION 'ECHEC T18 : %', v_etat; END IF;
  IF v_etat.etat = 'vide' THEN RAISE EXCEPTION 'ECHEC T18 : un échec a été présenté comme une semaine vide'; END IF;
  RAISE NOTICE 'OK T18 état echec distinct de vide';

  -- T19 reprise réussie après l'échec : "calcule"
  PERFORM * FROM institution_rapport_hebdo_enregistrer(v_inst, DATE '2020-02-10', 1, false, '{"ok":true}'::jsonb, TIMESTAMPTZ '2020-02-18 06:00:00+00');
  SELECT * INTO v_etat FROM institution_rapports_hebdo_etat WHERE institution_id = v_inst AND semaine_debut = DATE '2020-02-10';
  IF v_etat.etat <> 'calcule' OR v_etat.derniere_tentative <> 'cree' OR v_etat.echec_apres_rapport THEN RAISE EXCEPTION 'ECHEC T19 : %', v_etat; END IF;
  RAISE NOTICE 'OK T19 reprise réussie après échec';

  -- T20 un échec de RÉGÉNÉRATION laisse le rapport courant en place et le signale
  PERFORM institution_rapport_hebdo_journaliser_echec(v_inst, DATE '2020-02-10', 'Régénération interrompue', 300);
  SELECT * INTO v_etat FROM institution_rapports_hebdo_etat WHERE institution_id = v_inst AND semaine_debut = DATE '2020-02-10';
  IF v_etat.etat <> 'calcule' OR NOT v_etat.echec_apres_rapport OR v_etat.derniere_erreur IS NULL THEN RAISE EXCEPTION 'ECHEC T20 : %', v_etat; END IF;
  RAISE NOTICE 'OK T20 échec après rapport signalé, rapport conservé';

  -- T21 journal : 4 tentatives sur la semaine de T1 à T4b, dans l'ordre
  SELECT string_agg(resultat, ',' ORDER BY created_at) INTO v_txt
  FROM institution_rapports_hebdo_executions WHERE institution_id = v_inst AND semaine_debut = v_sem;
  IF v_txt <> 'cree,deja_genere,regenere,conflit' THEN RAISE EXCEPTION 'ECHEC T21 : journal = %', v_txt; END IF;
  RAISE NOTICE 'OK T21 journal complet (cree, deja_genere, regenere, conflit)';

  -- T22 le journal est insert-only
  BEGIN
    UPDATE institution_rapports_hebdo_executions SET resultat = 'cree' WHERE institution_id = v_inst AND resultat = 'echec';
    RAISE EXCEPTION 'ECHEC T22a : UPDATE du journal accepté';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC T22a%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T22a journal non modifiable';
  END;
  BEGIN
    DELETE FROM institution_rapports_hebdo_executions WHERE institution_id = v_inst AND resultat = 'echec';
    RAISE EXCEPTION 'ECHEC T22b : DELETE du journal accepté';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ECHEC T22b%' THEN RAISE; END IF;
    RAISE NOTICE 'OK T22b journal non supprimable';
  END;

  -- T23 un échec sans message reçoit un message explicite (jamais NULL)
  PERFORM institution_rapport_hebdo_journaliser_echec(v_inst, DATE '2020-02-17', '   ');
  SELECT erreur INTO v_txt FROM institution_rapports_hebdo_executions WHERE institution_id = v_inst AND semaine_debut = DATE '2020-02-17';
  IF v_txt <> 'erreur non précisée' THEN RAISE EXCEPTION 'ECHEC T23 : %', v_txt; END IF;
  RAISE NOTICE 'OK T23 échec sans message';

  -- T24 absence de ligne = jamais tentée, ce n'est PAS une semaine vide
  SELECT count(*) INTO v_n FROM institution_rapports_hebdo_etat WHERE institution_id = v_inst AND semaine_debut = DATE '2020-04-06';
  IF v_n <> 0 THEN RAISE EXCEPTION 'ECHEC T24 : une semaine jamais tentée apparaît dans la vue'; END IF;
  RAISE NOTICE 'OK T24 semaine jamais tentée absente de la vue (ne pas la lire comme vide)';

  -- ── Envois (notifications) ────────────────────────────────────────────────
  -- T9 une seule réservation par (établissement, semaine, canal)
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'notification', v_id1) INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION 'ECHEC T9a : première réservation refusée'; END IF;
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'notification', v_id1) INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION 'ECHEC T9b : double réservation acceptée'; END IF;
  RAISE NOTICE 'OK T9 une seule réservation d''envoi';

  -- T10 la régénération (v2) ne rouvre PAS l'envoi
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'notification', v_id2) INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION 'ECHEC T10 : une version régénérée a rouvert l''envoi'; END IF;
  RAISE NOTICE 'OK T10 régénération sans nouvelle notification';

  -- T11 envoi réussi puis tentative de reprise : refusée
  SELECT institution_rapport_hebdo_terminer_envoi(v_inst, v_sem, 'notification', true) INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION 'ECHEC T11a : clôture impossible'; END IF;
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'notification', v_id1) INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION 'ECHEC T11b : reprise d''un envoi déjà envoyé'; END IF;
  RAISE NOTICE 'OK T11 un envoi réussi n''est jamais repris';

  -- T12 échec puis reprise autorisée (tentatives = 2) ; un envoi 'reserve' n'est pas repris
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'push', v_id1) INTO v_bool;
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'push', v_id1) INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION 'ECHEC T12a : reprise d''un envoi encore réservé'; END IF;
  PERFORM institution_rapport_hebdo_terminer_envoi(v_inst, v_sem, 'push', false, 'erreur simulée');
  SELECT institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'push', v_id1) INTO v_bool;
  SELECT tentatives INTO v_n FROM institution_rapports_hebdo_envois WHERE institution_id = v_inst AND semaine_debut = v_sem AND canal = 'push';
  IF NOT v_bool OR v_n <> 2 THEN RAISE EXCEPTION 'ECHEC T12b : reprise après échec impossible (% / %)', v_bool, v_n; END IF;
  RAISE NOTICE 'OK T12 reprise après échec uniquement';

  -- T13 canal inconnu refusé
  BEGIN
    PERFORM institution_rapport_hebdo_reserver_envoi(v_inst, v_sem, 'sms', v_id1);
    RAISE EXCEPTION 'ECHEC T13 : canal inconnu accepté';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK T13 canal contrôlé';
  END;

  -- ── Accès par rôle ────────────────────────────────────────────────────────
  -- T14 anon et authenticated : aucun droit (tables, vue, fonctions)
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM institution_rapports_hebdo;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T14a : anon lit la table';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T14a anon refusé (lecture)';
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM institution_rapports_hebdo;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T14b : authenticated lit la table';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T14b authenticated refusé (lecture)';
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM institution_rapport_hebdo_enregistrer(v_inst, DATE '2020-03-02', 1, false, '{}'::jsonb, TIMESTAMPTZ '2020-03-10 06:00:00+00');
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T14c : authenticated exécute la fonction';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T14c authenticated refusé (fonction)';
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM institution_rapports_hebdo_envois;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T14d : authenticated lit les envois';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T14d authenticated refusé (envois)';
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM count(*) FROM institution_rapports_hebdo_etat;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T14e : authenticated lit la vue d''état';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T14e authenticated refusé (vue d''état)';
  END;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM institution_rapports_hebdo_executions;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T14f : anon lit le journal';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T14f anon refusé (journal)';
  END;

  -- T15 service_role : lit tout, n'écrit que ce qui est prévu, ne supprime rien
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM count(*) FROM institution_rapports_hebdo;
    PERFORM count(*) FROM institution_rapports_hebdo_etat;
    PERFORM count(*) FROM institution_rapports_hebdo_executions;
    RESET ROLE;
    RAISE NOTICE 'OK T15a service_role peut lire (table, vue, journal)';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T15a : service_role ne peut pas lire';
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    DELETE FROM institution_rapports_hebdo WHERE id = v_id1;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T15b : service_role peut supprimer un rapport';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T15b service_role sans DELETE (rapports)';
  END;
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE institution_rapports_hebdo_executions SET erreur = 'x' WHERE institution_id = v_inst;
    RESET ROLE;
    RAISE EXCEPTION 'ECHEC T15c : service_role peut modifier le journal';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK T15c service_role sans UPDATE (journal)';
  END;

  RAISE NOTICE 'TOUS LES TESTS AUTOMATISABLES SONT PASSES';
END $$;

ROLLBACK;

-- Atteint uniquement si le bloc DO ci-dessus s'est terminé sans exception.
SELECT 'TOUS LES TESTS AUTOMATISABLES SONT PASSES (T1 a T24)' AS resultat;

-- Les scénarios de CONCURRENCE (deux sessions réelles) ne peuvent pas être
-- joués dans l'éditeur SQL Supabase (connexions poolées) : voir
-- CONCURRENCE_LOT2.mjs et PROPOSITION_LOT2.md §7.
