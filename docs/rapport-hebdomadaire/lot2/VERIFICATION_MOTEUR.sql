-- Rapport hebdomadaire — Lot 2, étape 1 : comparaison du moteur à du SQL
-- INDÉPENDANT, sur l'établissement à 25 RDV (c8f35698-…, 25 RDV sur 90 j).
-- LECTURE SEULE. À exécuter par Bryan dans le SQL Editor (une requête à la
-- fois). Aucune modification de données.
--
-- Les règles sont réimplémentées ici en SQL, sans réutiliser le code
-- TypeScript : un écart entre les deux implémentations est un signal à
-- investiguer, pas à "corriger" en base. Toutes les bornes sont en UTC.
--
-- Procédure :
--   1. Exécuter 0 (colonnes de avis), puis A, A2 : copier les résultats.
--   2. Exécuter B : enregistrer la cellule JSON dans un fichier local
--      (ex. C:\Users\Balde224\entree-rapport.json). Contient des UUID de
--      citoyens mais aucun nom/téléphone ; ne pas le commiter.
--   3. Claude lance le moteur :
--        $env:RAPPORT_HEBDO_ENTREE="C:\Users\Balde224\entree-rapport.json"
--        npx vitest run lib/rapportHebdo.reel.test.ts
--      et compare ligne à ligne avec A / A2.
-- Remplacer l'UUID ci-dessous pour un autre établissement.

-- ─── 0. Colonnes réelles de avis (à confirmer avant B) ────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'avis'
ORDER BY ordinal_position;

-- ─── A. Indicateurs RDV gratuits par semaine complète (UTC) ───────────────
WITH params AS (
  SELECT 'c8f35698-225d-4d5f-bd0f-346eda714d24'::uuid AS inst
),
ev AS (
  SELECT e.rdv_id,
         bool_or(e.action = 'annulation' AND e.auteur_type = 'system') AS evt_sys,
         min(e.created_at) FILTER (WHERE e.action = 'annulation' AND e.auteur_type = 'system') AS evt_sys_le,
         bool_or(e.action = 'confirmation' OR e.ancien_statut = 'en_attente') AS evt_accepte
  FROM rdv_events e
  GROUP BY e.rdv_id
),
base AS (
  SELECT r.id, r.citoyen_id, r.date_rdv, r.statut, r.presence_status, r.created_at,
         r.accepte_le, r.non_traite_marque_le,
         ((r.date_rdv + r.heure_rdv) AT TIME ZONE 'UTC') AS rdv_le,
         COALESCE(ev.evt_sys, false) AS evt_sys, ev.evt_sys_le,
         (r.accepte_le IS NOT NULL OR COALESCE(ev.evt_accepte, false)) AS accepte,
         min(r.date_rdv) FILTER (WHERE r.statut = 'termine') OVER (PARTITION BY r.citoyen_id) AS premiere_termine
  FROM rdv r
  CROSS JOIN params
  LEFT JOIN ev ON ev.rdv_id = r.id
  WHERE r.institution_id = params.inst
),
cls AS (
  SELECT b.*,
    CASE
      WHEN b.statut = 'termine' THEN 'realise'
      WHEN b.statut = 'annule' AND b.evt_sys AND b.evt_sys_le < b.rdv_le THEN 'suspension'
      WHEN b.presence_status = 'absent' THEN 'absence'
      WHEN b.statut = 'annule' AND b.evt_sys THEN
        CASE WHEN b.non_traite_marque_le IS NOT NULL THEN 'non_traite_ecrase' ELSE 'ecrasement_non_qualifie' END
      WHEN b.statut = 'annule' THEN 'annulation'
      ELSE 'autre'
    END AS issue
  FROM base b
),
semaines AS (
  SELECT d::date AS lundi,
         (d AT TIME ZONE 'UTC') AS deb,
         ((d + interval '7 days') AT TIME ZONE 'UTC') AS fin
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'UTC') - interval '26 weeks',
    date_trunc('week', now() AT TIME ZONE 'UTC') - interval '7 days',
    interval '7 days') AS d
)
SELECT s.lundi,
  count(*) FILTER (WHERE c.created_at >= s.deb AND c.created_at < s.fin) AS demandes,
  count(*) FILTER (WHERE c.accepte_le >= s.deb AND c.accepte_le < s.fin) AS acceptees,
  count(*) FILTER (WHERE c.issue = 'realise' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6) AS realisees,
  count(*) FILTER (WHERE c.issue = 'annulation' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6) AS annulations,
  count(*) FILTER (WHERE c.issue = 'suspension' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6) AS suspension,
  count(*) FILTER (WHERE c.issue = 'absence' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6) AS absences,
  count(*) FILTER (WHERE c.non_traite_marque_le >= s.deb AND c.non_traite_marque_le < s.fin) AS non_traites,
  count(*) FILTER (WHERE c.issue = 'ecrasement_non_qualifie' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6) AS ecrasements_nq,
  count(*) FILTER (WHERE c.date_rdv BETWEEN s.lundi AND s.lundi + 6 AND c.rdv_le <= now()
                     AND c.issue <> 'suspension' AND (c.accepte OR c.issue IN ('realise', 'absence'))) AS base_realisation,
  count(*) FILTER (WHERE c.date_rdv BETWEEN s.lundi AND s.lundi + 6 AND c.issue <> 'suspension') AS base_annulation,
  count(DISTINCT c.citoyen_id) FILTER (WHERE c.issue = 'realise' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6) AS clients_servis,
  count(DISTINCT c.citoyen_id) FILTER (WHERE c.issue = 'realise' AND c.date_rdv BETWEEN s.lundi AND s.lundi + 6
                                         AND c.premiere_termine >= s.lundi) AS nouveaux
FROM semaines s
LEFT JOIN cls c ON true
GROUP BY s.lundi
HAVING count(*) FILTER (WHERE c.created_at >= s.deb AND c.created_at < s.fin) > 0
    OR count(*) FILTER (WHERE c.date_rdv BETWEEN s.lundi AND s.lundi + 6) > 0
    OR count(*) FILTER (WHERE c.non_traite_marque_le >= s.deb AND c.non_traite_marque_le < s.fin) > 0
ORDER BY s.lundi;

-- ─── A2. Réservations payantes par semaine complète (UTC) ─────────────────
-- Même établissement ; si aucune ligne, choisir un établissement ayant des
-- paid_bookings (SELECT institution_id, count(*) FROM paid_bookings GROUP BY 1).
WITH params AS (
  SELECT 'c8f35698-225d-4d5f-bd0f-346eda714d24'::uuid AS inst
),
semaines AS (
  SELECT d::date AS lundi,
         (d AT TIME ZONE 'UTC') AS deb,
         ((d + interval '7 days') AT TIME ZONE 'UTC') AS fin
  FROM generate_series(
    date_trunc('week', now() AT TIME ZONE 'UTC') - interval '26 weeks',
    date_trunc('week', now() AT TIME ZONE 'UTC') - interval '7 days',
    interval '7 days') AS d
)
SELECT s.lundi,
  count(*) FILTER (WHERE pb.created_at >= s.deb AND pb.created_at < s.fin) AS reservations_payantes,
  COALESCE(sum(pb.montant_paye) FILTER (WHERE pb.statut IN ('confirme', 'termine') AND pb.montant_paye IS NOT NULL
             AND COALESCE(pb.traite_le, pb.created_at) >= s.deb AND COALESCE(pb.traite_le, pb.created_at) < s.fin), 0) AS encaisse,
  count(*) FILTER (WHERE pb.statut IN ('confirme', 'termine') AND pb.montant_paye IS NOT NULL
             AND COALESCE(pb.traite_le, pb.created_at) >= s.deb AND COALESCE(pb.traite_le, pb.created_at) < s.fin) AS nb_encaisse
FROM semaines s
CROSS JOIN params
LEFT JOIN paid_bookings pb ON pb.institution_id = params.inst
GROUP BY s.lundi
HAVING count(*) FILTER (WHERE pb.created_at >= s.deb AND pb.created_at < s.fin) > 0
    OR count(*) FILTER (WHERE pb.statut IN ('confirme', 'termine') AND pb.montant_paye IS NOT NULL
             AND COALESCE(pb.traite_le, pb.created_at) >= s.deb AND COALESCE(pb.traite_le, pb.created_at) < s.fin) > 0
ORDER BY s.lundi;

-- ─── B. Export JSON des lignes brutes (entrée du moteur) ──────────────────
-- Une seule cellule `entree`. Pas de nom, prénom ni téléphone.
WITH params AS (
  SELECT 'c8f35698-225d-4d5f-bd0f-346eda714d24'::uuid AS inst
)
SELECT jsonb_build_object(
  'rdv', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'citoyen_id', r.citoyen_id, 'date_rdv', r.date_rdv, 'heure_rdv', r.heure_rdv,
      'statut', r.statut, 'presence_status', r.presence_status, 'created_at', r.created_at,
      'accepte_le', r.accepte_le, 'non_traite_marque_le', r.non_traite_marque_le, 'annule_par', r.annule_par))
    FROM rdv r WHERE r.institution_id = (SELECT inst FROM params)), '[]'::jsonb),
  'evenements', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'rdv_id', e.rdv_id, 'action', e.action, 'auteur_type', e.auteur_type,
      'ancien_statut', e.ancien_statut, 'nouveau_statut', e.nouveau_statut, 'created_at', e.created_at))
    FROM rdv_events e JOIN rdv r ON r.id = e.rdv_id WHERE r.institution_id = (SELECT inst FROM params)), '[]'::jsonb),
  'paiements', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', pb.id, 'citoyen_id', pb.citoyen_id, 'statut', pb.statut, 'date_rdv', pb.date_rdv,
      'heure_rdv', pb.heure_rdv, 'created_at', pb.created_at, 'traite_le', pb.traite_le,
      'montant_paye', pb.montant_paye, 'montant_declare_citoyen', pb.montant_declare_citoyen,
      'declare_le', pb.declare_le, 'service_id', pb.service_id, 'service_nom', ps.nom))
    FROM paid_bookings pb LEFT JOIN paid_services ps ON ps.id = pb.service_id
    WHERE pb.institution_id = (SELECT inst FROM params)), '[]'::jsonb),
  'avis', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'note', a.note, 'created_at', a.created_at, 'masque', a.masque,
      'brouillon', a.brouillon, 'reponse_institution', a.reponse_institution))
    FROM avis a WHERE a.institution_id = (SELECT inst FROM params)), '[]'::jsonb)
) AS entree;
