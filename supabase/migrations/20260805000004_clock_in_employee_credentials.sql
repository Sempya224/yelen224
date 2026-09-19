-- Clock In Shift — 4/9. Identifiants de connexion au portail employé
-- (Identifiant + PIN, ex. "ECO-02458" + "4821" dans le brief CEO). Table
-- séparée de `employees` (profil RH) pour garder les secrets d'authentif
-- dans une table fine, verrouillable indépendamment.
--
-- Colonnes de verrouillage (failed_attempts/locked_until) copiées de
-- admin_users (supabase/migrations/20260719000002_admin_account_lockout.sql)
-- — persistées en base, pas un Map en mémoire comme le pattern citoyen/
-- institution_membres existant (qui ne survit pas à un redémarrage/
-- multi-instance). Un kiosque de pointage partagé a besoin d'un
-- verrouillage qui persiste réellement.
--
-- pin_hash : bcrypt coût 12 (aligné sur le PIN citoyen et
-- app/api/institution/auth/pin/set/route.ts — coût standardisé pour tout
-- nouveau code de ce module, l'incohérence 10/12 existante ailleurs dans le
-- projet est hors périmètre).
--
-- identifiant unique PAR institution (pas globalement) : deux entreprises
-- peuvent légitimement générer le même code court (ex. deux "EMP-00001").
--
-- institution_id dénormalisé (présent aussi sur employees, atteignable par
-- jointure) pour que la route de login fasse un lookup mono-table
-- `WHERE institution_id = $1 AND identifiant = $2` sans jointure à chaque
-- tentative de connexion.
CREATE TABLE employee_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  identifiant text NOT NULL,
  pin_hash text NOT NULL,
  doit_changer_pin boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  derniere_connexion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id),
  UNIQUE (institution_id, identifiant)
);

ALTER TABLE employee_credentials ENABLE ROW LEVEL SECURITY;
