-- Bloc Notes multi-type sur la fiche client (19/07/2026)
-- Remplace notes_clients (une note unique par client) par un modèle à
-- plusieurs entrées taguées par type. Décisions validées par Bryan :
-- "publique" = visible par tous les membres de l'institution (jamais
-- le citoyen, jamais une autre institution) ; "privee" = visible
-- seulement par son auteur, y compris pour un admin. notes_clients
-- n'est pas supprimée ici — dépréciée, conservée pour l'instant.
CREATE TYPE type_note_client AS ENUM ('privee','publique','commentaire','observation','compte_rendu');

CREATE TABLE notes_client_entrees (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auteur_membre_id uuid NOT NULL REFERENCES institution_membres(id) ON DELETE SET NULL,
  type type_note_client NOT NULL DEFAULT 'privee',
  contenu text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notes_client_entrees ENABLE ROW LEVEL SECURITY;

-- Migration des notes existantes (une par client) en 1re entrée "privee"
INSERT INTO notes_client_entrees (institution_id, citoyen_id, auteur_membre_id, type, contenu, created_at)
SELECT nc.institution_id, nc.citoyen_id,
       (SELECT id FROM institution_membres WHERE institution_id = nc.institution_id AND compte_principal = true LIMIT 1),
       'privee', nc.note, nc.mis_a_jour_le
FROM notes_clients nc WHERE nc.note IS NOT NULL AND nc.note != '';
