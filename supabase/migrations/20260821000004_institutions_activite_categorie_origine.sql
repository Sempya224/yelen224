-- Chantier Taxonomie des activités — Phase 1, migration 4/8. Ajout
-- additif pur : nullable/défaut, aucun backfill, zéro risque du piège
-- "DROP avant backfill" (CLAUDE.md /pieges-techniques-connus) — non
-- applicable ici, aucun CHECK élargi sur des données existantes.
--
-- activite_categorie_id : nouvelle catégorie principale, coexiste avec
-- `secteur` (gelée, jamais réécrite à partir de la Phase 2 du plan
-- d'implémentation — non exécutée par cette migration). `secteur` reste
-- inchangée, `category` (legacy) reste hors périmètre.
--
-- origine_type : attribut d'identité pur (organisation guinéenne ou
-- étrangère, spec §3ter) — n'intervient dans aucun calcul de
-- catégorie/activité/CTA, même garde-fou que `secteur` vis-à-vis du CTA
-- (lib/prestataireCapacites.ts, jamais touché par ce chantier).
ALTER TABLE institutions
  ADD COLUMN activite_categorie_id uuid REFERENCES activite_categories(id),
  ADD COLUMN origine_type text NOT NULL DEFAULT 'guinee' CHECK (origine_type IN ('guinee','etrangere'));
