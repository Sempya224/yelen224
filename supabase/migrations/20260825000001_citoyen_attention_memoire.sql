-- État d'attention Yelen — Lot 3 (25/08/2026). Mémoire comportementale,
-- séparée de PriorityItem par construction (verrouillé dans la
-- conversation d'architecture) : un PriorityItem disparaît quand sa
-- condition disparaît, cette table survit.
--
-- Même convention que rdv_events/reward_events (déjà dans ce projet) :
-- RLS activé, ZÉRO policy, accès exclusivement service_role — le citoyen
-- n'a jamais besoin de lire son propre "compteur d'ignorance" directement,
-- c'est un outil de calcul interne au moteur, pas une donnée à exposer.
--
-- Clé (citoyen_id, source_type, categorie) : une seule ligne par
-- combinaison suivie, jamais par occurrence individuelle (source_id) —
-- la mémoire porte sur le TYPE de proposition ignorée, pas sur un fait
-- ponctuel précis.
create table if not exists public.citoyen_attention_memoire (
  id uuid primary key default gen_random_uuid(),
  citoyen_id uuid not null references public.users(id) on delete cascade,
  source_type text not null,
  categorie text not null,
  compteur_ignorance integer not null default 0,
  derniere_proposition_le date not null default current_date,
  updated_at timestamptz not null default now(),
  unique (citoyen_id, source_type, categorie)
);

create index if not exists idx_citoyen_attention_memoire_citoyen on public.citoyen_attention_memoire(citoyen_id);

alter table public.citoyen_attention_memoire enable row level security;
