-- Migration : rdv.guichet — champ texte libre optionnel (ex: "Guichet 3",
-- "Bureau A"), saisi manuellement par l'institution sur un RDV donné.
-- Volontairement minimal : pas de table de gestion des guichets, juste un
-- champ affiché en badge dans l'écran Rendez-vous (refonte du 20/07/2026).
ALTER TABLE rdv ADD COLUMN guichet text;
