-- Trust — Lot 2.4, stade EXPAND (2/3). Fonction transactionnelle unique
-- pour le remplacement atomique d'une version de document — décision CEO
-- Lot 2.3 (RPC plutôt que deux appels séquentiels : l'opération "créer la
-- nouvelle version + désactiver l'ancienne" doit être validée ou annulée
-- comme un tout). Relecture de sécurité complète :
-- docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md section 1,
-- affinée Lot 2.4 (schémas qualifiés explicitement, paramètres validés).
--
-- ⚠️ IMPORTANT POUR BRYAN : cette fonction est SECURITY DEFINER — elle
-- s'exécute avec les privilèges de son PROPRIÉTAIRE (celui qui l'exécute à
-- la création, normalement le rôle migrateur/postgres), jamais ceux de
-- l'appelant, et n'est PAS protégée par RLS comme une table le serait.
-- C'est pour cela que : (a) search_path est fixé explicitement (empêche un
-- détournement de schéma), (b) chaque table référencée est qualifiée
-- explicitement `public.xxx` (empêche toute ambiguïté même si search_path
-- était un jour modifié), (c) EXECUTE est révoqué à tous sauf service_role
-- immédiatement après création, (d) une vérification défensive interne
-- (appartenance du membre à l'institution) est faite MÊME SI la route
-- appelante a déjà vérifié la permission fine — défense en profondeur, pas
-- une redite inutile.
--
-- ⚠️ RÈGLE D'ARCHITECTURE (CEO, Lot 2.4) : toute écriture applicative de
-- versionnement de documents_institution DOIT passer par cette fonction.
-- Le maintien des privilèges larges de service_role sur cette table
-- (jamais révoqués, décision CEO explicite) ne doit JAMAIS être interprété
-- comme une autorisation de la contourner depuis une route applicative.
-- Seul app/api/institution/documents/route.ts (POST) doit l'appeler — si
-- un futur écran ajoute un deuxième point d'écriture de versionnement,
-- il doit appeler CETTE fonction, jamais un upsert/update direct.

CREATE OR REPLACE FUNCTION public.deposer_nouvelle_version_document(
  p_institution_id uuid,
  p_type text,
  p_nom text,
  p_storage_path text,
  p_hash_integrite text,
  p_soumis_par_membre_id uuid
) RETURNS public.documents_institution
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancienne public.documents_institution;
  v_nouvelle public.documents_institution;
BEGIN
  -- Validation des paramètres — aucun NULL/vide accepté silencieusement.
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: p_institution_id requis';
  END IF;
  IF p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: p_type requis';
  END IF;
  IF p_storage_path IS NULL OR length(trim(p_storage_path)) = 0 THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: p_storage_path requis';
  END IF;
  IF p_soumis_par_membre_id IS NULL THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: p_soumis_par_membre_id requis';
  END IF;

  -- Institution cible réellement existante (pas seulement un uuid syntaxiquement valide).
  IF NOT EXISTS (SELECT 1 FROM public.institutions WHERE id = p_institution_id) THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: institution inconnue (institution_id=%)', p_institution_id;
  END IF;

  -- Défense en profondeur : le membre doit réellement appartenir à
  -- l'institution ciblée et être actif. La vérification de permission fine
  -- (rôle admin, documents_institutionnels.write) reste faite en amont
  -- côté route (lib/institutionPermissions.ts) — ce contrôle-ci ne fait
  -- que refuser une incohérence d'appelant, pas une redite de la matrice.
  IF NOT EXISTS (
    SELECT 1 FROM public.institution_membres
    WHERE id = p_soumis_par_membre_id
      AND institution_id = p_institution_id
      AND actif
  ) THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: membre non autorisé pour cette institution (institution_id=%, membre_id=%)', p_institution_id, p_soumis_par_membre_id;
  END IF;

  -- Verrou consultatif transactionnel : sérialise toute transaction
  -- concurrente sur la même paire (institution_id, type). Portée
  -- transaction — libéré automatiquement au COMMIT ou au ROLLBACK, jamais
  -- besoin de le libérer manuellement.
  PERFORM pg_advisory_xact_lock(hashtext(p_institution_id::text || ':' || p_type));

  SELECT * INTO v_ancienne
  FROM public.documents_institution
  WHERE institution_id = p_institution_id AND type = p_type AND statut_actif
  FOR UPDATE;

  IF v_ancienne.id IS NOT NULL THEN
    UPDATE public.documents_institution
    SET statut_actif = false
    WHERE id = v_ancienne.id;
  END IF;

  INSERT INTO public.documents_institution (
    institution_id, type, nom, storage_path, hash_integrite,
    statut, soumis_le, numero_version, statut_actif,
    remplace_version_id, soumis_par_membre_id
  ) VALUES (
    p_institution_id, p_type, p_nom, p_storage_path, p_hash_integrite,
    'recu', now(), COALESCE(v_ancienne.numero_version, 0) + 1, true,
    v_ancienne.id, p_soumis_par_membre_id
  )
  RETURNING * INTO v_nouvelle;

  RETURN v_nouvelle;
  -- Toute exception levée avant ce RETURN (validation, membre non
  -- autorisé, contrainte violée) annule automatiquement TOUTE la
  -- transaction — la désactivation de l'ancienne version ci-dessus est
  -- annulée avec le reste si l'INSERT échoue. Propriété native
  -- PostgreSQL, testée explicitement au Lot 2.4 (scénario "rollback
  -- transactionnel").
END;
$$;

-- Privilèges EXECUTE explicitement contrôlés (CEO Lot 2.4, item 8) —
-- aucun rôle ne doit y accéder par défaut.
REVOKE ALL ON FUNCTION public.deposer_nouvelle_version_document(uuid,text,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deposer_nouvelle_version_document(uuid,text,text,text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deposer_nouvelle_version_document(uuid,text,text,text,text,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deposer_nouvelle_version_document(uuid,text,text,text,text,uuid) TO service_role;

COMMENT ON FUNCTION public.deposer_nouvelle_version_document IS
  'Seule voie légitime pour créer une nouvelle version de document institution — insère la nouvelle version et désactive l''ancienne dans une transaction atomique. Appelée exclusivement par app/api/institution/documents/route.ts (POST) via service_role. Ne jamais dupliquer cette logique en JS/TS avec deux appels séparés.';
