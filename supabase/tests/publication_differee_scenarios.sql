-- SCENARIOS - publication differee des changements sensibles de profil.
-- A lancer APRES la migration 20261020000001. NON EXECUTE.
-- Un seul bloc DO termine par une RAISE EXCEPTION : l'erreur finale ANNULE tout
-- et son message est le rapport OK / FAIL. Aucun accent, aucun "INTO", aucun
-- commentaire dans le bloc : l'editeur SQL de Supabase tronque ou deforme ces
-- collages. Prend le premier etablissement 'validee' qui a un membre et AUCUNE
-- proposition ouverte. Non couvert : changement d'activite (identifiants reels
-- requis) et appels concurrents (voir institution_change_requests_scenarios.sql).

DO $$
DECLARE
  v_inst uuid; v_mem uuid; v_admin uuid; v_s_ok uuid; v_s_old uuid;
  v_i0 public.institutions; v_i1 public.institutions;
  v_res jsonb; v_state text; v_ok boolean; v_n int; v_n2 int;
  v_req uuid; v_req2 uuid; v_req_retiree uuid;
  v_nom1 text; v_nom2 text; v_var text; v_lat numeric; v_lng numeric; v_win int := 600;
  v_rep text := E'RAPPORT PUBLICATION DIFFEREE (cette erreur finale annule tout)\n';
BEGIN
  v_mem := (SELECT m.id FROM public.institution_membres m JOIN public.institutions i ON i.id = m.institution_id
            WHERE i.statut::text = 'validee'
              AND NOT EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.institution_id = i.id AND r.statut = 'a_examiner')
            LIMIT 1);
  IF v_mem IS NULL THEN RAISE EXCEPTION 'Aucun etablissement valide avec membre et sans proposition ouverte'; END IF;
  v_inst := (SELECT m.institution_id FROM public.institution_membres m WHERE m.id = v_mem);
  v_admin := (SELECT a.id FROM public.admin_users a WHERE a.is_active LIMIT 1);
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Aucun admin actif'; END IF;
  v_i0 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_s_ok := gen_random_uuid();
  v_s_old := gen_random_uuid();
  INSERT INTO public.institution_sessions (id, institution_id, membre_id, expires_at, reauth_at) VALUES (v_s_ok, v_inst, v_mem, now() + interval '1 hour', now());
  INSERT INTO public.institution_sessions (id, institution_id, membre_id, expires_at, reauth_at) VALUES (v_s_old, v_inst, v_mem, now() + interval '1 hour', now() - interval '1 hour');
  v_nom1 := v_i0.name || ' TEST1';
  v_nom2 := v_i0.name || ' TEST2';
  v_lat := coalesce(v_i0.latitude::numeric, 9.5);
  v_lng := coalesce(v_i0.longitude::numeric, -13.7);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_nom1), 'slug-test-1', NULL, NULL, v_win);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := jsonb_array_length(v_res->'demandes') = 1 AND v_i1.name = v_i0.name AND v_i1.slug = v_i0.slug
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner'
                      AND r.ancienne_valeur = to_jsonb(v_i0.name) AND r.nouvelle_valeur = to_jsonb(v_nom1));
  v_rep := v_rep || format(E'%s  P1 etablissement valide : le nom reste PUBLIE, une proposition est creee (ancienne = valeur publiee)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_old, jsonb_build_object('name', v_nom1), NULL, NULL, NULL, v_win);
  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND jsonb_array_length(v_res->'retirees') = 0 AND v_n = 1;
  v_rep := v_rep || format(E'%s  P2 renvoyer la proposition en attente : ni nouvelle demande ni reauthentification\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_nom2), NULL, NULL, NULL, v_win);
  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_n2 := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'retiree');
  v_req_retiree := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'retiree' LIMIT 1);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := jsonb_array_length(v_res->'demandes') = 1 AND (v_res->'retirees') ? 'name' AND v_n = 1 AND v_n2 = 1 AND v_i1.name = v_i0.name
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner'
                      AND r.ancienne_valeur = to_jsonb(v_i0.name) AND r.nouvelle_valeur = to_jsonb(v_nom2));
  v_rep := v_rep || format(E'%s  P3 nouvelle proposition : l ancienne est retiree, une seule reste ouverte, valeur publiee intacte\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_old, jsonb_build_object('name', v_i0.name), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN SQLSTATE 'YR001' THEN v_state := 'YR001'; END;
  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_ok := v_state = 'YR001' AND v_n = 1;
  v_rep := v_rep || format(E'%s  P4a retour a la valeur publiee sans reauthentification recente : refuse, proposition conservee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_i0.name), NULL, NULL, NULL, v_win);
  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND (v_res->'retirees') ? 'name' AND v_n = 0 AND v_i1.name = v_i0.name;
  v_rep := v_rep || format(E'%s  P4b retour a la valeur publiee avec reauthentification : proposition retiree, aucune nouvelle demande\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok,
           jsonb_build_object('ville', 'VilleTest', 'adresse', 'AdresseTest', 'latitude', v_lat + 0.01, 'longitude', v_lng), NULL, NULL, NULL, v_win);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := jsonb_array_length(v_res->'demandes') = 3
          AND v_i1.ville IS NOT DISTINCT FROM v_i0.ville AND v_i1.adresse IS NOT DISTINCT FROM v_i0.adresse
          AND v_i1.latitude IS NOT DISTINCT FROM v_i0.latitude AND v_i1.longitude IS NOT DISTINCT FROM v_i0.longitude;
  v_rep := v_rep || format(E'%s  P5 ville + adresse + coordonnees : 3 propositions, aucune valeur publiee modifiee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN
    INSERT INTO public.institution_change_requests (institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom)
    VALUES (v_inst, 'ville', '"x"', '"y"', v_mem, 'Membre Test');
  EXCEPTION WHEN unique_violation THEN v_state := 'unique_violation'; END;
  v_ok := v_state = 'unique_violation';
  v_rep := v_rep || format(E'%s  P6 une seule proposition ouverte par champ (index unique)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_nom1), NULL, NULL, NULL, v_win);
  v_req := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_res := public.decider_changement_profil(v_req, 'conforme', NULL, v_admin, 'a_examiner', 'slug-test-approuve');
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_res->>'publiee' = 'true' AND v_i1.name = v_nom1 AND v_i1.slug = 'slug-test-approuve'
          AND v_i1.statut IS NOT DISTINCT FROM v_i0.statut AND v_i1.badge_verifie IS NOT DISTINCT FROM v_i0.badge_verifie
          AND v_i1.niveau_confiance IS NOT DISTINCT FROM v_i0.niveau_confiance
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req AND r.statut = 'examinee' AND r.decision = 'conforme')
          AND EXISTS (SELECT 1 FROM public.admin_logs l WHERE l.cible_id = v_req AND l.action = 'EXAMEN_CHANGEMENT_PROFIL' AND l.admin_id = v_admin);
  v_rep := v_rep || format(E'%s  P7 approbation du nom : valeur PUBLIEE et slug mis a jour, statut/badge/confiance intacts, trace admin\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_req2 := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'ville' AND r.statut = 'a_examiner');
  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req2, 'a_corriger', '   ', v_admin, 'a_examiner', NULL);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%commentaire est obligatoire%';
  v_rep := v_rep || format(E'%s  P8a refus sans motif refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_res := public.decider_changement_profil(v_req2, 'a_corriger', 'Justificatif manquant', v_admin, 'a_examiner', NULL);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_res->>'publiee' = 'false' AND v_i1.ville IS NOT DISTINCT FROM v_i0.ville
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req2 AND r.statut = 'examinee' AND r.decision = 'a_corriger');
  v_rep := v_rep || format(E'%s  P8b refus : la valeur publiee reste, la demande est examinee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.decider_changement_profil(v_req_retiree, 'conforme', NULL, v_admin, 'a_examiner', NULL);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%deja ete traitee%';
  v_rep := v_rep || format(E'%s  P9 decider une proposition retiree est refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.statut = 'a_examiner');
  v_state := 'aucune erreur';
  BEGIN PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_old, jsonb_build_object('ville', 'AutreVille'), NULL, NULL, NULL, v_win);
  EXCEPTION WHEN SQLSTATE 'YR001' THEN v_state := 'YR001'; END;
  v_n2 := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.statut = 'a_examiner');
  v_ok := v_state = 'YR001' AND v_n = v_n2;
  v_rep := v_rep || format(E'%s  P10 changement sensible sans reauthentification recente : refuse, aucune demande creee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_var := CASE WHEN v_nom1 = upper(v_nom1) THEN lower(v_nom1) ELSE upper(v_nom1) END;
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_old, jsonb_build_object('name', v_var), NULL, NULL, NULL, v_win);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND v_i1.name = v_var;
  v_rep := v_rep || format(E'%s  P11 simple changement de casse : applique directement, sans demande ni reauthentification\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_n := (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'decider_changement_profil' AND p.pronargs = 5);
  v_n2 := (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'decider_changement_profil' AND p.pronargs = 6);
  v_ok := v_n = 0 AND v_n2 = 1;
  v_rep := v_rep || format(E'%s  P12 ancienne signature a 5 parametres supprimee, nouvelle a 6 presente\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.decider_changement_profil(v_req2, 'conforme', NULL, v_admin, 'a_examiner', NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  P13a authenticated : execution de decider refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE anon; PERFORM public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, '{}'::jsonb, NULL, NULL, NULL, v_win);
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  P13b anon : execution de appliquer refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  UPDATE public.institutions SET statut = 'en_attente' WHERE id = v_inst;
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', 'DirectTest'), 'slug-direct', NULL, NULL, v_win);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND (v_res->'appliquees') ? 'name' AND v_i1.name = 'DirectTest' AND v_i1.slug = 'slug-direct' AND v_n = 0;
  v_rep := v_rep || format(E'%s  P14 etablissement NON valide : application directe (rien de public a proteger), pas de demande\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  RAISE EXCEPTION E'%', v_rep;
END;
$$;
