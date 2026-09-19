-- Refonte du ton du message d'annulation système (brief Bryan 15/09/2026,
-- retour détaillé façon DoorDash : "problème clair → contexte précis →
-- solution immédiate → humain disponible si nécessaire"). Remplace le
-- titre générique "Votre rendez-vous" et le ton plus administratif
-- ("Nous en sommes sincèrement navrés pour la gêne occasionnée") par une
-- version plus courte et humaine. Le CTA de résolution ("Trouver un
-- nouveau rendez-vous") et le CTA secondaire ("Besoin d'aide ?") vivent
-- désormais dans l'UI (lib/notificationContent.tsx), plus besoin de les
-- épeler dans le texte du message lui-même — évite la redondance.
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
      AND (rdv.date_rdv + rdv.heure_rdv) > now()
      AND (rdv.date_rdv + rdv.heure_rdv) < now() + interval '48 hours'
  LOOP
    v_message := 'Nous sommes désolés pour ce changement. Votre rendez-vous du ' || to_char(r.date_rdv, 'DD/MM/YYYY') ||
      ' à ' || to_char(r.heure_rdv, 'HH24:MI') || ' chez ' || r.institution_nom ||
      ' ne pourra finalement pas avoir lieu. Vous pouvez dès maintenant rechercher une nouvelle disponibilité.';

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
      'Votre rendez-vous a été annulé',
      v_message,
      false
    );
  END LOOP;
END;
$$;
