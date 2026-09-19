-- Guidance / Découverte — Lot 2 (26/08/2026). Journal d'événements
-- immuable, même famille que document_events/signalement_events/
-- post_impressions déjà dans ce projet : une ligne par exposition/
-- interaction, jamais une correction en place.
--
-- Sert deux besoins à la fois (lib/discoveryMemory.ts) :
-- - la confiance progressive par fonctionnalité (brief §7 : vu → ouvert →
--   utilisé → utilisé régulièrement) ;
-- - la suppression après ignorances répétées, même principe que le Tier 3
--   de citoyen_attention_memoire, mais dérivé ici du journal lui-même
--   plutôt qu'un compteur séparé — pas de duplication de mécanisme.
--
-- Même convention que citoyen_attention_memoire : RLS activé, ZÉRO policy,
-- accès exclusivement service_role.
create table if not exists public.citoyen_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  citoyen_id uuid not null references public.users(id) on delete cascade,
  source_type text not null,
  categorie text not null,
  source_id text,
  action text not null check (action in ('vue', 'ouverte', 'utilisee', 'ignoree')),
  created_at timestamptz not null default now()
);

create index if not exists idx_citoyen_recommendation_events_citoyen_type
  on public.citoyen_recommendation_events(citoyen_id, source_type, created_at desc);

alter table public.citoyen_recommendation_events enable row level security;
