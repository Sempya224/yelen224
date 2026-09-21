-- Job planifiées → file de modération (16/09/2026). Contrairement aux
-- autres jobs cron du projet (yelen-rappels-demarches, etc.), pas besoin
-- d'Edge Function ici : la transition est un UPDATE mono-table sans appel
-- externe ni notification — passer par net.http_post/vault serait une
-- sur-ingénierie pour ce cas. pg_cron/pg_net déjà activées (migration
-- 20260724000009), pas de CREATE EXTENSION répété.
--
-- ⚠️ Ne fait JAMAIS passer un post directement à 'publiee' — décision
-- Bryan 16/09/2026 : la planification retarde uniquement l'ENTRÉE dans la
-- file de modération Yelen, jamais la validation elle-même. Le flux normal
-- (app/api/admin/posts/[id]/approuver|refuser) prend le relais ensuite,
-- inchangé.
create index if not exists idx_posts_planifiee_scheduled_at
  on posts (scheduled_at)
  where statut = 'planifiee';

select cron.schedule(
  'yelen-publications-planifiees',
  '* * * * *',
  $$
  UPDATE posts
  SET statut = 'en_attente_validation', soumis_le = now(), scheduled_at = null
  WHERE statut = 'planifiee' AND scheduled_at <= now();
  $$
);

-- Vérifier : select * from cron.job where jobname = 'yelen-publications-planifiees';
-- Historique : select * from cron.job_run_details order by start_time desc limit 20;
-- Désactiver : select cron.unschedule('yelen-publications-planifiees');
