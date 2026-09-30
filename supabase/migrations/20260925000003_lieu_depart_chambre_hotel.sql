-- Lieu de départ du voyageur — réservation chambre hôtel (25/09/2026).
-- Décision Bryan : le voyageur indique son pays/ville de provenance au
-- moment de réserver une chambre (comme une fiche d'arrivée d'hôtel
-- classique), obligatoire. Colonnes texte simples (même esprit que
-- rdv.pour_autre/nom_autre déjà existants) — pas de FK vers countries/
-- cities (Guinée n'a pas d'id de ville, voir lib/geographie.ts), juste
-- un instantané au moment de la réservation. Additif, nullable au niveau
-- DB (jamais renseigné hors chambres hôtel), obligatoire uniquement côté
-- application (app/rdv/[id]/actions.ts).
BEGIN;

ALTER TABLE rdv
  ADD COLUMN pays_depart text NULL,
  ADD COLUMN ville_depart text NULL;

ALTER TABLE paid_bookings
  ADD COLUMN pays_depart text NULL,
  ADD COLUMN ville_depart text NULL;

-- reserver_chambre_hotel (migration 20260925000001) — ajout de
-- p_pays_depart/p_ville_depart, propagés sur les deux inserts. Reste du
-- corps strictement inchangé (verrou, comptage, chevauchement de plages).
-- DROP explicite d'abord : 2 nouveaux paramètres obligatoires changent la
-- signature (13 → 15 args), CREATE OR REPLACE seul créerait un 2e
-- overload au lieu de remplacer l'ancien (dangling, pays_depart toujours
-- NULL si jamais rappelé).
DROP FUNCTION IF EXISTS public.reserver_chambre_hotel(uuid, uuid, date, date, uuid, text, text, boolean, text, text, jsonb, text, text);

CREATE FUNCTION public.reserver_chambre_hotel(
  p_institution_id uuid,
  p_service_id uuid,
  p_date_arrivee date,
  p_date_depart date,
  p_citoyen_id uuid,
  p_confirmation_code text,
  p_objet text,
  p_pour_autre boolean,
  p_nom_autre text,
  p_phone_autre text,
  p_champs_complementaires_reponses jsonb,
  p_description_besoin text,
  p_provenance text,
  p_pays_depart text,
  p_ville_depart text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_nombre_unites integer;
  v_deja_prises integer;
  v_new_rdv_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT COALESCE(nombre_unites, 1) INTO v_nombre_unites
  FROM paid_services
  WHERE id = p_service_id
    AND institution_id = p_institution_id
    AND is_active = true
    AND est_chambre = true;

  IF v_nombre_unites IS NULL THEN
    RAISE EXCEPTION 'SERVICE_INTROUVABLE';
  END IF;

  SELECT count(*) INTO v_deja_prises FROM paid_bookings
    WHERE institution_id = p_institution_id
      AND service_id = p_service_id
      AND statut <> 'annule'
      AND date_rdv < p_date_depart
      AND COALESCE(date_depart, date_rdv + 1) > p_date_arrivee;

  IF v_deja_prises >= v_nombre_unites THEN
    RAISE EXCEPTION 'CHAMBRE_COMPLETE';
  END IF;

  INSERT INTO paid_bookings (
    service_id, citoyen_id, institution_id, date_rdv, date_depart, heure_rdv,
    confirmation_code, statut, champs_complementaires_reponses, provenance,
    pays_depart, ville_depart
  ) VALUES (
    p_service_id, p_citoyen_id, p_institution_id, p_date_arrivee, p_date_depart, '00:00',
    p_confirmation_code, 'en_attente', p_champs_complementaires_reponses, p_provenance,
    p_pays_depart, p_ville_depart
  );

  INSERT INTO rdv (
    citoyen_id, institution_id, date_rdv, date_depart, heure_rdv, objet, statut,
    pour_autre, nom_autre, phone_autre, qr_token,
    champs_complementaires_reponses, duree_minutes, description_besoin, provenance,
    pays_depart, ville_depart
  ) VALUES (
    p_citoyen_id, p_institution_id, p_date_arrivee, p_date_depart, '00:00', p_objet, 'nouveau',
    p_pour_autre, p_nom_autre, p_phone_autre, p_confirmation_code,
    p_champs_complementaires_reponses, 1440, p_description_besoin, p_provenance,
    p_pays_depart, p_ville_depart
  )
  RETURNING id INTO v_new_rdv_id;

  RETURN v_new_rdv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserver_chambre_hotel FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserver_chambre_hotel(uuid, uuid, date, date, uuid, text, text, boolean, text, text, jsonb, text, text, text, text) TO authenticated;

COMMIT;
