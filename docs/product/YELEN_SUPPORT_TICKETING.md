# Yelen — Support Yelen (ticketing citoyen ↔ agent humain)

Chantier "Support Yelen", Lots A-C, **04/09/2026** (décision/brief CEO),
documenté a posteriori le 06/09/2026 — code et migrations déjà écrits mais
**jamais commités**, absents de `CLAUDE.md` et de `docs/` jusqu'à cette
fiche.

## 1. Objectif produit et principe non négociable

Remplacer la conversation permanente et jamais fermée `messages_yelen_citoyen`
par un vrai ticketing avec cycle de vie, pris en charge par un **agent
humain uniquement — zéro LLM** (instruction CEO explicite du brief,
cohérent avec la philosophie systématique du projet, voir CLAUDE.md
`/stack-specifique`).

**Portée de ce lot : citoyen uniquement.**
`messages_yelen_institution`/`messages_yelen_institution_conversations`
(système existant, déjà une state machine nouvelle/prise_en_charge/fermee)
restent **inchangés** — décision explicite de Bryan de ne pas doubler la
portée du Lot 1. `messages_yelen_citoyen` (ancienne table) sera abandonnée
une fois ce chantier stabilisé — **pas supprimée** par cette migration.

**Vocabulaire produit** : "ticket" reste une abstraction 100% interne
(backend + console `/admin/support`) — **jamais** ce mot, ni
"demande"/"formulaire"/"soumettre" côté citoyen, pour ne jamais donner
l'impression d'une démarche administrative. Le bouton citoyen s'appelle
"Parler au support" (voir `app/messagerie/citoyen/page.tsx`, commentaire
ligne ~18-22).

## 2. Modèle de données

Trois migrations : `20260904000001_support_tickets_core.sql`,
`20260904000002_support_tickets_citoyen_read_rls.sql`,
`20260904000003_support_ticket_ratings.sql`.

### `support_tickets`
`numero_public` (`YLN-{année}-{6 chiffres}`), `categorie` (`compte`/
`reservation`/`paiement`/`etablissement`/`securite`/`technique`/`autre`),
`priorite` (`basse`/`normale`/`haute`/`urgente` — **jamais choisie par le
citoyen**, dérivée de la catégorie : `securite`→`haute`, sinon `normale`,
voir `prioriteInitiale()`), `statut` (`attente_agent`/`en_cours`/`resolu`/
`cloture`), `assigned_agent_id`, `contexte_type`/`contexte_id` (polymorphe
optionnel : `rdv`/`paiement`/`document`, validité applicative uniquement,
pas de FK possible sur une table polymorphe). Contraintes CHECK imposant en
base la cohérence des transitions (`statut='en_cours'` ⇒
`assigned_agent_id` non NULL, `statut∈{resolu,cloture}` ⇒ `resolu_le` non
NULL, etc.).

**Simplification assumée par rapport au brief d'origine** : `ASSIGNED` et
`IN_PROGRESS` fusionnés en un seul statut `en_cours` — un agent qui clique
"Prendre en charge" peut immédiatement répondre, il n'existe pas de moment
réel où un ticket est assigné sans qu'un agent puisse déjà écrire.
`REOPENED` n'est pas un statut persistant : un message citoyen sur un
ticket résolu repasse directement à `attente_agent`, tracé comme
**événement** `reopened` dans `support_ticket_events`, pas comme un palier
d'état supplémentaire.

### `support_ticket_messages`
`expediteur_type` (`citoyen`/`agent`), `type` (`texte`/`image`), `lu`.
Contraintes CHECK : un message `agent` doit avoir un `agent_id`, un message
`texte` doit avoir un `contenu`, un message `image` doit avoir un
`image_url`.

### `support_ticket_events` — audit immuable
Même mécanisme que `signalement_events`/`document_events` : `audit_id`
séquentiel (`YL-SUP-{année}-{8 chiffres}`), trigger
`support_ticket_events_immuable` bloquant `UPDATE`/`DELETE` même pour
`service_role`, échappatoire dédiée
`SET LOCAL app.autoriser_correction_support = 'on'`. Types d'événement :
`created`/`assigned`/`message_sent`/`resolved`/`reopened`/`closed`.

### `support_ticket_ratings` (Lot C, fin de conversation)
Table séparée de `support_tickets.statut` (brief explicite : "ne pas
mélanger rating et statut de conversation"). `note` (1-5, CHECK),
`raisons` (`text[]`, deux listes selon note positive/négative — voir
`SUPPORT_RATING_RAISONS_POSITIVES`/`_NEGATIVES` dans
`lib/supportTicketsConstants.ts`), `commentaire`. **`UNIQUE` sur
`ticket_id`** — garde-fou base pour "une conversation ne peut être évaluée
qu'une fois", en plus du contrôle applicatif.

### RLS
Les 4 tables : RLS activé. `support_tickets`/`support_ticket_messages`
ajoutent en **000002** une policy **lecture seule** pour le citoyen
propriétaire (`auth.uid()=citoyen_id`) — but unique : permettre à Supabase
Realtime de pousser les mises à jour sans polling (brief : "le backend doit
être temps réel"). **Aucune policy `INSERT`/`UPDATE`/`DELETE`** — toute
écriture reste exclusivement via `lib/supportTickets.ts` (`service_role`),
aucun statut/priorité/agent n'est falsifiable côté client.
`support_ticket_events`/`support_ticket_ratings` restent **zéro policy**
(IP/UA jamais exposés au citoyen, même raisonnement que `document_events`).

## 3. Machine à états

`lib/supportTicketsConstants.ts::SUPPORT_TRANSITIONS` — légalité en code,
jamais en trigger DB (même principe que `SIGNALEMENT_TRANSITIONS`) :
```
attente_agent → en_cours
en_cours      → resolu
resolu        → cloture
cloture       → (rien)
```
`attente_agent` n'est atteignable depuis `resolu` **que** par la
réouverture (message citoyen sur un ticket résolu) — jamais une action
agent directe, d'où son absence du graphe : `envoyerMessageCitoyen()`
contourne volontairement ce graphe pour ce cas précis (même pattern que
`changerStatut(..., bypassTransitionCheck)` côté signalements).

## 4. `lib/supportTickets.ts` — seul point d'écriture

Comme `lib/signalements.ts` pour les signalements. Toutes les fonctions
insèrent systématiquement un événement d'audit après chaque action.

**Côté citoyen** :
- `listerTicketsCitoyen(citoyenId)` — "Mes demandes", avec dernier message
  et compteur de non-lus.
- `creerTicket({citoyenId, categorie, sujet, message, contexte?})` — force
  `statut='attente_agent'`, priorité dérivée côté serveur.
- `obtenirTicketCitoyen(citoyenId, ticketId)` — **vérifie l'ownership**
  (jamais fait confiance à un `ticketId` seul), calcule `resolu_par`
  (citoyen/agent/system, depuis le dernier événement `resolved`) et joint
  `rating` s'il existe. Marque les messages agent comme lus.
- `envoyerMessageCitoyen(...)` — **retour Bryan 04/09/2026, comportement
  changé par rapport au brief initial** : le citoyen ne peut plus écrire
  que sur un ticket `en_cours` (ni pendant l'attente d'un agent, ni sur un
  ticket `resolu` — un message sur `resolu` ne le rouvre plus
  automatiquement). Une conversation terminée reste terminée ; "Parler au
  support" démarre une **nouvelle** conversation.
- `terminerParCitoyen(...)` — équivalent citoyen de `resoudreTicket()`,
  sans exiger d'agent assigné (le citoyen peut terminer même une
  conversation encore en file d'attente). **Idempotent** : `UPDATE`
  conditionné sur le statut, 0 ligne affectée si déjà résolu ailleurs
  (ex. par l'agent au même instant) → renvoie `ok:true` quand même.
- `enregistrerEvaluationCitoyen(...)` — unicité vérifiée deux fois
  (contrôle applicatif + contrainte UNIQUE base, gère le double-submit
  réseau via le code d'erreur `23505`).

**Côté agent (console admin)** :
- `fileAttenteAgent(filtreStatut?)` — liste + compteurs par statut.
- `obtenirTicketAgent(ticketId)` — fiche complète + nom citoyen.
- `prendreEnCharge(...)` — **assignation atomique** (brief : "deux agents
  ne doivent jamais prendre simultanément le même ticket") : `UPDATE`
  conditionné sur `statut='attente_agent'`, jamais un `SELECT` puis
  `UPDATE` séparés — 0 ligne affectée = déjà pris par un autre agent.
- `envoyerMessageAgent(...)`, `resoudreTicket(...)`, `cloturerTicket(...)`
  — chacun vérifie que l'agent appelant est bien `assigned_agent_id`.

Notifications citoyen : réutilise la table `notifications` existante
(`type:"message"`, `lien:/messagerie/citoyen?tab=yelen&ticket_id=...`),
pas de nouveau type dédié.

## 5. Routes API

**Citoyen** (`verifierCitoyenToken`) sous `app/api/citoyen/support/tickets/` :
`GET`/`POST /` (liste, création), `GET /[id]` (détail, ownership vérifié),
`POST /[id]/messages`, `POST /[id]/terminer`, `POST /[id]/evaluation`.

**Admin** (`authorizeAdmin`, permission **`support.access`**, rôles
`super_admin`/`support`/`admin`) : une seule route à 3 verbes
`app/api/admin/support/route.ts` (`GET` liste ou détail par `?id=`, `POST`
message agent, `PATCH` action `prendre_en_charge`/`resoudre`/`cloturer`) —
même structure que `/api/admin/messagerie`, délibérément pas de fichiers
séparés par action.

## 6. UI

**Citoyen** — onglet "Yelen" de `app/messagerie/citoyen/page.tsx` (pas un
écran `/support` séparé — retour Bryan explicite : "le support doit vivre
ICI, accès rapide, déjà connu"). Couvre : liste "Mes demandes", écran
d'attente illustré (`public/illustrations/support-agent-yelen.png`, animation
de points, lien d'appel téléphonique si `NEXT_PUBLIC_SUPPORT_PHONE` défini),
fil de conversation, invite d'évaluation après résolution (une seule fois
par session tant que non notée), Supabase **Realtime** sur
`support_tickets`/`support_ticket_messages` filtré par `citoyen_id`/
`ticket_id`. Présélection possible via `?ticket_id=` (même paramètre que
`?institution_id=` déjà utilisé pour l'onglet Établissements).

**Admin** — `app/admin/support/page.tsx` (nav "Support",
`app/admin/layout.tsx:59`). Layout liste (340px) + détail, KPI (en
attente/en cours/résolues), onglets par statut, actions contextuelles
(Prendre en charge / Marquer résolue / Clôturer avec confirmation modale).

## 7. État réel / reste à faire

- **Code complet (modèle, backend, routes, UI citoyen ET admin), jamais
  commité, jamais testé** (ni SQL, ni navigateur) — même niveau de
  vérification que les autres chantiers de cette même semaine (voir aussi
  `docs/product/YELEN_RDV_NOSHOW_RESTRICTIONS.md`), contrairement à la
  discipline `VERIFIED IN DATABASE/APPLICATION` appliquée au chantier Trust.
- `messages_yelen_citoyen` (ancienne conversation permanente) toujours en
  place, pas encore retirée — dépend d'un futur "Lot C" de stabilisation
  jamais formalisé comme tel dans le code lu.
- Upload d'image dans une conversation (`support_ticket_messages.image_url`)
  : le champ existe côté schéma et est consommé côté lecture, mais aucune
  route d'upload dédiée n'a été repérée dans ce lot — à vérifier si l'envoi
  d'image citoyen→agent est réellement câblé bout en bout avant de
  considérer le Lot B/C terminé.
- Aucune action d'escalade manuelle de priorité par un agent (mentionné
  comme hors périmètre explicite dans `lib/supportTicketsConstants.ts`,
  "pas construite tant que non demandée").
