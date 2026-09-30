-- Clock In Shift — heure de déclenchement de la pause programmée pour un
-- horaire "fixe" (1 seul segment/jour). Décision Bryan 21/09/2026.
--
-- Pour un horaire "fractionné"/"variable" à 2+ segments, la fenêtre de
-- pause programmée se déduit déjà du pattern existant (l'écart entre la
-- fin du 1er segment et le début du 2e) — aucun nouveau champ nécessaire
-- pour ce cas, voir lib/clockInPause.ts::fenetrePauseProgrammee().
--
-- Pour un horaire "fixe" (1 segment), rien ne permettait jusqu'ici de
-- savoir QUAND la pause (déjà configurable en durée via
-- pause_obligatoire_minutes, 20260805000005) doit démarrer. Nullable :
-- une pause programmée/déclenchée automatiquement reste possible
-- seulement si ce champ ET pause_obligatoire_minutes sont renseignés —
-- sinon la pause de cet horaire reste purement manuelle (l'employé peut
-- toujours la déclencher lui-même, juste jamais suggérée/auto-démarrée).
ALTER TABLE work_schedules ADD COLUMN pause_heure_debut text;
ALTER TABLE work_schedules ADD CONSTRAINT work_schedules_pause_heure_debut_format
  CHECK (pause_heure_debut IS NULL OR pause_heure_debut ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
