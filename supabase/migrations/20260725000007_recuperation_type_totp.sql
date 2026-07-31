-- Étend la récupération de compte (20260725000006) au cas "2FA perdue" —
-- retour Bryan 25/07/2026 : un citoyen qui perd son téléphone (donc son
-- appli d'authentification) ET ses 8 codes de secours TOTP n'avait aucun
-- chemin admin pour être débloqué, même après une récupération de numéro
-- réussie (le mur TOTP restait actif). Réutilise exactement le même
-- gabarit (demande + vérification CIN + délai 48h + "forcer" admin) plutôt
-- que de construire un 2e système parallèle.
ALTER TABLE citoyen_demandes_recuperation
  ADD COLUMN type text NOT NULL DEFAULT 'numero' CHECK (type IN ('numero', 'totp'));

-- Remplace la fonction du cron : type='numero' change le téléphone comme
-- avant, type='totp' désactive la 2FA (même effet que
-- api/citoyen/securite/totp/disable, mais déclenché par l'admin après
-- vérification CIN plutôt que par le citoyen lui-même via un code TOTP
-- qu'il n'a justement plus).
CREATE OR REPLACE FUNCTION appliquer_recuperations_dues() RETURNS void AS $$
BEGIN
  UPDATE users u
  SET phone = d.nouveau_phone
  FROM citoyen_demandes_recuperation d
  WHERE d.user_id = u.id
    AND d.type = 'numero'
    AND d.statut = 'approuve'
    AND d.date_activation_prevue IS NOT NULL
    AND d.date_activation_prevue <= now()
    AND d.annule_le IS NULL;

  UPDATE users u
  SET totp_secret = NULL, totp_enabled = false, totp_backup_codes = NULL
  FROM citoyen_demandes_recuperation d
  WHERE d.user_id = u.id
    AND d.type = 'totp'
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
