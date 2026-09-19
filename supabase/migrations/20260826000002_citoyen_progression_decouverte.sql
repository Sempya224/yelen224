-- Guidance / Découverte — Lot 3 (26/08/2026). État persisté du palier de
-- découverte progressive (brief §8) — décision actée avec Bryan : état
-- persisté plutôt que recalculé à la volée, pour ne jamais faire flapper
-- le palier d'un citoyen d'une requête à l'autre.
--
-- Le palier ne régresse jamais automatiquement (une baisse d'usage ne doit
-- jamais redevenir punitive) : seule une progression réelle (lib/
-- discoveryProgression.ts::synchroniserStade) peut faire avancer la ligne,
-- jamais la faire reculer.
--
-- Même convention que citoyen_attention_memoire : RLS activé, ZÉRO policy,
-- accès exclusivement service_role.
create table if not exists public.citoyen_progression_decouverte (
  citoyen_id uuid primary key references public.users(id) on delete cascade,
  stade text not null default 'premiere_session'
    check (stade in ('premiere_session', 'decouverte', 'personnalisation', 'historique_riche')),
  stade_atteint_le timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.citoyen_progression_decouverte enable row level security;

-- Historique des transitions, insert-only — même famille que
-- citoyen_demarche_historique : jamais de correction en place, une
-- nouvelle ligne trace "pourquoi ce palier, à partir de quel fait réel".
create table if not exists public.citoyen_progression_decouverte_historique (
  id uuid primary key default gen_random_uuid(),
  citoyen_id uuid not null references public.users(id) on delete cascade,
  ancien_stade text,
  nouveau_stade text not null,
  raison text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_citoyen_progression_decouverte_historique_citoyen
  on public.citoyen_progression_decouverte_historique(citoyen_id, created_at desc);

alter table public.citoyen_progression_decouverte_historique enable row level security;
