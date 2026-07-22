CREATE TABLE institution_membres (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  identifiant text UNIQUE,
  pin_hash text,
  prenom text NOT NULL,
  nom text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','agent','comptable')),
  actif boolean NOT NULL DEFAULT true,
  compte_principal boolean NOT NULL DEFAULT false,
  doit_changer_pin boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE institution_membres ENABLE ROW LEVEL SECURITY;

INSERT INTO institution_membres (institution_id, prenom, nom, role, compte_principal, doit_changer_pin)
SELECT i.id, COALESCE(r.prenom, 'Responsable'), COALESCE(r.nom, i.name), 'admin', true, false
FROM institutions i
LEFT JOIN institution_responsables r ON r.institution_id = i.id;
