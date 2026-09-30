-- "Mes projets" — Lot 1 fondations (brief CEO 27/09/2026, inspiré Yelp
-- Projects mais pas cloné visuellement). Conteneur citoyen distinct de
-- citoyen_demarches (décision explicite de Bryan : pas de fusion pour
-- l'instant, "Mes projets" est un écran séparé, plus vaste). Même patron
-- de schéma/RLS que citoyen_demarches/citoyen_demarche_etapes
-- (20260724000011) : écriture directe côté client sous RLS
-- auth.uid()=citoyen_id, aucune route API dédiée nécessaire.
--
-- secteur réutilise la taxonomie réelle de lib/institutionTaxonomy.tsx
-- (SECTEURS, 9 valeurs) plutôt que d'inventer une nouvelle liste — la
-- mention "15 catégories" du brief CEO ne correspond à aucune taxonomie
-- existante en base.
--
-- statut à 6 valeurs (brief §11) : a_preparer/planifie sont saisis
-- manuellement à la création/édition, en_cours/en_attente sont des
-- transitions manuelles côté client (aucun signal fiable pour les
-- dériver automatiquement dans ce lot), termine reste dérivé
-- automatiquement quand toutes les étapes existantes sont cochées (même
-- logique que citoyen_demarches), archive est une fermeture manuelle.
--
-- Nom distinct de la table `projets` (Espace de travail institution,
-- migration 20260713000001 + 20260920000001_projets_v3_coordination) —
-- aucun lien entre les deux, périmètres et propriétaires différents.

CREATE TABLE citoyen_projets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  titre text NOT NULL,
  description text,
  secteur text CHECK (secteur IN (
    'sante', 'administratif', 'financier', 'juridique', 'beaute_bien_etre',
    'artisanat', 'services_divers', 'hotel', 'technologie_numerique'
  )),
  statut text NOT NULL DEFAULT 'a_preparer' CHECK (statut IN (
    'a_preparer', 'planifie', 'en_cours', 'en_attente', 'termine', 'archive'
  )),
  date_cible date,
  created_at timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz NOT NULL DEFAULT now(),
  termine_le timestamptz
);
ALTER TABLE citoyen_projets ENABLE ROW LEVEL SECURITY;

CREATE POLICY projets_citoyen_own ON citoyen_projets
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);

-- citoyen_id dénormalisé (même raison que citoyen_demarche_etapes) :
-- policy RLS simple sans jointure, et scan direct possible plus tard
-- (rappels d'échéance) sans jointure vers citoyen_projets.
CREATE TABLE citoyen_projet_etapes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  projet_id uuid NOT NULL REFERENCES citoyen_projets(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  libelle text NOT NULL,
  date_echeance date,
  fait boolean NOT NULL DEFAULT false,
  fait_le timestamptz,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_projet_etapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY projet_etapes_citoyen_own ON citoyen_projet_etapes
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);

CREATE INDEX idx_citoyen_projets_citoyen_id ON citoyen_projets(citoyen_id);
CREATE INDEX idx_citoyen_projet_etapes_projet_id ON citoyen_projet_etapes(projet_id);
