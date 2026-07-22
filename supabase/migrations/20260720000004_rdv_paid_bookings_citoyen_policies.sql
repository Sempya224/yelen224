-- Fix : le flux de réservation citoyen (app/rdv/[id]/page.tsx) insère
-- directement dans `rdv` et `paid_bookings` depuis le navigateur (session
-- Supabase Auth du citoyen, rôle "authenticated", auth.uid() = son id réel).
--
-- rdv : l'audit du 07/07/2026 documentait 2 policies (rdv_citoyen_insert,
-- rdv_citoyen_own) mais `pg_policies` les montre absentes aujourd'hui
-- (vérifié par Bryan via SQL Editor le 16/07/2026) — table verrouillée à
-- 100%, plus aucun citoyen ne peut créer ni lire ses propres RDV (payants ou
-- gratuits), ni les revoir dans "Mes RDV" (app/mes-rdv/page.tsx). On les
-- recrée à l'identique.
--
-- paid_bookings : n'a jamais eu de policy (verrouillée volontairement à la
-- création, migration 20260709000013, en attendant ce fix) — bloquait toute
-- réservation de service payant dès l'insert, et la lecture de l'historique
-- de paiements du citoyen (app/dashboard/dashboard-client.tsx). Même
-- convention que rdv : auth.uid() = citoyen_id.
CREATE POLICY rdv_citoyen_insert ON rdv
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = citoyen_id);

CREATE POLICY rdv_citoyen_own ON rdv
  FOR SELECT TO authenticated
  USING (auth.uid() = citoyen_id);

CREATE POLICY paid_bookings_citoyen_insert ON paid_bookings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = citoyen_id);

CREATE POLICY paid_bookings_citoyen_own ON paid_bookings
  FOR SELECT TO authenticated
  USING (auth.uid() = citoyen_id);
