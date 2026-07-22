-- Module financier comptable (Yelen PRO) — Phase A.
--
-- Écart corrigé : paid_bookings n'avait aucune colonne de montant, le prix
-- était toujours recalculé à la volée depuis paid_services.prix au moment
-- de la lecture. Si un tarif changeait, tout l'historique (y compris des
-- paiements déjà encaissés) se réécrivait silencieusement avec le nouveau
-- prix. montant_paye fige désormais le prix réellement appliqué, une fois
-- pour toutes, à la confirmation.
--
-- Backfill : les réservations déjà confirmées avant cette migration n'ont
-- jamais eu de prix figé — le backfill ci-dessous ne peut leur donner que
-- le tarif ACTUEL de paid_services, pas celui réellement appliqué au
-- moment de la transaction passée. Perte de précision assumée sur les
-- données historiques, pas un bug de la migration.

ALTER TABLE paid_bookings
  ADD COLUMN montant_paye numeric,
  ADD COLUMN methode_paiement text;

ALTER TYPE statut_paid_booking ADD VALUE IF NOT EXISTS 'rembourse';

UPDATE paid_bookings pb
SET montant_paye = ps.prix
FROM paid_services ps
WHERE pb.service_id = ps.id
  AND pb.montant_paye IS NULL;

ALTER TABLE paid_services
  ADD COLUMN taux_taxe numeric NOT NULL DEFAULT 0,
  ADD COLUMN prix_promo numeric,
  ADD COLUMN promo_actif boolean NOT NULL DEFAULT false;

-- Ledger des mouvements financiers — distinct de journal_activite (générique,
-- polymorphe, insert non-bloquant, aucune colonne montant typée/indexable).
-- Alimenté par les routes paiements/factures, jamais écrit directement par
-- un membre.
CREATE TABLE transactions_financieres (
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

-- Factures — numérotation séquentielle par institution (FA-{année}-{séquence}),
-- une facture par réservation payante. Contrainte unique empêche deux
-- factures avec le même numéro pour une même institution.
CREATE TABLE factures (
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
