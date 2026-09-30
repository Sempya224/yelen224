-- "Mes projets" — Lot 3 : section "Activité" de la fiche détail (vraie
-- timeline, pas une reconstitution à partir de created_at/termine_le).
--
-- Même patron que citoyen_demarche_historique (migration 20260824000002,
-- "Mes démarches") : journal append-only écrit directement par le
-- client sous RLS auth.uid()=citoyen_id, immuable par absence de policy
-- UPDATE/DELETE (pas de trigger dédié comme journal_activite/
-- document_events — cohérence avec la fonctionnalité jumelle plutôt que
-- réinvention).

CREATE TABLE citoyen_projet_historique (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  projet_id uuid NOT NULL REFERENCES citoyen_projets(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evenement text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_projet_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY projet_historique_citoyen_select ON citoyen_projet_historique
  FOR SELECT
  USING (auth.uid() = citoyen_id);

CREATE POLICY projet_historique_citoyen_insert ON citoyen_projet_historique
  FOR INSERT
  WITH CHECK (auth.uid() = citoyen_id);

CREATE INDEX idx_projet_historique_projet ON citoyen_projet_historique(projet_id, created_at);
