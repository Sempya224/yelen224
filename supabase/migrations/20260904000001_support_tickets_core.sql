-- Chantier "Support Yelen" — Lot A : modèle de données du ticketing
-- citoyen↔agent humain (aucun LLM, voir instruction CEO 04/09/2026).
--
-- Périmètre de ce lot : citoyen uniquement. `messages_yelen_institution` /
-- `messages_yelen_institution_conversations` (système existant, déjà une
-- state machine nouvelle/prise_en_charge/fermee) restent inchangés pour
-- l'instant — décision explicite Bryan (04/09/2026) de ne pas doubler la
-- portée du lot 1. `messages_yelen_citoyen` (ancienne table, conversation
-- permanente jamais fermée) sera abandonnée une fois le Lot C (UI Support
-- Home citoyen) livré — pas supprimée dans cette migration.
--
-- Décision de conception : statut CONTRÔLÉ SERVEUR (voir brief section 3 —
-- "ne jamais faire confiance au frontend"). Contrairement à
-- avis/favoris/rdv (policy RLS auth.uid()=citoyen_id classique), les 3
-- tables ci-dessous sont RLS activé + ZÉRO policy + accès exclusivement
-- service_role : le citoyen ne les touche jamais directement au client,
-- toujours via une route API (comme institution↔Yelen aujourd'hui), pour
-- qu'aucune valeur de statut/priorité/agent ne puisse être falsifiée côté
-- client. Un message citoyen sur un ticket resolu doit aussi déclencher
-- une transition serveur (résolu → attente_agent) — encore une raison de
-- ne pas laisser d'insert direct.
--
-- Simplification assumée par rapport au brief : ASSIGNED et IN_PROGRESS
-- fusionnés en un seul statut 'en_cours' (l'agent clique une fois sur
-- "Prendre en charge", il n'y a pas de moment réel où le ticket est
-- assigné sans qu'un agent puisse déjà répondre) — même principe que
-- "ne pas inventer une logique complexe si elle n'est pas nécessaire"
-- (brief section 18). REOPENED n'est pas un statut persistant : un
-- message citoyen sur un ticket résolu repasse directement à
-- 'attente_agent', la transition est tracée comme événement 'reopened'
-- dans support_ticket_events, pas comme un palier supplémentaire.

-- ── 1) support_tickets ──────────────────────────────────────────────────

CREATE SEQUENCE support_tickets_numero_public_seq START 1;

CREATE OR REPLACE FUNCTION support_tickets_generer_numero_public() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('support_tickets_numero_public_seq');
  RETURN 'YLN-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 6, '0');
END;
$$;

CREATE TABLE support_tickets (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_public      text NOT NULL UNIQUE DEFAULT support_tickets_generer_numero_public(),
  citoyen_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  categorie          text NOT NULL CHECK (categorie IN (
                       'compte','reservation','paiement','etablissement','securite','technique','autre'
                     )),
  priorite           text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute','urgente')),
  sujet              text NOT NULL,
  statut             text NOT NULL DEFAULT 'attente_agent' CHECK (statut IN (
                       'attente_agent','en_cours','resolu','cloture'
                     )),
  assigned_agent_id  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  assigne_le         timestamptz,
  resolu_le          timestamptz,
  cloture_le         timestamptz,
  -- Contexte métier optionnel (brief section 13) — polymorphe par nature
  -- (rdv / paid_bookings / citoyen_documents), donc pas de FK unique
  -- possible : contexte_type qualifie la table visée par contexte_id,
  -- validité applicative (lib/supportTickets.ts), pas contrainte en base.
  contexte_type      text CHECK (contexte_type IS NULL OR contexte_type IN ('rdv','paiement','document')),
  contexte_id        uuid,
  cree_le            timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le      timestamptz NOT NULL DEFAULT now(),
  CHECK (contexte_type IS NULL OR contexte_id IS NOT NULL),
  CHECK (statut <> 'en_cours' OR assigned_agent_id IS NOT NULL),
  CHECK (statut NOT IN ('resolu','cloture') OR resolu_le IS NOT NULL),
  CHECK (statut <> 'cloture' OR cloture_le IS NOT NULL)
);

CREATE INDEX support_tickets_citoyen_idx ON support_tickets (citoyen_id, cree_le DESC);
CREATE INDEX support_tickets_file_idx ON support_tickets (statut, cree_le) WHERE statut IN ('attente_agent','en_cours');
CREATE INDEX support_tickets_agent_idx ON support_tickets (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- ── 2) support_ticket_messages ──────────────────────────────────────────

CREATE TABLE support_ticket_messages (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id        uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  expediteur_type  text NOT NULL CHECK (expediteur_type IN ('citoyen','agent')),
  agent_id         uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  contenu          text,
  image_url        text,
  type             text NOT NULL DEFAULT 'texte' CHECK (type IN ('texte','image')),
  lu               boolean NOT NULL DEFAULT false,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  CHECK (expediteur_type <> 'agent' OR agent_id IS NOT NULL),
  CHECK (type <> 'texte' OR contenu IS NOT NULL),
  CHECK (type <> 'image' OR image_url IS NOT NULL)
);

CREATE INDEX support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id, cree_le);

ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- ── 3) support_ticket_events — audit immuable ───────────────────────────
-- Même mécanisme que signalement_events (20260808000005) / document_events
-- (20260809000003) : bloque même service_role/superuser SQL Editor.
-- Échappatoire dédiée si correction exceptionnelle un jour nécessaire :
--   SET LOCAL app.autoriser_correction_support = 'on';

CREATE SEQUENCE support_ticket_events_audit_seq START 1;

CREATE OR REPLACE FUNCTION support_ticket_events_generer_audit_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('support_ticket_events_audit_seq');
  RETURN 'YL-SUP-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE support_ticket_events (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id         text NOT NULL UNIQUE DEFAULT support_ticket_events_generer_audit_id(),
  ticket_id        uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
  type             text NOT NULL CHECK (type IN (
                     'created','assigned','message_sent','resolved','reopened','closed'
                   )),
  acteur_type      text NOT NULL CHECK (acteur_type IN ('citoyen','agent','system')),
  agent_id         uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  agent_nom        text,
  ancienne_valeur  jsonb,
  nouvelle_valeur  jsonb,
  commentaire      text,
  ip               text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_events_ticket_idx ON support_ticket_events (ticket_id, created_at);

CREATE OR REPLACE FUNCTION support_ticket_events_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_support', true) = 'on' THEN
    RAISE WARNING 'support_ticket_events: modification manuelle exceptionnelle autorisée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'support_ticket_events est immuable : impossible de modifier ou supprimer une entrée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
END;
$$;

CREATE TRIGGER support_ticket_events_immuable
  BEFORE UPDATE OR DELETE ON support_ticket_events
  FOR EACH ROW EXECUTE FUNCTION support_ticket_events_interdire_modification();

ALTER TABLE support_ticket_events ENABLE ROW LEVEL SECURITY;
