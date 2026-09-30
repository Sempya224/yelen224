-- Clock In Shift — résumé de pause sur daily_attendance, même convention
-- que retard_minutes/depart_anticipe_minutes (20260805000008) : calculés
-- et STOCKÉS par le job clock-in-daily-attendance à chaque passage (table
-- "résumé recalculable par construction", pas immuable) — pas un calcul à
-- la lecture comme pour la géolocalisation (raison différente : ici la
-- référence "prévu" est le planning au moment du calcul, exactement le
-- même principe déjà appliqué à retard_minutes).
--
-- V1 = une seule pause par jour (décision Bryan 21/09/2026, voir §11 du
-- brief — plusieurs pauses/jour explicitement différé). pause_minutes_reelles
-- reste 0 tant qu'aucune pause n'a été prise ce jour-là (jamais une valeur
-- inventée).
--
-- pause_declenchement : reflète le methode='auto'/'manuel' de l'événement
-- pause_debut d'origine (attendance_logs) — traçabilité demandée §9 du
-- brief, sans dupliquer toute la ligne attendance_logs ici.
--
-- pause_depassement_minutes : minutes au-delà de la durée prévue
-- (work_schedules.pause_obligatoire_minutes) — 0 si la pause s'est
-- terminée dans les temps ou n'a pas encore eu lieu. Calculé une fois
-- pause_fin_reelle connue ; tant que la pause est en cours, cette colonne
-- reste celle du dernier passage du job (latence de 15 min assumée, même
-- limite que le reste de cette table) — le statut "en direct" (En pause /
-- Reprise attendue / Pause dépassée) n'est PAS stocké ici, il est dérivé à
-- la lecture par lib/clockInPause.ts à partir des attendance_logs bruts,
-- jamais ajouté à `statut` (qui reste strictement limité aux 5 valeurs
-- CEO — voir commentaire de 20260805000008).
ALTER TABLE daily_attendance ADD COLUMN pause_debut_reel timestamptz;
ALTER TABLE daily_attendance ADD COLUMN pause_fin_reelle timestamptz;
ALTER TABLE daily_attendance ADD COLUMN pause_minutes_reelles integer NOT NULL DEFAULT 0;
ALTER TABLE daily_attendance ADD COLUMN pause_depassement_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE daily_attendance ADD COLUMN pause_declenchement text;
ALTER TABLE daily_attendance ADD CONSTRAINT daily_attendance_pause_declenchement_check
  CHECK (pause_declenchement IS NULL OR pause_declenchement IN ('auto', 'manuel'));
