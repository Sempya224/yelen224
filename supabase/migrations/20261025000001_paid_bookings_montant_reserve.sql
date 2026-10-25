-- paid_bookings : montant figé à la RÉSERVATION + durcissement de l'INSERT
-- (ticket base du 25/10/2026, suite du Lot 1a API Services).
-- ⚠️ NON EXÉCUTÉE — à relire puis à exécuter par Bryan (SQL Editor). Vérifier
-- ensuite avec docs/security/VERIFICATION_MONTANT_RESERVATION.sql.
--
-- POURQUOI
-- 1) Jusqu'ici montant_paye n'était figé qu'à la déclaration de paiement : entre
--    la réservation et la déclaration, un changement de prix du service
--    modifiait ce que le citoyen devait. On fige maintenant, dans la même
--    transaction que l'INSERT, le prix unitaire, le nombre de nuits et le
--    montant total (colonnes NULLABLES : aucune ligne existante n'est
--    recalculée ni modifiée).
-- 2) Constat SQL du 25/10/2026 : `authenticated` a tous les privilèges de
--    table sur paid_bookings et la seule policy INSERT contrôle
--    citoyen_id = auth.uid() (+ restriction/suspension/pause). Un INSERT direct
--    (hors RPC) n'était donc pas contrôlé sur montant_paye, statut,
--    methode_paiement, declare_le, traite_le, service_id (actif / bonne
--    institution), ni sur la date. Les trois points de contrôle ci-dessous
--    ferment ce trou pour TOUS les chemins d'insertion (RPC comprises), sans
--    réécrire ni changer la signature des RPC reserver_creneau_rdv_payant /
--    reserver_chambre_hotel (pas de DROP FUNCTION, pas de surcharge).
--
-- CHEMINS D'ÉCRITURE DANS paid_bookings (inventaire du 25/10/2026)
--   INSERT : uniquement les 2 RPC, appelées avec la session du citoyen
--            (rôle authenticated) depuis app/rdv/[id]/actions.ts.
--   UPDATE : app/api/citoyen/paid-bookings/declarer-paiement, institution/
--            paid-bookings/valider (x2), institution/paiements (remboursement)
--            — tous en service_role ; fonction cron
--            institution_rdv_annuler_si_imminent_et_suspendue() — propriétaire.
--            Aucun UPDATE avec la session d'un citoyen (et aucune policy
--            UPDATE : la RLS le refuse déjà) → REVOKE UPDATE sans risque.
--   DELETE : aucun chemin applicatif (suppressions par cascade de clés
--            étrangères uniquement, non concernées par les privilèges).
--
-- HYPOTHÈSE DOCUMENTÉE : la Guinée est en UTC+0 toute l'année et la base en UTC ;
-- current_date compare donc la date de la réservation à la date du jour guinéenne.

BEGIN;

-- ─── 1. Colonnes (nullables) + contraintes ─────────────────────────────────
-- Rejouable : si les colonnes existent déjà (exécution partielle antérieure),
-- elles sont conservées telles quelles et le reste du script s'applique.
ALTER TABLE paid_bookings DROP CONSTRAINT IF EXISTS paid_bookings_montant_reserve_coherent;

ALTER TABLE paid_bookings
  ADD COLUMN IF NOT EXISTS prix_unitaire_reserve numeric NULL
    CHECK (prix_unitaire_reserve IS NULL OR prix_unitaire_reserve > 0),
  ADD COLUMN IF NOT EXISTS nuits integer NULL
    CHECK (nuits IS NULL OR nuits >= 1),
  ADD COLUMN IF NOT EXISTS montant_total_reserve numeric NULL
    CHECK (montant_total_reserve IS NULL OR montant_total_reserve > 0),
  -- Les trois colonnes vont ensemble : toutes NULL (ligne antérieure à cette
  -- migration, ou service gratuit), ou toutes renseignées et cohérentes.
  ADD CONSTRAINT paid_bookings_montant_reserve_coherent CHECK (
    (prix_unitaire_reserve IS NULL AND nuits IS NULL AND montant_total_reserve IS NULL)
    OR (prix_unitaire_reserve IS NOT NULL AND nuits IS NOT NULL
        AND montant_total_reserve = prix_unitaire_reserve * nuits)
  );

-- ─── 2. Règle de calcul — MÊME règle que lib/montantReservation.ts ────────
-- Jours calendaires (date - date), ×1 sans date de départ, erreur si
-- départ <= arrivée. Cas partagés : lib/montantReservation.cas.json.
CREATE OR REPLACE FUNCTION public.calculer_montant_reservation(
  p_prix numeric, p_date_rdv date, p_date_depart date
) RETURNS TABLE (o_nuits integer, o_montant numeric)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_prix IS NULL OR p_prix < 0 THEN
    RAISE EXCEPTION 'PRIX_INVALIDE';
  END IF;
  IF p_date_depart IS NULL THEN
    o_nuits := 1;
  ELSIF p_date_depart <= p_date_rdv THEN
    RAISE EXCEPTION 'DATES_INVALIDES';
  ELSE
    o_nuits := p_date_depart - p_date_rdv;
  END IF;
  o_montant := p_prix * o_nuits;
  RETURN NEXT;
END;
$$;

-- ─── 3a. Neutralisation des champs d'état — appels applicatifs seulement ───
-- SECURITY INVOKER (volontaire) : current_user vaut le rôle réel de l'appelant
-- ('authenticated' / 'anon' pour une session PostgREST de citoyen ; une
-- fonction SECURITY DEFINER masquerait ce rôle). service_role et postgres
-- gardent leurs valeurs (reprises de données, seeds, tests).
-- Nommé en "_1_" : les triggers BEFORE d'une même table s'exécutent par ordre
-- alphabétique de nom, celui-ci passe avant le calcul du montant.
CREATE OR REPLACE FUNCTION public.paid_bookings_neutraliser_champs_etat() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.statut := 'en_attente';
    NEW.montant_paye := NULL;
    NEW.methode_paiement := NULL;
    NEW.montant_declare_citoyen := NULL;
    NEW.declare_le := NULL;
    NEW.traite_le := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paid_bookings_1_neutraliser ON paid_bookings;
CREATE TRIGGER paid_bookings_1_neutraliser
  BEFORE INSERT ON paid_bookings
  FOR EACH ROW EXECUTE FUNCTION public.paid_bookings_neutraliser_champs_etat();

-- ─── 3b. Contrôles + figement du montant — TOUS les rôles ──────────────────
-- SECURITY DEFINER (search_path fixé) : le SELECT ... FOR SHARE sur
-- paid_services exige un privilège que le citoyen n'a pas, et la lecture d'un
-- service suspendu / d'une institution non validée doit pouvoir distinguer
-- « introuvable » de « invisible par RLS ». FOR SHARE bloque un changement de
-- prix concurrent jusqu'à la fin de cette transaction : le montant figé est
-- toujours celui du prix en vigueur au moment de l'INSERT.
-- Codes d'erreur (mappés côté app/rdv/[id]/actions.ts) :
--   SERVICE_INTROUVABLE · INSTITUTION_INDISPONIBLE · DATE_PASSEE
--   (+ DATES_INVALIDES / PRIX_INVALIDE levés par calculer_montant_reservation).
CREATE OR REPLACE FUNCTION public.paid_bookings_figer_montant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prix numeric;
  v_actif boolean;
  v_inst uuid;
  v_statut text;
  v_calc record;
BEGIN
  SELECT s.prix, s.is_active, s.institution_id
    INTO v_prix, v_actif, v_inst
    FROM paid_services s
   WHERE s.id = NEW.service_id
     FOR SHARE;
  IF NOT FOUND OR v_inst <> NEW.institution_id OR NOT v_actif THEN
    RAISE EXCEPTION 'SERVICE_INTROUVABLE';
  END IF;

  SELECT i.statut::text INTO v_statut FROM institutions i WHERE i.id = NEW.institution_id;
  IF v_statut IS DISTINCT FROM 'validee' THEN
    RAISE EXCEPTION 'INSTITUTION_INDISPONIBLE';
  END IF;

  -- Échappatoire pour une reprise de données historiques uniquement
  -- (SET LOCAL app.autoriser_reservation_date_passee = 'on' dans la même
  -- transaction) ; jamais utilisée par l'application.
  IF NEW.date_rdv < current_date
     AND coalesce(current_setting('app.autoriser_reservation_date_passee', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DATE_PASSEE';
  END IF;

  IF v_prix > 0 THEN
    SELECT * INTO v_calc FROM calculer_montant_reservation(v_prix, NEW.date_rdv, NEW.date_depart);
    NEW.prix_unitaire_reserve := v_prix;
    NEW.nuits := v_calc.o_nuits;
    NEW.montant_total_reserve := v_calc.o_montant;
  ELSE
    -- Service gratuit : aucun montant à figer (NULL, pas 0).
    NEW.prix_unitaire_reserve := NULL;
    NEW.nuits := NULL;
    NEW.montant_total_reserve := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paid_bookings_2_figer_montant ON paid_bookings;
CREATE TRIGGER paid_bookings_2_figer_montant
  BEFORE INSERT ON paid_bookings
  FOR EACH ROW EXECUTE FUNCTION public.paid_bookings_figer_montant();

-- ─── 4. Immuabilité des 3 colonnes ─────────────────────────────────────────
-- Même patron que journal_activite / recus / exports : bloque aussi
-- service_role et le SQL Editor. Bloque AUSSI le passage NULL -> valeur
-- (aucun recalcul d'une ancienne réservation sans décision explicite).
-- Échappatoire : dans la MÊME transaction,
--   SET LOCAL app.autoriser_correction_montant_reserve = 'on';
CREATE OR REPLACE FUNCTION public.paid_bookings_montant_reserve_immuable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_montant_reserve', true) = 'on' THEN
    RAISE WARNING 'paid_bookings % : montant réservé modifié par exception. À documenter par ailleurs.', OLD.id;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'MONTANT_RESERVE_IMMUABLE';
END;
$$;

DROP TRIGGER IF EXISTS paid_bookings_montant_reserve_immuable ON paid_bookings;
CREATE TRIGGER paid_bookings_montant_reserve_immuable
  BEFORE UPDATE OF prix_unitaire_reserve, nuits, montant_total_reserve ON paid_bookings
  FOR EACH ROW
  WHEN (OLD.prix_unitaire_reserve IS DISTINCT FROM NEW.prix_unitaire_reserve
     OR OLD.nuits IS DISTINCT FROM NEW.nuits
     OR OLD.montant_total_reserve IS DISTINCT FROM NEW.montant_total_reserve)
  EXECUTE FUNCTION public.paid_bookings_montant_reserve_immuable();

-- Fonctions de trigger / de calcul : aucun appelant n'a besoin de les lancer
-- directement (les privilèges par défaut de Supabase donnent EXECUTE à anon et
-- authenticated : à retirer explicitement, REVOKE FROM PUBLIC ne suffit pas).
REVOKE ALL ON FUNCTION public.calculer_montant_reservation(numeric, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_bookings_neutraliser_champs_etat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_bookings_figer_montant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_bookings_montant_reserve_immuable() FROM PUBLIC, anon, authenticated;

-- ─── 5. Privilèges de table ────────────────────────────────────────────────
-- anon : aucun accès (aucune policy ne lui en donnait de toute façon ; les
-- routes publiques utilisent service_role — vérifié le 25/10/2026).
-- authenticated : on conserve SELECT (historique du citoyen, policy
-- paid_bookings_citoyen_own) et INSERT (les RPC ne sont pas SECURITY DEFINER
-- et insèrent avec la session du citoyen). On retire UPDATE (aucun chemin
-- citoyen, cf. inventaire en tête de fichier), DELETE, TRUNCATE, TRIGGER,
-- REFERENCES.
REVOKE ALL ON TABLE public.paid_bookings FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.paid_bookings FROM authenticated;

COMMIT;
