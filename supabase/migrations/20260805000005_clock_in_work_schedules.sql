-- Clock In Shift — 5/9. `work_schedules` doit supporter 4 régimes horaires
-- (décision CEO) sans jamais nécessiter de refonte future : fixe,
-- fractionné, nuit, variable. `type_horaire` est une étiquette UI/
-- classification seulement — le stockage réel est toujours la même forme
-- JSON dans `pattern`, ce qui couvre les 4 régimes uniformément.
--
-- Forme canonique de `pattern` (validée en profondeur côté API/Zod, pas en
-- CHECK SQL — cohérent avec institutions.disponibilites, autre colonne
-- jsonb du projet déjà sans CHECK structurel profond) :
--
-- {
--   "jours": {
--     "lundi":    { "repos": false, "segments": [{"debut":"08:00","fin":"17:00"}] },
--     "mardi":    { "repos": false, "segments": [{"debut":"08:00","fin":"17:00"}] },
--     "mercredi": { "repos": false, "segments": [{"debut":"08:00","fin":"17:00"}] },
--     "jeudi":    { "repos": false, "segments": [{"debut":"08:00","fin":"17:00"}] },
--     "vendredi": { "repos": false, "segments": [{"debut":"08:00","fin":"17:00"}] },
--     "samedi":   { "repos": true,  "segments": [] },
--     "dimanche": { "repos": true,  "segments": [] }
--   }
-- }
--
-- Fixe      : un seul segment identique chaque jour ouvré.
-- Fractionné: deux segments par jour ouvré (ex. 08h-12h + 14h-18h).
-- Nuit      : segment marqué explicitement "traverse_minuit": true (ex.
--             {"debut":"22:00","fin":"06:00","traverse_minuit":true}) —
--             jamais déduit implicitement de fin < debut, pour éviter toute
--             ambiguïté dans le calcul de daily_attendance. Décision
--             tranchée en review de plan : date_jour attribué au jour de
--             DÉBUT du service (22h lundi → 06h mardi = ligne du lundi).
-- Variable  : segments/repos différents par jour — cas général, dont fixe
--             et fractionné ne sont que des cas particuliers.
--
-- Tolérances (retard/départ anticipé/pause/heures sup) portées ICI, sur
-- work_schedules, pas sur un réglage global institution — décision tranchée
-- en review de plan : permet des tolérances différentes entre équipe de
-- jour et équipe de nuit ; une entreprise qui veut une valeur unique la
-- répète simplement sur tous ses horaires.
CREATE TABLE work_schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nom text NOT NULL,
  type_horaire text NOT NULL
    CHECK (type_horaire IN ('fixe', 'fractionne', 'nuit', 'variable')),
  pattern jsonb NOT NULL CHECK (pattern ? 'jours'),
  tolerance_retard_minutes integer NOT NULL DEFAULT 10,
  tolerance_depart_anticipe_minutes integer NOT NULL DEFAULT 0,
  pause_obligatoire_minutes integer NOT NULL DEFAULT 0,
  heures_sup_autorisees boolean NOT NULL DEFAULT false,
  heures_sup_seuil_minutes integer,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;
