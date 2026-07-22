-- Récurrence sur les événements d'agenda internes (18/07/2026)
-- Pas de matérialisation d'occurrences en base : la route API génère les
-- dates à la volée pour la fenêtre demandée (voir agenda/route.ts).
ALTER TABLE evenements_agenda ADD COLUMN recurrence text NOT NULL DEFAULT 'aucune' CHECK (recurrence IN ('aucune','quotidien','hebdomadaire','mensuel'));
ALTER TABLE evenements_agenda ADD COLUMN recurrence_fin date;
