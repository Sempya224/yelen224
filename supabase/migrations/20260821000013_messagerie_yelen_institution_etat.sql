-- Chantier Messagerie Lot 2 (21/08/2026, retour Bryan) — prise en charge et
-- fermeture des conversations institution↔Yelen. `messages_yelen_institution`
-- reste une table de messages plate, jamais fermée par elle-même (voir
-- 20260724000006) : cette nouvelle table porte l'ÉTAT de la conversation,
-- une ligne par institution, créée à la demande à la première action admin
-- (prise en charge/fermeture) — absence de ligne = état implicite
-- "nouvelle", jamais besoin de backfill préventif pour les institutions
-- sans historique.
--
-- Décisions produit tranchées avec Bryan avant cette migration :
-- 1. Une conversation fermée par un admin reste fermée même si l'institution
--    envoie un nouveau message — jamais de réouverture automatique, un admin
--    doit la rouvrir explicitement.
-- 2. Les conversations fermées disparaissent de la boîte de réception par
--    défaut (filtre "Fermées" séparé côté admin, hors périmètre de cette
--    migration — traité côté application).
-- 3. La prise en charge verrouille la conversation à l'admin qui l'a prise :
--    un autre admin ne peut plus y répondre tant qu'elle n'a pas été
--    relâchée ("Relâcher" remet pris_en_charge_par à NULL, statut
--    "nouvelle") — vérifié côté application (route API), pas en RLS (les
--    admins passent par JWT custom + service_role, pas de session Supabase
--    Auth).
--
-- ⚠️ SUPERSEDÉE par 20260821000014 (21/08/2026, même jour) : Bryan a
-- précisé après exécution de CETTE migration qu'une conversation fermée ne
-- doit jamais être réouvrable (un nouveau message doit ouvrir une
-- conversation neuve) — modèle une-ligne-par-institution incompatible,
-- remplacé par messages_yelen_institution_conversations (plusieurs
-- conversations possibles dans le temps). Fichier laissé tel quel
-- (n'édite jamais une migration déjà exécutée) : la table qu'il crée est
-- supprimée par la migration suivante après migration de ses données.

CREATE TABLE messages_yelen_institution_etat (
  institution_id uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  statut text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'prise_en_charge', 'fermee')),
  pris_en_charge_par uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  pris_en_charge_le timestamptz,
  fermee_par uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  fermee_le timestamptz,
  mis_a_jour_le timestamptz NOT NULL DEFAULT now(),
  CHECK (statut <> 'prise_en_charge' OR pris_en_charge_par IS NOT NULL),
  CHECK (statut <> 'fermee' OR fermee_par IS NOT NULL)
);

-- RLS activé sans policy — même convention que messages_yelen_institution
-- elle-même : ni l'institution (JWT custom) ni l'admin (JWT custom) n'ont de
-- session Supabase Auth, tout passe par service_role côté route API.
ALTER TABLE messages_yelen_institution_etat ENABLE ROW LEVEL SECURITY;

-- Backfill : les conversations déjà actives (au moins une réponse "yelen"
-- existante) ne doivent jamais se retrouver bloquées derrière l'écran
-- d'attente au déploiement de ce chantier — marquées "prise_en_charge" par
-- le dernier admin ayant répondu, jamais réinitialisées en "nouvelle" pour
-- de l'historique déjà traité humainement.
INSERT INTO messages_yelen_institution_etat (institution_id, statut, pris_en_charge_par, pris_en_charge_le)
SELECT DISTINCT ON (institution_id)
  institution_id, 'prise_en_charge', admin_id, cree_le
FROM messages_yelen_institution
WHERE expediteur = 'yelen' AND admin_id IS NOT NULL
ORDER BY institution_id, cree_le DESC
ON CONFLICT (institution_id) DO NOTHING;
