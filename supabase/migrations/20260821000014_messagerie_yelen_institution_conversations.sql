-- Chantier Messagerie Lot 2 suite (21/08/2026, même jour, retour Bryan) —
-- précision reçue APRÈS exécution de 20260821000013 : une conversation
-- fermée ne doit jamais être réouvrable ("celle-ci n'est pas ouvrable") —
-- un nouveau message doit ouvrir une conversation entièrement neuve. Le
-- modèle une-ligne-par-institution de 20260821000013
-- (messages_yelen_institution_etat) ne peut pas représenter plusieurs
-- conversations successives dans le temps — remplacé ici par
-- messages_yelen_institution_conversations (plusieurs lignes possibles par
-- institution, au plus une non fermée à la fois). Données réelles déjà
-- écrites via 20260821000013 migrées telles quelles, jamais réinitialisées.
--
-- Même principe déjà appliqué à messages↔rdv (20260724000006) : une
-- conversation citoyen↔institution se ferme définitivement à un statut
-- terminal, un nouveau rdv en ouvre une neuve — transposé ici à
-- institution↔Yelen, sans dépendance à un rdv.

CREATE TABLE messages_yelen_institution_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  statut text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'prise_en_charge', 'fermee')),
  pris_en_charge_par uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  pris_en_charge_le timestamptz,
  fermee_par uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  fermee_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz NOT NULL DEFAULT now(),
  CHECK (statut <> 'prise_en_charge' OR pris_en_charge_par IS NOT NULL),
  CHECK (statut <> 'fermee' OR fermee_par IS NOT NULL)
);
ALTER TABLE messages_yelen_institution_conversations ENABLE ROW LEVEL SECURITY;

-- Au plus UNE conversation non fermée par institution à la fois — garde-fou
-- en base, pas seulement applicatif.
CREATE UNIQUE INDEX messages_yelen_institution_conversations_une_active
  ON messages_yelen_institution_conversations (institution_id)
  WHERE statut <> 'fermee';
CREATE INDEX idx_messages_yelen_institution_conversations_institution
  ON messages_yelen_institution_conversations (institution_id, cree_le);

-- ── Migration des données réelles déjà en place (messages_yelen_institution_etat) ──
-- Reprises telles quelles : si un admin a déjà pris en charge ou fermé une
-- conversation via le système V1 (20260821000013), cette action réelle est
-- préservée, jamais écrasée par une re-dérivation depuis l'historique brut.
INSERT INTO messages_yelen_institution_conversations
  (institution_id, statut, pris_en_charge_par, pris_en_charge_le, fermee_par, fermee_le, mis_a_jour_le)
SELECT institution_id, statut, pris_en_charge_par, pris_en_charge_le, fermee_par, fermee_le, mis_a_jour_le
FROM messages_yelen_institution_etat;

-- Institutions ayant déjà échangé au moins un message mais absentes de
-- messages_yelen_institution_etat (jamais eu de réponse "yelen" avec
-- admin_id — le backfill de 20260821000013 ne les couvrait pas, l'état
-- "nouvelle" implicite y suffisait alors) — création explicite ici, le
-- nouveau modèle n'a plus d'état implicite sans ligne.
INSERT INTO messages_yelen_institution_conversations (institution_id, statut, cree_le)
SELECT DISTINCT m.institution_id, 'nouvelle', (SELECT min(cree_le) FROM messages_yelen_institution WHERE institution_id = m.institution_id)
FROM messages_yelen_institution m
WHERE NOT EXISTS (
  SELECT 1 FROM messages_yelen_institution_conversations c WHERE c.institution_id = m.institution_id
);

-- ── messages_yelen_institution : rattachement à une conversation ──
ALTER TABLE messages_yelen_institution ADD COLUMN conversation_id uuid REFERENCES messages_yelen_institution_conversations(id) ON DELETE CASCADE;

-- À ce stade, chaque institution ayant au moins un message a exactement une
-- ligne dans messages_yelen_institution_conversations (créée par l'un des
-- deux INSERT ci-dessus) — rattachement simple par institution_id.
UPDATE messages_yelen_institution m
SET conversation_id = c.id
FROM messages_yelen_institution_conversations c
WHERE c.institution_id = m.institution_id AND m.conversation_id IS NULL;

ALTER TABLE messages_yelen_institution ALTER COLUMN conversation_id SET NOT NULL;
CREATE INDEX idx_messages_yelen_institution_conversation ON messages_yelen_institution(conversation_id, cree_le);

-- Table V1 superseded — ses données sont maintenant dans
-- messages_yelen_institution_conversations, plus aucun code applicatif ne
-- doit la lire après ce chantier.
DROP TABLE messages_yelen_institution_etat;
