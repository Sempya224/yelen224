-- Module d'export commun (fondation, 24/10/2026) — registre des documents
-- exportés. Chaque export (journal, transactions, rapports...) y est
-- enregistré avec une empreinte SHA-256 de son contenu canonique et une
-- signature HMAC-SHA256 (clé serveur EXPORT_SIGNING_SECRET, jamais stockée
-- ici). Un export sans ligne dans cette table n'est pas livré.
--
-- Table INSERT-ONLY : aucune route ne met à jour ni ne supprime un export. Un
-- enregistrement modifiable n'aurait aucune valeur de preuve (même principe
-- que journal_activite et recus).

-- 1) Référence lisible YL-EXP-{année}-{compteur8}. Séquence GLOBALE jamais
-- remise à zéro (même patron que journal_activite_audit_seq / recus_numero_seq
-- / transactions_financieres_numero_seq : le compteur ne repart pas à zéro
-- d'une année sur l'autre, l'année n'est que la partie lisible).
CREATE SEQUENCE exports_numero_seq START 1;

CREATE OR REPLACE FUNCTION exports_generer_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('exports_numero_seq');
  RETURN 'YL-EXP-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 8, '0');
END;
$$;

-- 2) Table. La référence et la date de création sont fournies par le code
-- (réservées avant le calcul de l'empreinte, qui les contient) ; les DEFAULT
-- ne sont qu'un filet. Un trou dans la séquence (référence réservée, insertion
-- échouée) est normal et sans conséquence.
CREATE TABLE exports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE DEFAULT exports_generer_reference(),
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- Auteur : le nom et le rôle sont recopiés (un membre supprimé ne doit pas
  -- effacer qui a exporté). SET NULL autorisé par le trigger ci-dessous, et
  -- uniquement lui.
  auteur_id       uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  auteur_nom      text NOT NULL,
  role            text NOT NULL,
  type            text NOT NULL,
  format          text NOT NULL,
  ecran           text NOT NULL,
  filtres         jsonb NOT NULL DEFAULT '{}'::jsonb,
  nb_lignes       integer NOT NULL CHECK (nb_lignes >= 0),
  version_gabarit text NOT NULL,
  hash_contenu    text NOT NULL CHECK (hash_contenu ~ '^[0-9a-f]{64}$'),
  signature_hmac  text NOT NULL CHECK (signature_hmac ~ '^[0-9a-f]{64}$'),
  -- Version de la clé de signature : permet de la renouveler sans invalider
  -- les anciennes signatures (1 = EXPORT_SIGNING_SECRET, n = EXPORT_SIGNING_SECRET_V{n}).
  cle_version     smallint NOT NULL DEFAULT 1 CHECK (cle_version >= 1),
  cree_le         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exports_institution_cree_le_idx ON exports (institution_id, cree_le DESC);
CREATE INDEX exports_type_idx ON exports (institution_id, type);

-- 3) Immuabilité au niveau base, y compris pour service_role et le SQL Editor
-- (un trigger n'est jamais contourné par un superuser). Même modèle que
-- journal_activite_interdire_modification.
--
-- ⚠️ Ce trigger bloquera aussi toute correction manuelle depuis le SQL Editor.
-- Besoin réel et exceptionnel : exécuter d'abord, dans la MÊME requête :
--   SET LOCAL app.autoriser_correction_exports = 'on';
--   UPDATE exports SET ... WHERE id = '...';
-- Le réglage ne vaut que pour cette transaction. À documenter par ailleurs.
--
-- Seule exception sans réglage : le passage de auteur_id à NULL quand tout le
-- reste de la ligne est identique (ON DELETE SET NULL de la clé étrangère,
-- suppression d'un membre) ; sans elle, supprimer un membre serait bloqué.
CREATE OR REPLACE FUNCTION exports_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_exports', true) = 'on' THEN
    RAISE WARNING 'exports: modification manuelle exceptionnelle autorisée (id=%, reference=%). À documenter par ailleurs.', OLD.id, OLD.reference;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.auteur_id IS NOT NULL
     AND NEW.auteur_id IS NULL
     AND (to_jsonb(NEW) - 'auteur_id') = (to_jsonb(OLD) - 'auteur_id') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'exports est immuable : impossible de modifier ou supprimer un export (id=%, reference=%).', OLD.id, OLD.reference;
END;
$$;

CREATE TRIGGER exports_immuable
  BEFORE UPDATE OR DELETE ON exports
  FOR EACH ROW EXECUTE FUNCTION exports_interdire_modification();

-- 4) RLS activée, ZÉRO policy : accès exclusivement service_role (les
-- appelants — membres d'institution, vérification publique — n'ont pas de
-- session Supabase Auth). service_role est retiré AVANT le GRANT : sur
-- Supabase les privilèges par défaut sont accordés à la création de la table
-- et un simple GRANT ne les réduirait pas. INSERT-ONLY : ni UPDATE ni DELETE.
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE exports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE exports TO service_role;

-- La séquence et la fonction de référence ne servent qu'au code serveur
-- (réservation de la référence avant calcul de l'empreinte, via rpc).
REVOKE ALL ON SEQUENCE exports_numero_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE exports_numero_seq TO service_role;
REVOKE ALL ON FUNCTION exports_generer_reference() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION exports_generer_reference() TO service_role;
