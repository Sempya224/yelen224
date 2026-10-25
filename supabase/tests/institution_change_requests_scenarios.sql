-- OBSOLETE depuis la migration 20261020000001 (publication differee) : ce script teste
-- l'ancien comportement (changement sensible publie tout de suite) et echouerait.
-- Utiliser supabase/tests/publication_differee_scenarios.sql.

-- SCÉNARIOS DE VÉRIFICATION — institution_change_requests +
-- appliquer_modifications_sensibles. NON EXÉCUTÉ.
--
-- À lancer dans le SQL Editor Supabase APRÈS les migrations 20261019000001 et
-- 20261019000002. Tout s'exécute dans un unique bloc DO qui se termine par une
-- RAISE EXCEPTION : l'exception ANNULE TOUT (aucune donnée réelle ne reste
-- modifiée, aucune demande de test ne subsiste) et son message contient le
-- rapport OK / FAIL ligne par ligne. Un FAIL = ne pas passer à la phase 5.
--
-- Il prend automatiquement la première institution qui a un membre, crée
-- 4 sessions de test (réauth fraîche, périmée, révoquée, expirée) et ne
-- touche à rien d'autre. Le rapport ne contient aucun nom ni identifiant.
--
-- Non couvert ici (voir docs/product/YELEN_REVERIFICATION_POLICY.md §8) :
-- les appels concurrents réels (deux sessions SQL en parallèle) — procédure
-- manuelle décrite en fin de fichier.

DO $$
DECLARE
  v_inst uuid; v_mem uuid; v_other_mem uuid;
  v_sess_ok uuid; v_sess_old uuid; v_sess_rev uuid; v_sess_exp uuid;
  v_name0 text; v_statut0 text; v_badge0 text; v_niveau0 text; v_sj0 text; v_plan0 text;
  v_lat numeric; v_lng numeric;
  v_name_mod text; v_name_test text;
  v_res jsonb; v_req uuid; v_n_before int; v_n_after int; v_act_before int; v_act_after int;
  v_ok boolean; v_state text;
  v_win int := 600;
  v_rep text := E'RAPPORT DES SCENARIOS (cette erreur finale annule tout)\n';
BEGIN
  -- ── Fixtures ────────────────────────────────────────────────────────────
  SELECT m.institution_id, m.id INTO v_inst, v_mem
  FROM public.institution_membres m JOIN public.institutions i ON i.id = m.institution_id
  LIMIT 1;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Aucune institution avec membre : scénarios impossibles'; END IF;

  SELECT id INTO v_other_mem FROM public.institution_membres WHERE institution_id <> v_inst LIMIT 1;

  SELECT name, statut::text, badge_verifie::text, niveau_confiance::text, statut_juridique::text, plan::text,
         latitude::numeric, longitude::numeric
  INTO v_name0, v_statut0, v_badge0, v_niveau0, v_sj0, v_plan0, v_lat, v_lng
  FROM public.institutions WHERE id = v_inst;

  INSERT INTO public.institution_sessions (institution_id, membre_id, expires_at, reauth_at)
  VALUES (v_inst, v_mem, now() + interval '1 hour', now()) RETURNING id INTO v_sess_ok;
  INSERT INTO public.institution_sessions (institution_id, membre_id, expires_at, reauth_at)
  VALUES (v_inst, v_mem, now() + interval '1 hour', now() - interval '1 hour') RETURNING id INTO v_sess_old;
  INSERT INTO public.institution_sessions (institution_id, membre_id, expires_at, reauth_at, revoked_at)
  VALUES (v_inst, v_mem, now() + interval '1 hour', now(), now()) RETURNING id INTO v_sess_rev;
  -- Session expirée mais "reauth" récente : doit être refusée quand même.
  INSERT INTO public.institution_sessions (institution_id, membre_id, expires_at, reauth_at)
  VALUES (v_inst, v_mem, now() - interval '1 minute', now()) RETURNING id INTO v_sess_exp;

  v_name_mod  := CASE WHEN v_name0 = upper(v_name0) THEN lower(v_name0) ELSE upper(v_name0) END;
  v_name_test := v_name0 || ' [TEST]';

  -- ── S1 : aucun changement → aucune demande ──────────────────────────────
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_old, jsonb_build_object('name', v_name0), NULL, NULL, NULL, v_win);
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND jsonb_array_length(v_res->'absorbees') = 0;
  v_rep := v_rep || format(E'%s  S1 valeur identique : 0 demande, sans réauth\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S2 : casse seule → écrite, 0 demande, sans réauth ───────────────────
  IF v_name_mod = v_name0 THEN
    v_rep := v_rep || E'SKIP  S2 (le nom ne contient aucune lettre)\n';
  ELSE
    v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_old, jsonb_build_object('name', v_name_mod), NULL, NULL, NULL, v_win);
    v_ok := jsonb_array_length(v_res->'demandes') = 0
            AND (SELECT name FROM public.institutions WHERE id = v_inst) = v_name_mod;
    v_rep := v_rep || format(E'%s  S2 changement de casse : écrit, 0 demande, sans réauth\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  END IF;

  -- ── S3 : changement sensible, réauth périmée / session révoquée → YR001, rien d'écrit
  v_state := 'aucune erreur';
  BEGIN
    PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_old, jsonb_build_object('name', v_name_test), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN SQLSTATE 'YR001' THEN v_state := 'YR001';
  END;
  v_ok := v_state = 'YR001' AND (SELECT name FROM public.institutions WHERE id = v_inst) <> v_name_test;
  v_rep := v_rep || format(E'%s  S3a réauth périmée : YR001 et rien d''écrit\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN
    PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_rev, jsonb_build_object('name', v_name_test), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN SQLSTATE 'YR001' THEN v_state := 'YR001';
  END;
  v_ok := v_state = 'YR001';
  v_rep := v_rep || format(E'%s  S3b session révoquée : YR001\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN
    PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_exp, jsonb_build_object('name', v_name_test), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN SQLSTATE 'YR001' THEN v_state := 'YR001';
  END;
  v_ok := v_state = 'YR001';
  v_rep := v_rep || format(E'%s  S3c session expirée (reauth récente) : YR001\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S4 : changement sensible avec réauth fraîche → 1 demande, statut intact
  SELECT count(*) INTO v_n_before FROM public.institution_change_requests WHERE institution_id = v_inst;
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, jsonb_build_object('name', v_name_test), NULL, '203.0.113.1', 'scenario-test', v_win);
  SELECT count(*) INTO v_n_after FROM public.institution_change_requests WHERE institution_id = v_inst;
  SELECT id INTO v_req FROM public.institution_change_requests WHERE institution_id = v_inst AND champ = 'name' AND statut = 'a_examiner' ORDER BY created_at DESC LIMIT 1;
  v_ok := jsonb_array_length(v_res->'demandes') = 1 AND v_res->'demandes'->0->>'champ' = 'name'
          AND v_n_after = v_n_before + 1
          AND (SELECT name FROM public.institutions WHERE id = v_inst) = v_name_test
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req
                      AND r.membre_id = v_mem AND r.statut = 'a_examiner'
                      AND r.nouvelle_valeur = to_jsonb(v_name_test) AND r.numero LIKE 'YL-CHG-%');
  v_rep := v_rep || format(E'%s  S4 nom modifié avec réauth : écrit + 1 demande attribuée au membre\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S5 : rejeu identique → 0 nouvelle demande ───────────────────────────
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, jsonb_build_object('name', v_name_test), NULL, NULL, NULL, v_win);
  SELECT count(*) INTO v_n_after FROM public.institution_change_requests WHERE institution_id = v_inst;
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND v_n_after = v_n_before + 1;
  v_rep := v_rep || format(E'%s  S5 rejeu identique : aucune demande en plus\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S6 : A→B, B→A, A→B avant examen → la 3e est absorbée, pas d'erreur ──
  PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, jsonb_build_object('name', v_name_mod), NULL, NULL, NULL, v_win);
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, jsonb_build_object('name', v_name_test), NULL, NULL, NULL, v_win);
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND (v_res->'absorbees') ? 'name';
  v_rep := v_rep || format(E'%s  S6 aller-retour avant examen : demande identique absorbée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S7 : coordonnées — bruit < 1e-6 ignoré, vrai déplacement tracé, bornes
  IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_old,
             jsonb_build_object('latitude', v_lat + 0.0000001, 'longitude', v_lng), NULL, NULL, NULL, v_win);
    v_ok := jsonb_array_length(v_res->'demandes') = 0;
    v_rep := v_rep || format(E'%s  S7a delta 1e-7 : 0 demande, sans réauth\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  ELSE
    v_rep := v_rep || E'SKIP  S7a (institution sans coordonnées)\n';
  END IF;
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok,
           jsonb_build_object('latitude', coalesce(v_lat, 9.5) + 0.01, 'longitude', coalesce(v_lng, -13.7)), NULL, NULL, NULL, v_win);
  v_ok := jsonb_array_length(v_res->'demandes') = 1 AND v_res->'demandes'->0->>'champ' = 'coordonnees';
  v_rep := v_rep || format(E'%s  S7b déplacement réel : 1 demande coordonnees\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN
    PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, jsonb_build_object('latitude', 200), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM;
  END;
  v_ok := v_state LIKE '%hors bornes%';
  v_rep := v_rep || format(E'%s  S7c latitude hors bornes refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S8 : champs hors périmètre ignorés, statut de l'établissement intact
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok,
           jsonb_build_object('statut', 'suspendue', 'badge_verifie', true, 'niveau_confiance', 'x', 'statut_juridique', 'x', 'plan', 'pro'),
           NULL, NULL, NULL, v_win);
  v_ok := jsonb_array_length(v_res->'demandes') = 0
          AND EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst
                      AND i.statut::text IS NOT DISTINCT FROM v_statut0
                      AND i.badge_verifie::text IS NOT DISTINCT FROM v_badge0
                      AND i.niveau_confiance::text IS NOT DISTINCT FROM v_niveau0
                      AND i.statut_juridique::text IS NOT DISTINCT FROM v_sj0
                      AND i.plan::text IS NOT DISTINCT FROM v_plan0);
  v_rep := v_rep || format(E'%s  S8 champs hors périmètre ignorés, statut/badge/confiance/statut juridique/plan inchangés\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_ok := EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst
                  AND i.statut::text IS NOT DISTINCT FROM v_statut0 AND i.badge_verifie::text IS NOT DISTINCT FROM v_badge0);
  v_rep := v_rep || format(E'%s  S8b après toutes les demandes ci-dessus, statut et badge toujours identiques à l''origine\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S9 : atomicité — échec APRÈS l'UPDATE du nom → rien ne reste ────────
  SELECT name INTO v_name_mod FROM public.institutions WHERE id = v_inst;
  SELECT count(*) INTO v_n_before FROM public.institution_change_requests WHERE institution_id = v_inst;
  SELECT count(*) INTO v_act_before FROM public.institution_activites WHERE institution_id = v_inst;
  v_state := 'aucune erreur';
  BEGIN
    PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok,
            jsonb_build_object('name', v_name_mod || ' [ATOMIC]', 'activite_principale_id', gen_random_uuid()::text), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN OTHERS THEN v_state := 'erreur: ' || SQLSTATE;
  END;
  SELECT count(*) INTO v_n_after FROM public.institution_change_requests WHERE institution_id = v_inst;
  SELECT count(*) INTO v_act_after FROM public.institution_activites WHERE institution_id = v_inst;
  v_ok := v_state LIKE 'erreur:%'
          AND (SELECT name FROM public.institutions WHERE id = v_inst) = v_name_mod
          AND v_n_after = v_n_before AND v_act_after = v_act_before;
  v_rep := v_rep || format(E'%s  S9 échec en cours de transaction : nom, activités et demandes inchangés (%s)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END, v_state);

  -- ── S10 : doublon ouvert inséré directement → refusé par l'index ────────
  v_state := 'aucune erreur';
  BEGIN
    INSERT INTO public.institution_change_requests (institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom)
    SELECT institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom
    FROM public.institution_change_requests WHERE id = v_req;
  EXCEPTION WHEN unique_violation THEN v_state := 'unique_violation';
  END;
  v_ok := v_state = 'unique_violation';
  v_rep := v_rep || format(E'%s  S10 doublon ouvert direct refusé (index unique partiel)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S11 : immuabilité (trigger) et examen unique ────────────────────────
  v_state := 'aucune erreur';
  BEGIN UPDATE public.institution_change_requests SET nouvelle_valeur = '"falsifie"' WHERE id = v_req;
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%seul l''examen%';
  v_rep := v_rep || format(E'%s  S11a modification du contenu refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN DELETE FROM public.institution_change_requests WHERE id = v_req;
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%immuable%';
  v_rep := v_rep || format(E'%s  S11b suppression refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN UPDATE public.institution_change_requests
        SET statut = 'examinee', decision = 'a_corriger', decide_par_nom = 'Test', decide_le = now() WHERE id = v_req;
  EXCEPTION WHEN check_violation THEN v_state := 'check_violation'; END;
  v_ok := v_state = 'check_violation';
  v_rep := v_rep || format(E'%s  S11c a_corriger sans commentaire refusé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN UPDATE public.institution_change_requests
        SET statut = 'examinee', decision = 'conforme', decide_par_nom = 'Test', decide_le = now() WHERE id = v_req;
        v_state := 'examen accepté';
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state = 'examen accepté'
          AND EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = v_inst AND i.statut::text IS NOT DISTINCT FROM v_statut0);
  v_rep := v_rep || format(E'%s  S11d examen valide accepté, statut de l''établissement inchangé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN UPDATE public.institution_change_requests SET decision = 'a_corriger', commentaire_admin = 'x' WHERE id = v_req;
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%déjà examinée%';
  v_rep := v_rep || format(E'%s  S11e second examen refusé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S12 : membre d'une autre institution refusé ─────────────────────────
  IF v_other_mem IS NULL THEN
    v_rep := v_rep || E'SKIP  S12 (une seule institution en base)\n';
  ELSE
    v_state := 'aucune erreur';
    BEGIN
      PERFORM public.appliquer_modifications_sensibles(v_inst, v_other_mem, v_sess_ok, jsonb_build_object('name', v_name0 || ' [X]'), NULL, NULL, NULL, v_win);
    EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
    v_ok := v_state LIKE '%membre inconnu%';
    v_rep := v_rep || format(E'%s  S12 membre d''une autre institution refusé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  END IF;

  -- ── S13 : entrées invalides ─────────────────────────────────────────────
  v_state := 'aucune erreur';
  BEGIN PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, '[]'::jsonb, NULL, NULL, NULL, v_win);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%objet JSON%';
  v_rep := v_rep || format(E'%s  S13a p_champs non objet refusé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, jsonb_build_object('name', '   '), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%nom vide%';
  v_rep := v_rep || format(E'%s  S13b nom vide refusé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, '{}'::jsonb, NULL, NULL, NULL, 0);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%fenêtre%';
  v_rep := v_rep || format(E'%s  S13c fenêtre de réauth invalide refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- ── S14 : accès interdits aux rôles anon / authenticated ────────────────
  v_state := 'accès accordé';
  BEGIN SET LOCAL ROLE anon; PERFORM 1 FROM public.institution_change_requests LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refusé'; END;
  RESET ROLE;
  v_ok := v_state = 'refusé';
  v_rep := v_rep || format(E'%s  S14a anon : lecture de la table refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'accès accordé';
  BEGIN SET LOCAL ROLE authenticated; PERFORM 1 FROM public.institution_change_requests LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refusé'; END;
  RESET ROLE;
  v_ok := v_state = 'refusé';
  v_rep := v_rep || format(E'%s  S14b authenticated : lecture de la table refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'accès accordé';
  BEGIN SET LOCAL ROLE authenticated;
        PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, '{}'::jsonb, NULL, NULL, NULL, v_win);
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refusé'; END;
  RESET ROLE;
  v_ok := v_state = 'refusé';
  v_rep := v_rep || format(E'%s  S14c authenticated : exécution de la fonction refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'accès accordé';
  BEGIN SET LOCAL ROLE anon;
        PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_sess_ok, '{}'::jsonb, NULL, NULL, NULL, v_win);
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refusé'; END;
  RESET ROLE;
  v_ok := v_state = 'refusé';
  v_rep := v_rep || format(E'%s  S14d anon : exécution de la fonction refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  RAISE EXCEPTION E'%', v_rep;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- S15 — APPELS CONCURRENTS (manuel, deux onglets SQL Editor, COMMIT réels).
-- À faire seulement sur une institution de test dédiée : cette procédure
-- COMMITE des lignes. Remplacer <INST>, <MEMBRE>, <SESSION_REAUTH_FRAICHE>.
--   Onglet A :  BEGIN;
--               SELECT public.appliquer_modifications_sensibles('<INST>','<MEMBRE>','<SESSION>',
--                 '{"name":"Nom concurrent test"}'::jsonb, NULL, NULL, NULL, 600);
--               -- NE PAS COMMITER tout de suite
--   Onglet B :  SELECT public.appliquer_modifications_sensibles('<INST>','<MEMBRE>','<SESSION>',
--                 '{"name":"Nom concurrent test"}'::jsonb, NULL, NULL, NULL, 600);
--               -- doit rester BLOQUÉ (verrou consultatif)
--   Onglet A :  COMMIT;
--   Onglet B :  doit se débloquer et répondre {"demandes": [], "absorbees": []}.
--   Vérifier : SELECT count(*) FROM institution_change_requests
--               WHERE institution_id='<INST>' AND nouvelle_valeur='"Nom concurrent test"';  -- = 1
-- Nettoyage (la table est immuable, l'échappatoire documentée est requise) :
--   BEGIN;
--   SET LOCAL app.autoriser_correction_changement = 'on';
--   DELETE FROM institution_change_requests WHERE institution_id='<INST>' AND nouvelle_valeur='"Nom concurrent test"';
--   UPDATE institutions SET name = '<NOM ORIGINAL>' WHERE id='<INST>';
--   COMMIT;
-- ═════════════════════════════════════════════════════════════════════════
