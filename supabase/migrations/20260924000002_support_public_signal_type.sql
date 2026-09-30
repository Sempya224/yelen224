-- Chantier "Yelen Support Public Général" — Lot Webhooks Postmark
-- (24/09/2026). Étend support_public_signal_log (créée dans
-- 20260924000001_support_tickets_public.sql) pour distinguer les lignes
-- "demande" (déjà insérées à chaque création de ticket public, une par
-- creerTicketPublic) des signaux bounce/spam remontés par les 2 webhooks
-- Postmark (docs/support-center/public-support-technical-design.md §11).
-- 100% additif — colonnes nullable/valeur par défaut, aucune ligne
-- existante à retoucher.

ALTER TABLE support_public_signal_log
  ADD COLUMN type text NOT NULL DEFAULT 'demande' CHECK (type IN ('demande', 'bounce', 'spam')),
  ADD COLUMN postmark_message_id text;

-- Idempotence des webhooks (§11 : "Postmark peut renvoyer le même webhook
-- plusieurs fois en cas de non-200 de notre côté") — au plus une ligne par
-- (postmark_message_id, type). Les lignes "demande" (postmark_message_id
-- NULL) ne sont pas concernées par cet index.
CREATE UNIQUE INDEX support_public_signal_log_postmark_idx
  ON support_public_signal_log (postmark_message_id, type)
  WHERE postmark_message_id IS NOT NULL;
