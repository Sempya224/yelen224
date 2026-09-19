-- Correctif condition de course (TOCTOU) sur la capacité des créneaux RDV,
-- trouvé en revue critique du 15/09/2026. Avant : app/rdv/[id]/actions.ts
-- comptait rdv+paid_bookings existants pour un créneau, comparait à
-- institutions.capacite_par_creneau (simple colonne integer, aucun trigger/
-- contrainte, migration 20260720000005), puis insérait séparément — deux
-- réservations concurrentes sur le même dernier créneau pouvaient toutes les
-- deux passer le comptage avant qu'aucune n'ait inséré, causant une
-- surréservation silencieuse.
--
-- Cette fonction rend le comptage + l'insertion atomiques via un verrou
-- consultatif (pg_advisory_xact_lock) scopé au triplet
-- institution_id/date_rdv/heure_rdv, relâché automatiquement à la fin de la
-- transaction (PostgREST exécute chaque appel RPC dans sa propre
-- transaction). Volontairement SANS "SECURITY DEFINER" : la fonction
-- s'exécute avec les droits de l'appelant (citoyen authentifié), donc les
-- policies RLS existantes sur `rdv` (ownership auth.uid()=citoyen_id,
-- restriction no-show de citoyen_rdv_restrictions,
-- migration 20260903000001) continuent de s'appliquer exactement comme sur
-- un insert direct — rien n'est contourné, uniquement la fenêtre de course
-- sur la capacité est fermée.
--
-- date_rdv/heure_rdv acceptés en text et comparés/insérés tels quels
-- (comme le fait déjà le code JS existant, qui n'est lui-même pas certain du
-- type exact de heure_rdv — voir commentaire dans actions.ts) : évite de
-- deviner un type de colonne non confirmé, Postgres applique le cast
-- d'assignation approprié à l'insertion si la colonne est déjà typée
-- date/time.
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
    p_citoyen_id, p_institution_id, p_date_rdv, p_heure_rdv, p_objet, 'nouveau',
    p_pour_autre, p_nom_autre, p_phone_autre, p_qr_token,
    p_champs_complementaires_reponses, p_duree_minutes, p_description_besoin, p_provenance
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserver_creneau_rdv FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserver_creneau_rdv(uuid, text, text, uuid, text, boolean, text, text, text, jsonb, integer, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Trouvaille distincte, même revue critique du 15/09/2026 : le flux
-- PAYANT (app/rdv/[id]/page.tsx, service payant) n'a jamais appelé
-- validerCreneauServeur()/createRdv() — il insère directement depuis le
-- navigateur dans paid_bookings PUIS rdv (session Supabase Auth du
-- citoyen). Les seules policies RLS en jeu (paid_bookings_citoyen_insert,
-- rdv_citoyen_insert, migration 20260720000004) ne vérifient que
-- auth.uid()=citoyen_id — AUCUNE vérification d'institution
-- existante/validée, AUCUNE vérification que le créneau correspond aux
-- disponibilités réelles, AUCUNE vérification de capacité. Plus grave que
-- la condition de course ci-dessus : ici il n'y a même pas de contrôle
-- racy, juste aucun contrôle du tout. Un citoyen authentifié pouvait
-- réserver n'importe quel créneau (y compris hors capacité, hors
-- disponibilités, pour une institution suspendue) simplement en appelant
-- l'insert directement. Les deux inserts (paid_bookings puis rdv)
-- n'étaient de plus pas atomiques entre eux : un échec du second après
-- succès du premier laissait un paid_booking orphelin sans rdv jumeau.
--
-- reserver_creneau_rdv_payant() ferme les deux problèmes : même verrou de
-- créneau que reserver_creneau_rdv, vérifie en plus que le service payant
-- appartient bien à l'institution ciblée et est actif, puis insère
-- paid_bookings ET rdv dans la même transaction (tout ou rien). Le
-- contrôle "institution validée" et "créneau dans les disponibilités"
-- reste côté JS (validerCreneauServeur(), déjà réutilisée par le nouveau
-- Server Action côté citoyen) — logique non triviale à reproduire en SQL,
-- même choix que pour reserver_creneau_rdv ci-dessus. Toujours sans
-- SECURITY DEFINER : RLS s'applique normalement aux deux inserts.
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
    p_service_id, p_citoyen_id, p_institution_id, p_date_rdv, p_heure_rdv,
    p_confirmation_code, 'en_attente', p_champs_complementaires_reponses, p_provenance
  );

  INSERT INTO rdv (
    citoyen_id, institution_id, date_rdv, heure_rdv, objet, statut,
    pour_autre, nom_autre, phone_autre, qr_token,
    champs_complementaires_reponses, duree_minutes, description_besoin, provenance
  ) VALUES (
    p_citoyen_id, p_institution_id, p_date_rdv, p_heure_rdv, p_objet, 'nouveau',
    p_pour_autre, p_nom_autre, p_phone_autre, p_confirmation_code,
    p_champs_complementaires_reponses, p_duree_minutes, p_description_besoin, p_provenance
  )
  RETURNING id INTO v_new_rdv_id;

  RETURN v_new_rdv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserver_creneau_rdv_payant FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserver_creneau_rdv_payant(uuid, uuid, text, text, uuid, text, text, boolean, text, text, jsonb, integer, text, text) TO authenticated;
