-- Yelen Rewards — Phase 1, fichier 4/8.
--
-- reward_balances = solde dérivé, une ligne par citoyen. Jamais écrit
-- directement par l'application (aucune route ne fait un
-- `.update({ balance: ... })`) — uniquement par le trigger ci-dessous,
-- déclenché après chaque insertion dans points_transactions, dans la
-- MÊME transaction (donc jamais désynchronisé même en cas de coupure
-- réseau côté client après l'insert serveur). Un job de réconciliation
-- nocturne (pg_cron, sur le modèle de rappels-rdv) recalcule et corrige
-- tout écart comme filet de sécurité.
--
-- lifetime_earned = somme des gains uniquement (jamais décrémenté par un
-- points_delta négatif) — c'est ce total, pas le solde courant, qui
-- pilote le franchissement des paliers (fichier 6/8) : une pénalité
-- ultérieure ne doit jamais faire "reperdre" un palier déjà débloqué.
CREATE TABLE reward_balances (
  citoyen_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  lifetime_earned integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_balances_lecture_propre ON reward_balances
  FOR SELECT USING (auth.uid() = citoyen_id);

CREATE OR REPLACE FUNCTION points_transactions_maj_solde() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reward_balances (citoyen_id, balance, lifetime_earned, updated_at)
  VALUES (NEW.citoyen_id, NEW.points_delta, GREATEST(NEW.points_delta, 0), now())
  ON CONFLICT (citoyen_id) DO UPDATE SET
    balance = reward_balances.balance + NEW.points_delta,
    lifetime_earned = reward_balances.lifetime_earned + GREATEST(NEW.points_delta, 0),
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Préfixe numérique volontaire (01_) : ce trigger n'a pas besoin de
-- s'exécuter avant celui du fichier 6/8 (qui recalcule sa propre somme
-- indépendamment par robustesse), mais le préfixe documente l'ordre voulu
-- si jamais quelqu'un ajoute un 3e trigger AFTER INSERT plus tard.
CREATE TRIGGER points_transactions_01_maj_solde
  AFTER INSERT ON points_transactions
  FOR EACH ROW EXECUTE FUNCTION points_transactions_maj_solde();

-- Réconciliation nocturne — pure SQL (pas d'appel HTTP/edge function
-- nécessaire ici, contrairement à rappels-rdv qui appelle du code Deno) :
-- recalcule chaque solde depuis la somme réelle du ledger, ne touche que
-- les lignes qui ont dérivé. Alerte à surveiller : si cette fonction
-- corrige quoi que ce soit régulièrement, c'est un signal qu'un chemin
-- d'écriture contourne le trigger — à investiguer, pas à ignorer.
CREATE OR REPLACE FUNCTION reward_balances_reconcilier() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reward_balances (citoyen_id, balance, lifetime_earned, updated_at)
  SELECT
    citoyen_id,
    COALESCE(SUM(points_delta), 0),
    COALESCE(SUM(GREATEST(points_delta, 0)), 0),
    now()
  FROM points_transactions
  GROUP BY citoyen_id
  ON CONFLICT (citoyen_id) DO UPDATE SET
    balance = EXCLUDED.balance,
    lifetime_earned = EXCLUDED.lifetime_earned,
    updated_at = now()
  WHERE reward_balances.balance IS DISTINCT FROM EXCLUDED.balance
     OR reward_balances.lifetime_earned IS DISTINCT FROM EXCLUDED.lifetime_earned;
END;
$$;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'yelen-reconciliation-points',
  '0 3 * * *',
  $$ SELECT reward_balances_reconcilier(); $$
);

-- Pour vérifier : select * from cron.job where jobname = 'yelen-reconciliation-points';
-- Pour lancer manuellement une fois : select reward_balances_reconcilier();
