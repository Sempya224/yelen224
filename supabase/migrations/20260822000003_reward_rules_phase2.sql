-- Yelen Rewards — Phase 2 (décision CEO 22/08/2026, chantier "mécaniques
-- d'engagement utilitaire"). Élargit le robinet au-delà du seul RDV
-- (Phase 1, 26/07/2026) : profil complété et identité vérifiée (une seule
-- fois chacune, montants élevés pour donner de la valeur dès l'entrée sur
-- Yelen) + document envoyé (répétable, événementiel). Valeurs RDV
-- également relevées (ancien 15/-10 → nouveau 45/-30), même logique
-- 3:2 pénalité/récompense qu'en Phase 1, juste réévaluée à la hausse pour
-- mieux encourager la présence aux RDV.
--
-- demarche_completed (+10, déjà proposée en Phase 1) reste VOLONTAIREMENT
-- inactive ici — son plafond anti-abus documenté ("3 démarches
-- récompensées / 30 jours") n'est aujourd'hui appliqué nulle part dans
-- lib/rewardsEngine.ts (conditions jsonb jamais lu). À activer seulement
-- une fois ce plafond réellement implémenté, décision en attente de Bryan.

UPDATE reward_rules SET points_delta = 45, updated_at = now() WHERE code = 'rdv_complete';
UPDATE reward_rules SET points_delta = -30, updated_at = now() WHERE code = 'rdv_no_show';

INSERT INTO reward_rules (code, label, points_delta, actif, conditions, description) VALUES
  ('document_envoye', 'Document envoyé', 25, true,
   '{}'::jsonb,
   'Citoyen répond à une demande de document d''une institution en le téléversant (app/api/citoyen/documents/upload). Fréquence hors du contrôle du citoyen (la demande initiale vient toujours de l''institution) — pas de risque de farming identifié.'),
  ('profil_complete', 'Profil complété', 150, true,
   '{"champs_requis": ["prenom","nom","ville","date_naissance","sexe","nationalite","profession","adresse","email","photo_url"]}'::jsonb,
   'Une seule fois par citoyen (idempotence via source_id=citoyen_id) — tous les champs du profil renseignés (voir app/compte/informations-personnelles/actions.ts). Montant élevé volontaire : donner de la valeur réelle dès l''entrée sur Yelen (décision CEO 22/08/2026).'),
  ('identite_verifiee', 'Identité vérifiée', 500, true,
   '{}'::jsonb,
   'Une seule fois par citoyen (idempotence via source_id=citoyen_id) — soumission de la pièce d''identité (app/api/citoyen/verification-identite/upload). Plus gros montant du dispositif : action de confiance civile la plus stratégique pour Yelen, jamais reproductible.');
