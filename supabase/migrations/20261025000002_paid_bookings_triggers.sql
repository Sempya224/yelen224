-- paid_bookings : triggers de figement du montant et d'immuabilité (25/10/2026).
-- Migration CORRECTIVE de 20261025000001_paid_bookings_montant_reserve.sql, qui a
-- été appliquée partiellement en base (colonnes, calculer_montant_reservation et
-- REVOKE de table présents ; fonctions de trigger et triggers absents).
-- Ce fichier ne contient QUE les 3 fonctions de trigger, les 3 triggers et les
-- REVOKE EXECUTE. Il est idempotent (CREATE OR REPLACE, DROP TRIGGER IF EXISTS) :
-- on peut le rejouer sans effet de bord. Le fichier 20261025000001 n'est pas touché.
-- ⚠️ NON EXÉCUTÉE — à lancer par Bryan :
--   supabase db query --linked -f supabase/migrations/20261025000002_paid_bookings_triggers.sql -o table
-- Puis vérifier avec docs/security/VERIFICATION_MONTANT_RESERVATION.sql (parties A et B).
--
-- HYPOTHÈSE DOCUMENTÉE : la Guinée est en UTC+0 toute l'année et la base en UTC ;
-- current_date compare donc la date de la réservation à la date du jour guinéenne.
-- DATE_PASSEE s'applique à TOUS les rôles (aucune échappatoire).

BEGIN;

-- ─── 1. Neutralisation des champs d'état — appels applicatifs seulement ────
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

DROP TRIGGER IF EXISTS paid_bookings_1_neutraliser ON public.paid_bookings;
CREATE TRIGGER paid_bookings_1_neutraliser
  BEFORE INSERT ON public.paid_bookings
  FOR EACH ROW EXECUTE FUNCTION public.paid_bookings_neutraliser_champs_etat();

-- ─── 2. Contrôles + figement du montant — TOUS les rôles ───────────────────
-- SECURITY DEFINER (search_path fixé) : le SELECT ... FOR SHARE sur
-- paid_services exige un privilège que le citoyen n'a pas, et la lecture d'un
-- service suspendu / d'une institution non validée doit pouvoir distinguer
-- « introuvable » de « invisible par RLS ». FOR SHARE bloque un changement de
-- prix concurrent jusqu'à la fin de cette transaction : le montant figé est
-- toujours celui du prix en vigueur au moment de l'INSERT.
-- Codes d'erreur : SERVICE_INTROUVABLE · INSTITUTION_INDISPONIBLE · DATE_PASSEE
-- (+ DATES_INVALIDES / PRIX_INVALIDE levés par calculer_montant_reservation).
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

  IF NEW.date_rdv < current_date THEN
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

DROP TRIGGER IF EXISTS paid_bookings_2_figer_montant ON public.paid_bookings;
CREATE TRIGGER paid_bookings_2_figer_montant
  BEFORE INSERT ON public.paid_bookings
  FOR EACH ROW EXECUTE FUNCTION public.paid_bookings_figer_montant();

-- ─── 3. Immuabilité des 3 colonnes ─────────────────────────────────────────
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

DROP TRIGGER IF EXISTS paid_bookings_montant_reserve_immuable ON public.paid_bookings;
CREATE TRIGGER paid_bookings_montant_reserve_immuable
  BEFORE UPDATE OF prix_unitaire_reserve, nuits, montant_total_reserve ON public.paid_bookings
  FOR EACH ROW
  WHEN (OLD.prix_unitaire_reserve IS DISTINCT FROM NEW.prix_unitaire_reserve
     OR OLD.nuits IS DISTINCT FROM NEW.nuits
     OR OLD.montant_total_reserve IS DISTINCT FROM NEW.montant_total_reserve)
  EXECUTE FUNCTION public.paid_bookings_montant_reserve_immuable();

-- ─── 4. EXECUTE : aucun appelant n'a besoin de lancer ces fonctions ────────
-- Les privilèges par défaut de Supabase donnent EXECUTE à anon et authenticated :
-- REVOKE FROM PUBLIC ne suffit pas, il faut les nommer.
REVOKE ALL ON FUNCTION public.calculer_montant_reservation(numeric, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_bookings_neutraliser_champs_etat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_bookings_figer_montant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paid_bookings_montant_reserve_immuable() FROM PUBLIC, anon, authenticated;

COMMIT;
