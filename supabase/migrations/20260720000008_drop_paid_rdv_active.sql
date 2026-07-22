-- Retrait de institutions.paid_rdv_active (migration 20260720000007) :
-- malentendu clarifié le 16/07/2026 — le flux de réservation payante doit
-- être réellement fonctionnel dès maintenant pour toute institution ayant
-- des services payants configurés. Ce qui est reporté à dans 2 semaines,
-- c'est uniquement le futur MÉCANISME de restriction (abonnement/statut de
-- compte), pas encore conçu — pas la désactivation de la fonctionnalité
-- elle-même en attendant.
ALTER TABLE institutions DROP COLUMN paid_rdv_active;
