-- Chantier Taxonomie des activités — Phase 1, migration 7/8. Fonction
-- transactionnelle unique pour décider d'une demande "Autre activité" —
-- calquée 1:1 sur prendre_decision_verification
-- (20260816000006_verification_admin_decision_rpc.sql) : verrouillage
-- avisé + relecture de l'état réel + vérification optimiste de
-- concurrence, SECURITY DEFINER, search_path fixé, EXECUTE réservé à
-- service_role. Toute demande DOIT passer par cette fonction, jamais un
-- UPDATE/INSERT direct.
CREATE OR REPLACE FUNCTION public.decider_demande_activite(
  p_demande_id uuid,
  p_decision text,
  p_note text,
  p_examinateur_admin_id uuid,
  p_statut_vu text,
  p_activite_existante_id uuid,
  p_nouvelle_categorie_id uuid,
  p_nouvelle_code text,
  p_nouveau_label text,
  p_nouvelle_description text,
  p_nouveaux_alias text[]
) RETURNS public.activite_demande_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_examinateur_nom   text;
  v_demande           public.activite_demandes;
  v_nouvelle_activite  public.activites;
  v_resultante_id      uuid;
  v_decision           public.activite_demande_decisions;
BEGIN
  IF p_demande_id IS NULL THEN
    RAISE EXCEPTION 'decider_demande_activite: p_demande_id requis';
  END IF;
  IF p_decision NOT IN ('validee','rattachee','refusee') THEN
    RAISE EXCEPTION 'decider_demande_activite: p_decision invalide (%)', p_decision;
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'decider_demande_activite: note requise';
  END IF;
  IF p_examinateur_admin_id IS NULL THEN
    RAISE EXCEPTION 'decider_demande_activite: p_examinateur_admin_id requis';
  END IF;
  IF p_decision = 'rattachee' AND p_activite_existante_id IS NULL THEN
    RAISE EXCEPTION 'decider_demande_activite: p_activite_existante_id requis pour un rattachement';
  END IF;
  IF p_decision = 'validee' AND (
       p_nouvelle_categorie_id IS NULL
    OR p_nouvelle_code IS NULL OR length(trim(p_nouvelle_code)) = 0
    OR p_nouveau_label IS NULL OR length(trim(p_nouveau_label)) = 0
  ) THEN
    RAISE EXCEPTION 'decider_demande_activite: categorie/code/label requis pour créer une nouvelle activité';
  END IF;

  -- Examinateur réellement un admin actif — nom dérivé ici, jamais
  -- accepté du client (même raison que prendre_decision_verification :
  -- éviter qu'un nom falsifié se retrouve dans une décision immuable).
  SELECT trim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))
  INTO v_examinateur_nom
  FROM public.admin_users
  WHERE id = p_examinateur_admin_id AND is_active;
  IF v_examinateur_nom IS NULL OR length(v_examinateur_nom) = 0 THEN
    RAISE EXCEPTION 'decider_demande_activite: examinateur inconnu ou inactif (admin_id=%)', p_examinateur_admin_id;
  END IF;

  -- Verrou consultatif transactionnel — espace de noms distinct de
  -- verif_decision:* (prendre_decision_verification) pour éviter toute
  -- collision entre les deux domaines de verrouillage.
  PERFORM pg_advisory_xact_lock(hashtext('activite_demande:' || p_demande_id::text));

  SELECT * INTO v_demande FROM public.activite_demandes WHERE id = p_demande_id FOR UPDATE;
  IF v_demande.id IS NULL THEN
    RAISE EXCEPTION 'decider_demande_activite: demande inconnue (demande_id=%)', p_demande_id;
  END IF;

  -- Vérification optimiste de concurrence : l'admin doit avoir vu
  -- exactement le statut réel au moment de l'ouverture du dossier.
  IF p_statut_vu IS DISTINCT FROM v_demande.statut THEN
    RAISE EXCEPTION 'decider_demande_activite: cette demande a déjà été traitée entretemps (statut actuel=%) — rechargez la file avant de continuer', v_demande.statut;
  END IF;
  IF v_demande.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'decider_demande_activite: cette demande n''est plus à l''état a_examiner (statut actuel=%)', v_demande.statut;
  END IF;

  IF p_decision = 'validee' THEN
    IF NOT EXISTS (SELECT 1 FROM public.activite_categories WHERE id = p_nouvelle_categorie_id) THEN
      RAISE EXCEPTION 'decider_demande_activite: catégorie inconnue (categorie_id=%)', p_nouvelle_categorie_id;
    END IF;
    INSERT INTO public.activites (categorie_id, code, label, description, alias)
    VALUES (p_nouvelle_categorie_id, p_nouvelle_code, p_nouveau_label, p_nouvelle_description, coalesce(p_nouveaux_alias, '{}'))
    RETURNING * INTO v_nouvelle_activite;
    v_resultante_id := v_nouvelle_activite.id;
  ELSIF p_decision = 'rattachee' THEN
    IF NOT EXISTS (SELECT 1 FROM public.activites WHERE id = p_activite_existante_id) THEN
      RAISE EXCEPTION 'decider_demande_activite: activité à rattacher inconnue (activite_id=%)', p_activite_existante_id;
    END IF;
    v_resultante_id := p_activite_existante_id;
  ELSE
    v_resultante_id := NULL;
  END IF;

  -- Autorisé par le trigger d'immuabilité partielle : exactement une
  -- transition de statut depuis 'a_examiner' (migration 20260821000006).
  UPDATE public.activite_demandes SET statut = p_decision WHERE id = p_demande_id;

  INSERT INTO public.activite_demande_decisions (
    demande_id, decision, activite_resultante_id, note, decide_par_admin_id, decide_par_nom
  ) VALUES (
    p_demande_id, p_decision, v_resultante_id, p_note, p_examinateur_admin_id, v_examinateur_nom
  )
  RETURNING * INTO v_decision;

  RETURN v_decision;
  -- Toute exception levée avant ce RETURN annule automatiquement toute
  -- la transaction (UPDATE + éventuelle création d'activité + INSERT
  -- décision) — aucun état partiel possible.
END;
$$;

REVOKE ALL ON FUNCTION public.decider_demande_activite(uuid,text,text,uuid,text,uuid,uuid,text,text,text,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decider_demande_activite(uuid,text,text,uuid,text,uuid,uuid,text,text,text,text[]) FROM anon;
REVOKE ALL ON FUNCTION public.decider_demande_activite(uuid,text,text,uuid,text,uuid,uuid,text,text,text,text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decider_demande_activite(uuid,text,text,uuid,text,uuid,uuid,text,text,text,text[]) TO service_role;

COMMENT ON FUNCTION public.decider_demande_activite IS
  'Seule voie légitime pour décider d''une demande "Autre activité" (valider/rattacher/refuser). Verrouillage optimiste : le client doit fournir le statut qu''il a vu à l''ouverture du dossier, rejeté si la demande a déjà été traitée entretemps. Appelée exclusivement par les routes admin via service_role, jamais un INSERT/UPDATE direct.';
