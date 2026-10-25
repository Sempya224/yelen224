-- SCENARIOS - complements repetables (Lot 2). A lancer APRES la migration
-- 20261020000002. NON EXECUTE. Un seul bloc DO termine par une RAISE EXCEPTION :
-- l'erreur finale ANNULE tout et son message est le rapport OK / FAIL. Aucun
-- accent, aucun "INTO", aucun commentaire dans le bloc (l'editeur SQL de Supabase
-- tronque ou deforme ces collages). Prend le premier etablissement 'validee'
-- avec un membre et sans proposition ouverte, et un membre d'un AUTRE etablissement.

DO $$
DECLARE
  v_inst uuid; v_mem uuid; v_mem_autre uuid; v_admin uuid; v_s_ok uuid; v_req uuid;
  v_i0 public.institutions; v_i1 public.institutions;
  v_res jsonb; v_state text; v_ok boolean; v_n int; v_win int := 600;
  v_rep text := E'RAPPORT COMPLEMENTS (cette erreur finale annule tout)\n';
BEGIN
  v_mem := (SELECT m.id FROM public.institution_membres m JOIN public.institutions i ON i.id = m.institution_id
            WHERE i.statut::text = 'validee'
              AND NOT EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.institution_id = i.id AND r.statut = 'a_examiner')
            LIMIT 1);
  IF v_mem IS NULL THEN RAISE EXCEPTION 'Aucun etablissement valide avec membre et sans proposition ouverte'; END IF;
  v_inst := (SELECT m.institution_id FROM public.institution_membres m WHERE m.id = v_mem);
  v_mem_autre := (SELECT m.id FROM public.institution_membres m WHERE m.institution_id <> v_inst LIMIT 1);
  v_admin := (SELECT a.id FROM public.admin_users a WHERE a.is_active LIMIT 1);
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Aucun admin actif'; END IF;
  v_i0 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_s_ok := gen_random_uuid();
  INSERT INTO public.institution_sessions (id, institution_id, membre_id, expires_at, reauth_at) VALUES (v_s_ok, v_inst, v_mem, now() + interval '1 hour', now());
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_i0.name || ' COMPL'), NULL, NULL, NULL, v_win);
  v_req := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  IF v_req IS NULL THEN RAISE EXCEPTION 'Proposition de test non creee'; END IF;

  v_res := public.demander_complement_changement_profil(v_req, v_admin, 'Le RCCM porte encore l ancien nom', ARRAY['rccm']);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'complement_demande');
  v_ok := v_n = 1 AND v_res->>'champ' = 'name'
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req AND r.statut = 'a_examiner')
          AND v_i1.name = v_i0.name AND v_i1.statut IS NOT DISTINCT FROM v_i0.statut AND v_i1.badge_verifie IS NOT DISTINCT FROM v_i0.badge_verifie
          AND EXISTS (SELECT 1 FROM public.admin_logs l WHERE l.cible_id = v_req AND l.action = 'COMPLEMENT_CHANGEMENT_PROFIL' AND l.admin_id = v_admin);
  v_rep := v_rep || format(E'%s  C1 complement demande : evenement cree, demande toujours ouverte, valeur publiee et statut intacts, trace admin\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.demander_complement_changement_profil(v_req, v_admin, '   ', '{}');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%motif est obligatoire%';
  v_rep := v_rep || format(E'%s  C2 demande de complement sans motif refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.demander_complement_changement_profil(v_req, v_admin, repeat('x', 1001), '{}');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%motif trop long%';
  v_rep := v_rep || format(E'%s  C3a motif de plus de 1000 caracteres refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.demander_complement_changement_profil(v_req, v_admin, 'ok', ARRAY['a','b','c','d','e','f','g']);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%trop de types%';
  v_rep := v_rep || format(E'%s  C3b plus de 6 types de documents refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.demander_complement_changement_profil(v_req, gen_random_uuid(), 'Complement', '{}');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%administrateur inconnu%';
  v_rep := v_rep || format(E'%s  C4 administrateur inconnu refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  IF v_mem_autre IS NULL THEN
    v_rep := v_rep || E'SKIP  C5 (une seule institution en base)\n';
  ELSE
    v_state := 'aucune erreur';
    BEGIN PERFORM public.repondre_complement_changement_profil(v_req, (SELECT m.institution_id FROM public.institution_membres m WHERE m.id = v_mem_autre), v_mem_autre, 'Intrusion');
    EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
    v_ok := v_state LIKE '%demande inconnue%';
    v_rep := v_rep || format(E'%s  C5 un autre etablissement ne peut pas repondre a cette demande\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  END IF;

  v_res := public.repondre_complement_changement_profil(v_req, v_inst, v_mem, 'Nouveau RCCM depose');
  v_ok := EXISTS (SELECT 1 FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'complement_fourni' AND e.message = 'Nouveau RCCM depose' AND e.acteur_id = v_mem)
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req AND r.statut = 'a_examiner');
  v_rep := v_rep || format(E'%s  C6 reponse de l etablissement : evenement cree, demande toujours ouverte\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.repondre_complement_changement_profil(v_req, v_inst, v_mem, 'Deuxieme reponse');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%aucun complement n%attendu%';
  v_rep := v_rep || format(E'%s  C7 repondre sans complement attendu refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.demander_complement_changement_profil(v_req, v_admin, 'Il manque la piece d identite', ARRAY['piece_identite']);
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'complement_demande');
  v_ok := v_n = 2 AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req AND r.statut = 'a_examiner');
  v_rep := v_rep || format(E'%s  C8 complement redemande apres une reponse : repetable, demande toujours ouverte\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN UPDATE public.institution_change_request_events SET message = 'falsifie' WHERE request_id = v_req;
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%immuable%';
  v_rep := v_rep || format(E'%s  C9a modification d un evenement refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN DELETE FROM public.institution_change_request_events WHERE request_id = v_req;
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%immuable%';
  v_rep := v_rep || format(E'%s  C9b suppression d un evenement refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.decider_changement_profil(v_req, 'conforme', NULL, v_admin, 'a_examiner', NULL);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_res->>'publiee' = 'true' AND v_i1.name = v_i0.name || ' COMPL' AND v_i1.statut IS NOT DISTINCT FROM v_i0.statut AND v_i1.badge_verifie IS NOT DISTINCT FROM v_i0.badge_verifie;
  v_rep := v_rep || format(E'%s  C10 approbation apres plusieurs complements : valeur publiee, statut et badge intacts\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.demander_complement_changement_profil(v_req, v_admin, 'Trop tard', '{}');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%n''est plus a l''etat a_examiner%';
  v_rep := v_rep || format(E'%s  C11a complement apres decision refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.repondre_complement_changement_profil(v_req, v_inst, v_mem, 'Trop tard');
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%n''est plus a l''etat a_examiner%';
  v_rep := v_rep || format(E'%s  C11b reponse apres decision refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.demander_complement_changement_profil(v_req, v_admin, 'x', '{}');
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  C12a authenticated : execution de demander refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE anon; PERFORM public.repondre_complement_changement_profil(v_req, v_inst, v_mem, 'x');
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  C12b anon : execution de repondre refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE service_role;
        INSERT INTO public.institution_change_request_events (request_id, institution_id, type, acteur_type, acteur_nom, message) VALUES (v_req, v_inst, 'complement_demande', 'admin', 'Intrus', 'x');
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  C12c service_role ne peut pas ecrire directement dans le journal (fonctions seulement)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  RAISE EXCEPTION E'%', v_rep;
END;
$$;
