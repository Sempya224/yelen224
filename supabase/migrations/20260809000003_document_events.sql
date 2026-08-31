-- Documents clients — Lot 1 : document_events, l'audit trail immuable du
-- lifecycle (created/verification_started/uploaded/viewed/downloaded/
-- validated/rejected/archived). Mécanisme d'immuabilité identique à
-- journal_activite/signalement_events (20260723000001, 20260808000005) —
-- mêmes garanties, séquence/générateur/trigger/échappatoire propres à ce
-- module.

CREATE SEQUENCE document_events_audit_seq START 1;

CREATE OR REPLACE FUNCTION document_events_generer_audit_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('document_events_audit_seq');
  RETURN 'YL-DOC-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE document_events (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id         text NOT NULL UNIQUE DEFAULT document_events_generer_audit_id(),
  document_id      uuid NOT NULL REFERENCES citoyen_documents(id) ON DELETE RESTRICT,
  institution_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN (
                     'created','verification_started','uploaded','viewed','downloaded',
                     'validated','rejected','archived'
                   )),
  acteur_type      text NOT NULL CHECK (acteur_type IN ('membre','citoyen','system')),
  -- Selon acteur_type : membre_id+membre_nom pour 'membre' (nom dénormalisé,
  -- survit à une suppression de membre), rien de plus pour 'citoyen' — le
  -- citoyen_id de la ligne suffit déjà, pas de doublon d'identité.
  membre_id        uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  membre_nom       text,
  ancienne_valeur  jsonb,
  nouvelle_valeur  jsonb,
  commentaire      text,
  ip               text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_events_document_idx ON document_events (document_id, created_at);

-- Immuabilité — voir 20260723000001 pour le détail du mécanisme et sa
-- justification (bloque même service_role/postgres superuser, contrairement
-- à RLS).
--
-- ⚠️ IMPORTANT POUR BRYAN : ce trigger bloque aussi toute correction
-- manuelle depuis le SQL Editor Supabase (UPDATE/DELETE). C'est voulu.
-- Besoin réel et exceptionnel de corriger une ligne : dans la MÊME requête
-- SQL (même transaction) :
--   SET LOCAL app.autoriser_correction_document = 'on';
--   UPDATE document_events SET ... WHERE id = '...';
CREATE OR REPLACE FUNCTION document_events_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_document', true) = 'on' THEN
    RAISE WARNING 'document_events: modification manuelle exceptionnelle autorisée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'document_events est immuable : impossible de modifier ou supprimer une entrée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
END;
$$;

CREATE TRIGGER document_events_immuable
  BEFORE UPDATE OR DELETE ON document_events
  FOR EACH ROW EXECUTE FUNCTION document_events_interdire_modification();

ALTER TABLE document_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que citoyen_documents/signalement_events.
