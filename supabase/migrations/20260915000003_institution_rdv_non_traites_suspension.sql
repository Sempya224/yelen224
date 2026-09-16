-- Suspension automatique institution — RDV non traités (brief Bryan,
-- 15/09/2026), même soir que le correctif de réservation atomique. Paliers
-- demandés : 3 RDV non traités / 30 jours glissants -> suspension 7 jours ;
-- 5 -> 30 jours ; 10 -> suspension indéfinie (jusqu'à révision admin).
--
-- Réutilise le mécanisme "Espace suspendu v2" DÉJÀ EN PRODUCTION
-- (institution_suspensions/institution_suspension_revisions, migration
-- 20260817000001) plutôt que de dupliquer un système parallèle : Bryan a
-- dit "compte bloqué" (pas "réservations bloquées" comme le modèle
-- citoyen, volontairement plus étroit — voir citoyen_rdv_restrictions,
-- 20260903000001) — le blocage de compte entier
-- (institutions.statut='suspendue', écran CompteSuspenduScreen) est
-- exactement le comportement déjà construit pour ce système. Conséquence
-- directe : la révision/appel institution (déjà construite,
-- app/api/institution/suspension/revision) et l'auto-réactivation horaire
-- déjà déployée (supabase/functions/institution-suspension-autoreactivate)
-- fonctionnent sur ces nouvelles suspensions SANS aucun code
-- supplémentaire — seule la détection (ce fichier) est nouvelle.
--
-- "Non traité" n'est PAS un événement d'écriture discret (contrairement à
-- presence_status='absent' côté citoyen) : c'est un état qui apparaît par
-- simple écoulement du temps (lib/rdvGating.ts::rdvNonTraite(), 30 min de
-- grâce après l'heure prévue). Impossible donc de déclencher sur un
-- UPDATE — un job périodique (pg_cron, 15 min, même cadence que
-- clock-in-daily-attendance) marque les RDV qui viennent de franchir ce
-- seuil, une seule fois, de façon permanente (même principe que
-- presence_status='absent' : un RDV traité tardivement continue de compter
-- dans l'historique de l'institution). Contrairement à
-- citoyen-rdv-restriction-autoreactivate, AUCUNE fonction Edge à déployer :
-- toute la logique (marquage + évaluation) est en SQL pur, pas de push
-- notification temps réel dans cette première version (insert direct dans
-- `notifications`, lu au prochain chargement du dashboard).
--
-- Hypothèse assumée (déjà documentée ailleurs dans le projet, ex.
-- clock-in-daily-attendance) : Guinée = UTC+0 toute l'année, `date_rdv +
-- heure_rdv` (timestamp) comparé directement à now() (timestamptz).

-- 1) Marqueur permanent sur `rdv` — jamais recalculé après coup.
ALTER TABLE rdv ADD COLUMN IF NOT EXISTS non_traite_marque_le timestamptz;

-- 2) Distingue une suspension automatique (ce chantier) d'une suspension
-- manuelle admin — nécessaire pour tracer l'escalade (palier déjà atteint)
-- sans jamais toucher à une suspension admin sans rapport. Toutes les
-- lignes existantes (suspensions déjà appliquées manuellement) reçoivent
-- 'admin' par défaut, comportement inchangé.
ALTER TABLE institution_suspensions ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'admin'
  CHECK (origine IN ('admin', 'auto_rdv_non_traites'));

-- 3) Évalue et, si nécessaire, escalade la suspension d'UNE institution —
-- même structure de calcul que citoyen_rdv_evaluer_restriction
-- (20260903000001) : checkpoint sur la dernière révision acceptée,
-- comptage borné, palier le plus sévère déjà atteint depuis ce checkpoint.
CREATE OR REPLACE FUNCTION institution_rdv_evaluer_restriction(p_institution_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  checkpoint_le      timestamptz;
  total_non_traites  integer;
  palier_cible       text;
  rang_cible         integer;
  rang_max_atteint   integer;
  v_duree_jours      integer;
  v_jusqu_au         timestamptz;
  v_motif            text;
BEGIN
  -- Dernière révision acceptée par un admin sur une clôture indéfinie
  -- (jusqu_au IS NULL) d'origine auto_rdv_non_traites de cette institution.
  SELECT r.decision_le INTO checkpoint_le
  FROM institution_suspension_revisions r
  JOIN institution_suspensions s ON s.id = r.suspension_id
  WHERE s.institution_id = p_institution_id
    AND s.origine = 'auto_rdv_non_traites'
    AND s.jusqu_au IS NULL
    AND r.statut = 'acceptee'
  ORDER BY r.decision_le DESC
  LIMIT 1;

  -- Fenêtre glissante de 30 jours (demande explicite de Bryan, différent du
  -- modèle citoyen qui compte à vie depuis le dernier checkpoint).
  SELECT count(*) INTO total_non_traites
  FROM rdv
  WHERE institution_id = p_institution_id
    AND non_traite_marque_le IS NOT NULL
    AND non_traite_marque_le > now() - interval '30 days'
    AND (checkpoint_le IS NULL OR non_traite_marque_le > checkpoint_le);

  palier_cible := CASE
    WHEN total_non_traites >= 10 THEN 'clos'
    WHEN total_non_traites >= 5  THEN 'restreint_30j'
    WHEN total_non_traites >= 3  THEN 'restreint_7j'
    ELSE NULL
  END;
  IF palier_cible IS NULL THEN RETURN; END IF;

  rang_cible := CASE palier_cible WHEN 'restreint_7j' THEN 1 WHEN 'restreint_30j' THEN 2 WHEN 'clos' THEN 3 END;

  -- Palier le plus sévère déjà atteint depuis le checkpoint, parmi les
  -- suspensions d'origine auto_rdv_non_traites SEULEMENT — une suspension
  -- admin sans rapport ne doit jamais influencer cette escalade.
  SELECT COALESCE(MAX(CASE
    WHEN s.jusqu_au IS NULL THEN 3
    WHEN s.duree_jours = 30 THEN 2
    WHEN s.duree_jours = 7 THEN 1
    ELSE 0
  END), 0)
  INTO rang_max_atteint
  FROM institution_suspensions s
  WHERE s.institution_id = p_institution_id
    AND s.origine = 'auto_rdv_non_traites'
    AND (checkpoint_le IS NULL OR s.created_at > checkpoint_le);

  IF rang_cible <= rang_max_atteint THEN RETURN; END IF;

  -- Lève toute suspension active d'origine auto_rdv_non_traites (supplantée
  -- par l'escalade) — jamais une suspension admin manuelle, qui reste sous
  -- le contrôle exclusif d'un admin.
  UPDATE institution_suspensions
  SET statut = 'levee', levee_par = 'auto', levee_le = now()
  WHERE institution_id = p_institution_id AND statut = 'active' AND origine = 'auto_rdv_non_traites';

  -- Garde-fou : si une suspension active existe encore (admin, sans
  -- rapport), ne jamais insérer une seconde ligne active en parallèle —
  -- l'institution est déjà bloquée, la décision admin prévaut.
  IF EXISTS (SELECT 1 FROM institution_suspensions WHERE institution_id = p_institution_id AND statut = 'active') THEN
    RETURN;
  END IF;

  v_duree_jours := CASE palier_cible WHEN 'restreint_7j' THEN 7 WHEN 'restreint_30j' THEN 30 ELSE NULL END;
  v_jusqu_au := CASE palier_cible
    WHEN 'restreint_7j' THEN now() + interval '7 days'
    WHEN 'restreint_30j' THEN now() + interval '30 days'
    ELSE NULL
  END;
  v_motif := total_non_traites || ' rendez-vous non traités (ni confirmés, ni refusés, ni marqués absents dans les 30 minutes suivant l''heure prévue) au cours des 30 derniers jours.';

  UPDATE institutions SET statut = 'suspendue' WHERE id = p_institution_id;

  INSERT INTO institution_suspensions (institution_id, motif, duree_jours, jusqu_au, origine)
  VALUES (p_institution_id, v_motif, v_duree_jours, v_jusqu_au, 'auto_rdv_non_traites');

  INSERT INTO notifications (destinataire_id, destinataire_type, rdv_id, type, titre, message, lu)
  VALUES (
    p_institution_id, 'institution', NULL, 'institution_suspendue_rdv_non_traites',
    'Suspension automatique de votre établissement',
    'Votre établissement a été suspendu automatiquement suite à ' || total_non_traites ||
    ' rendez-vous non traités au cours des 30 derniers jours. ' ||
    CASE
      WHEN v_jusqu_au IS NOT NULL THEN 'Réactivation automatique le ' || to_char(v_jusqu_au, 'DD/MM/YYYY') || '.'
      ELSE 'Cette suspension est indéfinie — une révision peut être demandée depuis votre espace.'
    END,
    false
  );
END;
$$;

-- 4) Job périodique — marque les RDV fraîchement non traités puis
-- réévalue chaque institution concernée. Fenêtre de marquage large (20
-- min) par rapport à la cadence du cron (15 min) : marge de sécurité si
-- une exécution est manquée.
CREATE OR REPLACE FUNCTION institution_rdv_marquer_et_evaluer() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  UPDATE rdv
  SET non_traite_marque_le = now()
  WHERE non_traite_marque_le IS NULL
    AND (statut = 'nouveau' OR (statut = 'en_attente' AND presence_status IS DISTINCT FROM 'absent'))
    AND (date_rdv + heure_rdv + interval '30 minutes') < now();

  FOR r IN
    SELECT DISTINCT institution_id FROM rdv
    WHERE non_traite_marque_le IS NOT NULL
      AND non_traite_marque_le > now() - interval '20 minutes'
  LOOP
    PERFORM institution_rdv_evaluer_restriction(r.institution_id);
  END LOOP;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'yelen-institution-rdv-non-traites-evaluer',
  '*/15 * * * *',
  $$ SELECT institution_rdv_marquer_et_evaluer(); $$
);

-- Vérifier : select * from cron.job where jobname = 'yelen-institution-rdv-non-traites-evaluer';
-- Historique : select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'yelen-institution-rdv-non-traites-evaluer') order by start_time desc limit 20;
-- Désactiver temporairement : select cron.unschedule('yelen-institution-rdv-non-traites-evaluer');
-- Déclencher un test manuel immédiat : select institution_rdv_marquer_et_evaluer();
