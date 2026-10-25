-- SCENARIOS - restriction d'acces citoyen liee a une demande (Lot 3). A lancer
-- APRES les migrations 20261020000003 et 20261020000004. NON EXECUTE. Un seul bloc
-- DO termine par une RAISE EXCEPTION : l'erreur finale ANNULE tout et son message
-- est le rapport OK / FAIL. Aucun accent, aucun "INTO", aucun commentaire dans le
-- bloc (l'editeur SQL de Supabase tronque ou deforme ces collages). Prend le premier
-- etablissement 'validee' avec un membre et sans proposition ouverte.

DO $$
DECLARE
  v_inst uuid; v_mem uuid; v_admin uuid; v_s_ok uuid; v_req uuid; v_req2 uuid;
  v_i0 public.institutions; v_i1 public.institutions;
  v_res jsonb; v_state text; v_ok boolean; v_n int; v_ref text; v_win int := 600;
  v_rep text := E'RAPPORT RESTRICTION (cette erreur finale annule tout)\n';
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
  INSERT INTO public.institution_sessions (id, institution_id, membre_id, expires_at, reauth_at) VALUES (v_s_ok, v_inst, v_mem, now() + interval '1 hour', now());
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_i0.name || ' RESTR'), NULL, NULL, NULL, v_win);
  v_req := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  IF v_req IS NULL THEN RAISE EXCEPTION 'Proposition de test non creee'; END IF;

  v_state := 'aucune erreur';
  BEGIN PERFORM public.restreindre_acces_changement_profil(v_req, v_admin, '   ', NULL);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%motif est obligatoire%';
  v_rep := v_rep || format(E'%s  R1a restriction sans motif refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.restreindre_acces_changement_profil(v_req, v_admin, 'ok', 0);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%duree invalide%';
  v_rep := v_rep || format(E'%s  R1b duree 0 refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.restreindre_acces_changement_profil(v_req, v_admin, 'ok', 366);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%duree invalide%';
  v_rep := v_rep || format(E'%s  R1c duree de 366 jours refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'aucune erreur';
  BEGIN PERFORM public.restreindre_acces_changement_profil(v_req, gen_random_uuid(), 'ok', NULL);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%administrateur inconnu%';
  v_rep := v_rep || format(E'%s  R1d administrateur inconnu refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_i1.statut::text = 'validee';
  v_rep := v_rep || format(E'%s  R1e aucun de ces refus n a modifie le statut de l etablissement\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.restreindre_acces_changement_profil(v_req, v_admin, 'Documents non conformes', 30);
  v_ref := v_res->>'reference';
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_i1.statut::text = 'suspendue' AND v_ref LIKE 'SUS-%' AND v_i1.name = v_i0.name AND v_i1.badge_verifie IS NOT DISTINCT FROM v_i0.badge_verifie
          AND v_i1.niveau_confiance IS NOT DISTINCT FROM v_i0.niveau_confiance
          AND EXISTS (SELECT 1 FROM public.institution_suspensions s WHERE s.institution_id = v_inst AND s.reference = v_ref AND s.statut = 'active' AND s.jusqu_au IS NOT NULL AND s.duree_jours = 30 AND s.admin_id = v_admin AND s.motif LIKE 'Documents non conformes (demande YL-CHG-%')
          AND EXISTS (SELECT 1 FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'acces_restreint' AND e.suspension_reference = v_ref AND e.acteur_id = v_admin)
          AND EXISTS (SELECT 1 FROM public.admin_logs l WHERE l.cible_id = v_inst AND l.action = 'RESTREINDRE_ACCES_CHANGEMENT_PROFIL' AND l.admin_id = v_admin)
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req AND r.statut = 'a_examiner');
  v_rep := v_rep || format(E'%s  R2 restriction : etablissement suspendu, suspension active avec reference, evenement lie, trace admin, demande toujours ouverte, nom/badge/confiance intacts\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.restreindre_acces_changement_profil(v_req, v_admin, 'Encore', NULL);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_n := (SELECT count(*) FROM public.institution_suspensions s WHERE s.institution_id = v_inst AND s.statut = 'active');
  v_ok := v_state LIKE '%deja restreint ou non public%' AND v_n = 1;
  v_rep := v_rep || format(E'%s  R3 restreindre un etablissement deja suspendu refuse, une seule suspension active\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', v_i0.name || ' CONTOURNEMENT'), NULL, NULL, NULL, v_win);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_n := (SELECT count(*) FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_ok := jsonb_array_length(v_res->'demandes') = 1 AND jsonb_array_length(v_res->'appliquees') = 0 AND v_i1.name = v_i0.name AND v_n = 1;
  v_rep := v_rep || format(E'%s  R4 etablissement SUSPENDU : un nouveau nom reste une proposition (pas d application directe, pas de contournement de l examen)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_req2 := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  v_res := public.demander_complement_changement_profil(v_req2, v_admin, 'Precisions necessaires', '{}');
  v_res := public.repondre_complement_changement_profil(v_req2, v_inst, v_mem, 'Precisions fournies');
  v_ok := EXISTS (SELECT 1 FROM public.institution_change_request_events e WHERE e.request_id = v_req2 AND e.type = 'complement_fourni');
  v_rep := v_rep || format(E'%s  R5 complement demande puis repondu pendant la restriction : possible\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.decider_changement_profil(v_req2, 'conforme', NULL, v_admin, 'a_examiner', 'slug-restr-test');
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_res->>'publiee' = 'true' AND v_i1.name = v_i0.name || ' CONTOURNEMENT' AND v_i1.statut::text = 'suspendue';
  v_rep := v_rep || format(E'%s  R6 approbation pendant la restriction : valeur publiee, mais l etablissement RESTE suspendu (la decision ne leve pas la restriction)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'aucune erreur';
  BEGIN PERFORM public.restreindre_acces_changement_profil(v_req2, v_admin, 'Trop tard', NULL);
  EXCEPTION WHEN OTHERS THEN v_state := SQLERRM; END;
  v_ok := v_state LIKE '%n''est plus a l''etat a_examiner%';
  v_rep := v_rep || format(E'%s  R7 restreindre apres decision refuse\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  UPDATE public.institutions SET statut = 'en_attente' WHERE id = v_inst;
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s_ok, jsonb_build_object('name', 'DirectNonPublic'), 'slug-direct-np', NULL, NULL, v_win);
  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := jsonb_array_length(v_res->'demandes') = 0 AND (v_res->'appliquees') ? 'name' AND v_i1.name = 'DirectNonPublic';
  v_rep := v_rep || format(E'%s  R8 etablissement jamais public (en_attente) : application directe toujours possible\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.restreindre_acces_changement_profil(v_req, v_admin, 'x', NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  R9a authenticated : execution de restreindre refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE anon; PERFORM public.restreindre_acces_changement_profil(v_req, v_admin, 'x', NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  R9b anon : execution de restreindre refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  RAISE EXCEPTION E'%', v_rep;
END;
$$;
