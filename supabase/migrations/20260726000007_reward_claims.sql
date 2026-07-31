-- Yelen Rewards — Phase 1, fichier 7/8.
--
-- reward_claims — schéma créé maintenant pour éviter une migration
-- supplémentaire en Phase 2, mais AUCUN workflow (route API, écran citoyen,
-- écran admin de revue) n'est construit dans cette passe. Le CEO est
-- explicite : "nous ne construisons pas encore toutes les récompenses" —
-- le palier 5000 pts / 30 000 GNF peut être franchi (reward_unlocks) sans
-- qu'aucune réclamation ne soit possible tant que la Phase 2 n'a pas
-- livré la revue manuelle obligatoire (paiement réel = cible de fraude
-- prioritaire, voir l'analyse Fraud Engineer du plan).
--
-- Volontairement AUCUNE policy d'écriture, y compris pour le citoyen
-- propriétaire : contrairement à un simple like/favori, créer une
-- réclamation nécessite de revalider côté serveur (palier bien débloqué,
-- pas déjà réclamé, type cohérent avec le palier) — ce n'est pas
-- exprimable en toute sécurité dans une policy RLS `WITH CHECK` simple.
CREATE TABLE reward_claims (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reward_unlock_id uuid NOT NULL UNIQUE REFERENCES reward_unlocks(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_reclamation text NOT NULL CHECK (type_reclamation IN (
    'paiement_especes', 'contact_offre_partenaire'
  )),
  statut text NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'en_revision', 'approuve', 'rejete', 'paye')),
  montant_gnf integer,
  coordonnees_paiement jsonb,
  traite_par uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  traite_le timestamptz,
  notes_admin text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_claims_lecture_propre ON reward_claims
  FOR SELECT USING (auth.uid() = citoyen_id);
