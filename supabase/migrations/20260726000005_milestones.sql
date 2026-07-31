-- Yelen Rewards — Phase 1, fichier 5/8.
--
-- milestones = données de référence (pas par citoyen). Les 3 paliers sont
-- une décision produit fixe du CEO (26/07/2026) : 1500/2500/5000 points.
-- statut_disponibilite distingue un palier dont le mécanisme de
-- récompense existe déjà ('disponible') d'un palier atteignable mais dont
-- la récompense n'est pas encore construite ('a_venir', cas des offres
-- partenaires) — l'UI doit afficher "bientôt disponible", jamais
-- masquer/faire échouer/faussement délivrer la récompense.
CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  seuil_points integer NOT NULL,
  label text NOT NULL,
  type_recompense text NOT NULL CHECK (type_recompense IN (
    'offre_partenaire', 'badge_symbolique', 'paiement_especes'
  )),
  statut_disponibilite text NOT NULL DEFAULT 'disponible'
    CHECK (statut_disponibilite IN ('disponible', 'a_venir')),
  actif boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lecture publique : un citoyen doit pouvoir voir tous les paliers
-- existants (même ceux non encore atteints) pour l'écran de progression.
-- Écriture : aucune policy, service_role/Bryan uniquement.
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY milestones_lecture_publique ON milestones FOR SELECT USING (true);

INSERT INTO milestones (code, seuil_points, label, type_recompense, statut_disponibilite, ordre) VALUES
  ('palier_1500', 1500, 'Offres partenaires', 'offre_partenaire', 'a_venir', 1),
  ('palier_2500', 2500, 'Badge Confiance', 'badge_symbolique', 'disponible', 2),
  ('palier_5000', 5000, '30 000 GNF', 'paiement_especes', 'disponible', 3);
