-- Centre d'Analyse → Acquisition (brief CEO, nouvel onglet). Aucune table
-- de tracking d'acquisition n'existait avant cette migration : les tables
-- proches (institution_vues, annonce_vues, post_impressions/post_vues)
-- sont toutes des compteurs sans notion de source ni de visiteur suivi
-- dans le temps. Mirroring exact du pattern RLS déjà utilisé sur ces
-- tables (insert-only anon+authenticated, WITH CHECK sur citoyen_id,
-- aucune policy SELECT — lecture exclusivement service_role depuis
-- app/api/institution/analyse/acquisition).
--
-- `visiteur_id` (UUID généré et persisté côté client dans localStorage,
-- voir lib/acquisitionEvents.ts) permet de distinguer nouveaux/récurrents
-- pour les visiteurs non connectés — aucun mécanisme équivalent
-- n'existait avant dans le projet.
CREATE TABLE acquisition_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  source text NOT NULL,
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  visiteur_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE acquisition_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY acquisition_events_insert ON acquisition_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (citoyen_id IS NULL OR citoyen_id = auth.uid());
-- Aucune policy SELECT : lecture exclusivement via service_role
-- (app/api/institution/analyse/acquisition), jamais exposée en lecture
-- directe côté client — même garantie que institution_vues/post_impressions.

CREATE INDEX acquisition_events_institution_created_idx ON acquisition_events(institution_id, created_at);
CREATE INDEX acquisition_events_institution_type_idx ON acquisition_events(institution_id, event_type);
