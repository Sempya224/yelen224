-- Rattrapage "Chaîne Yelen" — audience_events manquants (16/09/2026).
--
-- Cause racine (diagnostiquée en session, corrigée dans app/page.tsx::
-- toggleAbonnement et lib/supportTickets.ts) : `void supabase.from(...).insert(...)`
-- ne déclenche jamais réellement la requête HTTP — les builders supabase-js
-- sont des thenables paresseux, `void` seul n'invoque jamais `.then()`.
-- Résultat : depuis la création de citoyen_abonnement_events (23/08/2026)
-- et jusqu'au déploiement du correctif ci-dessus, AUCUN événement
-- 'abonne'/'desabonne' n'a jamais été réellement enregistré, pour AUCUNE
-- institution — pas seulement le cas de test observé. citoyen_abonnements
-- (la table live, elle correctement écrite) reste donc la seule source de
-- vérité disponible pour reconstituer partiellement cet historique.
--
-- Portée du rattrapage — honnête, pas une reconstruction complète :
--   - 'abonne' : backfillable à 100 % pour les abonnements ENCORE actifs
--     aujourd'hui, avec leur vraie date (citoyen_abonnements.created_at) —
--     donnée réelle déjà en base, pas une valeur inventée.
--   - 'desabonne' : IRRÉCUPÉRABLE. citoyen_abonnements est un hard-delete
--     (décision actée dès sa création, voir migration
--     20260823000002_citoyen_abonnements_institution.sql) — un
--     désabonnement survenu entre le 23/08/2026 et le déploiement du
--     correctif ne laisse plus aucune trace nulle part. Ne jamais fabriquer
--     ces lignes : la courbe de croissance restera donc structurellement
--     incomplète pour toute période chevauchant cette fenêtre, ce qui est
--     préférable à une fausse précision.
--
-- Idempotent (sûr à rejouer) : n'insère que les couples
-- (institution_id, citoyen_id) qui n'ont pas déjà un événement 'abonne'.
INSERT INTO citoyen_abonnement_events (institution_id, citoyen_id, type, created_at)
SELECT ca.institution_id, ca.citoyen_id, 'abonne', ca.created_at
FROM citoyen_abonnements ca
WHERE NOT EXISTS (
  SELECT 1 FROM citoyen_abonnement_events e
  WHERE e.institution_id = ca.institution_id
    AND e.citoyen_id = ca.citoyen_id
    AND e.type = 'abonne'
);
