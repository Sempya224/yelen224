-- Signalements — Lot 1 : signalement_notes, notes internes jamais
-- visibles du citoyen concerné (accès gardé par signalements.notes_read/
-- notes_write, lib/institutionPermissions.ts). Pas de trigger
-- d'immuabilité ici (contrairement à signalement_events) : aucune route
-- d'édition/suppression n'existe dans ce lot, l'insert-only est déjà le
-- contrat applicatif complet — un trigger sera ajouté si un vrai besoin
-- d'édition apparaît plus tard, pas anticipé maintenant.

CREATE TABLE signalement_notes (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  signalement_id    uuid NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  institution_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  auteur_membre_id  uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  auteur_nom        text NOT NULL,
  contenu           text NOT NULL CHECK (char_length(contenu) > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signalement_notes_signalement_idx ON signalement_notes (signalement_id, created_at);

ALTER TABLE signalement_notes ENABLE ROW LEVEL SECURITY;
