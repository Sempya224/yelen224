-- Booking Governance, Lot 1 (vision CEO, docs/product/YELEN_BOOKING_GOVERNANCE.md
-- §3/§11) — pause volontaire établissement : bloque uniquement les
-- NOUVELLES réservations, jamais les RDV déjà confirmés. Première pièce du
-- nouveau modèle, volontairement isolée (zéro dépendance sur
-- institutions.statut / institution_suspensions, décision §2/§10).
CREATE TABLE institution_reservation_pauses (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('immediate', 'jusqu_a_date', 'periode')),
  debut_le       timestamptz NOT NULL DEFAULT now(),
  -- null = pas de fin programmée, levée manuelle requise (cas 'immediate').
  fin_le         timestamptz,
  -- Interne à l'établissement uniquement — jamais exposé au citoyen (§6).
  motif          text,
  cree_par       uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  levee_le       timestamptz,
  levee_par      uuid REFERENCES institution_membres(id) ON DELETE SET NULL
);

CREATE INDEX institution_reservation_pauses_institution_id_idx
  ON institution_reservation_pauses(institution_id);

-- Pas de colonne "actif" stockée : l'état est dérivé à la lecture
-- (leve_le IS NULL AND debut_le <= now() AND (fin_le IS NULL OR fin_le >
-- now())) — même discipline que "Expiré" sur citoyen_documents, pas de job
-- cron nécessaire pour ce Lot 1.
CREATE INDEX institution_reservation_pauses_active_idx
  ON institution_reservation_pauses(institution_id) WHERE levee_le IS NULL;

ALTER TABLE institution_reservation_pauses ENABLE ROW LEVEL SECURITY;
-- Zéro policy : institution n'a pas de session Supabase Auth (JWT custom),
-- accès exclusivement service_role depuis l'API dashboard — même
-- convention que institution_suspensions/citoyen_rdv_restrictions.

-- Fonction SECURITY DEFINER (même construction que le correctif Lot 0,
-- 20261018000005) — jamais un EXISTS brut référencé depuis une policy
-- RLS d'une autre table, pour ne pas reproduire le bug qui vient d'y être
-- corrigé.
CREATE OR REPLACE FUNCTION public.institution_a_pause_active(p_institution_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM institution_reservation_pauses
    WHERE institution_id = p_institution_id
      AND levee_le IS NULL
      AND debut_le <= now()
      AND (fin_le IS NULL OR fin_le > now())
  );
$$;

REVOKE ALL ON FUNCTION public.institution_a_pause_active FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.institution_a_pause_active(uuid) TO authenticated;

-- Policies étendues une 3e fois (après 20260903000001 et 20261015000003) —
-- couvre d'un coup les 3 chemins de création actuels (reserver_creneau_rdv,
-- reserver_creneau_rdv_payant, reserver_chambre_hotel), aucun n'étant
-- SECURITY DEFINER : vrai verrou serveur, pas seulement le message JS
-- humanisé ajouté côté app/rdv/[id]/actions.ts.
DROP POLICY IF EXISTS rdv_citoyen_insert ON rdv;
CREATE POLICY rdv_citoyen_insert ON rdv
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT public.citoyen_a_restriction_rdv_active(auth.uid())
    AND NOT public.citoyen_a_suspension_inactivite_active(auth.uid())
    AND NOT public.institution_a_pause_active(institution_id)
  );

DROP POLICY IF EXISTS paid_bookings_citoyen_insert ON paid_bookings;
CREATE POLICY paid_bookings_citoyen_insert ON paid_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT public.citoyen_a_restriction_rdv_active(auth.uid())
    AND NOT public.citoyen_a_suspension_inactivite_active(auth.uid())
    AND NOT public.institution_a_pause_active(institution_id)
  );
