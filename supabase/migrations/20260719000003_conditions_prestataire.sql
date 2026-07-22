-- Conditions d'utilisation prestataire (19/07/2026)
-- Distinct des CGU/Confidentialité génériques (app/cgu, app/confidentialite).
-- Nullable = jamais accepté. Posé une fois par POST
-- /api/institution/conditions-prestataire, ne redevient jamais null.
ALTER TABLE institutions ADD COLUMN conditions_prestataire_acceptees_le timestamptz;
