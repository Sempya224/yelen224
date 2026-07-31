-- Yelen Rewards — Phase 1, fichier 2/8.
--
-- reward_rules = config data-driven du moteur de points. Ajouter une
-- règle sur un type de condition déjà supporté par lib/rewardsEngine.ts =
-- une ligne insérée ici, jamais du code. `conditions` reste volontairement
-- un jsonb à champs fixes (pas un interpréteur d'expressions générique) —
-- même philosophie que lib/journalTaxonomie.ts (table de correspondance
-- simple, pas de mini-langage).
--
-- Seules rdv_complete (+15) et rdv_no_show (-10) sont les valeurs
-- explicitement données par le CEO — activées dès la Phase 1. Les autres
-- lignes sont des propositions documentées, laissées `actif=false` tant
-- que Bryan n'a pas validé les chiffres (voir plan Phase 1) ; aucun code
-- de la Phase 1 n'émet ces event_type, leur inactivité est donc sans
-- effet pratique aujourd'hui.
CREATE TABLE reward_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  points_delta integer NOT NULL,
  actif boolean NOT NULL DEFAULT true,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lecture publique : données de référence non sensibles (label/points),
-- utile pour un futur écran "Comment gagner des points" lu directement
-- côté client sans passer par l'API d'agrégation. Écriture exclusivement
-- service_role (aucune policy INSERT/UPDATE/DELETE).
ALTER TABLE reward_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_rules_lecture_publique ON reward_rules FOR SELECT USING (true);

INSERT INTO reward_rules (code, label, points_delta, actif, conditions, description) VALUES
  ('rdv_complete', 'Rendez-vous effectué', 15, true,
   '{"rdv_statut": "termine", "presence_status": "present"}'::jsonb,
   'Rendez-vous honoré, présence confirmée par scan QR côté institution (jamais un simple changement de statut sans preuve de présence).'),
  ('rdv_no_show', 'Rendez-vous manqué', -10, true,
   '{"presence_status": "absent"}'::jsonb,
   'Absence constatée et enregistrée explicitement par l''institution — jamais inférée du silence ou de l''écoulement du créneau.'),
  ('rdv_created', 'Rendez-vous créé', 0, false, '{}'::jsonb,
   'En réserve, non activé en Phase 1 : action gratuite/sans engagement, récompenser sa création serait gameable (créer-abandonner en boucle).'),
  ('rdv_cancelled_on_time_citoyen', 'Annulation à temps', 0, false, '{}'::jsonb,
   'En réserve, non activé en Phase 1 : ni faute ni mérite, valeur proposée à 0 à confirmer avec Bryan.'),
  ('rdv_cancelled_late_citoyen', 'Annulation tardive', -5, false, '{}'::jsonb,
   'Proposé (-5), non donné par le CEO — reste inactif tant que Bryan ne valide pas le chiffre.'),
  ('rdv_cancelled_institution_fault', 'Annulation institution (aucune pénalité)', 0, false, '{}'::jsonb,
   'En réserve, non activé en Phase 1 : dérivation par élimination via rdv_events (même technique que estAnnuleParInstitution() dans lib/reputationScore.ts) à construire en Phase 2.'),
  ('demarche_completed', 'Démarche complétée', 10, false,
   '{"max_par_periode": {"count": 3, "jours": 30}}'::jsonb,
   'Proposé (+10, plafonné 3/30 jours), non donné par le CEO — citoyen_demarches n''a pas d''état "abandonnée" et les étapes sont auto-déclarées/supprimables, donc positif uniquement si activé un jour.');
