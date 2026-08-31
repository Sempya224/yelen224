-- Bio "Yelen Community" (22/08/2026, retour Bryan : "juste pour Yelen
-- Community" — pas branché sur l'écran Informations personnelles).
-- Longueur bornée en base ET côté route API (app/api/citoyen/bio),
-- jamais une seule des deux.

ALTER TABLE users
  ADD COLUMN bio text
  CHECK (char_length(bio) <= 160);
