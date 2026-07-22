-- Correctif Lot A (chantier Messagerie) — `messages.contenu` avait une
-- contrainte NOT NULL préexistante, non vérifiée avant la migration
-- 20260724000006 (celle-ci n'a fait qu'ajouter la CHECK
-- messages_contenu_ou_image, qui suppose contenu nullable pour un message
-- 100% image sans légende). Confirmé en test réel : "null value in column
-- contenu of relation messages violates not-null constraint" lors d'un
-- envoi d'image sans légende (les 2 nouvelles tables messages_yelen_* ne
-- sont pas concernées, contenu y était déjà nullable dès leur création).
ALTER TABLE messages ALTER COLUMN contenu DROP NOT NULL;
