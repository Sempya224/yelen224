-- Correctif immédiat (15/09/2026, testé en conditions réelles par Bryan) —
-- erreur réelle obtenue au premier test : "column \"date_rdv\" is of type
-- date but expression is of type text". Le commentaire de la migration
-- précédente (20260915000001) affirmait à tort que Postgres appliquerait un
-- cast d'assignation automatique text→date dans l'INSERT — faux pour une
-- variable plpgsql explicitement typée `text` (l'auto-cast dont on a
-- l'habitude via PostgREST sur un insert direct depuis le client ne
-- s'applique pas à l'intérieur d'une fonction SQL). Colonnes confirmées
-- maintenant par l'erreur réelle : `rdv.date_rdv` est `date`, et par
-- symétrie (même historique d'insert réussi côté PostgREST) `rdv.heure_rdv`
-- est très probablement `time` — les deux paramètres sont donc castés
-- explicitement (`::date`, `::time`) au moment de l'INSERT uniquement (les
-- comparaisons WHERE existantes, qui castent la colonne EN text, restent
-- inchangées et ne posaient aucun problème).
CREATE OR REPLACE FUNCTION public.reserver_creneau_rdv(
  p_institution_id uuid,
  p_date_rdv text,
  p_heure_rdv text,
  p_citoyen_id uuid,
  p_objet text,
  p_pour_autre boolean,
  p_nom_autre text,
  p_phone_autre text,
  p_qr_token text,
  p_champs_complementaires_reponses jsonb,
  p_duree_minutes integer,
  p_description_besoin text,
  p_provenance text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacite integer;
  v_deja_pris integer;
  v_new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_institution_id::text || p_date_rdv || p_heure_rdv));

  SELECT capacite_par_creneau INTO v_capacite FROM institutions WHERE id = p_institution_id;
  IF v_capacite IS NULL THEN
    RAISE EXCEPTION 'INSTITUTION_INTROUVABLE';
  END IF;

  SELECT count(*) INTO v_deja_pris FROM (
    SELECT 1 FROM rdv
      WHERE institution_id = p_institution_id
        AND date_rdv::text = p_date_rdv
        AND left(heure_rdv::text, 5) = left(p_heure_rdv, 5)
        AND statut <> 'annule'
    UNION ALL
    SELECT 1 FROM paid_bookings
      WHERE institution_id = p_institution_id
        AND date_rdv::text = p_date_rdv
        AND left(heure_rdv::text, 5) = left(p_heure_rdv, 5)
        AND statut <> 'annule'
  ) t;

  IF v_deja_pris >= v_capacite THEN
    RAISE EXCEPTION 'CRENEAU_COMPLET';
  END IF;

  INSERT INTO rdv (
    citoyen_id, institution_id, date_rdv, heure_rdv, objet, statut,
    pour_autre, nom_autre, phone_autre, qr_token,
    champs_complementaires_reponses, duree_minutes, description_besoin, provenance
  ) VALUES (
    p_citoyen_id, p_institution_id, p_date_rdv::date, p_heure_rdv::time, p_objet, 'nouveau',
    p_pour_autre, p_nom_autre, p_phone_autre, p_qr_token,
    p_champs_complementaires_reponses, p_duree_minutes, p_description_besoin, p_provenance
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserver_creneau_rdv_payant(
  p_institution_id uuid,
  p_service_id uuid,
  p_date_rdv text,
  p_heure_rdv text,
  p_citoyen_id uuid,
  p_confirmation_code text,
  p_objet text,
  p_pour_autre boolean,
  p_nom_autre text,
  p_phone_autre text,
  p_champs_complementaires_reponses jsonb,
  p_duree_minutes integer,
  p_description_besoin text,
  p_provenance text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacite integer;
  v_deja_pris integer;
  v_new_rdv_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_institution_id::text || p_date_rdv || p_heure_rdv));

  SELECT capacite_par_creneau INTO v_capacite FROM institutions WHERE id = p_institution_id;
  IF v_capacite IS NULL THEN
    RAISE EXCEPTION 'INSTITUTION_INTROUVABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM paid_services
    WHERE id = p_service_id AND institution_id = p_institution_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'SERVICE_INTROUVABLE';
  END IF;

  SELECT count(*) INTO v_deja_pris FROM (
    SELECT 1 FROM rdv
      WHERE institution_id = p_institution_id
        AND date_rdv::text = p_date_rdv
        AND left(heure_rdv::text, 5) = left(p_heure_rdv, 5)
        AND statut <> 'annule'
    UNION ALL
    SELECT 1 FROM paid_bookings
      WHERE institution_id = p_institution_id
        AND date_rdv::text = p_date_rdv
        AND left(heure_rdv::text, 5) = left(p_heure_rdv, 5)
        AND statut <> 'annule'
  ) t;

  IF v_deja_pris >= v_capacite THEN
    RAISE EXCEPTION 'CRENEAU_COMPLET';
  END IF;

  INSERT INTO paid_bookings (
    service_id, citoyen_id, institution_id, date_rdv, heure_rdv,
    confirmation_code, statut, champs_complementaires_reponses, provenance
  ) VALUES (
    p_service_id, p_citoyen_id, p_institution_id, p_date_rdv::date, p_heure_rdv::time,
    p_confirmation_code, 'en_attente', p_champs_complementaires_reponses, p_provenance
  );

  INSERT INTO rdv (
    citoyen_id, institution_id, date_rdv, heure_rdv, objet, statut,
    pour_autre, nom_autre, phone_autre, qr_token,
    champs_complementaires_reponses, duree_minutes, description_besoin, provenance
  ) VALUES (
    p_citoyen_id, p_institution_id, p_date_rdv::date, p_heure_rdv::time, p_objet, 'nouveau',
    p_pour_autre, p_nom_autre, p_phone_autre, p_confirmation_code,
    p_champs_complementaires_reponses, p_duree_minutes, p_description_besoin, p_provenance
  )
  RETURNING id INTO v_new_rdv_id;

  RETURN v_new_rdv_id;
END;
$$;
