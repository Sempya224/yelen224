-- Lot C — Vague 2, table 3/9 (18/10/2026) : paid_services.
-- Policy réelle : paid_services_read_public (SELECT, anon+authenticated,
-- is_active=true) — aucune policy INSERT/UPDATE/DELETE pour ces rôles.
-- Vérifié par grep exhaustif : toutes les écritures (création/modification/
-- suppression d'un service payant) passent par
-- app/api/institution/services/route.ts, en service_role. Aucune écriture
-- anon/authenticated trouvée.
REVOKE ALL ON TABLE paid_services FROM anon, authenticated;
GRANT SELECT ON TABLE paid_services TO anon, authenticated;
