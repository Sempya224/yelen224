-- PROPOSEE - NON EXECUTEE. Lot 3 "restriction d'acces" - voir
-- docs/product/YELEN_REVERIFICATION_POLICY.md.
--
-- 1) L'admin peut, pendant l'examen d'une proposition, RESTREINDRE l'acces citoyen
--    de l'etablissement. On reutilise la suspension existante (statut 'suspendue',
--    ligne institution_suspensions avec reference SUS-..., annulation automatique
--    des RDV imminents, ecran "Espace suspendu" avec droit de revision, levee
--    automatique ou par l'admin) : AUCUNE seconde mecanique de restriction. La
--    nouveaute est de l'appliquer en UNE transaction liee a la demande
--    (statut + suspension + evenement du journal + admin_logs).
-- 2) Correction d'un trou : un etablissement 'suspendue' a deja ete public ; ses
--    changements sensibles doivent rester des propositions (sinon il pourrait
--    renommer son etablissement pendant la suspension, sans examen, et ce nom
--    deviendrait public a la levee). v_publique = statut IN ('validee','suspendue').
-- 3) repondre_complement : seuls les evenements de type complement comptent pour
--    savoir si un complement est attendu (un evenement 'acces_restreint' ne doit
--    pas l'empecher).
--
-- Ordre : 000003 puis 000004. Chaines et messages en ASCII (l'editeur SQL de Supabase tronque les collages
-- accentues). Remplace appliquer_modifications_sensibles (20261020000001) et
-- repondre_complement_changement_profil (20261020000002). Rollback : rejouer ces
-- deux fichiers, puis supprimer la fonction restreindre_acces_changement_profil.

ALTER TABLE public.institution_change_request_events ADD COLUMN IF NOT EXISTS suspension_reference text;
ALTER TABLE public.institution_change_request_events DROP CONSTRAINT IF EXISTS institution_change_request_events_type_check;
ALTER TABLE public.institution_change_request_events ADD CONSTRAINT institution_change_request_events_type_check CHECK (type IN ('complement_demande', 'complement_fourni', 'acces_restreint'));
ALTER TABLE public.institution_change_request_events DROP CONSTRAINT IF EXISTS icre_motif_restriction;
ALTER TABLE public.institution_change_request_events ADD CONSTRAINT icre_motif_restriction CHECK (type <> 'acces_restreint' OR (message IS NOT NULL AND length(btrim(message)) > 0 AND suspension_reference IS NOT NULL));

CREATE OR REPLACE FUNCTION public.restreindre_acces_changement_profil(
  p_demande_id uuid,
  p_admin_id   uuid,
  p_motif      text,
  p_duree_jours integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_nom  text;
  v_demande    public.institution_change_requests;
  v_inst       public.institutions;
  v_motif      text := nullif(btrim(coalesce(p_motif, '')), '');
  v_jusqu_au   timestamptz;
  v_reference  text;
  v_id         uuid := gen_random_uuid();
BEGIN
  IF p_demande_id IS NULL THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: p_demande_id requis';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: p_admin_id requis';
  END IF;
  IF v_motif IS NULL THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: un motif est obligatoire pour restreindre l acces';
  END IF;
  IF length(v_motif) > 1000 THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: motif trop long (1000 caracteres maximum)';
  END IF;
  IF p_duree_jours IS NOT NULL AND (p_duree_jours < 1 OR p_duree_jours > 365) THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: duree invalide (1 a 365 jours)';
  END IF;
  v_admin_nom := (SELECT btrim(coalesce(a.prenom, '') || ' ' || coalesce(a.nom, '')) FROM public.admin_users a WHERE a.id = p_admin_id AND a.is_active);
  IF v_admin_nom IS NULL OR length(v_admin_nom) = 0 THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: administrateur inconnu ou inactif';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('changement_profil_decision:' || p_demande_id::text));
  v_demande := (SELECT r FROM public.institution_change_requests r WHERE r.id = p_demande_id FOR UPDATE);
  IF v_demande.id IS NULL THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: demande inconnue';
  END IF;
  IF v_demande.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: cette demande n''est plus a l''etat a_examiner (statut actuel=%)', v_demande.statut;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('institution_profil:' || v_demande.institution_id::text));
  v_inst := (SELECT i FROM public.institutions i WHERE i.id = v_demande.institution_id FOR UPDATE);
  IF v_inst.id IS NULL THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: institution inconnue';
  END IF;
  IF v_inst.statut::text <> 'validee' THEN
    RAISE EXCEPTION 'restreindre_acces_changement_profil: etablissement deja restreint ou non public (statut actuel=%)', v_inst.statut::text;
  END IF;
  v_jusqu_au := CASE WHEN p_duree_jours IS NULL THEN NULL ELSE now() + make_interval(days => p_duree_jours) END;
  UPDATE public.institutions SET statut = 'suspendue' WHERE id = v_inst.id;
  INSERT INTO public.institution_suspensions (id, institution_id, motif, duree_jours, jusqu_au, admin_id)
  VALUES (v_id, v_inst.id, v_motif || ' (demande ' || v_demande.numero || ')', p_duree_jours, v_jusqu_au, p_admin_id);
  v_reference := (SELECT s.reference FROM public.institution_suspensions s WHERE s.id = v_id);
  INSERT INTO public.institution_change_request_events (request_id, institution_id, type, acteur_type, acteur_id, acteur_nom, message, suspension_reference)
  VALUES (p_demande_id, v_inst.id, 'acces_restreint', 'admin', p_admin_id, v_admin_nom, v_motif, v_reference);
  INSERT INTO public.admin_logs (admin_id, action, cible_table, cible_id, details)
  VALUES (p_admin_id, 'RESTREINDRE_ACCES_CHANGEMENT_PROFIL', 'institutions', v_inst.id,
          jsonb_build_object('numero', v_demande.numero, 'champ', v_demande.champ, 'reference', v_reference, 'jusqu_au', v_jusqu_au, 'name', v_inst.name));
  RETURN jsonb_build_object('reference', v_reference, 'institution_id', v_inst.id, 'demande_id', p_demande_id, 'numero', v_demande.numero, 'champ', v_demande.champ, 'jusqu_au', v_jusqu_au, 'name', v_inst.name);
END;
$$;

REVOKE ALL ON FUNCTION public.restreindre_acces_changement_profil(uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restreindre_acces_changement_profil(uuid,uuid,text,integer) TO service_role;

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
  v_dernier := (SELECT e.type FROM public.institution_change_request_events e WHERE e.request_id = p_demande_id AND e.type IN ('complement_demande', 'complement_fourni') ORDER BY e.created_at DESC, e.id DESC LIMIT 1);
  IF v_dernier IS DISTINCT FROM 'complement_demande' THEN
    RAISE EXCEPTION 'repondre_complement_changement_profil: aucun complement n''est attendu pour cette demande';
  END IF;
  INSERT INTO public.institution_change_request_events (id, request_id, institution_id, type, acteur_type, acteur_id, acteur_nom, message, types_documents) VALUES (v_id, p_demande_id, p_institution_id, 'complement_fourni', 'membre', p_membre_id, v_membre_nom, v_message, '{}');
  RETURN jsonb_build_object('id', v_id, 'demande_id', p_demande_id, 'numero', v_demande.numero, 'champ', v_demande.champ);
END;
$$;

-- La correction "suspendue reste protege" de appliquer_modifications_sensibles est
-- dans 20261020000004_appliquer_suspendue_protege.sql (fonction complete, une seule
-- ligne changee), a executer apres ce fichier.
