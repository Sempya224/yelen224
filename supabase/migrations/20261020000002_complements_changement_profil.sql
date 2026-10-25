-- PROPOSEE - NON EXECUTEE. Lot 2 "complements repetables" - voir
-- docs/product/YELEN_REVERIFICATION_POLICY.md.
--
-- Pendant l'examen d'une proposition de changement (etat a_examiner), l'admin
-- peut demander un complement a l'etablissement, autant de fois que necessaire ;
-- l'etablissement repond (message + pieces deposees dans l'onglet Documents
-- existant). La proposition reste ouverte, la valeur publiee ne change pas.
--
-- Journal d'echanges propre a la demande (insert-only, immuable) : on ne reutilise
-- PAS verification_decisions.complement_demande, dont la derniere decision par axe
-- remplacerait la decision courante du dossier de confiance (par ex. "accordee").
--
-- Chaines et messages en ASCII (l'editeur SQL de Supabase tronque les collages
-- accentues). Rollback en fin de fichier.

CREATE TABLE IF NOT EXISTS public.institution_change_request_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id      uuid NOT NULL REFERENCES public.institution_change_requests(id) ON DELETE RESTRICT,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  type            text NOT NULL CHECK (type IN ('complement_demande', 'complement_fourni')),
  acteur_type     text NOT NULL CHECK (acteur_type IN ('admin', 'membre')),
  acteur_id       uuid,
  acteur_nom      text NOT NULL,
  message         text,
  types_documents text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT icre_motif_requis CHECK (type <> 'complement_demande' OR (message IS NOT NULL AND length(btrim(message)) > 0)),
  CONSTRAINT icre_message_borne CHECK (message IS NULL OR length(message) <= 1000),
  CONSTRAINT icre_types_bornes CHECK (cardinality(types_documents) <= 6)
);

CREATE INDEX IF NOT EXISTS icre_request_idx ON public.institution_change_request_events (request_id, created_at);
CREATE INDEX IF NOT EXISTS icre_institution_idx ON public.institution_change_request_events (institution_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.institution_change_request_events_proteger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_changement', true) = 'on' THEN
    RAISE WARNING 'institution_change_request_events: modification manuelle exceptionnelle autorisee (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'institution_change_request_events est immuable : modification et suppression interdites (id=%).', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS institution_change_request_events_proteger ON public.institution_change_request_events;
CREATE TRIGGER institution_change_request_events_proteger
  BEFORE UPDATE OR DELETE ON public.institution_change_request_events
  FOR EACH ROW EXECUTE FUNCTION public.institution_change_request_events_proteger();

ALTER TABLE public.institution_change_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.institution_change_request_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.institution_change_request_events FROM service_role;
REVOKE ALL ON FUNCTION public.institution_change_request_events_proteger() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.demander_complement_changement_profil(
  p_demande_id      uuid,
  p_admin_id        uuid,
  p_motif           text,
  p_types_documents text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_nom text;
  v_demande   public.institution_change_requests;
  v_motif     text := nullif(btrim(coalesce(p_motif, '')), '');
  v_types     text[] := coalesce(p_types_documents, '{}');
  v_id        uuid := gen_random_uuid();
BEGIN
  IF p_demande_id IS NULL THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: p_demande_id requis';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: p_admin_id requis';
  END IF;
  IF v_motif IS NULL THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: un motif est obligatoire pour demander un complement';
  END IF;
  IF length(v_motif) > 1000 THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: motif trop long (1000 caracteres maximum)';
  END IF;
  IF cardinality(v_types) > 6 THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: trop de types de documents';
  END IF;
  v_admin_nom := (SELECT btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')) FROM public.admin_users a WHERE a.id = p_admin_id AND a.is_active);
  IF v_admin_nom IS NULL OR length(v_admin_nom) = 0 THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: administrateur inconnu ou inactif';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('changement_profil_decision:' || p_demande_id::text));
  v_demande := (SELECT r FROM public.institution_change_requests r WHERE r.id = p_demande_id FOR UPDATE);
  IF v_demande.id IS NULL THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: demande inconnue';
  END IF;
  IF v_demande.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'demander_complement_changement_profil: cette demande n''est plus a l''etat a_examiner (statut actuel=%)', v_demande.statut;
  END IF;
  INSERT INTO public.institution_change_request_events (id, request_id, institution_id, type, acteur_type, acteur_id, acteur_nom, message, types_documents)
  VALUES (v_id, p_demande_id, v_demande.institution_id, 'complement_demande', 'admin', p_admin_id, v_admin_nom, v_motif, v_types);
  INSERT INTO public.admin_logs (admin_id, action, cible_table, cible_id, details)
  VALUES (p_admin_id, 'COMPLEMENT_CHANGEMENT_PROFIL', 'institution_change_requests', p_demande_id,
          jsonb_build_object('numero', v_demande.numero, 'champ', v_demande.champ, 'institution_id', v_demande.institution_id, 'types_documents', to_jsonb(v_types)));
  RETURN jsonb_build_object('id', v_id, 'demande_id', p_demande_id, 'numero', v_demande.numero, 'institution_id', v_demande.institution_id, 'champ', v_demande.champ);
END;
$$;

CREATE OR REPLACE FUNCTION public.repondre_complement_changement_profil(
  p_demande_id     uuid,
  p_institution_id uuid,
  p_membre_id      uuid,
  p_message        text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membre_nom text;
  v_demande    public.institution_change_requests;
  v_message    text := nullif(btrim(coalesce(p_message, '')), '');
  v_dernier    text;
  v_id         uuid := gen_random_uuid();
BEGIN
  IF p_demande_id IS NULL OR p_institution_id IS NULL OR p_membre_id IS NULL THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: demande, institution et membre requis';
  END IF;
  IF v_message IS NOT NULL AND length(v_message) > 1000 THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: message trop long (1000 caracteres maximum)';
  END IF;
  v_membre_nom := (SELECT btrim(coalesce(m.prenom, '') || ' ' || coalesce(m.nom, '')) FROM public.institution_membres m WHERE m.id = p_membre_id AND m.institution_id = p_institution_id);
  IF v_membre_nom IS NULL OR length(v_membre_nom) = 0 THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: membre inconnu pour cette institution';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('changement_profil_decision:' || p_demande_id::text));
  v_demande := (SELECT r FROM public.institution_change_requests r WHERE r.id = p_demande_id AND r.institution_id = p_institution_id FOR UPDATE);
  IF v_demande.id IS NULL THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: demande inconnue';
  END IF;
  IF v_demande.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: cette demande n''est plus a l''etat a_examiner (statut actuel=%)', v_demande.statut;
  END IF;
  v_dernier := (SELECT e.type FROM public.institution_change_request_events e WHERE e.request_id = p_demande_id ORDER BY e.created_at DESC, e.id DESC LIMIT 1);
  IF v_dernier IS DISTINCT FROM 'complement_demande' THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: aucun complement n''est attendu pour cette demande';
  END IF;
  INSERT INTO public.institution_change_request_events (id, request_id, institution_id, type, acteur_type, acteur_id, acteur_nom, message, types_documents)
  VALUES (v_id, p_demande_id, p_institution_id, 'complement_fourni', 'membre', p_membre_id, v_membre_nom, v_message, '{}');
  RETURN jsonb_build_object('id', v_id, 'demande_id', p_demande_id, 'numero', v_demande.numero, 'champ', v_demande.champ);
END;
$$;

REVOKE ALL ON FUNCTION public.demander_complement_changement_profil(uuid,uuid,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demander_complement_changement_profil(uuid,uuid,text,text[]) TO service_role;
REVOKE ALL ON FUNCTION public.repondre_complement_changement_profil(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repondre_complement_changement_profil(uuid,uuid,uuid,text) TO service_role;

-- ROLLBACK (la table est immuable : vider seulement avec l'echappatoire documentee) :
--   DROP FUNCTION IF EXISTS public.repondre_complement_changement_profil(uuid,uuid,uuid,text);
--   DROP FUNCTION IF EXISTS public.demander_complement_changement_profil(uuid,uuid,text,text[]);
--   DROP TABLE IF EXISTS public.institution_change_request_events;
--   DROP FUNCTION IF EXISTS public.institution_change_request_events_proteger();
