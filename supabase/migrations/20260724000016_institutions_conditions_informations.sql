-- Sections "Conditions de l'entreprise / Informations importantes /
-- Informations légales" façon Booking ("Property Policies / Important
-- details / Legal information") — texte libre rempli par l'institution
-- elle-même depuis Mon compte > Conditions & Informations, affiché
-- publiquement sur la fiche (popup dédié, "pas encore renseigné" si vide).
-- Sans rapport avec conditions_prestataire_acceptees_le (timestamp
-- d'acceptation des CGU de Yelen par l'institution) ni la page statique
-- /mentions-legales (légal de la plateforme Yelen, pas de l'institution).
ALTER TABLE institutions
  ADD COLUMN conditions_entreprise text,
  ADD COLUMN informations_importantes text,
  ADD COLUMN informations_legales text;
