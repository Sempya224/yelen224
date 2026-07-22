-- Lot C (refonte wizard RDV citoyen, 16/07/2026) : champs complémentaires
-- configurables par service (téléphone, numéro client, référence…),
-- décidés par l'institution, jamais par Yelen. Config sur paid_services
-- (institutions.services est déjà un jsonb flexible, pas de migration
-- nécessaire pour l'offre générale — le champ vit directement dans chaque
-- entrée de la liste, géré côté applicatif dans ServicesTab.tsx).
-- Réponses du citoyen stockées sur rdv ET paid_bookings (une réservation
-- payante crée toujours les deux lignes).
ALTER TABLE paid_services ADD COLUMN champs_complementaires jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE rdv ADD COLUMN champs_complementaires_reponses jsonb;
ALTER TABLE paid_bookings ADD COLUMN champs_complementaires_reponses jsonb;
