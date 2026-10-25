-- Scope "destination" du module anti-abus central (chantier "Limites
-- d'authentification et protection contre les abus", Priorités 3/4
-- validées CEO le 18/10/2026) — troisième dimension de comptage en plus
-- de device/ip (auth_device_security/auth_ip_security,
-- 20260828000004_auth_security.sql), même forme de ligne.
--
-- `destination` est une clé déjà namespacée par l'appelant (voir
-- lib/security/authSecurity.ts::destinationCitoyen/destinationInstitution),
-- ex. 'citoyen_phone:+224xxxxxxxx' ou 'institution_id:<uuid>' — une seule
-- colonne texte, jamais une clé composite, pour garder la même forme de
-- code générique que device/ip (tableEtColonne).
--
-- Complémentaire, jamais autonome (mandat CEO explicite) : ce scope ne
-- doit jamais, à lui seul, bloquer un appareil déjà reconnu comme celui
-- du titulaire légitime de cette destination — voir
-- lib/security/authSecurity.ts::estAppareilDeConfiancePourDestination,
-- qui neutralise la contribution de ce scope pour ce cas précis avant de
-- calculer le pire état. Device/IP restent évalués indépendamment et
-- continuent de s'appliquer même si l'exemption destination joue.
CREATE TABLE auth_destination_security (
  destination             text PRIMARY KEY,
  first_seen_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at            timestamptz NOT NULL DEFAULT now(),
  window_started_at       timestamptz NOT NULL DEFAULT now(),
  attempts_in_window      int NOT NULL DEFAULT 0,
  state                   text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at        timestamptz NOT NULL DEFAULT now(),
  blocked_until           timestamptz,
  block_cycles_24h        int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason          text
);

CREATE INDEX auth_destination_security_state_idx ON auth_destination_security (state) WHERE state <> 'normal';

ALTER TABLE auth_destination_security ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que auth_device_security/auth_ip_security.
