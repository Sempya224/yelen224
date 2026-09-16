-- Chantier "Support Yelen institution" (06/09/2026, décision Bryan après
-- comparaison avec le citoyen : "côté institution ici c'est le plus
-- important aussi") — Lot A, schéma seul. Étend le ticketing existant
-- (20260904000001_support_tickets_core.sql, jusqu'ici citoyen uniquement)
-- pour accepter des tickets institution, plutôt que de continuer
-- séparément l'ancien modèle messages_yelen_institution_conversations
-- (qui reste en place pour l'instant, retiré seulement une fois la
-- bascule UI validée — décision explicite, pas dans ce lot).
--
-- support_tickets a désormais deux origines mutuellement exclusives :
-- citoyen_id OU institution_id, jamais les deux, jamais aucun des deux.

ALTER TABLE support_tickets ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE support_tickets ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_une_seule_origine
  CHECK ((citoyen_id IS NOT NULL) <> (institution_id IS NOT NULL));

CREATE INDEX support_tickets_institution_idx ON support_tickets (institution_id, cree_le DESC) WHERE institution_id IS NOT NULL;

-- Catégories institution ajoutées à la liste existante (citoyen inchangé) :
-- facturation/client/partenariat n'ont pas d'équivalent côté citoyen ;
-- compte/technique/securite/autre restent partagées (voir
-- lib/supportTicketsConstants.ts::SUPPORT_CATEGORIES_INSTITUTION pour le
-- sous-ensemble réellement proposé à la création côté institution — cette
-- contrainte n'autorise que la liste, ne décide pas laquelle chaque
-- audience utilise).
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_categorie_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_categorie_check
  CHECK (categorie IN (
    'compte','reservation','paiement','etablissement','securite','technique','autre',
    'facturation','client','partenariat'
  ));

-- support_ticket_messages / support_ticket_events : 'institution' ajouté
-- comme émetteur/acteur possible, distinct de 'citoyen' — une ligne de
-- ticket institution ne doit jamais être enregistrée comme si elle venait
-- d'un citoyen (donnée fausse, pas seulement un détail cosmétique).
ALTER TABLE support_ticket_messages DROP CONSTRAINT support_ticket_messages_expediteur_type_check;
ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_messages_expediteur_type_check
  CHECK (expediteur_type IN ('citoyen','agent','institution'));

ALTER TABLE support_ticket_events DROP CONSTRAINT support_ticket_events_acteur_type_check;
ALTER TABLE support_ticket_events ADD CONSTRAINT support_ticket_events_acteur_type_check
  CHECK (acteur_type IN ('citoyen','agent','system','institution'));
