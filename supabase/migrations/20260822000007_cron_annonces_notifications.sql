-- Lot 5 "Home V2 / mécaniques d'engagement" (22/08/2026) — planifie
-- l'exécution de supabase/functions/annonces-notifications toutes les 30
-- minutes (une annonce peut être plus urgente qu'une échéance de
-- démarche — ex. fermeture exceptionnelle le jour même — pas de raison
-- d'attendre le lot quotidien de 7h). Réutilise pg_cron/pg_net et le
-- secret Vault 'service_role_key' déjà en place.

select cron.schedule(
  'yelen-annonces-notifications',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/annonces-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Pour vérifier : select * from cron.job;
-- Pour désactiver temporairement : select cron.unschedule('yelen-annonces-notifications');
