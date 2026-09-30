-- Clock In Shift — géolocalisation validée (Phase 2 roadmap, voir
-- docs/product/YELEN_CLOCK_IN_ANALYSE_BENCHMARK_ROADMAP.md §5.6).
--
-- `attendance_logs.latitude/longitude` existent depuis le schéma d'origine
-- (20260805000007, "présentes dès maintenant pour ne pas nécessiter de
-- refonte") mais n'ont jamais été écrites — ce lot commence à les remplir.
-- `work_zones` : une zone géographique par institution (V1 — une seule
-- institution = un seul site, cohérent avec l'absence de multi-site
-- documentée dans l'audit). UNIQUE (institution_id) : upsert simple côté
-- route, jamais plusieurs zones à gérer pour une institution en V1.
--
-- Décision produit (Bryan, 21/09/2026) : hors-zone SIGNALE, ne bloque
-- JAMAIS le pointage — cohérent avec le principe déjà en place ailleurs
-- dans Yelen (zéro fermeture/blocage automatique sur un signal dérivé,
-- toujours une supervision humaine, voir reputationScore.ts). La
-- comparaison distance/rayon est calculée à la LECTURE (dashboard), pas
-- stockée sur attendance_logs — évite qu'une correction ultérieure du
-- rayon ou du centre ne rende une ancienne ligne incohérente avec son
-- statut hors-zone figé au moment de l'écriture.
CREATE TABLE work_zones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  rayon_metres integer NOT NULL DEFAULT 150,
  actif boolean NOT NULL DEFAULT true,
  membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id)
);

ALTER TABLE work_zones ENABLE ROW LEVEL SECURITY;
-- Aucune policy volontairement — accès exclusivement service_role, même
-- convention que le reste du module Clock In Shift.
