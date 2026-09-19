-- Feedback de désinscription (retour Bryan 12/09/2026) — capturé sur
-- l'écran 1 du nouveau parcours "Supprimer mon compte"
-- (app/compte/confidentialite), avant la suppression réelle du compte.
-- citoyen_id en ON DELETE SET NULL (pas CASCADE, contrairement aux tables
-- citoyen_prefs_*) : cette ligne doit survivre à la suppression du compte
-- qu'elle référence, sinon le feedback collecté serait perdu au moment
-- même où il devient utile pour l'analyse de rétention.
-- raison/detail nullable : tout l'écran est facultatif (bouton "Continuer
-- vers la suppression" toujours actif, avec ou sans retour donné).
CREATE TABLE citoyen_suppression_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  raison text CHECK (raison IN ('non_utilise','confidentialite','fonctionnalites_manquantes','deuxieme_compte','autre')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_suppression_feedback ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — écriture exclusivement via route API
-- service_role, même convention que citoyen_prefs_visibilite/_partage.
