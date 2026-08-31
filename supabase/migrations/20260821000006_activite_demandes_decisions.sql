-- Chantier Taxonomie des activités — Phase 1, migration 6/8. Flux
-- "Autre activité" (spec §11) — modelé explicitement sur le pattern déjà
-- 15/15 vérifié en base de verification_decisions
-- (20260816000003_verification_expand_decision_tables.sql), pas sur le
-- schéma plat initial de la spec : identifiant séquentiel lisible,
-- décision totalement immuable, demande mutable-bornée (comme
-- documents_institution). Réutiliser le seul pattern de décision déjà
-- éprouvé plutôt que d'en recréer une variante plus faible — exactement
-- la discipline déjà appliquée à l'identité internationale (§3ter de la
-- spec, "ne pas recréer un second système").

-- ── Demande ("Autre activité") — mutable-bornée sur son statut ──
CREATE TABLE activite_demandes (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  categorie_id     uuid NOT NULL REFERENCES activite_categories(id),
  libelle_propose  text NOT NULL,
  description      text NOT NULL,
  statut           text NOT NULL DEFAULT 'a_examiner'
    CHECK (statut IN ('a_examiner','validee','rattachee','refusee')),
  cree_le          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activite_demandes_statut_idx ON activite_demandes (statut, cree_le DESC);

-- Immuabilité partielle : seul `statut` peut changer, et une seule fois,
-- depuis 'a_examiner' — même asymétrie que documents_institution
-- (mutable-borné) vs verification_decisions (totalement immuable).
CREATE OR REPLACE FUNCTION activite_demandes_interdire_falsification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_activite_demandes', true) = 'on' THEN
    RAISE WARNING 'activite_demandes: modification manuelle exceptionnelle autorisée (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'activite_demandes: suppression interdite (id=%).', OLD.id;
  END IF;

  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.categorie_id IS DISTINCT FROM OLD.categorie_id
     OR NEW.libelle_propose IS DISTINCT FROM OLD.libelle_propose
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.cree_le IS DISTINCT FROM OLD.cree_le
  THEN
    RAISE EXCEPTION 'activite_demandes: seul le statut peut être modifié (id=%).', OLD.id;
  END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut AND OLD.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'activite_demandes: le statut ne peut être modifié qu''une seule fois depuis a_examiner (id=%, statut actuel=%).', OLD.id, OLD.statut;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER activite_demandes_immuable_partiel
  BEFORE UPDATE OR DELETE ON activite_demandes
  FOR EACH ROW EXECUTE FUNCTION activite_demandes_interdire_falsification();

-- ── Décision — totalement immuable, identifiant séquentiel lisible ──
CREATE SEQUENCE activite_demande_decisions_seq START 1;

CREATE OR REPLACE FUNCTION activite_demande_decisions_generer_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('activite_demande_decisions_seq');
  RETURN 'YL-ACT-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE activite_demande_decisions (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id            text NOT NULL UNIQUE DEFAULT activite_demande_decisions_generer_id(),
  demande_id             uuid NOT NULL REFERENCES activite_demandes(id) ON DELETE CASCADE,
  decision               text NOT NULL CHECK (decision IN ('validee','rattachee','refusee')),
  activite_resultante_id uuid REFERENCES activites(id),
  note                   text NOT NULL,
  decide_par_admin_id    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  decide_par_nom         text NOT NULL,
  decide_le              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activite_demande_decisions_resultante_requise
    CHECK (decision = 'refusee' OR activite_resultante_id IS NOT NULL)
);

CREATE INDEX activite_demande_decisions_demande_idx ON activite_demande_decisions (demande_id);

CREATE OR REPLACE FUNCTION activite_demande_decisions_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_activite_demande_decisions', true) = 'on' THEN
    RAISE WARNING 'activite_demande_decisions: modification manuelle exceptionnelle autorisée (id=%, decision_id=%).', OLD.id, OLD.decision_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'activite_demande_decisions est immuable : impossible de modifier ou supprimer une décision (id=%, decision_id=%).', OLD.id, OLD.decision_id;
END;
$$;

CREATE TRIGGER activite_demande_decisions_immuable
  BEFORE UPDATE OR DELETE ON activite_demande_decisions
  FOR EACH ROW EXECUTE FUNCTION activite_demande_decisions_interdire_modification();

ALTER TABLE activite_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activite_demande_decisions ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que verification_decisions.
REVOKE ALL ON activite_demandes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON activite_demande_decisions FROM PUBLIC, anon, authenticated;
