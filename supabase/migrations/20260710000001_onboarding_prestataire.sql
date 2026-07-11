-- Migration : refonte onboarding prestataire — secteur/statut_juridique/niveau_confiance
-- + table sondage de personnalisation (10/07/2026)
ALTER TABLE institutions
  ADD COLUMN secteur text,
  ADD COLUMN statut_juridique text,
  ADD COLUMN niveau_confiance text NOT NULL DEFAULT 'profil_basique',
  ADD COLUMN responsable_prenom text,
  ADD COLUMN responsable_nom text,
  ADD COLUMN responsable_role text;

ALTER TABLE institutions
  ADD CONSTRAINT institutions_secteur_check
    CHECK (secteur IS NULL OR secteur IN ('sante','administratif','financier','juridique','beaute_bien_etre','commerce','artisanat','services_divers')),
  ADD CONSTRAINT institutions_statut_juridique_check
    CHECK (statut_juridique IS NULL OR statut_juridique IN ('public','prive_formel','liberal','individuel_informel')),
  ADD CONSTRAINT institutions_niveau_confiance_check
    CHECK (niveau_confiance IN ('profil_basique','profil_verifie','institution_certifiee'));

CREATE TABLE institution_onboarding_survey (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  gestion_actuelle text,
  volume_rdv_estime text,
  type_service_souhaite text,
  dispositif_principal text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institution_onboarding_survey ENABLE ROW LEVEL SECURITY;

-- Fix bug découvert lors du test réel : l'UI a toujours traité email comme optionnel
ALTER TABLE institutions ALTER COLUMN email DROP NOT NULL;