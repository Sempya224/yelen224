-- PROPOSITION (v2, revue 20/10/2026) — NON EXÉCUTÉE, NON PLACÉE dans
-- supabase/migrations/. À déplacer et exécuter uniquement après validation
-- explicite de Bryan. Relue à la main : aucun Postgres local (pas de Docker),
-- donc NON testée syntaxiquement. Exécuter d'abord TESTS_LOT2.sql (transaction
-- annulée), puis cette migration.
--
-- Objets :
--   1) institution_rapports_hebdo            : instantanés versionnés, immuables
--   2) institution_rapports_hebdo_executions : journal des tentatives (succès,
--      semaine déjà générée, régénération, conflit, ÉCHEC), insert-only
--   3) institution_rapports_hebdo_etat (vue) : état lisible d'une semaine
--      (vide / calcule / regenere / echec / non_genere) — un échec n'est
--      jamais présenté comme une semaine sans activité
--   4) institution_rapports_hebdo_envois     : réservation d'envoi de notification
--   5) 4 fonctions (enregistrer, journaliser_echec, reserver_envoi, terminer_envoi)
--
-- Principes :
-- - RLS activé, AUCUNE policy : accès exclusif service_role (l'appelant est une
--   route interne ou une route institution, jamais une session Supabase Auth
--   de l'institution — convention du projet).
-- - Contenu agrégé : ni citoyen_id, ni nom, ni téléphone, ni e-mail.
-- - Un rapport passé ne change jamais : une régénération AJOUTE une version.
-- - Génération du rapport et envoi de la notification sont deux mécanismes
--   distincts : l'unicité des rapports ne protège PAS des doubles
--   notifications, c'est la table des envois (clé sans numéro de version).

-- ─── 1. Instantanés ─────────────────────────────────────────────────────────
CREATE TABLE institution_rapports_hebdo (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  -- Bornes en UTC (Guinée = UTC+0) : lundi et dimanche de la semaine rapportée.
  semaine_debut        date NOT NULL,
  semaine_fin          date NOT NULL,
  numero_version       integer NOT NULL DEFAULT 1,
  est_courante         boolean NOT NULL DEFAULT true,
  remplace_id          uuid REFERENCES institution_rapports_hebdo(id),
  motif_regeneration   text,
  -- RAPPORT_HEBDO_VERSION de lib/rapportHebdo.ts au moment du calcul.
  version_moteur       integer NOT NULL,
  -- Semaine CALCULÉE et sans aucune activité : conservée dans l'historique,
  -- jamais notifiée. Ne signifie JAMAIS "génération en échec" (voir journal).
  vide                 boolean NOT NULL,
  -- RapportHebdo sérialisé : RDV gratuits et réservations payantes séparés,
  -- jamais de total consolidé.
  contenu              jsonb NOT NULL,
  -- Instant de génération passé au moteur (>= fin de semaine).
  genere_le            timestamptz NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rapports_hebdo_lundi CHECK (EXTRACT(ISODOW FROM semaine_debut) = 1),
  CONSTRAINT rapports_hebdo_dimanche CHECK (semaine_fin = semaine_debut + 6),
  CONSTRAINT rapports_hebdo_semaine_terminee CHECK (genere_le >= ((semaine_fin + 1)::timestamp AT TIME ZONE 'UTC')),
  CONSTRAINT rapports_hebdo_version_positive CHECK (numero_version >= 1 AND version_moteur >= 1),
  CONSTRAINT rapports_hebdo_chainage CHECK ((numero_version = 1) = (remplace_id IS NULL)),
  CONSTRAINT rapports_hebdo_motif CHECK (numero_version = 1 OR (motif_regeneration IS NOT NULL AND length(btrim(motif_regeneration)) >= 5)),
  CONSTRAINT rapports_hebdo_contenu_objet CHECK (jsonb_typeof(contenu) = 'object'),
  CONSTRAINT rapports_hebdo_contenu_taille CHECK (octet_length(contenu::text) <= 200000),
  CONSTRAINT rapports_hebdo_version_unique UNIQUE (institution_id, semaine_debut, numero_version)
);

-- Unicité établissement + période : UN SEUL rapport courant par semaine.
CREATE UNIQUE INDEX rapports_hebdo_courant_unique
  ON institution_rapports_hebdo (institution_id, semaine_debut) WHERE est_courante;

CREATE INDEX rapports_hebdo_historique
  ON institution_rapports_hebdo (institution_id, semaine_debut DESC) WHERE est_courante;

-- Index pour la purge de conservation (semaine_debut seul).
CREATE INDEX rapports_hebdo_conservation
  ON institution_rapports_hebdo (semaine_debut);

ALTER TABLE institution_rapports_hebdo ENABLE ROW LEVEL SECURITY;
-- service_role est retiré AVANT le GRANT : sur Supabase, les privilèges par
-- défaut du schéma public lui accordent déjà tous les droits sur toute
-- nouvelle table, un simple GRANT ne les réduirait pas.
REVOKE ALL ON TABLE institution_rapports_hebdo FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE institution_rapports_hebdo TO service_role;
-- Pas de DELETE accordé à service_role (conservation).

COMMENT ON TABLE institution_rapports_hebdo IS
  'Instantanés du rapport hebdomadaire (lib/rapportHebdo.ts). Immuables : seule transition permise est_courante true -> false. Agrégats uniquement, aucune donnée personnelle. vide = semaine calculée sans activité, jamais un échec.';

-- Immuabilité (pattern journal_activite / document_events). Seule UPDATE
-- tolérée : est_courante true -> false, tout le reste identique.
-- Échappatoire (correction ou purge de conservation), SQL Editor uniquement :
--   SET LOCAL app.autoriser_correction_rapport_hebdo = 'on';
-- ⚠️ Supprimer un établissement (ON DELETE CASCADE) exige aussi ce SET LOCAL,
-- comme pour journal_activite et document_events.
CREATE OR REPLACE FUNCTION institution_rapports_hebdo_proteger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_rapport_hebdo', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% : suppression interdite (conservation des rapports).', TG_TABLE_NAME;
  END IF;
  -- IF imbriqué : le journal n'a pas de colonne est_courante, l'accès à
  -- OLD.est_courante ne doit jamais être évalué pour lui.
  IF TG_TABLE_NAME = 'institution_rapports_hebdo' THEN
    IF OLD.est_courante AND NOT NEW.est_courante
       AND (to_jsonb(NEW) - 'est_courante') = (to_jsonb(OLD) - 'est_courante') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% : ligne immuable (seul est_courante peut passer de true à false sur un rapport ; le journal est insert-only).', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER institution_rapports_hebdo_immuable
  BEFORE UPDATE OR DELETE ON institution_rapports_hebdo
  FOR EACH ROW EXECUTE FUNCTION institution_rapports_hebdo_proteger();

-- ─── 2. Journal des tentatives (insert-only) ────────────────────────────────
-- Une ligne par appel de génération. C'est ce journal qui permet de
-- distinguer "jamais tentée", "tentée et vide", "régénérée" et "ÉCHEC".
CREATE TABLE institution_rapports_hebdo_executions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  semaine_debut   date NOT NULL,
  -- cree | deja_genere | regenere | conflit : appel abouti.
  -- echec : exception, aucun rapport écrit ; erreur renseignée.
  resultat        text NOT NULL CHECK (resultat IN ('cree', 'deja_genere', 'regenere', 'conflit', 'echec')),
  rapport_id      uuid REFERENCES institution_rapports_hebdo(id),
  version_moteur  integer,
  -- Message technique court. Jamais de donnée client, jamais de stack complète.
  erreur          text,
  duree_ms        integer,
  -- clock_timestamp() : distinct même au sein d'une seule transaction.
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT executions_hebdo_lundi CHECK (EXTRACT(ISODOW FROM semaine_debut) = 1),
  CONSTRAINT executions_hebdo_erreur CHECK ((resultat = 'echec') = (erreur IS NOT NULL)),
  CONSTRAINT executions_hebdo_rapport CHECK (resultat = 'echec' OR rapport_id IS NOT NULL)
);

CREATE INDEX executions_hebdo_cle
  ON institution_rapports_hebdo_executions (institution_id, semaine_debut, created_at DESC);
CREATE INDEX executions_hebdo_conservation
  ON institution_rapports_hebdo_executions (semaine_debut);

ALTER TABLE institution_rapports_hebdo_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE institution_rapports_hebdo_executions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE institution_rapports_hebdo_executions TO service_role;

COMMENT ON TABLE institution_rapports_hebdo_executions IS
  'Journal insert-only des tentatives de génération. resultat = echec signifie que la génération a ÉCHOUÉ : ne jamais l''interpréter comme une semaine sans activité.';

CREATE TRIGGER institution_rapports_hebdo_executions_immuable
  BEFORE UPDATE OR DELETE ON institution_rapports_hebdo_executions
  FOR EACH ROW EXECUTE FUNCTION institution_rapports_hebdo_proteger();

-- ─── 3. Vue d'état ──────────────────────────────────────────────────────────
-- ⚠️ ABSENCE DE LIGNE = semaine jamais tentée ("non générée"), PAS une semaine
-- vide. Les appelants doivent lire cette vue (ou le journal), jamais déduire
-- l'état d'une absence de rapport.
--   etat = non_genere : tentatives sans rapport ni échec (cas théorique)
--          echec      : aucun rapport courant ET dernière tentative en échec
--          vide       : rapport courant calculé, semaine sans activité
--          regenere   : rapport courant de version >= 2
--          calcule    : rapport courant de version 1 avec activité
--   echec_apres_rapport : un rapport courant existe mais la DERNIÈRE tentative
--          (ex. régénération) a échoué.
CREATE VIEW institution_rapports_hebdo_etat AS
WITH cles AS (
  SELECT institution_id, semaine_debut FROM institution_rapports_hebdo
  UNION
  SELECT institution_id, semaine_debut FROM institution_rapports_hebdo_executions
),
derniere AS (
  SELECT DISTINCT ON (institution_id, semaine_debut)
         institution_id, semaine_debut, resultat, erreur, created_at
  FROM institution_rapports_hebdo_executions
  ORDER BY institution_id, semaine_debut, created_at DESC, id
)
SELECT k.institution_id,
       k.semaine_debut,
       (k.semaine_debut + 6) AS semaine_fin,
       CASE
         WHEN c.id IS NULL AND d.resultat = 'echec' THEN 'echec'
         WHEN c.id IS NULL THEN 'non_genere'
         WHEN c.vide THEN 'vide'
         WHEN c.numero_version > 1 THEN 'regenere'
         ELSE 'calcule'
       END AS etat,
       COALESCE(c.numero_version > 1, false) AS est_regenere,
       c.id AS rapport_id,
       c.numero_version,
       c.genere_le,
       d.resultat AS derniere_tentative,
       d.created_at AS derniere_tentative_le,
       CASE WHEN d.resultat = 'echec' THEN d.erreur END AS derniere_erreur,
       (c.id IS NOT NULL AND d.resultat = 'echec') AS echec_apres_rapport
FROM cles k
LEFT JOIN institution_rapports_hebdo c
       ON c.institution_id = k.institution_id AND c.semaine_debut = k.semaine_debut AND c.est_courante
LEFT JOIN derniere d
       ON d.institution_id = k.institution_id AND d.semaine_debut = k.semaine_debut;

REVOKE ALL ON TABLE institution_rapports_hebdo_etat FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE institution_rapports_hebdo_etat TO service_role;

-- ─── 4. Réservation d'envoi (anti-doublon de notification) ──────────────────
-- Clé = établissement + semaine + canal, VOLONTAIREMENT sans numéro de
-- version : régénérer un rapport ne rouvre jamais un envoi déjà réservé.
CREATE TABLE institution_rapports_hebdo_envois (
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  semaine_debut   date NOT NULL,
  canal           text NOT NULL CHECK (canal IN ('notification', 'push', 'email')),
  statut          text NOT NULL DEFAULT 'reserve' CHECK (statut IN ('reserve', 'envoye', 'echec')),
  -- Version du rapport au moment de la réservation (informatif).
  rapport_id      uuid REFERENCES institution_rapports_hebdo(id),
  tentatives      integer NOT NULL DEFAULT 1,
  reserve_le      timestamptz NOT NULL DEFAULT now(),
  envoye_le       timestamptz,
  -- Message technique court, jamais de donnée client.
  erreur          text,
  PRIMARY KEY (institution_id, semaine_debut, canal),
  CONSTRAINT envois_hebdo_envoye CHECK ((statut = 'envoye') = (envoye_le IS NOT NULL))
);

CREATE INDEX envois_hebdo_conservation ON institution_rapports_hebdo_envois (semaine_debut);

ALTER TABLE institution_rapports_hebdo_envois ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE institution_rapports_hebdo_envois FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE institution_rapports_hebdo_envois TO service_role;

COMMENT ON TABLE institution_rapports_hebdo_envois IS
  'Réservation atomique d''un envoi par (établissement, semaine, canal). Un envoi en statut reserve depuis trop longtemps n''est JAMAIS relancé automatiquement (risque de doublon) : revue manuelle.';

-- ─── 5. Fonctions ───────────────────────────────────────────────────────────
-- Enregistre un instantané. Atomique par (établissement, semaine) grâce à un
-- verrou consultatif ; l'index unique partiel reste le dernier garde-fou.
--   p_regenerer = false : rapport courant existant -> 'deja_genere' (un cron
--                         relancé est sans effet).
--   p_regenerer = true  : motif (>= 5 caractères) ET p_version_attendue
--                         OBLIGATOIRES. Si la version courante n'est plus celle
--                         que l'appelant a vue -> 'conflit', rien n'est écrit
--                         (deux régénérations simultanées n'en produisent
--                         qu'une). Sinon ajoute la version n+1 ; l'ancienne
--                         est conservée, marquée non courante.
-- Chaque issue (cree, deja_genere, regenere, conflit) est inscrite au journal.
-- Une EXCEPTION annule tout l'appel : l'appelant doit alors appeler
-- institution_rapport_hebdo_journaliser_echec dans un second appel.
CREATE OR REPLACE FUNCTION institution_rapport_hebdo_enregistrer(
  p_institution_id  uuid,
  p_semaine_debut   date,
  p_version_moteur  integer,
  p_vide            boolean,
  p_contenu         jsonb,
  p_genere_le       timestamptz,
  p_regenerer       boolean DEFAULT false,
  p_motif           text DEFAULT NULL,
  p_version_attendue integer DEFAULT NULL,
  p_duree_ms        integer DEFAULT NULL
) RETURNS TABLE (out_rapport_id uuid, out_numero integer, out_resultat text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_courant  institution_rapports_hebdo%ROWTYPE;
  v_max      integer;
  v_id       uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_institution_id::text || '|' || p_semaine_debut::text, 0));

  SELECT * INTO v_courant
  FROM institution_rapports_hebdo r
  WHERE r.institution_id = p_institution_id AND r.semaine_debut = p_semaine_debut AND r.est_courante;

  IF NOT FOUND THEN
    INSERT INTO institution_rapports_hebdo
      (institution_id, semaine_debut, semaine_fin, numero_version, est_courante, version_moteur, vide, contenu, genere_le)
    VALUES
      (p_institution_id, p_semaine_debut, p_semaine_debut + 6, 1, true, p_version_moteur, p_vide, p_contenu, p_genere_le)
    RETURNING id INTO v_id;
    INSERT INTO institution_rapports_hebdo_executions (institution_id, semaine_debut, resultat, rapport_id, version_moteur, duree_ms)
    VALUES (p_institution_id, p_semaine_debut, 'cree', v_id, p_version_moteur, p_duree_ms);
    RETURN QUERY SELECT v_id, 1, 'cree'::text;
    RETURN;
  END IF;

  IF NOT p_regenerer THEN
    INSERT INTO institution_rapports_hebdo_executions (institution_id, semaine_debut, resultat, rapport_id, version_moteur, duree_ms)
    VALUES (p_institution_id, p_semaine_debut, 'deja_genere', v_courant.id, p_version_moteur, p_duree_ms);
    RETURN QUERY SELECT v_courant.id, v_courant.numero_version, 'deja_genere'::text;
    RETURN;
  END IF;

  IF p_motif IS NULL OR length(btrim(p_motif)) < 5 THEN
    RAISE EXCEPTION 'Régénération refusée : un motif d''au moins 5 caractères est obligatoire.';
  END IF;
  IF p_version_attendue IS NULL THEN
    RAISE EXCEPTION 'Régénération refusée : la version attendue est obligatoire.';
  END IF;

  IF v_courant.numero_version <> p_version_attendue THEN
    INSERT INTO institution_rapports_hebdo_executions (institution_id, semaine_debut, resultat, rapport_id, version_moteur, duree_ms)
    VALUES (p_institution_id, p_semaine_debut, 'conflit', v_courant.id, p_version_moteur, p_duree_ms);
    RETURN QUERY SELECT v_courant.id, v_courant.numero_version, 'conflit'::text;
    RETURN;
  END IF;

  SELECT max(r.numero_version) INTO v_max
  FROM institution_rapports_hebdo r
  WHERE r.institution_id = p_institution_id AND r.semaine_debut = p_semaine_debut;

  UPDATE institution_rapports_hebdo SET est_courante = false WHERE id = v_courant.id;

  INSERT INTO institution_rapports_hebdo
    (institution_id, semaine_debut, semaine_fin, numero_version, est_courante, remplace_id, motif_regeneration,
     version_moteur, vide, contenu, genere_le)
  VALUES
    (p_institution_id, p_semaine_debut, p_semaine_debut + 6, v_max + 1, true, v_courant.id, btrim(p_motif),
     p_version_moteur, p_vide, p_contenu, p_genere_le)
  RETURNING id INTO v_id;
  INSERT INTO institution_rapports_hebdo_executions (institution_id, semaine_debut, resultat, rapport_id, version_moteur, duree_ms)
  VALUES (p_institution_id, p_semaine_debut, 'regenere', v_id, p_version_moteur, p_duree_ms);
  RETURN QUERY SELECT v_id, v_max + 1, 'regenere'::text;
END;
$$;

-- Inscrit un ÉCHEC de génération (appel séparé, après capture de l'exception
-- par la route). Un échec n'écrit jamais de rapport ; la vue d'état le
-- restitue comme "echec", distinct de "vide".
CREATE OR REPLACE FUNCTION institution_rapport_hebdo_journaliser_echec(
  p_institution_id uuid,
  p_semaine_debut  date,
  p_erreur         text,
  p_duree_ms       integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO institution_rapports_hebdo_executions (institution_id, semaine_debut, resultat, erreur, duree_ms)
  VALUES (p_institution_id, p_semaine_debut, 'echec',
          COALESCE(NULLIF(left(btrim(p_erreur), 500), ''), 'erreur non précisée'), p_duree_ms)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Réserve l'envoi. true = l'appelant DOIT envoyer ; false = déjà réservé ou
-- envoyé, ne rien envoyer. Seul un envoi en 'echec' peut être repris.
CREATE OR REPLACE FUNCTION institution_rapport_hebdo_reserver_envoi(
  p_institution_id uuid,
  p_semaine_debut  date,
  p_canal          text,
  p_rapport_id     uuid
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lignes integer;
BEGIN
  INSERT INTO institution_rapports_hebdo_envois AS e (institution_id, semaine_debut, canal, rapport_id)
  VALUES (p_institution_id, p_semaine_debut, p_canal, p_rapport_id)
  ON CONFLICT (institution_id, semaine_debut, canal) DO UPDATE
    SET statut = 'reserve', tentatives = e.tentatives + 1, reserve_le = now(),
        envoye_le = NULL, erreur = NULL, rapport_id = EXCLUDED.rapport_id
    WHERE e.statut = 'echec';
  GET DIAGNOSTICS v_lignes = ROW_COUNT;
  RETURN v_lignes = 1;
END;
$$;

-- Clôt la réservation. true = transition effectuée (statut était 'reserve').
CREATE OR REPLACE FUNCTION institution_rapport_hebdo_terminer_envoi(
  p_institution_id uuid,
  p_semaine_debut  date,
  p_canal          text,
  p_ok             boolean,
  p_erreur         text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lignes integer;
BEGIN
  UPDATE institution_rapports_hebdo_envois e
  SET statut = CASE WHEN p_ok THEN 'envoye' ELSE 'echec' END,
      envoye_le = CASE WHEN p_ok THEN now() ELSE NULL END,
      erreur = CASE WHEN p_ok THEN NULL ELSE left(p_erreur, 500) END
  WHERE e.institution_id = p_institution_id AND e.semaine_debut = p_semaine_debut
    AND e.canal = p_canal AND e.statut = 'reserve';
  GET DIAGNOSTICS v_lignes = ROW_COUNT;
  RETURN v_lignes = 1;
END;
$$;

REVOKE ALL ON FUNCTION institution_rapport_hebdo_enregistrer(uuid, date, integer, boolean, jsonb, timestamptz, boolean, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_rapport_hebdo_journaliser_echec(uuid, date, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_rapport_hebdo_reserver_envoi(uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION institution_rapport_hebdo_terminer_envoi(uuid, date, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION institution_rapport_hebdo_enregistrer(uuid, date, integer, boolean, jsonb, timestamptz, boolean, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION institution_rapport_hebdo_journaliser_echec(uuid, date, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION institution_rapport_hebdo_reserver_envoi(uuid, date, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION institution_rapport_hebdo_terminer_envoi(uuid, date, text, boolean, text) TO service_role;

-- Vérifier après exécution :
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'institution_rapports_hebdo%' AND relkind = 'r';
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'institution_rapports_hebdo%' AND NOT tgisinternal;
-- Envois bloqués (jamais relancés automatiquement) :
--   SELECT * FROM institution_rapports_hebdo_envois WHERE statut = 'reserve' AND reserve_le < now() - interval '15 minutes';
-- Semaines en échec :
--   SELECT * FROM institution_rapports_hebdo_etat WHERE etat = 'echec' OR echec_apres_rapport;
