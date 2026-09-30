# Yelen Support Public — Technical Design V1

Document de conception détaillée, **zéro code**. S'appuie sur
`public-support-architecture.md` (toutes les décisions produit y sont
verrouillées — ce document ne les rediscute pas, il les rend
implémentables : contrats exacts, signatures, schémas de payload, plan de
test). Toute référence `§N` sans préciser le document renvoie à
`public-support-architecture.md`.

**Convention de nommage** : `yelen224_*` pour les cookies (cohérent avec
`yelen224_citoyen_remember`/`yelen224_employee_session`), fonctions en
français dans `lib/`, tables/colonnes en français (`snake_case`), routes
API en anglais court (`/api/support/public/...`), cohérent avec le reste
du projet.

---

## 1. Évolution de `support_tickets`

SQL exact déjà figé en architecture §12. Côté TypeScript
(`lib/supportTicketsConstants.ts`) :

```ts
export const SUPPORT_CATEGORIES_PUBLIC = [
  "general", "rejoindre_yelen", "presse", "commercial", "signalement_general",
  "technique", "securite", "autre",
] as const;
export type SupportCategoriePublic = (typeof SUPPORT_CATEGORIES_PUBLIC)[number];
export function isSupportCategoriePublic(value: string): value is SupportCategoriePublic { ... }
export const SUPPORT_CATEGORIE_PUBLIC_LABELS: Record<SupportCategoriePublic, string> = { ... };
```

`lib/supportTickets.ts` — types partagés élargis (additif, aucun champ
retiré) :
- `FileAttenteItem.origine` : `'citoyen' | 'institution'` → `'citoyen' |
  'institution' | 'public'`.
- `FileAttenteItem` : `+ visiteur_nom: string | null`.
- `TicketDetail`/type retourné par `obtenirTicketAgent()` :
  `+ visiteur_nom: string | null; visiteur_email: string | null`.
- Nouveau type dédié `TicketPublicVue` (projection minimale exposée au
  visiteur via token, jamais un alias de `TicketDetail`) :
```ts
export type TicketPublicVue = {
  numero_public: string; categorie: SupportCategoriePublic; sujet: string;
  statut: SupportStatut;
  messages: { id: string; expediteur_type: "visiteur" | "agent"; contenu: string | null; cree_le: string }[];
};
```

---

## 2. Nouvelles contraintes SQL

Consolidation de architecture §3/§12 — 4 contraintes touchées, toutes
`DROP CONSTRAINT` + `ADD CONSTRAINT` (recréation, pas d'`ALTER ... ADD
VALUE` car ce sont des `CHECK`, pas des `ENUM` Postgres) :

| Table | Contrainte | Changement |
|---|---|---|
| `support_tickets` | `support_tickets_une_seule_origine` | XOR 2→3 voies (§3) |
| `support_tickets` | `support_tickets_statut_check` (nom présumé auto-généré) | `+ 'attente_verification'` |
| `support_tickets` | `support_tickets_categorie_check` | `+ 5 valeurs publiques` |
| `support_ticket_messages` | `support_ticket_messages_expediteur_type_check` | `+ 'visiteur'` |
| `support_ticket_events` | `support_ticket_events_acteur_type_check` | `+ 'visiteur'` |
| `support_ticket_events` | `support_ticket_events_type_check` (nom présumé) | `+ 'email_verifie'` |

**Action préalable pour Bryan avant d'écrire la migration finale** —
confirmer les noms réels des contraintes sans nom explicite dans les
migrations d'origine :
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('support_tickets'::regclass, 'support_ticket_messages'::regclass, 'support_ticket_events'::regclass)
ORDER BY conrelid, conname;
```
Si un nom diffère de l'hypothèse ci-dessus (auto-génération Postgres
`{table}_{colonne}_check`), la migration doit utiliser le nom réel.

---

## 3. Statut `attente_verification`

Table de transition complète (`SUPPORT_TRANSITIONS`) :

| Depuis | Vers autorisé | Déclencheur |
|---|---|---|
| `attente_verification` | `attente_agent` | Vérification email réussie uniquement — **jamais** une action agent (absent de tout accès agent) |
| `attente_agent` | `en_cours` | `prendreEnCharge()` — inchangé |
| `en_cours` | `resolu` | `resoudreTicket()` / `terminerParCitoyen()` / `terminerParInstitution()` / (nouveau) `terminerParVisiteur()` — inchangé pour les 3 premiers |
| `resolu` | `cloture` | `cloturerTicket()` — inchangé |
| `cloture` | *(terminal)* | — |

`SUPPORT_STATUTS_ACTIFS` (`["attente_agent","en_cours","resolu"]`) :
**inchangé** — vérifié par grep, cette constante n'est actuellement
consommée nulle part dans le code (`lib/supportTicketsConstants.ts`
uniquement, où elle est définie) ; `attente_verification` n'y est pas
ajoutée, cohérent avec l'absence d'écran "mes demandes" côté visiteur en
V1.

`isSupportStatut()` : élargi mécaniquement par l'ajout à `SUPPORT_STATUTS`
— aucune logique séparée à écrire.

---

## 4. Tokens de vérification et de suivi

Schéma SQL déjà figé (architecture §2.4). Signatures exactes
(`lib/supportTickets.ts`, jamais exportées côté client) :

```ts
function genererRawToken(): string {
  // crypto.randomBytes(32).toString("base64url") — 256 bits, même mécanique que lib/auth/trustedDevice.ts
}

function hasherToken(rawToken: string): string {
  // crypto.createHash("sha256").update(rawToken).digest("hex")
}

async function creerTokenPublic(params: {
  ticketId: string; purpose: "verification" | "suivi"; dureeMs: number; req?: NextRequest;
}): Promise<{ rawToken: string }> {
  // INSERT support_ticket_public_tokens (token_hash = hasherToken(raw), expires_at = now()+dureeMs, ip_creation)
  // Retourne rawToken UNIQUEMENT — jamais persisté en clair, jamais retourné une 2e fois
}

async function resoudreTokenPublic(params: {
  rawToken: string; purpose: "verification" | "suivi";
}): Promise<{ id: string; ticketId: string } | null> {
  // SELECT ... WHERE token_hash = hasherToken(rawToken) AND purpose = purpose
  //   AND status = 'actif' AND expires_at > now()
  // Retourne null si absent/expiré/déjà utilisé/révoqué — jamais de distinction
  // de message d'erreur entre ces 4 cas côté client (évite tout oracle).
}
```

Durées : `verification` = `24 * 3600 * 1000` ms, `suivi` = `30 * 24 * 3600
* 1000` ms (constantes nommées, pas des nombres magiques répétés).

---

## 5. Modèle de sécurité des tokens

| Menace | Mitigation |
|---|---|
| Énumération de tickets | Recherche uniquement par `token_hash` (256 bits, `UNIQUE`), jamais par `numero_public`/`id` sur une route publique |
| Fuite du token dans les logs serveur | Jamais loggé en clair — seul `hasherToken()` traverse les logs applicatifs si besoin de diagnostic |
| Fuite du token via l'URL (Referer, historique navigateur, logs d'accès) | Voir §8 — le token de **suivi** est échangé contre un cookie httpOnly dès le premier chargement, puis retiré de l'URL (redirect 303) ; le token de **vérification** n'est utilisé qu'une fois et immédiatement marqué `utilise` |
| Pré-clic automatique par un scanner d'email (Outlook/Defender/passerelles antispam suivent les liens des emails avant l'utilisateur réel) | Voir §7 — le lien de vérification ne consomme **jamais** le token sur un simple `GET` ; la consommation exige un `POST` déclenché par un clic explicite sur la page de confirmation |
| Vol du cookie de suivi (poste partagé, XSS) | `httpOnly` (inaccessible en JS) + `Secure` + `SameSite=Lax` ; risque résiduel = accès physique à l'appareil, hors du contrôle applicatif |
| Rejeu d'un webhook Postmark | Voir §11 — Basic Auth sur l'URL + traitement idempotent par `MessageID` |
| Brute force du token | Cryptographiquement infaisable (256 bits) — rate limiting en défense en profondeur, pas en protection principale |

---

## 6. Endpoint de création publique

`POST /api/support/public/tickets`

**Requête** :
```ts
type CreerTicketPublicBody = {
  nom: string; email: string; telephone?: string;
  categorie: SupportCategoriePublic; sujet: string; message: string;
  _hp?: string; // honeypot — doit être vide/absent
};
```

**Validation serveur (ordre d'exécution)** :
1. Rate limit edge (`estRateLimite`, clé `ip:/api/support/public/tickets`, seuil dédié §14) — 429 immédiat si dépassé, avant toute lecture du body.
2. `_hp` non vide → 200 factice (`{ ok: true }` sans rien écrire) — **ne jamais révéler à un bot qu'il a été détecté**, même principe que le honeypot `/contact` actuel.
3. `nom` : requis, trim, 1-120 caractères.
4. `email` : requis, format valide (nouveau validateur minimal partagé — aucun existant trouvé dans `lib/`, à créer une seule fois, réutilisable si un futur besoin similaire apparaît).
5. `telephone` : optionnel, si présent 6-20 caractères (pas de validation stricte de format international — cohérent avec le reste du projet qui n'impose pas de format téléphone strict ailleurs).
6. `categorie` : requise, `isSupportCategoriePublic(valeur)` — jamais fait confiance à une valeur non vérifiée contre la liste réelle.
7. `sujet` : requis, 1-200 caractères.
8. `message` : requis, 1-4000 caractères.
9. Rate limit applicatif par email (§14) : `COUNT(support_tickets) WHERE visiteur_email = email AND cree_le > now()-24h`, plafond 3 → 429 si dépassé.

**Effets de bord, dans l'ordre** (transaction logique, pas une transaction SQL unique — cohérent avec le reste de `lib/supportTickets.ts` qui n'utilise pas non plus de transactions explicites) :
1. `INSERT support_tickets` (`statut='attente_verification'`).
2. `INSERT support_ticket_messages` (message initial, `expediteur_type='visiteur'`).
3. `INSERT support_public_signal_log`.
4. `creerTokenPublic(purpose='verification')`.
5. `envoyerEmailSupport({ type: 'verification', destinataire: email, variables: { lien: ... } })`.

**Rollback verrouillé (24/09/2026) : annulation du ticket si une étape 1-4
échoue.** Aucune transaction SQL réelle n'enveloppe ces appels (cohérent
avec le reste du fichier), donc le rollback est une **compensation
explicite** : si l'étape 2, 3 ou 4 échoue, `DELETE FROM support_tickets
WHERE id = ticketId` avant de renvoyer une erreur au client — jamais de
ticket orphelin sans message initial dans la file. Conséquences en
cascade, déjà cohérentes avec le schéma existant, aucun cas particulier à
coder :
- `support_ticket_messages` (`ON DELETE CASCADE`) : supprimé avec le ticket si l'étape 2 avait réussi puis qu'une étape suivante échoue.
- `support_public_signal_log` (`ON DELETE SET NULL`, §2.6 architecture) : **survit** à cette suppression, `ticket_id` devient `NULL` — comportement voulu, la ligne de signal trace la tentative même si le ticket n'a finalement pas abouti.
- `support_ticket_public_tokens` : rien à nettoyer si l'étape 4 est celle qui échoue (le token n'a jamais été créé).

**La frontière du rollback s'arrête à l'étape 4.** Un échec de l'étape 5
(Postmark) ne déclenche **jamais** ce rollback — décision déjà verrouillée
séparément ci-dessous : le ticket et son token sont valides et persistent,
seule la colonne `email_verification_erreur` enregistre l'échec d'envoi.
Distinction délibérée : les étapes 1-4 sont des écritures internes (soit
tout existe, soit rien n'existe) ; l'étape 5 est un effet de bord externe
dont l'échec ne doit pas invalider un état interne par ailleurs cohérent.

**Gestion d'échec à l'étape 5 (Postmark indisponible/erreur)** — leçon
directement tirée de l'incident réel du 06/08/2026 sur les reçus PDF
(`recus.erreur_generation`, chantier "Reçus Yelen" : un échec de
génération silencieux avait laissé des reçus bloqués sans que personne ne
puisse le voir) : **ne jamais faire échouer la création du ticket** si
l'envoi Postmark échoue — le ticket et son token existent déjà en base
(le visiteur peut redemander l'envoi, voir ci-dessous). Ajouter une
colonne `support_tickets.email_verification_erreur` (text, nullable) —
si l'appel Postmark échoue, y écrire le message d'erreur au lieu de le
faire disparaître dans un `console.error` uniquement. Un futur bouton
admin "renvoyer l'email de vérification" (hors V1, mentionné pour
mémoire) deviendrait possible sans redesign.

**Réponse** :
- `201` : `{ ok: true, numeroPublic: string }`.
- `400` : `{ ok: false, error: string }` (message précis, aucune donnée sensible).
- `429` : `{ ok: false, error: "Trop de demandes. Réessayez plus tard." }`.
- `500` : `{ ok: false, error: "Une erreur est survenue. Réessayez ou écrivez-nous directement." }` (jamais le détail de l'erreur interne).

---

## 7. Endpoint de vérification

**Deux étapes, jamais fusionnées** — précisément pour neutraliser le
risque de pré-clic automatique par un scanner d'email (Outlook Safe
Links, passerelles antispam d'entreprise, antivirus — tous suivent
systématiquement les liens contenus dans un email avant qu'un humain ne
clique, ce qui **consommerait silencieusement un token à usage unique**
si le `GET` seul suffisait à valider) :

### 7.1 `GET /support/verifier?token=...` (page, pas API)
- Lecture seule : `resoudreTokenPublic({ rawToken, purpose: 'verification' })`.
- Si `null` → page "Lien invalide ou expiré, contactez-nous à nouveau depuis `/contact`".
- Si valide → page affichant `sujet`/`categorie` du ticket (lecture via `obtenirTicketParToken`, projection minimale) + un bouton **"Confirmer mon adresse email"**.
- **Aucune mutation à cette étape.**

### 7.2 `POST /api/support/public/verify` (déclenché par le clic du bouton)
```ts
type VerifierTicketPublicBody = { token: string };
```
1. `resoudreTokenPublic({ rawToken: token, purpose: 'verification' })` — si `null`, `410 { ok: false, error: "Lien invalide ou expiré." }`.
2. `UPDATE support_ticket_public_tokens SET status='utilise', used_at=now() WHERE id = ...` (conditionné sur `status='actif'`, même discipline que `prendreEnCharge()` — 0 ligne affectée = déjà consommé entre-temps par une requête concurrente, traiter comme un succès idempotent si le ticket est déjà `attente_agent`).
3. `UPDATE support_tickets SET statut='attente_agent', email_verifie_le=now() WHERE id = ... AND statut='attente_verification'`.
4. `INSERT support_ticket_events` : `type='created'` puis `type='email_verifie'` (§2.3 architecture — écriture différée).
5. `UPDATE support_public_signal_log SET verifie=true WHERE ticket_id = ...`.
6. `creerTokenPublic(purpose='suivi')`.
7. `envoyerEmailSupport({ type: 'confirmation', ... })`.
8. Réponse : `{ ok: true, ticketId, rawTokenSuivi }` — le **front** (page de confirmation) reçoit ce token une seule fois dans la réponse JSON, jamais dans l'URL, et déclenche immédiatement la redirection vers `/support/suivi` en posant lui-même le cookie via un appel serveur dédié (voir §8) — le token de suivi ne transite donc jamais par une URL visible.

---

## 8. Endpoint de consultation du ticket (suivi)

**Le token de suivi ne reste jamais dans l'URL au-delà du tout premier
accès** (mitigation fuite Referer/logs/historique, §5).

### 8.1 `GET /support/suivi?token=...` (uniquement via lien reçu par email)
1. Si le cookie `yelen224_support_suivi` est déjà présent et valide → ignorer le `token` de la query, servir directement la page.
2. Sinon, `resoudreTokenPublic({ rawToken: token, purpose: 'suivi' })` :
   - `null` → page "Lien invalide ou expiré."
   - Valide → pose le cookie `yelen224_support_suivi` (httpOnly, Secure, SameSite=Lax, Max-Age = temps restant avant `expires_at`), puis **redirect 303** vers `/support/suivi` (sans query string).

### 8.2 `GET /api/support/public/suivi` (lu par la page, jamais par l'utilisateur directement)
- Lit le cookie, `resoudreTokenPublic({ rawToken: cookie, purpose: 'suivi' })`.
- Retourne `TicketPublicVue` (§1) via `obtenirTicketParToken(ticketId)`.
- `401` si cookie absent/invalide/expiré → la page affiche "Session de suivi expirée, redemandez un lien depuis votre email".

### 8.3 `POST /api/support/public/suivi/message` — réponse du visiteur
```ts
type MessagePublicBody = { texte: string };
```
- Lit le cookie (même résolution que 8.2), vérifie `ticket.statut === 'en_cours'` (même règle que `envoyerMessageCitoyen` — un agent doit avoir pris en charge avant que le visiteur puisse continuer à échanger).
- `INSERT support_ticket_messages` (`expediteur_type='visiteur'`), `INSERT support_ticket_events` (`type='message_sent'`, `acteur_type='visiteur'`).
- Notifie l'agent assigné — **hors périmètre V1** (aucun mécanisme de notification agent en temps réel n'existe pour un nouveau message entrant côté citoyen non plus au-delà de la liste rafraîchie ; pas une régression propre au public).

---

## 9. Intégration Postmark

`lib/supportEmail.ts` (nouveau fichier, isolé — jamais importé par le
reste du moteur autrement que via `envoyerEmailSupport()`) :

```ts
export type EmailSupportType = "verification" | "confirmation" | "reponse_agent" | "resolution";

export async function envoyerEmailSupport(params: {
  type: EmailSupportType;
  destinataire: string;
  variables: Record<string, string>;
}): Promise<{ ok: true; postmarkMessageId: string } | { ok: false; error: string }> {
  // POST https://api.postmarkapp.com/email/withTemplate
  // Headers: X-Postmark-Server-Token, Accept: application/json, Content-Type: application/json
  // Body: { From: POSTMARK_FROM_EMAIL, To: destinataire, TemplateAlias: <alias selon type>,
  //         TemplateModel: variables, MessageStream: POSTMARK_MESSAGE_STREAM }
}
```

Correspondance `type` → `TemplateAlias` (§10) : table de correspondance
statique dans `lib/supportEmail.ts`, jamais dispersée dans les appelants.

**Timeout et erreurs** : `fetch` avec `AbortSignal.timeout(5000)` (même
ordre de grandeur que `estIpVpnOuProxy` dans `lib/edgeSecurity.ts`) —
Postmark en panne/lent ne doit jamais bloquer la réponse HTTP au
visiteur au-delà de quelques secondes. Toute erreur (timeout, 4xx, 5xx)
retourne `{ ok: false, error }`, jamais une exception non gérée — chaque
appelant (§6, §12) décide comment réagir (voir §6 pour la colonne
`email_verification_erreur`).

**Pas de retry automatique en V1** — un échec reste visible (colonne
d'erreur §6) plutôt que de complexifier avec une file de retry non
demandée ; cohérent avec "ne pas inventer une logique non nécessaire".

---

## 10. Architecture des templates

4 alias Postmark (§15 architecture) :

| Alias | Déclenché par | Variables (`TemplateModel`) |
|---|---|---|
| `support-verification-email` | §6 (création) | `lien_verification`, `expiration_heures` (="24") |
| `support-confirmation-demande` | §7.2 étape 7 | `numero_public`, `lien_suivi` |
| `support-reponse-agent` | §12 (agent répond/prend en charge) | `lien_suivi` |
| `support-resolution` | §12 (résolution/clôture) | `lien_suivi` |

Convention d'alias : préfixe `support-` pour isoler ces templates de tout
futur usage Postmark non lié au Support (ex. si un jour Yelen envoie des
emails transactionnels pour un autre module). Contenu éditorial exact
(sujet, corps) **non rédigé ici** — décision explicite du chantier Help
Center prestataire déjà appliquée ailleurs : la conception technique ne
préjuge pas du contenu final, rédigé séparément.

---

## 11. Webhooks Postmark

Deux routes, jamais mélangées à `lib/supportTickets.ts` :

```
POST /api/support/public/webhooks/postmark-bounce
POST /api/support/public/webhooks/postmark-spam
```

**Sécurisation** : Basic Auth intégré à l'URL configurée dans le
dashboard Postmark (`https://<user>:<pass>@yelen224.../api/support/public/webhooks/postmark-bounce`)
— vérifié côté route via l'en-tête `Authorization` standard, comparé en
temps constant aux valeurs `POSTMARK_WEBHOOK_BASIC_AUTH_USER/_PASS`
(même précaution de comparaison temps-constant que `lib/geoAccess.ts`
pour le cookie de géo-bypass).

**Forme du payload** — Postmark envoie un JSON dont les champs exacts
(`RecordType`, `MessageID`, `Email`, `Type`, `Description`, `BouncedAt`,
etc. de mémoire) **doivent être reconfirmés contre la documentation
Postmark au moment de l'implémentation réelle** — non garantis ici sans
accès direct et à jour à leur référence API (zéro donnée inventée
présentée comme fait vérifié). Traitement, indépendamment du nom exact
des champs :
1. Vérifier Basic Auth.
2. Extraire l'email destinataire et l'identifiant de message.
3. `INSERT` ou `UPDATE support_public_signal_log` (marquer un signal
   `bounce`/`spam` sur l'email concerné) — traitement **idempotent** par
   l'identifiant de message Postmark (Postmark peut renvoyer le même
   webhook plusieurs fois en cas de non-200 de notre côté) : vérifier
   avant d'insérer un doublon, ou upsert sur une clé dédiée.
4. Toujours répondre `200` rapidement (Postmark retente sinon) — aucun
   traitement lourd synchrone dans la réponse.
5. **Aucune action automatique sur le ticket** (§16 architecture,
   confirmé) — collecte du signal uniquement en V1.

---

## 12. Notification agent → visiteur

`lib/supportTickets.ts` — 4 fonctions existantes, un seul ajout
symétrique par fonction (jamais de logique dupliquée, jamais de
modification du comportement citoyen/institution) :

```ts
// Dans prendreEnCharge(), envoyerMessageAgent(), resoudreTicket(), cloturerTicket() :
if (ticket.institution_id) {
  await notifierInstitution(...);           // inchangé
} else if (ticket.citoyen_id) {
  await notifierCitoyen(...);               // inchangé
} else if (ticket.visiteur_email) {
  await notifierVisiteurParEmail(ticket.visiteur_email, ticket.id, <type email correspondant>);
}
```

Correspondance action agent → type d'email :
| Action agent | `EmailSupportType` |
|---|---|
| `prendreEnCharge()` | *(aucun email — pas dans la liste des 5 besoins §6 architecture, seul un email de confirmation initiale existe déjà)* |
| `envoyerMessageAgent()` | `reponse_agent` |
| `resoudreTicket()` | `resolution` |
| `cloturerTicket()` | `resolution` (même template — "résolution" et "clôture" ne sont pas distingués côté visiteur, cohérent avec architecture §10) |

`notifierVisiteurParEmail()` — fonction interne, non exportée, seule à
appeler `envoyerEmailSupport()` avec le `lien_suivi` reconstruit depuis
le token de suivi actif du ticket (ou en génère un nouveau si aucun
actif — cas d'un ticket dont le token de suivi a expiré avant la
prochaine notification, peu probable en pratique vu la fenêtre de 30
jours mais géré proprement plutôt que de planter).

---

## 13. Purge automatique à J+7

Mécanique complète déjà figée (architecture §17). Précision opérationnelle
pour le déploiement :

**Étape de validation manuelle avant d'activer le `cron.schedule`**
(cohérent avec "Bryan exécute tout SQL manuellement") — requête de
dry-run à exécuter d'abord pour vérifier ce que la purge supprimerait :
```sql
SELECT id, numero_public, visiteur_email, cree_le
FROM support_tickets
WHERE statut = 'attente_verification' AND cree_le < now() - interval '7 days'
ORDER BY cree_le;
```
Puis activer le job (`SELECT cron.schedule(...)`, §12 architecture)
seulement après une revue de ce résultat sur des données réelles.

**Observabilité minimale** : la fonction `support_tickets_purger_non_verifies()`
peut être modifiée pour `RETURN` le nombre de lignes supprimées
(`GET DIAGNOSTICS ... ROW_COUNT`) plutôt que `void`, visible dans les
logs `pg_cron` (`cron.job_run_details`) sans infrastructure
supplémentaire — cohérent avec le principe "aucune agrégation/alerting
nouvelle à construire sans décision explicite" déjà appliqué à
`lib/edgeSecurity.ts::logSecurite()`.

---

## 14. Rate limiting / anti-abus

| Couche | Endpoint | Seuil proposé | Mécanisme |
|---|---|---|---|
| Edge | `POST /api/support/public/tickets` | 5-10 req/min/IP | `lib/edgeSecurity.ts::estRateLimite`, nouvelle entrée `ENDPOINTS_SENSIBLES` |
| Edge | `POST /api/support/public/verify` | 10-20 req/min/IP | idem (protège le scan, pas la force brute — infaisable) |
| Edge | `GET/POST /api/support/public/suivi*` | 30-60 req/min/IP | idem, seuil plus haut (usage légitime répété : rafraîchir le fil) |
| Applicatif | Création de ticket | 3 par email / 24h | Comptage direct `support_tickets` (§6) |
| Applicatif | Signal long terme | Aucune règle de blocage en V1 | `support_public_signal_log`, collecte seule (§2.6 architecture) |
| Contenu | Toute route publique | UA suspect → log, pas de blocage automatique | `estUserAgentSuspect()` réutilisé tel quel |
| Contenu | `POST /api/support/public/tickets` | Honeypot `_hp` | Réponse 200 factice si rempli |

Emplacement d'intégration : `middleware.ts` déjà matcher élargi à tout le
site (`/mission-securite-geo-restriction`) — les nouvelles routes
`/api/support/public/*` tombent automatiquement dans le rate limiting
générique (240 req/min/IP) sans modification de `middleware.ts` ; seule
l'ajout aux `ENDPOINTS_SENSIBLES` de `lib/edgeSecurity.ts` est nécessaire
pour un seuil plus bas et dédié.

---

## 15. Évolution minimale de `/admin/support`

Déjà précisé architecture §9. Résumé des diffs exacts :

`app/admin/support/page.tsx` :
```diff
- origine: 'citoyen' | 'institution'; citoyen_nom: string | null; institution_nom: string | null;
+ origine: 'citoyen' | 'institution' | 'public'; citoyen_nom: string | null; institution_nom: string | null; visiteur_nom: string | null;
```
```diff
- return item.institution_nom ?? item.citoyen_nom ?? 'Inconnu'
+ return item.institution_nom ?? item.citoyen_nom ?? item.visiteur_nom ?? 'Inconnu'
```
Ligne ~203 : un badge conditionnel supplémentaire, même style que celui
existant pour `'institution'`.

`lib/supportTickets.ts::fileAttenteAgent()` :
```diff
- const visibles = filtreStatut ? all.filter(t => t.statut === filtreStatut) : all.filter(t => t.statut !== "cloture");
+ const visibles = filtreStatut
+   ? all.filter(t => t.statut === filtreStatut)
+   : all.filter(t => t.statut !== "cloture" && t.statut !== "attente_verification");
```
`origine` calculée : `institution_id ? "institution" : citoyen_id ?
"citoyen" : "visiteur"` (au lieu de `institution_id ? "institution" :
"citoyen"`).

---

## 16. Migration de `/contact` depuis FormSubmit

`app/contact/page.tsx` — machine à états du formulaire élargie :

```
idle → sending → { success_verification_pending | error }
```
(remplace l'actuelle `idle → sending → { success | error }`).

- `handleSubmit` : `fetch("https://formsubmit.co/ajax/...")` remplacé par
  `fetch("/api/support/public/tickets", { method: "POST", body: JSON.stringify({...}) })`.
- Mapping des 4 types de formulaire existants vers `categorie` (§10
  architecture) fait côté client avant l'envoi.
- Nouvel état `success_verification_pending` : message "Vérifiez votre
  boîte mail" au lieu de "Message envoyé !".
- Champ téléphone : retrait de la logique conditionnelle par type
  (toujours affiché, jamais `required`).
- **Interrupteur** `NEXT_PUBLIC_SUPPORT_PUBLIC_ENABLED` (ou lu côté
  serveur si on préfère ne pas l'exposer au client) — si `false`,
  `/contact` retombe sur l'ancien comportement FormSubmit direct
  (rollback instantané, §18 architecture).

---

## 17. CSP

`proxy.ts` — une seule ligne concernée, retirée **une fois la bascule
effective** (pas avant, §11 architecture) :
```diff
- "connect-src 'self' https://pgcabxgrgjgukuagpuhc.supabase.co wss://pgcabxgrgjgukuagpuhc.supabase.co https://formsubmit.co",
+ "connect-src 'self' https://pgcabxgrgjgukuagpuhc.supabase.co wss://pgcabxgrgjgukuagpuhc.supabase.co",
```
Aucun ajout CSP pour Postmark (appels 100% serveur à serveur, jamais
depuis le navigateur) ni pour les webhooks entrants (Postmark POST vers
Yelen, pas l'inverse — hors du champ de la CSP, qui régit les requêtes
sortantes du navigateur).

---

## 18. Secrets / env

| Variable | Où | Valeur type |
|---|---|---|
| `POSTMARK_SERVER_TOKEN` | Netlify + `.env.local` | Jeton API Server Postmark dédié |
| `POSTMARK_MESSAGE_STREAM` | Netlify + `.env.local` | `outbound` |
| `POSTMARK_FROM_EMAIL` | Netlify + `.env.local` | `support@yelen224.com` (dépend §14 architecture) |
| `POSTMARK_WEBHOOK_BASIC_AUTH_USER` | Netlify + `.env.local` | Généré, jamais un mot lisible |
| `POSTMARK_WEBHOOK_BASIC_AUTH_PASS` | Netlify + `.env.local` | Généré (32+ caractères aléatoires) |
| `NEXT_PUBLIC_SUPPORT_PUBLIC_ENABLED` (ou équivalent serveur) | Netlify + `.env.local` | `true`/`false`, interrupteur de rollback §16 |

Aucune de ces variables n'existe aujourd'hui — toutes nouvelles, à
ajouter à `/actions-manuelles-en-attente` de CLAUDE.md une fois
l'implémentation lancée (pas avant, ce document reste dans `docs/`).

---

## 19. Rollback

Déjà détaillé architecture §18 — rappel des 3 paliers :
1. **Avant mise en prod** : tout est additif (colonnes/tables/routes),
   suppression triviale.
2. **Après mise en prod, avant de vrais tickets publics** : couper
   `NEXT_PUBLIC_SUPPORT_PUBLIC_ENABLED`, revert `app/contact/page.tsx`
   seul.
3. **Après de vrais tickets publics** : rollback applicatif uniquement
   (interrupteur), jamais un rollback de schéma destructif pour les
   lignes déjà créées.

`pg_cron` de purge : `cron.unschedule(...)`, réversible sans conséquence.

---

## 20. Tests et critères d'acceptation

Le projet dispose de **vitest** (`npm run test` → `vitest run`,
confirmé dans `package.json` — correction d'une note obsolète de
CLAUDE.md qui affirmait l'absence de framework de test). Un précédent
direct existe déjà pour ce type de logique :
`app/api/checkin/agent/identify/route.test.ts` (mock Supabase en mémoire
via `vi.mock("@supabase/supabase-js", ...)`, mock du hash de token,
`beforeEach` qui réinitialise un faux client) — **modèle à reproduire**
pour les tests ci-dessous plutôt qu'un nouveau style.

### 20.1 Tests unitaires (vitest)

- `hasherToken()`/`genererRawToken()` : déterminisme du hash, longueur du
  token brut, absence de collision sur 1000 générations (test statistique
  léger, pas une preuve formelle).
- `resoudreTokenPublic()` : token valide → retourne l'id ; token expiré →
  `null` ; token déjà `utilise` → `null` ; token `purpose` différent de
  celui demandé → `null` ; token inexistant → `null` (les 4 derniers cas
  doivent être **indiscernables** pour l'appelant, testé explicitement).
- `creerTicketPublic()` : insert des 3 tables dans le bon ordre ; **échec
  de l'insert `support_ticket_messages` ou `support_ticket_public_tokens`
  → le ticket créé à l'étape 1 est supprimé (`DELETE`) avant de renvoyer
  l'erreur** (verrouillé 24/09/2026, §6) — jamais un ticket orphelin sans
  message dans la file. Mocker un échec Supabase sur chacune des étapes
  2/3/4 et vérifier systématiquement l'appel de suppression du ticket.
- XOR à 3 voies : test d'intégration SQL (ou test vitest avec Supabase de
  test) vérifiant qu'un insert avec 0, 2 ou 3 origines renseignées est
  rejeté par la contrainte, et qu'exactement 1 est accepté.
- `fileAttenteAgent()` : un ticket `attente_verification` n'apparaît
  jamais dans `visibles` par défaut ni dans un filtre explicite autre que
  lui-même — test de non-régression direct sur le bug potentiel identifié
  en §15/§9 architecture.
- `envoyerEmailSupport()` : mock `fetch`, vérifie le bon `TemplateAlias`
  par `type`, timeout respecté (fake timers), erreur Postmark ne lève
  jamais d'exception non gérée.

### 20.2 Tests d'intégration (parcours complets, mock Postmark)

1. Soumission valide → ticket `attente_verification` en base, aucun
   événement dans `support_ticket_events`, un token `verification` actif.
1bis. Soumission où l'insert du message initial est forcé en échec (mock)
   → **aucune ligne `support_tickets` ne subsiste** après l'appel,
   `support_public_signal_log` (si déjà inséré à ce point) conserve sa
   ligne avec `ticket_id = NULL`.
2. `GET /support/verifier?token=X` (token valide) → 200, aucune mutation
   (rejouer le `GET` 2 fois doit donner le même résultat).
3. `POST /api/support/public/verify` avec le même token → ticket passe
   `attente_agent`, 2 événements (`created`, `email_verifie`), token
   `verification` → `utilise`, nouveau token `suivi` généré.
4. Rejouer l'étape 3 avec le même token → `410`, aucun effet de bord
   supplémentaire (idempotence de l'échec).
5. Agent `prendreEnCharge()` sur ce ticket → email `reponse_agent` **non**
   envoyé à cette étape (pas dans la table de correspondance §12) — test
   de non-régression explicite sur ce point précis (facile à mal
   implémenter par symétrie excessive avec citoyen/institution).
6. Agent `envoyerMessageAgent()` → email `reponse_agent` envoyé (mock
   Postmark appelé une fois, avec le bon `lien_suivi`).
7. `GET /support/suivi?token=<token suivi>` → cookie posé, redirect vers
   URL sans query string.
8. `GET /api/support/public/suivi` (avec cookie) → `TicketPublicVue`
   correcte, jamais de champ `support_ticket_events` dans la réponse.
9. Ticket non vérifié, avancer l'horloge de 8 jours (fake timers ou
   manipulation directe de `cree_le` en base de test) → job de purge
   supprime la ligne `support_tickets`, la ligne
   `support_public_signal_log` correspondante survit avec `ticket_id
   = NULL`.

### 20.3 Critères d'acceptation (checklist de recette manuelle, Bryan)

- [ ] Un email invalide est rejeté avec un message clair, jamais un 500.
- [ ] Le honeypot rempli ne renvoie aucune erreur visible (200 silencieux).
- [ ] 4 soumissions successives avec le même email en moins de 24h → la
      4ᵉ est refusée (429).
- [ ] L'email de vérification arrive réellement (test avec une vraie
      boîte, pas seulement un mock) et le lien fonctionne une seule fois.
- [ ] Le lien de vérification, rouvert une 2ᵉ fois après confirmation,
      affiche un message d'erreur clair (pas une page cassée).
- [ ] Le ticket apparaît dans `/admin/support` **seulement après**
      vérification, avec le badge "Public" et le bon nom/email affichés
      sans configuration supplémentaire.
- [ ] Un agent qui répond déclenche bien un email au visiteur, avec un
      lien de suivi qui fonctionne.
- [ ] Le lien de suivi, rouvert plusieurs jours après, fonctionne toujours
      (dans la fenêtre de 30 jours) et redirige vers une URL sans token
      visible après le premier chargement.
- [ ] Un ticket jamais vérifié disparaît de la base après le déclenchement
      manuel de la fonction de purge (test en environnement de dev/staging,
      jamais testé directement en prod sur un vrai job automatique sans
      supervision).
- [ ] `npx tsc --noEmit` → 0 erreur sur l'ensemble des fichiers touchés
      (règle non négociable du projet, CLAUDE.md `/protocole`).
- [ ] `/contact` continue de fonctionner à l'identique pour un utilisateur
      qui ne regarde pas les détails (aucune régression visuelle non
      voulue sur les 4 types de formulaire existants).
