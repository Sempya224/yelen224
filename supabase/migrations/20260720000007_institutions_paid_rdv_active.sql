-- Lot D (refonte wizard RDV citoyen, 16/07/2026) : flag de gating pour la
-- section "Services premium" du wizard. Colonne dédiée plutôt que de
-- réutiliser institutions.plan (enum plan_abonnement) : le mapping exact
-- plan↔fonctionnalités n'est pas encore tranché (chantier séparé, avant le
-- lancement dans 2 semaines) — un booléen simple, activable manuellement
-- par Bryan en attendant, ne préjuge de rien. Désactivé par défaut : les
-- services payants restent invisibles côté citoyen tant qu'il n'est pas
-- explicitement activé pour une institution.
ALTER TABLE institutions ADD COLUMN paid_rdv_active boolean NOT NULL DEFAULT false;
