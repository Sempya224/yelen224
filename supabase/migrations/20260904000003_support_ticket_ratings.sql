-- Chantier "Support Yelen" — fin de conversation + évaluation (04/09/2026).
--
-- Une seule table nouvelle : l'évaluation de l'expérience avec le support
-- humain, distincte de conversation.statut (brief section 14 : "ne pas
-- mélanger rating et conversation.status"). UNIQUE sur ticket_id = garde-fou
-- base pour "une conversation ne peut être évaluée qu'une seule fois"
-- (brief section 11), en plus du contrôle applicatif dans
-- lib/supportTickets.ts::enregistrerEvaluationCitoyen.
--
-- RLS activé + ZÉRO policy, même convention que 20260904000001 : le citoyen
-- ne lit jamais cette table directement (la note est réexposée via
-- obtenirTicketCitoyen(), qui la lit en service_role), et n'écrit jamais
-- directement (contrôle de statut + note + unicité fait exclusivement dans
-- lib/supportTickets.ts). Aucune policy de lecture réaliste (contrairement
-- à 20260904000002) : rien ici n'a besoin de Realtime.

CREATE TABLE support_ticket_ratings (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id     uuid NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
  citoyen_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note          smallint NOT NULL CHECK (note BETWEEN 1 AND 5),
  raisons       text[] NOT NULL DEFAULT '{}',
  commentaire   text,
  cree_le       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_ratings_citoyen_idx ON support_ticket_ratings (citoyen_id);

ALTER TABLE support_ticket_ratings ENABLE ROW LEVEL SECURITY;
