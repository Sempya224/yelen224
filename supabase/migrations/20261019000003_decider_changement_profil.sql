-- PROPOSÉE — NON EXÉCUTÉE. Dépend de 20261019000001 (table) ; indépendante de
-- 20261019000002. Voir docs/product/YELEN_REVERIFICATION_POLICY.md §3 et §6.
--
-- Décision administrative sur une demande d'examen de changement de profil
-- (institution_change_requests). Seule voie légitime : jamais d'UPDATE direct
-- (service_role n'a d'ailleurs plus de droit d'écriture sur la table). Calquée
-- sur decider_demande_activite (20260821000007) : SECURITY DEFINER,
-- search_path fixé, verrou consultatif, vérification optimiste de
-- concurrence, EXECUTE réservé à service_role.
--
-- Dans la MÊME transaction : (1) la transition a_examiner -> examinee avec
-- décision, acteur et date, (2) la ligne admin_logs correspondante (acteur
-- admin réel — c'est ici, et non à la création de la demande, que admin_logs
-- a un acteur à enregistrer). Si l'une échoue, l'autre est annulée.
--
-- Cette fonction ne lit ni n'écrit JAMAIS la table institutions : décider
-- d'une demande ne modifie ni le profil, ni le statut, ni le badge de
-- l'établissement. La correction d'un profil refusé ("a_corriger") reste une
-- action explicite du responsable de l'établissement.

CREATE OR REPLACE FUNCTION public.decider_changement_profil(
  p_demande_id            uuid,
  p_decision              text,
  p_commentaire           text,
  p_examinateur_admin_id  uuid,
  p_statut_vu             text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_examinateur_nom text;
  v_demande         public.institution_change_requests;
  v_commentaire     text := nullif(btrim(coalesce(p_commentaire, '')), '');
BEGIN
  IF p_demande_id IS NULL THEN
    RAISE EXCEPTION 'decider_changement_profil: p_demande_id requis';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('conforme','a_corriger') THEN
    RAISE EXCEPTION 'decider_changement_profil: décision invalide (%)', p_decision;
  END IF;
  IF p_decision = 'a_corriger' AND v_commentaire IS NULL THEN
    RAISE EXCEPTION 'decider_changement_profil: un commentaire est obligatoire pour demander une correction';
  END IF;
  IF p_examinateur_admin_id IS NULL THEN
    RAISE EXCEPTION 'decider_changement_profil: p_examinateur_admin_id requis';
  END IF;

  -- Examinateur réellement un admin actif — nom dérivé ici, jamais accepté du
  -- client (un nom falsifié se retrouverait dans une décision immuable).
  SELECT btrim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))
  INTO v_examinateur_nom
  FROM public.admin_users
  WHERE id = p_examinateur_admin_id AND is_active;
  IF v_examinateur_nom IS NULL OR length(v_examinateur_nom) = 0 THEN
    RAISE EXCEPTION 'decider_changement_profil: examinateur inconnu ou inactif (admin_id=%)', p_examinateur_admin_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('changement_profil_decision:' || p_demande_id::text));

  SELECT * INTO v_demande FROM public.institution_change_requests WHERE id = p_demande_id FOR UPDATE;
  IF v_demande.id IS NULL THEN
    RAISE EXCEPTION 'decider_changement_profil: demande inconnue (demande_id=%)', p_demande_id;
  END IF;

  -- Vérification optimiste : l'admin doit avoir vu l'état réel au moment où
  -- il a ouvert la demande.
  IF p_statut_vu IS DISTINCT FROM v_demande.statut THEN
    RAISE EXCEPTION 'decider_changement_profil: cette demande a déjà été traitée entretemps (statut actuel=%) — rechargez la liste avant de continuer', v_demande.statut;
  END IF;
  IF v_demande.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'decider_changement_profil: cette demande n''est plus à l''état a_examiner (statut actuel=%)', v_demande.statut;
  END IF;

  -- Seule transition permise par le trigger d'immuabilité.
  UPDATE public.institution_change_requests SET
    statut              = 'examinee',
    decision            = p_decision,
    decide_par_admin_id = p_examinateur_admin_id,
    decide_par_nom      = v_examinateur_nom,
    decide_le           = now(),
    commentaire_admin   = v_commentaire
  WHERE id = p_demande_id;

  INSERT INTO public.admin_logs (admin_id, action, cible_table, cible_id, details)
  VALUES (
    p_examinateur_admin_id, 'EXAMEN_CHANGEMENT_PROFIL', 'institution_change_requests', p_demande_id,
    jsonb_build_object('numero', v_demande.numero, 'champ', v_demande.champ, 'decision', p_decision,
                       'institution_id', v_demande.institution_id)
  );

  RETURN jsonb_build_object('id', p_demande_id, 'numero', v_demande.numero, 'decision', p_decision);
  -- Toute exception annule la transaction entière : pas de décision sans trace
  -- admin_logs, pas de trace sans décision.
END;
$$;

REVOKE ALL ON FUNCTION public.decider_changement_profil(uuid,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decider_changement_profil(uuid,text,text,uuid,text) TO service_role;

COMMENT ON FUNCTION public.decider_changement_profil IS
  'Seule voie légitime pour examiner une demande de changement de profil (conforme / à corriger). Verrouillage optimiste : le client fournit le statut vu à l''ouverture. Écrit la décision ET la ligne admin_logs dans une seule transaction. Ne touche jamais à la table institutions. Appelée exclusivement par api/admin/changements-profil/[id]/decision via service_role.';

-- ROLLBACK :
--   DROP FUNCTION IF EXISTS public.decider_changement_profil(uuid,text,text,uuid,text);
