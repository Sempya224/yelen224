-- Migration : policy RLS lecture publique annonces publiées (audit 09/07/2026)
CREATE POLICY annonces_public_read ON annonces
  FOR SELECT TO anon, authenticated
  USING (statut = 'publiee');