-- Trust — Lot 2.5, étape 9/10. Fonction transactionnelle pour
-- l'examen administratif : verrouillage optimiste + relecture de l'état
-- réel au moment de la décision — décision CEO explicite ("verrouillage
-- optimiste transactionnel", "ne pas inventer un nouveau mécanisme si
-- celui déjà validé peut être réutilisé"). Même patron que
-- deposer_nouvelle_version_document (Lot 2.4, 15/15 VERIFIED IN DATABASE),
-- appliqué ici à verification_decisions/verification_decision_preuves.
--
-- ⚠️ IMPORTANT POUR BRYAN : comme deposer_nouvelle_version_document, cette
-- fonction est SECURITY DEFINER, schémas qualifiés explicitement, search_path
-- fixé, EXECUTE limité à service_role. Contrairement à cette dernière,
-- verification_decisions/verification_decision_preuves restent TOTALEMENT
-- immuables (aucune colonne "est active" à désactiver) — cette fonction ne
-- fait donc jamais d'UPDATE, uniquement des INSERT, protégés par un verrou
-- consultatif + une vérification optimiste de concurrence.
--
-- ⚠️ RÈGLE D'ARCHITECTURE (même principe que la migration 20260816000002) :
-- toute décision de vérification DOIT passer par cette fonction. Le
-- maintien des privilèges larges de service_role ne doit jamais être
-- interprété comme une autorisation de la contourner.

CREATE OR REPLACE FUNCTION public.prendre_decision_verification(
  p_institution_id uuid,
  p_axe text,
  p_type_decision text,
  p_niveau_preuve text,
  p_justification text,
  p_complement_demande_motif text,
  p_examinateur_admin_id uuid,
  p_expire_le timestamptz,
  p_derniere_decision_vue_id uuid,
  p_document_institution_ids uuid[]
) RETURNS public.verification_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_examinateur_nom text;
  v_derniere_decision public.verification_decisions;
  v_nouvelle_decision public.verification_decisions;
  v_doc public.documents_institution;
  v_doc_id uuid;
BEGIN
  -- Validation des paramètres — aucun NULL/vide accepté silencieusement.
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'prendre_decision_verification: p_institution_id requis';
  END IF;
  IF p_axe NOT IN ('identite','autorite') THEN
    RAISE EXCEPTION 'prendre_decision_verification: p_axe invalide (%), attendu identite ou autorite', p_axe;
  END IF;
  IF p_type_decision NOT IN ('accordee','complement_demande','rejetee') THEN
    RAISE EXCEPTION 'prendre_decision_verification: p_type_decision invalide (%) — la révocation n''est pas gérée par cette fonction', p_type_decision;
  END IF;
  IF p_justification IS NULL OR length(trim(p_justification)) = 0 THEN
    RAISE EXCEPTION 'prendre_decision_verification: justification requise';
  END IF;
  IF p_type_decision = 'accordee' AND (p_niveau_preuve IS NULL OR p_niveau_preuve NOT IN ('profil_verifie','institution_certifiee')) THEN
    RAISE EXCEPTION 'prendre_decision_verification: niveau_preuve requis et doit être profil_verifie ou institution_certifiee pour une décision accordee';
  END IF;
  IF p_type_decision = 'complement_demande' AND (p_complement_demande_motif IS NULL OR length(trim(p_complement_demande_motif)) = 0) THEN
    RAISE EXCEPTION 'prendre_decision_verification: complement_demande_motif requis pour une décision complement_demande';
  END IF;
  IF p_type_decision = 'accordee' AND (p_document_institution_ids IS NULL OR array_length(p_document_institution_ids, 1) IS NULL) THEN
    RAISE EXCEPTION 'prendre_decision_verification: au moins une preuve active requise pour accorder une décision';
  END IF;
  IF p_examinateur_admin_id IS NULL THEN
    RAISE EXCEPTION 'prendre_decision_verification: p_examinateur_admin_id requis';
  END IF;

  -- Institution cible réellement existante.
  IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = p_institution_id) THEN
    RAISE EXCEPTION 'prendre_decision_verification: institution inconnue (institution_id=%)', p_institution_id;
  END IF;

  -- Examinateur réellement un admin actif — le nom est dérivé ici, jamais
  -- accepté du client (évite qu'un nom falsifié se retrouve dans un
  -- snapshot immuable pour toujours).
  SELECT trim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))
  INTO v_examinateur_nom
  FROM public.admin_users
  WHERE id = p_examinateur_admin_id AND is_active;
  IF v_examinateur_nom IS NULL OR length(v_examinateur_nom) = 0 THEN
    RAISE EXCEPTION 'prendre_decision_verification: examinateur inconnu ou inactif (admin_id=%)', p_examinateur_admin_id;
  END IF;

  -- Verrou consultatif transactionnel — espace de noms distinct de celui
  -- de deposer_nouvelle_version_document (préfixe explicite) pour éviter
  -- toute collision entre les deux domaines de verrouillage.
  PERFORM pg_advisory_xact_lock(hashtext('verif_decision:' || p_institution_id::text || ':' || p_axe));

  -- Relecture de la VRAIE dernière décision pour cet axe — jamais l'état
  -- que l'admin avait à l'ouverture du dossier.
  SELECT * INTO v_derniere_decision
  FROM public.verification_decisions
  WHERE institution_id = p_institution_id AND axe = p_axe
  ORDER BY decide_le DESC
  LIMIT 1
  FOR UPDATE;

  -- Vérification optimiste de concurrence : l'admin doit avoir vu
  -- exactement la dernière décision réelle, sinon refus explicite —
  -- aucune décision contradictoire silencieuse.
  IF (v_derniere_decision.id IS NULL AND p_derniere_decision_vue_id IS NOT NULL)
     OR (v_derniere_decision.id IS NOT NULL AND v_derniere_decision.id IS DISTINCT FROM p_derniere_decision_vue_id)
  THEN
    RAISE EXCEPTION 'prendre_decision_verification: une autre décision a déjà été prise entretemps par % le % (decision_id=%) — rechargez le dossier avant de continuer',
      v_derniere_decision.examinateur_nom, v_derniere_decision.decide_le, v_derniere_decision.decision_id;
  END IF;

  -- Chaque preuve citée doit être réelle, appartenir à cette institution,
  -- et être ACTIVE au moment de la décision — jamais une version remplacée
  -- pendant l'examen (protège aussi contre "document expiré/remplacé
  -- pendant l'examen").
  --
  -- ⚠️ LIMITE CONNUE, ACCEPTÉE POUR CE LOT (trouvée en relecture 16/08/2026,
  -- non corrigée ici) : cette fonction ne vérifie PAS que le `type` de
  -- chaque preuve correspond réellement à `p_axe`. YELEN_TRUST_MODEL.md
  -- section 1 montre que cette correspondance dépend du statut_juridique
  -- (ex. "pièce d'identité" sert l'axe Autorité pour un professionnel
  -- libéral où "Identité et Autorité se confondent", mais pas pour une
  -- entreprise formelle) — un mapping global type→axe figé en dur serait
  -- une supposition, pas une donnée déjà tranchée. Mitigation actuelle :
  -- l'écran admin ne doit proposer que les preuves pertinentes pour l'axe
  -- en cours de décision (contrôle UI, pas DB). Si un mapping formel est
  -- un jour nécessaire, il doit être conçu comme son propre lot, pas
  -- deviné ici.
  IF p_document_institution_ids IS NOT NULL THEN
    FOREACH v_doc_id IN ARRAY p_document_institution_ids LOOP
      SELECT * INTO v_doc FROM public.documents_institution WHERE id = v_doc_id;
      IF v_doc.id IS NULL THEN
        RAISE EXCEPTION 'prendre_decision_verification: preuve inconnue (document_institution_id=%)', v_doc_id;
      END IF;
      IF v_doc.institution_id <> p_institution_id THEN
        RAISE EXCEPTION 'prendre_decision_verification: preuve % n''appartient pas à cette institution', v_doc_id;
      END IF;
      IF NOT v_doc.statut_actif THEN
        RAISE EXCEPTION 'prendre_decision_verification: preuve % n''est plus la version active — elle a été remplacée pendant l''examen, rechargez le dossier', v_doc_id;
      END IF;
    END LOOP;
  END IF;

  -- Insertion de la décision (insert-only, jamais de UPDATE).
  INSERT INTO public.verification_decisions (
    institution_id, axe, type_decision, niveau_preuve,
    examinateur_admin_id, examinateur_nom, justification, expire_le,
    complement_demande_motif, decision_precedente_id
  ) VALUES (
    p_institution_id, p_axe, p_type_decision, p_niveau_preuve,
    p_examinateur_admin_id, v_examinateur_nom, p_justification, p_expire_le,
    p_complement_demande_motif, v_derniere_decision.id
  )
  RETURNING * INTO v_nouvelle_decision;

  -- Snapshot figé de chaque preuve utilisée, lu depuis l'état tout juste
  -- revérifié ci-dessus (jamais depuis un état transmis par le client).
  IF p_document_institution_ids IS NOT NULL THEN
    FOREACH v_doc_id IN ARRAY p_document_institution_ids LOOP
      SELECT * INTO v_doc FROM public.documents_institution WHERE id = v_doc_id;
      INSERT INTO public.verification_decision_preuves (
        decision_id, document_institution_id, type_snapshot, numero_version_snapshot,
        statut_snapshot, storage_path_snapshot, hash_integrite_snapshot,
        soumis_le_snapshot, examine_le_snapshot, examine_par_nom_snapshot
      ) VALUES (
        v_nouvelle_decision.id, v_doc.id, v_doc.type, v_doc.numero_version,
        v_doc.statut, v_doc.storage_path, v_doc.hash_integrite,
        v_doc.soumis_le, v_doc.examine_le,
        (SELECT trim(coalesce(prenom,'') || ' ' || coalesce(nom,'')) FROM public.admin_users WHERE id = v_doc.examine_par)
      );
    END LOOP;
  END IF;

  RETURN v_nouvelle_decision;
  -- Toute exception levée avant ce RETURN (conflit de concurrence, preuve
  -- invalide, contrainte violée) annule automatiquement toute la
  -- transaction — aucune décision partielle, aucun snapshot orphelin.
END;
$$;

REVOKE ALL ON FUNCTION public.prendre_decision_verification(uuid,text,text,text,text,text,uuid,timestamptz,uuid,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prendre_decision_verification(uuid,text,text,text,text,text,uuid,timestamptz,uuid,uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.prendre_decision_verification(uuid,text,text,text,text,text,uuid,timestamptz,uuid,uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prendre_decision_verification(uuid,text,text,text,text,text,uuid,timestamptz,uuid,uuid[]) TO service_role;

COMMENT ON FUNCTION public.prendre_decision_verification IS
  'Seule voie légitime pour enregistrer une décision de vérification (axe identite/autorite). Verrouillage optimiste : le client doit fournir la dernière decision_id qu''il a vue, rejetée si elle ne correspond plus à la réalité au moment de la décision. Appelée exclusivement par les routes admin via service_role, jamais un INSERT direct.';
