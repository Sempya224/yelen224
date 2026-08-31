-- Institution Suspensions v2 — statut structuré, durée optionnelle, système
-- de révision/appel (décision CEO 17/08/2026, refonte écran "Espace
-- suspendu" — brief inspiré Google/Stripe : expliquer la décision, donner
-- une voie de recours, permettre le suivi du dossier). Remplace le
-- mécanisme provisoire "relire le texte de la dernière notification" par
-- des tables structurées. Référence lisible par séquence + fonction
-- DEFAULT, même pattern que signalements (voir
-- 20260808000004_signalements_lifecycle_core.sql, SIG-{année}-{compteur8}).
--
-- ⚠️ ÉTAPE MANUELLE OBLIGATOIRE AVANT CE FICHIER (Bryan) : déployer la
-- fonction via la CLI Supabase :
--   supabase functions deploy institution-suspension-autoreactivate
-- Le schedule pg_cron en bas de ce fichier échouera silencieusement (job
-- planifié mais chaque exécution renverra une erreur HTTP) tant que la
-- fonction n'est pas déployée — même piège que
-- 20260805000011_clock_in_daily_attendance_cron.sql.

-- 1) institution_suspensions — une ligne par suspension appliquée (log
-- d'événement insert-only, jamais modifiée sauf pour la clôturer : statut/
-- levee_le/levee_par/levee_admin_id).
CREATE SEQUENCE institution_suspensions_reference_seq START 1;

CREATE OR REPLACE FUNCTION institution_suspensions_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('institution_suspensions_reference_seq');
  RETURN 'SUS-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE institution_suspensions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  reference        text UNIQUE NOT NULL DEFAULT institution_suspensions_generer_reference(),
  motif            text NOT NULL,
  -- duree_jours : valeur informative saisie par l'admin au moment de
  -- suspendre (optionnelle) ; jusqu_au = now() + duree_jours, calculée côté
  -- API (jamais par trigger, cohérent avec le reste du projet). NULL sur
  -- les deux colonnes = suspension indéfinie (comportement historique,
  -- toujours le défaut).
  duree_jours      integer,
  jusqu_au         timestamptz,
  statut           text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','levee')),
  admin_id         uuid REFERENCES admin_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  levee_le         timestamptz,
  levee_par        text CHECK (levee_par IN ('admin','auto','revision')),
  levee_admin_id   uuid REFERENCES admin_users(id)
);

CREATE INDEX institution_suspensions_institution_id_idx ON institution_suspensions(institution_id);
-- "La suspension active de cette institution" — requête la plus fréquente
-- (routes institution/suspension, reactiver, job d'auto-réactivation).
CREATE INDEX institution_suspensions_active_idx ON institution_suspensions(institution_id) WHERE statut = 'active';

ALTER TABLE institution_suspensions ENABLE ROW LEVEL SECURITY;
-- Zéro policy : les institutions n'ont jamais de session Supabase Auth (JWT
-- custom), accès exclusivement service_role — même convention que tout le
-- reste du domaine institution (voir CLAUDE.md /securite).

-- 2) institution_suspension_revisions — une ligne par demande de révision
-- ("appel") soumise par l'institution.
CREATE SEQUENCE institution_suspension_revisions_reference_seq START 1;

CREATE OR REPLACE FUNCTION institution_suspension_revisions_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('institution_suspension_revisions_reference_seq');
  RETURN 'REV-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE institution_suspension_revisions (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  suspension_id         uuid NOT NULL REFERENCES institution_suspensions(id) ON DELETE CASCADE,
  -- Dénormalisé (institution_id) : simplifie les requêtes service_role
  -- (pas besoin de jointure pour filtrer "les révisions de cette
  -- institution"), coût négligeable au volume de cette table.
  institution_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  reference             text UNIQUE NOT NULL DEFAULT institution_suspension_revisions_generer_reference(),
  message               text NOT NULL,
  statut                text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','acceptee','rejetee')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  traite_par_admin_id   uuid REFERENCES admin_users(id),
  decision_motif        text,
  decision_le           timestamptz
);

CREATE INDEX institution_suspension_revisions_institution_id_idx ON institution_suspension_revisions(institution_id);
CREATE INDEX institution_suspension_revisions_suspension_id_idx ON institution_suspension_revisions(suspension_id);

-- Règle métier "pas de double demande" (brief CEO : "vous n'avez pas besoin
-- de soumettre une nouvelle demande pendant l'examen de votre dossier") —
-- une seule révision en_attente à la fois par suspension, imposée en base
-- (pas seulement côté API) pour rester vraie même en cas de double appel
-- concurrent.
CREATE UNIQUE INDEX institution_suspension_revisions_one_open_idx
  ON institution_suspension_revisions(suspension_id) WHERE statut = 'en_attente';

ALTER TABLE institution_suspension_revisions ENABLE ROW LEVEL SECURITY;
-- Zéro policy, même convention.

-- 3) Cron auto-réactivation — même mécanisme que
-- 20260805000011_clock_in_daily_attendance_cron.sql (pg_cron + pg_net +
-- secret Vault 'service_role_key', déjà créé pour yelen-rappels-rdv — NE
-- PAS le recréer). Horaire (pas /15 min comme Clock In Shift) : la
-- granularité d'une durée de suspension est le jour, pas la minute.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'yelen-institution-suspension-autoreactivate',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/institution-suspension-autoreactivate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Vérifier : select * from cron.job;
-- Historique : select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'yelen-institution-suspension-autoreactivate') order by start_time desc limit 20;
-- Désactiver temporairement : select cron.unschedule('yelen-institution-suspension-autoreactivate');
