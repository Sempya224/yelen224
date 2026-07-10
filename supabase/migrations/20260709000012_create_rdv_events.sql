-- Migration : création rdv_events (audit 09/07/2026)
CREATE TYPE auteur_type_rdv_event AS ENUM ('citoyen', 'institution', 'system');
CREATE TYPE action_rdv_event AS ENUM ('creation', 'confirmation', 'annulation', 'report', 'termine', 'absent', 'message', 'depasse');

CREATE TABLE rdv_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  rdv_id uuid NOT NULL REFERENCES rdv(id) ON DELETE CASCADE,
  auteur_id text NOT NULL,
  auteur_type auteur_type_rdv_event NOT NULL,
  action action_rdv_event NOT NULL,
  ancien_statut text,
  nouveau_statut text,
  motif text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rdv_events ENABLE ROW LEVEL SECURITY;