-- PROPOSEE - NON EXECUTEE. A executer APRES 20261020000003. Correction d'un trou :
-- un etablissement 'suspendue' a deja ete public ; ses changements sensibles restent
-- des PROPOSITIONS (sinon il pourrait se renommer pendant la suspension, sans examen,
-- et ce nom deviendrait public a la levee). Seule difference avec la version de
-- 20261020000001 : v_publique := v_inst.statut::text IN ('validee', 'suspendue').
-- Etablissements en_attente / refusee : application directe, inchangee.

CREATE OR REPLACE FUNCTION public.appliquer_modifications_sensibles(
  p_institution_id          uuid,
  p_membre_id               uuid,
  p_session_id              uuid,
  p_champs                  jsonb,
  p_slug                    text,
  p_ip                      text,
  p_user_agent              text,
  p_fenetre_reauth_secondes integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membre_nom text;
  v_reauth_at  timestamptz;
  v_inst       public.institutions;
  v_publique   boolean;

  v_open_name    public.institution_change_requests;
  v_open_ville   public.institution_change_requests;
  v_open_adresse public.institution_change_requests;
  v_open_coord   public.institution_change_requests;
  v_open_act     public.institution_change_requests;

  v_has_name boolean := p_champs ? 'name';
  v_has_ville boolean := p_champs ? 'ville';
  v_has_adresse boolean := p_champs ? 'adresse';
  v_has_coord boolean := (p_champs ? 'latitude') OR (p_champs ? 'longitude');
  v_has_cat boolean := p_champs ? 'activite_categorie_id';
  v_has_princ boolean := p_champs ? 'activite_principale_id';
  v_has_sec boolean := p_champs ? 'activites_secondaires_ids';
  v_has_act boolean;

  v_name_new text; v_ville_new text; v_adresse_new text;
  v_lat_new numeric; v_lng_new numeric;
  v_cat_new uuid; v_princ_new uuid; v_sec_new uuid[]; v_sec_final uuid[];
  v_princ_old uuid; v_sec_old uuid[]; v_princ_final uuid;

  v_eff_name text; v_eff_ville text; v_eff_adresse text;
  v_eff_lat numeric; v_eff_lng numeric; v_eff_cat uuid; v_eff_princ uuid;

  -- chg : la valeur effective change ; ret : retour a la valeur publiee ;
  -- cos : simple difference de forme (casse/espaces) a ecrire directement ;
  -- dir : application directe (etablissement non public) ; prop : proposition.
  v_chg_name boolean := false; v_ret_name boolean := false; v_cos_name boolean := false; v_dir_name boolean := false; v_prop_name boolean := false;
  v_chg_ville boolean := false; v_ret_ville boolean := false; v_cos_ville boolean := false; v_dir_ville boolean := false; v_prop_ville boolean := false;
  v_chg_adresse boolean := false; v_ret_adresse boolean := false; v_cos_adresse boolean := false; v_dir_adresse boolean := false; v_prop_adresse boolean := false;
  v_chg_coord boolean := false; v_ret_coord boolean := false; v_cos_coord boolean := false; v_dir_coord boolean := false; v_prop_coord boolean := false;
  v_chg_act boolean := false; v_ret_act boolean := false; v_dir_act boolean := false; v_prop_act boolean := false;
  v_sensible boolean;
  v_ecrire_activites boolean := false;

  v_cands jsonb := '[]'::jsonb;
  v_c jsonb;
  v_demandes jsonb := '[]'::jsonb;
  v_appliquees jsonb := '[]'::jsonb;
  v_retirees jsonb := '[]'::jsonb;
  v_req_id uuid; v_req_numero text;
BEGIN
  v_has_act := v_has_cat OR v_has_princ OR v_has_sec;

  IF p_institution_id IS NULL OR p_membre_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: institution, membre et session requis';
  END IF;
  IF p_champs IS NULL OR jsonb_typeof(p_champs) <> 'object' THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: p_champs doit etre un objet JSON';
  END IF;
  IF p_fenetre_reauth_secondes IS NULL OR p_fenetre_reauth_secondes <= 0 THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: fenetre de reauthentification invalide';
  END IF;

  v_membre_nom := (SELECT btrim(coalesce(m.prenom, '') || ' ' || coalesce(m.nom, ''))
                   FROM public.institution_membres m
                   WHERE m.id = p_membre_id AND m.institution_id = p_institution_id);
  IF v_membre_nom IS NULL OR length(v_membre_nom) = 0 THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: membre inconnu pour cette institution';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('institution_profil:' || p_institution_id::text));

  v_inst := (SELECT i FROM public.institutions i WHERE i.id = p_institution_id FOR UPDATE);
  IF v_inst.id IS NULL THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: institution inconnue';
  END IF;
  v_publique := v_inst.statut::text IN ('validee', 'suspendue');

  v_open_name    := (SELECT r FROM public.institution_change_requests r WHERE r.institution_id = p_institution_id AND r.champ = 'name'        AND r.statut = 'a_examiner');
  v_open_ville   := (SELECT r FROM public.institution_change_requests r WHERE r.institution_id = p_institution_id AND r.champ = 'ville'       AND r.statut = 'a_examiner');
  v_open_adresse := (SELECT r FROM public.institution_change_requests r WHERE r.institution_id = p_institution_id AND r.champ = 'adresse'     AND r.statut = 'a_examiner');
  v_open_coord   := (SELECT r FROM public.institution_change_requests r WHERE r.institution_id = p_institution_id AND r.champ = 'coordonnees' AND r.statut = 'a_examiner');
  v_open_act     := (SELECT r FROM public.institution_change_requests r WHERE r.institution_id = p_institution_id AND r.champ = 'activite'    AND r.statut = 'a_examiner');

  v_princ_old := (SELECT a.activite_id FROM public.institution_activites a WHERE a.institution_id = p_institution_id AND a.principale LIMIT 1);
  v_sec_old := coalesce(ARRAY(SELECT a.activite_id FROM public.institution_activites a WHERE a.institution_id = p_institution_id AND NOT a.principale ORDER BY a.activite_id), '{}');

  -- Valeurs EFFECTIVES : la proposition en attente si elle existe, sinon la valeur publiee.
  v_eff_name    := CASE WHEN v_open_name.id    IS NOT NULL THEN v_open_name.nouvelle_valeur #>> '{}' ELSE v_inst.name END;
  v_eff_ville   := CASE WHEN v_open_ville.id   IS NOT NULL THEN v_open_ville.nouvelle_valeur #>> '{}' ELSE v_inst.ville END;
  v_eff_adresse := CASE WHEN v_open_adresse.id IS NOT NULL THEN v_open_adresse.nouvelle_valeur #>> '{}' ELSE v_inst.adresse END;
  v_eff_lat     := CASE WHEN v_open_coord.id   IS NOT NULL THEN nullif(v_open_coord.nouvelle_valeur->>'latitude', '')::numeric ELSE v_inst.latitude::numeric END;
  v_eff_lng     := CASE WHEN v_open_coord.id   IS NOT NULL THEN nullif(v_open_coord.nouvelle_valeur->>'longitude', '')::numeric ELSE v_inst.longitude::numeric END;
  v_eff_cat     := CASE WHEN v_open_act.id     IS NOT NULL THEN nullif(v_open_act.nouvelle_valeur->>'activite_categorie_id', '')::uuid ELSE v_inst.activite_categorie_id END;
  v_eff_princ   := CASE WHEN v_open_act.id     IS NOT NULL THEN nullif(v_open_act.nouvelle_valeur->>'activite_principale_id', '')::uuid ELSE v_princ_old END;

  -- Calcul du diff (sous verrou, contre la base)
  IF v_has_name THEN
    v_name_new := p_champs->>'name';
    IF v_name_new IS NULL OR length(btrim(v_name_new)) = 0 THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: nom vide interdit';
    END IF;
    v_chg_name := public.normaliser_texte_profil(v_name_new) IS DISTINCT FROM public.normaliser_texte_profil(v_eff_name);
    v_ret_name := v_chg_name AND public.normaliser_texte_profil(v_name_new) IS NOT DISTINCT FROM public.normaliser_texte_profil(v_inst.name);
    v_cos_name := (v_ret_name OR (NOT v_chg_name AND v_open_name.id IS NULL)) AND v_name_new IS DISTINCT FROM v_inst.name;
  END IF;
  IF v_has_ville THEN
    v_ville_new := p_champs->>'ville';
    IF v_ville_new IS NULL OR length(btrim(v_ville_new)) = 0 THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: ville vide interdite';
    END IF;
    v_chg_ville := public.normaliser_texte_profil(v_ville_new) IS DISTINCT FROM public.normaliser_texte_profil(v_eff_ville);
    v_ret_ville := v_chg_ville AND public.normaliser_texte_profil(v_ville_new) IS NOT DISTINCT FROM public.normaliser_texte_profil(v_inst.ville);
    v_cos_ville := (v_ret_ville OR (NOT v_chg_ville AND v_open_ville.id IS NULL)) AND v_ville_new IS DISTINCT FROM v_inst.ville;
  END IF;
  IF v_has_adresse THEN
    v_adresse_new := p_champs->>'adresse';
    v_chg_adresse := public.normaliser_texte_profil(v_adresse_new) IS DISTINCT FROM public.normaliser_texte_profil(v_eff_adresse);
    v_ret_adresse := v_chg_adresse AND public.normaliser_texte_profil(v_adresse_new) IS NOT DISTINCT FROM public.normaliser_texte_profil(v_inst.adresse);
    v_cos_adresse := (v_ret_adresse OR (NOT v_chg_adresse AND v_open_adresse.id IS NULL)) AND v_adresse_new IS DISTINCT FROM v_inst.adresse;
  END IF;
  IF v_has_coord THEN
    v_lat_new := CASE WHEN p_champs ? 'latitude'  THEN nullif(p_champs->>'latitude',  '')::numeric ELSE v_eff_lat END;
    v_lng_new := CASE WHEN p_champs ? 'longitude' THEN nullif(p_champs->>'longitude', '')::numeric ELSE v_eff_lng END;
    IF v_lat_new IS NOT NULL AND (v_lat_new < -90 OR v_lat_new > 90) THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: latitude hors bornes';
    END IF;
    IF v_lng_new IS NOT NULL AND (v_lng_new < -180 OR v_lng_new > 180) THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: longitude hors bornes';
    END IF;
    v_chg_coord := round(v_lat_new, 6) IS DISTINCT FROM round(v_eff_lat, 6) OR round(v_lng_new, 6) IS DISTINCT FROM round(v_eff_lng, 6);
    v_ret_coord := v_chg_coord
                   AND round(v_lat_new, 6) IS NOT DISTINCT FROM round(v_inst.latitude::numeric, 6)
                   AND round(v_lng_new, 6) IS NOT DISTINCT FROM round(v_inst.longitude::numeric, 6);
    v_cos_coord := (v_ret_coord OR (NOT v_chg_coord AND v_open_coord.id IS NULL))
                   AND (v_lat_new IS DISTINCT FROM v_inst.latitude::numeric OR v_lng_new IS DISTINCT FROM v_inst.longitude::numeric);
  END IF;
  IF v_has_act THEN
    v_cat_new   := CASE WHEN v_has_cat   THEN nullif(p_champs->>'activite_categorie_id', '')::uuid ELSE v_eff_cat END;
    v_princ_new := CASE WHEN v_has_princ THEN nullif(p_champs->>'activite_principale_id', '')::uuid ELSE v_eff_princ END;
    v_sec_new   := CASE WHEN v_has_sec
                        THEN coalesce(ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_champs->'activites_secondaires_ids') AS x), '{}')
                        ELSE v_sec_old END;
    v_chg_act := v_cat_new IS DISTINCT FROM v_eff_cat OR v_princ_new IS DISTINCT FROM v_eff_princ;
    v_ret_act := v_chg_act AND v_cat_new IS NOT DISTINCT FROM v_inst.activite_categorie_id AND v_princ_new IS NOT DISTINCT FROM v_princ_old;
  END IF;

  v_sensible := v_chg_name OR v_chg_ville OR v_chg_adresse OR v_chg_coord OR v_chg_act;

  -- Reauthentification (revérifiée en base, même regle de session valide que l'application)
  IF v_sensible THEN
    v_reauth_at := (SELECT s.reauth_at FROM public.institution_sessions s
                    WHERE s.id = p_session_id AND s.institution_id = p_institution_id AND s.membre_id = p_membre_id
                      AND s.revoked_at IS NULL AND s.expires_at IS NOT NULL AND s.expires_at >= now());
    IF v_reauth_at IS NULL OR v_reauth_at < now() - make_interval(secs => p_fenetre_reauth_secondes) THEN
      RAISE EXCEPTION 'REAUTH_REQUIRED' USING ERRCODE = 'YR001';
    END IF;
  END IF;

  v_dir_name := v_chg_name AND NOT v_ret_name AND NOT v_publique;       v_prop_name := v_chg_name AND NOT v_ret_name AND v_publique;
  v_dir_ville := v_chg_ville AND NOT v_ret_ville AND NOT v_publique;    v_prop_ville := v_chg_ville AND NOT v_ret_ville AND v_publique;
  v_dir_adresse := v_chg_adresse AND NOT v_ret_adresse AND NOT v_publique; v_prop_adresse := v_chg_adresse AND NOT v_ret_adresse AND v_publique;
  v_dir_coord := v_chg_coord AND NOT v_ret_coord AND NOT v_publique;    v_prop_coord := v_chg_coord AND NOT v_ret_coord AND v_publique;
  v_dir_act := v_chg_act AND NOT v_ret_act AND NOT v_publique;          v_prop_act := v_chg_act AND NOT v_ret_act AND v_publique;

  -- 1. Retrait des propositions remplacees ou annulees (retour a la valeur publiee)
  IF v_chg_name AND v_open_name.id IS NOT NULL THEN
    UPDATE public.institution_change_requests SET statut = 'retiree', decide_le = now() WHERE id = v_open_name.id;
    v_retirees := v_retirees || to_jsonb('name'::text);
  END IF;
  IF v_chg_ville AND v_open_ville.id IS NOT NULL THEN
    UPDATE public.institution_change_requests SET statut = 'retiree', decide_le = now() WHERE id = v_open_ville.id;
    v_retirees := v_retirees || to_jsonb('ville'::text);
  END IF;
  IF v_chg_adresse AND v_open_adresse.id IS NOT NULL THEN
    UPDATE public.institution_change_requests SET statut = 'retiree', decide_le = now() WHERE id = v_open_adresse.id;
    v_retirees := v_retirees || to_jsonb('adresse'::text);
  END IF;
  IF v_chg_coord AND v_open_coord.id IS NOT NULL THEN
    UPDATE public.institution_change_requests SET statut = 'retiree', decide_le = now() WHERE id = v_open_coord.id;
    v_retirees := v_retirees || to_jsonb('coordonnees'::text);
  END IF;
  IF v_chg_act AND v_open_act.id IS NOT NULL THEN
    UPDATE public.institution_change_requests SET statut = 'retiree', decide_le = now() WHERE id = v_open_act.id;
    v_retirees := v_retirees || to_jsonb('activite'::text);
  END IF;

  -- 2. Ecriture directe : etablissement non public, ou simple difference de forme
  IF v_dir_name OR v_cos_name OR v_dir_ville OR v_cos_ville OR v_dir_adresse OR v_cos_adresse OR v_dir_coord OR v_cos_coord OR v_dir_act THEN
    UPDATE public.institutions SET
      name    = CASE WHEN v_dir_name OR v_cos_name THEN v_name_new ELSE name END,
      slug    = CASE WHEN v_dir_name AND p_slug IS NOT NULL THEN p_slug ELSE slug END,
      ville   = CASE WHEN v_dir_ville OR v_cos_ville THEN v_ville_new ELSE ville END,
      adresse = CASE WHEN v_dir_adresse OR v_cos_adresse THEN v_adresse_new ELSE adresse END,
      latitude  = CASE WHEN v_dir_coord OR v_cos_coord THEN v_lat_new ELSE latitude END,
      longitude = CASE WHEN v_dir_coord OR v_cos_coord THEN v_lng_new ELSE longitude END,
      activite_categorie_id = CASE WHEN v_dir_act THEN v_cat_new ELSE activite_categorie_id END
    WHERE id = p_institution_id;
    IF v_dir_name THEN v_appliquees := v_appliquees || to_jsonb('name'::text); END IF;
    IF v_dir_ville THEN v_appliquees := v_appliquees || to_jsonb('ville'::text); END IF;
    IF v_dir_adresse THEN v_appliquees := v_appliquees || to_jsonb('adresse'::text); END IF;
    IF v_dir_coord THEN v_appliquees := v_appliquees || to_jsonb('coordonnees'::text); END IF;
    IF v_dir_act THEN v_appliquees := v_appliquees || to_jsonb('activite'::text); END IF;
  END IF;

  -- Activites : la principale PUBLIEE reste en place tant qu'une proposition est
  -- en attente ; les secondaires (niveau A) s'ecrivent toujours directement.
  IF v_has_act THEN
    v_princ_final := CASE WHEN v_dir_act THEN v_princ_new ELSE v_princ_old END;
    v_sec_final := coalesce(ARRAY(SELECT s FROM unnest(v_sec_new) AS s WHERE s IS DISTINCT FROM v_princ_final ORDER BY s), '{}');
    v_ecrire_activites := v_princ_final IS NOT NULL AND (v_princ_final IS DISTINCT FROM v_princ_old OR v_sec_final IS DISTINCT FROM v_sec_old);
    IF v_ecrire_activites THEN
      DELETE FROM public.institution_activites WHERE institution_id = p_institution_id;
      INSERT INTO public.institution_activites (institution_id, activite_id, principale, ordre)
      VALUES (p_institution_id, v_princ_final, true, 0);
      INSERT INTO public.institution_activites (institution_id, activite_id, principale, ordre)
      SELECT p_institution_id, s.id, false, s.ord
      FROM unnest(v_sec_final) WITH ORDINALITY AS s(id, ord);
    END IF;
  END IF;

  -- 3. Nouvelles propositions (etablissement public) : ancienne = valeur PUBLIEE
  IF v_prop_name THEN
    v_cands := v_cands || jsonb_build_object('champ', 'name', 'ancienne', to_jsonb(v_inst.name), 'nouvelle', to_jsonb(v_name_new));
  END IF;
  IF v_prop_ville THEN
    v_cands := v_cands || jsonb_build_object('champ', 'ville', 'ancienne', to_jsonb(v_inst.ville), 'nouvelle', to_jsonb(v_ville_new));
  END IF;
  IF v_prop_adresse THEN
    v_cands := v_cands || jsonb_build_object('champ', 'adresse', 'ancienne', to_jsonb(v_inst.adresse), 'nouvelle', to_jsonb(v_adresse_new));
  END IF;
  IF v_prop_coord THEN
    v_cands := v_cands || jsonb_build_object('champ', 'coordonnees',
      'ancienne', jsonb_build_object('latitude', v_inst.latitude, 'longitude', v_inst.longitude),
      'nouvelle', jsonb_build_object('latitude', v_lat_new, 'longitude', v_lng_new));
  END IF;
  IF v_prop_act THEN
    v_cands := v_cands || jsonb_build_object('champ', 'activite',
      'ancienne', jsonb_build_object('activite_categorie_id', v_inst.activite_categorie_id, 'activite_principale_id', v_princ_old),
      'nouvelle', jsonb_build_object('activite_categorie_id', v_cat_new, 'activite_principale_id', v_princ_new));
  END IF;

  FOR v_c IN SELECT value FROM jsonb_array_elements(v_cands) LOOP
    INSERT INTO public.institution_change_requests (institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom, ip, user_agent)
    VALUES (p_institution_id, v_c->>'champ', v_c->'ancienne', v_c->'nouvelle', p_membre_id, v_membre_nom, p_ip, p_user_agent)
    RETURNING id, numero INTO v_req_id, v_req_numero;
    v_demandes := v_demandes || jsonb_build_object('id', v_req_id, 'numero', v_req_numero, 'champ', v_c->>'champ');
  END LOOP;

  RETURN jsonb_build_object('demandes', v_demandes, 'appliquees', v_appliquees, 'retirees', v_retirees);
END;
$$;

REVOKE ALL ON FUNCTION public.appliquer_modifications_sensibles(uuid,uuid,uuid,jsonb,text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appliquer_modifications_sensibles(uuid,uuid,uuid,jsonb,text,text,text,integer) TO service_role;
