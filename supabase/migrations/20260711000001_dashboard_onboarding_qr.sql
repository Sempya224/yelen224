-- Migration : onboarding dashboard + activation QR-code institution (11/07/2026)
ALTER TABLE institutions
  ADD COLUMN onboarding_dashboard_vu boolean NOT NULL DEFAULT false,
  ADD COLUMN qr_code_actif boolean NOT NULL DEFAULT false;