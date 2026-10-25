-- Correctif RLS messages (Mission 01 audit, 18/10/2026) — la policy
-- messages_citoyen_own (créée hors migration versionnée, confirmée en
-- base par pg_policy le 18/10/2026) était FOR ALL avec un USING en OR
-- (auth.uid() = destinataire_citoyen_id OR auth.uid() = expediteur_citoyen_id)
-- et aucun WITH CHECK séparé — sans WITH CHECK, Postgres réutilise le
-- USING pour valider les écritures. Même piège déjà documenté et corrigé
-- une fois sur `notifications` (CLAUDE.md /pieges-techniques-connus),
-- pas reproduit ici avant cet audit.
--
-- Schéma réel confirmé par SELECT sur information_schema.columns
-- (18/10/2026) : messages a 4 colonnes d'identité, toutes nullable —
-- expediteur_citoyen_id, expediteur_institution_id,
-- destinataire_citoyen_id, destinataire_institution_id. L'ancienne
-- policy ne regardait jamais les deux colonnes institution.
-- Conséquence : un citoyen authentifié pouvait INSERT une ligne avec
-- destinataire_citoyen_id = lui-même et expediteur_institution_id =
-- n'importe quel UUID d'institution (jamais vérifié), fabriquant un
-- message qui semble provenir de cette institution dans sa propre
-- boîte. Portée confirmée limitée à l'auto-forgerie — impossible
-- d'atteindre la boîte d'un AUTRE citoyen, le OR exige que
-- l'appelant soit déjà une des deux parties côté citoyen. Intégrité/
-- traçabilité (preuve fabriquée exploitable dans un litige/signalement),
-- pas une fuite vers un tiers.
--
-- Usages client réels inventoriés avant d'écrire cette policy
-- (lib/messagerie.ts, seul point d'écriture côté citoyen, aucune route
-- API dédiée — voir son en-tête de fichier) :
--   - sendMessage / sendMessageRdv (INSERT) : toujours
--     expediteur_citoyen_id = citoyenId, destinataire_institution_id =
--     institutionId, jamais expediteur_institution_id ni
--     destinataire_citoyen_id.
--   - markThreadRead / markThreadReadRdv (UPDATE) : toujours sur des
--     lignes où destinataire_citoyen_id = citoyenId, ne modifie que `lu`.
--   - Aucun .delete() trouvé sur cette table côté citoyen (grep
--     exhaustif sur app/ et lib/) — la capacité de suppression disparaît
--     avec ce correctif (RLS actif sans policy DELETE = refus par
--     défaut, même convention que les autres tables de ce projet),
--     aucune régression connue.
--
-- Remplace l'unique policy FOR ALL par 3 policies explicites, une par
-- commande réellement utilisée.

DROP POLICY IF EXISTS messages_citoyen_own ON messages;

-- Lecture : un citoyen voit les messages où il est une des deux parties
-- côté citoyen — comportement inchangé par rapport à l'ancien USING, le
-- risque de forgerie ne concernait jamais le SELECT (pas de WITH CHECK
-- associé à cette commande).
DROP POLICY IF EXISTS messages_citoyen_select ON messages;
CREATE POLICY messages_citoyen_select ON messages
  FOR SELECT TO authenticated
  USING (
    auth.uid() = expediteur_citoyen_id
    OR auth.uid() = destinataire_citoyen_id
  );

-- Écriture citoyen → institution uniquement : pin la forme réelle de la
-- relation (jamais de destinataire_citoyen_id, jamais
-- d'expediteur_institution_id) en plus de l'identité de l'expéditeur.
DROP POLICY IF EXISTS messages_citoyen_insert ON messages;
CREATE POLICY messages_citoyen_insert ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = expediteur_citoyen_id
    AND expediteur_institution_id IS NULL
    AND destinataire_citoyen_id IS NULL
    AND destinataire_institution_id IS NOT NULL
  );

-- Mise à jour : uniquement pour marquer "lu" un message reçu d'une
-- institution (seul usage réel ci-dessus). USING borne les lignes
-- ciblables à celles où le citoyen est déjà le destinataire légitime ;
-- WITH CHECK pin la même forme de relation que l'INSERT pour empêcher
-- qu'une mise à jour transforme un message reçu en message envoyé ou
-- fasse disparaître son institution d'origine.
-- Limite assumée : ceci ne garantit pas l'immuabilité colonne par
-- colonne de expediteur_institution_id (un citoyen peut toujours faire
-- pointer un message déjà reçu vers UNE AUTRE institution que celle qui
-- l'a réellement envoyé, tant que la forme générale reste "institution
-- -> citoyen") — une immuabilité complète nécessiterait un trigger
-- BEFORE UPDATE comparant OLD/NEW, hors scope de ce lot. À envisager
-- séparément si une trouvaille future l'exige.
DROP POLICY IF EXISTS messages_citoyen_update ON messages;
CREATE POLICY messages_citoyen_update ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = destinataire_citoyen_id)
  WITH CHECK (
    auth.uid() = destinataire_citoyen_id
    AND expediteur_institution_id IS NOT NULL
    AND expediteur_citoyen_id IS NULL
    AND destinataire_institution_id IS NULL
  );
