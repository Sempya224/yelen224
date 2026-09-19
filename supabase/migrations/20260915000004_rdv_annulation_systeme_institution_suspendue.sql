-- Annulation automatique d'un RDV imminent quand l'institution est
-- suspendue (brief Bryan, 15/09/2026, suite directe de
-- 20260915000003_institution_rdv_non_traites_suspension.sql). Stratégie
-- validée par Bryan : le silence est plus risqué qu'une communication
-- honnête mais neutre (approche "US" façon DoorDash face à une commande
-- qui ne peut pas être livrée — s'excuser, ne jamais blâmer le client,
-- proposer une solution immédiate, jamais s'attarder sur la cause
-- interne). Le mot "suspendu"/"suspension" n'apparaît JAMAIS dans un
-- message citoyen.
--
-- Portée : uniquement les RDV dont la date approche pendant que
-- l'institution reste suspendue (fenêtre de 48h, pas immédiatement à la
-- suspension) — la plupart des suspensions (7j/30j) se lèvent avant la
-- date du rendez-vous, il ne faut donc rien dire tant que ce n'est pas
-- nécessaire. `rdv.statut` ('nouveau'/'en_attente' uniquement, jamais un
-- RDV déjà traité) évite de toucher un RDV déjà confirmé/terminé/annulé.
--
-- Notification in-app uniquement dans cette version — MÊME LIMITE déjà
-- acceptée sur le système de rappels RDV existant
-- (supabase/functions/rappels-rdv/index.ts, en production) : les
-- fonctions déclenchées par cron n'envoient jamais de push réel
-- (web-push tourne sur Node/Next.js, jamais importable depuis un
-- contexte SQL/Deno pur) — uniquement un insert direct dans
-- `notifications`, lu au prochain chargement de l'app. Pas une
-- régression introduite ce soir, juste la même contrainte structurelle
-- déjà présente ailleurs.
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

    -- Réservation payante jumelle éventuelle (aucun paiement réel encaissé
    -- par Yelen tant que statut='en_attente' — modèle "paiement sur place",
    -- donc 'annule' et non 'rembourse', qui suppose un encaissement réel
    -- déjà survenu).
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

SELECT cron.schedule(
  'yelen-rdv-annulation-institution-suspendue',
  '*/15 * * * *',
  $$ SELECT institution_rdv_annuler_si_imminent_et_suspendue(); $$
);

-- Vérifier : select * from cron.job where jobname = 'yelen-rdv-annulation-institution-suspendue';
-- Déclencher un test manuel immédiat : select institution_rdv_annuler_si_imminent_et_suspendue();
