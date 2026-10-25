-- Lot B — complément (18/10/2026). La migration 20261018000009 couvrait
-- les décisions produit d'origine (sanctions/fraude, document_events,
-- finances, avis/rdv), mais les tests réels en base ont révélé 3 chaînes
-- supplémentaires où une table immuable ou une contrainte RESTRICT bloque
-- la cascade users -> X déjà en place, pour n'importe quel citoyen ayant
-- la moindre activité dans ces systèmes :
--
--   1. points_transactions (ledger de récompenses, immuable — "chaque
--      mouvement est une ligne, jamais modifié directement") : CASCADE
--      + trigger d'immuabilité = la suppression échoue dès qu'un citoyen
--      a gagné/dépensé des points. reward_events doit être corrigé EN
--      MÊME TEMPS : points_transactions.reward_event_id est RESTRICT vers
--      reward_events, donc corriger points_transactions seul laisse
--      reward_events bloqué à son tour par cette même ligne survivante.
--   2. support_tickets : support_ticket_events.ticket_id est RESTRICT
--      (table immuable, même famille que document_events) — la cascade
--      échoue dès qu'un citoyen a ouvert un ticket support.
--   3. document_events.document_id (RESTRICT vers citoyen_documents,
--      NOT NULL) : citoyen_documents.citoyen_id reste CASCADE (décision
--      explicite, 18/10/2026 — le document réel, pas seulement sa
--      métadonnée, ne doit pas être conservé indéfiniment après une
--      demande de suppression ; "on ne conserve pas tout, seulement le
--      nécessaire selon la loi" — seul l'événement d'audit doit survivre,
--      jamais le document lui-même ni son URL Storage).
--
-- Vérifié exhaustivement après ces 3 correctifs via une requête croisant
-- tous les CASCADE depuis users avec tout RESTRICT/NO ACTION qui s'y
-- oppose : plus aucune chaîne non traitée. Seul paid_bookings reste
-- bloqué par recus/factures (RESTRICT sur paid_booking_id) — sans danger,
-- notre propre trigger (20261018000009) bloque déjà la suppression avant
-- d'atteindre ce cas pour tout paid_booking financièrement significatif ;
-- ce RESTRICT résiduel ne protège qu'un cas limite d'incohérence de
-- données (statut annulé/en_attente avec un reçu resté par erreur), et
-- échouer dans ce cas est le comportement voulu.

ALTER TABLE points_transactions ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE points_transactions DROP CONSTRAINT points_transactions_citoyen_id_fkey;
ALTER TABLE points_transactions
  ADD CONSTRAINT points_transactions_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reward_events ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE reward_events DROP CONSTRAINT reward_events_citoyen_id_fkey;
ALTER TABLE reward_events
  ADD CONSTRAINT reward_events_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE support_tickets ALTER COLUMN citoyen_id DROP NOT NULL;
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_citoyen_id_fkey;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_citoyen_id_fkey
  FOREIGN KEY (citoyen_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE document_events ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE document_events DROP CONSTRAINT document_events_document_id_fkey;
ALTER TABLE document_events
  ADD CONSTRAINT document_events_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES citoyen_documents(id) ON DELETE SET NULL;

-- Conséquence pour le code (pas cette migration) : la future route de
-- suppression devra poser, dans la MÊME transaction que le DELETE :
--   SET LOCAL app.autoriser_correction_points = 'on';
--   SET LOCAL app.autoriser_correction_document = 'on';
-- (support_ticket_events n'a pas besoin de son échappatoire
-- app.autoriser_correction_support : son blocage venait d'une contrainte
-- FK directe sur support_tickets, jamais d'une tentative de modifier
-- support_ticket_events elle-même.)
