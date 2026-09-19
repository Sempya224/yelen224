-- Chantier "Messagerie V2" — prérequis pour la réception live via
-- Server-Sent Events (voir app/api/institution/conversations/[id]/stream/route.ts,
-- retour Bryan 06/09/2026). Le serveur (service_role) s'abonne à
-- Realtime sur messages/conversations pour relayer un signal au
-- navigateur — Postgres Changes ne livre des événements que pour les
-- tables membres de la publication `supabase_realtime`.
--
-- Bloc idempotent (safe à rejouer, n'échoue jamais si déjà en place) : le
-- statut réel de cette publication en base n'a jamais été vérifié pour ces
-- deux tables avant ce chantier (aucune trace dans les migrations
-- précédentes malgré des abonnements postgres_changes déjà existants sur
-- rdv/avis/institutions ailleurs dans le code).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;
