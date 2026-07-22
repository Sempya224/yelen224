-- Lot A — Fondations infra "Mes avis" + "Établissements favoris" (écrans
-- citoyen distincts, brief CEO du 18/07/2026)
--
-- Contexte : vérifié par grep exhaustif avant d'écrire ce fichier (même
-- démarche que les Lots A des chantiers Sécurité/Confidentialité citoyen).
-- `avis` ne contenait jusqu'ici que id/institution_id/citoyen_id/rdv_id/
-- note/commentaire/created_at — aucune notion de titre, de réponse
-- d'établissement, ou d'avis masqué. Aucune table "favoris" n'existait.
--
-- Volontairement PAS dans ce lot (portée limitée, comme pour les
-- chantiers précédents) : brouillons d'avis, compteur de vues, compteur
-- "utile", "temps moyen d'attente" — ces notions supposent des décisions
-- produit non tranchées (qui déclenche une vue ? un brouillon est-il
-- auto-sauvegardé ? etc.) et seraient inventées sans plus de cadrage.

-- Titre d'avis (optionnel — l'avis existant n'a que note+commentaire).
ALTER TABLE avis ADD COLUMN titre text;

-- Réponse d'établissement à un avis — colonnes seules pour l'instant,
-- aucune UI institution ne les alimente encore (lot séparé à venir).
ALTER TABLE avis ADD COLUMN reponse_institution text;
ALTER TABLE avis ADD COLUMN reponse_le timestamptz;

-- Avis masqué par son auteur (filtre "Masqués" du brief) — reste visible
-- pour le citoyen lui-même dans sa propre liste, juste marqué.
ALTER TABLE avis ADD COLUMN masque boolean NOT NULL DEFAULT false;

-- Protection : la policy RLS existante `avis_citoyen_own` est un ALL
-- (auth.uid() = citoyen_id), donc un citoyen pourrait sinon écrire
-- lui-même dans reponse_institution/reponse_le en appelant l'API
-- Supabase directement. Ce trigger bloque toute modification de ces deux
-- colonnes sauf depuis service_role (la future route institution de
-- réponse) — jamais contourné par un citoyen authentifié, contrairement à
-- une simple vérification côté application.
CREATE OR REPLACE FUNCTION avis_proteger_reponse_institution() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND (NEW.reponse_institution IS DISTINCT FROM OLD.reponse_institution
          OR NEW.reponse_le IS DISTINCT FROM OLD.reponse_le) THEN
    RAISE EXCEPTION 'avis.reponse_institution/reponse_le : modifiable uniquement par une institution (service_role), jamais par le citoyen auteur de l''avis.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER avis_proteger_reponse_institution_trigger
  BEFORE UPDATE ON avis
  FOR EACH ROW EXECUTE FUNCTION avis_proteger_reponse_institution();

-- Favoris citoyen — mirroring le style RLS déjà utilisé pour rdv/avis
-- (auth.uid() = citoyen_id), pas le style service_role-only des tables de
-- sécurité (un favori n'est pas un secret, juste une préférence).
CREATE TABLE citoyen_favoris (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (citoyen_id, institution_id)
);
ALTER TABLE citoyen_favoris ENABLE ROW LEVEL SECURITY;

CREATE POLICY favoris_citoyen_own ON citoyen_favoris
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);
