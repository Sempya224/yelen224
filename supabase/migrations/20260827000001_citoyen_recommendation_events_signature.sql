-- Guidance / Découverte — v2 (27/08/2026, cycle de vie/cooldown/réactivation).
-- Ajoute la signature du fait réel ayant produit chaque exposition ("vue"),
-- comparée à la prochaine génération de candidats pour détecter un
-- contexte réellement nouveau et lever un cooldown en cours (brief §6).
--
-- Retrait de la valeur 'ignoree' du cycle de vie : aucune action de rejet
-- explicite n'existe côté UI (pas de bouton "fermer" sur les cartes de
-- découverte) — l'ignorance est désormais dérivée automatiquement d'une
-- "vue" jamais suivie d'"ouverte"/"utilisee" (lib/discoveryMemory.ts),
-- jamais d'un événement séparé.
alter table public.citoyen_recommendation_events
  add column if not exists signature text;

alter table public.citoyen_recommendation_events
  drop constraint if exists citoyen_recommendation_events_action_check;

alter table public.citoyen_recommendation_events
  add constraint citoyen_recommendation_events_action_check
  check (action in ('vue', 'ouverte', 'utilisee'));
