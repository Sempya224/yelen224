-- Yelen Rewards — Phase 1, fichier 6/8.
--
-- reward_unlocks = franchissement PERMANENT d'un palier. Une fois
-- débloqué, un palier n'est jamais reperdu (voir lifetime_earned,
-- fichier 4/8) et jamais recalculé silencieusement plus tard — même si
-- la récompense correspondante n'existe pas encore techniquement
-- (offres partenaires), la ligne existe dès le franchissement réel.
--
-- UNIQUE(citoyen_id, milestone_id) : un palier ne peut être débloqué
-- qu'une seule fois par citoyen, `ON CONFLICT DO NOTHING` rend la
-- vérification idempotente même si le trigger se redéclenchait plusieurs
-- fois pour le même citoyen après le franchissement.
CREATE TABLE reward_unlocks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id uuid NOT NULL REFERENCES milestones(id) ON DELETE RESTRICT,
  points_transaction_id uuid REFERENCES points_transactions(id) ON DELETE SET NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  statut text NOT NULL DEFAULT 'debloque' CHECK (statut IN ('debloque', 'notifie', 'reclame')),
  UNIQUE (citoyen_id, milestone_id)
);

ALTER TABLE reward_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_unlocks_lecture_propre ON reward_unlocks
  FOR SELECT USING (auth.uid() = citoyen_id);

-- Volontairement indépendant de reward_balances.lifetime_earned pour ne
-- jamais dépendre de l'ordre d'exécution des triggers AFTER INSERT sur
-- points_transactions : recalcule sa propre somme directement depuis le
-- ledger (la ligne NEW est déjà visible, l'INSERT a eu lieu avant que ce
-- trigger AFTER ne s'exécute).
CREATE OR REPLACE FUNCTION points_transactions_verifier_paliers() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_lifetime integer;
  v_palier record;
BEGIN
  SELECT COALESCE(SUM(GREATEST(points_delta, 0)), 0) INTO v_lifetime
  FROM points_transactions
  WHERE citoyen_id = NEW.citoyen_id;

  FOR v_palier IN
    SELECT id FROM milestones WHERE actif = true AND seuil_points <= v_lifetime
  LOOP
    INSERT INTO reward_unlocks (citoyen_id, milestone_id, points_transaction_id)
    VALUES (NEW.citoyen_id, v_palier.id, NEW.id)
    ON CONFLICT (citoyen_id, milestone_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER points_transactions_02_verifier_paliers
  AFTER INSERT ON points_transactions
  FOR EACH ROW EXECUTE FUNCTION points_transactions_verifier_paliers();
