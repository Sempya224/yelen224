-- Trusted Device / Device Enrollment (30/08/2026, brief CEO).
--
-- Réutilise citoyen_remember_tokens/institution_remember_tokens plutôt
-- que créer 2 tables parallèles (décision explicite de Bryan) : ces
-- tables portaient déjà token révocable/hashé/par appareil/métadonnées —
-- il ne leur manquait qu'un statut de confiance explicite (aujourd'hui,
-- l'existence d'une ligne ne distinguait pas "appareil approuvé" d'un
-- premier passage). Le "Trusted Device" du brief = ces tables + status.
--
-- Règle d'enrôlement (posée dans le code applicatif, pas ici) : le tout
-- premier appareil d'un compte devient 'trusted' immédiatement (rien à
-- comparer) ; tout appareil suivant démarre 'pending' (notification
-- immédiate, session tout de même accordée — décision Bryan 30/08/2026,
-- "notification + confirmation différée", pas un blocage dur).
--
-- device_type : catégorie large (mobile/tablette/web), pas un
-- fingerprint — jamais utilisé comme authentificateur à lui seul (brief
-- point 1), seulement une métadonnée d'affichage/contexte.

ALTER TABLE citoyen_remember_tokens
  ADD COLUMN status text NOT NULL DEFAULT 'trusted' CHECK (status IN ('pending', 'trusted', 'revoked')),
  ADD COLUMN device_type text,
  ADD COLUMN revoked_at timestamptz;

ALTER TABLE institution_remember_tokens
  ADD COLUMN status text NOT NULL DEFAULT 'trusted' CHECK (status IN ('pending', 'trusted', 'revoked')),
  ADD COLUMN device_type text,
  ADD COLUMN device_label text,
  ADD COLUMN ip text,
  ADD COLUMN last_used_at timestamptz,
  ADD COLUMN revoked_at timestamptz;

-- DEFAULT 'trusted' ci-dessus s'applique aux lignes déjà existantes
-- (comportement inchangé pour les appareils déjà mémorisés avant ce
-- chantier — ne pas les rétrograder en 'pending' rétroactivement, ce
-- serait une dégradation de service pour un utilisateur qui n'a rien
-- fait de suspect). Les nouvelles lignes créées par le code applicatif
-- passeront explicitement 'pending' quand un autre appareil trusted
-- existe déjà pour ce compte.
