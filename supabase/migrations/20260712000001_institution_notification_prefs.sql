-- Migration : préférences de notifications institution (12/07/2026)
-- Rien n'existait jusqu'ici (aucune colonne/table) : lib/notifications.ts envoie tous les
-- événements sans condition. jsonb plutôt que colonnes plates, cohérent avec
-- institutions.langue/disponibilites/horaires déjà en jsonb — évite une migration à chaque
-- nouvelle catégorie/canal. email/sms restent à false et non modifiables tant qu'aucun
-- provider n'est branché (aucune infra email/SMS dans le code à ce jour) — affichés
-- "Bientôt disponible" côté UI. rdv_depasse est volontairement absent : alerte
-- opérationnelle critique, toujours envoyée, non désactivable.
CREATE TABLE institution_notification_prefs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{
    "confirmation":  {"inapp": true, "email": false, "sms": false},
    "rappels":       {"inapp": true, "email": false, "sms": false},
    "annulation_report": {"inapp": true, "email": false, "sms": false},
    "rdv_termine":   {"inapp": true, "email": false, "sms": false}
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE institution_notification_prefs ENABLE ROW LEVEL SECURITY;
