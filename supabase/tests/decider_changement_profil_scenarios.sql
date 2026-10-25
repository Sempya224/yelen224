-- OBSOLETE depuis la migration 20261020000001 (publication differee) : ce script teste
-- l'ancien comportement (changement sensible publie tout de suite) et echouerait.
-- Utiliser supabase/tests/publication_differee_scenarios.sql.

-- SCÉNARIOS DE VÉRIFICATION — decider_changement_profil. NON EXÉCUTÉ.
-- À lancer dans le SQL Editor Supabase APRÈS la migration
-- 20261019000003_decider_changement_profil.sql. Un unique bloc DO qui se termine
-- par une RAISE EXCEPTION — l'exception ANNULE TOUT et son message est le
-- rapport OK / FAIL. Aucune demande de test, aucune ligne admin_logs ne subsiste.
-- Le rapport ne contient ni nom ni identifiant.
--
-- ⚠️ Piège de l'éditeur Supabase (20/10/2026) : il interprète "SELECT ... INTO
-- variable" comme une création de table, y ajoute des "ALTER TABLE <variable>
-- ENABLE ROW LEVEL SECURITY" et tronque le script (erreur 42601 "unterminated
-- dollar-quoted string"). Ce script n'utilise donc AUCUN "INTO" : seulement des
-- affectations `:=` avec sous-requêtes, et des identifiants générés d'avance.

DO $$
DECLARE
  v_inst uuid; v_mem uuid; v_admin uuid; v_req uuid; v_req2 uuid; v_req3 uuid;
  v_i0 public.institutions; v_i1 public.institutions;
  v_res jsonb; v_state text; v_ok boolean; v_n_logs_avant int; v_n_logs_apres int;
  v_rep text := E'RAPPORT DES SCENARIOS DECISION (cette erreur finale annule tout)\n';
BEGIN
  v_mem := (SELECT m.id FROM public.institution_membres m JOIN public.institutions i ON i.id = m.institution_id LIMIT 1);
  IF v_mem IS NULL THEN RAISE EXCEPTION 'Aucune institution avec membre : scénarios impossibles'; END IF;
  v_inst := (SELECT m.institution_id FROM public.institution_membres m WHERE m.id = v_mem);
  v_admin := (SELECT a.id FROM public.admin_users a WHERE a.is_active LIMIT 1);
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Aucun admin actif : scénarios impossibles'; END IF;

  v_i0 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);

  v_req := gen_random_uuid();
  v_req2 := gen_random_uuid();
  v_req3 := gen_random_uuid();
  INSERT INTO public.institution_change_requests (id, institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom)
  VALUES (v_req, v_inst, 'ville', '"Avant"', '"Apres"', v_mem, 'Membre Test');
  INSERT INTO public.institution_change_requests (id, institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom)
  VALUES (v_req2, v_inst, 'adresse', '"Avant"', '"Apres"', v_mem, 'Membre Test');

  -- D1
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req, 'valide', NULL, v_admin, 'a_examiner');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%décision invalide%';
  v_rep := v_rep || format(E'%s  D1 décision hors conforme/a_corriger refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D2
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req, 'a_corriger', '   ', v_admin, 'a_examiner');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%commentaire est obligatoire%'
          AND (SELECT statut FROM public.institution_change_requests WHERE id = v_req) = 'a_examiner';
  v_rep := v_rep || format(E'%s  D2 a_corriger sans commentaire refusé, demande intacte\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D3
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req, 'conforme', NULL, gen_random_uuid(), 'a_examiner');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%examinateur inconnu%';
  v_rep := v_rep || format(E'%s  D3 examinateur inconnu ou inactif refusé\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D4
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req, 'conforme', NULL, v_admin, 'examinee');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%déjà été traitée entretemps%';
  v_rep := v_rep || format(E'%s  D4 statut vu périmé refusé (verrouillage optimiste)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D5
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(gen_random_uuid(), 'conforme', NULL, v_admin, 'a_examiner');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%demande inconnue%';
  v_rep := v_rep || format(E'%s  D5 demande inconnue refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D6
  v_n_logs_avant := (SELECT count(*) FROM public.admin_logs WHERE action = 'EXAMEN_CHANGEMENT_PROFIL' AND cible_id = v_req);
  v_res := public.decider_changement_profil(v_req, 'conforme', 'RAS', v_admin, 'a_examiner');
  v_n_logs_apres := (SELECT count(*) FROM public.admin_logs WHERE action = 'EXAMEN_CHANGEMENT_PROFIL' AND cible_id = v_req AND admin_id = v_admin);
  v_ok := v_res->>'decision' = 'conforme'
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req
                      AND r.statut = 'examinee' AND r.decision = 'conforme' AND r.decide_par_admin_id = v_admin
                      AND r.decide_par_nom IS NOT NULL AND r.decide_le IS NOT NULL AND r.commentaire_admin = 'RAS')
          AND v_n_logs_apres = v_n_logs_avant + 1;
  v_rep := v_rep || format(E'%s  D6 conforme : demande examinée avec acteur+date, 1 ligne admin_logs\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D7
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_i1.statut IS NOT DISTINCT FROM v_i0.statut
          AND v_i1.badge_verifie IS NOT DISTINCT FROM v_i0.badge_verifie
          AND v_i1.niveau_confiance IS NOT DISTINCT FROM v_i0.niveau_confiance
          AND v_i1.name IS NOT DISTINCT FROM v_i0.name
          AND v_i1.mis_a_jour_le IS NOT DISTINCT FROM v_i0.mis_a_jour_le;
  v_rep := v_rep || format(E'%s  D7 statut, badge, confiance, nom ET date de mise à jour de l''établissement inchangés\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D8
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req, 'a_corriger', 'trop tard', v_admin, 'examinee');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%n''est plus à l''état a_examiner%';
  v_rep := v_rep || format(E'%s  D8 seconde décision refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D9
  v_res := public.decider_changement_profil(v_req2, 'a_corriger', 'Adresse incomplète', v_admin, 'a_examiner');
  v_ok := v_res->>'decision' = 'a_corriger'
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req2 AND r.decision = 'a_corriger' AND r.commentaire_admin = 'Adresse incomplète');
  v_rep := v_rep || format(E'%s  D9 a_corriger avec commentaire accepté\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D10 : échec avant décision → ni transition ni ligne admin_logs
  INSERT INTO public.institution_change_requests (id, institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom)
  VALUES (v_req3, v_inst, 'name', '"A"', '"B"', v_mem, 'Membre Test');
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req3, 'conforme', NULL, gen_random_uuid(), 'a_examiner');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%examinateur inconnu%'
          AND (SELECT statut FROM public.institution_change_requests WHERE id = v_req3) = 'a_examiner'
          AND NOT EXISTS (SELECT 1 FROM public.admin_logs WHERE cible_id = v_req3);
  v_rep := v_rep || format(E'%s  D10 échec : ni transition ni ligne admin_logs\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  -- D11
  v_state := 'accès accordé';
  BEGIN SET LOCAL ROLE authenticated;
        PERFORM public.decider_changement_profil(v_req3, 'conforme', NULL, v_admin, 'a_examiner');
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refusé'; END;
  RESET ROLE;
  v_ok := v_state = 'refusé';
  v_rep := v_rep || format(E'%s  D11a authenticated : exécution refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'accès accordé';
  BEGIN SET LOCAL ROLE anon;
        PERFORM public.decider_changement_profil(v_req3, 'conforme', NULL, v_admin, 'a_examiner');
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refusé'; END;
  RESET ROLE;
  v_ok := v_state = 'refusé';
  v_rep := v_rep || format(E'%s  D11b anon : exécution refusée\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  RAISE EXCEPTION E'%', v_rep;
END;
$$;
