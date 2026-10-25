-- Corrige une faille de institutions_exiger_documents_avant_validation
-- (migration 20261024000002) : la transition 'suspendue' -> 'validee' était
-- exclue sans condition, donc un établissement JAMAIS validé et sans aucun
-- document pouvait être validé en deux temps : suspendre (en_attente ->
-- suspendue) puis réactiver (suspendue -> validee).
--
-- NOUVELLE RÈGLE : depuis 'suspendue', la réactivation reste libre UNIQUEMENT
-- si l'établissement a déjà été validé un jour, prouvé par l'un des deux
-- marqueurs suivants :
--   - institutions.conditions_prestataire_acceptees_le IS NOT NULL (cette
--     acceptation n'est demandée qu'APRÈS validation) ;
--   - une trace VALIDER_INSTITUTION dans admin_logs.
-- Sinon, mêmes exigences de documents que pour une validation ordinaire.
-- Mêmes échappatoire et périmètre que la migration 000002 (CREATE OR REPLACE :
-- le trigger existant est conservé tel quel).
--
-- AVANT D'EXÉCUTER (comptes suspendus que la nouvelle règle bloquerait pour
-- une réactivation sans documents) :
--   SELECT i.id, i.name FROM institutions i
--   WHERE i.statut::text = 'suspendue'
--     AND i.conditions_prestataire_acceptees_le IS NULL
--     AND NOT EXISTS (SELECT 1 FROM admin_logs l WHERE l.cible_id = i.id AND l.action = 'VALIDER_INSTITUTION')
--     AND NOT EXISTS (SELECT 1 FROM documents_institution d WHERE d.institution_id = i.id AND d.statut_actif);
--
-- ROLLBACK : réexécuter le CREATE OR REPLACE FUNCTION de la migration 000002.

CREATE OR REPLACE FUNCTION public.institutions_exiger_documents_avant_validation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_requis text[];
  v_presence text;
  v_manquants text[];
BEGIN
  -- Uniquement la transition vers 'validee' depuis un statut non encore validé.
  IF NEW.statut::text <> 'validee' OR OLD.statut::text = 'validee' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.autoriser_validation_sans_documents', true) = 'on' THEN
    RAISE WARNING 'institutions: validation SANS contrôle des documents autorisée exceptionnellement (id=%).', NEW.id;
    RETURN NEW;
  END IF;

  -- Réactivation d'un compte déjà validé un jour : jamais re-contrôlé.
  IF OLD.statut::text = 'suspendue' AND (
       NEW.conditions_prestataire_acceptees_le IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.admin_logs l WHERE l.cible_id = NEW.id AND l.action = 'VALIDER_INSTITUTION')
     ) THEN
    RETURN NEW;
  END IF;

  v_requis := CASE NEW.statut_juridique
    WHEN 'public'              THEN ARRAY['nomination_habilitation']
    WHEN 'prive_formel'        THEN ARRAY['rccm', 'piece_identite']
    WHEN 'liberal'             THEN ARRAY['diplome_ordre', 'piece_identite']
    WHEN 'individuel_informel' THEN ARRAY['piece_identite', 'preuve_domicile']
    ELSE NULL
  END;

  IF v_requis IS NULL THEN
    RAISE EXCEPTION 'institutions: validation impossible, statut_juridique non renseigné ou inconnu (id=%) — les documents requis ne peuvent pas être déterminés', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.origine_type = 'etrangere' THEN
    SELECT statut_presence_guinee INTO v_presence
    FROM public.institution_identite_internationale
    WHERE institution_id = NEW.id;
    IF v_presence IN ('filiale', 'succursale', 'bureau_representation', 'prestataire_depuis_etranger', 'partenariat_representation_locale') THEN
      v_requis := v_requis || 'immatriculation_etrangere';
    END IF;
  END IF;

  SELECT array_agg(r) INTO v_manquants
  FROM unnest(v_requis) AS r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.documents_institution d
    WHERE d.institution_id = NEW.id
      AND d.type = r
      AND d.statut_actif
      AND d.statut::text IN ('recu', 'valide')
  );

  IF v_manquants IS NOT NULL THEN
    RAISE EXCEPTION 'institutions: validation impossible, documents non soumis ou à renvoyer (id=%) : %', NEW.id, array_to_string(v_manquants, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
