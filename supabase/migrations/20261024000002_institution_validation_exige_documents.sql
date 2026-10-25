-- Validation d'un établissement : documents requis soumis, imposé EN BASE.
--
-- Décision Bryan (24/10/2026) : "même un admin ne peut pas valider un
-- établissement qui n'a pas soumis ses documents" — y compris en SQL direct.
-- app/api/admin/institutions/[id]/valider/route.ts applique déjà cette règle
-- côté API ; ce trigger la rend infranchissable pour tout autre chemin
-- (SQL Editor, autre route, script).
--
-- RÈGLE (identique à la route et à lib/documentsInstitution.ts) :
--   passage de institutions.statut vers 'validee' refusé tant qu'un document
--   REQUIS n'a pas une version ACTIVE en statut 'recu' ou 'valide'.
--   Documents requis = fonction de statut_juridique (+ 'immatriculation_etrangere'
--   pour une organisation étrangère dont la présence en Guinée l'exige).
--
-- PÉRIMÈTRE VOLONTAIREMENT LIMITÉ :
--   - Ne s'applique QU'À la transition vers 'validee' depuis un autre statut.
--     Les établissements déjà validés ne sont jamais re-contrôlés (comptes
--     historiques validés avant l'existence du dépôt de documents, ex. Ecobank).
--   - Depuis 'suspendue' (réactivation d'un compte déjà validé un jour) : exclu,
--     comme app/api/admin/institutions/[id]/reactiver/route.ts.
--   - Pas de contrôle à l'INSERT (aucun flux n'insère directement 'validee').
--
-- ÉCHAPPATOIRE (même patron que les autres triggers protecteurs du projet) :
--   BEGIN;
--   SET LOCAL app.autoriser_validation_sans_documents = 'on';
--   UPDATE institutions SET statut = 'validee' WHERE id = '...';
--   COMMIT;
-- Réservée aux corrections exceptionnelles ; émet un WARNING tracé.
--
-- ⚠️ DUPLICATION ASSUMÉE : la table statut_juridique -> types de documents
-- existe en TypeScript (lib/documentsInstitution.ts) ET ici. Toute évolution
-- de l'une doit être reportée dans l'autre (commentaire miroir ajouté côté TS).
--
-- AVANT D'EXÉCUTER (aucun établissement existant n'est modifié, mais pour
-- savoir ce que le trigger bloquerait désormais) :
--   SELECT i.id, i.name, i.statut, i.statut_juridique
--   FROM institutions i
--   WHERE i.statut::text = 'en_attente'
--     AND NOT EXISTS (SELECT 1 FROM documents_institution d
--                     WHERE d.institution_id = i.id AND d.statut_actif);
--
-- ROLLBACK :
--   DROP TRIGGER IF EXISTS institutions_exiger_documents_avant_validation ON public.institutions;
--   DROP FUNCTION IF EXISTS public.institutions_exiger_documents_avant_validation();

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
  IF NEW.statut::text <> 'validee' OR OLD.statut::text IN ('validee', 'suspendue') THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.autoriser_validation_sans_documents', true) = 'on' THEN
    RAISE WARNING 'institutions: validation SANS contrôle des documents autorisée exceptionnellement (id=%).', NEW.id;
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

  -- Organisation étrangère : justificatif d'immatriculation à l'étranger, selon
  -- sa présence déclarée en Guinée (miroir de DOCUMENTS_INTERNATIONAUX_PAR_STATUT_PRESENCE).
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

DROP TRIGGER IF EXISTS institutions_exiger_documents_avant_validation ON public.institutions;
CREATE TRIGGER institutions_exiger_documents_avant_validation
  BEFORE UPDATE OF statut ON public.institutions
  FOR EACH ROW
  WHEN (NEW.statut IS DISTINCT FROM OLD.statut)
  EXECUTE FUNCTION public.institutions_exiger_documents_avant_validation();
