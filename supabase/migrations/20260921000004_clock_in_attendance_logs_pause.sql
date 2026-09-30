-- Clock In Shift — Gestion de pause comme cycle réel (brief Bryan
-- 21/09/2026, voir échange chantier Clock In). Décision d'architecture
-- validée : la pause est un événement IMBRIQUÉ dans un entree/sortie qui
-- reste ouvert (un seul Clock In / Clock Out par shift), distincte des
-- "segments" de work_schedules.pattern qui continuent de représenter des
-- shifts réellement séparés (ex. régime fractionné avec deux présences
-- physiques distinctes dans la journée). Remplace le commentaire de
-- 20260805000007_clock_in_attendance_logs.sql ("une pause est simplement
-- une sortie suivie d'une entree plus tard") — ce modèle reste vrai pour
-- les segments, plus pour la pause.
--
-- Même table, même immuabilité, même audit trail, même géolocalisation,
-- même file d'attente offline déjà construits pour entree/sortie
-- (20260921000002/000003) — aucune nouvelle infrastructure, juste deux
-- nouvelles valeurs de type_action.
--
-- 'auto' ajouté à methode : distingue un pause_debut déclenché par le
-- serveur (règle de planning, cron dédié — voir
-- 20260921000005_clock_in_pause_trigger_cron.sql) d'un pause_debut
-- déclenché par l'employé lui-même. Jamais utilisé pour pause_fin — la
-- reprise est TOUJOURS une action employé explicite (non négociable,
-- brief Bryan §4).
ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_type_action_check;
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_type_action_check
  CHECK (type_action IN ('entree', 'sortie', 'pause_debut', 'pause_fin'));

ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_methode_check;
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_methode_check
  CHECK (methode IN ('pin', 'qr', 'manuel', 'biometrique', 'auto'));
