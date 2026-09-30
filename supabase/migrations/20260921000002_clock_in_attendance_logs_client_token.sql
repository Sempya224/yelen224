-- Clock In Shift — offline + synchronisation idempotente (Phase 2 roadmap,
-- voir docs/product/YELEN_CLOCK_IN_ANALYSE_BENCHMARK_ROADMAP.md §5.5).
--
-- Portail employé : si le réseau tombe au moment d'un pointage, l'action est
-- mise en file locale (localStorage) côté navigateur puis rejouée à la
-- reconnexion. Sans identifiant stable, une même tentative rejouée deux fois
-- (ex. la requête a en réalité réussi côté serveur mais la réponse ne l'a
-- jamais atteint avant la coupure) créerait un doublon dans attendance_logs
-- — table par ailleurs immuable (20260805000007), donc un doublon inséré ne
-- pourrait plus jamais être corrigé qu'en passant par le mécanisme de
-- correction (nouvelle ligne compensatoire), pas idéal pour une simple
-- réémission réseau.
--
-- client_token : généré côté client (crypto.randomUUID()) UNE SEULE FOIS au
-- moment de la tentative initiale, réutilisé identique à chaque nouvelle
-- tentative de la même action tant qu'elle n'a pas été confirmée. La route
-- POST /api/clock/pointage vérifie ce token avant tout insert : s'il existe
-- déjà, renvoie le pointage existant au lieu d'en créer un second.
--
-- Nullable + UNIQUE (pas NOT NULL) : les pointages manuels/corrections créés
-- côté institution (app/api/institution/clock-in/corrections) n'ont pas de
-- client_token et n'en ont pas besoin — seul le portail employé génère ce
-- flux. Un index UNIQUE partiel (WHERE client_token IS NOT NULL) autorise
-- plusieurs NULL tout en garantissant l'unicité quand un token est fourni.
ALTER TABLE attendance_logs ADD COLUMN client_token text;

CREATE UNIQUE INDEX attendance_logs_client_token_idx
  ON attendance_logs (client_token) WHERE client_token IS NOT NULL;
