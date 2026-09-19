-- Signalements — Lot 1 : signalement_events, l'audit trail immuable du
-- lifecycle (created/assigned/priority_changed/status_changed/note_added/
-- attachment_added/resolved/reopened/closed/escalated/marked_duplicate).
-- Mécanisme d'immuabilité identique à journal_activite
-- (20260723000001_journal_activite_fondations_audit.sql) — mêmes
-- garanties, séquence/générateur/trigger/échappatoire propres à ce module.

CREATE SEQUENCE signalement_events_audit_seq START 1;

CREATE OR REPLACE FUNCTION signalement_events_generer_audit_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('signalement_events_audit_seq');
  RETURN 'YL-SIG-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE signalement_events (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id         text NOT NULL UNIQUE DEFAULT signalement_events_generer_audit_id(),
  signalement_id   uuid NOT NULL REFERENCES signalements(id) ON DELETE RESTRICT,
  institution_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN (
                     'created','assigned','priority_changed','status_changed','note_added',
                     'attachment_added','resolved','reopened','closed','escalated','marked_duplicate'
                   )),
  -- 'admin_yelen' distinct de 'membre' : les routes admin/api/admin/
  -- signalements/[id]/resoudre|ignorer mutent aussi signalements.statut,
  -- un acteur réellement différent d'un membre institution.
  acteur_type      text NOT NULL CHECK (acteur_type IN ('membre','citoyen','system','admin_yelen')),
  membre_id        uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  membre_nom       text NOT NULL,
  ancienne_valeur  jsonb,
  nouvelle_valeur  jsonb,
  commentaire      text,
  ip               text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signalement_events_signalement_idx ON signalement_events (signalement_id, created_at);

-- Immuabilité — voir 20260723000001 pour le détail du mécanisme et sa
-- justification (bloque même service_role/postgres superuser, contrairement
-- à RLS). Réouverture = nouvelle ligne d'événement, jamais une modification
-- d'une ligne passée.
--
-- ⚠️ IMPORTANT POUR BRYAN : ce trigger bloque aussi toute correction
-- manuelle depuis le SQL Editor Supabase (UPDATE/DELETE). C'est voulu.
-- Besoin réel et exceptionnel de corriger une ligne : dans la MÊME requête
-- SQL (même transaction) :
--   SET LOCAL app.autoriser_correction_signalement = 'on';
--   UPDATE signalement_events SET ... WHERE id = '...';
CREATE OR REPLACE FUNCTION signalement_events_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_signalement', true) = 'on' THEN
    RAISE WARNING 'signalement_events: modification manuelle exceptionnelle autorisée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'signalement_events est immuable : impossible de modifier ou supprimer une entrée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
END;
$$;

CREATE TRIGGER signalement_events_immuable
  BEFORE UPDATE OR DELETE ON signalement_events
  FOR EACH ROW EXECUTE FUNCTION signalement_events_interdire_modification();

ALTER TABLE signalement_events ENABLE ROW LEVEL SECURITY;
