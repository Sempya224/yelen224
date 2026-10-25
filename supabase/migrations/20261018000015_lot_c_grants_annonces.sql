-- Lot C — Vague 2, table 1/9 (18/10/2026) : annonces.
-- Policy réelle : annonces_public_read (SELECT, anon+authenticated,
-- statut='publiee') — aucune policy INSERT/UPDATE/DELETE pour ces rôles.
-- Vérifié par grep exhaustif du code : toutes les écritures passent par
-- app/api/institution/annonces/route.ts et app/api/admin/annonces/[id]/route.ts,
-- toutes deux en service_role. Aucune écriture anon/authenticated trouvée.
REVOKE ALL ON TABLE annonces FROM anon, authenticated;
GRANT SELECT ON TABLE annonces TO anon, authenticated;
