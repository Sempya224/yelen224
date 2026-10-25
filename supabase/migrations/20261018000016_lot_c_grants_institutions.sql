-- Lot C — Vague 2, table 2/9 (18/10/2026) : institutions.
-- Policies réelles : institutions_public_read (SELECT, anon+authenticated,
-- statut='validee') et institutions_read_via_own_rdv (SELECT, authenticated
-- seul, via EXISTS sur rdv) — aucune policy INSERT/UPDATE/DELETE pour ces
-- rôles (institutions gérées par JWT custom + routes service_role, jamais
-- de session Supabase Auth côté institution). Vérifié par grep exhaustif :
-- toutes les écritures (profile, suspension, partenariat, communauté...)
-- passent par service_role (app/api/institution/**, app/api/admin/**,
-- Edge Functions). Aucune écriture anon/authenticated trouvée.
REVOKE ALL ON TABLE institutions FROM anon, authenticated;
GRANT SELECT ON TABLE institutions TO anon, authenticated;
