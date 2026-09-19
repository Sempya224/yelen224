-- Deux bugs réels trouvés en testant en conditions réelles (15/09/2026,
-- même soir, suite de 20260915000004).

-- 1) La fonction d'annulation ne ciblait que les RDV encore À VENIR
-- (`> now()`), jamais ceux déjà passés sans réponse de l'institution.
-- Trouvaille de Bryan : un RDV `nouveau` de 07:00 le matin même, jamais
-- traité par ECOBNAKGN (déjà suspendue), restait affiché "Non confirmé"
-- indéfiniment dans "Mes réservations" — aucun mécanisme ne le
-- résolvait. Correction : suppression de la borne basse `> now()`, ne
-- reste que la borne haute (`< now() + 48h`) — couvre maintenant à la
-- fois les RDV encore à venir dans les 48h ET ceux déjà passés sans
-- réponse (qui n'ont plus aucune raison d'attendre, l'institution ne
-- peut de toute façon plus agir tant qu'elle reste suspendue, voir
-- app/api/institution/rdv/statut/route.ts).
CREATE OR REPLACE FUNCTION institution_rdv_annuler_si_imminent_et_suspendue() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_paid_booking_id uuid;
  v_message text;
BEGIN
  FOR r IN
    SELECT rdv.id, rdv.citoyen_id, rdv.institution_id, rdv.date_rdv, rdv.heure_rdv, rdv.statut,
           inst.name AS institution_nom, u.prenom AS citoyen_prenom, u.nom AS citoyen_nom
    FROM rdv
    JOIN institutions inst ON inst.id = rdv.institution_id
    JOIN users u ON u.id = rdv.citoyen_id
    WHERE inst.statut = 'suspendue'
      AND rdv.statut IN ('nouveau', 'en_attente')
      AND (rdv.date_rdv + rdv.heure_rdv) < now() + interval '48 hours'
  LOOP
    v_message := 'Nous sommes désolés, votre rendez-vous du ' || to_char(r.date_rdv, 'DD/MM/YYYY') ||
      ' à ' || to_char(r.heure_rdv, 'HH24:MI') || ' chez ' || r.institution_nom ||
      ' a dû être annulé. Nous en sommes sincèrement navrés pour la gêne occasionnée.';

    UPDATE rdv
    SET statut = 'annule', motif_annulation = v_message
    WHERE id = r.id;

    SELECT id INTO v_paid_booking_id
    FROM paid_bookings
    WHERE institution_id = r.institution_id AND citoyen_id = r.citoyen_id
      AND date_rdv = r.date_rdv AND heure_rdv = r.heure_rdv AND statut = 'en_attente'
    LIMIT 1;
    IF v_paid_booking_id IS NOT NULL THEN
      UPDATE paid_bookings SET statut = 'annule' WHERE id = v_paid_booking_id;
    END IF;

    INSERT INTO rdv_events (rdv_id, auteur_id, auteur_type, action, ancien_statut, nouveau_statut, motif)
    VALUES (r.id, 'system', 'system', 'annulation', r.statut, 'annule', v_message);

    INSERT INTO notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu)
    VALUES (
      r.citoyen_id, 'citoyen', r.id, 'rdv_annule_systeme',
      'Votre rendez-vous',
      v_message || ' Vous pouvez retrouver un établissement disponible à proximité, ou contacter notre support si vous avez besoin d''aide.',
      false
    );
  END LOOP;
END;
$$;

-- 2) `institutions_public_read` (migration 20260709000014) ne permet la
-- lecture que si `statut='validee'` — dès qu'une institution passe
-- `suspendue`, son nom/logo/etc. deviennent invisibles même pour un
-- citoyen qui a un VRAI rendez-vous avec elle (app/mes-rdv/page.tsx
-- interroge `rdv` avec un join `institutions!rdv_institution_id_fkey`
-- via le client du navigateur, donc soumis à RLS) — trouvaille de Bryan,
-- le nom/logo disparaissaient purement et simplement dans "Mes
-- réservations". Policy additive (RLS combine plusieurs policies
-- permissives en OR) — n'affaiblit jamais `institutions_public_read`
-- existante, ajoute seulement : un citoyen authentifié peut lire une
-- institution s'il a au moins un `rdv` réel avec elle, quel que soit le
-- statut actuel de cette institution. Portée volontairement limitée à
-- `rdv` (pas `paid_bookings`) : cette dernière n'a pas de policy SELECT
-- citoyen directe consommée par une lecture jointe équivalente
-- aujourd'hui — à étendre si un cas similaire est trouvé plus tard.
CREATE POLICY institutions_read_via_own_rdv ON institutions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rdv WHERE rdv.institution_id = institutions.id AND rdv.citoyen_id = auth.uid()
    )
  );
