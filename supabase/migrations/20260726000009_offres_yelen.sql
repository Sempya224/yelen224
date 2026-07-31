-- Écran "Offres Yelen" (chantier 26/07/2026) : table de contenu gérée
-- par l'admin, mise en avant de partenaires non-financiers (commerçants,
-- PME, entreprises, télécom/média, gouvernement). Crédit/microfinance
-- explicitement hors périmètre. Aucune policy d'écriture : les écritures
-- passent exclusivement par les routes API service_role (app/api/admin/offres).
CREATE TABLE offres (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  titre text NOT NULL,
  description_courte text NOT NULL,
  description_longue text NOT NULL,
  categorie text NOT NULL,
  partenaire_nom text NOT NULL,
  partenaire_logo text,
  cta_label text,
  cta_url text,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','publiee','archivee')),
  date_expiration timestamptz,
  epingle boolean NOT NULL DEFAULT false,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE offres ENABLE ROW LEVEL SECURITY;

CREATE POLICY offres_public_read ON offres
  FOR SELECT TO anon, authenticated
  USING (statut = 'publiee' AND (date_expiration IS NULL OR date_expiration > now()));
