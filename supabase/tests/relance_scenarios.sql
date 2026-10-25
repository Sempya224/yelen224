-- SCENARIOS - relance automatique des propositions anciennes. A lancer APRES la
-- migration 20261020000005. NON EXECUTE. Un seul bloc DO termine par une
-- RAISE EXCEPTION : l'erreur finale ANNULE tout et son message est le rapport
-- OK / FAIL. Aucun accent, aucun "INTO", aucun commentaire dans le bloc (l'editeur
-- SQL de Supabase tronque ou deforme ces collages). Prend le premier etablissement
-- 'validee' avec un membre et sans proposition ouverte. L'anciennete est simulee en
-- reculant created_at de la DEMANDE (le journal d'echanges, lui, est immuable).

DO $$
DECLARE
  v_inst uuid; v_mem uuid; v_s uuid; v_req uuid;
  v_i0 public.institutions; v_i1 public.institutions;
  v_res jsonb; v_ok boolean; v_n int; v_n0 int; v_ret int; v_state text; v_win int := 600;
  v_rep text := E'RAPPORT RELANCE (cette erreur finale annule tout)\n';
BEGIN
  v_mem := (SELECT m.id FROM public.institution_membres m JOIN public.institutions i ON i.id = m.institution_id
            WHERE i.statut::text = 'validee'
              AND NOT EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.institution_id = i.id AND r.statut = 'a_examiner')
            LIMIT 1);
  IF v_mem IS NULL THEN RAISE EXCEPTION 'Aucun etablissement valide avec membre et sans proposition ouverte'; END IF;
  v_inst := (SELECT m.institution_id FROM public.institution_membres m WHERE m.id = v_mem);
  v_i0 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_s := gen_random_uuid();
  INSERT INTO public.institution_sessions (id, institution_id, membre_id, expires_at, reauth_at) VALUES (v_s, v_inst, v_mem, now() + interval '1 hour', now());
  v_res := public.appliquer_modifications_sensibles(v_inst, v_mem, v_s, jsonb_build_object('name', v_i0.name || ' RELANCE'), NULL, NULL, NULL, v_win);
  v_req := (SELECT r.id FROM public.institution_change_requests r WHERE r.institution_id = v_inst AND r.champ = 'name' AND r.statut = 'a_examiner');
  IF v_req IS NULL THEN RAISE EXCEPTION 'Proposition de test non creee'; END IF;
  v_n0 := (SELECT count(*) FROM public.notifications n WHERE n.destinataire_id = v_inst AND n.type = 'changement_profil_relance');

  v_ret := public.relancer_propositions_anciennes();
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee');
  v_ok := v_n = 0;
  v_rep := v_rep || format(E'%s  L1 proposition recente : aucune relance\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  UPDATE public.institution_change_requests SET created_at = now() - interval '8 days' WHERE id = v_req;
  v_ret := public.relancer_propositions_anciennes();
  v_ok := v_ret >= 1
          AND EXISTS (SELECT 1 FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee' AND e.message = 'relance_7j' AND e.acteur_type = 'systeme' AND e.acteur_id IS NULL)
          AND (SELECT count(*) FROM public.notifications n WHERE n.destinataire_id = v_inst AND n.type = 'changement_profil_relance') = v_n0 + 1
          AND EXISTS (SELECT 1 FROM public.notifications n WHERE n.destinataire_id = v_inst AND n.type = 'changement_profil_relance' AND n.destinataire_type = 'institution' AND n.lu = false AND n.message LIKE '%toujours en cours%');
  v_rep := v_rep || format(E'%s  L2 8 jours : une relance 7j (evenement systeme + notification non lue)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_ret := public.relancer_propositions_anciennes();
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee');
  v_ok := v_n = 1 AND (SELECT count(*) FROM public.notifications n WHERE n.destinataire_id = v_inst AND n.type = 'changement_profil_relance') = v_n0 + 1;
  v_rep := v_rep || format(E'%s  L3 second passage le meme jour : pas de doublon\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  UPDATE public.institution_change_requests SET created_at = now() - interval '15 days' WHERE id = v_req;
  v_ret := public.relancer_propositions_anciennes();
  v_ok := EXISTS (SELECT 1 FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee' AND e.message = 'relance_14j')
          AND (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee') = 2
          AND (SELECT count(*) FROM public.notifications n WHERE n.destinataire_id = v_inst AND n.type = 'changement_profil_relance') = v_n0 + 2;
  v_rep := v_rep || format(E'%s  L4 15 jours : une relance 14j de plus\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_ret := public.relancer_propositions_anciennes();
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee');
  v_ok := v_n = 2;
  v_rep := v_rep || format(E'%s  L5 nouveau passage : toujours 2 relances (une par palier)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_i1 := (SELECT i FROM public.institutions i WHERE i.id = v_inst);
  v_ok := v_i1.name = v_i0.name AND v_i1.statut::text = 'validee' AND v_i1.badge_verifie IS NOT DISTINCT FROM v_i0.badge_verifie
          AND EXISTS (SELECT 1 FROM public.institution_change_requests r WHERE r.id = v_req AND r.statut = 'a_examiner');
  v_rep := v_rep || format(E'%s  L6 aucune publication : nom, statut et badge intacts, demande toujours ouverte\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_res := public.demander_complement_changement_profil(v_req, (SELECT a.id FROM public.admin_users a WHERE a.is_active LIMIT 1), 'Precisions necessaires', '{}');
  v_ret := public.relancer_propositions_anciennes();
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee');
  v_ok := v_n = 2;
  v_rep := v_rep || format(E'%s  L7 un complement demande redemarre l horloge : pas de relance immediate\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  UPDATE public.institution_change_requests SET created_at = now() - interval '40 days' WHERE id = v_req;
  UPDATE public.institutions SET statut = 'suspendue' WHERE id = v_inst;
  v_ret := public.relancer_propositions_anciennes();
  v_n := (SELECT count(*) FROM public.institution_change_request_events e WHERE e.request_id = v_req AND e.type = 'relance_envoyee');
  v_ok := v_n = 2;
  v_rep := v_rep || format(E'%s  L8 etablissement non public (suspendu) : aucune relance\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  UPDATE public.institutions SET statut = 'validee' WHERE id = v_inst;

  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.relancer_propositions_anciennes();
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  L9a authenticated : execution refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);
  v_state := 'acces accorde';
  BEGIN SET LOCAL ROLE anon; PERFORM public.relancer_propositions_anciennes();
  EXCEPTION WHEN insufficient_privilege THEN v_state := 'refuse'; END;
  RESET ROLE;
  v_ok := v_state = 'refuse';
  v_rep := v_rep || format(E'%s  L9b anon : execution refusee\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  v_ok := EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'yelen-relance-propositions' AND j.schedule = '0 8 * * *');
  v_rep := v_rep || format(E'%s  L10 job pg_cron planifie chaque jour a 08:00 (UTC)\n', CASE WHEN v_ok THEN 'OK  ' ELSE 'FAIL' END);

  RAISE EXCEPTION E'%', v_rep;
END;
$$;
