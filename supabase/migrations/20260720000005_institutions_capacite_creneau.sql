-- Lot B (refonte wizard RDV citoyen, 16/07/2026) : capacité réelle par
-- créneau, nécessaire pour griser les jours/créneaux complets. Colonne
-- dédiée plutôt que de réutiliser institutions.capacite (champ texte libre
-- "Capacité d'accueil" du Profil Entreprise, jamais relié à une logique de
-- réservation, sémantique différente et incertaine).
ALTER TABLE institutions ADD COLUMN capacite_par_creneau integer NOT NULL DEFAULT 1;
