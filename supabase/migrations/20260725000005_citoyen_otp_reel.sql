-- Durcissement OTP citoyen (retour Bryan 25/07/2026, faille de sécurité
-- prioritaire : "empêcher quelqu'un de se connecter juste avec le numéro").
-- Remplace la comparaison à une constante fixe ("123456", visible en clair
-- dans le code ET affichée à l'écran sur /inscription) par un vrai code à
-- usage unique, haché, expirant, stocké par citoyen. Architecture prête
-- pour un vrai envoi SMS (Nimba SMS déjà mentionné comme cible dans
-- lib/auth/constants.ts) — tant qu'aucun fournisseur n'est branché, le code
-- réellement stocké/vérifié est un code de secours défini par variable
-- d'environnement serveur (CITOYEN_OTP_FALLBACK), jamais committé.
ALTER TABLE users
  ADD COLUMN otp_code_hash text,
  ADD COLUMN otp_expires_at timestamptz;
