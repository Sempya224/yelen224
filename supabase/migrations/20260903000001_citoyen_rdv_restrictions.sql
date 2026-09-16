-- Restriction automatique des rendez-vous (no-show) — décision CEO
-- 03/09/2026. Sanction progressive ciblée UNIQUEMENT sur la fonctionnalité
-- rendez-vous (jamais un blocage global du compte citoyen) :
--   3 rdv "Absent"  -> restriction de réservation 7 jours (appel non prévu)
--   5 rdv "Absent"  -> restriction de réservation 30 jours (appel non prévu)
--   10 rdv "Absent" -> clôture définitive de l'accès aux rendez-vous, seule
--                      issue : "Faire appel"
--
-- Architecture calquée sur "Espace suspendu v2" institution (voir
-- 20260817000001_institution_suspensions_revisions.sql) : table événement
-- insert-only + statut active/levee + système d'appel + auto-réactivation
-- cron. Différence volontaire : AUCUNE colonne ajoutée sur `users` — l'état
-- "restreint ou non" est entièrement dérivé de citoyen_rdv_restrictions,
-- jamais dupliqué (un statut global sur users glisserait vers un blocage de
-- compte entier, ce que le brief interdit explicitement).
--
-- Report et annulation ne comptent jamais : reporterRdv (app/mes-rdv/actions.ts)
-- modifie la ligne rdv existante en place (jamais de second rdv créé),
-- annulerRdv met statut='annule' — presence_status reste inchangé, donc
-- jamais compté ci-dessous.
--
-- ⚠️ ÉTAPE MANUELLE OBLIGATOIRE APRÈS CE FICHIER (Bryan), même piège que
-- 20260817000001 : déployer la fonction via la CLI Supabase :
--   supabase functions deploy citoyen-rdv-restriction-autoreactivate
-- Le schedule pg_cron en bas de ce fichier échouera silencieusement tant
-- que la fonction n'est pas déployée.

-- 1) citoyen_rdv_restrictions — une ligne par escalade réellement appliquée
-- (log d'événement insert-only, jamais modifiée sauf pour la clôturer).
CREATE SEQUENCE citoyen_rdv_restrictions_reference_seq START 1;

CREATE OR REPLACE FUNCTION citoyen_rdv_restrictions_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('citoyen_rdv_restrictions_reference_seq');
  RETURN 'RES-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE citoyen_rdv_restrictions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference        text UNIQUE NOT NULL DEFAULT citoyen_rdv_restrictions_generer_reference(),
  niveau           text NOT NULL CHECK (niveau IN ('restreint_7j','restreint_30j','clos')),
  -- Nombre total d'absences ayant déclenché CETTE escalade précise (snapshot
  -- au moment du trigger, jamais recalculé après coup) — sert uniquement à
  -- l'affichage ("3 rendez-vous non honorés"), jamais relu pour une décision.
  absences_total   integer NOT NULL,
  -- NULL si niveau='clos' (pas de fin, clôture définitive).
  jusqu_au         timestamptz,
  statut           text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','levee')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  levee_le         timestamptz,
  levee_par        text CHECK (levee_par IN ('auto','revision')),
  levee_admin_id   uuid REFERENCES admin_users(id)
);

CREATE INDEX citoyen_rdv_restrictions_citoyen_id_idx ON citoyen_rdv_restrictions(citoyen_id);
-- "La restriction active de ce citoyen" — requête la plus fréquente (RLS,
-- API citoyen, job d'auto-réactivation).
CREATE INDEX citoyen_rdv_restrictions_active_idx ON citoyen_rdv_restrictions(citoyen_id) WHERE statut = 'active';

ALTER TABLE citoyen_rdv_restrictions ENABLE ROW LEVEL SECURITY;
-- Zéro policy : accès exclusivement service_role depuis les routes API
-- citoyen/admin authentifiées — même convention que institution_suspensions.
-- Le citoyen ne lit jamais cette table en direct (RLS ne l'y autorise pas),
-- uniquement via GET /api/citoyen/rdv-restriction.

-- 2) citoyen_rdv_appels — "Faire appel", disponible UNIQUEMENT quand
-- niveau='clos' (jamais pour restreint_7j/restreint_30j, décision produit
-- explicite : la contestation ne concerne que la clôture définitive).
CREATE SEQUENCE citoyen_rdv_appels_reference_seq START 1;

CREATE OR REPLACE FUNCTION citoyen_rdv_appels_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('citoyen_rdv_appels_reference_seq');
  RETURN 'APL-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE citoyen_rdv_appels (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  restriction_id        uuid NOT NULL REFERENCES citoyen_rdv_restrictions(id) ON DELETE CASCADE,
  -- Dénormalisé (citoyen_id) : simplifie les requêtes service_role, même
  -- raison déjà actée sur institution_suspension_revisions.institution_id.
  citoyen_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference             text UNIQUE NOT NULL DEFAULT citoyen_rdv_appels_generer_reference(),
  message               text NOT NULL,
  statut                text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','rejetee')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  traite_par_admin_id   uuid REFERENCES admin_users(id),
  decision_motif        text,
  decision_le           timestamptz
);

CREATE INDEX citoyen_rdv_appels_citoyen_id_idx ON citoyen_rdv_appels(citoyen_id);
CREATE INDEX citoyen_rdv_appels_restriction_id_idx ON citoyen_rdv_appels(restriction_id);

-- Règle métier "pas de double demande" (même principe que
-- institution_suspension_revisions_one_open_idx) — imposée en base, pas
-- seulement côté API.
CREATE UNIQUE INDEX citoyen_rdv_appels_one_open_idx
  ON citoyen_rdv_appels(restriction_id) WHERE statut = 'en_attente';

ALTER TABLE citoyen_rdv_appels ENABLE ROW LEVEL SECURITY;
-- Zéro policy, même convention.

-- 3) Trigger — point de calcul UNIQUE des seuils. Ni rdv/statut/route.ts ni
-- paid-bookings/valider/route.ts ne dupliquent cette logique : les deux se
-- contentent d'écrire presence_status='absent' sur `rdv`, exactement comme
-- aujourd'hui. Évite le type de drift déjà rencontré une fois sur
-- institutions.moyenne_avis (calcul applicatif oublié à un endroit).
CREATE OR REPLACE FUNCTION citoyen_rdv_evaluer_restriction() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  checkpoint_le   timestamptz;
  total_absences  integer;
  palier_cible    text;
  rang_cible      integer;
  rang_max_atteint integer;
  nouvelle_id     uuid;
BEGIN
  -- Point de repère : le dernier appel accepté par un admin sur une clôture
  -- de ce citoyen. Les absences antérieures à cette date ne comptent plus
  -- pour de futures escalades — sinon la prochaine absence referme le
  -- compte immédiatement après un appel accepté, ce qui viderait l'appel de
  -- son sens.
  SELECT r.levee_le INTO checkpoint_le
  FROM citoyen_rdv_restrictions r
  WHERE r.citoyen_id = NEW.citoyen_id AND r.niveau = 'clos' AND r.levee_par = 'revision'
  ORDER BY r.levee_le DESC
  LIMIT 1;

  SELECT count(*) INTO total_absences
  FROM rdv
  WHERE citoyen_id = NEW.citoyen_id
    AND presence_status = 'absent'
    AND (checkpoint_le IS NULL OR presence_confirmed_at > checkpoint_le);

  palier_cible := CASE
    WHEN total_absences >= 10 THEN 'clos'
    WHEN total_absences >= 5  THEN 'restreint_30j'
    WHEN total_absences >= 3  THEN 'restreint_7j'
    ELSE NULL
  END;
  IF palier_cible IS NULL THEN RETURN NEW; END IF;

  rang_cible := CASE palier_cible WHEN 'restreint_7j' THEN 1 WHEN 'restreint_30j' THEN 2 WHEN 'clos' THEN 3 END;

  -- Palier le plus sévère JAMAIS atteint depuis le checkpoint (pas
  -- seulement la restriction actuellement active) : une restriction 7j déjà
  -- auto-réactivée (statut='levee') ne doit pas être réappliquée par une 4e
  -- absence, rien ne doit se passer entre 3 et 5 absences.
  SELECT COALESCE(MAX(CASE r.niveau WHEN 'restreint_7j' THEN 1 WHEN 'restreint_30j' THEN 2 WHEN 'clos' THEN 3 END), 0)
  INTO rang_max_atteint
  FROM citoyen_rdv_restrictions r
  WHERE r.citoyen_id = NEW.citoyen_id
    AND (checkpoint_le IS NULL OR r.created_at > checkpoint_le);

  IF rang_cible > rang_max_atteint THEN
    -- Une seule restriction active à la fois : toute ligne encore active
    -- est supplantée par l'escalade (même invariant que
    -- institution_suspensions, une seule ligne statut='active' par acteur).
    UPDATE citoyen_rdv_restrictions
    SET statut = 'levee', levee_par = 'auto', levee_le = now()
    WHERE citoyen_id = NEW.citoyen_id AND statut = 'active';

    INSERT INTO citoyen_rdv_restrictions (citoyen_id, niveau, absences_total, jusqu_au)
    VALUES (
      NEW.citoyen_id,
      palier_cible,
      total_absences,
      CASE palier_cible
        WHEN 'restreint_7j'  THEN now() + interval '7 days'
        WHEN 'restreint_30j' THEN now() + interval '30 days'
        ELSE NULL
      END
    )
    RETURNING id INTO nouvelle_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_citoyen_rdv_evaluer_restriction
AFTER UPDATE OF presence_status ON rdv
FOR EACH ROW
WHEN (NEW.presence_status = 'absent' AND OLD.presence_status IS DISTINCT FROM 'absent')
EXECUTE FUNCTION citoyen_rdv_evaluer_restriction();

-- 4) Verrou backend réel (défense en profondeur) — couvre les deux chemins
-- d'écriture existants : createRdv (server action, app/rdv/[id]/actions.ts)
-- ET l'insert direct navigateur du flux payant (app/rdv/[id]/page.tsx, qui
-- ne passe par aucune fonction serveur commune aujourd'hui). Remplace les 2
-- policies INSERT posées par 20260720000004_rdv_paid_bookings_citoyen_policies.sql.
DROP POLICY IF EXISTS rdv_citoyen_insert ON rdv;
CREATE POLICY rdv_citoyen_insert ON rdv
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT EXISTS (
      SELECT 1 FROM citoyen_rdv_restrictions
      WHERE citoyen_id = auth.uid() AND statut = 'active'
    )
  );

DROP POLICY IF EXISTS paid_bookings_citoyen_insert ON paid_bookings;
CREATE POLICY paid_bookings_citoyen_insert ON paid_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT EXISTS (
      SELECT 1 FROM citoyen_rdv_restrictions
      WHERE citoyen_id = auth.uid() AND statut = 'active'
    )
  );

-- 5) Cron auto-réactivation — même mécanisme que
-- 20260817000001_institution_suspensions_revisions.sql (pg_cron + pg_net +
-- secret Vault 'service_role_key', déjà créés, NE PAS les recréer).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'yelen-citoyen-rdv-restriction-autoreactivate',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/citoyen-rdv-restriction-autoreactivate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Vérifier : select * from cron.job;
-- Historique : select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'yelen-citoyen-rdv-restriction-autoreactivate') order by start_time desc limit 20;
-- Désactiver temporairement : select cron.unschedule('yelen-citoyen-rdv-restriction-autoreactivate');
