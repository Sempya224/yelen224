-- Lot "Home V2 / mécaniques d'engagement" (22/08/2026) — planifie
-- l'exécution quotidienne de 2 Edge Functions du même lot (7h, Guinée =
-- UTC+0 toute l'année, hypothèse déjà documentée pour Clock In Shift) :
-- demarches-rappels (échéance/retard démarche) et documents-relances
-- (relance document en attente J+3/J+7). Toutes deux opèrent sur des
-- dates, pas des horodatages précis — pas besoin de la granularité 5
-- minutes de yelen-rappels-rdv.
--
-- pg_cron/pg_net déjà activées par la migration 20260724000009 — pas de
-- CREATE EXTENSION répété ici (IF NOT EXISTS de toute façon sans risque
-- si rejoué).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ⚠️ Réutilise le secret Vault 'service_role_key' déjà créé pour
-- yelen-rappels-rdv (migration 20260724000009) — NE PAS le recréer s'il
-- existe déjà. Si ce fichier est exécuté sur un projet qui n'a jamais eu
-- yelen-rappels-rdv, créer le secret d'abord (SQL Editor, hors fichier
-- versionné) :
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

select cron.schedule(
  'yelen-rappels-demarches',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/demarches-rappels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'yelen-documents-relances',
  '10 7 * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/documents-relances',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Pour vérifier que les jobs sont bien planifiés : select * from cron.job;
-- Pour consulter l'historique d'exécution : select * from cron.job_run_details order by start_time desc limit 20;
-- Pour désactiver temporairement :
--   select cron.unschedule('yelen-rappels-demarches');
--   select cron.unschedule('yelen-documents-relances');
