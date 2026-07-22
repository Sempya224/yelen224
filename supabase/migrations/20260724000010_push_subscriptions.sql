-- Chantier "Yelen Assistant" (20/07/2026), Lot D — infrastructure push Web
-- Push (aucune ne préexistait : ni service worker, ni VAPID, ni table
-- d'abonnement — vérifié par grep exhaustif avant ce chantier).

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  destinataire_id uuid not null,
  destinataire_type text not null check (destinataire_type in ('citoyen', 'institution')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_destinataire_idx
  on push_subscriptions (destinataire_id, destinataire_type);

alter table push_subscriptions enable row level security;

-- Citoyen : peut gérer ses propres abonnements (session Supabase Auth réelle,
-- même convention que `notifications`/`avis`). Institution : aucune policy —
-- accès exclusivement service_role, comme toutes les tables institution
-- (JWT custom, jamais de session Supabase Auth, auth.uid() toujours null).
create policy push_subs_citoyen_own on push_subscriptions
  for all
  using (auth.uid() = destinataire_id and destinataire_type = 'citoyen')
  with check (auth.uid() = destinataire_id and destinataire_type = 'citoyen');
