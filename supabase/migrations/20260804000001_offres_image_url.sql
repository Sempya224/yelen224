-- Photo réelle d'une offre partenaire (chantier "Centre de pilotage des
-- offres" — refonte formulaire de création, 04/08/2026). Jusqu'ici aucune
-- offre n'avait de visuel propre : seul un dégradé généré + le logo de
-- l'institution servaient de repère visuel (voir offreGradient dans
-- app/page.tsx et opengraph-image.tsx). Colonne nullable : une offre sans
-- photo continue de fonctionner exactement comme avant (fallback dégradé
-- inchangé), aucune régression sur les offres existantes.
ALTER TABLE offres ADD COLUMN image_url text;
