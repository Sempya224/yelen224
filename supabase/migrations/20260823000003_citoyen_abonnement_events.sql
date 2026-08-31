-- Journal d'événements abonnement/désabonnement — Chaîne Yelen
-- (23/08/2026, retour Bryan : terminer le stub "Abonnés perdus" côté
-- institution). citoyen_abonnements reste un hard-delete (décision déjà
-- actée) — ce journal append-only est la seule trace d'un désabonnement,
-- sur le même principe que rdv_events/document_events/signalement_events
-- (convention du projet pour tout historique d'action), adapté ici à
-- l'écriture directe client déjà en place pour les abonnements (comme
-- citoyen_favoris/post_likes : RLS auth.uid() = citoyen_id) plutôt que le
-- zero-policy service_role-only de rdv_events (qui passent par des routes
-- API, pas notre cas).
--
-- Une seule policy, INSERT uniquement : le citoyen n'a jamais besoin de
-- lire son propre journal (donnée d'analytics institution), et l'absence
-- de policy UPDATE/DELETE rend la table naturellement immuable par RLS
-- (deny-by-default) — pas besoin d'un trigger d'immuabilité dédié pour un
-- journal d'actions non sensible comme celui-ci.
CREATE TABLE citoyen_abonnement_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('abonne', 'desabonne')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_abonnement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY abonnement_events_citoyen_insert ON citoyen_abonnement_events
  FOR INSERT
  WITH CHECK (auth.uid() = citoyen_id);
