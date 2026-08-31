-- institutions.session_revoked_at (migration 20260830000001, GAP-04-04)
-- entièrement remplacée par la révocation par session individuelle
-- (institution_sessions, migration 20260830000007) — plus aucun code ne la
-- lit ni ne l'écrit (lib/institutionAuth.ts, deletion/request, pin/set,
-- securite/totp/disable, remember/revoke-all réécrits le 30/08/2026).
-- Colonne morte, supprimée pour éviter la dette (zéro donnée fantôme).
--
-- institution_sessions.is_active (migration 20260709000011) — dérivable de
-- revoked_at/expires_at, jamais lue nulle part (revue critique 30/08/2026) ;
-- creerSessionInstitution() (lib/institutionAuth.ts) ne l'écrit plus non
-- plus. Supprimée en même temps, même raisonnement.
--
-- ⚠️ ORDRE OBLIGATOIRE : ce fichier (000008) ne doit être exécuté qu'APRÈS
-- le déploiement du code qui l'accompagne. Le code actuellement en
-- production (avant ce chantier) lit encore institutions.session_revoked_at
-- et écrit encore institution_sessions.is_active à chaque connexion —
-- exécuter ce DROP avant que le nouveau code soit live casse toute
-- authentification institution en production (colonnes manquantes).
-- 20260830000007 (ajout de colonnes, nullable) est en revanche sans risque
-- à tout moment — pattern expand/contract standard.

ALTER TABLE institutions DROP COLUMN session_revoked_at;
ALTER TABLE institution_sessions DROP COLUMN is_active;
