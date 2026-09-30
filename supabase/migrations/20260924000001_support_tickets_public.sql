-- Chantier "Yelen Support Public Général" (24/09/2026) — Lot A : schéma.
-- Étend le moteur support_tickets (citoyen + institution) avec une 3e
-- origine "visiteur" (aucun compte Yelen), suivant exactement le même
-- schéma d'extension déjà appliqué le 06/09/2026 (citoyen → +institution).
-- Design complet : docs/support-center/public-support-architecture.md
-- et docs/support-center/public-support-technical-design.md.
--
-- ⚠️ ÉTAPE 0 — À EXÉCUTER ET VÉRIFIER AVANT TOUT LE RESTE DE CE FICHIER.
-- Les contraintes CHECK sur support_tickets.statut et
-- support_ticket_events.type ont été créées SANS nom explicite dans
-- 20260904000001_support_tickets_core.sql (contrainte inline sur la
-- colonne) — ce fichier suppose le nom auto-généré standard Postgres
-- ({table}_{colonne}_check). Si la requête ci-dessous montre un nom
-- différent pour l'une des deux, remplacer AVANT d'exécuter la suite :
-- un DROP CONSTRAINT sur un nom qui n'existe pas échoue proprement
-- (erreur visible), mais laisserait l'ancienne contrainte en place si
-- elle portait un nom encore différent de celui essayé en second — ne
-- jamais supposer, toujours vérifier.
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid IN (
--     'support_tickets'::regclass,
--     'support_ticket_messages'::regclass,
--     'support_ticket_events'::regclass
--   )
--   ORDER BY conrelid, conname;

-- ── 1) support_tickets — colonnes visiteur + statut attente_verification ──

ALTER TABLE support_tickets
  ADD COLUMN visiteur_nom               text,
  ADD COLUMN visiteur_email             text,
  ADD COLUMN visiteur_telephone         text,
  ADD COLUMN email_verifie_le           timestamptz,
  -- Échec d'envoi Postmark (vérification) : jamais silencieux (voir
  -- incident réel du 06/08/2026 sur recus.erreur_generation, même
  -- discipline) — le ticket reste valide, seule cette colonne trace
  -- l'échec pour un futur "renvoyer l'email" (hors V1).
  ADD COLUMN email_verification_erreur  text;

-- XOR à 3 voies (citoyen_id / institution_id / visiteur_email) — remplace
-- la version 2 voies de 20260906000004_support_tickets_institution.sql.
-- Garantie inchangée pour citoyen/institution : leur branche de la somme
-- est strictement identique à aujourd'hui, seule une 3e branche s'ajoute.
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_une_seule_origine;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_une_seule_origine
  CHECK (
    (CASE WHEN citoyen_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN institution_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN visiteur_email IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- Nouveau statut attente_verification — un ticket public n'entre dans la
-- file agent qu'après vérification de l'email (voir lib/supportTickets.ts
-- côté application, jamais construit ici en trigger).
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_statut_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_statut_check
  CHECK (statut IN ('attente_verification','attente_agent','en_cours','resolu','cloture'));

-- Catégories publiques ajoutées (3e élargissement de cette contrainte,
-- après citoyen puis institution) — 'technique'/'securite'/'autre' déjà
-- partagés, réutilisés tels quels. 'rejoindre_yelen' délibérément distinct
-- du 'partenariat' institution (prospect vs client déjà établi).
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_categorie_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_categorie_check
  CHECK (categorie IN (
    'compte','reservation','paiement','etablissement','securite','technique','autre',
    'facturation','client','partenariat',
    'general','rejoindre_yelen','presse','commercial','signalement_general'
  ));

CREATE INDEX support_tickets_visiteur_idx ON support_tickets (visiteur_email, cree_le DESC) WHERE visiteur_email IS NOT NULL;
-- Cible directement les lignes attente_verification pour la purge (§17
-- architecture) — la fonction de purge est définie plus bas, son
-- activation (cron.schedule) est volontairement laissée à une migration
-- séparée, après revue d'un dry-run par Bryan.
CREATE INDEX support_tickets_purge_idx ON support_tickets (statut, cree_le) WHERE statut = 'attente_verification';

-- ── 2) support_ticket_messages — expediteur_type élargi ─────────────────

ALTER TABLE support_ticket_messages DROP CONSTRAINT support_ticket_messages_expediteur_type_check;
ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_messages_expediteur_type_check
  CHECK (expediteur_type IN ('citoyen','agent','institution','visiteur'));

-- ── 3) support_ticket_events — acteur_type + type élargis ───────────────
-- Rappel de conception (voir architecture §2.3) : pour l'origine
-- visiteur, AUCUN événement n'est inséré à la création du ticket — l'audit
-- démarre à la vérification email réussie ('created' puis 'email_verifie'
-- insérés ensemble à ce moment-là, côté application). C'est ce qui rend
-- la suppression physique des tickets jamais vérifiés possible sans
-- toucher à l'invariant d'immuabilité de cette table (ON DELETE RESTRICT
-- ci-dessous reste inchangé et protège toujours citoyen/institution/
-- visiteur une fois vérifié).

ALTER TABLE support_ticket_events DROP CONSTRAINT support_ticket_events_acteur_type_check;
ALTER TABLE support_ticket_events ADD CONSTRAINT support_ticket_events_acteur_type_check
  CHECK (acteur_type IN ('citoyen','agent','system','institution','visiteur'));

ALTER TABLE support_ticket_events DROP CONSTRAINT support_ticket_events_type_check;
ALTER TABLE support_ticket_events ADD CONSTRAINT support_ticket_events_type_check
  CHECK (type IN ('created','assigned','message_sent','resolved','reopened','closed','email_verifie'));

-- ── 4) support_ticket_public_tokens — vérification email + suivi ────────
-- Un seul mécanisme de token pour les 2 usages (purpose), même discipline
-- que citoyen_remember_tokens/institution_remember_tokens (un statut
-- plutôt que 2 tables parallèles, décision Bryan 30/08/2026). Même
-- mécanique de hash que lib/auth/trustedDevice.ts : token brut de 256
-- bits généré côté application, seul le hash SHA-256 est stocké ici —
-- jamais le token en clair, jamais loggé.

CREATE TABLE support_ticket_public_tokens (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id     uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  purpose       text NOT NULL CHECK (purpose IN ('verification','suivi')),
  token_hash    text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','utilise','revoque')),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz,
  ip_creation   text,
  cree_le       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_public_tokens_ticket_idx ON support_ticket_public_tokens (ticket_id);
CREATE UNIQUE INDEX support_ticket_public_tokens_hash_idx ON support_ticket_public_tokens (token_hash);

ALTER TABLE support_ticket_public_tokens ENABLE ROW LEVEL SECURITY;
-- Zéro policy — accès exclusivement service_role, même raisonnement que
-- support_ticket_events (aucune session Supabase Auth côté visiteur).

-- ── 5) support_public_signal_log — anti-abus, TTL indépendant du ticket ──
-- Décision explicite de Bryan (24/09/2026) : les données anti-abus/rate
-- limiting restent séparées du cycle de vie du ticket (7 jours). Table
-- volontairement hors du modèle d'audit immuable (signal opérationnel,
-- pas un événement légal) — une simple UPDATE de `verifie` est acceptée.

CREATE TABLE support_public_signal_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text NOT NULL,
  ip            text,
  categorie     text,
  -- ON DELETE SET NULL délibéré (jamais RESTRICT/CASCADE) : quand le
  -- ticket référencé est supprimé par la purge à J+7, cette ligne de
  -- signal doit survivre — c'est tout son intérêt — elle perd juste sa
  -- référence.
  ticket_id     uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  verifie       boolean NOT NULL DEFAULT false,
  cree_le       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_public_signal_log_email_idx ON support_public_signal_log (email, cree_le DESC);
CREATE INDEX support_public_signal_log_ip_idx ON support_public_signal_log (ip, cree_le DESC);

ALTER TABLE support_public_signal_log ENABLE ROW LEVEL SECURITY;
-- Zéro policy, service_role uniquement.

-- ── 6) Fonction de purge — définie, PAS encore planifiée ────────────────
-- cron.schedule(...) est volontairement absent de cette migration : à
-- exécuter séparément par Bryan après revue du dry-run suivant sur des
-- données réelles :
--
--   SELECT id, numero_public, visiteur_email, cree_le
--   FROM support_tickets
--   WHERE statut = 'attente_verification' AND cree_le < now() - interval '7 days'
--   ORDER BY cree_le;
--
-- Rendu possible sans violer l'immuabilité de support_ticket_events
-- (ON DELETE RESTRICT) uniquement parce qu'un ticket jamais vérifié n'a
-- structurellement aucune ligne dans cette table (§3 ci-dessus).

CREATE OR REPLACE FUNCTION support_tickets_purger_non_verifies() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM support_tickets
  WHERE statut = 'attente_verification' AND cree_le < now() - interval '7 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
