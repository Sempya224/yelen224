-- Module Collaboration — Lot D (fichiers joints + réactions), 16/09/2026.
-- Édition/suppression de message ne nécessitent AUCUN changement de
-- schéma : modifie_le/supprime_le existent déjà depuis le Lot A
-- (20260916000006), simplement jamais exploités côté route/UI jusqu'ici.

-- ── Fichier joint ──
-- Un message peut désormais être uniquement un fichier (contenu devient
-- nullable) — jamais de légende fabriquée quand l'utilisateur n'en écrit
-- pas. fichier_path pointe vers le bucket privé "collaboration-fichiers"
-- (à créer manuellement, voir CLAUDE.md /actions-manuelles-en-attente),
-- jamais une URL publique directe.
ALTER TABLE collab_messages ALTER COLUMN contenu DROP NOT NULL;
ALTER TABLE collab_messages
  ADD COLUMN fichier_path text,
  ADD COLUMN fichier_nom text,
  ADD COLUMN fichier_taille bigint,
  ADD COLUMN fichier_type text;

ALTER TABLE collab_messages ADD CONSTRAINT collab_messages_contenu_ou_fichier
  CHECK ((contenu IS NOT NULL AND btrim(contenu) <> '') OR fichier_path IS NOT NULL);

-- ── Réactions ──
-- Jamais un emoji Unicode libre (charte Yelen : pas d'emoji classique,
-- uniquement des SVG maison) — un type fermé, rendu par une icône dédiée
-- côté UI. Un membre peut réagir plusieurs fois avec des types différents
-- au même message, jamais deux fois avec le même (UNIQUE).
CREATE TABLE collab_message_reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
  membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE CASCADE,
  type_reaction text NOT NULL CHECK (type_reaction IN ('pouce', 'coeur', 'valide', 'attention')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, membre_id, type_reaction)
);

ALTER TABLE collab_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_collab_reactions_message ON collab_message_reactions(message_id);

COMMENT ON COLUMN collab_messages.fichier_path IS 'Chemin dans le bucket privé collaboration-fichiers, jamais une URL publique — signée à la demande côté API.';
COMMENT ON TABLE collab_message_reactions IS 'Réactions à types fermés (pouce/coeur/valide/attention), rendues en SVG côté UI — jamais un emoji Unicode libre.';
