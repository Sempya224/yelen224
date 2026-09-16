-- ⚠️ Découvert 12/09/2026 : la migration 20260724000002 (qui ajoute ces 2
-- colonnes) est présente dans le repo depuis longtemps mais n'avait
-- jamais été réellement exécutée en base (colonnes absentes, erreur
-- 42703). Posées ici en IF NOT EXISTS pour rattraper ce retard sans
-- dépendre de l'ordre d'exécution des migrations.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cgu_acceptee_le timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS confidentialite_acceptee_le timestamptz;

-- Même rattrapage par précaution pour les 3 tables compagnes de la même
-- migration 20260724000002 (écran Confidentialité — visibilité/partage/
-- communication) : si les colonnes ci-dessus manquaient, ces tables n'ont
-- peut-être pas été créées non plus. Définitions identiques à l'original,
-- juste IF NOT EXISTS — sans effet si déjà en place.
CREATE TABLE IF NOT EXISTS citoyen_prefs_visibilite (
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

CREATE TABLE IF NOT EXISTS citoyen_prefs_partage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  partage_historique_rdv boolean NOT NULL DEFAULT true,
  partage_historique_services boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_prefs_partage ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS citoyen_communication_prefs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  citoyen_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  communications_yelen boolean NOT NULL DEFAULT true,
  communications_etablissements boolean NOT NULL DEFAULT true,
  personnalisation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_communication_prefs ENABLE ROW LEVEL SECURITY;

-- Backfill des consentements CGU/confidentialité pour les comptes créés
-- avant que l'inscription (api/citoyen/auth/register) ne persiste
-- cgu_acceptee_le/confidentialite_acceptee_le (retour Bryan 12/09/2026).
-- La case CGU est obligatoire pour soumettre l'inscription (canSubmit,
-- app/inscription/page.tsx), donc l'acceptation a réellement eu lieu à la
-- création du compte pour tous les comptes existants — on la date sur
-- created_at plutôt que de laisser la colonne null indéfiniment.
-- Idempotent (COALESCE + WHERE ... IS NULL) — sans effet si déjà rejouée.
UPDATE public.users
SET
  cgu_acceptee_le = COALESCE(cgu_acceptee_le, created_at),
  confidentialite_acceptee_le = COALESCE(confidentialite_acceptee_le, created_at)
WHERE cgu_acceptee_le IS NULL OR confidentialite_acceptee_le IS NULL;
