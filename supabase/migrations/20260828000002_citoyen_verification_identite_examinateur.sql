-- Traçabilité de la décision (28/08/2026) — même principe que
-- documents_institution.examine_par (20260711000005) : quel admin a
-- approuvé/refusé un dossier d'identité citoyen. Ajout distinct de la
-- migration 20260828000001 pour ne pas la modifier si elle a déjà été
-- exécutée.
-- ⚠️ Corrigé (échec constaté par Bryan : ERROR 42P01, relation "admins"
-- does not exist) — table réelle "admin_users" (drift documenté dans
-- CLAUDE.md), pas "admins". La référence "admins(id)" utilisée par
-- documents_institution.examine_par (20260711000005) semble donc porter
-- sur une table absente en base également — à vérifier séparément par
-- Bryan si pertinent, hors périmètre de ce chantier.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cin_examine_par uuid REFERENCES admin_users(id);
