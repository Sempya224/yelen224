-- Signalements — refonte popup "Nouveau signalement" côté institution
-- (16/09/2026, brief CEO). Le RDV rattaché est déjà nullable (rdv_id),
-- mais il n'existait aucune date propre à l'incident : jusqu'ici la date
-- affichée dans le popup était toujours celle du RDV sélectionné. Le
-- nouveau parcours permet de dater un fait même quand aucun RDV précis
-- n'est rattaché ("Aucun rendez-vous spécifique") — d'où ces 2 colonnes,
-- toutes deux nullables (un signalement créé avant cette migration n'a
-- jamais renseigné ce champ, pas une anomalie).
ALTER TABLE signalements
  ADD COLUMN IF NOT EXISTS incident_date date,
  ADD COLUMN IF NOT EXISTS incident_heure time;
