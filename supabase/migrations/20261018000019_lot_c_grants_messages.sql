-- Lot C — Vague 2, table 5/9 (18-19/10/2026) : messages.
-- 3 policies réelles, toutes authenticated seul (aucune pour anon) :
-- messages_citoyen_insert (INSERT, citoyen -> institution uniquement),
-- messages_citoyen_select (SELECT, ses propres messages),
-- messages_citoyen_update (UPDATE, marquer lu uniquement, destinataire).
-- Vérifié par grep exhaustif du code (lib/messagerie.ts, écran mobile
-- "Mes RDV -> Messagerie établissements") : INSERT confirmé client-direct
-- (sendMessageRdv). Aucun UPDATE/DELETE client-direct trouvé — le
-- marquage "lu" côté citoyen n'est pas câblé en direct aujourd'hui (la
-- policy messages_citoyen_update existe mais n'a pas d'appelant trouvé) ;
-- gardé par prudence (SELECT, INSERT, UPDATE) plutôt que retiré, pour ne
-- pas présumer d'une absence totale d'usage sur un appel que je n'aurais
-- pas localisé. DELETE : aucune policy, aucun usage -> retiré.
REVOKE ALL ON TABLE messages FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE messages TO authenticated;
