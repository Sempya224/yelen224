-- Lot A — Fondations infra confidentialité citoyen (écran "Confidentialité")
--
-- Contexte : le brief CEO pour l'écran Confidentialité suppose des données
-- qui n'existent pour aucun citoyen aujourd'hui — vérifié par grep
-- exhaustif avant d'écrire ce fichier (même démarche que
-- 20260718000003_citoyen_securite_fondations.sql pour l'écran Sécurité).
--
-- "Téléphone secondaire" du brief est volontairement absent de
-- champs_visibles ci-dessous : aucune colonne users.telephone_secondaire
-- n'existe, il n'y a donc rien à rendre visible/invisible pour l'instant
-- (pas une donnée inventée). À ajouter si ce champ est un jour construit.

-- Visibilité du profil vis-à-vis des institutions. Vérifié dans
-- api/institution/clients/route.ts : aujourd'hui l'institution ne voit
-- QUE nom et phone du citoyen — donc ces préférences ne changent rien de
-- réel tant qu'un écran institution ne consulte pas ces champs. Défauts
-- choisis pour refléter ce qui est déjà exposé (nom/photo/profession) vs
-- ce qui ne l'est jamais (adresse/email/date de naissance).
CREATE TABLE citoyen_prefs_visibilite (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  champs_visibles jsonb NOT NULL DEFAULT '{
    "nom_complet": true, "photo": true, "profession": true,
    "adresse": false, "email": false, "date_naissance": false
  }'::jsonb,
  profil_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_prefs_visibilite ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement (comme citoyen_webauthn_credentials) :
-- accès exclusivement service_role depuis des routes API serveur.

-- Partage de l'historique avec les institutions. Défaut à `true` pour ne
-- RIEN changer au comportement actuel : api/institution/clients/route.ts
-- montre aujourd'hui l'historique RDV complet sans aucune condition —
-- exposer ce switch côté UI avant que le Lot B de ce chantier ne câble la
-- vérification serait un mensonge visuel (switch qui ne contrôle rien),
-- donc ce switch ne doit pas apparaître dans l'écran tant que le gating
-- serveur n'existe pas.
CREATE TABLE citoyen_prefs_partage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  partage_historique_rdv boolean NOT NULL DEFAULT true,
  partage_historique_services boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_prefs_partage ENABLE ROW LEVEL SECURITY;

-- Consentements — mirroring
-- institutions.conditions_prestataire_acceptees_le (migration
-- 20260719000003) : nullable = jamais accepté, ne redevient jamais null
-- une fois posé. Aucun backfill rétroactif sur les comptes existants —
-- ils restent NULL tant qu'un vrai flux d'acceptation (hors scope Lot A)
-- ne les fait pas accepter réellement. L'écran devra afficher un état
-- honnête ("Non renseigné") plutôt qu'inventer une date.
ALTER TABLE users ADD COLUMN cgu_acceptee_le timestamptz;
ALTER TABLE users ADD COLUMN confidentialite_acceptee_le timestamptz;

-- Préférences de communication — mirroring institution_notification_prefs
-- (migration 20260712000001). Défauts à `true` partout : comportement
-- actuel inchangé (lib/notifications.ts envoie déjà tout sans condition),
-- ce lot ajoute seulement la possibilité de désactiver plus tard (Lot B).
CREATE TABLE citoyen_communication_prefs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  communications_yelen boolean NOT NULL DEFAULT true,
  communications_etablissements boolean NOT NULL DEFAULT true,
  personnalisation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_communication_prefs ENABLE ROW LEVEL SECURITY;
