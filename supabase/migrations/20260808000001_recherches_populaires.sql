-- Chantier Search Overlay (décision CEO 08/08/2026) — section "Recherches
-- populaires" de l'overlay plein écran. Aucune donnée de fréquence de
-- recherche n'existait jusqu'ici (confirmé par audit du codebase) : ni
-- table dédiée, ni compteur sur une table existante. Décision explicite de
-- Bryan : construire un vrai suivi plutôt que d'afficher une liste
-- statique inventée — la table démarre vide et ne se peuple qu'avec de
-- vraies recherches effectuées après ce déploiement (même principe que
-- moyenne_avis/nb_avis avant leur trigger de recalcul : jamais de valeur
-- de départ fabriquée).
--
-- Compteur agrégé (pas un journal ligne par ligne) : suffisant pour "les
-- recherches les plus effectuées", évite une table qui grossit sans limite
-- et qu'il faudrait agréger a posteriori. `terme_normalise` (minuscule,
-- espaces normalisés) sert de clé d'upsert pour regrouper les variantes de
-- casse/espacement d'un même terme ; `terme_affichage` garde la première
-- forme réellement tapée par un citoyen pour l'affichage.
CREATE TABLE recherches_populaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terme_normalise text NOT NULL UNIQUE,
  terme_affichage text NOT NULL,
  nb_recherches integer NOT NULL DEFAULT 1,
  derniere_recherche_le timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recherches_populaires_nb ON recherches_populaires (nb_recherches DESC);

-- RLS activé, aucune policy — accès exclusivement service_role via
-- app/api/citoyen/recherche/populaire, même convention que les tables
-- sensibles récentes du projet (aucune session Supabase Auth requise ici,
-- la recherche fonctionne aussi pour un citoyen non connecté).
ALTER TABLE recherches_populaires ENABLE ROW LEVEL SECURITY;
