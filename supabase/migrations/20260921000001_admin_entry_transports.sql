-- Admin Entry Security V2 — correctif UX WebAuthn (21/09/2026). Le
-- credential_id seul, sans transports, ne donne au navigateur aucune
-- indication qu'il s'agit d'un authentificateur plateforme ('internal') —
-- Chrome/Edge affiche alors le sélecteur complet (QR/clé de sécurité) au
-- lieu de solliciter directement Windows Hello/Face ID. Colonne nullable :
-- les credentials déjà enregistrés avant ce correctif devront être
-- révoqués et ré-enregistrés pour bénéficier du transports hint.
ALTER TABLE admin_entry_webauthn_credentials ADD COLUMN transports text[];
