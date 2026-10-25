-- Comptes inactifs — fondations (Phase 3, chantier COMPTES-INACTIFS.md,
-- conception validée sections 2.11/2.12, autorisation CEO 15/10/2026).
-- Réutilise les moteurs existants (institution_suspensions) plutôt que de
-- les dupliquer — voir docs/chantiers/COMPTES-INACTIFS.md pour le
-- raisonnement complet. Mode observation : les deux flags de
-- `inactivite_mode` démarrent à false, donc cette migration n'a AUCUN
-- effet utilisateur au moment où elle est exécutée (zéro notification,
-- zéro suspension) — même principe que la geo-restriction
-- (GEO_BLOCK_ENABLED), adapté en table SQL ici puisque Bryan exécute tout
-- le SQL lui-même en SQL Editor (pas de variable d'environnement côté
-- base).

-- 1) Signal "action métier qualifiante" + marqueurs anti-doublon de
-- notification — un côté, une colonne, jamais recalculée après coup sauf
-- remise à zéro explicite par la réactivation (voir lib/activiteCitoyenne.ts/
-- lib/activiteInstitution.ts, Phase 3 suite).
ALTER TABLE users ADD COLUMN IF NOT EXISTS derniere_action_qualifiante_le timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivite_j30_notifie_le timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivite_j60_notifie_le timestamptz;

ALTER TABLE institutions ADD COLUMN IF NOT EXISTS derniere_action_qualifiante_le timestamptz;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS inactivite_j30_notifie_le timestamptz;
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS inactivite_j60_notifie_le timestamptz;

-- 2) Yelen Business — 3e valeur d'`origine` sur le moteur de suspension
-- déjà en production (institution_suspensions, migrations
-- 20260817000001 et 20260915000003). ⚠️ Bryan : vérifier le nom réel de
-- la contrainte avant d'exécuter (`\d institution_suspensions` ou
-- information_schema.table_constraints) — ce script suppose le nom par
-- défaut généré par Postgres pour une contrainte CHECK inline sur la
-- colonne `origine`. Si le nom diffère, adapter le DROP CONSTRAINT.
ALTER TABLE institution_suspensions DROP CONSTRAINT IF EXISTS institution_suspensions_origine_check;
ALTER TABLE institution_suspensions ADD CONSTRAINT institution_suspensions_origine_check
  CHECK (origine IN ('admin', 'auto_rdv_non_traites', 'auto_inactivite'));

-- 3) Citoyen — nouvelle table dédiée, structurellement proche de
-- `institution_suspensions` mais DISTINCTE de `citoyen_rdv_restrictions`
-- (qui reste scopée à la fonctionnalité RDV uniquement, jamais touchée
-- par ce chantier). Première brique de blocage de compte global côté
-- citoyen dans le produit — voir section 2.7/2.11.5 du document de
-- conception pour le raisonnement produit.
CREATE SEQUENCE citoyen_inactivite_suspensions_reference_seq START 1;

CREATE OR REPLACE FUNCTION citoyen_inactivite_suspensions_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('citoyen_inactivite_suspensions_reference_seq');
  RETURN 'INA-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

CREATE TABLE citoyen_inactivite_suspensions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference        text UNIQUE NOT NULL DEFAULT citoyen_inactivite_suspensions_generer_reference(),
  motif            text NOT NULL,
  statut           text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','levee')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  levee_le         timestamptz,
  -- 'auto' = reconnexion/action qualifiante détectée par le code applicatif
  -- (cas normal, voir 2.6 — jamais via le cron, qui ne fait qu'escalader).
  -- 'admin' = filet de sécurité manuel (ex. faux positif signalé pendant le
  -- mode observation) — aucune interface de révision/appel n'est construite
  -- pour ce motif précis (décision 2.6 : pas nécessaire, la preuve
  -- d'activité suffit), seulement un accès SQL direct pour Bryan/un admin.
  levee_par        text CHECK (levee_par IN ('auto','admin')),
  levee_admin_id   uuid REFERENCES admin_users(id)
);

CREATE INDEX citoyen_inactivite_suspensions_citoyen_id_idx ON citoyen_inactivite_suspensions(citoyen_id);
CREATE INDEX citoyen_inactivite_suspensions_active_idx ON citoyen_inactivite_suspensions(citoyen_id) WHERE statut = 'active';

ALTER TABLE citoyen_inactivite_suspensions ENABLE ROW LEVEL SECURITY;
-- Zéro policy : même convention que institution_suspensions/
-- citoyen_rdv_restrictions — accès exclusivement service_role depuis des
-- routes API citoyen/admin authentifiées, jamais une lecture directe
-- auth.uid() depuis le navigateur.

-- 4) Journal d'observation — insert-only, alimenté QUELLE QUE SOIT la
-- valeur des flags de `inactivite_mode` ci-dessous : c'est le rapport de
-- faux positifs demandé par le CEO avant toute activation réelle (Phase 4).
-- Ne remplace jamais `notifications`/`institution_suspensions` — ne
-- consigne que "ce que le moteur aurait fait à cet instant", pas un
-- événement produit réel.
CREATE TABLE inactivite_observation_log (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  acteur_type                text NOT NULL CHECK (acteur_type IN ('citoyen','institution')),
  acteur_id                  uuid NOT NULL,
  evenement                  text NOT NULL CHECK (evenement IN ('rappel_j30','avertissement_j60','suspension_j90','reactivation')),
  derniere_activite_calculee timestamptz,
  effet_reel_applique        boolean NOT NULL DEFAULT false,
  details                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inactivite_observation_log_acteur_idx ON inactivite_observation_log(acteur_type, acteur_id);
ALTER TABLE inactivite_observation_log ENABLE ROW LEVEL SECURITY;
-- Zéro policy — lecture service_role uniquement (futur écran admin de
-- rapport Phase 4, hors périmètre Phase 3).

-- 5) Mode observation — singleton (id toujours 1, CHECK empêche une 2e
-- ligne). Les deux flags démarrent à false : AUCUN effet utilisateur réel
-- tant que Bryan ne les bascule pas lui-même après revue du journal
-- d'observation (30 jours mini, décision CEO 2.11.4).
CREATE TABLE inactivite_mode (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  notifications_actives boolean NOT NULL DEFAULT false,
  suspensions_actives   boolean NOT NULL DEFAULT false,
  notifications_depuis  timestamptz,
  suspensions_depuis    timestamptz,
  note                  text
);
INSERT INTO inactivite_mode (id) VALUES (1);
ALTER TABLE inactivite_mode ENABLE ROW LEVEL SECURITY;
-- Zéro policy — lu par les fonctions SQL ci-après (SECURITY DEFINER
-- implicite via service_role) et par lib/activiteCitoyenne.ts/
-- lib/activiteInstitution.ts côté serveur applicatif.

-- Activation réelle (Bryan, après le mode observation, PAS exécuté ici) :
--   UPDATE inactivite_mode SET notifications_actives = true, notifications_depuis = now();
--   UPDATE inactivite_mode SET suspensions_actives = true, suspensions_depuis = now();
