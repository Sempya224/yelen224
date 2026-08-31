-- Yelen Rewards — Phase 2, suite (décision CEO 22/08/2026) : active
-- demarche_completed (+10), déjà proposée en Phase 1 mais désactivée faute
-- de plafond anti-abus appliqué. Le plafond est maintenant enforced par
-- lib/rewardsEngine.ts::accorderPoints() (lecture de conditions.max_par_periode,
-- comptage réel sur reward_events — jamais un compteur dénormalisé).
-- Plafond fixé par Bryan à 5 démarches récompensées / 30 jours (la
-- proposition Phase 1 suggérait 3, chiffre confirmé à 5 le 22/08/2026).

UPDATE reward_rules
  SET actif = true,
      conditions = '{"max_par_periode": {"count": 5, "jours": 30}}'::jsonb,
      updated_at = now()
  WHERE code = 'demarche_completed';

-- Supporte la nouvelle requête de plafond (citoyen_id + event_type +
-- fenêtre de temps) exécutée à chaque accorderPoints() sur une règle à
-- conditions — l'index existant (citoyen_id seul) ne suffit plus une fois
-- ce chemin réellement emprunté.
CREATE INDEX IF NOT EXISTS reward_events_citoyen_event_created_idx
  ON reward_events (citoyen_id, event_type, created_at);
