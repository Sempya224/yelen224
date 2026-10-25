-- Système de recommandation institutionnel (Phase 3, architecture validée
-- CEO 13/10/2026) — persistance des candidats produits par
-- lib/recommandationsInstitution.ts::genererRecommandations(), avec cycle
-- de vie nouvelle/consultee/traitee/expiree géré par
-- lib/recommandationsLifecycle.ts.
--
-- Même convention que employee_credentials (migration
-- 20260805000004_clock_in_employee_credentials.sql) : RLS activé, ZÉRO
-- policy — aucun membre institution_membres n'a de session Supabase Auth
-- (JWT custom), donc accès exclusivement via service_role côté serveur
-- (voir CLAUDE.md /securite).
--
-- UNIQUE(institution_id, cle_deduplication) empêche structurellement tout
-- doublon, y compris à travers un cycle disparition/réapparition du signal
-- (voir lib/recommandationsCycleVie.ts::decisionCycleVie).
CREATE TABLE institution_recommandations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type text NOT NULL,
  cle_deduplication text NOT NULL,
  priorite text NOT NULL CHECK (priorite IN ('critique', 'attention')),
  constat text NOT NULL,
  donnees_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  periode_jours integer NOT NULL,
  action_label text,
  action_cible text,
  statut text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'consultee', 'traitee', 'expiree')),
  created_at timestamptz NOT NULL DEFAULT now(),
  actualisee_le timestamptz NOT NULL DEFAULT now(),
  consultee_le timestamptz,
  consultee_par uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  traitee_le timestamptz,
  traitee_par uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  expiree_le timestamptz,
  UNIQUE (institution_id, cle_deduplication)
);

ALTER TABLE institution_recommandations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_institution_recommandations_institution ON institution_recommandations(institution_id, statut);
