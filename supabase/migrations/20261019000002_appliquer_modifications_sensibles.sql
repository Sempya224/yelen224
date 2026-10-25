-- PROPOSÉE (révision 2) — NON EXÉCUTÉE. Dépend de 20261019000001_institution_change_requests.sql
-- (à exécuter AVANT). Voir docs/product/YELEN_REVERIFICATION_POLICY.md §5.
--
-- Fonction transactionnelle unique : applique les modifications de profil
-- sensibles (niveau B) ET crée les demandes d'examen correspondantes dans UNE
-- SEULE transaction — tout réussit ou tout est annulé. Calquée sur
-- decider_demande_activite (20260821000007) : SECURITY DEFINER, search_path
-- fixé, verrou consultatif, EXECUTE réservé à service_role.
--
-- Le diff est recalculé ICI, sous verrou, contre la ligne réellement en base :
-- le diff éventuel fait côté route ne sert qu'à répondre tôt 403
-- REAUTH_REQUIRED. Deux requêtes identiques simultanées : la seconde voit la
-- valeur déjà appliquée, ne trouve aucun changement, ne crée aucune demande.
--
-- Réauthentification : la route la vérifie (cookie de session), mais la
-- fonction la revérifie en base (institution_sessions.reauth_at, fenêtre
-- passée en paramètre depuis lib/institutionAuth.ts::INSTITUTION_REAUTH_WINDOW_MS)
-- dès qu'un changement sensible existe — défense en profondeur. Erreur dédiée
-- SQLSTATE 'YR001' que la route traduit en 403 {code:"REAUTH_REQUIRED"}.
--
-- Périmètre d'écriture strictement borné : cette fonction ne lit que les
-- clés name, ville, adresse, latitude, longitude, activite_categorie_id,
-- activite_principale_id, activites_secondaires_ids de p_champs ; toute autre
-- clé est ignorée. Elle n'écrit que institutions.(name, slug, ville, adresse,
-- latitude, longitude, activite_categorie_id), institution_activites et
-- institution_change_requests. Le statut de l'établissement (statut,
-- badge_verifie, niveau_confiance, statut_juridique…) n'est JAMAIS lu ni écrit.
-- Hors fonction : validation des valeurs (URL, existence catégorie/activité,
-- rôle du membre) → route ; champs de niveau A → UPDATE habituel de la route.

-- Normalisation de comparaison : NFC, trim, espaces multiples réduits,
-- insensible à la casse. Un accent différent reste une vraie différence.
CREATE OR REPLACE FUNCTION public.normaliser_texte_profil(p_texte text) RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(btrim(regexp_replace(normalize(coalesce(p_texte, ''), NFC), '\s+', ' ', 'g')));
$$;

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
  v_membre_nom   text;
  v_reauth_at    timestamptz;
  v_inst         public.institutions;

  v_has_name boolean := p_champs ? 'name';
  v_has_ville boolean := p_champs ? 'ville';
  v_has_adresse boolean := p_champs ? 'adresse';
  v_has_coord boolean := (p_champs ? 'latitude') OR (p_champs ? 'longitude');
  v_has_cat boolean := p_champs ? 'activite_categorie_id';
  v_has_princ boolean := p_champs ? 'activite_principale_id';
  v_has_sec boolean := p_champs ? 'activites_secondaires_ids';

  v_name_new text;   v_ville_new text;   v_adresse_new text;
  v_lat_new numeric; v_lng_new numeric;
  v_cat_new uuid;    v_princ_new uuid;   v_sec_new uuid[];
  v_princ_old uuid;  v_sec_old uuid[];

  -- raw = la valeur brute diffère (on l'écrit) ; sens = la valeur normalisée
  -- diffère (changement sensible : réauth + demande).
  v_raw_name boolean := false;  v_sens_name boolean := false;
  v_raw_ville boolean := false; v_sens_ville boolean := false;
  v_raw_adresse boolean := false; v_sens_adresse boolean := false;
  v_raw_coord boolean := false; v_sens_coord boolean := false;
  v_sens_act boolean := false;  v_ecrire_activites boolean := false;
  v_sensible boolean;

  v_cands jsonb := '[]'::jsonb;
  v_c jsonb;
  v_demandes jsonb := '[]'::jsonb;
  v_absorbees jsonb := '[]'::jsonb;
  v_req_id uuid; v_req_numero text;
BEGIN
  IF p_institution_id IS NULL OR p_membre_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: institution, membre et session requis';
  END IF;
  IF p_champs IS NULL OR jsonb_typeof(p_champs) <> 'object' THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: p_champs doit être un objet JSON';
  END IF;
  IF p_fenetre_reauth_secondes IS NULL OR p_fenetre_reauth_secondes <= 0 THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: fenêtre de réauthentification invalide';
  END IF;

  -- Auteur réellement membre de CETTE institution — nom dérivé ici, jamais
  -- accepté du client.
  SELECT btrim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))
  INTO v_membre_nom
  FROM public.institution_membres
  WHERE id = p_membre_id AND institution_id = p_institution_id;
  IF v_membre_nom IS NULL OR length(v_membre_nom) = 0 THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: membre inconnu pour cette institution (membre_id=%)', p_membre_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('institution_profil:' || p_institution_id::text));

  SELECT * INTO v_inst FROM public.institutions WHERE id = p_institution_id FOR UPDATE;
  IF v_inst.id IS NULL THEN
    RAISE EXCEPTION 'appliquer_modifications_sensibles: institution inconnue (institution_id=%)', p_institution_id;
  END IF;

  SELECT activite_id INTO v_princ_old
  FROM public.institution_activites
  WHERE institution_id = p_institution_id AND principale
  LIMIT 1;
  SELECT coalesce(array_agg(activite_id ORDER BY activite_id), '{}') INTO v_sec_old
  FROM public.institution_activites
  WHERE institution_id = p_institution_id AND NOT principale;

  -- ── Calcul du diff (sous verrou, contre la base) ────────────────────────
  IF v_has_name THEN
    v_name_new := p_champs->>'name';
    IF v_name_new IS NULL OR length(btrim(v_name_new)) = 0 THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: nom vide interdit';
    END IF;
    v_raw_name := v_name_new IS DISTINCT FROM v_inst.name;
    v_sens_name := public.normaliser_texte_profil(v_name_new) IS DISTINCT FROM public.normaliser_texte_profil(v_inst.name);
  END IF;
  IF v_has_ville THEN
    v_ville_new := p_champs->>'ville';
    IF v_ville_new IS NULL OR length(btrim(v_ville_new)) = 0 THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: ville vide interdite';
    END IF;
    v_raw_ville := v_ville_new IS DISTINCT FROM v_inst.ville;
    v_sens_ville := public.normaliser_texte_profil(v_ville_new) IS DISTINCT FROM public.normaliser_texte_profil(v_inst.ville);
  END IF;
  IF v_has_adresse THEN
    v_adresse_new := p_champs->>'adresse';
    v_raw_adresse := v_adresse_new IS DISTINCT FROM v_inst.adresse;
    v_sens_adresse := public.normaliser_texte_profil(v_adresse_new) IS DISTINCT FROM public.normaliser_texte_profil(v_inst.adresse);
  END IF;
  IF v_has_coord THEN
    v_lat_new := CASE WHEN p_champs ? 'latitude'  THEN nullif(p_champs->>'latitude',  '')::numeric ELSE v_inst.latitude::numeric  END;
    v_lng_new := CASE WHEN p_champs ? 'longitude' THEN nullif(p_champs->>'longitude', '')::numeric ELSE v_inst.longitude::numeric END;
    -- Bornes géographiques réelles, aussi en base (la route les vérifie déjà).
    IF v_lat_new IS NOT NULL AND (v_lat_new < -90 OR v_lat_new > 90) THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: latitude hors bornes';
    END IF;
    IF v_lng_new IS NOT NULL AND (v_lng_new < -180 OR v_lng_new > 180) THEN
      RAISE EXCEPTION 'appliquer_modifications_sensibles: longitude hors bornes';
    END IF;
    v_raw_coord := v_lat_new IS DISTINCT FROM v_inst.latitude::numeric OR v_lng_new IS DISTINCT FROM v_inst.longitude::numeric;
    -- 6 décimales ≈ 0,1 m : en dessous, c'est du bruit de sélecteur de carte.
    v_sens_coord := round(v_lat_new, 6) IS DISTINCT FROM round(v_inst.latitude::numeric, 6)
                 OR round(v_lng_new, 6) IS DISTINCT FROM round(v_inst.longitude::numeric, 6);
  END IF;
  IF v_has_cat OR v_has_princ OR v_has_sec THEN
    v_cat_new   := CASE WHEN v_has_cat   THEN nullif(p_champs->>'activite_categorie_id', '')::uuid ELSE v_inst.activite_categorie_id END;
    v_princ_new := CASE WHEN v_has_princ THEN nullif(p_champs->>'activite_principale_id', '')::uuid ELSE v_princ_old END;
    v_sec_new   := CASE WHEN v_has_sec
                        THEN coalesce(ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_champs->'activites_secondaires_ids') AS x ORDER BY 1), '{}')
                        ELSE v_sec_old END;
    v_sens_act := v_cat_new IS DISTINCT FROM v_inst.activite_categorie_id OR v_princ_new IS DISTINCT FROM v_princ_old;
    -- Activités secondaires = niveau A : réécrites sans demande ni réauth,
    -- mais seulement avec une principale (la ligne principale est requise).
    v_ecrire_activites := v_princ_new IS NOT NULL
                          AND (v_princ_new IS DISTINCT FROM v_princ_old OR v_sec_new IS DISTINCT FROM v_sec_old);
  END IF;

  v_sensible := v_sens_name OR v_sens_ville OR v_sens_adresse OR v_sens_coord OR v_sens_act;

  -- ── Réauthentification (revérifiée en base) ─────────────────────────────
  IF v_sensible THEN
    -- Même définition de "session valide" que lib/institutionAuth.ts::
    -- sessionEstValide : non révoquée, expires_at obligatoire et non dépassée
    -- (fail-closed si expires_at est NULL).
    SELECT reauth_at INTO v_reauth_at
    FROM public.institution_sessions
    WHERE id = p_session_id
      AND institution_id = p_institution_id
      AND membre_id = p_membre_id
      AND revoked_at IS NULL
      AND expires_at IS NOT NULL
      AND expires_at >= now();
    IF v_reauth_at IS NULL OR v_reauth_at < now() - make_interval(secs => p_fenetre_reauth_secondes) THEN
      RAISE EXCEPTION 'REAUTH_REQUIRED' USING ERRCODE = 'YR001';
    END IF;
  END IF;

  -- ── Application (profil) ────────────────────────────────────────────────
  IF v_raw_name OR v_raw_ville OR v_raw_adresse OR v_raw_coord OR v_sens_act THEN
    UPDATE public.institutions SET
      name    = CASE WHEN v_raw_name    THEN v_name_new    ELSE name END,
      slug    = CASE WHEN v_sens_name AND p_slug IS NOT NULL THEN p_slug ELSE slug END,
      ville   = CASE WHEN v_raw_ville   THEN v_ville_new   ELSE ville END,
      adresse = CASE WHEN v_raw_adresse THEN v_adresse_new ELSE adresse END,
      latitude  = CASE WHEN v_raw_coord THEN v_lat_new ELSE latitude END,
      longitude = CASE WHEN v_raw_coord THEN v_lng_new ELSE longitude END,
      activite_categorie_id = CASE WHEN v_sens_act THEN v_cat_new ELSE activite_categorie_id END
    WHERE id = p_institution_id;
  END IF;

  IF v_ecrire_activites THEN
    DELETE FROM public.institution_activites WHERE institution_id = p_institution_id;
    INSERT INTO public.institution_activites (institution_id, activite_id, principale, ordre)
    VALUES (p_institution_id, v_princ_new, true, 0);
    INSERT INTO public.institution_activites (institution_id, activite_id, principale, ordre)
    SELECT p_institution_id, s.id, false, s.ord
    FROM unnest(v_sec_new) WITH ORDINALITY AS s(id, ord);
  END IF;

  -- ── Demandes d'examen (une par champ logique réellement modifié) ────────
  IF v_sens_name THEN
    v_cands := v_cands || jsonb_build_object('champ', 'name', 'ancienne', to_jsonb(v_inst.name), 'nouvelle', to_jsonb(v_name_new));
  END IF;
  IF v_sens_ville THEN
    v_cands := v_cands || jsonb_build_object('champ', 'ville', 'ancienne', to_jsonb(v_inst.ville), 'nouvelle', to_jsonb(v_ville_new));
  END IF;
  IF v_sens_adresse THEN
    v_cands := v_cands || jsonb_build_object('champ', 'adresse', 'ancienne', to_jsonb(v_inst.adresse), 'nouvelle', to_jsonb(v_adresse_new));
  END IF;
  IF v_sens_coord THEN
    v_cands := v_cands || jsonb_build_object('champ', 'coordonnees',
      'ancienne', jsonb_build_object('latitude', v_inst.latitude, 'longitude', v_inst.longitude),
      'nouvelle', jsonb_build_object('latitude', v_lat_new, 'longitude', v_lng_new));
  END IF;
  IF v_sens_act THEN
    v_cands := v_cands || jsonb_build_object('champ', 'activite',
      'ancienne', jsonb_build_object('activite_categorie_id', v_inst.activite_categorie_id, 'activite_principale_id', v_princ_old),
      'nouvelle', jsonb_build_object('activite_categorie_id', v_cat_new, 'activite_principale_id', v_princ_new));
  END IF;

  FOR v_c IN SELECT value FROM jsonb_array_elements(v_cands) LOOP
    -- Cas légitime : A->B, B->A, A->B avant tout examen. La demande ouverte
    -- identique existe déjà : on l'absorbe au lieu d'en créer une seconde
    -- (l'index unique partiel ferait sinon échouer toute la sauvegarde).
    IF EXISTS (
      SELECT 1 FROM public.institution_change_requests r
      WHERE r.institution_id = p_institution_id
        AND r.champ = v_c->>'champ'
        AND r.statut = 'a_examiner'
        AND r.ancienne_valeur IS NOT DISTINCT FROM (v_c->'ancienne')
        AND r.nouvelle_valeur = (v_c->'nouvelle')
    ) THEN
      v_absorbees := v_absorbees || to_jsonb(v_c->>'champ');
    ELSE
      INSERT INTO public.institution_change_requests (institution_id, champ, ancienne_valeur, nouvelle_valeur, membre_id, membre_nom, ip, user_agent)
      VALUES (p_institution_id, v_c->>'champ', v_c->'ancienne', v_c->'nouvelle', p_membre_id, v_membre_nom, p_ip, p_user_agent)
      RETURNING id, numero INTO v_req_id, v_req_numero;
      v_demandes := v_demandes || jsonb_build_object('id', v_req_id, 'numero', v_req_numero, 'champ', v_c->>'champ');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('demandes', v_demandes, 'absorbees', v_absorbees);
  -- Toute exception levée ci-dessus (réauth, contrainte, index anti-doublon,
  -- cast invalide) annule la transaction entière : ni UPDATE institutions, ni
  -- institution_activites, ni demande — aucun état partiel possible.
END;
$$;

REVOKE ALL ON FUNCTION public.normaliser_texte_profil(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.appliquer_modifications_sensibles(uuid,uuid,uuid,jsonb,text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normaliser_texte_profil(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.appliquer_modifications_sensibles(uuid,uuid,uuid,jsonb,text,text,text,integer) TO service_role;

COMMENT ON FUNCTION public.appliquer_modifications_sensibles IS
  'Seule voie légitime pour modifier nom/ville/adresse/coordonnées/catégorie+activité principale d''une institution. Applique la modification et crée les demandes d''examen dans une seule transaction, recalcule le diff sous verrou, revérifie la réauthentification en base. Appelée exclusivement par api/institution/profile via service_role.';

-- ROLLBACK :
--   DROP FUNCTION IF EXISTS public.appliquer_modifications_sensibles(uuid,uuid,uuid,jsonb,text,text,text,integer);
--   DROP FUNCTION IF EXISTS public.normaliser_texte_profil(text);
