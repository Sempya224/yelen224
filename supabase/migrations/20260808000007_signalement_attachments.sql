-- Signalements — Lot 1 : signalement_attachments, pièces jointes
-- multiples (remplace preuve_url pour tout nouveau signalement — preuve_url
-- reste en base pour l'historique déjà écrit, jamais migrée : schéma de
-- stockage différent, URLs déjà publiques posées avant ce lot).
--
-- ⚠️ ACTION MANUELLE REQUISE DE BRYAN avant mise en prod : créer
-- manuellement le bucket Storage PRIVÉ "signalements-preuves" (Public
-- décoché) — même convention que documents-citoyens/documents-employes.
-- Les fichiers sont servis exclusivement via URL signée (createSignedUrl),
-- jamais une URL publique directe.

CREATE TABLE signalement_attachments (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  signalement_id        uuid NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  institution_id        uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  storage_path          text NOT NULL,
  nom_original          text NOT NULL,
  type_mime             text NOT NULL,
  taille                bigint NOT NULL,
  ajoute_par_membre_id  uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  ajoute_par_nom        text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signalement_attachments_signalement_idx ON signalement_attachments (signalement_id);

ALTER TABLE signalement_attachments ENABLE ROW LEVEL SECURITY;
