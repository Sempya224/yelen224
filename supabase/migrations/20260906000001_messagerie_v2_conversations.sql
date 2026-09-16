-- Chantier "Messagerie V2 — Customer Communication Workspace" (institution
-- PRO Dashboard, PC uniquement — décision Bryan 06/09/2026 : le mobile
-- citoyen n'est pas dans le périmètre de ce chantier, reste inchangé).
-- Lot A — schéma seul, aucune route API ni écran encore modifiés.
--
-- Décision produit tranchée avec Bryan (06/09/2026) après audit du modèle
-- existant : une conversation citoyen↔institution n'est plus 1:1 avec un
-- rdv. Une paire (citoyen, institution) peut avoir PLUSIEURS conversations
-- successives dans le temps (demande d'info, prise de rdv, modification de
-- rdv, question après rdv...), chacune indépendante, avec un statut qui
-- n'est JAMAIS dérivé automatiquement du statut du rdv qu'elle référence
-- éventuellement. Volontairement PAS de contrainte UNIQUE(citoyen_id,
-- institution_id) — Bryan a explicitement rejeté le modèle "un seul fil
-- permanent par paire".
--
-- ⚠️ Ceci inverse une partie de la décision du 19/07/2026
-- (20260724000006_messagerie_rdv_yelen.sql) : "une conversation
-- citoyen↔institution est scopée à UN rdv précis... se ferme définitivement
-- dès que ce rdv atteint un statut terminal". Le trigger DB qui l'appliquait
-- (messages_valider_rdv_conversation_trigger) est modifié plus bas.
--
-- ⚠️ Impact partagé avec le mobile citoyen : `messages` et ce trigger sont
-- aussi utilisés par lib/messagerie.ts (écran mobile "Mes RDV →
-- Messagerie établissements", getConversationsEtablissements/
-- sendMessageRdv/conversationFermee, hors périmètre de ce chantier). Le
-- retrait du blocage serveur sur statut terminal s'applique donc aussi à ce
-- flux — la restriction y reste appliquée côté client (bouton d'envoi
-- désactivé sur une conversation "fermée", cf. conversationFermee() en
-- app), mais perd sa double-sécurité serveur. Accepté comme risque faible
-- (aucune donnée sensible en jeu, un citoyen authentifié n'écrirait que sur
-- son propre fil) — signalé explicitement plutôt que fait silencieusement.

-- ── conversations (nouvelle entité, citoyen ↔ institution) ──
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Référence optionnelle pour affichage contextuel ("Rendez-vous ·
  -- Consultation") — jamais un scope obligatoire, jamais relu pour dériver
  -- le statut de la conversation (voir décision ci-dessus).
  rdv_id uuid REFERENCES rdv(id) ON DELETE SET NULL,
  -- Label libre quand la conversation n'est pas liée à un rdv (ex.
  -- "Assistance technique", "Documents nécessaires") — pas de service_id :
  -- aucune table de services avec IDs stables ne couvre ce cas (rdv.service
  -- est lui-même un simple champ texte, pas une FK).
  sujet text,
  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'en_attente', 'fermee')),
  assigned_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  fermee_par uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  fermee_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz NOT NULL DEFAULT now()
);

-- RLS activé sans policy — même convention que les autres tables où le
-- seul consommateur prévu (institution, JWT custom) n'a pas de session
-- Supabase Auth : accès exclusivement service_role via routes API (Lot B).
-- Pas de policy citoyen : le mobile citoyen ne consomme pas cette table
-- dans ce chantier (PC only) — à ajouter le jour où ça change, pas avant.
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_conversations_institution_maj ON conversations(institution_id, mis_a_jour_le DESC);
CREATE INDEX idx_conversations_citoyen_institution ON conversations(citoyen_id, institution_id, cree_le);
CREATE INDEX idx_conversations_rdv ON conversations(rdv_id) WHERE rdv_id IS NOT NULL;

-- ── messages : rattachement à une conversation ──
-- Nullable ici volontairement : passera en NOT NULL seulement après le Lot B
-- (routes d'écriture mises à jour pour toujours fournir conversation_id) —
-- le mettre NOT NULL dès ce Lot A casserait immédiatement tout envoi actuel
-- (mobile citoyen ET dashboard institution), aucun des deux ne le fournit
-- encore aujourd'hui.
ALTER TABLE messages ADD COLUMN conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL;

-- ── Backfill 1/2 : messages déjà scopés à un rdv (modèle 19/07/2026) ──
-- Une conversation par rdv distinct ayant au moins un message. Statut
-- dérivé UNE SEULE FOIS ici (snapshot au moment de la migration) — après ce
-- Lot A, plus aucune dérivation automatique ne doit exister côté
-- application. fermee_par/fermee_le laissés NULL : cette fermeture
-- historique était automatique (statut du rdv), pas une action d'un membre
-- identifiable, contrairement à une vraie fermeture manuelle future.
INSERT INTO conversations (institution_id, citoyen_id, rdv_id, statut, cree_le, mis_a_jour_le)
SELECT r.institution_id, r.citoyen_id, r.id,
  CASE WHEN r.statut IN ('termine', 'annule', 'refuse') THEN 'fermee' ELSE 'ouverte' END,
  min(m.cree_le), max(m.cree_le)
FROM messages m
JOIN rdv r ON r.id = m.rdv_id
WHERE m.rdv_id IS NOT NULL
GROUP BY r.id, r.institution_id, r.citoyen_id, r.statut;

UPDATE messages m
SET conversation_id = c.id
FROM conversations c
WHERE m.rdv_id IS NOT NULL AND c.rdv_id = m.rdv_id;

-- ── Backfill 2/2 : messages historiques sans rdv_id (modèle pré-19/07/2026,
-- un seul fil figé par paire citoyen/institution — cf. commentaire d'origine
-- dans 20260724000006 : "traités comme des conversations historiques
-- figées, lecture seule, jamais rouvertes") ──
INSERT INTO conversations (institution_id, citoyen_id, rdv_id, statut, fermee_le, cree_le, mis_a_jour_le)
SELECT inst_id, cit_id, NULL, 'fermee', max(cree_le), min(cree_le), max(cree_le)
FROM (
  SELECT
    COALESCE(expediteur_citoyen_id, destinataire_citoyen_id) AS cit_id,
    COALESCE(expediteur_institution_id, destinataire_institution_id) AS inst_id,
    cree_le
  FROM messages
  WHERE rdv_id IS NULL
) x
WHERE inst_id IS NOT NULL AND cit_id IS NOT NULL
GROUP BY inst_id, cit_id;

UPDATE messages m
SET conversation_id = c.id
FROM conversations c
WHERE m.rdv_id IS NULL
  AND c.rdv_id IS NULL
  AND c.institution_id = COALESCE(m.expediteur_institution_id, m.destinataire_institution_id)
  AND c.citoyen_id = COALESCE(m.expediteur_citoyen_id, m.destinataire_citoyen_id);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, cree_le);

-- ── Trigger messages_valider_rdv_conversation : retrait du blocage sur
-- statut terminal du rdv (voir décision en tête de fichier). Les
-- vérifications d'appartenance (rdv du bon citoyen/de la bonne institution)
-- restent identiques — garde-fou anti-IDOR réel, sans rapport avec le
-- statut de conversation.
CREATE OR REPLACE FUNCTION messages_valider_rdv_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_citoyen_id uuid;
  v_institution_id uuid;
BEGIN
  IF NEW.rdv_id IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT citoyen_id, institution_id INTO v_citoyen_id, v_institution_id
  FROM rdv WHERE id = NEW.rdv_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'messages.rdv_id : rendez-vous introuvable.';
  END IF;
  IF v_citoyen_id IS DISTINCT FROM COALESCE(NEW.expediteur_citoyen_id, NEW.destinataire_citoyen_id) THEN
    RAISE EXCEPTION 'messages.rdv_id : ce rendez-vous n''appartient pas à ce citoyen.';
  END IF;
  IF v_institution_id IS DISTINCT FROM COALESCE(NEW.expediteur_institution_id, NEW.destinataire_institution_id) THEN
    RAISE EXCEPTION 'messages.rdv_id : ce rendez-vous ne concerne pas cette institution.';
  END IF;

  RETURN NEW;
END;
$$;
