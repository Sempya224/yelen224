-- Migration : policies RLS pour institution_otp (accès anon limité) et paid_services (lecture publique)
-- Audit 09/07/2026 — voir CLAUDE.md / mémoire pour le contexte architectural complet
-- (institution_sessions, paiements, paid_bookings, rdv_events restent volontairement 
-- verrouillés en attendant la migration des écritures institution vers des routes API service_role)

CREATE POLICY otp_read_anon ON institution_otp
  FOR SELECT TO anon
  USING (expires_at > now());

CREATE POLICY otp_insert_anon ON institution_otp
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY otp_delete_anon ON institution_otp
  FOR DELETE TO anon
  USING (true);

CREATE POLICY paid_services_read_anon ON paid_services
  FOR SELECT TO anon
  USING (is_active = true);