-- Écran "Mes dépenses" (chantier menu engagement, 25/07/2026). Dépenses
-- saisies manuellement par le citoyen — les dépenses "Rendez-vous Yelen"
-- ne sont PAS stockées ici, elles sont lues directement depuis
-- paid_bookings (source de vérité déjà existante, voir lib/financeAggregation.ts).
-- RLS façon citoyen_favoris/citoyen_demarches : le citoyen est propriétaire
-- direct de ses lignes (auth.uid() = citoyen_id), pas de policy service_role.
create table if not exists public.citoyen_depenses (
  id uuid primary key default gen_random_uuid(),
  citoyen_id uuid not null references public.users(id) on delete cascade,
  categorie text not null check (categorie in ('sante','transport','alimentation','logement','education','loisirs','autre')),
  montant integer not null check (montant > 0),
  description text,
  date_depense date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists citoyen_depenses_citoyen_id_idx on public.citoyen_depenses(citoyen_id);

alter table public.citoyen_depenses enable row level security;

create policy "citoyen_depenses_select_own" on public.citoyen_depenses
  for select using (auth.uid() = citoyen_id);

create policy "citoyen_depenses_insert_own" on public.citoyen_depenses
  for insert with check (auth.uid() = citoyen_id);

create policy "citoyen_depenses_update_own" on public.citoyen_depenses
  for update using (auth.uid() = citoyen_id) with check (auth.uid() = citoyen_id);

create policy "citoyen_depenses_delete_own" on public.citoyen_depenses
  for delete using (auth.uid() = citoyen_id);
