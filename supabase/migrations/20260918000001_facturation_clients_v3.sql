-- Facturation clients V3 (18/09/2026) — bascule de "la facture est un
-- reçu généré après un paiement déjà confirmé" vers un vrai système de
-- facturation (facturer avant paiement, lignes multiples, échéance,
-- paiements partiels). Distinct de "Facturation Yelen" (Yelen Business) :
-- ceci concerne Établissement → Client, jamais Yelen → Établissement.
--
-- paid_booking_id devient optionnel : le flux existant (générer une
-- facture/reçu depuis un paid_booking déjà payé) reste inchangé et
-- continue de fonctionner en parallèle du nouveau flux manuel
-- (cree_depuis='manuelle', lignes ajoutées via facture_lignes).
ALTER TABLE factures ALTER COLUMN paid_booking_id DROP NOT NULL;
ALTER TABLE factures ADD COLUMN date_echeance timestamptz;
ALTER TABLE factures ADD COLUMN montant_paye numeric NOT NULL DEFAULT 0;
ALTER TABLE factures ADD COLUMN cree_depuis text NOT NULL DEFAULT 'paid_booking'
  CHECK (cree_depuis IN ('paid_booking', 'manuelle'));

-- Cycle de statut étendu (était emise/annulee uniquement). 'en_retard'
-- n'est JAMAIS stocké — dérivé à la lecture (date_echeance dépassée +
-- statut pas encore payee/annulee/remboursee), même principe que
-- "Expiré" sur citoyen_documents (aucun job cron dédié nécessaire).
-- Les factures existantes restent 'emise' (valeur toujours valide dans
-- le nouvel ensemble) ou 'annulee'.
ALTER TABLE factures DROP CONSTRAINT factures_statut_check;
ALTER TABLE factures ADD CONSTRAINT factures_statut_check
  CHECK (statut IN ('brouillon','emise','envoyee','partiellement_payee','payee','annulee','remboursee'));
-- 'emise' conservé dans l'ensemble valide (factures déjà en base) mais
-- n'est plus la cible pour une nouvelle facture V3 : le flux manuel
-- utilise 'brouillon' puis 'envoyee' ; le flux depuis paid_booking (déjà
-- payé au moment de la génération) passe directement à 'payee'.

CREATE TABLE facture_lignes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantite numeric NOT NULL DEFAULT 1,
  prix_unitaire numeric NOT NULL,
  remise numeric NOT NULL DEFAULT 0,
  montant_total numeric NOT NULL,
  ordre integer NOT NULL DEFAULT 0
);
ALTER TABLE facture_lignes ENABLE ROW LEVEL SECURITY;
-- Aucune policy — RLS activé, accès exclusivement service_role via les
-- routes /api/institution/factures/*, même convention que `factures`
-- (aucune policy non plus) et la quasi-totalité des tables sensibles du
-- projet où l'appelant n'a pas de session Supabase Auth (institution).
CREATE INDEX facture_lignes_facture_id_idx ON facture_lignes(facture_id);

CREATE TABLE facture_paiements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  montant numeric NOT NULL,
  methode text NOT NULL, -- 'mobile_money' | 'virement' | 'especes' | 'carte' | 'autre'
  date_paiement timestamptz NOT NULL DEFAULT now(),
  reference text,
  note text,
  preuve_url text,
  enregistre_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE facture_paiements ENABLE ROW LEVEL SECURITY;
CREATE INDEX facture_paiements_facture_id_idx ON facture_paiements(facture_id);

-- Historique d'activité de la facture — insert-only, mirroring
-- signalement_events/document_events (audit léger par domaine, pas la
-- version à immuabilité forcée par trigger réservée aux journaux de
-- conformité comme journal_activite/attendance_audit_logs).
CREATE TABLE facture_evenements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  facture_id uuid NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  type_evenement text NOT NULL, -- 'creee'|'envoyee'|'paiement_recu'|'rappel_envoye'|'annulee'|'remboursee'
  details jsonb,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL, -- NULL = événement système
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE facture_evenements ENABLE ROW LEVEL SECURITY;
CREATE INDEX facture_evenements_facture_id_idx ON facture_evenements(facture_id);

-- Recalcul montant_paye/statut à chaque paiement — recalcul complet par
-- SUM(), jamais un incrément applicatif (même principe que
-- institutions.nb_abonnes/moyenne_avis : source unique de vérité fiable
-- même si un futur chemin de code écrit directement dans facture_paiements).
CREATE OR REPLACE FUNCTION recalculer_montant_paye_facture() RETURNS trigger AS $$
DECLARE
  v_facture_id uuid;
  v_total_paye numeric;
  v_montant_ttc numeric;
  v_statut_actuel text;
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  SELECT COALESCE(SUM(montant), 0) INTO v_total_paye FROM facture_paiements WHERE facture_id = v_facture_id;
  SELECT montant_ttc, statut INTO v_montant_ttc, v_statut_actuel FROM factures WHERE id = v_facture_id;
  UPDATE factures SET montant_paye = v_total_paye,
    statut = CASE
      WHEN v_statut_actuel IN ('annulee', 'remboursee') THEN v_statut_actuel
      WHEN v_total_paye >= v_montant_ttc AND v_montant_ttc > 0 THEN 'payee'
      WHEN v_total_paye > 0 THEN 'partiellement_payee'
      ELSE v_statut_actuel
    END
  WHERE id = v_facture_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS facture_paiements_recalcul ON facture_paiements;
CREATE TRIGGER facture_paiements_recalcul
AFTER INSERT OR UPDATE OR DELETE ON facture_paiements
FOR EACH ROW EXECUTE FUNCTION recalculer_montant_paye_facture();

NOTIFY pgrst, 'reload schema';
