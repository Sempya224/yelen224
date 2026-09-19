-- Yelen Rewards — Phase 2, suite (22/08/2026) : planifie l'exécution
-- quotidienne de supabase/functions/demarches-recompenses (même créneau
-- que les autres jobs du même lot). Réutilise pg_cron/pg_net et le secret
-- Vault 'service_role_key' déjà en place.

select cron.schedule(
  'yelen-demarches-recompenses',
  '20 7 * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/demarches-recompenses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Pour vérifier : select * from cron.job;
-- Pour désactiver temporairement : select cron.unschedule('yelen-demarches-recompenses');
