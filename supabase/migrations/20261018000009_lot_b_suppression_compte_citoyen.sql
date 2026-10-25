-- Lot B (18/10/2026) — Suppression de compte citoyen : la policy RLS
-- citoyen_own_profile (FOR ALL, USING auth.uid()=id, aucun WITH CHECK
-- séparé) autorisait un DELETE direct sur `users` sans aucune vérification
-- additionnelle — le flux officiel (OTP + PIN/TOTP, confirmation
-- "SUPPRIMER") fait de vraies vérifications serveur mais ne produit aucun
-- jeton : rien ne lie "identité vérifiée" à "autorisé à supprimer" au
-- moment du DELETE lui-même. Par ailleurs, 65 tables référencent users(id),
-- dont plusieurs en CASCADE alors qu'elles portent une obligation de
-- conservation (sanctions no-show, signalements de fraude, documents
-- financiers, audit documentaire) — un citoyen sanctionné pouvait effacer
-- sa sanction par auto-suppression puis se réinscrire au même numéro
-- (l'unicité à l'inscription est vérifiée sur users.phone, jamais sur
-- auth.users qui n'est qu'une coquille technique sans fonction réelle,
-- voir app/api/citoyen/auth/register/route.ts).
--
-- Décisions produit actées avant cette migration :
--   1. Sanctions/fraude : bloquer la suppression tant qu'une restriction
--      active ou un signalement de fraude pertinent existe (jamais un
--      SET NULL ici — ni citoyen_rdv_restrictions ni fraud_flags ne
--      stockent de copie du nom/téléphone, un SET NULL rendrait le dossier
--      orphelin et inexploitable).
--   2. document_events : préserver l'événement d'audit, détacher
--      uniquement la référence au citoyen (SET NULL).
--   3. Finances : recus déjà RESTRICT (citoyen_id ET paid_booking_id) ;
--      factures corrigée pour suivre exactement le même blindage double
--      (elle ne l'avait pas, incohérence trouvée pendant l'audit) ;
--      paid_bookings bloque aussi si un statut financièrement significatif
--      existe sans reçu/facture associé (couvre un bug historique de
--      génération de reçu déjà documenté dans ce projet).
--   4. avis/rdv : anonymiser (SET NULL), jamais supprimer — ce sont des
--      traces institutionnelles (avis publics avec réponse d'institution,
--      historique réel de rendez-vous), pas seulement des données
--      personnelles du citoyen.
--
-- La future route de suppression (code, hors de cette migration) devra :
--   - dériver l'identité exclusivement de verifierCitoyenToken(accessToken),
--     jamais d'un userId fourni par le client (service_role contourne RLS,
--     donc aucun filet de sécurité équivalent à auth.uid()=id une fois ce
--     chemin utilisé) ;
--   - revalider OTP + PIN/TOTP si configurés au moment même de l'opération,
--     pas seulement lors d'un aller-retour antérieur déconnecté du DELETE ;
--   - poser `SET LOCAL app.autoriser_correction_document = 'on';` dans la
--     MÊME transaction que le DELETE, sinon le trigger d'immuabilité de
--     document_events (BEFORE UPDATE OR DELETE, antérieur à cette
--     migration) rejette le SET NULL que la cascade FK déclenche en
--     interne, et la suppression échoue pour tout citoyen ayant un
--     historique documentaire.

-- ═══════════════════════════════════════════════════════════════
-- Composant 0 — Retrait de la capacité DELETE de la policy citoyen
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS citoyen_own_profile ON users;

CREATE POLICY citoyen_select ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY citoyen_update ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Aucune policy DELETE recréée : RLS actif sans policy = refus par défaut,
-- même convention que le reste du projet.

-- ═══════════════════════════════════════════════════════════════
-- Composant 1 — Blocage conditionnel : restriction active, fraude
-- pertinente, ou paiement conservé sans reçu/facture
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.users_bloquer_suppression_si_sanction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.citoyen_rdv_restrictions
    WHERE citoyen_id = OLD.id AND statut = 'active'
  ) THEN
    RAISE EXCEPTION 'SUPPRESSION_BLOQUEE_RESTRICTION_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fraud_flags
    WHERE citoyen_id = OLD.id
      AND (statut IN ('ouvert', 'en_cours') OR (statut = 'resolu' AND gravite = 'critique'))
  ) THEN
    RAISE EXCEPTION 'SUPPRESSION_BLOQUEE_FRAUDE_PERTINENTE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.paid_bookings
    WHERE citoyen_id = OLD.id
      AND statut IN ('confirme', 'termine', 'no_show', 'rembourse')
  ) THEN
    RAISE EXCEPTION 'SUPPRESSION_BLOQUEE_PAIEMENT_CONSERVE';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER users_bloquer_suppression_si_sanction_trigger
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_bloquer_suppression_si_sanction();

-- ═══════════════════════════════════════════════════════════════
-- Composant 2 — document_events : préserver l'événement, détacher le
-- citoyen. citoyen_id était NOT NULL (confirmé par lecture de la migration
-- de création 20260809000003) : DROP NOT NULL obligatoire avant le
-- changement de FK, sinon le SET NULL échouerait au moment réel d'une
-- suppression.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE document_events ALTER COLUMN citoyen_id DROP NOT NULL;

ALTER TABLE document_events DROP CONSTRAINT document_events_citoyen_id_fkey;
ALTER TABLE document_events
  ADD CONSTRAINT document_events_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- Composant 3 — factures : deux contraintes corrigées, pas une seule.
-- recus.paid_booking_id est déjà RESTRICT ("jamais de suppression
-- silencieuse d'une preuve de paiement via un ON DELETE CASCADE en amont",
-- 20260805000020) ; factures.paid_booking_id ne suivait pas cette règle
-- (CASCADE, confirmé par pg_get_constraintdef) — corriger seulement
-- citoyen_id aurait laissé un second chemin de suppression via
-- users->paid_bookings->factures contournant la protection.
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE factures DROP CONSTRAINT factures_citoyen_id_fkey;
ALTER TABLE factures
  ADD CONSTRAINT factures_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE factures DROP CONSTRAINT factures_paid_booking_id_fkey;
ALTER TABLE factures
  ADD CONSTRAINT factures_paid_booking_id_fkey
  FOREIGN KEY (paid_booking_id) REFERENCES paid_bookings(id) ON DELETE RESTRICT;

-- ═══════════════════════════════════════════════════════════════
-- Composant 4 — avis/rdv : anonymiser au lieu de supprimer. citoyen_id
-- confirmé NOT NULL sur les deux tables (information_schema.columns).
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE avis ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE avis DROP CONSTRAINT avis_citoyen_id_fkey;
ALTER TABLE avis
  ADD CONSTRAINT avis_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE rdv ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE rdv DROP CONSTRAINT rdv_citoyen_id_fkey;
ALTER TABLE rdv
  ADD CONSTRAINT rdv_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;
