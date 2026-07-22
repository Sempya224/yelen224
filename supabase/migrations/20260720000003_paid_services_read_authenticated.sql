-- Fix : le flux de réservation citoyen (app/rdv/[id]/page.tsx) lit
-- paid_services en rôle "authenticated" une fois le citoyen connecté
-- (Supabase Auth), pas "anon". La policy paid_services_read_anon
-- (migration 20260709000013) ne couvrait que anon → invisible pour tout
-- citoyen connecté. Condition inchangée (is_active=true) : donnée publique
-- par construction (fiche services d'un établissement), sans risque à
-- l'ouvrir aussi aux utilisateurs connectés.
DROP POLICY paid_services_read_anon ON paid_services;

CREATE POLICY paid_services_read_public ON paid_services
  FOR SELECT TO anon, authenticated
  USING (is_active = true);
