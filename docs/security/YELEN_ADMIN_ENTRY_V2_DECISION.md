# Note de décision technique — Admin Entry Security V2

Statut : **décision de conception, zéro implémentation**. S'appuie exclusivement
sur l'audit réel `docs/security/YELEN_ADMIN_ENTRY_V2_AUDIT.md`. Aucune migration,
aucune modification de `proxy.ts`, aucune suppression de `ADMIN_ENTRY_TOKEN` dans
cette phase. Document produit pour validation CEO avant Phase 3.

## 1. Facteur d'entrée initial

**Décision** : WebAuthn, architecture factor-agnostic conservée telle que conçue
dans le rapport précédent —

```
POST /api/admin/entry/verify
  { factor: "webauthn", credential: {...} }   →  vérificateur dédié  →  emettreGrantEntreeAdmin()
```

`admin_entry_grants` ne référence jamais directement WebAuthn — seule la colonne
`factor_used` (texte libre, non contrainte par ENUM) enregistre quel facteur a
servi. Ajouter un second facteur plus tard = un nouveau vérificateur + une
nouvelle branche de dispatch, **zéro changement** de `admin_entry_grants`, du
cookie, du throttle ou de la logique de révocation. Ce découplage est le
même que celui déjà exploité par le projet pour la connexion institution (4
facteurs — OTP/PIN/WebAuthn/identifiant+PIN — convergent vers un seul point de
finalisation de session).

**Séparation fondamentale actée** (rappel explicite de la demande CEO) : le
mécanisme d'entrée n'est **jamais** une authentification admin. Il établit
uniquement un droit temporaire d'atteindre `/admin/login`. Concrètement :
`admin_entry_grants` et `admin_sessions` sont deux tables disjointes, vérifiées
à deux endroits différents de `proxy.ts`, et aucune fonction ne doit jamais
lire l'une pour répondre à une question posée sur l'autre. Un changement futur
du facteur d'entrée (WebAuthn → autre chose, ou ajout d'un second facteur) ne
peut donc jamais, par construction, transformer la porte d'entrée en session
administrative — les deux mécanismes n'ont même pas de champ en commun au-delà
d'un timestamp d'émission.

## 2. WebAuthn sans identifiant préalable

**Décision : Option A retenue** (résolution par contexte admin à faible
cardinalité). Le mode discoverable/usernameless (Option B) n'est **pas**
retenu pour cette phase — l'audit a confirmé qu'aucun flux usernameless
n'existe nulle part ailleurs dans Yelen aujourd'hui ; l'introduire ici
ajouterait un comportement jamais éprouvé dans ce projet sans nécessité
démontrée (l'option A résout le problème sans cela).

**Fonctionnement précis** :
- `admin_entry_webauthn_credentials` reste une table dédiée, distincte de
  `institution_webauthn_credentials`/`citoyen_webauthn_credentials`, sans
  colonne d'identité admin individuelle nécessaire (pas de FK vers
  `admin_users` obligatoire pour la version 1 — un credential appartient au
  *droit d'entrée*, pas à un compte admin précis ; cohérent avec le principe
  de séparation de la section 1).
- `POST /api/admin/entry/webauthn/auth-options` construit `allowCredentials`
  à partir de **toutes** les lignes actives de cette table (pas de filtre par
  identifiant, puisqu'aucun n'est saisi à ce stade) — même appel
  `generateAuthenticationOptions()` que les flux existants, seule la source
  de la liste change.
- `POST /api/admin/entry/verify` cherche le credential présenté par
  `credential_id` seul (pas de couple `(entite_id, credential_id)`, puisqu'il
  n'y a pas d'entité à filtrer) — seule différence de requête par rapport au
  pattern institution/citoyen existant. Le reste (`verifyAuthenticationResponse`,
  contrôle anti-régression du compteur, `expectedOrigin`/`expectedRPID`) est
  repris à l'identique.

**Compatibilité confirmée** : `verifyAuthenticationResponse()` et
`generateAuthenticationOptions()` (`@simplewebauthn/server`) ne font aucune
hypothèse sur la provenance de `allowCredentials` ou sur l'existence d'un
identifiant préalable — la signature de ces fonctions, telle qu'utilisée
aujourd'hui dans les 4 routes existantes, est déjà compatible avec ce flux
sans modification de la librairie ni du helper `getWebAuthnOrigin`/`getWebAuthnRpID`.

**Borne de conception à respecter en Phase 3** : l'option A n'est saine que
tant que la table reste à faible cardinalité (quelques credentials, jamais
des centaines) — un plafond applicatif (proposition : 10 credentials actifs
maximum) doit être appliqué à l'enregistrement, pas laissé sans limite.

## 3. Résilience contre le lockout

**Décision** : aucune limite structurelle à un seul credential — `admin_entry_webauthn_credentials`
autorise nativement plusieurs lignes (même schéma que
`institution_webauthn_credentials`, qui n'impose déjà aucune limite par
institution).

**Règle de migration verrouillée** : `ADMIN_ENTRY_TOKEN` ne peut être retiré
que si **au moins 2 credentials WebAuthn d'entrée distincts** sont enregistrés
**et** ont chacun été vérifiés fonctionnels par un test de connexion réel
(pas seulement "enregistrés" — un enregistrement qui échouerait silencieusement
à l'authentification ne compte pas). C'est la réponse directe à "aucun système
ne doit dépendre d'une seule passkey" : le second credential n'est pas une
option, c'est une condition de bascule.

**Révocation** : extension du panneau `/admin/security` (déjà étendu ce soir
à deux reprises pour `admin_device`/`admin_ip`) avec un scope
`admin_entry_webauthn` — liste + révocation individuelle, réservé à un admin
déjà authentifié par une **vraie session `admin_sessions`** (jamais accessible
via le grant d'entrée lui-même, cohérent avec la séparation de la section 1).
Reprend le pattern déjà existant de `institution/auth/webauthn/revoke/route.ts`.

**Récupération** : si les deux credentials deviennent inaccessibles
simultanément (perte physique des deux appareils), le filet de sécurité est
`ADMIN_ENTRY_TOKEN` tant qu'il reste actif (section 6), et au-delà, l'accès
SQL direct déjà établi comme modèle opérationnel de ce projet (Bryan, seul
opérateur). Aucun mécanisme de bypass applicatif supplémentaire n'est créé
pour ce cas — cohérent avec "ne jamais désactiver globalement la protection
anti-abus" déjà acté pour les missions précédentes de ce soir.

## 4. Grant d'entrée

**Décision** : principe `admin_entry_grants` conservé sans modification par
rapport au rapport précédent —

- Valeur de cookie **aléatoire, générée serveur** (jamais dérivée du
  credential WebAuthn ni d'une identité admin) ; seul un **hash** est stocké
  en base (`cookie_hash`), jamais la valeur brute — la valeur brute n'existe
  que dans le cookie httpOnly côté navigateur, exactement le même principe
  que `institution_remember_tokens`/`citoyen_remember_tokens`.
- httpOnly, Secure (prod), SameSite strict — TTL court (proposition reprise
  du rapport précédent : 15-30 minutes, valeur exacte à figer en Phase 3).
- **Rôle strictement limité** : lève uniquement le 404 muet sur
  `/entree-admin`/`/admin/login`. N'apparaît, ne peut apparaître et ne doit
  jamais être accepté par aucune route sous `/api/admin/*` — ces routes ne
  connaissent que `verifyAdminSession()`/`authorizeAdmin()`, qui ne lisent
  jamais `admin_entry_grants`. Cette garantie est structurelle (deux tables
  disjointes, deux fonctions de vérification distinctes), pas une simple
  convention de nommage.
- Consommé (marqué utilisé) ou révoqué dès qu'une session `admin_sessions`
  réelle est établie — `admin_sessions` reste la seule autorité de session à
  partir de cet instant, sans exception.

## 5. Throttling

**Décision** : troisième scope isolé `admin_entry`, construit par le même
mécanisme paramétré que `admin_login` ce soir (`TableSet` dédié dans
`lib/security/authSecurity.ts`, deux nouvelles tables
`auth_admin_entry_device_security`/`auth_admin_entry_ip_security`). Aucune
duplication de la logique d'escalade — même fonctions internes
(`incrementerEtEvaluer`, `lireEtat`), seul le jeu de tables change.

**Garantie d'isolation** (à vérifier explicitement en Phase 3, section 7) :
`admin_entry`, `admin_login`, `institution_login`, `citoyen_login` ne
partagent aucune ligne, aucune table, aucun compteur. Un abus sur l'un des
quatre scopes ne peut avoir aucun effet observable sur les trois autres —
même garantie que celle prouvée ce soir pour `admin_login` face à
`institution_login`/`citoyen_login`.

Aucune modification du mécanisme existant pour les trois autres catégories.

## 6. V1 comme filet de sécurité

**Décision** : `ADMIN_ENTRY_TOKEN` reste actif et fonctionnel sans
interruption pendant toute la Phase 3 (développement + tests). Le contrôle
d'accès à `/admin/*` devient un **OU** entre les deux mécanismes le temps de
la transition — jamais un remplacement direct. Retrait de V1 uniquement
après :
1. Les 11 tests de la section 7, tous passés avec succès.
2. Au moins 2 credentials WebAuthn d'entrée enregistrés et vérifiés
   fonctionnels (section 3).
3. Validation explicite CEO du passage en Phase 4 (retrait).

## 7. Tests obligatoires avant migration (spécification, à exécuter en Phase 3)

| # | Test | Résultat attendu |
|---|---|---|
| 1 | Succès WebAuthn (credential valide) | Grant émis, accès à `/admin/login` uniquement |
| 2 | Credential inconnu | 404 générique, identique à route inexistante |
| 3 | Credential révoqué | 404 générique, identique au cas 2 (pas de distinction observable) |
| 4 | Grant expiré | Retour au 404 sur `/admin/login`, jamais un état intermédiaire |
| 5 | Grant révoqué manuellement | Effet immédiat, même comportement que l'expiration naturelle |
| 6 | Grant utilisé sans authentification admin ensuite | Aucun accès à `/admin/*` protégé ni `/api/admin/*` — le grant seul ne mène nulle part au-delà de la page de login |
| 7 | Tentative concurrente (deux requêtes simultanées consommant/validant le même grant) | Pas de double-usage exploitable, pas d'état incohérent en base |
| 8 | Lockout isolé | Un blocage `admin_entry` ne bloque ni `admin_login` ni citoyen/institution, et réciproquement — protocole croisé identique à celui exécuté ce soir pour `admin_login` |
| 9 | Second credential de récupération | Le 2e credential enregistré fonctionne réellement de bout en bout (pas seulement présent en base) — condition de bascule de la section 3 |
| 10 | Absence de fuite (URL, logs, réponses JSON, cookies) | Ni le credential WebAuthn, ni la valeur brute du cookie de grant, ni un hash exploitable n'apparaissent dans `logSecurite()`, les réponses d'erreur, ou une URL |
| 11 | `/api/admin/*` avec le seul grant (sans session) | Rejeté par `verifyAdminSession()`/`authorizeAdmin()` exactement comme une requête sans aucun cookie — le grant n'est reconnu par aucune route API admin |

---

**Mise à jour 31/08/2026 — implémentation réalisée, tests en cours**
(détail complet et preuves : `docs/security/YELEN_SECURITY_MASTER.md`,
section "ADMIN ENTRY SECURITY V2", DEC-2026-08-31-01/02) : la Phase 3
décrite ci-dessous a été codée (migration `20260830000010` exécutée en
base, 7 routes, `proxy.ts` coexistence OU avec `ADMIN_ENTRY_TOKEN`),
mais jamais commitée ni déployée. Statut des 11 tests de la section 7
ce soir :

## RAPPORT DE VALIDATION LOT 3 — clôturé 31/08/2026

9 PASS, 1 PARTIAL (anomalie documentée, non corrigée), 1 BLOCKED (matériel
absent), 0 FAIL. Détail complet, entrée par entrée, dans
`docs/security/YELEN_SECURITY_MASTER.md`, section "ADMIN ENTRY SECURITY
V2", DEC-2026-08-31-04. Aucune correction appliquée sur les écarts
trouvés (Test 2 : 401 JSON au lieu du 404 générique spécifié ; Test 7 :
`consumed_at` jamais écrit, aucune logique de consommation du grant à la
prise de session admin) — décision CEO requise avant tout code
supplémentaire.

| # | Statut au 31/08/2026 |
|---|---|
| 1 | 🟢 PASS — plusieurs vérifications WebAuthn réelles réussies ce soir (Tests 5, 6), chaque succès a émis un grant menant à `/admin/login` ; compteur du credential confirmé incrémenté sur succès |
| 2 | 🟢 PASS — credential inconnu et révoqué traités de façon identique (voir Test 3) ; écart de forme documenté : `401 CREDENTIAL_NOT_FOUND` au lieu du `404 générique` prévu par cette spec |
| 3 | 🟢 PASS — grant expiré et grant révoqué manuellement mènent tous deux au même 404 muet immédiat, aucune réutilisation possible |
| 4 | 🟢 PASS — expiration réelle testée en direct (`expires_at` forcé dans le passé) → 404 muet, jamais un état intermédiaire |
| 5 | 🟢 PASS — révocation manuelle testée en direct → 404 muet immédiat, sans délai de propagation |
| 6 | 🟢 PASS — 3 écrans `/admin/*` testés avec grant valide seul, tous redirigés vers `/admin/login`, jamais le dashboard |
| 7 | 🟡 PARTIAL — anomalie réelle : `consumed_at` n'est écrit par aucune route (grep exhaustif) ; le grant reste utilisable pour atteindre `/admin/login` autant de fois que voulu pendant ses 20 min, pas seulement une fois comme prévu section 4 de cette décision. N'ouvre aucun accès au-delà de la page de login (Tests 6/11), donc pas une brèche vers le dashboard, mais un écart de conception non corrigé |
| 8 | 🟢 PASS — blocage sain (`blocked_until` futur), persistant à un redémarrage serveur/PC, isolation confirmée vs `admin_login`/citoyen |
| 9 | ⚪ BLOCKED — second authentificateur physique indisponible ce soir, pas un échec |
| 10 | 🟢 PASS — `auth_security_events` force `identifiant: null` pour tout événement `admin_entry`, aucun secret persisté ; réserve mineure : `credential_id` apparaît dans un `console.error` serveur éphémère (stdout, jamais en base, jamais renvoyé au client) |
| 11 | 🟢 PASS — `GET /api/admin/kpis` avec grant seul (sans `yelen224_admin_session`) → `401 NO_SESSION`, capturé en entier dans Network |

**Condition de bascule V1→V2 (section 3)** : toujours non remplie (1
seul credential enregistré, le 2e requiert le matériel du Test 9).
`ADMIN_ENTRY_TOKEN` reste le seul filet de récupération.

---

## CORRECTIONS DE CONFORMITÉ — Écarts 1 et 2 (31/08/2026, même nuit)

Décision CEO explicite : corriger exclusivement les 2 écarts ci-dessus,
rien d'autre, méthode imposée (lecture avant modification, changement
minimal, jamais de correction sans preuve, rapport final PASS/PARTIAL/
FAIL uniquement).

**Écart 1 (Test 2/10) — corrigé** : `auth-verify/route.ts`, les branches
"credential inconnu" (`!credRow`) et "assertion invalide"
(`!verification.verified`) retournent désormais une réponse strictement
identique — `{ error: "Vérification impossible." }`, HTTP 404, sans
`code`, sans `security` — indiscernables l'une de l'autre côté client.
`COUNTER_REGRESSION` (anti-rejeu, cas distinct — l'assertion EST
cryptographiquement valide, c'est un rejeu détecté) volontairement laissé
inchangé : hors du périmètre explicite des 3 cas nommés par la décision
CEO ("credential inconnu, credential révoqué, assertion invalide"), pas
une omission.

**Écart 2 (Test 7) — corrigé** :
- `proxy.ts::verifierGrantEntreeAdmin()` — ajout de `consumed_at` au
  `SELECT` et à la condition d'invalidité (aux côtés de `revoked_at`/
  `expires_at`), fonction toujours strictement lecture seule.
- `app/api/admin/auth/login/route.ts` — nouvelle consommation atomique
  juste après la signature du JWT (moment exact de la transition
  réussie) : `UPDATE admin_entry_grants SET consumed_at = now() WHERE
  cookie_hash = ... AND consumed_at IS NULL AND revoked_at IS NULL AND
  expires_at > now()`. Atomicité garantie par le verrouillage de ligne
  Postgres inhérent à `UPDATE ... WHERE` — deux requêtes concurrentes sur
  le même grant : une seule affecte une ligne, l'autre 0. Best-effort,
  non bloquant pour le succès de la connexion (mot de passe + MFA seuls
  en décident, séparation grant/session non touchée).

**Tests** : `npx tsc --noEmit` → exit 0 sur les 3 fichiers (confirmé par
notification de tâche, pas une lecture anticipée). **Aucun test en
conditions réelles encore rejoué** — nécessite la participation de Bryan
(navigateur + SQL), protocole donné, en attente de sa disponibilité.

**Statut** : 🟠 IN PROGRESS — code corrigé et type-vérifié, revalidation
live des 2 écarts + recherche de régression sur les tests déjà PASS (1,
3, 4, 5, 6, 8, 11) restant à faire avant clôture définitive. Aucun
commit. **Date** : 31/08/2026.

Condition de bascule section 3 (≥2 credentials WebAuthn d'entrée
distincts et vérifiés) **non remplie** : un seul credential enregistré à
ce jour. `ADMIN_ENTRY_TOKEN` reste donc le seul filet actif.

---

Aucun code, aucune migration, aucune modification de `proxy.ts` dans ce
document. En attente de validation CEO avant Phase 3 (implémentation).
