# Audit — Admin Entry Security V2 (WebAuthn)

Statut : **audit + conception uniquement, zéro implémentation**. Produit suite à la
décision CEO du 30/08/2026 retenant WebAuthn comme facteur d'entrée initial pour
remplacer `ADMIN_ENTRY_TOKEN`. Chaque affirmation ci-dessous est sourcée par une
lecture réelle du code (fichier + ligne), jamais une supposition.

## 1. Implémentations WebAuthn existantes — inventaire complet

Deux implémentations complètes et indépendantes existent déjà dans le projet,
**aucune troisième copie n'existe** (recherche exhaustive confirmée) :

| Domaine | Enregistrement (options + verify) | Authentification (options + verify) | Révocation |
|---|---|---|---|
| Citoyen | `app/api/citoyen/securite/webauthn/register-options/route.ts`, `register-verify/route.ts` | `auth-options/route.ts`, `auth-verify/route.ts` | `revoke/route.ts` |
| Institution | `app/api/institution/auth/webauthn/register-options/route.ts`, `register-verify/route.ts` | `auth-options/route.ts`, `auth-verify/route.ts` | `revoke/route.ts` |

Les deux utilisent `@simplewebauthn/server` (`^13.3.2`) + `@simplewebauthn/browser`
(`^13.3.0`, côté client) — dépendances déjà présentes dans `package.json`, aucune
nouvelle dépendance nécessaire pour l'admin.

## 2. Tables

```sql
-- citoyen_webauthn_credentials (20260718000003_citoyen_securite_fondations.sql)
-- institution_webauthn_credentials (20260710000002_institution_webauthn_pin.sql)
id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
<entite>_id uuid NOT NULL REFERENCES <table> (id) ON DELETE CASCADE,
credential_id text NOT NULL UNIQUE,
public_key text NOT NULL,
counter bigint NOT NULL DEFAULT 0,
device_label text,
created_at timestamptz NOT NULL DEFAULT now(),
last_used_at timestamptz
```

Forme **identique** dans les deux migrations (seule la colonne FK change de nom).
RLS activé, **aucune policy** dans les deux cas — accès exclusivement service_role,
même convention que toutes les tables sensibles du projet (confirmé sur les deux
fichiers de migration).

## 3. Routes — logique de vérification

`auth-verify` (citoyen : lignes 86-145 ; institution : même structure) suit
exactement le même déroulé dans les deux domaines :
1. Lookup du credential par `(entite_id, credential_id)` — **jamais** de lookup
   par credential_id seul (voir section 7, implication pour l'admin).
2. `verifyAuthenticationResponse()` avec `expectedChallenge` (issu d'un JWT
   signé, voir section 5), `expectedOrigin`, `expectedRPID`, `requireUserVerification: true`.
3. Contrôle anti-clonage : rejet si `newCounter <= credRow.counter` (sauf
   double 0, cas fréquent des passkeys modernes).
4. Mise à jour `counter`/`last_used_at`.

`register-options` (citoyen ligne 65-68, institution ligne 59-62) : les deux
définissent déjà `authenticatorSelection: { residentKey: "preferred"/'preferred' }`
— les credentials enregistrés aujourd'hui sont donc **déjà potentiellement
discoverable** (passkey résidente) sur les authentificateurs modernes (Windows
Hello, Touch ID, clés FIDO2 récentes), sans qu'aucun changement de code
d'enregistrement ne soit nécessaire pour en bénéficier côté admin.

`auth-options` (citoyen ligne 72, institution ligne 77) : les deux passent
`allowCredentials: creds.map(...)` — un flux **avec identifiant connu à
l'avance** (le client envoie citoyenId/institutionId avant de demander le
challenge), **pas** un flux usernameless. Implication directe pour l'admin en
section 7.

## 4. Helpers rpID/origin — duplication réelle, jamais partagée

Deux variantes existent, **dupliquées 4 fois chacune** (8 copies identiques au
total, confirmé par recherche exhaustive) :

- `getWebAuthnOrigin(request)` → `{ rpID, expectedOrigin }` — copié dans
  `citoyen/.../register-verify`, `citoyen/.../auth-verify`,
  `institution/.../register-verify`, `institution/.../auth-verify`.
- `getWebAuthnRpID(request)` → `rpID` seul — copié dans les 4 fichiers
  `*-options/route.ts` correspondants.

**Les deux variantes, dans les 8 copies, ont une logique strictement
identique** : priorité à `new URL(process.env.NEXT_PUBLIC_APP_URL).hostname`
(ancrage explicite du domaine de prod), repli sur `new URL(request.url)` si la
variable est absente (dev local / previews Netlify). **Aucune des 8 copies ne
contient de logique spécifique à un domaine** (pas de `if (citoyen)`/`if
(institution)`) — la résolution est déjà agnostique du sous-système appelant,
c'est un seul et même Relying Party (Yelen224, un seul domaine) pour toute
l'application.

**Confirmation directe de la contrainte #2 de la décision CEO** : réutiliser
cette résolution pour l'entrée admin est correct, parce qu'elle correspond
déjà exactement — pas approximativement — au domaine d'administration : il n'y
a qu'un seul domaine dans toute l'application, `/admin` y compris.

## 5. Secrets de challenge — asymétrie réelle entre les deux domaines

- Citoyen : `CITOYEN_WEBAUTHN_JWT_SECRET` — secret **dédié**, distinct du
  secret de session (`lib/auth/citoyenSession.ts` utilise
  `CITOYEN_TOTP_CHALLENGE_JWT_SECRET`/session Supabase Auth séparément).
- Institution : `process.env.INSTITUTION_JWT_SECRET` — **le même secret** que
  celui qui signe la session finale (`app/api/institution/auth/webauthn/auth-verify/route.ts`
  ligne 22, identique à `verify-otp/route.ts`). Pas de secret dédié au
  challenge WebAuthn côté institution.

Fait à noter pour la conception : le pattern citoyen (secret dédié) est le
plus propre des deux et le seul à suivre pour l'admin — un secret de challenge
WebAuthn admin ne doit jamais être le même que `ADMIN_JWT_SECRET`.

## 6. Modèle `admin_sessions` — rappel de ce qui reste strictement hors périmètre

Construit ce soir (migration `20260830000002_admin_sessions.sql`,
`lib/adminAuth.ts`) : une ligne par session, `id` = claim `sid` du JWT,
`revoked_at`/`expires_at`/`last_seen_at`/`reauth_at`. **Rien dans cette
mission ne le modifie** — le grant d'entrée n'écrit jamais dans
`admin_sessions`, n'émet jamais de claim `sid`, et `verifyAdminSession()`
n'aura jamais besoin de connaître l'existence du grant. Confirmé par
conception (section 8) : ce sont deux tables et deux vérifications
complètement disjointes.

## 7. Implication de conception — pas de lookup par identifiant côté admin

Différence structurelle avec citoyen/institution : ces deux flux connaissent
l'identifiant (citoyenId/institutionId) **avant** de demander le challenge
(saisi par téléphone/email plus tôt dans leur propre parcours). L'entrée admin
n'a **aucun** équivalent — `/entree-admin` est la toute première étape, sans
qu'aucun identifiant n'ait été saisi.

Deux options réutilisant strictement l'existant, sans nouvelle dépendance :

**Option A — table à faible cardinalité, flux non-discoverable inchangé**
(la plus proche de l'existant, donc la plus directe à auditer/tester) :
`auth-options` construit `allowCredentials` à partir de **toutes** les lignes
de `admin_entry_webauthn_credentials` (table dédiée, appelée à rester petite —
un admin, potentiellement quelques membres de confiance plus tard) au lieu de
filtrer par un identifiant unique. `auth-verify` cherche le credential par
`credential_id` seul dans cette table (au lieu de `(entite_id, credential_id)`)
— seul changement de requête par rapport au pattern existant, verrouillé
correctement par le `counter`/`expectedChallenge`/`expectedOrigin` déjà en
place.

**Option B — flux usernameless (discoverable credential)** : `auth-options`
omet `allowCredentials` — l'authentificateur présente lui-même les passkeys
résidentes compatibles. Plausible **sans changement de l'enregistrement**
puisque `residentKey: "preferred"` est déjà la valeur utilisée aujourd'hui
(section 3) — mais jamais testé dans ce projet sous cette forme (aucun flux
usernameless n'existe actuellement dans le code), donc plus de surface
nouvelle à valider que l'option A.

Recommandation d'audit (pas une décision, celle-ci revient à la Phase 2/3) :
**Option A** reproduit fidèlement un pattern déjà éprouvé deux fois dans ce
projet ; **Option B** est plus élégante côté UX mais introduit un
comportement jamais testé ici. Cohérent avec le principe CEO "réutiliser ce
qui existe, ne pas introduire de complexité inutile".

## 8. Middleware/proxy actuel — point d'intégration exact

`proxy.ts` lignes 315-322 (logique actuelle, à faire évoluer) :
```ts
const estCheminAdminBrut = pathname === '/admin' || pathname.startsWith('/admin/')
...
if (estCheminAdminBrut && ADMIN_ENTRY_TOKEN && !request.cookies.get('yelen224_admin_session')?.value) {
  return appliquerHeadersSecurite(NextResponse.rewrite(new URL('/__route_inexistante__', request.url)))
}
```
Le nouveau point de contrôle remplace le test `!request.cookies.get('yelen224_admin_session')` par un test du cookie de grant (présence + validité en base, lecture seule, même pattern que `verifierTokenAdmin()` déjà présent dans ce fichier pour `admin_sessions` — aucune nouvelle méthode à inventer, copie du même geste une table plus bas). `PUBLIC_ADMIN_ROUTES` doit inclure `/entree-admin` en plus de `/admin/login`.

**Point de coexistence pendant la migration** (contrainte CEO — V1 active
pendant toute la construction de V2) : la condition doit devenir un **OU**
entre les deux mécanismes (`ADMIN_ENTRY_TOKEN` valide OU grant WebAuthn valide)
tant que V1 n'est pas retirée — jamais un remplacement direct qui casserait
l'accès avant que V2 soit prouvée.

## 9. Mécanisme de throttle — extension directe, zéro duplication de logique

`lib/security/authSecurity.ts`, déjà étendu ce soir pour isoler `admin_login`
(`TableSet`, `TABLES_ADMIN`, `evaluerTentativeAdmin`/`enregistrerTentativeAdmin`,
paramètre optionnel à défaut inchangé — voir la mission de ce soir). Extension
nécessaire pour `admin_entry` : un troisième `TableSet` (`TABLES_ADMIN_ENTRY`)
pointant vers 2 nouvelles tables dédiées (même forme exacte que
`auth_admin_device_security`/`auth_admin_ip_security`), plus deux wrappers
`evaluerTentativeAdminEntry`/`enregistrerTentativeAdminEntry`. **Aucune ligne
de la logique d'escalade (`incrementerEtEvaluer`, seuils, durées de blocage)
n'est dupliquée** — c'est exactement le même mécanisme paramétré, comme
`admin_login` l'est déjà. `AuthEndpointCategory` (type union) gagne un
literal `"admin_entry"`, changement purement additif.

## 10. Réutilisation sans duplication — synthèse

| Élément | Réutilisable tel quel | Nouveau nécessaire |
|---|---|---|
| `@simplewebauthn/server`/`browser` | Oui, dépendance déjà installée | — |
| `getWebAuthnOrigin`/`getWebAuthnRpID` | Oui, logique déjà agnostique du domaine | Extraire en helper partagé (`lib/webauthnOrigin.ts`) plutôt qu'une 9e copie — c'est l'occasion de corriger la duplication existante sans "refactor global" (un seul fichier, zéro comportement changé) |
| `verifyAuthenticationResponse`/`verifyRegistrationResponse` + contrôle anti-régression compteur | Oui, code identique | — |
| Pattern table credentials (`id/entite_id/credential_id/public_key/counter/device_label/created_at/last_used_at`) | Oui, même forme | Nouvelle table `admin_entry_webauthn_credentials` |
| `lib/security/authSecurity.ts` | Oui, mécanisme déjà paramétré | 2 nouvelles tables + 1 `TableSet` + 2 wrappers (même geste que `admin_login` ce soir) |
| Secret de challenge dédié | Pattern à suivre : celui de citoyen (`CITOYEN_WEBAUTHN_JWT_SECRET`), pas celui d'institution | Nouveau `ADMIN_ENTRY_WEBAUTHN_JWT_SECRET` |
| `admin_sessions`/`verifyAdminSession` | Intact, non touché | — |
| `proxy.ts` — vérification cookie de session | Pattern de lecture identique (`verifierTokenAdmin`) | Nouvelle fonction `verifierGrantEntree()`, même forme |

## 11. Migrations nécessaires (proposées, non exécutées)

1. `admin_entry_grants` — voir modèle de données du rapport précédent (cookie_hash, factor_used, expires_at, revoked_at, ip, user_agent).
2. `admin_entry_webauthn_credentials` — même forme que `institution_webauthn_credentials`/`citoyen_webauthn_credentials`.
3. `auth_admin_entry_device_security` / `auth_admin_entry_ip_security` — même forme que `auth_admin_device_security`/`auth_admin_ip_security` (migration de ce soir).

Toutes RLS activé, aucune policy (service_role uniquement), cohérent avec
100 % des tables sensibles existantes du projet.

## 12. Risques de lockout pendant la transition

- **Coexistence obligatoire** (section 8) : si le OU logique entre V1/V2 est
  mal implémenté (ex. remplacement au lieu d'addition), Bryan perd tout accès
  le temps de corriger — c'est le risque numéro 1, à tester en tout premier
  avant même de tester WebAuthn lui-même.
- **Passkey non enregistrée avant le retrait de V1** : si `ADMIN_ENTRY_TOKEN`
  est retiré avant qu'un credential WebAuthn admin fonctionnel existe en
  base, aucun chemin d'entrée ne subsiste. Le rapport précédent l'a déjà
  couvert (ordre de migration strict, jamais couper V1 en premier) — confirmé
  ici : la checklist de bascule (8 points, rapport précédent) doit inclure
  explicitement "au moins un credential WebAuthn enregistré ET vérifié
  fonctionnel" comme condition préalable au retrait de V1, pas seulement "V2
  testée".
- **Perte de l'appareil/passkey** : contrairement à un token statique
  recopiable, une passkey est liée à un authentificateur physique/plateforme.
  Aucun mécanisme de secours n'existe encore dans ce rapport si l'unique
  passkey enregistrée devient inaccessible (appareil perdu/cassé) — point à
  trancher explicitement en Phase 2 (ex. autoriser plusieurs credentials
  enregistrés dès le départ, comme le permettent déjà les tables
  `institution_webauthn_credentials`/`citoyen_webauthn_credentials`, qui
  n'imposent aucune limite à 1 credential par entité).

## 13. Ce qui reste à décider en Phase 2/3 (pas dans ce rapport)

- Option A vs B (section 7).
- Durée exacte du grant.
- Nombre minimum de credentials WebAuthn admin à enregistrer avant retrait de V1.
- Mécanisme de révocation manuelle exact (extension du panneau `/admin/security`, comme fait ce soir pour `admin_device`/`admin_ip`).

---

Zéro implémentation dans ce document. En attente de la validation de ce rapport avant toute écriture de code.
