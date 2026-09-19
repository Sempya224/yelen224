-- Corrections RLS issues de l'audit de consolidation (07/08/2026).
-- Deux anomalies réelles trouvées par relecture exhaustive des 124
-- migrations existantes (voir CLAUDE.md /audit-consolidation-2026-08) :

-- 1) institution_otp : les 3 policies anon (SELECT/INSERT/DELETE) créées
--    par 20260709000013_policies_otp_paid_services.sql donnent un accès
--    quasi-illimité via la clé anon publique (embarquée dans tout bundle
--    client) : n'importe qui peut lire le téléphone+code OTP de connexion
--    de n'importe quelle institution, en insérer de faux, ou supprimer
--    ceux des autres (déni de service sur leur connexion). Le code
--    applicatif (send-otp / verify-otp) n'utilise que le client
--    service_role sur cette table — ces policies anon ne servent à rien
--    fonctionnellement aujourd'hui et ne font que créer un risque de
--    contournement d'authentification si l'OTP en dur (123456, dette
--    connue) est un jour remplacé par un vrai code sans que ces policies
--    ne soient retirées entre-temps.
DROP POLICY IF EXISTS otp_read_anon ON institution_otp;
DROP POLICY IF EXISTS otp_insert_anon ON institution_otp;
DROP POLICY IF EXISTS otp_delete_anon ON institution_otp;

-- 2) notifications : la policy notif_destinataire_own (FOR ALL) n'a
--    jamais eu de WITH CHECK séparé — piège déjà documenté dans CLAUDE.md
--    (/securite) où un FOR ALL sans WITH CHECK réutilise le USING pour
--    valider aussi les INSERT. Inerte aujourd'hui (toutes les écritures
--    passent par le client service_role dans lib/notifications.ts /
--    lib/notificationEngine.ts, qui contourne RLS), mais corrigé pour la
--    défense en profondeur avant qu'un futur insert client-side ne soit
--    ajouté par erreur.
ALTER POLICY notif_destinataire_own ON notifications
  WITH CHECK (auth.uid() = destinataire_id AND destinataire_type = 'citoyen');
