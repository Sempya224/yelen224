-- "Mes projets" — Lot 4 : section "Lié à ce projet", limitée aux
-- rendez-vous et réservations pour ce lot (documents/messages/
-- professionnel reportés à un chantier séparé, décision explicite de
-- Bryan le 28/09/2026).
--
-- Table de liaison plutôt qu'une colonne projet_id directement sur rdv/
-- paid_bookings : ces deux tables centrales sont déjà denses et
-- consommées par de nombreux écrans institution/admin/citoyen (voir
-- CLAUDE.md /modules-livres, 91 routes institution) — un lien optionnel
-- côté citoyen n'a pas sa place dans leur schéma. Many-to-many volontaire
-- (rien n'impose techniquement qu'un rendez-vous n'appartienne qu'à un
-- seul projet), même absence de contrainte que citoyen_favoris.
--
-- rdv_id XOR paid_booking_id par ligne — un seul join couvre les deux
-- mécanismes de réservation du produit (RDV gratuit vs réservation
-- payante, cf. CLAUDE.md /schema) plutôt que deux tables distinctes.

CREATE TABLE citoyen_projet_reservations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  projet_id uuid NOT NULL REFERENCES citoyen_projets(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rdv_id uuid REFERENCES rdv(id) ON DELETE CASCADE,
  paid_booking_id uuid REFERENCES paid_bookings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT citoyen_projet_reservations_une_seule_reference CHECK (
    (rdv_id IS NOT NULL AND paid_booking_id IS NULL) OR (rdv_id IS NULL AND paid_booking_id IS NOT NULL)
  ),
  CONSTRAINT citoyen_projet_reservations_rdv_unique UNIQUE (projet_id, rdv_id),
  CONSTRAINT citoyen_projet_reservations_booking_unique UNIQUE (projet_id, paid_booking_id)
);
ALTER TABLE citoyen_projet_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY projet_reservations_citoyen_own ON citoyen_projet_reservations
  FOR ALL
  USING (auth.uid() = citoyen_id)
  WITH CHECK (auth.uid() = citoyen_id);

CREATE INDEX idx_projet_reservations_projet ON citoyen_projet_reservations(projet_id);
CREATE INDEX idx_projet_reservations_rdv ON citoyen_projet_reservations(rdv_id) WHERE rdv_id IS NOT NULL;
CREATE INDEX idx_projet_reservations_booking ON citoyen_projet_reservations(paid_booking_id) WHERE paid_booking_id IS NOT NULL;
