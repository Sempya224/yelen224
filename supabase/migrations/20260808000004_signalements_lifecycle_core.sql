-- Signalements — Lot 1 : lifecycle core (décision CEO 08/08/2026, case
-- management niveau NIST SP 800-61 Rev.3 / OWASP Logging Cheat Sheet).
-- Ce lot ne touche PAS l'UI — modèle de données, lifecycle, RLS.
--
-- Contexte : `signalements` sert à 3 flux "incident réel" (citoyen→
-- institution, institution→citoyen, alerte système réputation) et à un 4e
-- flux structurellement différent (signalements Communauté Yelen —
-- app/api/citoyen/communaute/signaler/route.ts, déployé dans le même lot
-- que cette migration, condition impérative avant d'activer RLS ci-dessous
-- sinon son insert direct anon-client casse).
--
-- Enums : text + CHECK, pas de CREATE TYPE — cohérent avec le reste du
-- schéma (aucun enum Postgres nulle part sur cette table ni sur des tables
-- comparables comme citoyen_documents/recus), et plus simple à étendre
-- plus tard (ALTER TYPE est plus lourd qu'un DROP/ADD CONSTRAINT).

-- 0) `statut` est en réalité un enum Postgres réel (statut_signalement),
-- posé manuellement en base à un moment jamais tracé dans les migrations
-- (contrairement à motif/preuve_url/type_signaleur/type_cible/priorite,
-- ajoutées en text par la vraie migration 20260709000005). Découvert au
-- premier essai de cette migration (ERROR 22P02 sur 'rejete', valeur hors
-- enum). Conversion en text — cohérent avec le reste du schéma, plus
-- simple à étendre qu'un enum (voir commentaire d'en-tête). Table vérifiée
-- vide par Bryan (08/08/2026, `SELECT statut, count(*) FROM signalements
-- GROUP BY statut` → 0 ligne) : conversion sans aucun risque de perte/
-- incompatibilité de données existantes.
ALTER TABLE signalements ALTER COLUMN statut TYPE text USING statut::text;

-- 1) Backfills — table vide au moment de cette migration, ces UPDATE
-- n'affectent donc aucune ligne aujourd'hui. Conservés pour la clarté de
-- l'intention (et sans risque si une ligne existait) : l'ancienne valeur
-- 'ignore' (admin/api/admin/signalements/[id]/ignorer) n'a pas de place
-- dans le nouveau lifecycle ; 'rejete' en est l'équivalent sémantique.
UPDATE signalements SET statut = 'rejete' WHERE statut = 'ignore';
UPDATE signalements SET priorite = 'normale' WHERE priorite IS NULL;

-- 2) Identifiant public lisible, format SIG-{année}-{compteur8}. Séquence
-- globale (jamais remise à zéro), même principe que journal_activite
-- (20260723000001) : pas de risque de collision au passage d'année.
CREATE SEQUENCE signalements_numero_public_seq START 1;

CREATE OR REPLACE FUNCTION signalements_generer_numero_public() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('signalements_numero_public_seq');
  RETURN 'SIG-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

-- 3) Nouvelles colonnes + contraintes. DEFAULT non-constant (fonction) =>
-- backfill automatique de numero_public pour les lignes existantes
-- (acceptable au volume actuel de la table, cf. CLAUDE.md
-- /dette-requetes-non-bornees : rdv 21 lignes au dernier audit).
ALTER TABLE signalements
  ADD COLUMN numero_public text UNIQUE DEFAULT signalements_generer_numero_public(),
  ADD COLUMN assigne_a_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN assigne_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN assigne_le timestamptz,
  ADD COLUMN escalade_niveau text NOT NULL DEFAULT 'agent'
             CHECK (escalade_niveau IN ('agent','superviseur','admin')),
  ADD COLUMN resolution_action text
             CHECK (resolution_action IN ('avertissement','restriction','correction_donnees','aucune_action','information_transmise','autre')),
  ADD COLUMN resolution_explication text,
  ADD COLUMN resolu_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN resolu_le timestamptz,
  ADD COLUMN cloture_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ADD COLUMN cloture_le timestamptz,
  ADD COLUMN doublon_de_signalement_id uuid REFERENCES signalements(id) ON DELETE SET NULL;

ALTER TABLE signalements ALTER COLUMN numero_public SET NOT NULL;

ALTER TABLE signalements
  ADD CONSTRAINT signalements_statut_check
    CHECK (statut IN ('nouveau','a_traiter','en_cours','en_attente','resolu','cloture','rejete','doublon')),
  ADD CONSTRAINT signalements_priorite_check
    CHECK (priorite IN ('critique','haute','normale','faible')),
  ADD CONSTRAINT signalements_type_signaleur_check
    CHECK (type_signaleur IS NULL OR type_signaleur IN ('citoyen','institution','system')),
  ADD CONSTRAINT signalements_type_cible_check
    CHECK (type_cible IS NULL OR type_cible IN ('citoyen','institution')),
  ALTER COLUMN statut SET DEFAULT 'nouveau',
  ALTER COLUMN priorite SET DEFAULT 'normale';

-- Garde-fous de complétude (pas un graphe de transition — juste "si l'état
-- final prétend être atteint, les champs qui le justifient existent").
ALTER TABLE signalements
  ADD CONSTRAINT signalements_resolution_complete
    CHECK (statut <> 'resolu' OR (resolution_action IS NOT NULL AND resolution_explication IS NOT NULL)),
  ADD CONSTRAINT signalements_doublon_reference
    CHECK (statut <> 'doublon' OR doublon_de_signalement_id IS NOT NULL);

CREATE INDEX signalements_institution_statut_idx ON signalements (institution_id, statut);
CREATE INDEX signalements_assigne_idx ON signalements (assigne_a_membre_id) WHERE assigne_a_membre_id IS NOT NULL;

-- 4) RLS — table historiquement sans AUCUNE policy (audit 08/08/2026,
-- confirmé par lecture exhaustive des migrations) : 3 écrans faisaient des
-- insert/select directement depuis le navigateur avec la clé anon, sans
-- garde serveur. Même convention que citoyen_documents/attendance_logs :
-- RLS activé, zéro policy, accès exclusivement service_role — toutes les
-- routes API concernées migrent vers service_role dans ce même lot.
ALTER TABLE signalements ENABLE ROW LEVEL SECURITY;
