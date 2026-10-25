-- Mission A, étape 4 (22/10/2026) — limiteur de tentatives de saisie du code
-- de confirmation (Centre de validation). Compteur à fenêtre glissante, par
-- agent (membre) et par institution. RLS activée, aucune policy : accès
-- exclusivement service_role, comme partout dans le projet.
-- Exécutée manuellement en dev par Bryan le 22/10/2026 ; ce fichier consigne
-- le SQL exécuté.

CREATE TABLE IF NOT EXISTS public.validation_code_tentatives (
  id            bigserial PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  membre_id     uuid NOT NULL REFERENCES public.institution_membres(id) ON DELETE CASCADE,
  reussie       boolean NOT NULL,
  tentee_le     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS validation_code_tentatives_membre_idx
  ON public.validation_code_tentatives (membre_id, tentee_le DESC);
CREATE INDEX IF NOT EXISTS validation_code_tentatives_inst_idx
  ON public.validation_code_tentatives (institution_id, tentee_le DESC);

ALTER TABLE public.validation_code_tentatives ENABLE ROW LEVEL SECURITY;

-- Purge des lignes anciennes (à appeler à la main ou depuis une tâche
-- planifiée ; aucune planification n'est créée ici).
CREATE OR REPLACE FUNCTION public.purger_validation_code_tentatives() RETURNS void
LANGUAGE sql AS $$
  DELETE FROM public.validation_code_tentatives WHERE tentee_le < now() - interval '1 day';
$$;

-- Retour arrière
-- DROP FUNCTION IF EXISTS public.purger_validation_code_tentatives();
-- DROP TABLE IF EXISTS public.validation_code_tentatives;
