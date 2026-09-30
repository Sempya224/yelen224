# Yelen Support Public Général — Architecture technique (V1)

Document de conception, **zéro code**. Fait suite à l'audit validé le
24/09/2026 (`/contact` existant, dépendances, systèmes voisins). Complète,
sans les modifier, `YELEN_SUPPORT_TICKETING.md` (moteur citoyen/institution)
et les docs Help Center prestataire — les trois documents coexistent,
chacun sur sa couche.

**Principe directeur validé par Bryan** : le Support public général
**réutilise le moteur `support_tickets` existant** avec une 3ᵉ origine
`visiteur`, en suivant exactement le même schéma d'extension déjà appliqué
une fois (citoyen → +institution, 06/09/2026) : colonnes nullables
supplémentaires, contrainte XOR élargie, catégories ajoutées au CHECK
existant, `expediteur_type`/`acteur_type` élargis. Aucune nouvelle table de
tickets, aucun système parallèle.

**Périmètre strictement hors de ce chantier (intact)** : Help Center
prestataire (`/guide-prestataire`), Support citoyen connecté (onglet
"Yelen" de `/messagerie/citoyen`), Support institution connecté
(`SupportYelenTab`), `/recuperation-compte`. `/admin/support` : évolution
minimale, décrite section 9.

**Toutes les décisions sont désormais verrouillées (24/09/2026)** — ce
document n'a plus qu'un point réellement ouvert (le contrôle DNS d'un
domaine d'envoi réel, §14) et un point de configuration mineur (format des
templates, §15). Récapitulatif complet en §19.

---

## 1. Architecture cible

```
                         support_tickets (moteur unique)
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                      │
          citoyen_id            institution_id        visiteur_email
        (inchangé)              (inchangé)             (NOUVEAU)
              │                     │                      │
    /messagerie/citoyen      SupportYelenTab         /contact (V1, URL
      (Realtime Supabase)    (SSE, JWT custom)      inchangée pour l'instant)
                                                            │
                                                  Pas de session possible
                                                  → identité déclarative
                                                  (nom/email/tél) + lien
                                                  sécurisé de suivi par email
                                                  (Postmark, §6)
              │                     │                      │
              └─────────────────────┴──────────────────────┘
                                    │
                           /admin/support (file unique,
                           badge d'origine, actions inchangées)
```

Le visiteur n'a jamais de compte, jamais de session, jamais de JWT — son
identité tient dans 3 colonnes déclaratives sur `support_tickets` et son
seul moyen d'authentification a posteriori est un **token opaque envoyé
par email**, jamais un mot de passe ni un numéro de ticket.

---

## 2. Modèle de données proposé

### 2.1 `support_tickets` — colonnes ajoutées

| Colonne | Type | Contrainte |
|---|---|---|
| `visiteur_nom` | text | nullable |
| `visiteur_email` | text | nullable, sert aussi de marqueur d'origine (voir XOR §3) |
| `visiteur_telephone` | text | nullable — facultatif pour toutes les catégories en V1 (verrouillé 24/09/2026) |
| `email_verifie_le` | timestamptz | nullable — posé au moment de la vérification, jamais avant |

Aucune colonne `origine` explicite : comme aujourd'hui (`institution_id ?
"institution" : "citoyen"` dans `fileAttenteAgent`/`obtenirTicketAgent`),
l'origine se déduit de la colonne non-null. Le calcul devient
`institution_id ? "institution" : citoyen_id ? "citoyen" : "visiteur"`.

### 2.2 Nouveau statut de cycle de vie : `attente_verification`

Un ticket public est **persisté immédiatement** à la soumission (conforme
à l'instruction "les demandes publiques doivent être persistées dans
support_tickets"), mais dans un état qui ne l'active pas encore :

```
SUPPORT_STATUTS : attente_verification (NOUVEAU) → attente_agent → en_cours → resolu → cloture
```

`SUPPORT_TRANSITIONS` étendu :
```ts
attente_verification: ["attente_agent"],   // uniquement via vérification email réussie, jamais une action agent
attente_agent:        ["en_cours"],        // inchangé
en_cours:             ["resolu"],          // inchangé
resolu:               ["cloture"],         // inchangé
cloture:              [],
```
Un ticket `attente_verification` n'est **jamais** atteignable ni visible
dans la file agent (voir impact §9). Seul citoyen/institution ignorent cet
état (jamais créé pour eux, `attente_agent` reste leur premier statut,
comportement inchangé).

### 2.3 Écriture différée de l'événement `created` (origine `visiteur` uniquement)

**Point clé qui rend la suppression réelle possible (§17)** : pour
citoyen/institution, `creerTicket()`/`creerTicketInstitution()` insèrent
l'événement `type='created'` immédiatement (comportement **inchangé**).
Pour l'origine `visiteur`, une nouvelle fonction dédiée
`creerTicketPublic()` **diffère cet insert** :

- À la soumission : `INSERT support_tickets` (statut
  `attente_verification`) + `INSERT support_ticket_messages` (message
  initial) + génération du token de vérification. **Aucun** insert dans
  `support_ticket_events` à ce stade.
- À la vérification réussie : deux événements insérés dans l'ordre —
  `type='created'` (l'audit démarre ici) puis `type='email_verifie'`.

Aucune perte d'information : `support_tickets.cree_le` (posé par défaut
DB à l'insert) reste la source de vérité sur l'instant réel de soumission,
indépendamment du moment où l'événement d'audit est écrit. Cette
différence de timing est strictement locale à `creerTicketPublic()` —
`creerTicket()`/`creerTicketInstitution()` ne changent pas d'une ligne.

### 2.4 Nouvelle table `support_ticket_public_tokens`

Un seul mécanisme de token pour les deux usages (vérification email +
suivi), différenciés par `purpose` — même discipline que la réutilisation
`citoyen_remember_tokens`/`institution_remember_tokens` avec un
discriminant `status` plutôt que 2 tables parallèles (décision Bryan
30/08/2026, `lib/auth/trustedDevice.ts`). Même mécanique de hash que ce
fichier : `crypto.createHash("sha256").update(rawToken).digest("hex")`,
`rawToken` généré via `crypto.randomBytes(32).toString("base64url")`
(256 bits), **jamais stocké en clair, jamais loggé**.

```sql
CREATE TABLE support_ticket_public_tokens (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id     uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  purpose       text NOT NULL CHECK (purpose IN ('verification','suivi')),
  token_hash    text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','utilise','revoque')),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  revoked_at    timestamptz,
  ip_creation   text,
  cree_le       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_public_tokens_ticket_idx ON support_ticket_public_tokens (ticket_id);
CREATE UNIQUE INDEX support_ticket_public_tokens_hash_idx ON support_ticket_public_tokens (token_hash);

ALTER TABLE support_ticket_public_tokens ENABLE ROW LEVEL SECURITY;
-- Zéro policy — accès exclusivement service_role, même raisonnement que
-- support_ticket_events (aucune session Supabase Auth côté visiteur).
```

`ON DELETE CASCADE` vers `support_tickets` : quand un ticket non vérifié
est supprimé (§17), ses tokens disparaissent avec lui, sans intervention
séparée.

Pas de statut `expire` persisté : comme `citoyen_documents` ("Expiré"
dérivé à la lecture, jamais stocké), l'expiration se calcule à la volée
(`status = 'actif' AND expires_at > now()`).

**Durées verrouillées (24/09/2026)** : `verification` = 24h, usage unique
(`status → 'utilise'` dès consommé — conforme OWASP sur les tokens de
vérification email : aléatoire, usage unique, borné dans le temps).
`suivi` = **30 jours** (pas 90 — décision explicite de Bryan : limiter
l'exposition d'un lien qui reste valide longtemps). Passé 30 jours, le
visiteur qui revient doit repasser par une nouvelle vérification d'email
pour obtenir un nouveau token de suivi — pas un renouvellement silencieux.

### 2.5 `support_ticket_events` / `support_ticket_messages` — valeurs élargies

`expediteur_type` : `citoyen` / `agent` / `institution` → **+ `visiteur`**.
`acteur_type` : `citoyen` / `agent` / `system` / `institution` → **+
`visiteur`**.
`SUPPORT_EVENT_TYPES` : **+ `email_verifie`**.

### 2.6 Nouvelle table `support_public_signal_log` — anti-abus, TTL indépendant

**Décision explicite de Bryan (24/09/2026)** : "les données nécessaires à
l'anti-abus/rate limiting doivent rester séparées et soumises à leur
propre TTL" — distinctes du cycle de vie du ticket (7 jours, §17). Une
table dédiée, volontairement **hors du modèle d'audit immuable** (ce n'est
pas un événement légal comme `support_ticket_events`, juste un signal
opérationnel de sécurité, mutable par nature) :

```sql
CREATE TABLE support_public_signal_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text NOT NULL,
  ip            text,
  categorie     text,
  ticket_id     uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  verifie       boolean NOT NULL DEFAULT false,
  cree_le       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_public_signal_log_email_idx ON support_public_signal_log (email, cree_le DESC);
CREATE INDEX support_public_signal_log_ip_idx ON support_public_signal_log (ip, cree_le DESC);

ALTER TABLE support_public_signal_log ENABLE ROW LEVEL SECURITY;
-- Zéro policy, service_role uniquement.
```

`ticket_id` en **`ON DELETE SET NULL`** (jamais `RESTRICT`/`CASCADE`) —
c'est délibéré : quand le ticket référencé est supprimé (§17), la ligne de
signal **doit survivre**, c'est tout son intérêt ; elle perd juste sa
référence.

- Une ligne insérée à **chaque soumission publique réussie** (pas les
  soumissions bloquées par le rate limiting edge, déjà loguées séparément
  par `logSecurite()` dans `lib/edgeSecurity.ts`).
- `verifie` passé à `true` par une simple `UPDATE` au moment de la
  vérification email — cette table n'a pas la contrainte d'immuabilité de
  `support_ticket_events`, une mise à jour directe est acceptable ici (même
  logique que `status` sur `citoyen_remember_tokens`).
- **Usage** : le plafond court terme (3 demandes/24h par email, §8)
  continue de compter directement les lignes `support_tickets` — cette
  fenêtre tient largement dans les 7 jours avant purge, aucun changement
  nécessaire. `support_public_signal_log` sert aux signaux **long terme**
  (ex. "cet email a soumis 10 demandes jamais vérifiées sur 90 jours") —
  la donnée est collectée dès la V1, mais **aucune règle de blocage n'est
  construite dessus tant que non demandée** (même principe que partout
  ailleurs : ne pas inventer une logique non nécessaire).
- **TTL propre à confirmer** : proposition 90 jours (purge séparée, même
  mécanisme pg_cron que §17 mais sa propre fonction/planification) — à
  valider, pas gravé.

---

## 3. Contraintes SQL — XOR à 3 voies

`support_tickets_une_seule_origine` (actuellement 2 voies) devient :

```sql
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_une_seule_origine;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_une_seule_origine
  CHECK (
    (CASE WHEN citoyen_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN institution_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN visiteur_email IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
```

Garantie inchangée pour citoyen/institution — seule une 3ᵉ branche
s'ajoute. Aucun risque de régression sur les tickets déjà en base : un
ticket existant a toujours exactement une des deux premières colonnes
non-null et `visiteur_email` NULL par construction, la somme reste 1.

**Catégories** — `support_tickets_categorie_check` réélargi une 3ᵉ fois :
```sql
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_categorie_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_categorie_check
  CHECK (categorie IN (
    -- citoyen (inchangé)
    'compte','reservation','paiement','etablissement','securite','technique','autre',
    -- institution (inchangé)
    'facturation','client','partenariat',
    -- public (NOUVEAU) — 'technique'/'securite'/'autre' déjà partagés, réutilisés tels quels
    'general','rejoindre_yelen','presse','commercial','signalement_general'
  ));
```
`rejoindre_yelen` est délibérément distinct du `partenariat` institution
existant : ce dernier concerne un établissement **déjà client**, le public
"Institution / Partenariat" est un **prospect** — les confondre fausserait
les statistiques de la file agent (même logique que la séparation
Services/Partenariat actée le 23/09/2026 dans le Help Center prestataire).

`prioriteInitiale()` (`lib/supportTicketsConstants.ts`) : aucune
modification nécessaire, la règle "`securite` → `haute`, sinon `normale`"
s'applique déjà à toute catégorie quelle que soit l'origine.

---

## 4. Parcours visiteur

1. `/contact` (URL inchangée en V1) — formulaire : nom, email, téléphone
   (facultatif, toutes catégories, verrouillé 24/09/2026), sujet,
   catégorie, message, honeypot (repris de l'existant).
2. `POST /api/support/public/tickets` (nouvelle route) :
   - Validation serveur complète, rate limiting (§8).
   - `INSERT support_tickets` (`statut='attente_verification'`,
     `visiteur_nom/email/telephone`, `citoyen_id`/`institution_id` NULL).
   - `INSERT support_ticket_messages` (`expediteur_type='visiteur'`).
   - **Aucun** insert dans `support_ticket_events` à ce stade (§2.3).
   - `INSERT support_public_signal_log` (§2.6).
   - Génère un token `purpose='verification'`, hash stocké, email envoyé
     via **Postmark** (§6) avec un lien `/support/verifier?token=...`.
3. Écran de confirmation : "Vérifiez votre boîte mail pour activer votre
   demande." Le `numero_public` peut être affiché sans risque — l'interdit
   est de l'utiliser comme **clé de recherche** côté serveur (§7).
4. Le visiteur clique le lien → vérification : hash comparé, `status=
   'actif'`, `expires_at > now()`. Si valide : `statut` passe
   `attente_verification` → `attente_agent`, `email_verifie_le` renseigné,
   token marqué `utilise`, **`support_ticket_events` reçoit `created` puis
   `email_verifie`** (§2.3), `support_public_signal_log.verifie = true`.
   Un **nouveau** token `purpose='suivi'` est généré, redirection vers
   `/support/suivi?token=...` (jamais le token de vérification déjà
   consommé).
5. Le ticket entre dans la file agent, traitement strictement identique à
   citoyen/institution (`prendreEnCharge`/`envoyerMessageAgent`/
   `resoudreTicket`/`cloturerTicket` — zéro modification de ces 4
   fonctions au-delà d'un `else if` de notification, §9).
6. Chaque événement notifiable déclenche un **email Postmark** contenant
   uniquement un lien vers `/support/suivi?token=...` — jamais le contenu
   du message en clair (verrouillé 24/09/2026).
7. Le lien de suivi permet de lire le fil et de répondre tant que le
   ticket n'est pas `resolu`/`cloture`, mêmes règles que côté citoyen.
8. Évaluation de fin de conversation : **confirmé hors V1** (24/09/2026).

**Ticket jamais vérifié → suppression réelle à 7 jours** : voir le
mécanisme complet en §17 (rendu possible par l'écriture différée de
l'événement `created`, §2.3).

---

## 5. Parcours agent

Aucun changement de rôle ni de permission (`support.access` reste la
permission unique). Dans `/admin/support` :
- Un ticket public n'apparaît **qu'une fois vérifié** (statut
  `attente_agent`), jamais avant.
- Badge d'origine "Public" à côté de "Institution"/rien-pour-citoyen
  (détail exact du fichier en §9).
- Fiche ticket : nom/email affichés directement depuis les colonnes du
  ticket, aucun join nécessaire (contrairement à citoyen/institution).
- Actions identiques : Prendre en charge / Répondre / Résoudre / Clôturer.
  Seule différence interne : la notification part par **email Postmark**
  (nouvelle fonction `notifierVisiteurParEmail()`) au lieu de
  `notifierCitoyen()`/`notifierInstitution()` (table `notifications`, qui
  suppose un compte).
- Pas de Realtime ni de SSE côté visiteur — l'agent travaille sans
  changement, c'est le visiteur qui revient via son lien ou attend l'email.

---

## 6. Fournisseur email transactionnel — Postmark (verrouillé 24/09/2026)

**FormSubmit.co** reste utilisé **exclusivement pour la réception côté
équipe Yelen** (une demande publique notifiée à l'équipe) — destination
verrouillée **`Sempya224@proton.me`** (remplace `yelen224gn@gmail.com`
utilisé aujourd'hui par `app/contact/page.tsx:66`). Point d'implémentation
à retenir : FormSubmit.co exige une activation manuelle du destinataire au
premier envoi vers une nouvelle adresse (email de confirmation envoyé par
FormSubmit.co à `Sempya224@proton.me`) — cohérent avec "quand je confirme
le mail les autres suivront". FormSubmit.co ne peut techniquement pas
couvrir l'envoi au visiteur (`_autoresponse` incompatible avec l'endpoint
`/ajax/` utilisé aujourd'hui, et de toute façon pas conçu pour porter un
token opaque à durée de vie contrôlée) — ce n'est pas son rôle ici.

**Postmark = infrastructure exclusive de l'envoi au visiteur.** Cinq
besoins à couvrir :

| Besoin | Fréquence attendue | Contenu | Template (§15) |
|---|---|---|---|
| Vérification d'email | 1 par ticket créé | Lien de vérification (24h) | `verification-email` |
| Confirmation de demande | 1 par ticket vérifié | Récapitulatif + lien de suivi | `confirmation-demande` |
| Notification réponse agent | 1 par message agent | Lien de suivi uniquement | `reponse-agent` |
| Notification "besoin d'info" | Cas particulier de "réponse agent" | Identique | `reponse-agent` (même template, pas de distinction technique) |
| Résolution / clôture | 1-2 par ticket | Lien de suivi uniquement | `resolution` |

Soit **4 templates réels** pour les 5 besoins (réponse agent et demande
d'info partagent le même contenu — décision de conception, à signaler si
un jour un besoin éditorial les distingue réellement).

**Réponse entrante par email — architecture non bloquante, pas construite
en V1** (instruction explicite : "ne pas implémenter... mais ne pas
concevoir une architecture qui l'empêcherait"). Postmark fournit une
adresse d'ingestion dédiée par "Server"
(`hash@inbound.postmarkapp.com`) sans nécessiter de DNS MX personnalisé —
le jour où cette fonctionnalité est construite, il suffit d'utiliser cette
adresse comme `Reply-To` sur les emails de notification, et Postmark POSTe
le contenu parsé (JSON) vers un webhook applicatif (§16) qui insérerait un
`support_ticket_messages` (`expediteur_type='visiteur'`). Le point non
trivial à résoudre **à ce moment-là**, pas maintenant : retrouver le bon
`ticket_id` depuis un email entrant (via un identifiant encodé dans
l'adresse `Reply-To` par ticket, ou dans le sujet — à concevoir). Aucune
décision structurante prise ici ne bloque cette extension.

Volumétrie attendue très faible au lancement (1 seul ticket support connu
au 21/09/2026, tous canaux confondus) — sans impact sur le choix déjà
tranché (Postmark).

Point d'implémentation : `lib/supportTickets.ts` reste le seul point
d'écriture ; un nouveau fichier isolé `lib/supportEmail.ts` porte l'appel
Postmark (`envoyerEmailSupport()`), jamais mélangé à la logique métier du
moteur.

---

## 7. Modèle de suivi sécurisé

Rappel de l'exigence : **jamais** de lookup par `numero_public`
(séquentiel, donc trivialement énumérable), **uniquement** par le hash
d'un token opaque de 256 bits.

- Route de suivi : `GET /support/suivi?token=...` — unique paramètre
  accepté, `numero_public`/`id` refusés même en fallback.
- Fonction de lecture dédiée `obtenirTicketParToken(rawToken)` — jamais de
  réutilisation de `obtenirTicketAgent()` ni `obtenirTicketCitoyen()`.
  Projection minimale : `numero_public`, `categorie`, `sujet`, `statut`,
  `messages`. **Jamais** `support_ticket_events` exposé.
- Consommation : `purpose='verification'` = usage unique. `purpose=
  'suivi'` = réutilisable jusqu'à expiration.
- Rotation/invalidation : un agent qui clôture un ticket **révoque** le
  token de suivi actif.
- Aucune énumération possible : `token_hash` `UNIQUE`, 256 bits — le
  risque résiduel réel est la fuite du lien, pas la force brute.

---

## 8. Sécurité / anti-abus

- **Rate limiting edge** (`lib/edgeSecurity.ts::estRateLimite`) — entrée
  `ENDPOINTS_SENSIBLES` dédiée pour `/api/support/public/tickets`
  (proposition 5-10 req/min/IP) et `/api/support/public/verify` /
  `/support/suivi`.
- **Rate limiting applicatif par email** — comptage des lignes
  `support_tickets` avec `visiteur_email = X` sur 24h, plafond à définir
  (ex. 3/jour) — voir aussi §2.6 pour le signal long terme.
- **Signatures UA connues** (`estUserAgentSuspect`) réutilisable telle
  quelle.
- **Honeypot** — repris tel quel du formulaire `/contact` actuel.
- **Validation serveur stricte** — catégorie vérifiée contre la liste
  CHECK réelle, jamais côté UI seul.
- **CAPTCHA / anti-bot tiers** : **confirmé absent en V1** (décision
  Bryan 24/09/2026).
- **Postmark — Bounce / Spam Complaint webhooks (§16)** comme signal
  anti-abus supplémentaire : une adresse qui rebondit ou une plainte spam
  alimente `support_public_signal_log`, aucune action automatique
  construite dessus en V1 (collecte du signal seulement).
- **Séparation données publiques / données agent** : la route de suivi
  n'a accès qu'à `obtenirTicketParToken()` ; jamais aux fonctions agent,
  jamais à `support_ticket_events`.
- **Aucune trace en clair du token** : ni logs serveur, ni
  `support_ticket_events.commentaire` — seul le hash existe en base.

---

## 9. Impact `/admin/support`

Fichier `app/admin/support/page.tsx` — actuellement (ligne 22) :
```ts
origine: 'citoyen' | 'institution'; citoyen_nom: string | null; institution_nom: string | null;
```
et (ligne 35-36) :
```ts
function requerantNom(item: { citoyen_nom: string | null; institution_nom: string | null }): string {
  return item.institution_nom ?? item.citoyen_nom ?? 'Inconnu'
}
```
Changement additif :
- `origine` élargi à `'citoyen' | 'institution' | 'public'`.
- `visiteur_nom` ajouté au type local, `requerantNom()` devient
  `institution_nom ?? citoyen_nom ?? visiteur_nom ?? 'Inconnu'`.
- Badge visuel supplémentaire à côté de la ligne 203 pour `'public'`.

`lib/supportTickets.ts::fileAttenteAgent()` — **changement obligatoire** :
la ligne `filtreStatut ? all.filter(...) : all.filter(t => t.statut !==
"cloture")` laisserait passer un ticket `attente_verification` par défaut
(il n'est pas `cloture`). Exclure explicitement `attente_verification` du
jeu "visibles" par défaut. `compteurs` : recommandation de ne pas le
compter (un agent ne peut rien faire d'un ticket non vérifié).

`obtenirTicketAgent()` / `prendreEnCharge()` / `envoyerMessageAgent()` /
`resoudreTicket()` / `cloturerTicket()` : ajouter `else if
(ticket.visiteur_email)` appelant `notifierVisiteurParEmail()` (Postmark,
§6). Aucune autre logique de ces fonctions ne change.

---

## 10. Impact `/contact`

**Aucun changement d'URL ni de renommage des 21 liens existants dans
cette V1.**

Ce qui change dans `app/contact/page.tsx` le jour de l'implémentation :
- Le `fetch()` client-side vers `https://formsubmit.co/ajax/...` est
  remplacé par un appel à `POST /api/support/public/tickets` — le
  navigateur ne parle plus directement à FormSubmit.co (voir aussi §11,
  impact CSP). La notification à l'équipe Yelen (FormSubmit.co,
  `Sempya224@proton.me`) part désormais serveur à serveur depuis cette
  route.
- Champ téléphone : facultatif pour toutes les catégories (verrouillé).
- L'écran de succès devient "Vérifiez votre email" (§4 étape 3).
- Les 4 types de formulaire actuels se remappent vers les catégories §3 :
  `general`→`general`, `institution`→`rejoindre_yelen`,
  `presse`→`presse`, `support`→`technique`.
- Le bloc "Email direct" et les sièges/téléphones en dur restent
  inchangés.

---

## 11. Dépendances

- **21 fichiers** pointent vers `/contact` — tous de simples
  `<Link href="/contact">`, zéro impact tant que l'URL ne change pas.
- **CSP** (`proxy.ts:166,189`) : l'entrée `connect-src ...
  https://formsubmit.co` devient supprimable une fois la bascule faite —
  pas parce que FormSubmit.co est retiré (il reste utilisé côté serveur
  pour la réception équipe), mais parce que l'appel devient serveur à
  serveur, non soumis à la CSP du navigateur. **Nouvelle entrée
  nécessaire** : `connect-src` n'a pas besoin d'inclure Postmark (les
  appels API Postmark se font aussi serveur à serveur), mais `img-src`
  n'est pas concerné non plus (aucun tracking pixel, §16) — **aucun
  changement CSP additionnel lié à Postmark**, uniquement le retrait
  progressif de l'entrée FormSubmit côté navigateur.
- **`app/faq/page.tsx`** : coordonnées dupliquées en dur, drift déjà
  documenté, hors périmètre de ce chantier.
- **`lib/supportTicketsConstants.ts`** : source unique partagée
  client/serveur, nouvelles valeurs ajoutées ici uniquement.
- **`lib/edgeSecurity.ts`** : réutilisé tel quel, une entrée
  `ENDPOINTS_SENSIBLES` ajoutée.
- **Postmark** : nouvelle dépendance externe, verrouillée (§6). Nécessite
  un compte Postmark, un Server dédié, et **un domaine réel avec accès
  DNS** (§14 — marqué "à venir", pas bloquant compte tenu du lancement
  prévu février 2027, voir aussi §19).

---

## 12. Migration SQL exacte

Une seule migration additive (pas de backfill, aucune donnée existante
affectée) :

```sql
-- 1) support_tickets : colonnes visiteur + statut attente_verification
ALTER TABLE support_tickets
  ADD COLUMN visiteur_nom       text,
  ADD COLUMN visiteur_email     text,
  ADD COLUMN visiteur_telephone text,
  ADD COLUMN email_verifie_le   timestamptz;

ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_une_seule_origine;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_une_seule_origine
  CHECK (
    (CASE WHEN citoyen_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN institution_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN visiteur_email IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_statut_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_statut_check
  CHECK (statut IN ('attente_verification','attente_agent','en_cours','resolu','cloture'));

ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_categorie_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_categorie_check
  CHECK (categorie IN (
    'compte','reservation','paiement','etablissement','securite','technique','autre',
    'facturation','client','partenariat',
    'general','rejoindre_yelen','presse','commercial','signalement_general'
  ));

CREATE INDEX support_tickets_visiteur_idx ON support_tickets (visiteur_email, cree_le DESC) WHERE visiteur_email IS NOT NULL;
-- Purge quotidienne (§17) : cible directement les lignes attente_verification anciennes.
CREATE INDEX support_tickets_purge_idx ON support_tickets (statut, cree_le) WHERE statut = 'attente_verification';

-- 2) support_ticket_messages : expediteur_type élargi
ALTER TABLE support_ticket_messages DROP CONSTRAINT support_ticket_messages_expediteur_type_check;
ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_messages_expediteur_type_check
  CHECK (expediteur_type IN ('citoyen','agent','institution','visiteur'));

-- 3) support_ticket_events : acteur_type + type élargis
ALTER TABLE support_ticket_events DROP CONSTRAINT support_ticket_events_acteur_type_check;
ALTER TABLE support_ticket_events ADD CONSTRAINT support_ticket_events_acteur_type_check
  CHECK (acteur_type IN ('citoyen','agent','system','institution','visiteur'));

ALTER TABLE support_ticket_events DROP CONSTRAINT support_ticket_events_type_check;
ALTER TABLE support_ticket_events ADD CONSTRAINT support_ticket_events_type_check
  CHECK (type IN ('created','assigned','message_sent','resolved','reopened','closed','email_verifie'));

-- 4) support_ticket_public_tokens (schéma complet §2.4)
CREATE TABLE support_ticket_public_tokens ( /* voir §2.4 */ );

-- 5) support_public_signal_log (schéma complet §2.6)
CREATE TABLE support_public_signal_log ( /* voir §2.6 */ );

-- 6) Fonction + job de purge (détail complet §17)
CREATE OR REPLACE FUNCTION support_tickets_purger_non_verifies() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM support_tickets
  WHERE statut = 'attente_verification' AND cree_le < now() - interval '7 days';
END;
$$;

SELECT cron.schedule('support-tickets-purge-non-verifies', '0 3 * * *',
  $$SELECT support_tickets_purger_non_verifies();$$);
```

`lib/supportTicketsConstants.ts` (pas SQL, mais partie intégrante de la
même livraison) : ajout `SUPPORT_CATEGORIES_PUBLIC`, labels associés,
`attente_verification` dans `SUPPORT_STATUTS`/`SUPPORT_TRANSITIONS`,
`email_verifie` dans `SUPPORT_EVENT_TYPES`.

**Nom exact des contraintes à vérifier avant écriture réelle** :
`support_tickets_statut_check` n'a pas de nom explicite confirmé dans les
migrations lues (la contrainte `statut` de `20260904000001` est inline,
sans `CONSTRAINT nom`) — **à vérifier via `information_schema` par Bryan**
avant d'écrire cette migration, le nom auto-généré par Postgres devra être
utilisé ou la contrainte réécrite proprement avec un nom explicite à
cette occasion.

---

## 13. Secrets & variables d'environnement — Postmark

| Variable | Rôle | Portée |
|---|---|---|
| `POSTMARK_SERVER_TOKEN` | Jeton API du Server Postmark dédié au Support public Yelen (Server séparé recommandé, pas partagé avec un futur usage Postmark non lié au support) | Serveur uniquement, jamais exposé client |
| `POSTMARK_MESSAGE_STREAM` | Stream Postmark utilisé (`outbound` par défaut) — explicite plutôt qu'implicite | Serveur |
| `POSTMARK_FROM_EMAIL` | Adresse d'expédition sur le domaine vérifié (ex. `support@yelen224.com`, exacte à confirmer avec §14) | Serveur |
| `POSTMARK_WEBHOOK_BASIC_AUTH_USER` / `POSTMARK_WEBHOOK_BASIC_AUTH_PASS` | Postmark ne signe pas ses webhooks (pas de HMAC comme Stripe) — sécurisation par Basic Auth intégré à l'URL du webhook (`https://user:pass@yelen224.com/api/...`), recommandation officielle Postmark | Serveur, jamais exposé |
| `POSTMARK_TEMPLATE_VERIFICATION_ID` / `_CONFIRMATION_ID` / `_REPONSE_ID` / `_RESOLUTION_ID` | Si templates gérés depuis le dashboard Postmark (§15, option recommandée) | Serveur |

Aucun de ces secrets n'existe aujourd'hui dans le projet — tous à ajouter
sur Netlify **et** en local, même discipline que les secrets déjà listés
dans `/actions-manuelles-en-attente` de CLAUDE.md.

---

## 14. DNS — domaine d'envoi Postmark

**Marqué "à venir" (24/09/2026)** : Postmark exige un **domaine réel avec
accès DNS en écriture** pour la vérification complète (DKIM +
Return-Path), indépendamment du domaine sur lequel l'application est
actuellement déployée. Le projet est aujourd'hui sur un sous-domaine
`*.netlify.app` (pivot sécurité de septembre 2026, pas encore basculé sur
un domaine personnalisé) — or on **ne peut pas** poser d'enregistrements
DKIM/Return-Path sur `*.netlify.app` (DNS non contrôlé par Yelen). **Pas
bloquant pour la suite de la conception** : le produit vise un lancement
en février 2027, la fenêtre est large — décision explicite de Bryan de
traiter ce point plus tard plutôt que maintenant. À trancher avant la
**mise en œuvre réelle** de Postmark (pas avant la conception) : Yelen
possède-t-il déjà l'enregistrement du nom de domaine `yelen224.com` (ou
équivalent) chez un registrar, même sans que le site y soit encore
pointé ? Si oui, les enregistrements ci-dessous peuvent être ajoutés sur
ce domaine uniquement **pour l'envoi d'email**, sans toucher à
l'hébergement du site (ce sont deux DNS indépendants — un enregistrement
TXT/CNAME pour l'email n'affecte pas où le site est servi).

Enregistrements requis (valeurs exactes générées par Postmark au moment
de l'ajout du domaine dans son dashboard — non fabriquées ici) :

| Type | Usage | Exemple de forme |
|---|---|---|
| TXT | DKIM — clé de signature 1024 bits générée par Postmark | Hostname + valeur fournis par Postmark, propres à chaque domaine |
| CNAME | Return-Path (bounce) | `pm-bounces.yelen224.com` → `pm.mtasv.net` |
| TXT | SPF | `v=spf1 include:spf.mtasv.net ~all` — **à fusionner**, pas à écraser, si un enregistrement SPF existe déjà sur le domaine pour un autre usage (ex. Google Workspace) |

DKIM se vérifie sous 48h après ajout côté Postmark. Tant que DKIM/SPF ne
sont pas vérifiés, Postmark peut envoyer via une "Sender Signature" simple
(email unique confirmé par clic, sans DNS) — **suffisant pour un premier
test technique**, mais déconseillé en production (délivrabilité moindre,
pas d'alignement DMARC).

**Réception future (§6, non construite en V1)** : ne nécessite **aucun**
DNS supplémentaire si on utilise l'adresse d'ingestion Postmark générique
(`hash@inbound.postmarkapp.com`) comme `Reply-To` — un MX personnalisé
(`inbound.yelen224.com`) ne serait utile que pour une adresse de réponse
à l'image de marque Yelen, optionnel et non nécessaire pour que la
fonctionnalité existe techniquement.

---

## 15. Templates transactionnels

4 templates nécessaires (§6) : `verification-email`,
`confirmation-demande`, `reponse-agent`, `resolution`.

**Deux options d'implémentation, à trancher (détail mineur, non
bloquant)** :
- **A — Templates Postmark (dashboard)** : chaque template a un
  Alias/ID Postmark, le code envoie `TemplateAlias` + variables
  (`{{lien_suivi}}`, `{{numero_public}}`, etc.) — permet d'éditer le texte
  sans redéploiement de code. Nécessite les 4 `POSTMARK_TEMPLATE_*_ID`
  (§13).
- **B — HTML généré côté code** : contenu construit dans
  `lib/supportEmail.ts` (chaînes TypeScript), cohérent avec la pratique
  actuelle du projet (100% du contenu produit est aujourd'hui codé en dur,
  aucun CMS) — pas de nouveau secret, mais toute correction de texte
  nécessite un déploiement.

Recommandation : **A**, pour la même raison que tout contenu éditorial
sensible au ton (cohérent avec la discipline déjà appliquée aux articles
du Help Center prestataire) — mais choix sans impact architectural,
réversible facilement.

Contenu de chaque template — texte minimal, jamais le message du visiteur
en clair (verrouillé §4) :
- `verification-email` : lien de vérification, expiration 24h annoncée.
- `confirmation-demande` : numéro de référence, lien de suivi (30 jours).
- `reponse-agent` : "Yelen Support a répondu à votre demande", lien de
  suivi uniquement.
- `resolution` : "Votre demande a été résolue/clôturée", lien de suivi.

---

## 16. Webhooks Postmark

| Webhook | Utilité V1 | Action |
|---|---|---|
| **Bounce** | Oui | Alimente `support_public_signal_log` (signal anti-abus/qualité, §2.6) — aucune action automatique sur le ticket en V1 |
| **Spam Complaint** | Oui | Idem — Postmark peut suspendre l'envoi si le taux de plaintes grimpe, autant le savoir tôt |
| **Delivery** | Non nécessaire en V1 | — |
| **Open / Click** | **Non recommandé** | Introduirait un tracking du comportement du visiteur non nécessaire au produit — écarté par cohérence avec la sensibilité du projet aux données personnelles, pas juste "pas construit" |
| **Inbound** | Non construit en V1 (§6) | Architecture non bloquante préservée |

Sécurisation : Postmark ne signe pas ses payloads (pas de HMAC) — les
endpoints webhook doivent être protégés par **Basic Auth intégré à l'URL**
configurée dans Postmark (`POSTMARK_WEBHOOK_BASIC_AUTH_USER/_PASS`, §13),
recommandation officielle Postmark. Chaque webhook = une route Next.js
dédiée (ex. `POST /api/support/public/webhooks/postmark-bounce`), jamais
mélangée à la logique de `lib/supportTickets.ts`.

---

## 17. Mécanisme de purge — détail technique final

**Décision verrouillée (24/09/2026) : suppression physique réelle**, pas
une anonymisation.

**Contrainte technique initialement bloquante, résolue en §2.3** :
`support_ticket_events.ticket_id` référence `support_tickets(id)` en
`ON DELETE RESTRICT`, et cette table est immuable
(`support_ticket_events_immuable` bloque `UPDATE`/`DELETE` même pour
`service_role`). Une suppression physique était donc impossible tant que
l'événement `created` existait dès la création. **Résolu** en différant
l'écriture de cet événement à la vérification (§2.3) : un ticket jamais
vérifié n'a **strictement aucune ligne** dans `support_ticket_events` —
la contrainte `RESTRICT` ne se déclenche jamais pour ces tickets, et
l'invariant d'immuabilité de la table reste intact pour tous les tickets
réellement audités (citoyen, institution, et public une fois vérifié).

Mécanique de suppression :
```sql
DELETE FROM support_tickets
WHERE statut = 'attente_verification' AND cree_le < now() - interval '7 days';
```
- **`support_ticket_messages`** : `ON DELETE CASCADE` déjà en place
  (migration `20260904000001`) — supprimé automatiquement.
- **`support_ticket_public_tokens`** : `ON DELETE CASCADE` (§2.4) —
  supprimé automatiquement.
- **`support_ticket_events`** : zéro ligne à supprimer (jamais créée).
- **`support_public_signal_log`** : `ON DELETE SET NULL` (§2.6) — la
  ligne de signal **survit**, perd juste sa référence.

Planification : `pg_cron`, quotidien (`0 3 * * *`, heure creuse), même
famille d'infrastructure que `clock-in-daily-attendance` et le job de
posts planifiés (`job id 15`) déjà en place. Fonction idempotente (sans
effet si rien à purger), pas besoin d'une fréquence plus élevée qu'une
fenêtre de 7 jours.

**Ce que ce mécanisme ne fait jamais** : un ticket déjà vérifié
(`attente_agent` et au-delà) n'est **jamais** concerné par cette purge,
quelle que soit son ancienneté — seul l'état `attente_verification` est
ciblé. Un ticket réellement traité par un agent suit le cycle de vie
normal du moteur (`resolu`/`cloture`), jamais supprimé.

---

## 18. Plan de migration et rollback

### Ordre d'implémentation (aucune étape ne casse la précédente)

1. **Migration SQL** (§12) — additive, aucune donnée existante affectée,
   déployable indépendamment du code applicatif (colonnes/tables inertes
   tant que rien ne les référence).
2. **`lib/supportTicketsConstants.ts`** — ajouts additifs.
3. **`lib/supportTickets.ts`** — nouvelles fonctions
   (`creerTicketPublic()`, `obtenirTicketParToken()`,
   `notifierVisiteurParEmail()`) + modification minimale de
   `fileAttenteAgent()` (exclusion `attente_verification`) et des 4
   fonctions agent (`else if (ticket.visiteur_email)`). Seul point de
   cette liste qui touche un fichier partagé avec citoyen/institution —
   changement additif (`else if` qui ne matche jamais un ticket existant).
4. **`lib/supportEmail.ts`** (nouveau, isolé) — client Postmark.
5. **Nouvelles routes API** (`/api/support/public/tickets`,
   `/api/support/public/verify`, webhooks §16).
6. **Nouvelles pages** `/support/verifier`, `/support/suivi`.
7. **`app/contact/page.tsx`** — seul fichier existant et actuellement en
   production à modifier, en dernier, une fois tout le reste testé.
8. **`app/admin/support/page.tsx`** — badge/type origine `public`.
9. **Job `pg_cron`** de purge (§17).
10. **Configuration Postmark** (compte, Server, domaine DNS §14,
    templates §15, webhooks §16) — infra, côté Bryan, doit être opérationnelle
    **avant** l'étape 7 en production (sinon les visiteurs ne reçoivent
    jamais leur email de vérification).

**Recommandation** : un interrupteur applicatif (`SUPPORT_PUBLIC_ENABLED`,
env var) gating l'appel réel à `/api/support/public/tickets` depuis
`/contact` — permet de désactiver instantanément le nouveau parcours sans
redéploiement si un problème apparaît en prod, en repli sur l'ancien
comportement FormSubmit le temps de corriger.

### Rollback

- **Avant l'étape 7** (aucun visiteur n'a encore utilisé le nouveau
  parcours) : rollback trivial à n'importe quelle étape — tables/colonnes
  additives supprimables sans conséquence (`DROP TABLE`/`DROP COLUMN`,
  restauration des contraintes 2 voies), aucune donnée réelle en jeu.
- **Après l'étape 7, avant que de vrais tickets publics existent** :
  revert de `app/contact/page.tsx` à la version FormSubmit précédente
  (un seul fichier, immédiat) — le reste de l'infrastructure reste en
  place, inerte, sans urgence de nettoyage.
- **Après que de vrais tickets publics existent** : revenir en arrière au
  niveau schéma (retirer les valeurs `visiteur`/`attente_verification`
  des CHECK) devient **destructif** pour ces lignes — même règle que
  partout ailleurs dans le projet ("jamais de CHECK rétréci après des
  données réelles"). Dans ce cas, le rollback s'arrête au niveau
  applicatif (couper `SUPPORT_PUBLIC_ENABLED`, afficher un message
  "temporairement indisponible, écrivez-nous à Sempya224@proton.me" sur
  `/contact`) — toute décision de rollback schéma attend une décision
  explicite sur le sort des tickets déjà créés.
- **Job `pg_cron` de purge** : `cron.unschedule('support-tickets-purge-
  non-verifies')` — réversible instantanément, aucune conséquence sur les
  données déjà supprimées (elles restent supprimées, la purge n'étant pas
  rétroactive au-delà de ce qu'elle a déjà exécuté).
- **Postmark** : aucun risque de rollback côté Yelen — couper l'appel via
  `SUPPORT_PUBLIC_ENABLED` suffit à arrêter tout envoi immédiatement.

---

## 19. Récapitulatif des décisions et questions restantes

### Tranché

| Point | Décision |
|---|---|
| Réutilisation du moteur `support_tickets` | Oui, 3ᵉ origine `visiteur`, zéro système parallèle |
| Token de vérification | 24h, usage unique |
| Token de suivi | 30 jours, non renouvelé silencieusement |
| Ticket jamais vérifié | **Suppression physique réelle** à 7 jours (§17), résolue via l'écriture différée de l'événement `created` (§2.3) |
| Anti-abus | Table séparée `support_public_signal_log`, TTL indépendant du ticket (§2.6) |
| Contenu des emails au visiteur | Lien + contexte minimal uniquement |
| Téléphone | Facultatif pour toutes les catégories en V1 |
| CAPTCHA / anti-bot tiers | Absent en V1 |
| Évaluation de fin de conversation | Hors V1 |
| FormSubmit.co | Conservé, réception équipe Yelen uniquement, destination `Sempya224@proton.me` |
| Fournisseur email transactionnel visiteur | **Postmark** |
| Webhooks Postmark V1 | Bounce + Spam Complaint uniquement, pas d'Open/Click (choix délibéré), pas d'Inbound |
| Réception email entrante | Architecture non bloquante préservée, non construite en V1 |
| `/contact` vs `/support` | Décision reportée après construction du système |

### Encore ouvert

1. **Contrôle DNS d'un domaine réel pour Postmark** (§14) — **marqué "à
   venir", pas bloquant** (décision Bryan 24/09/2026 : lancement produit
   prévu février 2027, fenêtre large pour trancher ce point avant la mise
   en œuvre réelle). Yelen a-t-il déjà `yelen224.com` (ou équivalent)
   enregistré chez un registrar, indépendamment de l'hébergement actuel
   sur `*.netlify.app` ? Nécessaire uniquement pour la vérification
   complète du domaine d'envoi (DKIM/Return-Path), pas pour la conception
   qui suit.
2. **Format des templates transactionnels** (§15) — dashboard Postmark
   (recommandé) vs HTML codé en dur : détail d'implémentation réversible,
   pas structurant.
3. **TTL de `support_public_signal_log`** (§2.6) — proposition 90 jours,
   à confirmer.
