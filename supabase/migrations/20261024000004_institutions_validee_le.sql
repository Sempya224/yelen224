-- Date de validation d'un établissement, enregistrée en base.
--
-- Jusqu'ici aucune colonne ne portait la date à laquelle un établissement est
-- passé à 'validee' : seule une trace VALIDER_INSTITUTION dans admin_logs
-- existait (et pas pour les comptes validés avant ce journal ou en SQL).
-- L'écran Documents de l'établissement ne pouvait donc afficher aucune date de
-- validation.
--
-- RÈGLE : institutions.validee_le = date de la PREMIÈRE validation. Posée une
-- seule fois par trigger, quel que soit le chemin (route admin, SQL direct,
-- réactivation) ; une réactivation après suspension ne la change jamais.
-- Reste NULL pour un compte validé dont la date est inconnue : on n'invente rien.
--
-- BACKFILL : depuis la plus ancienne trace VALIDER_INSTITUTION d'admin_logs.
-- Les comptes validés sans trace gardent NULL (aucune date fabriquée).
--
-- SANS DANGER À REJOUER : colonne IF NOT EXISTS, fonction CREATE OR REPLACE,
-- trigger DROP IF EXISTS + CREATE, backfill limité aux lignes encore NULL.
--
-- ROLLBACK :
--   DROP TRIGGER IF EXISTS institutions_horodater_validation ON public.institutions;
--   DROP FUNCTION IF EXISTS public.institutions_horodater_validation();
--   ALTER TABLE public.institutions DROP COLUMN IF EXISTS validee_le;

ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS validee_le timestamptz;

COMMENT ON COLUMN public.institutions.validee_le IS
  'Date de la première validation (statut passé à validee). Posée par le trigger institutions_horodater_validation, jamais modifiée ensuite. NULL = non validé, ou validé avant le suivi sans trace exploitable.';

CREATE OR REPLACE FUNCTION public.institutions_horodater_validation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Réactivation d'un compte déjà validé un jour (conditions prestataire
  -- acceptées) dont la date d'origine est inconnue : on ne fabrique pas une
  -- date de validation avec la date de réactivation.
  IF NEW.validee_le IS NULL
     AND NOT (OLD.statut::text = 'suspendue' AND NEW.conditions_prestataire_acceptees_le IS NOT NULL) THEN
    NEW.validee_le := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS institutions_horodater_validation ON public.institutions;
CREATE TRIGGER institutions_horodater_validation
  BEFORE UPDATE OF statut ON public.institutions
  FOR EACH ROW
  WHEN (NEW.statut::text = 'validee' AND OLD.statut::text <> 'validee')
  EXECUTE FUNCTION public.institutions_horodater_validation();

-- Backfill : plus ancienne validation tracée dans le journal admin.
UPDATE public.institutions i
SET validee_le = l.premiere
FROM (
  SELECT cible_id, min(created_at) AS premiere
  FROM public.admin_logs
  WHERE action = 'VALIDER_INSTITUTION' AND cible_id IS NOT NULL
  GROUP BY cible_id
) l
WHERE l.cible_id = i.id
  AND i.statut::text = 'validee'
  AND i.validee_le IS NULL;
