-- Récupération de compte citoyen (téléphone perdu/changé) — retour Bryan
-- 25/07/2026, 2e volet de la faille de sécurité prioritaire : aujourd'hui
-- aucun chemin n'existe pour un citoyen qui perd l'accès à son numéro, et
-- inversement rien n'empêchait un changement de numéro non vérifié.
-- Modèle retenu (choix Bryan) : semi-automatique — vérification CIN +
-- délai de sécurité de 48h avant activation automatique du nouveau numéro,
-- annulable manuellement si l'ancien numéro reste joignable — MAIS toujours
-- un chemin admin pour forcer/débloquer, jamais un citoyen bloqué sans
-- recours (traite_par_admin_id + statut permettent l'intervention à
-- n'importe quelle étape).
-- RLS sans policy — comme les autres tables sécurité (citoyen_documents,
-- webauthn, remember tokens) : accès exclusivement service_role. Un citoyen
-- en cours de récupération n'a par définition aucune session Supabase Auth
-- valide pour justifier une policy basée sur auth.uid().
CREATE TABLE citoyen_demandes_recuperation (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ancien_phone text NOT NULL,
  nouveau_phone text NOT NULL,
  prenom text NOT NULL,
  nom text NOT NULL,
  cin_document_url text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'approuve', 'refuse', 'applique', 'annule')),
  date_approbation timestamptz,
  date_activation_prevue timestamptz,
  annule_le timestamptz,
  traite_par_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  notes_admin text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE citoyen_demandes_recuperation ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- Application automatique après le délai de 48h — mirroring du pattern
-- déjà en place pour les rappels RDV (20260724000009_cron_rappels_rdv.sql),
-- en plus simple : pas d'Edge Function nécessaire, tout se passe en SQL.
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;

CREATE OR REPLACE FUNCTION appliquer_recuperations_dues() RETURNS void AS $$
BEGIN
  UPDATE users u
  SET phone = d.nouveau_phone
  FROM citoyen_demandes_recuperation d
  WHERE d.user_id = u.id
    AND d.statut = 'approuve'
    AND d.date_activation_prevue IS NOT NULL
    AND d.date_activation_prevue <= now()
    AND d.annule_le IS NULL;

  UPDATE citoyen_demandes_recuperation
  SET statut = 'applique'
  WHERE statut = 'approuve'
    AND date_activation_prevue IS NOT NULL
    AND date_activation_prevue <= now()
    AND annule_le IS NULL
    AND user_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

select cron.schedule(
  'yelen-recuperations-comptes',
  '*/15 * * * *',
  $$select appliquer_recuperations_dues();$$
);

-- Pour vérifier : select * from cron.job where jobname = 'yelen-recuperations-comptes';
-- Pour désactiver temporairement : select cron.unschedule('yelen-recuperations-comptes');
