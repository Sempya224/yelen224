-- Auth Security — Lot 0 : fondations du mécanisme centralisé anti-abus
-- (connexion/inscription citoyen + institution + récupération).
--
-- ⚠️ CONFIRMÉ EXÉCUTÉ (30/08/2026, vérifié par Bryan en SQL Editor,
-- jamais annoté ici au moment des faits) — mais dans une forme
-- légèrement différente de ce fichier : endpoint_category NOT NULL sans
-- exception, seulement les 5 valeurs d'origine (sans 'admin_login'/
-- 'employee_login'). Voir 20260830000005_auth_security_events_amendement.sql
-- pour la correction réellement nécessaire — ne jamais rejouer le
-- CREATE TABLE ci-dessous tel quel, les 3 tables existent déjà.
--
-- Contexte (brief CEO 28/08/2026, niveau OWASP Authentication/Credential
-- Stuffing/NIST rate limiting) : le rate limiting existant est aujourd'hui
-- réinventé sur ~20 routes via des `Map` en mémoire d'instance — non
-- persistant (perdu à chaque redéploiement/cold start Netlify), non
-- partagé entre instances serverless, IP-only, sans signal device/session,
-- sans escalade, sans visibilité admin. Ces 3 tables remplacent ce
-- mécanisme fragmenté par un état persisté, partagé, par scope.
--
-- Scope de blocage volontairement device/IP — JAMAIS le numéro de
-- téléphone/identifiant de compte seul (contrainte explicite du brief :
-- un attaquant qui connaît le numéro d'un vrai citoyen ne doit jamais
-- pouvoir bloquer son accès depuis son propre appareil). Le signal "par
-- compte" (colonne identifiant sur auth_security_events) reste journalisé
-- pour la visibilité admin/le score de risque, mais n'entraîne jamais
-- seul un blocage automatique.

-- ─── auth_security_events — audit trail immuable ───────────────────────
-- Une ligne par tentative réelle enregistrée par
-- lib/security/authSecurity.ts::enregistrerTentative, plus une ligne par
-- déblocage manuel admin (Lot 7). Jamais de code OTP/mot de passe/secret
-- dans metadata — uniquement des signaux d'analyse (voir brief).
CREATE TABLE auth_security_events (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Nullable : un événement 'admin_unblock' porte sur un scope
  -- device/ip entier (potentiellement partagé par plusieurs flux), pas
  -- une catégorie d'endpoint unique — NOT NULL uniquement pour 'attempt'.
  -- 'admin_login'/'employee_login' ajoutées le 30/08/2026 (Lot 2 sécurité,
  -- audit Identity) pour couvrir les 2 flux de connexion restés hors du
  -- chantier initial du 28/08 — cette migration n'était pas encore trackée
  -- par git (jamais exécutée en base à notre connaissance) au moment de
  -- l'ajout, à confirmer par Bryan avant exécution.
  endpoint_category text CHECK (endpoint_category IN (
                      'citoyen_login','citoyen_register',
                      'institution_login','institution_register','recuperation',
                      'admin_login','employee_login'
                    )),
  CHECK (event_type <> 'attempt' OR endpoint_category IS NOT NULL),
  event_type        text NOT NULL CHECK (event_type IN ('attempt','admin_unblock')),
  -- outcome : vocabulaire propre à chaque route (ex. 'trouve'/'not_found',
  -- 'code_correct'/'code_incorrect', 'deja_enregistre'...) — non contraint
  -- par CHECK, volontairement, pour ne pas figer une liste commune aux 5
  -- flux qui n'ont pas le même vocabulaire métier. Rempli uniquement pour
  -- event_type = 'attempt'.
  outcome            text,
  -- État résultant (le pire des deux scopes device/ip) après cette
  -- tentative — capture l'escalade sans nécessiter une 2e ligne.
  resulting_state    text CHECK (resulting_state IN ('normal','warning','blocked','support_only')),
  device_id          uuid,
  ip                 text,
  identifiant        text,
  user_agent         text,
  reason             text,
  metadata           jsonb,
  admin_id           uuid REFERENCES admin_users(id),
  CHECK (event_type <> 'admin_unblock' OR admin_id IS NOT NULL)
);

CREATE INDEX auth_security_events_device_idx ON auth_security_events (device_id, created_at);
CREATE INDEX auth_security_events_ip_idx ON auth_security_events (ip, created_at);
CREATE INDEX auth_security_events_identifiant_idx ON auth_security_events (identifiant, created_at) WHERE identifiant IS NOT NULL;

-- Immuabilité — même mécanisme que document_events/signalement_events
-- (20260809000003/20260808000005) : bloque même service_role/postgres
-- superuser, échappatoire dédiée pour correction exceptionnelle.
CREATE OR REPLACE FUNCTION auth_security_events_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_auth_security', true) = 'on' THEN
    RAISE WARNING 'auth_security_events: modification manuelle exceptionnelle autorisée (id=%).', OLD.id;
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'auth_security_events est immuable : impossible de modifier ou supprimer une entrée (id=%).', OLD.id;
END;
$$;

CREATE TRIGGER auth_security_events_immuable
  BEFORE UPDATE OR DELETE ON auth_security_events
  FOR EACH ROW EXECUTE FUNCTION auth_security_events_interdire_modification();

ALTER TABLE auth_security_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, ces
-- flux n'ont par définition aucune session Supabase Auth avant connexion.

-- ─── auth_device_security / auth_ip_security — état courant par scope ──
-- Contrairement à auth_security_events, ces 2 tables sont mutables : un
-- compteur de fenêtre glissante + l'état courant (normal/warning/blocked/
-- support_only), mis à jour à chaque tentative par
-- lib/security/authSecurity.ts. Même forme pour les deux — device_id est
-- le scope principal du blocage, ip est vérifiée en complément à chaque
-- tentative (jamais seulement "si le cookie device est absent") pour ne
-- pas être contournable par simple rotation du cookie.
CREATE TABLE auth_device_security (
  device_id             uuid PRIMARY KEY,
  first_seen_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  ip_last                text,
  window_started_at      timestamptz NOT NULL DEFAULT now(),
  attempts_in_window     int NOT NULL DEFAULT 0,
  state                  text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at       timestamptz NOT NULL DEFAULT now(),
  blocked_until          timestamptz,
  block_cycles_24h       int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason         text
);

CREATE TABLE auth_ip_security (
  ip                     text PRIMARY KEY,
  first_seen_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  window_started_at      timestamptz NOT NULL DEFAULT now(),
  attempts_in_window     int NOT NULL DEFAULT 0,
  state                  text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at       timestamptz NOT NULL DEFAULT now(),
  blocked_until          timestamptz,
  block_cycles_24h       int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason         text
);

CREATE INDEX auth_device_security_state_idx ON auth_device_security (state) WHERE state <> 'normal';
CREATE INDEX auth_ip_security_state_idx ON auth_ip_security (state) WHERE state <> 'normal';

ALTER TABLE auth_device_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_ip_security ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role.
