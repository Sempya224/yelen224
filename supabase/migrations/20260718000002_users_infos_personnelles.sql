-- Champs manquants pour l'écran "Informations personnelles" du nouveau
-- "Mon compte" (structure CEO 18/07/2026, /compte/informations-personnelles,
-- encore vide — écran de saisie prévu la semaine suivante). Les autres
-- champs demandés par le CEO (nom, prenom, date_naissance, phone, email,
-- adresse) existent déjà sur users, vérifié par lecture du schéma
-- CLAUDE.md avant cette migration — seuls sexe/nationalité/profession
-- manquent réellement.
ALTER TABLE users
  ADD COLUMN sexe        text CHECK (sexe IN ('homme', 'femme')),
  ADD COLUMN nationalite text,
  ADD COLUMN profession  text;
