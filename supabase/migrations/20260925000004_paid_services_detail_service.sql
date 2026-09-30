-- Fiche service structurée — Hôtel (chantier "Créer un service" V2,
-- brief CEO 25/09/2026) : un service Yelen doit permettre au citoyen de
-- comprendre quoi/pour qui/inclus/non inclus/prix/durée/conditions sans
-- contacter l'établissement. 5 colonnes additives nullables sur
-- paid_services, même patron que les colonnes Hôtel précédentes
-- (20260821000010/20260917000001) : partagées par les 14 autres secteurs,
-- jamais renseignées par eux en pratique, aucune contrainte NOT NULL sauf
-- les tableaux jsonb (défaut '[]', jamais une valeur pré-remplie inventée).
BEGIN;

ALTER TABLE paid_services
  -- Résumé court affiché dans les cartes/listes citoyen — distinct de
  -- `description` (devient la description détaillée). NULL tant que le
  -- prestataire ne l'a pas renseigné, jamais dérivé automatiquement de
  -- `description` (perdrait le sens de "résumé rédigé exprès").
  ADD COLUMN description_courte text NULL,
  -- Éléments réellement inclus/non inclus — texte libre saisi par le
  -- prestataire (jamais une liste pré-cochée), affiché tel quel côté
  -- citoyen. jsonb array de strings, même esprit que photos/champs_complementaires.
  ADD COLUMN inclus jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN non_inclus jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Note libre : conditions/informations pratiques à connaître avant
  -- réservation, affichée telle quelle côté citoyen. NULL si non renseigné.
  ADD COLUMN a_savoir text NULL,
  -- Sous-ensemble de {individuel,couple,famille,groupe} — vocabulaire
  -- fermé donné par le brief produit, validé côté route API (même patron
  -- que equipements_chambre/CODES_EQUIPEMENTS_CHAMBRE). Vide par défaut,
  -- jamais une valeur par défaut inventée.
  ADD COLUMN public_cible jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;

-- Aucun changement de RLS : les policies existantes sur paid_services
-- (lecture publique is_active=true, écriture service_role via
-- api/institution/services/route.ts) couvrent déjà ces nouvelles colonnes
-- sans modification.
