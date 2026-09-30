-- Vraie réservation hôtel (25/09/2026) — les citoyens ne pouvaient
-- réserver aucune chambre : le wizard exige un créneau (date, heure) tiré
-- de institutions.disponibilites (lib/disponibilites.ts), mais
-- DisponibilitesTab.tsx bloque volontairement cet écran pour tout hôtel
-- ("Ne s'applique pas à votre établissement") — disponibilites reste donc
-- toujours vide, tous les jours du calendrier citoyen sont désactivés.
-- Décision Bryan 25/09/2026 : construire une vraie disponibilité par
-- chambre (dates d'arrivée/départ, inventaire par type de chambre) plutôt
-- qu'un simple contournement — l'hôtellerie est une réservation de séjour,
-- pas un rendez-vous ponctuel. S'appuie sur paid_services.nombre_unites
-- (migration 20260917000001, "combien de chambres de ce type"), posée à
-- l'époque explicitement en prévision de ce chantier.
--
-- Portée strictement limitée aux chambres (paid_services.est_chambre =
-- true) — les prestations hôtelières non-chambre et les 14 autres
-- secteurs gardent le système de créneaux horaires existant, totalement
-- inchangé (reserver_creneau_rdv / reserver_creneau_rdv_payant intacts).
BEGIN;

-- date_depart nullable et additive : jamais lue/écrite hors chambres
-- hôtel. CHECK universel (vaut aussi pour les lignes NULL, donc aucun
-- impact sur les 14 autres secteurs qui ne renseignent jamais cette
-- colonne).
ALTER TABLE rdv
  ADD COLUMN date_depart date NULL
    CHECK (date_depart IS NULL OR date_depart > date_rdv);

ALTER TABLE paid_bookings
  ADD COLUMN date_depart date NULL
    CHECK (date_depart IS NULL OR date_depart > date_rdv);

-- Réservation atomique d'une chambre sur une plage [p_date_arrivee,
-- p_date_depart). Même discipline anti-course que reserver_creneau_rdv_payant
-- (migration 20260915000001) : verrou consultatif (ici scopé au type de
-- chambre — hashtext(p_service_id) — puisque l'invariant à protéger ne
-- dépend que des autres réservations du même service_id, pas d'une
-- combinaison date+heure), comptage + insertion dans la même transaction.
-- Chevauchement de plages : une réservation existante [date_rdv,
-- date_depart) chevauche [p_date_arrivee, p_date_depart) ssi
-- date_rdv < p_date_depart ET COALESCE(date_depart, date_rdv+1) > p_date_arrivee
-- (COALESCE défensif : aucune ligne chambre ne devrait avoir date_depart
-- NULL vu ce chemin de réservation, mais évite une comparaison NULL
-- silencieusement fausse si jamais une ligne legacy existait). Comptage
-- sur paid_bookings SEUL (pas d'UNION avec rdv, contrairement à
-- reserver_creneau_rdv_payant) : rdv ne stocke aucun service_id — chaque
-- réservation de chambre insère toujours le couple paid_bookings+rdv dans
-- la même transaction ici, donc paid_bookings.service_id est déjà la
-- source complète et exacte pour ce type de chambre.
-- Volontairement SANS SECURITY DEFINER : RLS de l'appelant (citoyen
-- authentifié) s'applique normalement aux deux inserts, comme les
-- fonctions existantes.
CREATE OR REPLACE FUNCTION public.reserver_chambre_hotel(
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
  p_provenance text
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
    confirmation_code, statut, champs_complementaires_reponses, provenance
  ) VALUES (
    p_service_id, p_citoyen_id, p_institution_id, p_date_arrivee, p_date_depart, '00:00',
    p_confirmation_code, 'en_attente', p_champs_complementaires_reponses, p_provenance
  );

  INSERT INTO rdv (
    citoyen_id, institution_id, date_rdv, date_depart, heure_rdv, objet, statut,
    pour_autre, nom_autre, phone_autre, qr_token,
    champs_complementaires_reponses, duree_minutes, description_besoin, provenance
  ) VALUES (
    p_citoyen_id, p_institution_id, p_date_arrivee, p_date_depart, '00:00', p_objet, 'nouveau',
    p_pour_autre, p_nom_autre, p_phone_autre, p_confirmation_code,
    p_champs_complementaires_reponses, 1440, p_description_besoin, p_provenance
  )
  RETURNING id INTO v_new_rdv_id;

  RETURN v_new_rdv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserver_chambre_hotel FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserver_chambre_hotel(uuid, uuid, date, date, uuid, text, text, boolean, text, text, jsonb, text, text) TO authenticated;

COMMIT;
