-- Chantier "Support Yelen" — écran d'attente citoyen (04/09/2026).
--
-- 20260904000001 avait délibérément laissé support_tickets/
-- support_ticket_messages en RLS activé + ZÉRO policy (statut contrôlé
-- serveur uniquement). Cette migration AJOUTE une policy de LECTURE SEULE
-- pour le citoyen propriétaire — même pattern que avis/rdv
-- (auth.uid() = citoyen_id, voir CLAUDE.md /securite) — dans le seul but de
-- permettre à Supabase Realtime de pousser les mises à jour de statut/
-- messages sans polling (brief section 13 : "le backend doit être temps
-- réel"). Aucune policy INSERT/UPDATE/DELETE n'est ajoutée : toute écriture
-- reste exclusivement via lib/supportTickets.ts (service_role), donc aucun
-- statut/priorité/agent ne peut être falsifié côté client — la garantie de
-- 000001 reste intacte, seule la lecture s'ouvre.
--
-- support_ticket_events reste RLS zéro policy (IP/user-agent, jamais
-- exposé au citoyen, voir le correctif équivalent sur document_events).

CREATE POLICY support_tickets_citoyen_lecture ON support_tickets
  FOR SELECT
  USING (auth.uid() = citoyen_id);

CREATE POLICY support_ticket_messages_citoyen_lecture ON support_ticket_messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = support_ticket_messages.ticket_id
      AND t.citoyen_id = auth.uid()
  ));
