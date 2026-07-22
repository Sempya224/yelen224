-- Chantier "Yelen Assistant" (20/07/2026), Lot C — planifie l'exécution de
-- l'Edge Function supabase/functions/rappels-rdv toutes les 5 minutes, pour
-- les rappels 24h/2h/45min/15min avant chaque RDV (phases 2 à 5 du brief
-- CEO). Remplace l'ancien mécanisme "au chargement de /mes-rdv" qui ne
-- couvrait jamais l'institution et ne se déclenchait que si un citoyen
-- ouvrait l'app au bon moment.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ⚠️ ÉTAPE MANUELLE OBLIGATOIRE AVANT D'EXÉCUTER CE FICHIER (Bryan) :
-- stocker la clé service_role dans Vault (jamais en clair dans une
-- migration versionnée dans Git). Dans le SQL Editor, exécuter séparément
-- (remplacer <SERVICE_ROLE_KEY> par la vraie valeur, trouvable dans
-- Project Settings > API) :
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- Si un secret 'service_role_key' existe déjà (créé pour un autre usage),
-- ne pas le recréer — le schedule ci-dessous le référence par son nom.

select cron.schedule(
  'yelen-rappels-rdv',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://pgcabxgrgjgukuagpuhc.supabase.co/functions/v1/rappels-rdv',
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
-- Pour désactiver temporairement : select cron.unschedule('yelen-rappels-rdv');
