-- Lot B — complément (18/10/2026). Deux ajouts trouvés nécessaires en
-- vérifiant les migrations 20261018000009/000010 avant d'écrire le code
-- serveur :
--
-- 1) messages_yelen_citoyen et conversations référençaient users(id) en
--    ON DELETE CASCADE, jamais traités par les migrations précédentes —
--    alors que avis/rdv ont reçu le même traitement SET NULL pour la même
--    raison (ce sont des traces institutionnelles partagées avec
--    l'institution, pas seulement des données personnelles du citoyen
--    supprimé : un CASCADE effacerait aussi les messages écrits PAR
--    l'institution dans ce fil).
--
--    ⚠️ NON VÉRIFIÉ : la table historique `messages` (citée dans CLAUDE.md
--    /schema, sans CREATE TABLE dans les migrations — table pré-existante
--    comme rdv/paid_bookings) n'a pas pu être auditée depuis cet
--    environnement. À vérifier par Bryan (`\d messages`) avant d'exécuter
--    cette migration : si son FK citoyen est aussi en CASCADE, une
--    migration complémentaire sera nécessaire.
--
-- 2) La fonction d'exécution contrôlée de la suppression elle-même,
--    appelée exclusivement par app/api/citoyen/confidentialite/suppression/
--    executer/route.ts après ré-vérification OTP+PIN/TOTP dans la même
--    requête. SECURITY DEFINER (le DELETE ne passe jamais par une policy
--    RLS citoyen, cohérent avec "RLS zéro policy = service_role
--    uniquement") ; pose les 2 échappatoires d'immuabilité requises par
--    les cascades SET NULL déclenchées par ce DELETE (document_events,
--    points_transactions/reward_events) UNIQUEMENT dans cette transaction
--    (SET LOCAL, jamais de fuite vers une autre session).

ALTER TABLE messages_yelen_citoyen ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE messages_yelen_citoyen DROP CONSTRAINT messages_yelen_citoyen_citoyen_id_fkey;
ALTER TABLE messages_yelen_citoyen
  ADD CONSTRAINT messages_yelen_citoyen_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversations ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT conversations_citoyen_id_fkey;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- Fonction d'exécution — seul point d'entrée autorisé pour le DELETE réel.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.citoyen_supprimer_compte(p_citoyen_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SET LOCAL app.autoriser_correction_points = 'on';
  SET LOCAL app.autoriser_correction_document = 'on';
  DELETE FROM public.users WHERE id = p_citoyen_id;
END;
$$;

-- Jamais exécutable par anon/authenticated (contournerait la policy RLS
-- retirée par la migration 20261018000009) — uniquement service_role,
-- depuis la route API qui a déjà vérifié identité + OTP + PIN/TOTP.
REVOKE ALL ON FUNCTION public.citoyen_supprimer_compte(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.citoyen_supprimer_compte(uuid) TO service_role;
