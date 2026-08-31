-- "Mes dépenses" → assistant de pilotage financier (24/08/2026, brief CEO,
-- voir plan de chantier "Mes dépenses → assistant de pilotage financier
-- quotidien V2"). Lot 0 : schéma seul, additif — aucune colonne existante
-- touchée, aucune fonctionnalité applicative câblée dans cette migration
-- (livrée lot par lot ensuite). Style aligné sur
-- 20260725000009_citoyen_depenses.sql (gen_random_uuid, policies
-- nommées par action) plutôt que sur la convention "Mes démarches" —
-- même domaine fonctionnel, on garde la cohérence locale du fichier
-- d'origine.
--
-- Ordre important : citoyen_objectifs_financiers doit exister avant
-- l'ALTER de citoyen_depenses (colonne objectif_id référence cette
-- table) — tables et policies créées d'abord, ALTER en dernier.

-- Budgets — une ligne par catégorie (une des 7 valeurs de
-- citoyen_depenses.categorie) OU une ligne globale si `categorie` est
-- NULL (objectif mensuel/hebdomadaire toutes catégories confondues, tel
-- qu'affiché en tête d'écran). Pas de contrainte d'unicité en base
-- (au plus une ligne active par citoyen+catégorie) — appliquée côté
-- application via un upsert explicite, le volume par citoyen est trivial.
create table if not exists public.citoyen_budgets (
  id uuid primary key default gen_random_uuid(),
  citoyen_id uuid not null references public.users(id) on delete cascade,
  categorie text check (categorie in ('sante','transport','alimentation','logement','education','loisirs','autre')),
  montant_limite integer not null check (montant_limite > 0),
  periode text not null default 'mensuel' check (periode in ('hebdomadaire', 'mensuel')),
  seuil_alerte integer check (seuil_alerte is null or (seuil_alerte > 0 and seuil_alerte <= 100)),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists citoyen_budgets_citoyen_id_idx on public.citoyen_budgets(citoyen_id);

alter table public.citoyen_budgets enable row level security;

create policy "citoyen_budgets_select_own" on public.citoyen_budgets
  for select using (auth.uid() = citoyen_id);

create policy "citoyen_budgets_insert_own" on public.citoyen_budgets
  for insert with check (auth.uid() = citoyen_id);

create policy "citoyen_budgets_update_own" on public.citoyen_budgets
  for update using (auth.uid() = citoyen_id) with check (auth.uid() = citoyen_id);

create policy "citoyen_budgets_delete_own" on public.citoyen_budgets
  for delete using (auth.uid() = citoyen_id);

-- Objectifs financiers. `montant_actuel` n'est volontairement PAS une
-- colonne stockée — dérivé par SUM() sur citoyen_objectif_contributions
-- au moment de la lecture, pour ne jamais laisser une somme stockée
-- diverger de son historique (même principe que moyenne_avis avant son
-- trigger, ou journal_activite pour l'audit).
create table if not exists public.citoyen_objectifs_financiers (
  id uuid primary key default gen_random_uuid(),
  citoyen_id uuid not null references public.users(id) on delete cascade,
  titre text not null,
  montant_cible integer not null check (montant_cible > 0),
  deadline date,
  cadence text check (cadence in ('hebdomadaire', 'mensuel', 'unique')),
  statut text not null default 'actif' check (statut in ('actif', 'atteint', 'abandonne')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists citoyen_objectifs_financiers_citoyen_id_idx on public.citoyen_objectifs_financiers(citoyen_id);

alter table public.citoyen_objectifs_financiers enable row level security;

create policy "citoyen_objectifs_financiers_select_own" on public.citoyen_objectifs_financiers
  for select using (auth.uid() = citoyen_id);

create policy "citoyen_objectifs_financiers_insert_own" on public.citoyen_objectifs_financiers
  for insert with check (auth.uid() = citoyen_id);

create policy "citoyen_objectifs_financiers_update_own" on public.citoyen_objectifs_financiers
  for update using (auth.uid() = citoyen_id) with check (auth.uid() = citoyen_id);

create policy "citoyen_objectifs_financiers_delete_own" on public.citoyen_objectifs_financiers
  for delete using (auth.uid() = citoyen_id);

-- Contributions à un objectif — insert-only (même famille que
-- citoyen_demarche_historique/rdv_events) : aucune policy update/delete,
-- l'absence de policy rend la table naturellement immuable par RLS
-- (deny-by-default). "Retirer" une contribution saisie par erreur se
-- fait par une contribution négative, jamais par une correction en
-- place — trace complète conservée.
create table if not exists public.citoyen_objectif_contributions (
  id uuid primary key default gen_random_uuid(),
  objectif_id uuid not null references public.citoyen_objectifs_financiers(id) on delete cascade,
  citoyen_id uuid not null references public.users(id) on delete cascade,
  montant integer not null,
  created_at timestamptz not null default now()
);

create index if not exists citoyen_objectif_contributions_objectif_id_idx on public.citoyen_objectif_contributions(objectif_id);

alter table public.citoyen_objectif_contributions enable row level security;

create policy "citoyen_objectif_contributions_select_own" on public.citoyen_objectif_contributions
  for select using (auth.uid() = citoyen_id);

create policy "citoyen_objectif_contributions_insert_own" on public.citoyen_objectif_contributions
  for insert with check (auth.uid() = citoyen_id);

-- citoyen_depenses : ajouts additifs pour la récurrence (Lot 8) et le
-- lien optionnel vers un objectif financier (Lot 5/11).
alter table public.citoyen_depenses
  add column if not exists recurrence text not null default 'aucune' check (recurrence in ('aucune', 'hebdomadaire', 'mensuel')),
  add column if not exists recurrence_prochaine_date date,
  add column if not exists objectif_id uuid references public.citoyen_objectifs_financiers(id) on delete set null;
