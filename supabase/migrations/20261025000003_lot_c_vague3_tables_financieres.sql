-- Lot C — Vague 3 (25/10/2026) : privilèges des tables financières + paid_services.
-- ⚠️ NON EXÉCUTÉE — à lancer par Bryan :
--   supabase db query --linked -f supabase/migrations/20261025000003_lot_c_vague3_tables_financieres.sql -o table
--
-- CONSTAT (contrôle SQL du 25/10/2026, information_schema + pg_policies) :
--   - recus, transactions_financieres, factures, facture_lignes, facture_paiements,
--     facture_evenements : RLS actif, ZÉRO policy, mais anon ET authenticated
--     gardaient les 7 privilèges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--     TRIGGER, REFERENCES). Même défaut que paid_bookings avant 20261025000001.
--   - paid_services : 1 policy SELECT (is_active = true) mais anon ET authenticated
--     avaient aussi les 7 privilèges — la migration 20261018000017 (qui les ramène
--     à SELECT seul) n'avait donc pas été appliquée en base.
--   - Fonctions SECURITY DEFINER / de trigger exécutables par anon et authenticated
--     (lier_paid_booking_a_rdv, recalculer_montant_paye_facture, recus_*,
--     transactions_financieres_generer_reference) alors qu'elles ne sont appelées
--     que par des triggers ou des DEFAULT de colonne.
--
-- POURQUOI SANS RISQUE : les 6 tables financières ne sont lues/écrites que par des
-- routes API et librairies serveur en service_role (inventaire du 25/10/2026 :
-- aucun écran navigateur ne les touche avec la session d'un citoyen). RLS sans
-- policy les rend déjà inaccessibles à anon/authenticated : ce REVOKE est de la
-- défense en profondeur, il ne change aucun comportement fonctionnel. TRUNCATE en
-- particulier ignore la RLS et les triggers de ligne (recus_immuable).
-- service_role n'est pas touché.
--
-- Idempotente : REVOKE/GRANT rejouables sans effet de bord.

BEGIN;

-- ─── 1. Tables financières : plus aucun privilège pour anon/authenticated ──
REVOKE ALL ON TABLE public.recus,
                    public.transactions_financieres,
                    public.factures,
                    public.facture_lignes,
                    public.facture_paiements,
                    public.facture_evenements
  FROM anon, authenticated;

-- ─── 2. paid_services : SELECT seul (comme 20261018000017) ─────────────────
-- La policy paid_services_read_public (SELECT, anon + authenticated,
-- is_active = true) reste la seule voie de lecture publique ; les écritures
-- passent par app/api/institution/services/route.ts en service_role.
REVOKE ALL ON TABLE public.paid_services FROM anon, authenticated;
GRANT SELECT ON TABLE public.paid_services TO anon, authenticated;

-- ─── 3. Fonctions : EXECUTE retiré à anon/authenticated ────────────────────
-- Les fonctions de trigger n'ont pas besoin d'EXECUTE pour l'appelant : le droit
-- n'est vérifié qu'à la création du trigger. Les deux fonctions utilisées en
-- DEFAULT de colonne ne sont évaluées que par des INSERT en service_role : on
-- redonne explicitement EXECUTE à service_role par prudence.
REVOKE ALL ON FUNCTION public.lier_paid_booking_a_rdv() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculer_montant_paye_facture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recus_interdire_modification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recus_generer_receipt_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transactions_financieres_generer_reference() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recus_generer_receipt_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.transactions_financieres_generer_reference() TO service_role;

COMMIT;
