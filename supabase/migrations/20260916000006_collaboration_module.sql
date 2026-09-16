-- Module Collaboration — Lot A (fondations + conversations directes),
-- 16/09/2026. Espace interne membre ↔ membre, distinct de `conversations`
-- (citoyen ↔ institution, migration 20260906000001) et de `messages`
-- (citoyen ↔ institution) — nouvelles tables préfixées `collab_` pour
-- éviter toute confusion/collision de nom avec ces entités existantes.
--
-- Décision explicite (contrairement au modèle citoyen "plusieurs
-- conversations successives par paire") : UNE seule conversation directe
-- persistante par paire de membres, façon Slack/Teams — appliqué au niveau
-- applicatif (recherche d'une conversation directe existante avant d'en
-- créer une nouvelle), pas par contrainte DB (une conversation de groupe
-- n'a pas de paire fixe, donc pas de contrainte UNIQUE possible qui couvre
-- les deux cas proprement).

CREATE TABLE collab_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'directe' CHECK (type IN ('directe', 'groupe')),
  -- Nom uniquement pertinent pour type='groupe' (ex. "Équipe Accueil") —
  -- laissé NULL pour une conversation directe, jamais dérivé du nom d'un
  -- participant (afficherait un nom périmé si ce participant est renommé).
  nom text,
  statut text NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'archivee')),
  cree_par uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE collab_conversations ENABLE ROW LEVEL SECURITY;
-- RLS activé sans policy — même convention que les autres tables
-- institution : aucune session Supabase Auth côté membre (JWT custom),
-- accès exclusivement service_role via les routes API, contrôle
-- d'appartenance fait applicativement (collab_conversation_membres).
CREATE INDEX idx_collab_conversations_institution_maj ON collab_conversations(institution_id, mis_a_jour_le DESC);

CREATE TABLE collab_conversation_membres (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES collab_conversations(id) ON DELETE CASCADE,
  membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE CASCADE,
  -- 'retire' = quitté ou retiré d'un groupe (Lot B) ; jamais utilisé pour
  -- une conversation directe (voir /15 du brief : suspension/révocation
  -- traitée au niveau institution_membres.actif, pas ici).
  statut text NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'retire')),
  favori boolean NOT NULL DEFAULT false,
  dernier_lu_le timestamptz,
  rejoint_le timestamptz NOT NULL DEFAULT now(),
  retire_le timestamptz,
  UNIQUE(conversation_id, membre_id)
);

ALTER TABLE collab_conversation_membres ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_collab_conv_membres_membre ON collab_conversation_membres(membre_id, statut);
CREATE INDEX idx_collab_conv_membres_conversation ON collab_conversation_membres(conversation_id);

CREATE TABLE collab_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES collab_conversations(id) ON DELETE CASCADE,
  auteur_membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE CASCADE,
  contenu text NOT NULL,
  -- Lots C/D (threads, fichiers) : colonnes ajoutées plus tard, pas
  -- anticipées ici en NULL pour ne rien "réserver" avant d'en avoir besoin.
  modifie_le timestamptz,
  supprime_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE collab_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_collab_messages_conversation ON collab_messages(conversation_id, cree_le);

COMMENT ON TABLE collab_conversations IS 'Module Collaboration (membre <-> membre), distinct de conversations (citoyen <-> institution).';
COMMENT ON TABLE collab_messages IS 'supprime_le = suppression douce (contenu conservé en base pour audit, jamais réaffiché une fois supprime_le renseigné).';
