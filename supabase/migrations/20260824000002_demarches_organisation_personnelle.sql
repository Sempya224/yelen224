-- "Mes démarches" → outil d'organisation personnelle (24/08/2026, brief CEO,
-- voir plan de chantier "Mes démarches → outil d'organisation personnelle").
-- Lot 0 : schéma seul, additif — aucune colonne existante touchée, aucune
-- fonctionnalité applicative câblée dans cette migration (livrée lot par
-- lot ensuite). Toutes les nouvelles colonnes sont nullable ou ont un
-- défaut compatible avec les lignes existantes.
--
-- Récurrence : pattern réutilisé tel quel depuis evenements_agenda.recurrence
-- (migration 20260718000001) — colonne + génération à la volée côté
-- application, pas de table d'occurrences matérialisées.
-- Rappels : niveau jour uniquement (rappel_jours_avant), étend le cron
-- quotidien existant supabase/functions/demarches-rappels — pas de rappel à
-- l'heure précise dans ce lot (aurait nécessité un passage en timestamptz
-- et un cron plus fréquent).

ALTER TABLE citoyen_demarches
  ADD COLUMN priorite text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('faible', 'normale', 'importante', 'urgente')),
  ADD COLUMN date_debut date,
  ADD COLUMN recurrence text NOT NULL DEFAULT 'aucune' CHECK (recurrence IN ('aucune', 'quotidien', 'hebdomadaire', 'mensuel', 'annuel')),
  ADD COLUMN recurrence_fin date,
  ADD COLUMN rappel_jours_avant integer CHECK (rappel_jours_avant IS NULL OR rappel_jours_avant >= 0);
-- `description` sert déjà de champ "objectif" (colonne existante depuis
-- 20260724000011_citoyen_demarches.sql, jamais exposée dans l'UI jusqu'ici).

ALTER TABLE citoyen_demarche_etapes
  ADD COLUMN priorite text NOT NULL DEFAULT 'normale' CHECK (priorite IN ('faible', 'normale', 'importante', 'urgente')),
  ADD COLUMN note text,
  ADD COLUMN rappel_jours_avant integer CHECK (rappel_jours_avant IS NULL OR rappel_jours_avant >= 0);

-- Historique de progression — même famille que rdv_events/document_events/
-- signalement_events/citoyen_abonnement_events (convention du projet pour
-- tout journal d'actions). citoyen_id dénormalisé (mirroring
-- citoyen_demarche_etapes) pour une policy RLS simple sans jointure.
-- Contrairement à citoyen_abonnement_events (analytics institution, jamais
-- lu par le citoyen), cette table est lue par le citoyen lui-même dans le
-- détail de sa démarche (Lot 6) — SELECT + INSERT, jamais UPDATE/DELETE :
-- l'absence de policy pour ces deux actions la rend naturellement immuable
-- par RLS (deny-by-default), pas besoin d'un trigger dédié pour un journal
-- de cette sensibilité.
CREATE TABLE citoyen_demarche_historique (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  demarche_id uuid NOT NULL REFERENCES citoyen_demarches(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evenement text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_demarche_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY demarche_historique_citoyen_select ON citoyen_demarche_historique
  FOR SELECT
  USING (auth.uid() = citoyen_id);

CREATE POLICY demarche_historique_citoyen_insert ON citoyen_demarche_historique
  FOR INSERT
  WITH CHECK (auth.uid() = citoyen_id);

CREATE INDEX idx_demarche_historique_demarche ON citoyen_demarche_historique(demarche_id, created_at);
