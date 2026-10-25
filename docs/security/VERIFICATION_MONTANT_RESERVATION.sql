-- Vérification de la migration 20261025000001_paid_bookings_montant_reserve.sql
-- À exécuter par Bryan dans le SQL Editor APRÈS la migration. Deux parties,
-- à lancer séparément. Aucune donnée n'est conservée : la partie B s'annule
-- elle-même (ROLLBACK volontaire) et la partie A est en lecture seule.
--
-- Les cas de la partie A sont ceux de lib/montantReservation.cas.json (même
-- règle que lib/montantReservation.ts). Un test vitest
-- (lib/montantReservation.test.ts) vérifie que chaque ligne `-- cas:` ci-dessous
-- correspond bien au JSON : si l'un des deux change, l'autre doit suivre.

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE A — calcul SQL = calcul TypeScript (lecture seule)
-- Attendu : aucune ligne avec ok = false.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE FUNCTION pg_temp.verifier_calcul() RETURNS TABLE (id text, ok boolean, obtenu text, attendu text)
LANGUAGE plpgsql AS $$
DECLARE
  c record;
  v_n integer; v_m numeric; v_code text;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      -- cas: c01 | 150000 | 2026-08-06 | 2026-08-07 | 1 | 150000 | -
      ('c01', 150000::numeric, DATE '2026-08-06', DATE '2026-08-07', 1, 150000::numeric, NULL::text),
      -- cas: c02 | 150000 | 2026-08-06 | 2026-08-09 | 3 | 450000 | -
      ('c02', 150000::numeric, DATE '2026-08-06', DATE '2026-08-09', 3, 450000::numeric, NULL::text),
      -- cas: c03 | 5000 | 2026-08-06 | - | 1 | 5000 | -
      ('c03', 5000::numeric, DATE '2026-08-06', NULL::date, 1, 5000::numeric, NULL::text),
      -- cas: c04 | 0 | 2026-08-06 | 2026-08-08 | 2 | 0 | -
      ('c04', 0::numeric, DATE '2026-08-06', DATE '2026-08-08', 2, 0::numeric, NULL::text),
      -- cas: c05 | 1000 | 2026-08-06 | 2026-08-06 | - | - | DATES_INVALIDES
      ('c05', 1000::numeric, DATE '2026-08-06', DATE '2026-08-06', NULL::integer, NULL::numeric, 'DATES_INVALIDES'),
      -- cas: c06 | 1000 | 2026-08-06 | 2026-08-05 | - | - | DATES_INVALIDES
      ('c06', 1000::numeric, DATE '2026-08-06', DATE '2026-08-05', NULL::integer, NULL::numeric, 'DATES_INVALIDES'),
      -- cas: c07 | -1 | 2026-08-06 | - | - | - | PRIX_INVALIDE
      ('c07', (-1)::numeric, DATE '2026-08-06', NULL::date, NULL::integer, NULL::numeric, 'PRIX_INVALIDE'),
      -- cas: c08 | 1000 | 2026-03-28 | 2026-03-30 | 2 | 2000 | -
      ('c08', 1000::numeric, DATE '2026-03-28', DATE '2026-03-30', 2, 2000::numeric, NULL::text),
      -- cas: c09 | 1000 | 2026-12-30 | 2027-01-02 | 3 | 3000 | -
      ('c09', 1000::numeric, DATE '2026-12-30', DATE '2027-01-02', 3, 3000::numeric, NULL::text),
      -- cas: c10 | 1000 | 2028-02-28 | 2028-03-01 | 2 | 2000 | -
      ('c10', 1000::numeric, DATE '2028-02-28', DATE '2028-03-01', 2, 2000::numeric, NULL::text)
    ) AS t(id, prix, arrivee, depart, nuits_att, montant_att, code_att)
  LOOP
    v_n := NULL; v_m := NULL; v_code := NULL;
    BEGIN
      SELECT o_nuits, o_montant INTO v_n, v_m FROM public.calculer_montant_reservation(c.prix, c.arrivee, c.depart);
    EXCEPTION WHEN OTHERS THEN
      v_code := SQLERRM;
    END;
    id := c.id;
    obtenu := coalesce(v_code, v_n::text || ' nuit(s), ' || v_m::text);
    attendu := coalesce(c.code_att, c.nuits_att::text || ' nuit(s), ' || c.montant_att::text);
    ok := v_code IS NOT DISTINCT FROM c.code_att
          AND (v_code IS NOT NULL OR (v_n = c.nuits_att AND v_m = c.montant_att));
    RETURN NEXT;
  END LOOP;
END;
$$;
SELECT * FROM pg_temp.verifier_calcul();

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE B — rôles, contrôles, immuabilité, TRUNCATE (écrit puis ANNULE tout)
-- 1) Remplacez les 2 UUID ci-dessous : un service ACTIF d'une institution
--    VALIDÉE, et un citoyen quelconque (public.users.id).
-- 2) Exécutez le bloc DO en entier. Il se termine VOLONTAIREMENT par une erreur
--    « VERIFICATION OK … (annulé) » : c'est le succès — la transaction entière
--    est annulée, aucune ligne n'est conservée. Toute autre erreur = échec,
--    elle indique le test qui a échoué.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_service uuid := '00000000-0000-0000-0000-000000000000';  -- À REMPLACER
  v_citoyen uuid := '00000000-0000-0000-0000-000000000000';  -- À REMPLACER
  v_inst uuid;
  v_prix numeric;
  v_ligne paid_bookings%ROWTYPE;
  v_id uuid;
  v_ok boolean;
BEGIN
  SELECT institution_id, prix INTO v_inst, v_prix FROM paid_services WHERE id = v_service AND is_active;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Paramètres : service actif introuvable'; END IF;

  -- B1. Un citoyen (rôle authenticated) fournit des champs d'état et un faux
  --     montant : tout est neutralisé, le montant figé est celui du service.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_citoyen, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO paid_bookings (service_id, citoyen_id, institution_id, date_rdv, heure_rdv, confirmation_code,
                             statut, montant_paye, methode_paiement, montant_declare_citoyen, declare_le, traite_le)
  VALUES (v_service, v_citoyen, v_inst, current_date + 30, '10:00', 'VERIF1',
          'confirme', 1, 'especes', 1, now(), now())
  RETURNING * INTO v_ligne;
  RESET ROLE;
  IF v_ligne.statut::text <> 'en_attente' OR v_ligne.montant_paye IS NOT NULL OR v_ligne.methode_paiement IS NOT NULL
     OR v_ligne.montant_declare_citoyen IS NOT NULL OR v_ligne.declare_le IS NOT NULL OR v_ligne.traite_le IS NOT NULL THEN
    RAISE EXCEPTION 'B1 ÉCHEC : champs d''état d''un citoyen non neutralisés (%)', to_jsonb(v_ligne);
  END IF;
  IF v_ligne.montant_total_reserve IS DISTINCT FROM v_prix OR v_ligne.nuits <> 1 OR v_ligne.prix_unitaire_reserve <> v_prix THEN
    RAISE EXCEPTION 'B1 ÉCHEC : montant figé incorrect (%)', to_jsonb(v_ligne);
  END IF;
  v_id := v_ligne.id;

  -- B2. service_role garde ses valeurs (reprises, seeds, tests).
  SET LOCAL ROLE service_role;
  INSERT INTO paid_bookings (service_id, citoyen_id, institution_id, date_rdv, heure_rdv, confirmation_code, statut, montant_paye)
  VALUES (v_service, v_citoyen, v_inst, current_date + 31, '10:00', 'VERIF2', 'confirme', 123)
  RETURNING * INTO v_ligne;
  RESET ROLE;
  IF v_ligne.statut::text <> 'confirme' OR v_ligne.montant_paye <> 123 THEN
    RAISE EXCEPTION 'B2 ÉCHEC : service_role n''a pas conservé ses valeurs (%)', to_jsonb(v_ligne);
  END IF;
  IF v_ligne.montant_total_reserve IS DISTINCT FROM v_prix THEN
    RAISE EXCEPTION 'B2 ÉCHEC : montant figé non calculé pour service_role';
  END IF;

  -- B3. Date passée refusée pour tous les rôles.
  v_ok := false;
  BEGIN
    INSERT INTO paid_bookings (service_id, citoyen_id, institution_id, date_rdv, heure_rdv, confirmation_code)
    VALUES (v_service, v_citoyen, v_inst, current_date - 1, '10:00', 'VERIF3');
  EXCEPTION WHEN OTHERS THEN v_ok := (SQLERRM = 'DATE_PASSEE');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B3 ÉCHEC : DATE_PASSEE non levée'; END IF;

  -- B4. Autre institution / service inexistant refusés.
  v_ok := false;
  BEGIN
    INSERT INTO paid_bookings (service_id, citoyen_id, institution_id, date_rdv, heure_rdv, confirmation_code)
    VALUES (v_service, v_citoyen, gen_random_uuid(), current_date + 30, '10:00', 'VERIF4');
  EXCEPTION WHEN OTHERS THEN v_ok := (SQLERRM = 'SERVICE_INTROUVABLE');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B4 ÉCHEC : SERVICE_INTROUVABLE non levée (autre institution)'; END IF;

  -- B5. Service suspendu refusé (suspension annulée avec le reste).
  UPDATE paid_services SET is_active = false WHERE id = v_service;
  v_ok := false;
  BEGIN
    INSERT INTO paid_bookings (service_id, citoyen_id, institution_id, date_rdv, heure_rdv, confirmation_code)
    VALUES (v_service, v_citoyen, v_inst, current_date + 30, '10:00', 'VERIF5');
  EXCEPTION WHEN OTHERS THEN v_ok := (SQLERRM = 'SERVICE_INTROUVABLE');
  END;
  UPDATE paid_services SET is_active = true WHERE id = v_service;
  IF NOT v_ok THEN RAISE EXCEPTION 'B5 ÉCHEC : service suspendu accepté'; END IF;

  -- B6. Immuabilité des 3 colonnes (même pour postgres / service_role).
  v_ok := false;
  BEGIN
    UPDATE paid_bookings SET montant_total_reserve = montant_total_reserve + 1 WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN v_ok := (SQLERRM = 'MONTANT_RESERVE_IMMUABLE');
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B6 ÉCHEC : modification de montant_total_reserve acceptée'; END IF;

  -- B7. TRUNCATE / DELETE / UPDATE refusés au rôle authenticated.
  SET LOCAL ROLE authenticated;
  v_ok := false;
  BEGIN TRUNCATE paid_bookings; EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'B7 ÉCHEC : TRUNCATE accepté pour authenticated'; END IF;
  v_ok := false;
  BEGIN DELETE FROM paid_bookings WHERE id = v_id; EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'B7 ÉCHEC : DELETE accepté pour authenticated'; END IF;
  v_ok := false;
  BEGIN UPDATE paid_bookings SET statut = 'confirme' WHERE id = v_id; EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION 'B7 ÉCHEC : UPDATE accepté pour authenticated'; END IF;

  RAISE EXCEPTION 'VERIFICATION OK : B1 à B7 réussis (annulé volontairement, aucune donnée conservée)';
END;
$$;
