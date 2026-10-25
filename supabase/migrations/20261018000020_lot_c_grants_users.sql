-- Lot C — Vague 2, table 6/9 (18-19/10/2026) : users.
-- Policies réelles (post-Lot B, migration 20261018000009) : citoyen_select
-- (SELECT, auth.uid()=id), citoyen_update (UPDATE, auth.uid()=id) —
-- aucune policy INSERT (création de compte passe par Supabase Auth +
-- route d'inscription service_role) ni DELETE (suppression exclusivement
-- via la fonction SECURITY DEFINER citoyen_supprimer_compte, Lot B).
-- Vérifié par grep exhaustif : toutes les écritures client-direct trouvées
-- (menu/interets, premiers-pas, informations-personnelles/actions.ts,
-- app/profil/actions.ts::updateCitoyenProfile) sont des UPDATE via
-- createAuthedSupabaseClient, jamais un INSERT/DELETE.
REVOKE ALL ON TABLE users FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE users TO authenticated;
