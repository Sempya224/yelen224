-- Programme de partenariat Yelen (chantier 26/07/2026, refonte CEO) :
-- les offres deviennent un contenu rédigé par le partenaire (institution
-- déjà inscrite), soumis à modération admin — plus jamais rédigé par
-- l'admin lui-même. Voir CLAUDE.md /chantier-offres-yelen.

-- Statut partenariat, indépendant de institutions.statut (colonne text
-- simple, pas un vrai enum Postgres — confirmé, aucune requête existante
-- ne casse en ajoutant une colonne indépendante).
ALTER TABLE institutions ADD COLUMN partenaire_statut text NOT NULL DEFAULT 'aucun'
  CHECK (partenaire_statut IN ('aucun','en_attente','approuve','refuse'));

CREATE TABLE institution_partenariat_demandes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  description_organisation text NOT NULL,
  type_offres text NOT NULL,
  impact_communaute text NOT NULL,
  categorie text NOT NULL,
  site_web text NOT NULL,
  contact_nom text NOT NULL,
  contact_email text NOT NULL,
  contact_telephone text,
  infos_complementaires text,
  conditions_acceptees boolean NOT NULL DEFAULT false,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','approuve','refuse')),
  traite_par_admin_id uuid REFERENCES admin_users(id),
  motif_refus text,
  date_decision timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institution_partenariat_demandes ENABLE ROW LEVEL SECURITY;
-- Aucune policy : écriture/lecture exclusivement via routes service_role.

-- Évolution de la table offres (créée le 26/07/2026, jamais publiée en
-- prod) : passage d'un modèle "admin rédige" à "partenaire rédige,
-- admin modère".
ALTER TABLE offres
  ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  ADD COLUMN date_publication_prevue timestamptz,
  ADD COLUMN motif_refus text,
  ADD COLUMN soumis_le timestamptz,
  ADD COLUMN valide_le timestamptz,
  ADD COLUMN valide_par_admin_id uuid REFERENCES admin_users(id),
  ADD COLUMN nb_clics integer NOT NULL DEFAULT 0;

ALTER TABLE offres DROP CONSTRAINT offres_statut_check;
ALTER TABLE offres ADD CONSTRAINT offres_statut_check
  CHECK (statut IN ('brouillon','en_attente_validation','publiee','refusee','suspendue','archivee'));
