-- Migration : policy RLS lecture publique institutions validées (audit 09/07/2026)
-- Note : app/recherche/page.tsx a un bug de code (filtre "active" invalide, devrait être "validee")
-- et app/carte/page.tsx ne filtre aucun statut - cette policy protège au niveau DB
-- peu importe ce que le code filtre côté client. Voir mémoire pour dette Phase 4.

CREATE POLICY institutions_public_read ON institutions
  FOR SELECT TO anon, authenticated
  USING (statut = 'validee');