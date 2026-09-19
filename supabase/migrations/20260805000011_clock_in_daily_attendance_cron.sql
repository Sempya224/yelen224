-- Clock In Shift — planifie l'exécution de l'Edge Function
-- supabase/functions/clock-in-daily-attendance toutes les 15 minutes,
-- même mécanisme que 20260724000009_cron_rappels_rdv.sql (pg_cron +
-- pg_net + secret Vault 'service_role_key'). 15 min (pas 5 comme les
-- rappels RDV) : calcul plus lourd (parcourt tous les employés
-- affectés), un dashboard "quasi temps réel" à 15 min de latence reste
-- largement dans l'esprit du brief CEO.
--
-- ⚠️ Le secret Vault 'service_role_key' existe déjà (créé pour
-- yelen-rappels-rdv) — NE PAS le recréer. Si ce n'est pas le cas sur ce
-- projet, voir 20260724000009_cron_rappels_rdv.sql pour la commande
-- vault.create_secret.
--
-- ⚠️ ÉTAPE MANUELLE OBLIGATOIRE AVANT CE FICHIER (Bryan) : déployer la
-- fonction via la CLI Supabase :
--   supabase functions deploy clock-in-daily-attendance
-- Le schedule ci-dessous échouera silencieusement (job planifié mais
-- chaque exécution renverra une erreur HTTP) tant que la fonction n'est
-- pas déployée.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'yelen-clock-in-daily-attendance',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/clock-in-daily-attendance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Vérifier : select * from cron.job;
-- Historique : select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'yelen-clock-in-daily-attendance') order by start_time desc limit 20;
-- Désactiver temporairement : select cron.unschedule('yelen-clock-in-daily-attendance');
