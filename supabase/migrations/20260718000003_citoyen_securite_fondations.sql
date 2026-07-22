-- Lot A — Fondations infra sécurité citoyen (18/07/2026)
--
-- Contexte : le brief CEO pour l'écran "Sécurité" (score de sécurité, PIN,
-- biométrie vérifiée serveur, appareils connectés, sessions, historique)
-- suppose des données qui n'existaient pour aucun citoyen avant cette
-- migration — vérifié par grep exhaustif avant d'écrire ce fichier. Le
-- système équivalent existe déjà et fonctionne côté institution
-- (institutions.pin_hash, institution_webauthn_credentials,
-- institution_remember_tokens — migration 20260710000002) : ce lot
-- reproduit exactement le même schéma pour les citoyens plutôt que
-- d'inventer un nouveau système.
--
-- Portée volontairement limitée à ce lot (comme pour le Journal
-- d'activité institution) : PAS de résolution ville/pays par IP ici
-- (capture de l'IP brute uniquement, géolocalisation reportée à un lot
-- ultérieur, même choix que journal_activite Lot A).

-- PIN citoyen (mirroring institutions.pin_hash). Ne jamais sélectionner
-- cette colonne depuis un appel client (`select("*")` interdit sur
-- users côté citoyen — déjà la convention existante) : uniquement lue/
-- écrite via service_role depuis une route API serveur.
ALTER TABLE users ADD COLUMN pin_hash text;

-- Biométrie vérifiée serveur (remplace à terme le flag localStorage
-- actuel côté client, qui ne prouve rien côté serveur — voir
-- app/page.tsx registerBiometrie(), aucun credential n'y est aujourd'hui
-- stocké ni vérifié). Mirroring exact de institution_webauthn_credentials.
CREATE TABLE citoyen_webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE citoyen_webauthn_credentials ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement, comme institution_webauthn_credentials :
-- accès exclusivement via service_role depuis les routes API serveur,
-- jamais en direct depuis le client.

-- Appareils / sessions "dont on se souvient" (mirroring exact de
-- institution_remember_tokens). Sert de base aux futures sections
-- "Mes appareils" et "Connexions récentes" de l'écran Sécurité.
CREATE TABLE citoyen_remember_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip text,
  device_label text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE citoyen_remember_tokens ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement, même raison que ci-dessus.
