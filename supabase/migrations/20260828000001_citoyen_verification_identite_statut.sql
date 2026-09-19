-- Vérification d'identité citoyen — vrai pipeline (28/08/2026)
-- Remplace l'auto-vérification instantanée (20260724000013) par un statut
-- réel : l'upload passe désormais en "en_attente", seule une décision
-- explicite (écran admin à construire séparément, ou action manuelle de
-- Bryan en attendant) fait passer à "verifiee"/"refusee". `identite_verifiee`
-- reste la colonne lue partout ailleurs dans l'app (badge YelenID, gate
-- publication Communauté, attentionEngine) — elle ne bouge que sur décision.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cin_statut text
    CHECK (cin_statut IN ('en_attente','verifiee','refusee')),
  ADD COLUMN IF NOT EXISTS cin_motif_refus text,
  ADD COLUMN IF NOT EXISTS cin_examine_le timestamptz;

-- Backfill : les citoyens déjà auto-vérifiés avant ce chantier ne sont
-- jamais repassés en attente (pas de ré-examen rétroactif).
UPDATE public.users SET cin_statut = 'verifiee'
  WHERE identite_verifiee = true AND cin_statut IS NULL;
