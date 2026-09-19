-- Isolation du throttle anti-abus Admin (correctif ciblé 30/08/2026).
--
-- Preuve du bug (constatée en test réel par Bryan) : auth_device_security/
-- auth_ip_security (migration 20260828000004) sont clés PRIMARY KEY sur
-- device_id/ip SEUL — aucune colonne endpoint_category. evaluerTentative()
-- (porte d'entrée, lib/security/authSecurity.ts) ne prend même pas
-- endpointCategory en paramètre : elle lit un état global par device/ip,
-- partagé par citoyen_login, institution_login, admin_login, etc.
-- Conséquence vérifiée : des échecs répétés sur institution_login bloquent
-- le même device/ip pour admin_login — un admin peut se retrouver enfermé
-- hors de /admin par un abus (ou un test) sur un tout autre flux.
--
-- Correctif : 2 tables dédiées, même forme exacte que les tables générales,
-- utilisées EXCLUSIVEMENT par admin_login (lib/security/authSecurity.ts::
-- evaluerTentativeAdmin/enregistrerTentativeAdmin, app/api/admin/auth/
-- login/route.ts). Citoyen/institution/employé/récupération continuent
-- d'utiliser exactement les tables et le comportement d'avant, inchangés.

CREATE TABLE auth_admin_device_security (
  device_id                uuid PRIMARY KEY,
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  ip_last                  text,
  window_started_at        timestamptz NOT NULL DEFAULT now(),
  attempts_in_window       int NOT NULL DEFAULT 0,
  state                    text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at         timestamptz NOT NULL DEFAULT now(),
  blocked_until            timestamptz,
  block_cycles_24h         int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason           text
);

CREATE TABLE auth_admin_ip_security (
  ip                       text PRIMARY KEY,
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  window_started_at        timestamptz NOT NULL DEFAULT now(),
  attempts_in_window       int NOT NULL DEFAULT 0,
  state                    text NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','warning','blocked','support_only')),
  state_changed_at         timestamptz NOT NULL DEFAULT now(),
  blocked_until            timestamptz,
  block_cycles_24h         int NOT NULL DEFAULT 0,
  cycles_window_started_at timestamptz,
  blocked_reason           text
);

CREATE INDEX auth_admin_device_security_state_idx ON auth_admin_device_security (state) WHERE state <> 'normal';
CREATE INDEX auth_admin_ip_security_state_idx ON auth_admin_ip_security (state) WHERE state <> 'normal';

ALTER TABLE auth_admin_device_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_admin_ip_security ENABLE ROW LEVEL SECURITY;
-- Aucune policy — accès exclusivement service_role, comme auth_device_security/auth_ip_security.
