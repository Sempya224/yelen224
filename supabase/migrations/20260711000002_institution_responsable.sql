-- Migration : profil responsable séparé du profil entreprise (11/07/2026)
-- Jusqu'ici responsable_prenom/nom/role étaient 3 colonnes plates sur
-- institutions (migration 20260710000001) — pas une vraie entité séparée.
-- Table dédiée, relation 1:1 pour l'instant (1 seul responsable par
-- institution, extensible plus tard vers du multi-membres si besoin).
-- Accès exclusivement via routes serveur (service role + session JWT) —
-- mêmes raisons que institutions : pas de session Supabase Auth pour les
-- institutions, donc aucune policy RLS anon/authenticated pertinente ici.
CREATE TABLE institution_responsables (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
  prenom text NOT NULL,
  nom text NOT NULL,
  role text,
  phone text,
  email text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE institution_responsables ENABLE ROW LEVEL SECURITY;

-- Reprise des données déjà collectées à l'onboarding (responsable_prenom/nom/
-- role sur institutions) pour les institutions déjà inscrites, afin que
-- l'écran Profil Responsable ne parte pas vide pour les comptes existants.
INSERT INTO institution_responsables (institution_id, prenom, nom, role)
SELECT id, responsable_prenom, responsable_nom, responsable_role
FROM institutions
WHERE responsable_prenom IS NOT NULL AND responsable_nom IS NOT NULL;
