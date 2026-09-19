-- Demande d'adhésion à Yelen Community, institutions (23/08/2026, retour
-- Bryan) — mirroring exact du flux Partenariat déjà en place
-- (institutions.partenaire_statut + institution_partenariat_demandes,
-- migration 20260726000010_partenariat_yelen.sql) : une institution doit
-- soumettre une demande, validée par un admin, avant d'accéder à l'écran
-- de publication déjà livré (Lots 1-4 du chantier "posts institutionnels
-- dans Yelen Community"). RLS activé, zéro policy — écritures/lectures
-- exclusivement service_role (app/api/institution/communaute-demande,
-- app/api/admin/communaute-demandes), même convention que
-- institution_partenariat_demandes.

ALTER TABLE institutions
  ADD COLUMN communaute_statut text NOT NULL DEFAULT 'aucun'
    CHECK (communaute_statut IN ('aucun','en_attente','approuve','refuse'));

CREATE TABLE institution_communaute_demandes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  intention text NOT NULL,
  contact_nom text NOT NULL,
  contact_email text NOT NULL,
  contact_telephone text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuve','refuse')),
  motif_refus text,
  traite_par_admin_id uuid REFERENCES admin_users(id),
  date_decision timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institution_communaute_demandes ENABLE ROW LEVEL SECURITY;
-- Zéro policy — service_role uniquement.
