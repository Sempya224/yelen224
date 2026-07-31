-- Yelen Rewards — Phase 1, fichier 3/8.
--
-- points_transactions = le ledger immuable. Règle CEO non négociable :
-- aucun solde n'est jamais modifié directement (pas de `UPDATE ... SET
-- points = points + 15`) — chaque mouvement est une ligne ici, le solde
-- (reward_balances, fichier 4/8) est toujours dérivé de cette table.
--
-- UNIQUE(reward_event_id) est le 2e verrou anti-duplication (le 1er étant
-- la contrainte sur reward_events) : même si le moteur était appelé deux
-- fois pour le même reward_event_id (retry réseau, double appel), un seul
-- INSERT réussit, l'autre est un no-op via ON CONFLICT DO NOTHING côté
-- lib/rewardsEngine.ts.
CREATE TABLE points_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_event_id uuid NOT NULL UNIQUE REFERENCES reward_events(id) ON DELETE RESTRICT,
  rule_id uuid REFERENCES reward_rules(id) ON DELETE SET NULL,
  points_delta integer NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX points_transactions_citoyen_idx ON points_transactions (citoyen_id, created_at DESC);

-- Lecture : le citoyen voit ses propres lignes (écran "Voir mon
-- historique"). Écriture : aucune policy — service_role uniquement.
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY points_transactions_lecture_propre ON points_transactions
  FOR SELECT USING (auth.uid() = citoyen_id);

-- Immuabilité au niveau base, même mécanisme que
-- journal_activite_interdire_modification (migration 20260723000001) :
-- s'applique à TOUT rôle, y compris service_role et postgres superuser.
-- Une correction (ex. RDV requalifié en absence après coup) se fait par
-- une TRANSACTION COMPENSATOIRE (nouvelle ligne à points_delta négatif),
-- jamais par UPDATE/DELETE de l'historique.
--
-- ⚠️ POUR BRYAN : comme pour journal_activite, ce trigger bloque aussi
-- toute correction manuelle depuis le SQL Editor. Échappatoire identique,
-- dans la MÊME requête (transaction) :
--   SET LOCAL app.autoriser_correction_points = 'on';
--   UPDATE points_transactions SET ... WHERE id = '...';
CREATE OR REPLACE FUNCTION points_transactions_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_points', true) = 'on' THEN
    RAISE WARNING 'points_transactions: modification manuelle exceptionnelle autorisée (id=%). À documenter par ailleurs.', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'points_transactions est immuable : impossible de modifier ou supprimer une ligne (id=%). Utiliser une transaction compensatoire.', OLD.id;
END;
$$;

CREATE TRIGGER points_transactions_immuable
  BEFORE UPDATE OR DELETE ON points_transactions
  FOR EACH ROW EXECUTE FUNCTION points_transactions_interdire_modification();
