-- Trust — Lot 2.4, stade SWITCH. Remplace la contrainte d'unicité globale
-- par un index unique partiel (autorise l'historique de versions) et pose
-- le trigger d'immuabilité partielle sur documents_institution.
--
-- ⚠️⚠️ NE JAMAIS EXÉCUTER CE FICHIER SEUL ⚠️⚠️
-- Doit être déployé DANS LA MÊME FENÊTRE que la réécriture de
-- app/api/institution/documents/route.ts (POST) — voir
-- docs/product/YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md. L'ancien
-- `upsert(..., {onConflict:"institution_id,type"})` cesse de correspondre
-- à une contrainte réelle dès que ce fichier s'exécute — le code doit déjà
-- être celui qui appelle deposer_nouvelle_version_document() au moment où
-- ce fichier passe, sinon la soumission de documents casse en production
-- le temps de l'écart (voir YELEN_TRUST_VERIFICATION_DATA_MODEL.md
-- section L, "point de séquencement critique").
--
-- Prérequis avant d'exécuter ce fichier (voir rapport de migration) :
--  - 20260816000001/000002/000003 déjà exécutés et vérifiés ;
--  - inventaire des lignes existantes fait (aucune ligne autre que
--    statut='recu' trouvée, ou cas particulier documenté) ;
--  - code de la route POST prêt à être déployé au même moment.

-- Retire l'ancienne contrainte qui forçait l'écrasement.
ALTER TABLE documents_institution
  DROP CONSTRAINT IF EXISTS documents_institution_institution_type_unique;

-- Au plus une version ACTIVE par (institution_id, type) — les versions
-- historiques (statut_actif=false) ne sont plus concernées par cette
-- contrainte, c'est ce qui rend le versionnement possible.
CREATE UNIQUE INDEX documents_institution_type_actif_unique
  ON documents_institution (institution_id, type)
  WHERE statut_actif;

-- Trigger d'immuabilité PARTIELLE — patron nouveau pour ce projet (les
-- trois autres triggers d'immuabilité du projet bloquent TOUT UPDATE ;
-- celui-ci autorise deux transitions précises et bornées : l'examen
-- initial (statut recu → décision) et la désactivation lors d'un
-- remplacement). Relu et corrigé au Lot 2.3/2.4
-- (docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md section 2)
-- après qu'une relecture ait trouvé deux failles dans la version initiale :
-- (1) DELETE n'était pas réellement bloqué (seul le commentaire l'affirmait) ;
-- (2) motif_rejet/examine_le/examine_par pouvaient être modifiés
--     indépendamment de statut une fois la décision prise (falsification
--     de l'examinateur après coup sans changer le statut affiché).
--
-- ⚠️ IMPORTANT POUR BRYAN : échappatoire transactionnelle, même patron que
-- les 3 autres tables immuables du projet :
--   SET LOCAL app.autoriser_correction_documents_institution = 'on';
--   UPDATE documents_institution SET ... WHERE id = '...';
CREATE OR REPLACE FUNCTION documents_institution_interdire_falsification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_documents_institution', true) = 'on' THEN
    RAISE WARNING 'documents_institution: modification manuelle exceptionnelle autorisée (id=%).', COALESCE(NEW.id, OLD.id);
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'documents_institution: suppression interdite, aucune version n''est jamais supprimée (id=%)', OLD.id;
  END IF;

  -- TG_OP = 'UPDATE' à partir d'ici. Colonnes qui définissent "ce qui a
  -- été soumis, par qui, quand, où" — jamais modifiables après coup.
  IF NEW.institution_id  IS DISTINCT FROM OLD.institution_id
     OR NEW.type          IS DISTINCT FROM OLD.type
     OR NEW.numero_version IS DISTINCT FROM OLD.numero_version
     OR NEW.soumis_le     IS DISTINCT FROM OLD.soumis_le
     OR NEW.storage_path  IS DISTINCT FROM OLD.storage_path
     OR NEW.hash_integrite IS DISTINCT FROM OLD.hash_integrite
     OR NEW.soumis_par_membre_id IS DISTINCT FROM OLD.soumis_par_membre_id
     OR NEW.remplace_version_id IS DISTINCT FROM OLD.remplace_version_id
  THEN
    RAISE EXCEPTION 'documents_institution: cette version est figée, seuls statut/motif_rejet/examine_le/examine_par (une fois, depuis recu) et statut_actif (true->false uniquement) peuvent évoluer (id=%)', OLD.id;
  END IF;

  -- statut_actif : true -> false uniquement (désactivation lors d'un
  -- remplacement). Le sens inverse ne doit jamais se reproduire.
  IF OLD.statut_actif = false AND NEW.statut_actif = true THEN
    RAISE EXCEPTION 'documents_institution: statut_actif ne peut jamais repasser à true (id=%)', OLD.id;
  END IF;

  -- Décision (statut/motif_rejet/examine_le/examine_par) : autorisée une
  -- seule fois, uniquement depuis statut='recu'. Une fois la décision
  -- prise, les 4 colonnes sont figées ENSEMBLE (pas seulement `statut`
  -- isolément — c'est la faille trouvée en relecture).
  IF OLD.statut <> 'recu' AND (
       NEW.statut IS DISTINCT FROM OLD.statut
    OR NEW.motif_rejet IS DISTINCT FROM OLD.motif_rejet
    OR NEW.examine_le IS DISTINCT FROM OLD.examine_le
    OR NEW.examine_par IS DISTINCT FROM OLD.examine_par
  ) THEN
    RAISE EXCEPTION 'documents_institution: décision déjà prise pour cette version, immuable (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_institution_immuable_partiel
  BEFORE UPDATE OR DELETE ON documents_institution
  FOR EACH ROW EXECUTE FUNCTION documents_institution_interdire_falsification();
