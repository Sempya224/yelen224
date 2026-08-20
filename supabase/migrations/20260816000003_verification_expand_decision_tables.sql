-- Trust — Lot 2.4, stade EXPAND (3/3). Tables de décision de vérification
-- (Identity/Authority) — nouvelles, vides à la création, aucune dépendance
-- vers les routes existantes. Conception :
-- docs/product/YELEN_TRUST_VERIFICATION_DATA_MODEL.md (sections C/G/H),
-- invariants figés docs/product/YELEN_TRUST_MODEL.md (Lot 0, gelé).
--
-- Patron d'immuabilité identique à journal_activite (20260723000001) /
-- signalement_events (20260808000005) / document_events (20260809000003)
-- — quatrième application du même mécanisme dans ce projet, aucune
-- variation : ces deux tables n'ont AUCUN cas d'UPDATE légitime (contraste
-- avec documents_institution, stade SWITCH, qui a un besoin d'UPDATE borné).

CREATE SEQUENCE verification_decisions_audit_seq START 1;

CREATE OR REPLACE FUNCTION verification_decisions_generer_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('verification_decisions_audit_seq');
  RETURN 'YL-VER-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE verification_decisions (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id              text NOT NULL UNIQUE DEFAULT verification_decisions_generer_id(),
  institution_id           uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  axe                      text NOT NULL CHECK (axe IN ('identite','autorite')),
  type_decision            text NOT NULL CHECK (type_decision IN ('accordee','complement_demande','rejetee','revoquee')),
  niveau_preuve            text CHECK (niveau_preuve IN ('profil_verifie','institution_certifiee')),
  examinateur_admin_id     uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  examinateur_nom          text NOT NULL,
  decide_le                timestamptz NOT NULL DEFAULT now(),
  justification            text NOT NULL,
  expire_le                timestamptz,
  complement_demande_motif text,
  revoque_decision_id      uuid REFERENCES verification_decisions(id) ON DELETE SET NULL,
  decision_precedente_id   uuid REFERENCES verification_decisions(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_decisions_niveau_preuve_requis
    CHECK (type_decision <> 'accordee' OR niveau_preuve IS NOT NULL),
  CONSTRAINT verification_decisions_complement_motif_requis
    CHECK (type_decision <> 'complement_demande' OR complement_demande_motif IS NOT NULL),
  CONSTRAINT verification_decisions_revocation_reference
    CHECK (type_decision <> 'revoquee' OR revoque_decision_id IS NOT NULL)
);

CREATE INDEX verification_decisions_institution_axe_idx ON verification_decisions (institution_id, axe, decide_le DESC);

CREATE TABLE verification_decision_preuves (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id                uuid NOT NULL REFERENCES verification_decisions(id) ON DELETE CASCADE,
  document_institution_id    uuid NOT NULL REFERENCES documents_institution(id) ON DELETE RESTRICT,
  type_snapshot               text NOT NULL,
  numero_version_snapshot     integer NOT NULL,
  statut_snapshot              text NOT NULL,
  storage_path_snapshot        text NOT NULL,
  hash_integrite_snapshot      text,
  soumis_le_snapshot           timestamptz NOT NULL,
  examine_le_snapshot          timestamptz,
  examine_par_nom_snapshot     text,
  created_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_decision_preuves_decision_idx ON verification_decision_preuves (decision_id);

-- Immuabilité totale — aucune des deux tables n'a de cas d'UPDATE légitime
-- (contrairement à documents_institution). Une correction "après coup"
-- n'existe pas dans ce modèle : une nouvelle décision (avec
-- decision_precedente_id chaîné) remplace la précédente, jamais un UPDATE.
--
-- ⚠️ IMPORTANT POUR BRYAN : bloque aussi toute correction manuelle depuis
-- le SQL Editor. Besoin réel et exceptionnel : dans la MÊME transaction :
--   SET LOCAL app.autoriser_correction_verification_decisions = 'on';
--   UPDATE verification_decisions SET ... WHERE id = '...';
CREATE OR REPLACE FUNCTION verification_decisions_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_verification_decisions', true) = 'on' THEN
    RAISE WARNING 'verification_decisions: modification manuelle exceptionnelle autorisée (id=%, decision_id=%).', OLD.id, OLD.decision_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'verification_decisions est immuable : impossible de modifier ou supprimer une décision (id=%, decision_id=%). Créez une nouvelle décision chaînée via decision_precedente_id/revoque_decision_id.', OLD.id, OLD.decision_id;
END;
$$;

CREATE TRIGGER verification_decisions_immuable
  BEFORE UPDATE OR DELETE ON verification_decisions
  FOR EACH ROW EXECUTE FUNCTION verification_decisions_interdire_modification();

CREATE OR REPLACE FUNCTION verification_decision_preuves_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_verification_decision_preuves', true) = 'on' THEN
    RAISE WARNING 'verification_decision_preuves: modification manuelle exceptionnelle autorisée (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'verification_decision_preuves est immuable : le snapshot d''une décision ne peut jamais être modifié (id=%).', OLD.id;
END;
$$;

CREATE TRIGGER verification_decision_preuves_immuable
  BEFORE UPDATE OR DELETE ON verification_decision_preuves
  FOR EACH ROW EXECUTE FUNCTION verification_decision_preuves_interdire_modification();

ALTER TABLE verification_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_decision_preuves ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que documents_institution/signalement_events. REVOKE explicite
-- dès la création (pas une correction a posteriori comme pour les tables
-- plus anciennes du projet — YELEN_TRUST_DATA_AUDIT.md section 3).
REVOKE ALL ON verification_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON verification_decision_preuves FROM PUBLIC, anon, authenticated;
