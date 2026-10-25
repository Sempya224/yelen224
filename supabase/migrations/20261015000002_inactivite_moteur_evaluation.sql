-- Comptes inactifs — moteur de détection/escalade J30/J60/J90 (Phase 3).
-- 100% SQL pur, AUCUNE Edge Function requise ici — contrairement aux
-- suspensions disciplinaires existantes (dont la réactivation dépend du
-- temps écoulé, jusqu_au, et nécessite donc un cron de réactivation), la
-- réactivation de ce chantier est événementielle (déclenchée par le code
-- applicatif à la connexion/action qualifiante, voir
-- lib/activiteCitoyenne.ts/lib/activiteInstitution.ts, Phase 3 suite) —
-- même précédent que institution_rdv_non_traites_suspension
-- (20260915000003), qui n'a elle non plus jamais eu besoin d'Edge
-- Function pour la détection. La condition CEO "déployer l'Edge Function
-- avant de programmer le cron" ne s'applique donc pas à cette migration.
--
-- Idempotent par construction (relit l'état réel à chaque passage, ne
-- déclenche jamais deux fois le même effet grâce aux marqueurs
-- inactivite_j30/j60_notifie_le et à la vérification "déjà suspendu").
-- Mode observation : tant que inactivite_mode.notifications_actives/
-- suspensions_actives restent à false (valeur par défaut posée par la
-- migration précédente), ce cron tourne et alimente
-- inactivite_observation_log SANS jamais écrire dans `notifications`,
-- `citoyen_inactivite_suspensions`, `institution_suspensions` ni modifier
-- `institutions.statut`.

CREATE OR REPLACE FUNCTION yelen_salutation(p_nom text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE h integer := EXTRACT(HOUR FROM now());
BEGIN
  IF h < 6 THEN RETURN 'Bonne nuit, ' || COALESCE(p_nom, 'cher utilisateur');
  ELSIF h < 12 THEN RETURN 'Bonjour, ' || COALESCE(p_nom, 'cher utilisateur');
  ELSIF h < 18 THEN RETURN 'Bon après-midi, ' || COALESCE(p_nom, 'cher utilisateur');
  ELSE RETURN 'Bonsoir, ' || COALESCE(p_nom, 'cher utilisateur');
  END IF;
END;
$$;

-- ═══════════════════════════ CITOYEN ═══════════════════════════

CREATE OR REPLACE FUNCTION citoyen_inactivite_notifier(
  p_citoyen_id uuid, p_prenom text, p_evenement text, p_derniere_activite timestamptz, p_actif boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_message text;
BEGIN
  INSERT INTO inactivite_observation_log (acteur_type, acteur_id, evenement, derniere_activite_calculee, effet_reel_applique)
  VALUES ('citoyen', p_citoyen_id, p_evenement, p_derniere_activite, p_actif);

  IF NOT p_actif THEN RETURN; END IF;

  IF p_evenement = 'rappel_j30' THEN
    UPDATE users SET inactivite_j30_notifie_le = now() WHERE id = p_citoyen_id;
    v_message := 'Cela fait un moment que vous n''êtes pas passé sur Yelen. Vos rendez-vous, documents et données restent intacts — revenez quand vous voulez.';
  ELSE
    UPDATE users SET inactivite_j60_notifie_le = now() WHERE id = p_citoyen_id;
    v_message := 'Sans connexion ni activité d''ici quelques semaines, votre compte sera mis en pause temporairement par mesure de sécurité. Une simple connexion suffit à l''éviter.';
  END IF;

  INSERT INTO notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu)
  VALUES (p_citoyen_id, 'citoyen', NULL, 'citoyen_inactivite_' || p_evenement, yelen_salutation(p_prenom), v_message, false);
END;
$$;

CREATE OR REPLACE FUNCTION citoyen_inactivite_suspendre(
  p_citoyen_id uuid, p_prenom text, p_derniere_activite timestamptz, p_actif boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_motif text;
BEGIN
  INSERT INTO inactivite_observation_log (acteur_type, acteur_id, evenement, derniere_activite_calculee, effet_reel_applique)
  VALUES ('citoyen', p_citoyen_id, 'suspension_j90', p_derniere_activite, p_actif);

  IF NOT p_actif THEN RETURN; END IF;

  v_motif := 'Aucune connexion ni action depuis le ' || to_char(p_derniere_activite, 'DD/MM/YYYY') || ' (90 jours d''inactivité).';

  INSERT INTO citoyen_inactivite_suspensions (citoyen_id, motif) VALUES (p_citoyen_id, v_motif);

  -- Aucune colonne statut ajoutée sur `users` (même principe que
  -- citoyen_rdv_restrictions) : l'état "suspendu pour inactivité" est
  -- entièrement dérivé de la présence d'une ligne active ici, jamais
  -- dupliqué.
  INSERT INTO notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu)
  VALUES (
    p_citoyen_id, 'citoyen', NULL, 'citoyen_inactivite_suspension',
    yelen_salutation(p_prenom),
    'Votre compte Yelen a été mis en pause après 90 jours sans connexion ni activité. Vos rendez-vous, documents et données sont intacts. Reconnectez-vous pour réactiver votre compte immédiatement.',
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION citoyen_inactivite_evaluer() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_derniere_activite timestamptz;
  v_jours_inactif integer;
  v_mode RECORD;
  v_deja_suspendu boolean;
BEGIN
  SELECT * INTO v_mode FROM inactivite_mode WHERE id = 1;

  FOR r IN
    SELECT u.id, u.prenom, u.created_at, u.derniere_action_qualifiante_le,
           u.inactivite_j30_notifie_le, u.inactivite_j60_notifie_le,
           au.last_sign_in_at
    FROM users u
    LEFT JOIN auth.users au ON au.id = u.id
  LOOP
    v_derniere_activite := GREATEST(
      COALESCE(r.last_sign_in_at, r.created_at),
      COALESCE(r.derniere_action_qualifiante_le, r.created_at),
      r.created_at
    );
    v_jours_inactif := EXTRACT(DAY FROM (now() - v_derniere_activite));

    SELECT EXISTS(
      SELECT 1 FROM citoyen_inactivite_suspensions WHERE citoyen_id = r.id AND statut = 'active'
    ) INTO v_deja_suspendu;
    IF v_deja_suspendu THEN CONTINUE; END IF;

    IF v_jours_inactif < 30 THEN
      -- Rattrapage défensif : la réactivation applicative (2.6) efface déjà
      -- ces marqueurs en temps réel, ce cron ne fait que confirmer qu'ils
      -- sont cohérents avec l'activité réellement observée.
      IF r.inactivite_j30_notifie_le IS NOT NULL OR r.inactivite_j60_notifie_le IS NOT NULL THEN
        UPDATE users SET inactivite_j30_notifie_le = NULL, inactivite_j60_notifie_le = NULL WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    IF v_jours_inactif >= 90 THEN
      PERFORM citoyen_inactivite_suspendre(r.id, r.prenom, v_derniere_activite, v_mode.suspensions_actives);
    ELSIF v_jours_inactif >= 60 AND r.inactivite_j60_notifie_le IS NULL THEN
      PERFORM citoyen_inactivite_notifier(r.id, r.prenom, 'avertissement_j60', v_derniere_activite, v_mode.notifications_actives);
    ELSIF v_jours_inactif >= 30 AND r.inactivite_j30_notifie_le IS NULL THEN
      PERFORM citoyen_inactivite_notifier(r.id, r.prenom, 'rappel_j30', v_derniere_activite, v_mode.notifications_actives);
    END IF;
  END LOOP;
END;
$$;

-- ═══════════════════════════ YELEN BUSINESS ═══════════════════════════

CREATE OR REPLACE FUNCTION institution_inactivite_notifier(
  p_institution_id uuid, p_nom text, p_evenement text, p_derniere_activite timestamptz, p_actif boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_message text;
BEGIN
  INSERT INTO inactivite_observation_log (acteur_type, acteur_id, evenement, derniere_activite_calculee, effet_reel_applique)
  VALUES ('institution', p_institution_id, p_evenement, p_derniere_activite, p_actif);

  IF NOT p_actif THEN RETURN; END IF;

  IF p_evenement = 'rappel_j30' THEN
    UPDATE institutions SET inactivite_j30_notifie_le = now() WHERE id = p_institution_id;
    v_message := 'Aucune connexion ni action détectée sur votre espace Yelen Business depuis plusieurs semaines. Vos données, rendez-vous et paiements restent intacts.';
  ELSE
    UPDATE institutions SET inactivite_j60_notifie_le = now() WHERE id = p_institution_id;
    v_message := 'Sans connexion ni action d''ici quelques semaines, votre établissement sera suspendu temporairement par mesure de sécurité. Une simple connexion d''un membre de votre équipe suffit à l''éviter.';
  END IF;

  INSERT INTO notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu)
  VALUES (p_institution_id, 'institution', NULL, 'institution_inactivite_' || p_evenement, yelen_salutation(p_nom), v_message, false);
END;
$$;

CREATE OR REPLACE FUNCTION institution_inactivite_suspendre(
  p_institution_id uuid, p_nom text, p_derniere_activite timestamptz, p_actif boolean
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_motif text;
BEGIN
  INSERT INTO inactivite_observation_log (acteur_type, acteur_id, evenement, derniere_activite_calculee, effet_reel_applique)
  VALUES ('institution', p_institution_id, 'suspension_j90', p_derniere_activite, p_actif);

  IF NOT p_actif THEN RETURN; END IF;

  v_motif := 'Aucune connexion d''un membre actif ni action depuis le ' || to_char(p_derniere_activite, 'DD/MM/YYYY') || ' (90 jours d''inactivité).';

  -- Réutilise intégralement le moteur "Espace suspendu v2" déjà en prod
  -- (institution_suspensions, origine='auto_inactivite' ajoutée par la
  -- migration précédente) — récupère gratuitement CompteSuspenduScreen,
  -- ALLOWED_TABS_SUSPENDU et le système de révision déjà construit.
  UPDATE institutions SET statut = 'suspendue' WHERE id = p_institution_id;
  INSERT INTO institution_suspensions (institution_id, motif, origine) VALUES (p_institution_id, v_motif, 'auto_inactivite');

  INSERT INTO notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu)
  VALUES (
    p_institution_id, 'institution', NULL, 'institution_inactivite_suspension',
    yelen_salutation(p_nom),
    'Votre établissement a été suspendu après 90 jours sans connexion ni action d''un membre de votre équipe. Vos rendez-vous, paiements et documents sont intacts. La connexion d''un membre actif réactive immédiatement votre espace.',
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION institution_inactivite_evaluer() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  v_derniere_connexion_membre timestamptz;
  v_derniere_activite timestamptz;
  v_jours_inactif integer;
  v_mode RECORD;
  v_deja_suspendue boolean;
BEGIN
  SELECT * INTO v_mode FROM inactivite_mode WHERE id = 1;

  -- Exclut 'en_attente' (onboarding jamais terminé, pas encore un compte
  -- opérationnel à mesurer) et 'refusee' (définitivement rejetée, une
  -- suspension n'aurait aucun sens) — hypothèse de conception, PAS une
  -- certitude produit, à confirmer explicitement par Bryan avant
  -- activation réelle (voir rapport final Phase 3).
  FOR r IN
    SELECT i.id, i.name, i.created_at, i.derniere_action_qualifiante_le,
           i.inactivite_j30_notifie_le, i.inactivite_j60_notifie_le
    FROM institutions i
    WHERE i.statut IN ('validee', 'suspendue')
  LOOP
    SELECT MAX(derniere_connexion) INTO v_derniere_connexion_membre
    FROM institution_membres WHERE institution_id = r.id AND actif = true;

    v_derniere_activite := GREATEST(
      COALESCE(v_derniere_connexion_membre, r.created_at),
      COALESCE(r.derniere_action_qualifiante_le, r.created_at),
      r.created_at
    );
    v_jours_inactif := EXTRACT(DAY FROM (now() - v_derniere_activite));

    -- Exception 2.8.1 : jamais suspendre pour inactivité un compte déjà
    -- suspendu pour une autre cause (admin / auto_rdv_non_traites) — la
    -- décision déjà prise sur ce compte prévaut.
    SELECT EXISTS(
      SELECT 1 FROM institution_suspensions WHERE institution_id = r.id AND statut = 'active'
    ) INTO v_deja_suspendue;
    IF v_deja_suspendue THEN CONTINUE; END IF;

    IF v_jours_inactif < 30 THEN
      IF r.inactivite_j30_notifie_le IS NOT NULL OR r.inactivite_j60_notifie_le IS NOT NULL THEN
        UPDATE institutions SET inactivite_j30_notifie_le = NULL, inactivite_j60_notifie_le = NULL WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    IF v_jours_inactif >= 90 THEN
      PERFORM institution_inactivite_suspendre(r.id, r.name, v_derniere_activite, v_mode.suspensions_actives);
    ELSIF v_jours_inactif >= 60 AND r.inactivite_j60_notifie_le IS NULL THEN
      PERFORM institution_inactivite_notifier(r.id, r.name, 'avertissement_j60', v_derniere_activite, v_mode.notifications_actives);
    ELSIF v_jours_inactif >= 30 AND r.inactivite_j30_notifie_le IS NULL THEN
      PERFORM institution_inactivite_notifier(r.id, r.name, 'rappel_j30', v_derniere_activite, v_mode.notifications_actives);
    END IF;
  END LOOP;
END;
$$;

-- ═══════════════════════════ CRON ═══════════════════════════
-- Quotidien (granularité jour, pas minute) — 03:00 UTC = 03:00 Guinée
-- (hypothèse déjà actée ailleurs dans le projet, UTC+0 toute l'année).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule('yelen-citoyen-inactivite-evaluer', '0 3 * * *', $$ SELECT citoyen_inactivite_evaluer(); $$);
SELECT cron.schedule('yelen-institution-inactivite-evaluer', '5 3 * * *', $$ SELECT institution_inactivite_evaluer(); $$);

-- Vérifier : select * from cron.job where jobname like 'yelen-%inactivite%';
-- Déclencher un test manuel immédiat (sans attendre 03h00) :
--   select citoyen_inactivite_evaluer();
--   select institution_inactivite_evaluer();
-- Lire le rapport d'observation :
--   select * from inactivite_observation_log order by created_at desc limit 50;
-- Désactiver temporairement : select cron.unschedule('yelen-citoyen-inactivite-evaluer');
