-- Chantier "Messagerie V2" — Lot A (suite). Complément à
-- 20260906000001_messagerie_v2_conversations.sql, trouvé en concevant les
-- routes API du Lot B : le mobile citoyen (hors périmètre de ce chantier,
-- lib/messagerie.ts::sendMessageRdv non modifié) continue d'insérer des
-- messages avec rdv_id mais sans jamais fournir conversation_id — sans ce
-- trigger, ses réponses deviendraient invisibles dans la nouvelle inbox
-- institution basée sur conversation_id.
--
-- Ne s'active que quand conversation_id est NULL à l'insertion (l'API
-- institution du Lot B le fournira toujours explicitement et ne passe
-- jamais par ce filet de sécurité) : rattache le message à la conversation
-- non fermée la plus récente pour ce rdv, ou en crée une nouvelle
-- ('ouverte', sans membre assigné) si aucune n'existe.

CREATE OR REPLACE FUNCTION messages_attacher_conversation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conv_id uuid;
  v_citoyen_id uuid;
  v_institution_id uuid;
BEGIN
  IF NEW.conversation_id IS NOT NULL OR NEW.rdv_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_citoyen_id := COALESCE(NEW.expediteur_citoyen_id, NEW.destinataire_citoyen_id);
  v_institution_id := COALESCE(NEW.expediteur_institution_id, NEW.destinataire_institution_id);

  SELECT id INTO v_conv_id FROM conversations
  WHERE rdv_id = NEW.rdv_id AND statut <> 'fermee'
  ORDER BY cree_le DESC LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO conversations (institution_id, citoyen_id, rdv_id, statut)
    VALUES (v_institution_id, v_citoyen_id, NEW.rdv_id, 'ouverte')
    RETURNING id INTO v_conv_id;
  END IF;

  NEW.conversation_id := v_conv_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_attacher_conversation_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_attacher_conversation();
