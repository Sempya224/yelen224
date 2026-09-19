-- Refonte "Détail du rendez-vous" citoyen (chantier 03/09/2026) — 2 champs
-- réels manquants pour construire une fiche historique honnête sans donnée
-- inventée (voir CLAUDE.md /pieges-techniques-connus pour l'ordre
-- contrainte/backfill).

-- 1) accepte_le — jusqu'ici, aucune colonne ni ligne rdv_events n'enregistre
-- l'instant où l'institution accepte un RDV (nouveau → en_attente).
-- Nullable, JAMAIS backfillée : impossible de reconstituer cet instant pour
-- les RDV déjà acceptés avant cette migration, ils resteront sans cette
-- date (l'écran doit afficher l'étape "acceptée" sans horodatage dans ce
-- cas, jamais une date fabriquée). Renseignée uniquement par
-- app/api/institution/rdv/statut/route.ts à partir de maintenant.
ALTER TABLE rdv ADD COLUMN accepte_le timestamptz;

-- 2) reference — même mécanisme que transactions_financieres_generer_reference()
-- (20260806000001) / recus_generer_receipt_id() (20260805000020) /
-- journal_activite_generer_audit_id() (20260723000001) : séquence globale,
-- jamais remise à zéro, format RDV-{année}-{compteur6}.
CREATE SEQUENCE rdv_numero_seq START 1;

CREATE OR REPLACE FUNCTION rdv_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('rdv_numero_seq');
  RETURN 'RDV-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$;

ALTER TABLE rdv
  ADD COLUMN reference text UNIQUE DEFAULT rdv_generer_reference();
UPDATE rdv SET reference = rdv_generer_reference() WHERE reference IS NULL;
ALTER TABLE rdv ALTER COLUMN reference SET NOT NULL;
