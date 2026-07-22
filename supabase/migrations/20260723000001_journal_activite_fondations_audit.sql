-- Journal d'activité — Lot A : fondations de capture pour la refonte
-- "boîte noire" bancaire (décision CEO 23/07/2026). Ce lot ne touche PAS
-- l'UI (KPI, recherche, timeline, score de risque, résumé IA, export) —
-- uniquement la capture de données et l'immuabilité au niveau base.

-- 1) Identifiant d'audit lisible, format YL-AUD-{année}-{compteur8}.
-- Séquence GLOBALE (toutes institutions confondues, jamais remise à zéro
-- d'une année sur l'autre) : un compteur qui ne se réinitialise jamais est
-- plus sûr pour un registre d'audit qu'une remise à zéro annuelle (pas de
-- risque de collision/ambiguïté au passage d'année, pas de logique de
-- rotation de séquence à maintenir). Le "2026" dans l'ID reste la partie
-- lisible/année, le compteur continue de grimper au-delà.
CREATE SEQUENCE journal_activite_audit_seq START 1;

CREATE OR REPLACE FUNCTION journal_activite_generer_audit_id() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('journal_activite_audit_seq');
  RETURN 'YL-AUD-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

-- 2) Nouvelles colonnes. DEFAULT non-constant (fonction) => Postgres
-- réécrit la table et backfill audit_id/categorie/niveau/plateforme pour
-- les lignes déjà existantes (acceptable au volume actuel de la table).
ALTER TABLE journal_activite
  ADD COLUMN audit_id      text NOT NULL UNIQUE DEFAULT journal_activite_generer_audit_id(),
  ADD COLUMN niveau        text NOT NULL DEFAULT 'info'
             CHECK (niveau IN ('info','succes','attention','erreur','critique')),
  ADD COLUMN categorie     text NOT NULL DEFAULT 'autre',
  ADD COLUMN ancienne_valeur jsonb,
  ADD COLUMN nouvelle_valeur jsonb,
  ADD COLUMN ip            text,
  ADD COLUMN user_agent    text,
  ADD COLUMN navigateur    text,
  ADD COLUMN os            text,
  ADD COLUMN plateforme    text NOT NULL DEFAULT 'web'
             CHECK (plateforme IN ('web','mobile','tablette','api'));

-- Index de filtrage serveur (categorie/niveau), pour le Lot C (recherche
-- universelle + filtres serveur).
CREATE INDEX journal_activite_categorie_idx ON journal_activite (institution_id, categorie);
CREATE INDEX journal_activite_niveau_idx    ON journal_activite (institution_id, niveau);

-- 3) Immuabilité au niveau base — plus une simple garantie applicative
-- (aucune route PATCH/DELETE n'existe côté API, mais ça restait
-- contournable manuellement). S'applique à TOUT rôle, y compris
-- service_role et postgres (superuser Supabase Studio/SQL Editor) —
-- contrairement à RLS, un trigger PL/pgSQL n'est jamais contourné par un
-- superuser.
--
-- ⚠️ IMPORTANT POUR BRYAN : ce trigger bloquera aussi toute correction
-- manuelle que tu ferais depuis le SQL Editor Supabase (UPDATE/DELETE sur
-- journal_activite). C'est voulu ("personne ne peut effacer ses traces").
-- Si un jour tu as un besoin RÉEL et EXCEPTIONNEL de corriger une ligne
-- (ex. erreur technique manifeste), exécute d'abord dans la MÊME requête
-- SQL (même transaction) :
--   SET LOCAL app.autoriser_correction_journal = 'on';
--   UPDATE journal_activite SET ... WHERE id = '...';
-- Le réglage ne s'applique qu'à cette requête précise et ne persiste pas.
-- Sans ce SET LOCAL, toute tentative d'UPDATE/DELETE échouera avec une
-- erreur explicite.
CREATE OR REPLACE FUNCTION journal_activite_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_journal', true) = 'on' THEN
    RAISE WARNING 'journal_activite: modification manuelle exceptionnelle autorisée (id=%, audit_id=%). À documenter par ailleurs.', OLD.id, OLD.audit_id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'journal_activite est immuable : impossible de modifier ou supprimer une entrée (id=%, audit_id=%).', OLD.id, OLD.audit_id;
END;
$$;

CREATE TRIGGER journal_activite_immuable
  BEFORE UPDATE OR DELETE ON journal_activite
  FOR EACH ROW EXECUTE FUNCTION journal_activite_interdire_modification();
