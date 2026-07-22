-- Lot 1 — Fondations "Mes démarches" (chantier stratégie rétention v2,
-- décidé le 21/07/2026, voir /chantier-strategie-retention-v2 dans
-- CLAUDE.md). Checklist personnelle libre, rédigée par le citoyen
-- lui-même — V1 volontairement sans modèle pré-rempli par Yelen (risque
-- de responsabilité éditoriale sur une procédure potentiellement fausse),
-- sans pièce jointe, sans rappel automatique, sans visibilité
-- institution (lots ultérieurs, additifs, pas de refonte de schéma
-- nécessaire pour eux : institution_id est déjà nullable ici,
-- date_echeance est déjà un vrai type date).
--
-- Décision produit actée le 22/07/2026 : une démarche peut exister SANS
-- aucune étape (cas "échéance simple", ex. expiration d'un document) —
-- ne force jamais le citoyen à inventer une étape juste pour enregistrer
-- une date. Conséquence : `statut` est un champ stocké (pas dérivé),
-- basculé automatiquement à 'terminee' quand toutes les étapes existantes
-- sont cochées, mais aussi modifiable manuellement (nécessaire pour une
-- démarche sans étape).

CREATE TABLE citoyen_demarches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id) ON DELETE SET NULL,
  titre text NOT NULL,
  description text,
  date_cible date,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'terminee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  termine_le timestamptz
);
ALTER TABLE citoyen_demarches ENABLE ROW LEVEL SECURITY;

CREATE POLICY demarches_citoyen_own ON citoyen_demarches
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);

-- citoyen_id dénormalisé (au lieu d'une jointure vers citoyen_demarches)
-- pour une policy RLS simple et pour permettre plus tard un scan direct
-- de toutes les étapes à échéance proche, tous citoyens confondus (futur
-- job de rappels, mirroring rappels-rdv), sans jointure nécessaire.
CREATE TABLE citoyen_demarche_etapes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  demarche_id uuid NOT NULL REFERENCES citoyen_demarches(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  libelle text NOT NULL,
  date_echeance date,
  fait boolean NOT NULL DEFAULT false,
  fait_le timestamptz,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_demarche_etapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY demarche_etapes_citoyen_own ON citoyen_demarche_etapes
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);
