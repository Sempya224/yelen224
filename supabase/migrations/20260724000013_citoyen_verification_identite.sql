-- Vérification d'identité citoyen par pièce (CIN) — chantier refonte Hero
-- Accueil "état vivant" (23/07/2026). Remplace le badge "VÉRIFIÉ" jusqu'ici
-- hardcodé (aucune donnée réelle derrière, ni sur la carte YelenID ni sur
-- le Hero) par un vrai signal. Décision Bryan : auto-vérifié dès soumission
-- d'une pièce — pas de file d'attente de modération admin pour démarrer,
-- une vraie revue pourra être ajoutée plus tard sans changer ce schéma.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS identite_verifiee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cin_document_url text,
  ADD COLUMN IF NOT EXISTS cin_soumis_le timestamptz;
