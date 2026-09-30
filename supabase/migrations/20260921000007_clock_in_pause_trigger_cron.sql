-- Clock In Shift — planifie clock-in-pause-trigger toutes les 2 minutes
-- (brief Bryan 21/09/2026, §3 : déclenchement auto du début de pause).
-- Plus fréquent que clock-in-daily-attendance (15 min, voir
-- 20260805000011) : ce job doit détecter "l'heure de pause arrive" avec
-- une tolérance de 10 min (FENETRE_TOLERANCE_MIN côté fonction), 2 min
-- reste largement dans cette marge sans solliciter la base en continu.
--
-- ⚠️ ÉTAPE MANUELLE OBLIGATOIRE AVANT CE FICHIER (Bryan) : déployer la
-- fonction via la CLI Supabase :
--   supabase functions deploy clock-in-pause-trigger
-- Le secret Vault 'service_role_key' existe déjà (créé pour
-- yelen-rappels-rdv, réutilisé par yelen-clock-in-daily-attendance) — NE
-- PAS le recréer.

select cron.schedule(
  'yelen-clock-in-pause-trigger',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/clock-in-pause-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Vérifier : select * from cron.job where jobname = 'yelen-clock-in-pause-trigger';
-- Historique : select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'yelen-clock-in-pause-trigger') order by start_time desc limit 20;
-- Désactiver temporairement : select cron.unschedule('yelen-clock-in-pause-trigger');
