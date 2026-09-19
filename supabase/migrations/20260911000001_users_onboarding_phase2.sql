-- Écrans Onboarding Phase 2/3 (usage prévu, attentes, acquisition) —
-- mêmes colonnes plates text[] que centres_interet (décision Bryan,
-- 11/09/2026), pas de table dédiée malgré le précédent
-- institution_onboarding_survey côté institution.
alter table public.users
  add column if not exists usage_intentions text[] not null default '{}',
  add column if not exists attentes text[] not null default '{}',
  add column if not exists acquisition_canal text[] not null default '{}';
