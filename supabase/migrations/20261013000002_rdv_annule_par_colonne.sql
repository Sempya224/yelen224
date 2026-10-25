-- Jusqu'ici, distinguer "qui a annulé ce RDV" (citoyen / établissement /
-- système) côté fiche institution s'appuyait uniquement sur rdv_events
-- (auteur_type du dernier événement 'annulation') — fragile pour toute
-- ligne sans trace correspondante (données de test créées à la main,
-- lignes antérieures à la mise en place du traçage citoyen côté
-- app/mes-rdv/actions.ts). Résultat observé par Bryan (13/10/2026) :
-- plusieurs RDV annulés par le système (institution ECOBANKGN, tests de
-- suspension du 14-15/09/2026) retombaient sur un affichage générique
-- "Annulé — {texte brut}" au lieu d'être correctement attribués.
--
-- Colonne dédiée écrite atomiquement avec motif_annulation, aux 4 points
-- d'écriture existants (app/mes-rdv/actions.ts, rdv/statut/route.ts,
-- paid-bookings/valider/route.ts, cron de suspension ci-dessous) — source
-- unique et fiable pour toujours, ne dépend plus de rdv_events pour cette
-- distinction précise. NULL pour toute ligne déjà en base avant cette
-- migration (donnée inconnue, jamais devinée) : l'affichage continue de
-- replier sur un "Annulé" neutre dans ce cas, comme aujourd'hui.
ALTER TABLE rdv ADD COLUMN IF NOT EXISTS annule_par text
  CHECK (annule_par IN ('citoyen', 'institution', 'system'));

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
    v_message := 'Votre rendez-vous du ' || to_char(r.date_rdv, 'DD/MM/YYYY') ||
      ' à ' || to_char(r.heure_rdv, 'HH24:MI') || ' chez ' || r.institution_nom ||
      ' a été annulé — ce n''est pas lié à vous. Vous pouvez réserver un nouveau créneau dès maintenant.';

    UPDATE rdv
    SET statut = 'annule', motif_annulation = v_message, annule_par = 'system'
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
      'Rendez-vous annulé',
      v_message,
      false
    );
  END LOOP;
END;
$$;
