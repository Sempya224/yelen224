-- Comptes inactifs — bloque la création de NOUVEAUX RDV/réservations
-- payantes pendant une suspension pour inactivité (Phase 3, section
-- 2.11.3 de la conception : les engagements existants ne sont jamais
-- touchés, seules les nouvelles opérations sont concernées). Étend les
-- deux policies déjà posées pour citoyen_rdv_restrictions (migration
-- 20260903000001) plutôt que d'en créer une 3e en parallèle — reserver_creneau_rdv/
-- reserver_creneau_rdv_payant (migration 20260915000001) ne sont PAS
-- SECURITY DEFINER, ces policies RLS s'appliquent donc réellement à ces
-- deux chemins d'écriture (vérifié dans ce fichier-ci).
DROP POLICY IF EXISTS rdv_citoyen_insert ON rdv;
CREATE POLICY rdv_citoyen_insert ON rdv
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT EXISTS (
      SELECT 1 FROM citoyen_rdv_restrictions
      WHERE citoyen_id = auth.uid() AND statut = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM citoyen_inactivite_suspensions
      WHERE citoyen_id = auth.uid() AND statut = 'active'
    )
  );

DROP POLICY IF EXISTS paid_bookings_citoyen_insert ON paid_bookings;
CREATE POLICY paid_bookings_citoyen_insert ON paid_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT EXISTS (
      SELECT 1 FROM citoyen_rdv_restrictions
      WHERE citoyen_id = auth.uid() AND statut = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM citoyen_inactivite_suspensions
      WHERE citoyen_id = auth.uid() AND statut = 'active'
    )
  );
