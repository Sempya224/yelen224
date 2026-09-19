-- Canal d'acquisition réel (Application Yelen / Recherche organique /
-- Réseaux sociaux / Site web / Autres) pour la carte "Répartition par
-- canal" du Centre d'Analyse (chantier 04/08/2026). Calculé côté serveur
-- à partir de l'en-tête Referer HTTP comparé au domaine de l'app
-- (lib/canalAcquisition.ts::detecterCanal) — jamais un chiffre inventé.
-- NULL pour toute ligne antérieure à cette migration : aucun backfill
-- possible, l'information n'existait pas avant. Agrégé côté lecture avec
-- COALESCE(canal, 'autres').
ALTER TABLE offre_vues ADD COLUMN canal text;
ALTER TABLE offre_clics ADD COLUMN canal text;
