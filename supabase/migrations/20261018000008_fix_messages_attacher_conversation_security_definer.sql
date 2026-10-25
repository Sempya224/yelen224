-- Lot D (18/10/2026) — messages_attacher_conversation() s'exécutait avec les
-- droits du citoyen appelant (prosecdef=false), pas ceux du propriétaire.
-- `conversations` a RLS actif sans aucune policy (convention service_role
-- uniquement de ce projet) : dès qu'aucune conversation n'existait déjà pour
-- un rdv donné, le trigger tentait d'en créer une au nom du citoyen -> rejeté
-- par RLS -> tout premier message d'une conversation rdv échouait
-- systématiquement depuis l'introduction de ce trigger (06/09/2026). Bug
-- fonctionnel réel, confirmé par reproduction en SQL Editor, sans rapport
-- avec les correctifs F1/messages_citoyen_* (Lot A, migration
-- 20261018000007) traités séparément.
--
-- Correctif : SECURITY DEFINER + search_path vide avec références qualifiées
-- (recommandation Supabase/Postgres contre la substitution d'objet via
-- search_path) -- logique métier identique à l'original, aucune ligne de
-- comportement changée.
--
-- Sécurité vérifiée avant ce correctif : l'ordre d'exécution des 2 triggers
-- BEFORE INSERT sur `messages` est alphabétique (attacher avant valider). Si
-- un citoyen forge un rdv_id qui ne lui appartient pas,
-- messages_attacher_conversation() (désormais privilégiée) pourrait créer
-- une conversation avant que messages_valider_rdv_conversation() ne rejette
-- l'insert -- mais comme les deux triggers s'exécutent dans la même
-- instruction SQL, une exception levée par le second annule toute la
-- transaction, y compris l'insert fait par le premier.
--
-- Validé par tests d'intégration le 18/10/2026 : premier message crée 1
-- conversation, message suivant sur le même rdv réutilise la même (pas de
-- doublon), rdv appartenant à un autre citoyen rejeté sans ligne orpheline
-- (total_conversations identique avant/après tentative), aucune régression
-- sur les conversations existantes.

CREATE OR REPLACE FUNCTION public.messages_attacher_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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

  SELECT id INTO v_conv_id FROM public.conversations
  WHERE rdv_id = NEW.rdv_id AND statut <> 'fermee'
  ORDER BY cree_le DESC LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (institution_id, citoyen_id, rdv_id, statut)
    VALUES (v_institution_id, v_citoyen_id, NEW.rdv_id, 'ouverte')
    RETURNING id INTO v_conv_id;
  END IF;

  NEW.conversation_id := v_conv_id;
  RETURN NEW;
END;
$function$;
