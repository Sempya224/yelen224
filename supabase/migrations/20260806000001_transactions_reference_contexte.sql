-- Transactions — Lot 1 (refonte "journal financier Enterprise", décision
-- CEO 06/08/2026). transactions_financieres (20260722000001) est un grand
-- livre insert-only sans identifiant lisible ni contexte de requête —
-- suffisant tant que l'écran Transactions était une simple liste
-- chronologique, plus maintenant.

-- 1) Référence lisible — même mécanisme que
-- journal_activite_generer_audit_id() (20260723000001) et
-- recus_generer_receipt_id() (20260805000020) : séquence globale, jamais
-- remise à zéro, format TRX-{année}-{compteur6}.
CREATE SEQUENCE transactions_financieres_numero_seq START 1;

CREATE OR REPLACE FUNCTION transactions_financieres_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('transactions_financieres_numero_seq');
  RETURN 'TRX-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$;

ALTER TABLE transactions_financieres
  ADD COLUMN reference text UNIQUE DEFAULT transactions_financieres_generer_reference();
UPDATE transactions_financieres SET reference = transactions_financieres_generer_reference() WHERE reference IS NULL;
ALTER TABLE transactions_financieres ALTER COLUMN reference SET NOT NULL;

-- 2) Contexte de requête — IP/appareil, même colonnes que journal_activite
-- (20260723000001), jamais capturées ici jusqu'à présent. Nullable :
-- jamais rétroactif sur les transactions déjà enregistrées, et certains
-- appels (aucun pour l'instant, mais lib/transactionsFinancieres.ts reste
-- appelable sans req par construction) resteront sans contexte.
ALTER TABLE transactions_financieres
  ADD COLUMN ip text,
  ADD COLUMN user_agent text,
  ADD COLUMN navigateur text,
  ADD COLUMN os text;
