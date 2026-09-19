-- Correctif d'un vrai bug trouvé en testant (15/09/2026, même soir,
-- suite de 20260915000005) : la version précédente de la fonction avait
-- retiré la borne "encore à venir" (`> now()`) pour couvrir aussi les RDV
-- déjà passés — mais ça lui a fait écraser un RDV DÉJÀ passé en "non
-- traité" (accepté par l'institution le 14/09 à 04:22, jamais honoré
-- après, affiché "Non honoré" au citoyen) en "Annulé par le système".
--
-- Principe corrigé (Bryan, 15/09/2026) : "non traité" est un état déjà
-- établi et compréhensible pour le citoyen — jamais réécrit après coup.
-- Cette fonction ne doit agir QUE AVANT ce basculement (RDV encore à
-- venir, `> now()`), jamais après. Un RDV `nouveau`/`en_attente` déjà
-- passé son heure + 30 min de grâce (lib/rdvGating.ts::MINUTES_GRACE_NON_TRAITE)
-- relève exclusivement du système "non traité"
-- (institution_rdv_marquer_et_evaluer, migration 20260915000003),
-- jamais de celui-ci.
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

-- Réparation de la donnée de test faussée par le bug ci-dessus (RDV du
-- 14/09/2026 06:30, ECOBNAKGN, "Ouverture de compte" pour Oumou Barry) —
-- remis dans son état "non traité" réel (en_attente), motif d'annulation
-- effacé. La ligne rdv_events/notifications erronée reste en base sans
-- effet visible une fois le statut corrigé (le détail RDV ne montre
-- l'étape "Annulé" que si rdv.statut IN ('annule','refuse')) — laissée
-- telle quelle plutôt que supprimée (compte de test, aucun intérêt à
-- toucher un historique d'audit pour ça).
UPDATE rdv
SET statut = 'en_attente', motif_annulation = NULL
WHERE id = 'f8294c34-9d53-4921-90bc-17b705b78232'
  AND statut = 'annule';
