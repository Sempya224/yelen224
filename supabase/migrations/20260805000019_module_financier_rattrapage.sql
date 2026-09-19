-- Rattrapage — 20260722000001_module_financier.sql documenté comme
-- exécuté mais visiblement jamais réellement lancé (erreur réelle
-- rencontrée le 05/08/2026 : "column paid_bookings.montant_paye does not
-- exist" en cliquant "Marquer comme absent" sur le Centre de validation).
-- Version idempotente (IF NOT EXISTS partout) de l'original, sûre à
-- exécuter même si une partie avait déjà été appliquée séparément.
ALTER TABLE paid_bookings
  ADD COLUMN IF NOT EXISTS montant_paye numeric,
  ADD COLUMN IF NOT EXISTS methode_paiement text;

ALTER TYPE statut_paid_booking ADD VALUE IF NOT EXISTS 'rembourse';

UPDATE paid_bookings pb
SET montant_paye = ps.prix
FROM paid_services ps
WHERE pb.service_id = ps.id
  AND pb.montant_paye IS NULL;

ALTER TABLE paid_services
  ADD COLUMN IF NOT EXISTS taux_taxe numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prix_promo numeric,
  ADD COLUMN IF NOT EXISTS promo_actif boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS transactions_financieres (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  paid_booking_id uuid REFERENCES paid_bookings(id) ON DELETE SET NULL,
  type_transaction text NOT NULL CHECK (type_transaction IN ('encaissement', 'remboursement', 'correction', 'annulation', 'ajustement')),
  montant numeric NOT NULL,
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,
  motif text,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  membre_nom text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE transactions_financieres ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS factures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  numero text NOT NULL,
  paid_booking_id uuid NOT NULL REFERENCES paid_bookings(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  montant_ht numeric NOT NULL,
  taux_taxe numeric NOT NULL DEFAULT 0,
  montant_ttc numeric NOT NULL,
  statut text NOT NULL DEFAULT 'emise' CHECK (statut IN ('emise', 'annulee')),
  cree_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, numero)
);
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
