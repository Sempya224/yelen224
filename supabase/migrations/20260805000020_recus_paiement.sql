-- Reçu Yelen — Lot A (double confirmation paiement, décision CEO 05/08/2026).
-- Reçu ≠ Facture (décision explicite) : une facture est un document
-- comptable facultatif (HT/TTC/taxe, table `factures` existante,
-- 20260722000001), un reçu est la preuve qu'un paiement a réellement été
-- encaissé, tri-partite (citoyen/institution/Yelen), obligatoire dès qu'un
-- paiement est confirmé. Cycles de vie différents => table séparée,
-- jamais mélangée avec `factures`.
--
-- Ce lot NE touche PAS paid_bookings.statut (pas de nouvelle valeur
-- d'enum ici) : app/institution/[id]/dashboard/components/ValiderRdvTab.tsx
-- a un type BookingStatut fermé + STATUT_CONFIG non exhaustif sur l'enum
-- réel (il ne gère déjà pas 'rembourse' aujourd'hui). Faire transiter une
-- réservation vers un nouveau statut avant que ce fichier ne sache
-- l'afficher ferait planter la fiche de validation au premier agent qui
-- l'ouvre. La transition de statut arrive au Lot B, en même temps que la
-- mise à jour de ce composant.

-- 1) Déclaration citoyen — capturée sur paid_bookings sans changer son
-- statut. montant_declare_citoyen fige le montant au moment de la
-- déclaration (pas à la confirmation institution comme montant_paye le
-- faisait jusqu'ici, voir app/api/institution/paid-bookings/valider/route.ts)
-- pour que les deux parties valident exactement la même somme, sans
-- fenêtre où le tarif du service pourrait changer entre les deux étapes.
ALTER TABLE paid_bookings
  ADD COLUMN IF NOT EXISTS montant_declare_citoyen numeric,
  ADD COLUMN IF NOT EXISTS declare_le timestamptz;

-- 2) Identifiant lisible du reçu — même mécanisme que
-- journal_activite_generer_audit_id() (20260723000001) : séquence globale,
-- jamais remise à zéro, format YL-{année}-{compteur8}.
CREATE SEQUENCE recus_numero_seq START 1;

CREATE OR REPLACE FUNCTION recus_generer_receipt_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('recus_numero_seq');
  RETURN 'YL-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

-- 3) Table recus — un reçu par paid_booking (UNIQUE), jamais généré à la
-- volée : un objet métier avec son propre cycle de vie (créé → disponible
-- → consulté → téléchargé → vérifié → archivé), chaque transition
-- horodatée. Ce lot crée le schéma vide ; rempli au Lot B (transaction_id,
-- membre confirmant) et Lot C (pdf_storage_path). RESTRICT partout (jamais
-- de suppression silencieuse d'une preuve de paiement via un ON DELETE
-- CASCADE en amont).
CREATE TABLE recus (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id text NOT NULL UNIQUE DEFAULT recus_generer_receipt_id(),
  paid_booking_id uuid NOT NULL UNIQUE REFERENCES paid_bookings(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transaction_id uuid REFERENCES transactions_financieres(id) ON DELETE SET NULL,
  montant numeric NOT NULL,
  montant_declare_citoyen numeric NOT NULL,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  membre_nom text NOT NULL,
  statut text NOT NULL DEFAULT 'cree' CHECK (statut IN ('cree','disponible','consulte','telecharge','verifie','archive')),
  pdf_storage_path text,
  pdf_genere_le timestamptz,
  disponible_le timestamptz,
  consulte_le timestamptz,
  telecharge_le timestamptz,
  verifie_le timestamptz,
  archive_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recus_citoyen_idx ON recus (citoyen_id);
CREATE INDEX recus_institution_idx ON recus (institution_id);

-- RLS activé, ZÉRO policy — accès exclusivement service_role, même
-- convention que transactions_financieres/factures (institution en JWT
-- custom, jamais de session Supabase Auth ; l'accès citoyen à "Mes reçus",
-- Lot D, passera par une route service_role plutôt qu'une policy
-- auth.uid() = citoyen_id, pour garder le même contrôle d'accès qu'une
-- transaction financière).
ALTER TABLE recus ENABLE ROW LEVEL SECURITY;

-- 4) Immuabilité partielle — plus stricte que daily_attendance
-- (recalculable, volontairement pas immuable) mais moins que
-- journal_activite (aucune colonne n'y change jamais après insertion).
-- Un reçu a un vrai cycle de vie : les colonnes de lifecycle DOIVENT
-- pouvoir être mises à jour. Les colonnes de preuve (montant, références,
-- parties) ne doivent jamais changer une fois le reçu créé. DELETE
-- toujours bloqué ("archivé", jamais supprimé), y compris pour
-- service_role/postgres superuser — mêmes échappatoires SET LOCAL que
-- journal_activite/attendance_logs pour une correction manuelle
-- exceptionnelle et documentée.
CREATE OR REPLACE FUNCTION recus_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.autoriser_correction_recu', true) = 'on' THEN
      RAISE WARNING 'recus: suppression manuelle exceptionnelle autorisée (id=%, receipt_id=%). À documenter par ailleurs.', OLD.id, OLD.receipt_id;
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'recus est immuable : un reçu ne peut jamais être supprimé, seulement archivé (id=%, receipt_id=%).', OLD.id, OLD.receipt_id;
  END IF;

  IF current_setting('app.autoriser_correction_recu', true) = 'on' THEN
    RAISE WARNING 'recus: modification manuelle exceptionnelle autorisée (id=%, receipt_id=%). À documenter par ailleurs.', OLD.id, OLD.receipt_id;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id
     OR NEW.paid_booking_id IS DISTINCT FROM OLD.paid_booking_id
     OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.citoyen_id IS DISTINCT FROM OLD.citoyen_id
     OR NEW.montant IS DISTINCT FROM OLD.montant
     OR NEW.montant_declare_citoyen IS DISTINCT FROM OLD.montant_declare_citoyen
     OR NEW.membre_id IS DISTINCT FROM OLD.membre_id
     OR NEW.membre_nom IS DISTINCT FROM OLD.membre_nom
     OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'recus : les champs de preuve (montant, références, parties) sont immuables — seuls le statut et les horodatages de cycle de vie peuvent être mis à jour (id=%, receipt_id=%).', OLD.id, OLD.receipt_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER recus_immuable
  BEFORE UPDATE OR DELETE ON recus
  FOR EACH ROW EXECUTE FUNCTION recus_interdire_modification();
