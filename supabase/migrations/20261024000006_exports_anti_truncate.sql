-- exports : interdiction du TRUNCATE (24/10/2026).
--
-- Pourquoi : `exports` est une table de preuve INSERT-ONLY (migration
-- 20261024000005). Le trigger exports_immuable bloque UPDATE et DELETE ligne
-- par ligne, mais un TRUNCATE ne déclenche pas de trigger de ligne : il vide
-- la table d'un coup, sans passer par ce garde-fou, et reste possible pour le
-- propriétaire de la table (postgres). Ce trigger au niveau instruction ferme
-- ce dernier angle. Il s'applique aussi à un TRUNCATE ... CASCADE lancé depuis
-- une table référencée.
--
-- Échappatoire exceptionnelle, la même que pour l'immuabilité des lignes : dans
-- la MÊME requête (même transaction) que le TRUNCATE,
--   SET LOCAL app.autoriser_correction_exports = 'on';
--   TRUNCATE public.exports;
-- Le réglage ne vaut que pour cette transaction et émet un avertissement à
-- documenter par ailleurs. Sans lui, tout TRUNCATE échoue avec une erreur
-- explicite.

CREATE OR REPLACE FUNCTION public.exports_interdire_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_exports', true) = 'on' THEN
    RAISE WARNING 'exports: TRUNCATE exceptionnel autorisé. À documenter par ailleurs.';
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Table exports : TRUNCATE interdit (table de preuve insert-only).';
END;
$$;

-- Fonction de trigger : aucun appelant n'a besoin de la lancer directement.
REVOKE ALL ON FUNCTION public.exports_interdire_truncate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS exports_sans_truncate ON public.exports;
CREATE TRIGGER exports_sans_truncate
  BEFORE TRUNCATE ON public.exports
  FOR EACH STATEMENT EXECUTE FUNCTION public.exports_interdire_truncate();
