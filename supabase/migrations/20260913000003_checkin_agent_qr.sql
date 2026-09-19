-- QR Agent (badge imprimé) pour YELEN Accueil — revirement produit
-- 13/09/2026 : le 1er accès doit être scan du badge PUIS PIN (le QR seul
-- ne suffit jamais, décision explicite de Bryan — "quelque chose que
-- l'agent possède" + "quelque chose qu'il connaît", jamais l'un sans
-- l'autre). Remplace l'écran "identifiant + PIN" de la V1 initiale.
--
-- Jamais le token en clair en base (même principe que users.pin_hash,
-- institutions.mot_de_passe_hash) : seul son hash SHA-256 est stocké,
-- recherche par égalité de hash déterministe (comparaison rapide,
-- suffisante ici car le token seul ne suffit jamais à s'authentifier —
-- le PIN reste requis après identification, voir app/api/checkin/auth).
ALTER TABLE institution_membres
  ADD COLUMN checkin_qr_hash text,
  ADD COLUMN checkin_qr_generated_at timestamptz,
  ADD COLUMN checkin_qr_revoked_at timestamptz,
  ADD COLUMN checkin_qr_revoked_reason text;

CREATE UNIQUE INDEX idx_institution_membres_checkin_qr_hash ON institution_membres(checkin_qr_hash) WHERE checkin_qr_hash IS NOT NULL;
