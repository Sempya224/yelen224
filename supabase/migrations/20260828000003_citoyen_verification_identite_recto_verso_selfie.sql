-- Flux complet recto + verso + selfie (28/08/2026, retour Bryan) — le
-- pipeline collecte désormais les deux faces de la CIN plus une photo de la
-- personne, pas seulement un recto. `cin_document_url` (existante) devient
-- implicitement le recto.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cin_verso_document_url text,
  ADD COLUMN IF NOT EXISTS cin_selfie_url text;
