-- Fiche chambre structurée — Hôtel (chantier "Créer une chambre" V2,
-- brief CEO 25/09/2026, même niveau de profondeur que "Créer un service"
-- V2 — migration 20260925000004). 4 colonnes additives nullables sur
-- paid_services, même patron que les colonnes Hôtel précédentes :
-- partagées par les 14 autres secteurs, jamais renseignées par eux en
-- pratique, aucune contrainte NOT NULL/CHECK (validation toujours en
-- application, cohérent avec le reste du projet).
--
-- Pas de duplication métier (revue avant migration, brief §16) :
-- - "Type de chambre" (Chambre simple/double/Suite/Studio…) réutilise la
--   colonne `categorie` déjà existante (texte libre, déjà utilisée comme
--   famille pour les prestations) — aucune nouvelle colonne.
-- - "Ce qui est inclus / non inclus" réutilise `inclus`/`non_inclus`
--   (migration 20260925000004, génériques sur paid_services) — aucune
--   nouvelle colonne.
-- - "Informations pratiques" réutilise `a_savoir` (migration
--   20260925000004, générique) — aucune nouvelle colonne.
-- - "Literie / configuration" réutilise `equipements_chambre` (jsonb déjà
--   existant) via une 4e catégorie ajoutée à la taxonomie applicative
--   (lib/hotelEquipements.tsx) — aucune nouvelle colonne ni nouveau
--   mécanisme, cohérent avec le système de checkboxes déjà en place.
BEGIN;

ALTER TABLE paid_services
  -- Capacité maximale (personnes) — obligatoire côté formulaire Chambre,
  -- nullable en base (colonne partagée par les 14 autres secteurs).
  ADD COLUMN capacite_max integer NULL,
  -- Sous-répartition adultes/enfants — facultative, affichée uniquement
  -- si renseignée (jamais une valeur par défaut inventée).
  ADD COLUMN capacite_adultes integer NULL,
  ADD COLUMN capacite_enfants integer NULL,
  -- Superficie en m² — facultative, aucune conversion d'unité (une seule
  -- unité supportée, cohérent avec le reste du produit qui n'a qu'une
  -- seule devise/un seul système de mesure).
  ADD COLUMN superficie_m2 numeric(6,2) NULL;

COMMIT;

-- Aucun changement de RLS : les policies existantes sur paid_services
-- (lecture publique is_active=true, écriture service_role via
-- api/institution/services/route.ts) couvrent déjà ces nouvelles colonnes
-- sans modification.
