# YELEN Accueil — Check-in mobile isolé (mini-conception)

## MISE À JOUR — 13/09/2026 : arbitrages retenus et implémentation livrée

Bryan a tranché les 8 points ouverts de la section 10 et demandé
l'implémentation complète en une passe ("continue de bout en bout"), après
correction préalable en P0 de GAP-05-01/GAP-07-01 sur
`app/api/qr/validate/route.ts` (voir
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`).

**Arbitrages retenus (remplacent les options ouvertes de la section 10)** :
- Route publique : **`/check-in/{slug}`** (pas `/accueil/{slug}`).
- **Pas de QR Agent en V1** — authentification par identifiant court + PIN,
  réutilisant exactement `institution_membres.identifiant`/`pin_hash`
  (même credential que la connexion dashboard `membre/login`). QR Agent
  reporté à une V2 tablette/poste partagé, architecture non bloquée pour
  autant (aucune dépendance codée en dur qui l'empêcherait).
- Session Check-in dédiée, scope strict, **8h maximum absolu** (non
  glissant), **verrou d'inactivité 2 minutes** (déverrouillage par PIN
  seul tant que la session de 8h n'a pas expiré).
- Échec PIN : 5 tentatives, verrouillage **30 minutes** (plus strict que
  les 5 minutes du dashboard `membre/login` — mêmes colonnes
  `failed_attempts`/`locked_until`, donc le verrou le plus strict posé par
  l'un des deux flux s'applique aussi à l'autre, jamais l'inverse).
- **Code manuel de secours livré** pour les RDV gratuits (`rdv.code_secours`,
  8 caractères, alphabet sans caractères ambigus, même cycle de vie que
  `qr_token`) — pas seulement documenté comme point ouvert.
- Réponse API minimale : prénom + initiale du nom, heure, service, statut —
  jamais téléphone/nom complet (route dédiée `/api/checkin/scan`, distincte
  de `/api/qr/validate` qui garde sa réponse complète pour le dashboard).
- Historique visible : liste des validations de la session en cours
  uniquement (état React côté client, jamais persisté/interrogé côté
  serveur comme un historique global).
- Offline : **aucune validation possible hors ligne en V1** — message
  bloquant explicite, pas de file d'attente/synchronisation différée.

**Fichiers livrés** (détail des sections 2/4/5/6/7/8 ci-dessous, conservées
telles quelles pour la trace de conception d'origine — le code réel fait
foi en cas d'écart) :
- Migrations : `20260913000001_checkin_sessions.sql` (table
  `checkin_sessions` + `rdv.code_secours`/`code_secours_expires_at`),
  `20260913000002_auth_security_checkin_login.sql` (catégories
  `checkin_login`/`checkin_code_manuel` sur `auth_security_events`).
- `lib/checkinAuth.ts`, `lib/qrValidation.ts` (extraction partagée avec
  `/api/qr/validate`, voir GAP-05-01/07-01), `lib/institutionPermissions.ts`
  (`appointment.check_in`), `lib/security/authSecurity.ts` (2 nouvelles
  catégories).
- Routes : `app/api/checkin/auth`, `/me`, `/unlock`, `/logout`, `/scan`,
  `/confirm`. `app/api/qr/generate/route.ts` étendu (génère `code_secours`
  en même temps que `qr_token`).
- Front : `app/check-in/[slug]/layout.tsx` (minimal, pattern
  `app/clock/[slug]/layout.tsx`), `page.tsx` (branding par slug, jamais
  utilisé pour l'autorisation), `CheckInApp.tsx` (écrans complets).
- Tests : `app/api/checkin/auth/route.test.ts`,
  `app/api/checkin/scan/route.test.ts`,
  `app/api/checkin/confirm/route.test.ts`.

**Simplifications assumées, à arbitrer si besoin** :
- L'extraction de la caméra n'a **pas touché** `app/[slug]/[id]/layout.tsx`
  (risque jugé disproportionné sur ce fichier déjà volumineux et hors
  périmètre) — `CheckInApp.tsx` réimplémente le même cycle de vie
  `html5-qrcode` (mêmes paramètres, même contournement iOS Safari) plutôt
  que d'importer un composant partagé. ~30 lignes dupliquées, documentées
  comme telles.
- 2FA TOTP dashboard **non vérifiée** par `/api/checkin/auth` même si
  activée sur le compte — proportionné au scope étroit (check-in
  uniquement), mais jamais explicitement demandé par Bryan : à confirmer.
- Pas de retry sur collision `code_secours` (index unique) — risque jugé
  négligeable au volume actuel du produit (~21 RDV, cf. CLAUDE.md), à
  revoir si le volume change significativement.
- Aucun test end-to-end réel (navigateur mobile, vraie base Supabase) —
  seulement des tests vitest avec Supabase simulé. **Migrations exécutées
  en base par Bryan le 13/09/2026** (les deux). Rien commité/déployé.
  Reste : `CHECKIN_JWT_SECRET` (variable d'environnement, local + Netlify),
  puis `npx vitest run` + `npx tsc --noEmit`, puis test réel sur téléphone.

---

Statut initial (avant les arbitrages ci-dessus) : **document de
conception, aucun code écrit**. Périmètre confirmé par
Bryan (13/09/2026) : **RDV gratuits uniquement**. Les réservations payantes
(`paid_bookings`) ont déjà leur propre flux de validation par
`confirmation_code` (`app/api/institution/paid-bookings/valider/route.ts`) —
non touché, non dupliqué ici.

Cible : `institution_membres` rôle **agent d'accueil** (et **admin**, qui a
tous les droits par construction). Comptable/superviseur/dirigeant exclus
(cohérent avec `TAB_MATRIX.scanner` actuel — voir §7).

---

## 1. Composants/infra existants réutilisés (audit du code réel)

| Élément | Fichier | Réutilisation |
|---|---|---|
| Génération QR RDV (payload signé HMAC, sans PII) | `app/api/qr/generate/route.ts` | inchangé, déjà correct (`QR_SECRET_KEY`, cycle borné, une seule régénération finale) |
| Validation scan (institution, token, expiration, créneau, anti-double-scan) | `app/api/qr/validate/route.ts` POST | logique métier à **extraire** dans une fonction partagée (voir §3) |
| Confirmation présence (transition `presence_status`, journal, notifications) | `app/api/qr/validate/route.ts` PUT | idem, à extraire |
| UI caméra + résultat + "Scanner suivant" | `ScannerModal` (fonction interne, `app/[slug]/[id]/layout.tsx:1460-1630`) | **pas un composant séparé** contrairement à l'hypothèse initiale — à extraire dans un fichier autonome, `html5-qrcode` déjà en dépendance |
| Auth membre identifiant+PIN (bcrypt, verrouillage, rate-limit) | `app/api/institution/auth/membre/login/route.ts` | **modèle** à répliquer pour le PIN, mais **pas la session** (elle ouvre le dashboard complet — voir §6) |
| Pattern session révocable (`sid` + table dédiée) | `lib/institutionAuth.ts` (`institution_sessions`, `sessionValide`) | **pattern répliqué**, nouvelle table dédiée (§5) |
| Pattern JWT/cookie de population séparée | `lib/employeeAuth.ts` (`yelen224_employee_session`, secret distinct) | **pattern répliqué** pour `yelen224_checkin_session` |
| Anti-brute-force générique (device+IP, escalade) | `lib/security/authSecurity.ts` | réutilisé, nouvelle `AuthEndpointCategory` |
| RBAC (rôles, `TAB_KEYS`, `ActionKey`, `can()`) | `lib/institutionPermissions.ts` | étendu d'une clé (§7) |
| Route indépendante du dashboard (layout minimal, pas de chrome) | `app/clock/[slug]/layout.tsx` (`return children;`) | **précédent architectural direct** à copier (§4) |

### Constat important (à valider avec toi, pas un fix silencieux)
`app/api/qr/validate/route.ts` (POST et PUT) n'appelle **aucune vérification
de rôle** aujourd'hui — seul `getAuthenticatedMembre()` est vérifié. La seule
barrière actuelle est le masquage côté client (`TAB_MATRIX.scanner`), pas une
règle serveur. Concrètement : un membre `comptable` connecté au dashboard
pourrait aujourd'hui appeler cette route directement (hors UI) et valider une
présence. Ce chantier est l'occasion de corriger ce point en ajoutant un vrai
`can(role, "appointment.check_in")` server-side (§7) — à faire dans les deux
routes qui partageront la logique (dashboard existant + nouveau mobile),
sans changer le comportement pour `admin`/`agent`.

---

## 2. Fichiers à créer/modifier (vue d'ensemble, staging par lots à 2 fichiers max au moment du code)

**Nouveaux :**
- `app/accueil/[slug]/layout.tsx` — layout minimal (copie du principe `app/clock/[slug]/layout.tsx`)
- `app/accueil/[slug]/page.tsx` — orchestrateur d'écrans (login QR+PIN → scanner → fiche → confirmation)
- `lib/checkinAuth.ts` — équivalent `employeeAuth.ts` pour la session check-in
- `lib/qrValidation.ts` — logique métier extraite de `qr/validate/route.ts` (partagée dashboard + mobile)
- `app/api/checkin/agent/identify/route.ts` — POST, résout le QR agent (étape 1)
- `app/api/checkin/agent/verify-pin/route.ts` — POST, vérifie le PIN + ouvre la session (étape 2)
- `app/api/checkin/scan/route.ts` — POST, wrapper mince sur `lib/qrValidation.ts` (auth = session check-in)
- `app/api/checkin/confirm/route.ts` — PUT, idem pour la confirmation présence
- `app/api/checkin/unlock/route.ts` — POST, ré-authentification PIN seule après verrouillage inactivité (pas de re-scan QR)
- `app/api/checkin/logout/route.ts` — POST, révoque la session check-in
- `app/api/institution/equipe/checkin-qr/route.ts` — POST (générer/régénérer), DELETE (révoquer) le QR agent — exposé depuis `EquipeTab.tsx`, admin uniquement
- `supabase/migrations/2026XXXXXXXXXX_checkin_agent_qr.sql`
- `supabase/migrations/2026XXXXXXXXXX_checkin_sessions.sql`

**Modifiés :**
- `app/api/qr/validate/route.ts` — POST/PUT réduits à appeler `lib/qrValidation.ts` + ajout `can(role,"appointment.check_in")`
- `lib/institutionPermissions.ts` — nouvelle `ActionKey: "appointment.check_in"`
- `lib/security/authSecurity.ts` — nouvelle `AuthEndpointCategory: "checkin_qr_auth"`
- `app/[slug]/[id]/components/EquipeTab.tsx` — bouton "Générer QR agent" / "Régénérer" / "Révoquer" sur la fiche d'un membre `agent`

Aucun de ces fichiers n'est encore touché — liste de portée, pas un commit en préparation.

---

## 3. Route proposée

```
yelen224.com/accueil/{slug}
```

Choix motivé par le précédent `/clock/{slug}` déjà en production (population
distincte, layout minimal, pas de nesting sous `[slug]/[id]/`). **Impératif
technique, pas un choix esthétique** : `app/[slug]/[id]/layout.tsx` (la
fonction `InstitutionLayout`, ligne 5277) rend l'intégralité du dashboard —
sidebar, topbar, 30+ onglets — puis `{children}` seulement ensuite (ligne
5285). Toute route créée sous `app/[slug]/[id]/**` (ex. `.../accueil`)
monterait donc obligatoirement tout le dashboard en arrière-plan, ce que le
brief interdit explicitement. La route doit vivre **en dehors** de cet arbre,
comme `/clock/[slug]`.

`{slug}` = `institutions.slug` (déjà utilisé par `/clock/{slug}`), résolu
côté serveur vers `institution_id` — jamais un ID exposé directement dans
l'URL publique par souci de cohérence avec l'existant.

---

## 4. Modèle du QR Agent et stockage

Ajout à `institution_membres` (migration dédiée) :

| Colonne | Type | Rôle |
|---|---|---|
| `checkin_qr_hash` | text, unique, nullable | SHA-256 hex d'un token opaque 32 octets aléatoires (`crypto.randomBytes(32)`) — jamais le token en clair en base, même si le token seul ne suffit pas à s'authentifier |
| `checkin_qr_generated_at` | timestamptz, nullable | traçabilité génération/régénération |
| `checkin_qr_revoked_at` | timestamptz, nullable | révocation (badge/téléphone perdu) sans supprimer l'historique |
| `checkin_qr_revoked_reason` | text, nullable | ex. "badge perdu", "régénération" |

Contenu du QR (imprimé/affiché, jamais transmis en clair au-delà du scan) :

```
yelen://agent-auth/v1/<token-clair-32-octets-hex>
```

Le token clair n'existe **que** dans le QR physique/affiché — le serveur ne
connaît que son hash, exactement le même principe que
`institutions.mot_de_passe_hash` ou `users.pin_hash` : une fuite de la base
ne permet pas de reconstruire un QR utilisable. Recherche par
`checkin_qr_hash = sha256(token_scanné)` (déterministe, comparaison en temps
constant côté égalité SQL — acceptable ici car ce n'est qu'une étape
d'**identification**, pas d'authentification : le PIN reste requis après).

Génération/régénération : bouton admin dans `EquipeTab.tsx` sur la fiche d'un
membre `agent` — jamais auto-générée à la création du compte (décision par
défaut proposée, à confirmer §10). Une régénération invalide immédiatement
l'ancien QR (`checkin_qr_revoked_at` posé, nouveau hash émis) — l'admin doit
réimprimer/renvoyer le badge.

---

## 5. Flux d'authentification QR + PIN

**Écran 1 — Identification (`POST /api/checkin/agent/identify`)**
1. Scan du QR agent → `token` extrait côté client.
2. `POST { token }` → recherche `checkin_qr_hash = sha256(token)`,
   `checkin_qr_revoked_at IS NULL`, `actif = true`.
3. Anti-énumération : réponse `404` générique identique que le token soit
   inconnu, révoqué, ou le membre inactif (jamais distinguer ces cas au
   client — cohérent avec `membre/login` qui ne distingue pas "identifiant
   inconnu" de "PIN faux").
4. Vérifie `can(role, "appointment.check_in")` — un QR généré pour un agent
   ensuite rétrogradé/changé de rôle sans ce droit est refusé ici, pas
   seulement à l'usage.
5. Rate-limit device+IP via `authSecurity.ts` (`checkin_qr_auth`), **avant**
   la requête DB (même discipline que les autres routes d'auth).
6. Succès → renvoie un `challengeToken` (JWT courte durée, 2 min, contient
   `membreId` + `institutionId`, **aucune session encore ouverte**) et le
   prénom de l'agent ("Bonjour, Mariama") pour l'écran 2.

**Écran 2 — PIN (`POST /api/checkin/agent/verify-pin`)**
1. `POST { challengeToken, pin, devicePartage: boolean }`.
2. Vérifie `challengeToken` (signature + expiration 2 min — évite qu'un
   scan de QR agent laissé "en l'air" reste exploitable longtemps plus
   tard).
3. Relit `institution_membres` (l'agent a pu être désactivé entre les deux
   écrans), revérifie `actif`, `role`, `can(...)`, statut de l'institution
   (miroir exact du bloc `instStatut?.statut === "suspendue"` de
   `membre/login`).
4. `bcrypt.compare(pin, pin_hash)` — **réutilise le même `pin_hash` et les
   mêmes colonnes `failed_attempts`/`locked_until`** que le login dashboard
   classique (même credential, même protection anti-brute-force, pas de
   nouvelle surface à dupliquer).
5. Succès → crée une ligne `checkin_sessions` (§6), signe le JWT
   `yelen224_checkin_session`, journalise (`enregistrerAction`, action
   `checkin_connexion` — nouvelle valeur d'énum côté `journal_activite` si
   ce champ est contraint, à vérifier en base avant migration).
6. Redirection directe vers l'écran caméra (jamais d'écran intermédiaire).

**Pourquoi un `challengeToken` à 2 écrans plutôt qu'un seul appel** : évite
qu'un agent scanne son badge, pose le téléphone, et qu'un tiers tape un PIN
au hasard sans qu'aucune trace ne lie la tentative de PIN à une
identification récente et valide — même raisonnement que le flux TOTP
existant (`mintInstitutionTotpChallengeToken`).

---

## 6. Session limitée "checkin"

Nouvelle table `checkin_sessions` (miroir `institution_sessions`) :

```
id, membre_id, institution_id, device_partage boolean,
user_agent, ip, created_at, last_activity_at,
expires_at, revoked_at, revoked_reason
```

JWT `yelen224_checkin_session` :
- Secret dédié `CHECKIN_JWT_SECRET` (nouvelle variable d'env, jamais
  partagée avec `INSTITUTION_JWT_SECRET`/`EMPLOYEE_JWT_SECRET`).
- `issuer: "yelen224-checkin"`, `audience: "yelen224-checkin-mobile"` —
  un JWT institution ou employé valide ne peut structurellement pas être
  accepté par les routes `/api/checkin/*`, et inversement.
- Claims : `{ institutionId, membreId, role, sid, devicePartage }`.
- Portée fonctionnelle : `lib/checkinAuth.ts::getAuthenticatedCheckin()`
  n'est importé **que** par les 5 routes `/api/checkin/*` listées en §2 —
  aucune route dashboard ne doit jamais l'accepter comme alternative à
  `getAuthenticatedMembre()`.

Deux horloges distinctes (comme un poste de caisse) :
- **Expiration absolue** (`expires_at`) : fin de session dure, ex. 12h
  (durée d'une journée de travail) — au-delà, re-scan QR + PIN complet
  obligatoire, aucune exception.
- **Verrouillage d'inactivité** (comparé à `last_activity_at`, mis à jour à
  chaque appel `/api/checkin/scan|confirm`) : ex. 90s en mode partagé / 5
  min en mode personnel (valeurs à confirmer §10). Dépassement →
  `401 SESSION_LOCKED` ; l'écran affiche un pavé PIN (pas de re-scan QR) ;
  `POST /api/checkin/unlock { pin }` revérifie le PIN contre le même
  `pin_hash`, prolonge `last_activity_at`, **sans** émettre de nouveau JWT
  (même `sid`). Échec répété du déverrouillage → au bout de 3 essais,
  session révoquée, retour forcé à l'écran 1 (re-scan complet).

Le verrou d'inactivité est appliqué **côté serveur** (chaque route
`/api/checkin/*` vérifie `last_activity_at` avant d'exécuter quoi que ce
soit), pas seulement un timer d'interface — conforme à la recommandation
OWASP citée dans le brief : un timer uniquement client ne protège rien si
l'appareil reste allumé et que seul le JS est manipulé.

Révocation en cascade : compte `agent` désactivé, QR révoqué, ou rôle perdant
`appointment.check_in` → toute ligne `checkin_sessions` active de ce membre
doit être invalidée. Comme les sessions institution actuelles ne sont
révoquées qu'à l'usage (`sessionValide()` relit la table à chaque appel, pas
de push), le même mécanisme suffit ici : la prochaine requête `/api/checkin/*`
relit `institution_membres.actif`/`checkin_qr_revoked_at`/rôle en plus de
`checkin_sessions.revoked_at` — cohérent avec l'`instStatut` déjà revérifié à
chaque connexion dans `membre/login`.

---

## 7. Permissions

Nouvelle clé dans `lib/institutionPermissions.ts` :

```ts
export type ActionKey = ... | "appointment.check_in";

const ACTION_MATRIX = {
  ...
  "appointment.check_in": { admin: true, agent: true },
};
```

Choix `{ admin, agent }` : reproduit exactement `TAB_MATRIX.scanner` actuel
(seuls ces deux rôles ont `scanner: "full"`, tous les autres `"none"`) — zéro
changement de comportement pour les rôles existants, cette clé ne fait
qu'ajouter l'application serveur qui manquait (voir constat §1).

Vérifiée à **quatre** endroits (défense en profondeur, chacun couvrant un
contournement différent) :
1. `POST /api/checkin/agent/identify` (avant même le PIN).
2. `POST /api/checkin/agent/verify-pin` (re-vérifié, l'état a pu changer
   entre les deux écrans).
3. Chaque appel `/api/checkin/scan` et `/api/checkin/confirm`.
4. `POST /api/qr/validate` (dashboard existant) — ajouté rétroactivement
   pour fermer le gap constaté §1.

---

## 8. Endpoints réutilisés vs nouveaux

| Endpoint | Statut | Détail |
|---|---|---|
| `POST /api/qr/generate` | **inchangé** | déjà correct, génère toujours côté citoyen |
| `POST /api/qr/validate` | **modifié** | délègue à `lib/qrValidation.ts`, ajoute `can()` |
| `POST /api/checkin/agent/identify` | **nouveau** | §5 écran 1 |
| `POST /api/checkin/agent/verify-pin` | **nouveau** | §5 écran 2 |
| `POST /api/checkin/scan` | **nouveau (mince)** | auth = session checkin, appelle `lib/qrValidation.ts` (même fonction que `/api/qr/validate` POST) |
| `PUT /api/checkin/confirm` | **nouveau (mince)** | idem pour la confirmation présence |
| `POST /api/checkin/unlock` | **nouveau** | §6, PIN seul, pas de nouveau JWT |
| `POST /api/checkin/logout` | **nouveau** | révoque `checkin_sessions`, supprime le cookie |
| `POST/DELETE /api/institution/equipe/checkin-qr` | **nouveau** | admin uniquement, génère/révoque le QR d'un agent, gate `equipe.write` (déjà admin-only, réutilisé tel quel) |

Aucun endpoint payant (`paid-bookings/valider`) n'est touché.

---

## 9. Écrans, états, exceptions

7 états attendus par écran (discipline Mission 01 Hardening) :

**Écran "Scanner mon QR Agent"**
- Succès → écran PIN. Erreur QR inconnu/révoqué/rôle insuffisant → message
  générique + bouton "Réessayer" (jamais "compte désactivé" en clair — même
  logique anti-énumération que `membre/login`). Caméra indisponible →
  fallback texte "Entrer mon identifiant" (récupération contrôlée, pas un QR
  universel — coordonné avec §10, point ouvert). Offline → bloqué
  explicitement, "Connexion requise pour s'identifier" (l'identification ne
  peut pas être offline, contrairement au scan client, voir §10 offline).

**Écran "PIN"**
- PIN faux → message + compteur restant. Verrouillage (5 tentatives, miroir
  `MAX_ATTEMPTS`/`LOCK_MINUTES` de `membre/login`) → "Réessayez dans
  quelques minutes", retour écran 1 imposé après déblocage (pas de PIN
  laissé affiché indéfiniment). `challengeToken` expiré (>2 min) → retour
  forcé écran 1, message explicite.

**Écran "Scanner le QR du client"** (état par défaut après login/déverrouillage/confirmation)
- Caméra indisponible → **code manuel de secours** : un code court propre
  au RDV gratuit (voir point ouvert §10 — n'existe pas encore, à créer,
  distinct de `paid_bookings.confirmation_code`). QR déjà scanné par un
  autre agent entre-temps → message "Déjà confirmé" (le check `presence_status
  === "present"` dans `qr/validate` couvre déjà nativement l'unicité, aucun
  nouveau verrou nécessaire). Perte réseau pendant le scan → voir §11
  (jamais un succès affiché sans confirmation serveur).

**Écran "Rendez-vous trouvé"**
- Champs strictement minimaux : prénom + initiale nom, heure, objet/service
  — **jamais** téléphone/adresse/historique (le payload actuel de
  `qr/validate` renvoie déjà `citoyen_phone`, à **retirer** pour cette route
  mobile spécifiquement, cohérent avec "informations minimales" du brief ;
  le dashboard classique peut le garder, ce n'est pas le même contexte
  d'usage). RDV hors créneau (`creneauEstOuvert`) → écran dédié réutilisant
  `CheckInUnavailableDialog` déjà existant (`app/[slug]/[id]/components/CheckInUnavailableDialog.tsx`).
  QR expiré (régénérable ou définitif) → messages déjà rédigés dans
  `lib/rdvGating.ts` (`RDV_QR_EXPIRE_DEFINITIF_MESSAGE`), réutilisés tels
  quels.

**Écran "Confirmation"**
- Succès → auto-retour scanner après ~2s ou bouton explicite "Client
  suivant" (le brief demande les deux comportements à des endroits
  différents — à trancher §10). Échec serveur pendant la confirmation
  (PUT) → jamais un état "confirmé" affiché sans réponse 200 explicite ;
  retry manuel affiché, pas de retry automatique silencieux qui risquerait
  un double PUT (déjà protégé par idempotence, voir §11, mais l'UI ne doit
  pas laisser croire à un succès avant coup).

**Traitement d'exception dédié** (bouton "Signaler un problème" sur l'écran
fiche RDV, avant confirmation) — cas "présence refusée"/anomalie
constatée par l'agent (citoyen différent de la fiche, etc.) : réutilise
`action: "absent"` du PUT existant + champ commentaire optionnel routé vers
`journal_activite`, pas un nouveau statut RDV inventé.

---

## 10. Points nécessitant ton arbitrage

1. **Nom définitif de la route** : `/accueil/{slug}` vs `/checkin/{slug}` —
   `/clock/{slug}` existe déjà, `/accueil` pourrait entrer en collision de
   sens avec l'onglet dashboard "Accueil" (state React interne, pas une
   URL, donc pas de collision technique réelle, seulement de nommage).
2. **Génération QR agent** : automatique à la création d'un membre `agent`,
   ou bouton explicite admin à la demande (proposé par défaut ci-dessus) ?
3. **Durées exactes** : session absolue (proposé 12h), verrouillage
   d'inactivité (proposé 90s partagé / 5 min personnel), tentatives PIN
   avant blocage (proposé : réutiliser `MAX_ATTEMPTS=5`/`LOCK_MINUTES=5`
   existants de `membre/login`, même credential).
4. **Code manuel de secours pour RDV gratuit** : n'existe pas aujourd'hui
   (`confirmation_code` est spécifique aux `paid_bookings`). Faut-il un
   code court généré en parallèle du `qr_token` (même cycle de vie/
   expiration), ou considérer la caméra indisponible comme un cas rare
   traité par un mode dégradé différent (ex. recherche par nom+heure dans
   une liste limitée du jour, sans code du tout) ?
5. **Après confirmation** : retour auto au scanner après délai fixe, ou
   bouton "Client suivant" explicite (le brief mentionne les deux) ?
6. **Mode appareil partagé** : toggle explicite à l'écran PIN ("cet
   appareil est partagé") comme proposé, ou détection automatique
   (impossible à faire fiablement sans signal explicite — je recommande le
   toggle manuel) ?
7. **Admin inclus dans YELEN Accueil** : proposé oui (permission
   `appointment.check_in` commune) — confirmes-tu, ou le flux QR+PIN doit
   rester strictement réservé au rôle `agent` (l'admin utiliserait alors le
   scanner du dashboard classique, jamais ce parcours mobile) ?
8. **`journal_activite`** : ajouter une valeur d'action `checkin_connexion`
   suppose de vérifier d'abord si la colonne action est contrainte par une
   énumération DB ou juste un `text` libre (`lib/journalTaxonomie.ts` fait
   peut-être déjà foi) — à vérifier en base avant la migration, pas une
   hypothèse à valider ici.

---

## 11. Comportement offline et synchronisation idempotente

Contrainte du brief : **jamais** afficher une présence confirmée si le
serveur ne l'a pas réellement enregistrée. Conséquence directe : le scan et
la confirmation ne peuvent **pas** être des opérations "optimistes" classiques
en offline-first — c'est le comportement inverse du pattern habituel.

Proposition :
- **Identification agent (QR+PIN)** : nécessite systématiquement le réseau
  (pas de cache local de PIN/session hors ligne) — cohérent avec §9.
- **Scan client (lecture)** : peut être tenté hors-ligne (la caméra
  fonctionne offline), mais le résultat reste **en attente serveur** tant
  que `/api/checkin/scan` n'a pas répondu. Affichage explicite "Hors ligne
  — en attente de connexion" plutôt qu'un faux succès local.
- **File d'attente locale (queue)** : si plusieurs scans sont capturés hors
  ligne (caméra dispo, réseau coupé), les stocker localement avec un
  `client_scan_id` (UUID généré côté appareil) et les rejouer dès le retour
  réseau, dans l'ordre.
- **Idempotence de la confirmation** : `PUT /api/checkin/confirm` doit
  accepter un rejeu du même `rdv_id` sans erreur bloquante si déjà confirmé
  par **ce même appareil/session** (retourner `200` avec l'état déjà
  enregistré plutôt qu'une erreur "déjà confirmé" traitée comme un échec
  côté client) — distinct du cas "déjà confirmé par quelqu'un d'autre"
  (§9), qui doit lui rester un signal visible à l'agent. Le `client_scan_id`
  sert de clé de déduplication pour distinguer les deux cas.
- **Aucune confirmation locale ne doit être présentée comme définitive**
  tant que la réponse serveur n'est pas reçue — l'écran "Confirmation"
  (§9) n'apparaît qu'après un `200` réel, jamais en anticipation.

Ce point (offline réel) est le plus complexe du chantier — recommandation :
le traiter en V2 après une V1 qui exige simplement une connexion active
(comme le reste du dashboard aujourd'hui) et affiche un état "Hors ligne,
réessayez" bloquant plutôt que de construire la queue+dédup dès le départ.
À confirmer avec toi si cette réduction de portée V1 est acceptable.
