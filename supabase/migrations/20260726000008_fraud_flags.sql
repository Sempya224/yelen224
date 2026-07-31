-- Yelen Rewards — Phase 1, fichier 8/8.
--
-- fraud_flags — table de revue manuelle. Aucune détection automatique
-- n'est construite en Phase 1 (pas de job qui y écrit encore) : le
-- schéma existe pour que la Phase 2 (requêtes de détection : ratio
-- anormal de RDV complétés par institution, comptes liés, etc., voir
-- l'analyse Fraud Engineer du plan) n'ait pas besoin d'une nouvelle
-- migration. Un citoyen flaggé ne doit jamais le savoir depuis l'app —
-- donc RLS activé, ZÉRO policy, même pour sa propre ligne (accès
-- exclusivement service_role / futur outillage admin).
CREATE TABLE fraud_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_transaction_id uuid REFERENCES points_transactions(id) ON DELETE SET NULL,
  reward_event_id uuid REFERENCES reward_events(id) ON DELETE SET NULL,
  type_flag text NOT NULL,
  gravite text NOT NULL DEFAULT 'info' CHECK (gravite IN ('info', 'attention', 'critique')),
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'resolu', 'ignore')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  traite_par uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  traite_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fraud_flags_citoyen_idx ON fraud_flags (citoyen_id);

ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
