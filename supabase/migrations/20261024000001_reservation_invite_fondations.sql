-- Booking externe E0.1, PR 1/3 (24/10/2026) — fondations réservation invité
-- (ADR-001, docs/product/YELEN_BOOKING_EXTERNAL_ADR_E0_INVITE.md).
-- Migration seule : aucun code applicatif ne lit encore ces objets, donc
-- sans effet de comportement tant que les PR 2 (serveur) et 3 (UI) ne sont
-- pas déployées. À exécuter manuellement par Bryan ; ce fichier consigne le
-- SQL exécuté.
--
-- 1. users.compte_complete_le : distingue un compte réellement complété
--    (CGU + informations personnelles) d'une identité invité vérifiée par
--    OTP seulement. Écrite exclusivement par du code service_role.
-- 2. Backfill : 100 % des lignes users existantes proviennent du register
--    complet (aucun invité n'existe en production). Exécuté AVANT toute
--    mise en service des filtres soumettreAvis()/accorderPoints().
-- 3. invite_phone_verifications : enregistrement éphémère, lié au seul
--    numéro, émis avant toute création users/auth.users. Un seul code actif
--    par numéro (PK = phone). RLS activée, aucune policy : accès
--    service_role uniquement.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS compte_complete_le timestamptz;

UPDATE public.users
   SET compte_complete_le = COALESCE(cgu_acceptee_le, created_at)
 WHERE compte_complete_le IS NULL;

CREATE TABLE IF NOT EXISTS public.invite_phone_verifications (
  phone          text PRIMARY KEY,
  otp_code_hash  text NOT NULL,
  otp_expires_at timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_phone_verifications_expires_idx
  ON public.invite_phone_verifications (otp_expires_at);

ALTER TABLE public.invite_phone_verifications ENABLE ROW LEVEL SECURITY;

-- Purge des codes expirés (à appeler à la main ou depuis une tâche
-- planifiée ; aucune planification n'est créée ici).
CREATE OR REPLACE FUNCTION public.purger_invite_phone_verifications() RETURNS void
LANGUAGE sql AS $$
  DELETE FROM public.invite_phone_verifications WHERE otp_expires_at < now() - interval '1 hour';
$$;

-- Retour arrière
-- DROP FUNCTION IF EXISTS public.purger_invite_phone_verifications();
-- DROP TABLE IF EXISTS public.invite_phone_verifications;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS compte_complete_le;
