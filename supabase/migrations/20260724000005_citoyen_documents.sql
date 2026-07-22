-- Lot A — Documents citoyen (demande/envoi de document lié à un RDV)
-- Chantier "Activités passées" (18/07/2026, décision CEO) : l'établissement
-- peut demander un document à un citoyen (pièce d'identité, justificatif...)
-- ou lui envoyer un document (facture, rapport, reçu...), toujours rattaché
-- à un RDV réel entre les deux — n'importe lequel, passé ou à venir (pas
-- seulement "en cours/à venir" : un établissement doit pouvoir facturer ou
-- redemander un document même après un RDV déjà passé, sans quoi le flux
-- bloquerait les utilisateurs dans un cas d'usage pourtant courant).
--
-- Distinct de documents_travail (bibliothèque interne à l'institution,
-- jamais rattachée à un citoyen) : ici chaque ligne concerne UN citoyen
-- précis. Distinct de documents_institution (KYC de l'institution elle-même
-- envers Yelen, sans rapport).
CREATE TABLE citoyen_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rdv_id uuid NOT NULL REFERENCES rdv(id) ON DELETE CASCADE,
  sens text NOT NULL CHECK (sens IN ('demande', 'envoi')),
  -- 'demande' : l'institution demande, le citoyen téléverse (url rempli après coup).
  -- 'envoi' : l'institution téléverse directement (facture/rapport/reçu), url rempli immédiatement.
  type text NOT NULL DEFAULT 'autre',
  label text NOT NULL,
  description text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'televerse', 'envoye', 'annule')),
  url text,
  type_mime text,
  taille bigint,
  demande_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  traite_le timestamptz
);
ALTER TABLE citoyen_documents ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role (comme
-- citoyen_webauthn_credentials/citoyen_remember_tokens) : upload de fichiers
-- + isolation stricte institution/citoyen, mieux vérifié en code serveur
-- qu'en policy RLS sur un cas déjà complexe (deux identités, deux sens).

-- ⚠️ ACTION REQUISE DE BRYAN avant tout test : créer manuellement un bucket
-- Storage PRIVÉ nommé "documents-citoyens" dans le dashboard Supabase
-- (Storage > New bucket, "Public" décoché) — ce sont des documents
-- personnels (pièce d'identité...), jamais un bucket public comme
-- "avatars". Mirroring le bucket privé "documents-travail" déjà existant
-- (URLs signées à durée limitée, jamais d'URL publique directe).
