-- Contexte géographique des appareils de confiance (chantier "Limites
-- d'authentification et protection contre les abus", Priorité 5 validée
-- CEO le 18/10/2026 — scaffolding, "préparer" explicitement, pas un
-- step-up complet) — lib/auth/trustedDevice.ts ne savait dire que
-- "connu"/"nouveau", jamais si un appareil par ailleurs connu se connecte
-- soudain depuis un pays différent du dernier observé.
--
-- Colonnes nullable, renseignées au mieux (x-nf-geo, Netlify) — jamais
-- bloquant si absent (dev local, runtime non Netlify, même discipline
-- fail-open que lib/geoAccess.ts).
ALTER TABLE citoyen_remember_tokens
  ADD COLUMN last_country_code text,
  ADD COLUMN last_seen_at timestamptz;

ALTER TABLE institution_remember_tokens
  ADD COLUMN last_country_code text,
  ADD COLUMN last_seen_at timestamptz;
