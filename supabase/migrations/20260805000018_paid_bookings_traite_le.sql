-- Refonte Enterprise "Centre de validation" (écran Valider un RDV payant,
-- 05/08/2026, mission CEO Product Hardening). paid_bookings n'avait aucune
-- colonne capturant le moment réel de traitement (confirmation/absence/
-- annulation) — seul date_rdv/heure_rdv (créneau prévu) et created_at
-- (création de la réservation) existaient. Sans elle, la Timeline de la
-- journée et le calcul honnête d'un temps moyen n'ont aucune donnée réelle
-- à afficher. Renseignée par l'agent au moment de l'action (PATCH
-- app/api/institution/paid-bookings/valider/route.ts), jamais recalculée.
ALTER TABLE paid_bookings
  ADD COLUMN traite_le timestamptz;
