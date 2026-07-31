-- Yelen Rewards — Phase 1, fichier 1/8 (décision CEO 26/07/2026, plan
-- revu par 6 analyses indépendantes : Security, Fraud, Backend, Product
-- Rules, UX, QA — voir C:\Users\Balde224\.claude\plans\mellow-jingling-balloon.md).
--
-- reward_events = fait brut déduplié, écrit uniquement par lib/rewardsEngine.ts
-- (service_role, jamais depuis le client). Mirroring rdv_events (event-
-- sourcing déjà utilisé dans ce projet) : append-only, horodatage toujours
-- généré serveur (`now()`), jamais une valeur fournie par le client.
--
-- source_type/source_id sont polymorphes (comme rdv_events.auteur_id) :
-- pas de FK typée, la valeur pointe vers rdv.id, citoyen_demarches.id, etc.
-- selon source_type. La contrainte UNIQUE ci-dessous est le verrou anti-
-- rejeu/anti-double-validation : le même fait réel (ex. RDV X marqué
-- "termine") ne peut produire qu'un seul reward_event, quel que soit le
-- nombre d'appels/retries.
CREATE TABLE reward_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN (
    'rdv', 'citoyen_demarche', 'profil', 'identite', 'document',
    'parrainage', 'usage_fonctionnalite', 'contribution_communaute'
  )),
  source_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, event_type)
);

CREATE INDEX reward_events_citoyen_idx ON reward_events (citoyen_id);

-- RLS activé, ZÉRO policy — même convention que rdv_events. Écriture
-- exclusivement service_role (bypass RLS), aucune lecture ni écriture
-- côté client. Un citoyen n'a jamais besoin de lire cette table brute
-- directement (l'API agrège via points_transactions).
ALTER TABLE reward_events ENABLE ROW LEVEL SECURITY;
