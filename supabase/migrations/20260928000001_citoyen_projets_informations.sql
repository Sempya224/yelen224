-- "Mes projets" — Lot 2 : section "Informations" de la fiche détail
-- (brief CEO 28/09/2026, refonte écran détail projet). Même pattern que
-- citoyen_demarches.priorite (migration 20260824000002) : CHECK à 4
-- niveaux, 'normale' comme défaut silencieux (jamais affiché sur les
-- cartes, seules importante/urgente méritent un signal visuel).
--
-- `besoin`/`lieu` en texte libre, sans CHECK (comme institutions.ville) —
-- alimentés notamment par le parcours "Laissez Yelen vous accompagner"
-- (app/menu/projets/accompagnement) mais consultables/modifiables pour
-- n'importe quel projet, pas réservés à ce parcours.
--
-- Colonnes additives avec défaut, aucun backfill nécessaire : pas de
-- conflit avec les lignes déjà écrites depuis le lancement de "Mes
-- projets" le 27/09/2026.

ALTER TABLE citoyen_projets
  ADD COLUMN priorite text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('faible', 'normale', 'importante', 'urgente')),
  ADD COLUMN besoin text,
  ADD COLUMN lieu text;
