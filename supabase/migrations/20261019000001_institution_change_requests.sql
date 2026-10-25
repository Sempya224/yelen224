-- PROPOSÉE (révision 2) — NON EXÉCUTÉE. À valider par Bryan avant tout
-- passage dans le SQL Editor. Voir docs/product/YELEN_REVERIFICATION_POLICY.md.
-- À exécuter AVANT 20261019000002_appliquer_modifications_sensibles.sql.
--
-- Demandes d'examen administratif créées quand une institution modifie un
-- champ sensible (niveau B : nom, ville, adresse, coordonnées, catégorie +
-- activité principale). La modification est appliquée immédiatement et le
-- statut de l'établissement ne change pas : cette table ne sert qu'à tracer
-- et à faire examiner. Niveau C (statut juridique) volontairement absent :
-- parcours non spécifié, il fera l'objet d'une migration dédiée.
--
-- Les écritures passent exclusivement par des fonctions SECURITY DEFINER
-- appelées via service_role (création : appliquer_modifications_sensibles,
-- migration suivante ; décision : fonction dédiée à l'étape 6), même modèle
-- que decider_demande_activite (20260821000007).
--
-- Pré-vérifications à lancer AVANT (SQL Editor) — voir le doc de politique
-- §7 pour la liste complète ; minimum requis :
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='admin_users'
--      AND column_name IN ('id','prenom','nom','is_active');
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='institution_membres'
--      AND column_name IN ('id','institution_id','prenom','nom');

CREATE SEQUENCE institution_change_requests_seq START 1;

CREATE OR REPLACE FUNCTION institution_change_requests_generer_numero() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('institution_change_requests_seq');
  RETURN 'YL-CHG-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE institution_change_requests (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero              text NOT NULL UNIQUE DEFAULT institution_change_requests_generer_numero(),
  -- RESTRICT et non CASCADE : le trigger d'immuabilité bloque tout DELETE de
  -- ligne, un CASCADE ferait donc échouer la suppression d'une institution
  -- avec une erreur obscure. RESTRICT rend le refus explicite : une
  -- institution ayant un historique de demandes ne se supprime pas sans la
  -- procédure exceptionnelle documentée plus bas.
  institution_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- 'coordonnees' = latitude+longitude ensemble ; 'activite' = catégorie +
  -- activité principale ensemble (un seul changement logique chacun).
  champ               text NOT NULL CHECK (champ IN ('name','ville','adresse','coordonnees','activite')),
  ancienne_valeur     jsonb,
  nouvelle_valeur     jsonb NOT NULL,
  -- Auteur de la modification. membre_nom est un instantané (le membre peut
  -- être supprimé ensuite). Aucun PIN / mot de passe / code ici, jamais.
  -- Références "souples" (uuid sans clé étrangère) pour membre_id et
  -- decide_par_admin_id : un ON DELETE SET NULL déclencherait le trigger
  -- d'immuabilité (UPDATE de la colonne) et bloquerait la suppression du
  -- membre ou de l'admin. L'identité reste prouvée par les instantanés
  -- membre_nom / decide_par_nom ; l'existence est vérifiée à l'écriture par
  -- les fonctions (appliquer_modifications_sensibles, fonction de décision).
  membre_id           uuid,
  membre_nom          text NOT NULL,
  ip                  text,
  user_agent          text,
  statut              text NOT NULL DEFAULT 'a_examiner' CHECK (statut IN ('a_examiner','examinee')),
  decision            text CHECK (decision IN ('conforme','a_corriger')),
  decide_par_admin_id uuid,
  decide_par_nom      text,
  decide_le           timestamptz,
  commentaire_admin   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- Une demande à examiner ne porte aucune décision ; une demande examinée
  -- porte toujours décision + nom de l'acteur + date. (decide_par_admin_id
  -- n'est pas exigé ici : référence souple, le nom suffit à l'attribution.)
  CONSTRAINT icr_decision_coherente CHECK (
    (statut = 'a_examiner' AND decision IS NULL AND decide_par_nom IS NULL AND decide_le IS NULL AND commentaire_admin IS NULL AND decide_par_admin_id IS NULL)
    OR
    (statut = 'examinee' AND decision IS NOT NULL AND decide_par_nom IS NOT NULL AND decide_le IS NOT NULL)
  ),
  -- "a_corriger" doit dire quoi corriger, sinon le responsable ne peut pas agir.
  CONSTRAINT icr_a_corriger_commente CHECK (
    decision IS DISTINCT FROM 'a_corriger' OR (commentaire_admin IS NOT NULL AND length(btrim(commentaire_admin)) > 0)
  )
);

CREATE INDEX icr_institution_idx ON institution_change_requests (institution_id, created_at DESC);
CREATE INDEX icr_a_examiner_idx ON institution_change_requests (created_at) WHERE statut = 'a_examiner';

-- Dernier filet anti-doublon : deux demandes OUVERTES identiques (même
-- institution, même champ, même passage ancienne -> nouvelle valeur) ne
-- peuvent pas coexister. La vraie protection est le verrou + le recalcul du
-- diff + le test d'existence dans appliquer_modifications_sensibles (qui
-- gère aussi le cas légitime A->B, B->A, A->B avant tout examen : la 3e
-- demande est alors absorbée par la 1re encore ouverte). Cet index rattrape
-- tout contournement (appel direct, bug) en faisant échouer la transaction
-- entière plutôt qu'en créant un doublon silencieux.
CREATE UNIQUE INDEX icr_pas_de_doublon_ouvert ON institution_change_requests (
  institution_id, champ, md5(coalesce(ancienne_valeur::text, '')), md5(nouvelle_valeur::text)
) WHERE statut = 'a_examiner';

-- Protection de l'historique : le contenu de la demande est immuable, seule
-- la transition a_examiner -> examinee (colonnes de décision) est permise,
-- une seule fois. DELETE interdit. Bloque aussi service_role / SQL Editor
-- (même mécanisme que signalement_events, journal_activite).
--
-- ⚠️ Correction manuelle exceptionnelle, dans la MÊME transaction :
--   SET LOCAL app.autoriser_correction_changement = 'on';
--   UPDATE institution_change_requests SET ... WHERE id = '...';
CREATE OR REPLACE FUNCTION institution_change_requests_proteger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_changement', true) = 'on' THEN
    RAISE WARNING 'institution_change_requests: modification manuelle exceptionnelle autorisée (id=%, numero=%).', OLD.id, OLD.numero;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'institution_change_requests est immuable : suppression interdite (id=%, numero=%).', OLD.id, OLD.numero;
  END IF;

  IF OLD.statut <> 'a_examiner' THEN
    RAISE EXCEPTION 'institution_change_requests: demande déjà examinée, aucune modification possible (id=%, numero=%).', OLD.id, OLD.numero;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.champ IS DISTINCT FROM OLD.champ
     OR NEW.ancienne_valeur IS DISTINCT FROM OLD.ancienne_valeur
     OR NEW.nouvelle_valeur IS DISTINCT FROM OLD.nouvelle_valeur
     OR NEW.membre_id IS DISTINCT FROM OLD.membre_id
     OR NEW.membre_nom IS DISTINCT FROM OLD.membre_nom
     OR NEW.ip IS DISTINCT FROM OLD.ip
     OR NEW.user_agent IS DISTINCT FROM OLD.user_agent
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'institution_change_requests: seul l''examen administratif peut être renseigné (id=%, numero=%).', OLD.id, OLD.numero;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER institution_change_requests_proteger
  BEFORE UPDATE OR DELETE ON institution_change_requests
  FOR EACH ROW EXECUTE FUNCTION institution_change_requests_proteger();

-- Convention du projet : RLS activée, aucune policy, accès service_role seul.
-- REVOKE explicite en plus (les droits par défaut Supabase accordent
-- anon/authenticated sur les nouvelles tables ; sans policy RLS les bloque
-- déjà, ceci est la seconde barrière). Même logique que les migrations
-- lot_c_grants_* : droits et RLS définis ensemble, jamais l'un sans l'autre.
ALTER TABLE institution_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON institution_change_requests FROM anon, authenticated;
REVOKE ALL ON SEQUENCE institution_change_requests_seq FROM anon, authenticated;
REVOKE ALL ON FUNCTION institution_change_requests_generer_numero() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_change_requests_proteger() FROM PUBLIC, anon, authenticated;

-- Durcissement constaté à la vérification du 20/10/2026 : Supabase accorde par
-- défaut tous les droits à service_role sur les nouvelles tables, dont
-- TRUNCATE, qui CONTOURNE le trigger ligne par ligne ci-dessus (un TRUNCATE ne
-- déclenche pas BEFORE DELETE FOR EACH ROW). Les écritures légitimes passent
-- par des fonctions SECURITY DEFINER (propriétaire postgres), donc
-- service_role n'a besoin que de la lecture sur cette table.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON institution_change_requests FROM service_role;

-- ROLLBACK (le trigger bloque le DELETE des lignes mais pas le DROP TABLE ;
-- à n'exécuter que si la table est vide ou sur décision explicite ; dropper
-- d'abord la migration 20261019000002 si elle a été appliquée) :
--   DROP TABLE IF EXISTS institution_change_requests;  -- supprime aussi trigger et index
--   DROP FUNCTION IF EXISTS institution_change_requests_proteger();
--   DROP FUNCTION IF EXISTS institution_change_requests_generer_numero();
--   DROP SEQUENCE IF EXISTS institution_change_requests_seq;
