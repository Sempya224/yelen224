-- Yelen Community — catégorie de publication obligatoire (retour Bryan
-- 27/07/2026) : max 10 valeurs, volontairement professionnelles/business
-- (jamais politique, race, ethnie...). Badge illustré affiché en haut du
-- fil (filtre) et dans le composeur (obligatoire à la publication).
ALTER TABLE posts
  ADD COLUMN categorie text NOT NULL DEFAULT 'conseils_pratiques'
  CHECK (categorie IN (
    'entrepreneuriat', 'carriere_emploi', 'finance_argent', 'marketing_vente',
    'technologie_innovation', 'developpement_personnel', 'reseautage',
    'actualites_business', 'conseils_pratiques', 'reussite_temoignage'
  ));

-- Signalement de publication/auteur "Yelen Community" — réutilise la table
-- `signalements` existante (déjà générique via cible_type/cible_id/type/
-- auteur_id/description, cf. app/api/admin/signalements/route.ts) plutôt
-- que d'en créer une nouvelle. institution_id n'est renseigné que par
-- l'ancien flux "signaler une institution" (app/signalement/page.tsx) —
-- garde défensive au cas où une contrainte NOT NULL existait encore
-- (no-op si déjà nullable).
ALTER TABLE signalements ALTER COLUMN institution_id DROP NOT NULL;
