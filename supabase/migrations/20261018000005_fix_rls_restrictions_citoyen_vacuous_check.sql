-- Correctif sécurité critique (18/10/2026) — les policies RLS INSERT sur
-- rdv/paid_bookings (migration 20260903000001, réécrites avec l'ajout
-- inactivité par 20261015000003, dernière version en vigueur) référencent
-- citoyen_rdv_restrictions/citoyen_inactivite_suspensions directement dans
-- un NOT EXISTS. Ces deux tables ont RLS activé SANS AUCUNE POLICY
-- (convention "service_role uniquement") — en Postgres, une table RLS sans
-- policy est invisible pour tout rôle non-propriétaire, y compris depuis
-- une sous-requête imbriquée dans la policy d'une AUTRE table. Le rôle
-- `authenticated` n'y voit donc jamais aucune ligne, le NOT EXISTS est
-- TOUJOURS vrai, et la restriction RLS n'a jamais réellement bloqué quoi
-- que ce soit — seule la vérification JS côté Server Action
-- (chargerRestrictionActive/chargerSuspensionInactiviteActive,
-- app/rdv/[id]/actions.ts, service_role donc voit correctement les
-- données) protégeait réellement, contournable par un appel RPC direct
-- avec le JWT d'un citoyen restreint/suspendu. Confirmé en SQL Editor par
-- Bryan le 18/10/2026 (`SET ROLE authenticated; SELECT * FROM
-- citoyen_rdv_restrictions;` → succès, 0 ligne, alors que des lignes
-- existent).
--
-- Correctif : fonctions SECURITY DEFINER renvoyant un simple booléen —
-- exécutées avec les privilèges du propriétaire (rôle de migration, qui
-- bypass RLS), donc voient réellement les données, sans jamais exposer les
-- lignes elles-mêmes à authenticated (aucune policy SELECT ajoutée, aucun
-- GRANT direct sur la table).
CREATE OR REPLACE FUNCTION public.citoyen_a_restriction_rdv_active(p_citoyen_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM citoyen_rdv_restrictions
    WHERE citoyen_id = p_citoyen_id AND statut = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.citoyen_a_restriction_rdv_active FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.citoyen_a_restriction_rdv_active(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.citoyen_a_suspension_inactivite_active(p_citoyen_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM citoyen_inactivite_suspensions
    WHERE citoyen_id = p_citoyen_id AND statut = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.citoyen_a_suspension_inactivite_active FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.citoyen_a_suspension_inactivite_active(uuid) TO authenticated;

-- Policies réécrites pour appeler les fonctions ci-dessus au lieu du
-- NOT EXISTS direct — comportement voulu strictement identique à
-- l'intention d'origine (20261015000003), mais qui fonctionne réellement
-- cette fois.
DROP POLICY IF EXISTS rdv_citoyen_insert ON rdv;
CREATE POLICY rdv_citoyen_insert ON rdv
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT public.citoyen_a_restriction_rdv_active(auth.uid())
    AND NOT public.citoyen_a_suspension_inactivite_active(auth.uid())
  );

DROP POLICY IF EXISTS paid_bookings_citoyen_insert ON paid_bookings;
CREATE POLICY paid_bookings_citoyen_insert ON paid_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = citoyen_id
    AND NOT public.citoyen_a_restriction_rdv_active(auth.uid())
    AND NOT public.citoyen_a_suspension_inactivite_active(auth.uid())
  );
