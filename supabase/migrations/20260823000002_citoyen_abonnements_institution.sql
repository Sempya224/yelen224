-- "Chaîne Yelen" — abonnement citoyen → institution dans Yelen Community
-- (23/08/2026, retour Bryan : "S'abonner" devient le pilier central de
-- Community Pro côté prestataire). Audit préalable confirmé : cette
-- fonctionnalité n'existait nulle part (ni table, ni bouton) malgré le
-- brief l'assumant déjà construite côté citoyen — nouvelle fonctionnalité
-- métier, pas un simple réhabillage.
--
-- Schéma/RLS copiés à l'identique de citoyen_favoris
-- (20260724000003_citoyen_avis_favoris_fondations.sql) : écriture directe
-- client via RLS (auth.uid() = citoyen_id), pas de service_role, pas de
-- route d'écriture dédiée. Désabonnement = suppression physique de la
-- ligne (pas de soft-delete) — plus simple, cohérent avec
-- citoyen_favoris/post_likes. Conséquence assumée : "abonnés perdus" et
-- "audience active" ne sont pas calculables avec ce schéma (nécessitent un
-- historique) et restent volontairement hors périmètre/stubbés côté UI.
CREATE TABLE citoyen_abonnements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (citoyen_id, institution_id)
);
ALTER TABLE citoyen_abonnements ENABLE ROW LEVEL SECURITY;

CREATE POLICY abonnements_citoyen_own ON citoyen_abonnements
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);

-- Compteur dénormalisé sur institutions, maintenu par trigger — même
-- mécanique que institutions.nb_avis/moyenne_avis
-- (20260806000003_avis_recalcul_moyenne_institution.sql) : recalcul complet
-- par COUNT(*) à chaque INSERT/DELETE, jamais un incrément/décrément
-- applicatif (source unique de vérité, fiable même si un futur chemin de
-- code écrit directement dans la table).
ALTER TABLE institutions ADD COLUMN nb_abonnes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION recalculer_nb_abonnes_institution() RETURNS trigger AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  v_institution_id := COALESCE(NEW.institution_id, OLD.institution_id);
  UPDATE institutions
  SET nb_abonnes = (SELECT COUNT(*) FROM citoyen_abonnements WHERE institution_id = v_institution_id)
  WHERE id = v_institution_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS abonnements_recalcul_nb_abonnes ON citoyen_abonnements;
CREATE TRIGGER abonnements_recalcul_nb_abonnes
AFTER INSERT OR DELETE ON citoyen_abonnements
FOR EACH ROW EXECUTE FUNCTION recalculer_nb_abonnes_institution();
