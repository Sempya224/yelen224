-- Écran "Vos centres d'intérêt" (chantier menu engagement, 25/07/2026).
-- Liste de tags choisis par le citoyen, réutilisant les taxonomies déjà
-- réelles du produit (institutions.secteur, catégories de Leçons
-- d'argent) — pas une nouvelle table, juste une colonne de préférence
-- simple sur users, mirroring le style array déjà utilisé ailleurs.
alter table public.users
  add column if not exists centres_interet text[] not null default '{}';
