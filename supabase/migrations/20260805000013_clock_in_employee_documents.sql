-- Clock In Shift — documents rattachés à un employé (contrat, pièce
-- d'identité, etc.), section "Documents" du drawer employé (refonte
-- 05/08/2026, décision Bryan). Plus simple que citoyen_documents : pas de
-- flux "demande/attente" — un admin téléverse directement, upload
-- toujours immédiat.
CREATE TABLE employee_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'autre',
  url text NOT NULL,
  type_mime text,
  taille bigint,
  televerse_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employee_documents_employee_idx ON employee_documents (institution_id, employee_id);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que citoyen_documents/citoyen_webauthn_credentials.

-- ⚠️ ACTION REQUISE DE BRYAN avant tout test : créer manuellement un bucket
-- Storage PRIVÉ nommé "documents-employes" dans le dashboard Supabase
-- (Storage > New bucket, "Public" décoché) — documents potentiellement
-- sensibles (pièce d'identité, contrat), jamais un bucket public. Mirroring
-- le bucket privé "documents-citoyens" déjà existant (URLs signées à durée
-- limitée, jamais d'URL publique directe).
