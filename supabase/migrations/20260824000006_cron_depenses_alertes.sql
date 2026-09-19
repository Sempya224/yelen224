-- Lot 12 "Mes dépenses V2 — Notifications intelligentes" (24/08/2026) —
-- planifie l'exécution quotidienne de citoyen-depenses-alertes. Même
-- pattern que 20260822000002_cron_rappels_demarches.sql (dates, pas
-- d'horodatage précis — pas besoin de la granularité 5 minutes de
-- yelen-rappels-rdv). 7h15 : juste après demarches-rappels (7h00) et
-- documents-relances (7h10), pour étaler la charge des jobs du matin.
--
-- pg_cron/pg_net déjà activées (migration 20260724000009) — pas de CREATE
-- EXTENSION répété. Réutilise le secret Vault 'service_role_key' déjà créé
-- pour yelen-rappels-rdv — NE PAS le recréer s'il existe déjà.

select cron.schedule(
  'yelen-depenses-alertes',
  '15 7 * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/citoyen-depenses-alertes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Pour vérifier que le job est bien planifié : select * from cron.job;
-- Pour consulter l'historique d'exécution : select * from cron.job_run_details order by start_time desc limit 20;
-- Pour désactiver temporairement : select cron.unschedule('yelen-depenses-alertes');
