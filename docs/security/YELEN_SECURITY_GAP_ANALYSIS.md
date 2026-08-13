# YELEN — SECURITY GAP ANALYSIS

Document compagnon de `docs/security/YELEN_SECURITY_MASTER.md`.

**Lot 1 — Security Baseline & Architecture Audit, exécuté le 13/08/2026.**
Audit en lecture seule (aucune modification, aucune commande destructive,
aucune exécution SQL sur la base réelle — hors périmètre de Claude Code sur
ce projet). Chaque constat ci-dessous est appuyé par une preuve concrète
(chemin de fichier + ligne, ou sortie exacte d'une commande en lecture
seule réellement exécutée). Tout ce qui ne peut pas être vérifié depuis le
code local (réglages des dashboards Supabase/Netlify/GitHub, état réel des
policies en base de production) est marqué **UNKNOWN** — jamais deviné.

Méthode : 3 audits ciblés (secrets/Git/dépendances/CI-CD ; RLS et
migrations Supabase ; couverture d'authentification des 219 routes
`app/api/**`), plus vérifications manuelles complémentaires (flux OTP
citoyen vs institution, 2FA admin, headers de sécurité). Chaque section
porte la mention de ce qui a été couvert et de ce qui reste hors périmètre
de ce premier lot.

## Statuts

- 🔴 NOT STARTED
- 🟠 IN PROGRESS
- 🟡 NEEDS REVIEW
- 🟢 VERIFIED
- ⚫ EXCEPTION APPROVED

---

## RÉSUMÉ EXÉCUTIF — constats réels classés par priorité

| ID | Constat | Priorité | Statut |
|---|---|---|---|
| GAP-06-01 | 7 tables sans aucune trace d'activation RLS dans les migrations (`institutions`, `users`, `rdv`, `avis`, `messages`, `notifications`, `admin_users`) | **High** | 🟡 NEEDS REVIEW — **NOT VERIFIED, requiert Bryan (SQL Editor)** |
| GAP-04-01 | OTP institution `DEV_OTP='123456'` en dur, sans garde `NODE_ENV`, dans le code de production | **High** | 🟢 VERIFIED — corrigé Lot 1.1, voir journal de remédiation |
| GAP-06-02 | `institution_otp` a eu des policies `anon` sans restriction (lecture/insertion/suppression libres du code OTP) entre le 09/07 et le 08/08/2026 — corrigé en migration, application en prod non confirmée | **High** | 🟡 NEEDS REVIEW — **NOT VERIFIED, requiert Bryan (SQL Editor)** |
| GAP-16-01 | Aucun header Content-Security-Policy configuré nulle part (middleware ni netlify.toml) | **Medium-High** | 🟠 IN PROGRESS — CSP Report-Only déployée Lot 1.1, pas encore en mode bloquant |
| GAP-14-01 | 8 vulnérabilités npm en production (2 moderate, 6 high), dont `next` lui-même | **Medium-High** | 🟠 IN PROGRESS — 5/10 corrigées Lot 1.1 (`ws`/`js-yaml`), reste 5 : analyse détaillée faite 13/08 (`--force` volontairement non exécuté), chantier dédié testable à planifier |
| GAP-06-03 | Doublon de migration au même horodatage (`20260711000002`, deux fichiers créant `institution_responsables`) | **Medium** | 🟡 NEEDS REVIEW — clarifié Lot 1.1, action de confirmation requise |
| GAP-06-04 | Fonction `SECURITY DEFINER` `appliquer_recuperations_dues()` sans paramètre, privilèges `EXECUTE` réels non confirmés | **Medium** | 🟡 NEEDS REVIEW — **NOT VERIFIED, requiert Bryan (SQL Editor)** |
| GAP-10-01 | Rate limiting basé sur des `Map` en mémoire locale à l'instance serverless — efficacité réelle sur Netlify Functions non garantie | **Medium** | ⚫ EXCEPTION APPROVED — **TEMPORARY ACCEPTED GAP** (13/08, DEC-2026-08-13-02), 5 conditions de levée définies |
| GAP-04-02 | OTP citoyen/institution : code unique partagé (`*_OTP_FALLBACK`) tant qu'aucun fournisseur SMS n'est branché, aucun garde `NODE_ENV` | **Medium** | ⚫ EXCEPTION APPROVED — **TEMPORARY ACCEPTED GAP** (13/08, DEC-2026-08-13-04), décision explicite de Bryan de ne pas bloquer |
| GAP-04-03 | 2FA admin optionnelle par compte, non imposée globalement | **Medium** | ✅ **Chantier MFA Admin clôturé** (validation CEO 13/08) — gate implémenté (`middleware.ts` + `login/route.ts`), `tsc`/`build` propres. Amélioration future notée (régénération de session après activation 2FA), hors périmètre. |
| GAP-14-02 | Aucun CI/CD (`.github/workflows/` absent) — zéro test/scan automatisé | **Medium** | 🟠 IN PROGRESS — workflow minimal préparé Lot 1.1, activation de la protection de branche restant à Bryan |
| GAP-14-03 | Branch protection / revue de PR GitHub — état réel non vérifiable en local | **Low-Medium** | 🟡 NEEDS REVIEW |
| GAP-08-01 | Vérification d'auth citoyen dupliquée localement par route (pas de fonction centrale unique, contrairement à institution/admin/employé) | **Low** | 🟡 NEEDS REVIEW |

**Aucune vulnérabilité "Critical" confirmée dans ce Lot 1.** Aucun secret
trouvé dans Git (historique inclus). Zéro IDOR confirmé sur l'échantillon
audité. Zéro `dangerouslySetInnerHTML`. Zéro SQL brut/concaténé.

---

## LOT 1.1 — Security Gap Remediation & Production Verification (13/08/2026)

Traite uniquement les risques identifiés au Lot 1, dans l'ordre demandé par
Bryan. Format `Avant → Modification → Test → Résultat → Preuve` pour
chaque item. Toute vérification nécessitant Supabase Dashboard/SQL Editor,
Netlify ou GitHub est marquée **NOT VERIFIED** — aucune valeur devinée.
Vérification finale de non-régression : `npx tsc --noEmit` (exit 0) et
`npm run build` (exit 0, ~200+ routes compilées sans erreur) après
l'ensemble des changements de code de ce lot.

### 1. Vérification réelle RLS des 7 tables (GAP-06-01)

**NOT VERIFIED — reporté par Bryan (pas d'accès SQL dans l'environnement
actuel).** Aucune action possible depuis Claude Code (jamais d'exécution
SQL directe sur ce projet). Requête exacte à exécuter par Bryan dans le
SQL Editor Supabase quand disponible :
```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('institutions','users','rdv','avis','messages','notifications','admin_users');
```
Résultat attendu : `relrowsecurity = true` pour les 7 lignes. Si une seule
ligne renvoie `false`, cette table est actuellement lisible/modifiable
sans aucune restriction RLS par tout rôle ayant les GRANT correspondants
(voir aussi item 3 et GAP-06-05).

### 2. Suppression du bypass OTP institution `123456` (GAP-04-01)

**Avant** : `app/api/institution/auth/register/route.ts`,
`verify-otp/route.ts` et `send-otp/route.ts` définissaient chacun (ou
utilisaient) `const DEV_OTP = '123456'` — accepté inconditionnellement,
sans aucune garde `NODE_ENV`, identique en dev et en production.
`send-otp/route.ts` stockait littéralement `"123456"` comme code réel
dans la table `institution_otp` via un flag `DEV_MODE = true` codé en dur.

**Modification** — même architecture que le flux citoyen déjà durci
(`lib/auth/otp.ts`, décision Bryan : "comme on l'a fait avec citoyen") :
- `send-otp/route.ts` : suppression de `DEV_MODE`/`DEV_OTP`. Si
  `process.env.SMS_PROVIDER` est défini, génère un code aléatoire réel
  (`crypto.randomInt`, adaptateur d'envoi SMS toujours à brancher — hors
  périmètre). Sinon, exige `process.env.INSTITUTION_OTP_FALLBACK` — **si
  cette variable est absente, l'envoi échoue explicitement** (500,
  `OTP_NOT_CONFIGURED`) plutôt que de retomber sur une valeur devinable.
  Aucune valeur n'est jamais renvoyée au client ni affichée à l'écran.
- `verify-otp/route.ts` et `register/route.ts` : suppression complète du
  bypass `DEV_OTP` — ces deux routes ne vérifient plus que ce qui est
  réellement stocké dans `institution_otp` par `send-otp`.

**Action requise de Bryan (jamais faite par Claude Code — évite d'exposer
le contenu de `.env.local` dans cette session)** : ajouter dans
`.env.local` (puis plus tard sur Netlify si le comportement doit être
reproduit en prod avant qu'un vrai fournisseur SMS soit branché) :
```
INSTITUTION_OTP_FALLBACK=7854
```
Sans cette ligne, **l'inscription/connexion institution par OTP cessera
de fonctionner** (échec explicite, pas un bypass silencieux — c'est le
comportement voulu).

**Test** : `npx tsc --noEmit` → exit 0. `npm run build` → exit 0 (routes
`/api/institution/auth/register`, `/verify-otp`, `/send-otp` compilées
sans erreur).

**Résultat** : plus aucun code de contournement fixe dans le code source,
sur aucun des 3 fichiers. Comportement strictement équivalent au flux
citoyen (échec fermé si la variable d'environnement n'est pas configurée).

**Preuve** : diff des 3 fichiers (`git diff app/api/institution/auth/`),
sortie `tsc`/`build` ci-dessus.

⚠️ **Découverte annexe, hors périmètre de cet item mais directement liée** :
`app/institution/verification/page.tsx` (route non liée nulle part dans
l'app, confirmé par recherche exhaustive de `<Link>`/`router.push`)
contient un `CODE_FICTIF = "123456"` comparé **côté client uniquement**
(le "code" n'est jamais envoyé à un backend pour vérification — la page
interroge ensuite directement `institutions` via le client Supabase
anon). Probablement déjà non fonctionnelle en pratique (aucune policy
`anon` d'écriture sur `institutions` trouvée au Lot 1), mais reste un
artefact legacy avec un code en dur. **Non modifiée dans ce lot** (hors
des 8 items demandés, et "ne pas modifier les écrans existants") —
recommandation : suppression dans un futur nettoyage, à valider par Bryan.

### 3. Vérification réelle des policies `institution_otp` en production (GAP-06-02)

**NOT VERIFIED — même contrainte que l'item 1, pas d'accès SQL Editor
dans cet environnement.** Requête exacte à exécuter par Bryan :
```sql
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'institution_otp';
```
Résultat attendu : **zéro ligne** avec `anon` dans `roles` (les policies
`otp_read_anon`/`otp_insert_anon`/`otp_delete_anon` doivent avoir été
supprimées par la migration `20260808000002_audit_rls_fixes.sql`). Si une
ou plusieurs lignes avec `anon` apparaissent encore, cette migration n'a
jamais été appliquée à la base de production et le trou décrit dans
GAP-06-02 est toujours ouvert.

### 4. Classification et traitement des 8 vulnérabilités npm (GAP-14-01)

**Avant** : `npm audit --omit=dev` → 8 vulnérabilités (2 moderate, 6
high) ; `npm audit` complet → 10 (1 low, 2 moderate, 7 high).

**Classification** :
| Paquet | Sévérité | Fix disponible sans `--force` ? |
|---|---|---|
| `ws` | High (fuite mémoire, DoS) | **Oui** |
| `js-yaml` (dépendance transitive) | — | Oui (résolu avec `ws`) |
| `next` | High (multiples CVE : SSRF, DoS, cache poisoning, bypass middleware) | Non — nécessite `next@16.3.0` |
| `postcss` (dépendance de `next`) | High (XSS, path traversal) | Non — lié au bump `next` |
| `sharp` | High (CVE libvips) | Non — lié au bump `next` |
| `uuid`→`exceljs` | Moderate | Non — nécessite `exceljs@3.4.0` (breaking change) |

**Modification** : `npm audit fix` (sans `--force`) — corrige uniquement
`ws`/`js-yaml`, aucun changement de version majeure, aucune breaking
change signalée par npm.

**Test** : `npm install` → `up to date` (node_modules cohérent avec le
nouveau `package-lock.json`). `npx tsc --noEmit` → exit 0. `npm run
build` → exit 0, ~200+ routes compilées.

**Résultat** : 10 → **5 vulnérabilités restantes** (2 moderate, 3 high).
`package.json`/`package-lock.json` modifiés (diff limité au strict
nécessaire pour `ws` ; le diff visible inclut aussi `file-type`/
`next-intl`/`iconv-lite`/un script `i18n:check`, qui étaient déjà utilisés
par le code — voir chantiers `/helper-upload-security` et
`/migration-i18n` de CLAUDE.md — mais absents de `package.json` avant ce
lot, un drift préexistant à cette session, pas introduit par elle,
simplement révélé/corrigé en même temps par la réconciliation npm).

**Reste ouvert, décision de Bryan requise** : les 5 vulnérabilités
restantes nécessitent `npm audit fix --force` (bump `next` 16.2.1→16.3.0,
qui entraîne aussi la correction de `postcss`/`sharp`) — changement plus
large que "minimal", cohérent avec la note déjà existante dans CLAUDE.md
("action à la charge de Bryan"). Non appliqué dans ce lot.

**Preuve** : sorties `npm audit`/`npm install`/`tsc`/`build` ci-dessus,
`git diff package.json package-lock.json`.

### 5. Analyse du rate limiting serverless (GAP-10-01)

**Analyse (aucun changement de code — ajouter un store partagé serait une
nouvelle brique d'architecture, hors périmètre de ce lot)** :

Les compteurs de rate limiting (`admin/auth/login`, `citoyen/auth/verify`,
`institution/auth/register`, `institution/auth/send-otp`, et le
middleware global `lib/edgeSecurity.ts`) sont tous des `Map` JavaScript
en mémoire de processus, module-level. C'est structurellement vrai que :
- Un cold start (nouvelle instance de fonction serverless) repart avec
  une `Map` vide — aucune persistance entre redémarrages, par nature du
  modèle serverless (pas spécifique à Netlify).
- Si plusieurs instances de la fonction tournent en concurrence (pic de
  trafic), chaque instance a sa propre `Map` — le seuil affiché ("5
  tentatives/15min") s'applique donc par instance, pas globalement.
  `lib/edgeSecurity.ts` documente déjà lui-même cette limite dans ses
  commentaires.

**Ce qui n'est PAS vérifiable depuis cet environnement** : le
comportement réel de concurrence/réutilisation d'instance de
`@netlify/plugin-nextjs` sur ce projet précis (fréquence des cold starts,
nombre d'instances concurrentes sous charge réelle) — dépend du plan
Netlify et du trafic réel, **NOT VERIFIED**, nécessiterait soit la
documentation Netlify à jour soit un test de charge réel.

**Recommandation (pas implémentée, décision à prendre)** : si le volume
de trafic réel justifie un jour de fermer ce gap, la correction
consisterait à déplacer l'état de rate limiting vers un store partagé
(ex. une table Supabase dédiée avec upsert atomique, ou un service
externe type Upstash Redis) — c'est un changement d'architecture
délibéré, à ne faire que sur décision explicite étant donné le volume de
trafic actuel très faible du produit (pré-lancement).

### 6. Analyse et déploiement CSP sans casser l'application (GAP-16-01)

**Avant** : aucun header CSP nulle part (`middleware.ts` ni
`netlify.toml`).

**Analyse préalable (pour éviter de deviner un domaine)** : recherche
réelle des ressources externes chargées par l'app — `next.config.ts`
(`images.remotePatterns` : Supabase Storage, Pexels, YouTube
thumbnails), `app/page.tsx:1476` (iframe YouTube embed réel,
`www.youtube.com`), `DocumentsFinanciersTab.tsx:202` (iframe chargeant
une URL signée Supabase Storage pour l'impression PDF). Confirmé aussi :
usage massif de styles inline React (`style={{...}}`) et de balises
`<style>{...}</style>` dans des dizaines de composants — une CSP stricte
sans `'unsafe-inline'` sur `style-src` casserait la quasi-totalité des
écrans.

**Modification** : ajout d'un header `Content-Security-Policy-Report-Only`
dans `middleware.ts` (même portée globale que les autres headers de
sécurité déjà en place). **Volontairement en mode Report-Only, pas
bloquant** : sans outil navigateur disponible dans cet environnement pour
vérifier réellement l'absence de régression, un mode bloquant aurait été
un pari, pas une vérification — contraire à la consigne "jamais deviner".
En Report-Only, le navigateur journalise dans sa console les violations
qui **seraient** bloquées, sans jamais rien bloquer réellement — donc
strictement zéro risque de casser l'application.

Politique déployée : `default-src 'self'` ; `script-src`/`style-src`
`'self' 'unsafe-inline'` (nécessaire, voir analyse ci-dessus) ; `img-src`
couvrant Supabase/Pexels/YouTube + `data:`/`blob:` (QR codes, aperçus
locaux) ; `connect-src` couvrant Supabase REST + Realtime (`wss:`) ;
`frame-src` couvrant YouTube + Supabase Storage (iframe d'impression) ;
`object-src 'none'` ; `frame-ancestors 'none'` ; `base-uri`/`form-action`
`'self'`.

**Test** : `npx tsc --noEmit` → exit 0. `npm run build` → exit 0.

**Résultat** : CSP en observation, aucun changement de comportement
utilisateur.

**Action requise de Bryan avant de passer en mode bloquant réel** :
naviguer l'app en conditions réelles (desktop + mobile, les deux thèmes,
les 3 espaces admin/institution/citoyen), ouvrir la console navigateur,
confirmer 0 message `[Report Only]` de violation. Uniquement après ça :
renommer l'en-tête `Content-Security-Policy-Report-Only` en
`Content-Security-Policy` dans `middleware.ts` pour la rendre bloquante.

**Preuve** : `middleware.ts` (diff), sortie `tsc`/`build`.

### 7. Clarification de la migration en doublon (GAP-06-03)

**Investigation (pas une correction — une clarification, comme demandé)** :

| | `20260711000002_institution_responsable.sql` | `20260711000002_institution_responsable_et_fix_langue.sql` |
|---|---|---|
| Contenu | `CREATE TABLE institution_responsables` (identique) | Même `CREATE TABLE` **+ correctif `institutions.langue` (integer→jsonb)** |
| Commit Git | `3c1d101`, 22/07/2026 (mega-commit "consolidation... 330 fichiers") | `43c93be`, **11/07/2026** (même jour que le nom du fichier, message de commit cohérent avec le contenu) |
| mtime disque | 17:13 | 18:33 (1h20 plus tard) |

**Conclusion** : `_et_fix_langue.sql` est très probablement la migration
réellement exécutée le 11/07 (commit le jour même, message explicite,
contenu plus complet). `institution_responsable.sql` (sans suffixe) porte
tous les signes d'un brouillon local antérieur (créé 1h20 avant l'autre,
jamais commité avant d'être accidentellement embarqué 11 jours plus tard
dans le commit de consolidation massif) — **CLAUDE.md cite déjà
`_et_fix_langue.sql` comme la migration canonique** de cette table
(section `/chantier-strategie-retention-v2`... non, précisément dans le
contexte réutilisé lors du chantier "Centre de configuration" de cette
même session), ce qui corrobore cette hypothèse.

**NOT VERIFIED — confirmation finale requise de Bryan** :
```sql
SELECT data_type FROM information_schema.columns
WHERE table_name='institutions' AND column_name='langue';
```
Si `jsonb` → `_et_fix_langue.sql` a bien été exécutée (hypothèse
confirmée). Si `integer` ou colonne absente → aucune des deux migrations
n'a été appliquée telle quelle, situation à ré-investiguer.

**Aucun fichier supprimé/modifié** — décision de conserver, renommer ou
supprimer `institution_responsable.sql` (sans suffixe) laissée à Bryan
une fois la requête ci-dessus confirmée.

### 8. Préparation des contrôles CI/CD (GAP-14-02)

**Avant** : `.github/workflows/` inexistant, aucun contrôle automatisé.

**Modification** : nouveau fichier `.github/workflows/ci.yml` — 2 jobs
sur push/PR vers `main` : (1) `npm ci` + `npx tsc --noEmit` + `npm run
build` (2) `npm audit --omit=dev` en mode informationnel
(`continue-on-error: true`, ne bloque rien tant que GAP-14-01 n'est pas
traité explicitement). Ne déploie rien (Netlify reste responsable du
déploiement via `@netlify/plugin-nextjs`, inchangé).

**Test** : fichier YAML syntaxiquement valide (structure standard GitHub
Actions, mêmes commandes que celles déjà vérifiées manuellement dans ce
lot). **Non exécuté réellement** — nécessiterait un push vers GitHub,
hors périmètre de cette session.

**Résultat** : contrôle prêt, mais **inactif tant qu'aucune "required
status check" n'est configurée côté GitHub**.

**Action requise de Bryan (NOT VERIFIED, dashboard GitHub)** : après le
premier push de ce fichier, aller dans Settings → Branches → Branch
protection rules sur `main`, et cocher "Require status checks to pass
before merging" avec le job `build-and-typecheck`. Sans cette étape, le
workflow tourne mais ne bloque aucun merge (cohérent avec GAP-14-03,
également NOT VERIFIED).

**Preuve** : `.github/workflows/ci.yml` (nouveau fichier).

---

## LOT 1.1 (suite) — Décisions sécurité (13/08/2026)

Traite les 4 points explicitement demandés par Bryan avant tout Lot 2.
Format `Analyse → Décision → Modification éventuelle → Tests → Preuves →
Documentation`. Journal correspondant dans
`docs/security/YELEN_SECURITY_MASTER.md` (entrées DEC-2026-08-13-01 à 04).

### 1. GAP-14-01 — npm : analyse de l'upgrade Next.js 16.2.1 → 16.3.0

**Analyse** (recherche réelle, pas supposée — changelog officiel
`github.com/vercel/next.js/releases/tag/v16.3.0` consulté) :

**Sécurité réelle apportée par 16.3.0** :
- Fix CVE-2025-13465 (lodash vendorisé) et mise à jour `@mswjs/interceptors`.
- Messages d'erreur améliorés pour les rejets SSRF sur IP privées en
  Image Optimization, `maximumResponseBody` désormais appliqué aussi aux
  images locales — directement pertinent pour Yelen224, qui a un
  `next.config.ts::images.remotePatterns` actif (Supabase Storage,
  Pexels, YouTube).
- Ces deux points correspondent exactement à 2 des CVE `next` listées
  par `npm audit` (SSRF via rewrites, DoS Image Optimization via SVG).

**Ce qui NE s'applique PAS à Yelen224** (réduit la surface réelle de
risque de l'upgrade) : `package.json` a `"dev": "next dev --webpack"` et
`"build": "next build --webpack"` — **Turbopack n'est pas utilisé**,
donc les changements 16.3.0 sur le cache disque Turbopack, le typegen
Turbopack, et la compilation de service worker (tous liés à Turbopack)
sont sans effet ici. `next.config.ts` n'utilise ni
`experimental.dynamicIO` ni `experimental.useCache` (les deux dépréciés
en 16.3.0) — aucun impact non plus.

**Points à tester spécifiquement avant tout bump** (pas juste `tsc`/`build`) :
- **Server Actions** : 9 fichiers `"use server"` existent
  (`app/compte/langue/actions.ts`, `menu/depenses/actions.ts`,
  `menu/interets/actions.ts`, `rdv/[id]/actions.ts`,
  `mes-rdv/actions.ts`, `compte/informations-personnelles/actions.ts`,
  `messagerie/citoyen/actions.ts`, `profil/actions.ts`,
  `institution/abonnement/actions.ts`). 16.3.0 **durcit l'application de
  `serverActions.bodySizeLimit` pour les actions en runtime Edge** — à
  tester une par une après upgrade, en particulier celles qui pourraient
  transporter des payloads plus lourds.
- **Runtime Edge** : `middleware.ts` tourne par défaut en Edge Runtime
  (aucun `runtime` explicite dans son `export const config`). Le
  changelog mentionne une dépréciation progressive de ce runtime "au
  profit du runtime Node.js" — présenté comme une dépréciation, pas une
  suppression dans 16.3.0, mais **à surveiller**, pas confirmé sans
  risque avec certitude depuis un changelog résumé.
- `postcss`/`sharp` se mettent à jour en cascade avec `next` (dépendances
  transitives) — `sharp` est utilisé côté serveur pour l'optimisation
  d'image : un changement de version mérite une vérification visuelle
  réelle des images optimisées (logos, bannières, avis) après upgrade.

**uuid/exceljs (moderate, séparé de next)** : le seul fix disponible
sans toucher next serait `exceljs@3.4.0` (downgrade, "breaking change"
signalé par npm lui-même). Sévérité moderate, fix = régression
potentielle sur l'export Excel (`lib` utilisé pour les rapports/exports
financiers déjà documentés dans CLAUDE.md) — non recommandé tant que le
risque n'est pas mis en balance avec l'usage réel d'`exceljs`.

**Décision** : `npm audit fix --force` **non exécuté**, conforme à la
consigne. Aucun changement de code dans cet item.

**Modification éventuelle** : aucune dans ce lot.

**Tests** : aucun test de code nécessaire (aucune modification) — analyse
uniquement.

**Recommandation pour un futur chantier dédié** (pas ce lot) : upgrader
`next` seul (pas `--force` global), dans une branche/session isolée,
puis dérouler : `tsc --noEmit` + `npm run build` (déjà la pratique du
projet) + vérification manuelle par Bryan des 9 flux Server Actions +
un contrôle visuel des images optimisées (logo/bannière institution,
photos avis) + vérification que le geo-blocking/middleware (actuellement
désactivé par défaut) n'est pas affecté si jamais activé.

**Preuves** : changelog officiel Next.js 16.3.0 (vercel/next.js releases),
`package.json` (scripts `--webpack`), `next.config.ts` (absence des flags
dépréciés), recherche exhaustive `"use server"` (9 fichiers).

### 2. GAP-10-01 — Rate limiting : TEMPORARY ACCEPTED GAP

**Analyse** : voir détail complet dans
`docs/security/YELEN_SECURITY_MASTER.md`, entrée **DEC-2026-08-13-02**.
Point factuel supplémentaire trouvé pendant cette analyse : **admin** a
un filet persistant réel (`admin_users.failed_login_attempts`/
`locked_until`, survit aux redémarrages, partagé entre instances car en
base) — **institution et citoyen n'ont aucun équivalent persistant**,
uniquement la `Map` en mémoire. Les deux flux ne sont donc pas au même
niveau de risque réel.

**Décision** : accepté temporairement pour la phase pré-lancement,
formalisé comme **⚫ EXCEPTION APPROVED — TEMPORARY ACCEPTED GAP** dans
le master plan, avec 5 conditions de levée explicites (voir
DEC-2026-08-13-02) : fin de phase pré-lancement, confirmation de
concurrence réelle d'instances, incident réel observé, observabilité
disponible, ou priorité de traitement institution/citoyen avant admin.

**Modification** : aucune (documentation uniquement, comme demandé).

**Tests** : sans objet (aucun changement de code).

**Preuves** : `lib/edgeSecurity.ts`, routes de login des 3 systèmes
d'auth (déjà citées au Lot 1.1 précédent), `docs/security/YELEN_SECURITY_MASTER.md` DEC-2026-08-13-02.

### 3. GAP-04-03 — MFA admin : audit + proposition minimale (non implémentée)

**Analyse du mécanisme actuel** (lecture complète de
`app/api/admin/auth/2fa/setup|verify/route.ts` + `login/route.ts`) :
- `admin_users.totp_secret`/`totp_enabled`/`totp_backup_codes` déjà en
  place. `/2fa/setup` génère un secret en attente (`totp_enabled` reste
  `false`) — **nécessite déjà une session admin valide** (mot de passe
  déjà vérifié) pour être appelée. `/2fa/verify` confirme le premier
  code, active réellement `totp_enabled=true`, génère 8 codes de secours
  (bcryptés, affichés une seule fois). `login/route.ts` n'exige le TOTP
  que si `totp_enabled` est déjà `true` — sinon, connexion complète avec
  mot de passe seul, aucune trace d'obligation nulle part dans le code.
- **Aucun mécanisme d'application obligatoire n'existe** — activer la
  2FA est aujourd'hui un choix 100% volontaire de chaque admin, jamais
  imposé.

**Décision de Bryan** : MFA obligatoire pour tous les comptes admin.

**Proposition d'implémentation minimale** (conçue, **non codée dans ce
lot**) :
1. Ajouter un claim `mfaEnabled: boolean` dans le JWT admin au moment de
   la connexion (évite une requête DB supplémentaire à chaque appel).
2. Gate centralisé dans `lib/adminAuth.ts::authorizeAdmin()` (le point
   de passage unique déjà utilisé par toutes les routes admin, voir
   `/durcissement-autorisation-admin` dans CLAUDE.md) : si
   `!mfaEnabled`, refuser tout sauf une liste d'exception minimale
   (`2fa.setup`, `2fa.verify`, logout) avec un code dédié
   `MFA_SETUP_REQUIRED` que le frontend traduit en redirection forcée,
   non contournable, vers l'écran de configuration 2FA existant.
3. Aucune nouvelle table, aucun nouveau mécanisme cryptographique —
   uniquement un gate d'application sur l'existant déjà audité et
   fonctionnel.

**Pourquoi non implémenté maintenant** : **risque réel de verrouillage**.
Un seul compte admin réel existe en base (`super_admin`, confirmé au
Lot 1) et son état `totp_enabled` réel est **UNKNOWN** (jamais vérifié
par SQL). Déployer un gate obligatoire avant confirmation pourrait
verrouiller Bryan hors de son propre panneau admin dès le prochain
déploiement — contraire à "ne pas modifier l'architecture si cela
nécessite un chantier plus large" et au bon sens opérationnel. Le gate
touche aussi le point d'autorisation central utilisé par 55+ endpoints
(`lib/adminAuth.ts`), donc une portée plus large qu'une correction
ponctuelle.

**Séquence recommandée pour un futur chantier dédié** :
1. Bryan confirme/active 2FA sur son propre compte via le flux déjà
   fonctionnel `/admin/security` → `/2fa/setup` → `/2fa/verify`
   (aucun code à écrire, ça marche déjà).
2. Implémentation du gate (1-2 fichiers : `lib/adminAuth.ts` +
   `app/admin/layout.tsx` pour la redirection UI).
3. Test avec un compte admin secondaire (à créer) avant d'activer
   réellement l'obligation pour tous.

**Tests** : sans objet (aucun code écrit) — *à ce stade de l'analyse
initiale*. Voir mise à jour ci-dessous : implémentation livrée le même
jour après confirmation de Bryan.

**Preuves** : `app/api/admin/auth/2fa/setup/route.ts`,
`app/api/admin/auth/2fa/verify/route.ts`,
`app/api/admin/auth/login/route.ts:120-149`,
`docs/security/YELEN_SECURITY_MASTER.md` DEC-2026-08-13-03.

#### Mise à jour 13/08/2026 — chantier MFA Admin exécuté

Bryan a confirmé la 2FA déjà active sur son compte (voir
DEC-2026-08-13-03 dans le master plan) — blocage de verrouillage levé.
Implémentation minimale du gate livrée le jour même, protocole complet :

- **Modification** : 2 fichiers — `app/api/admin/auth/login/route.ts`
  (claim `mfaEnabled` dans le JWT) et `middleware.ts`
  (`verifierTokenAdmin()` décode le claim, redirige vers `/admin/security`
  ou renvoie `403 MFA_SETUP_REQUIRED` si absent, sauf liste d'exception :
  `/admin/security`, `/api/admin/auth/{logout,me,change-password,2fa/*}`).
- **Test réel avant livraison** : lecture complète de
  `app/admin/security/page.tsx` pour vérifier tous ses appels API — a
  révélé un appel à `/api/admin/auth/change-password` absent de la
  première liste d'exception, corrigé avant de considérer le lot terminé
  (aurait cassé le changement de mot de passe pour tout compte pas
  encore en 2FA).
- **Tests** : `npx tsc --noEmit` → exit 0 (2 passes). `npm run build` →
  exit 0 (2 passes), ~200+ routes compilées sans erreur.
- **Limites assumées et documentées** (pas cachées) : sessions
  pré-existantes traitées comme non-MFA jusqu'à reconnexion (voulu) ;
  pas de re-émission du cookie juste après activation de la 2FA — une
  reconnexion est nécessaire pour que l'application le reconnaisse
  pleinement ; **aucun test en navigateur réel** (pas d'outil
  disponible dans cet environnement) — le parcours complet (compte sans
  2FA → redirection → configuration → reconnexion → accès normal) reste
  à valider par Bryan en conditions réelles.
- **Statut** : 🟡 NEEDS REVIEW — code livré et vérifié par compilation
  uniquement, validation réelle requise avant clôture.

### 4. GAP-04-02 — OTP citoyen : fournisseur SMS de production + vérification du garde-fou

**Analyse** :
- Fournisseur cible déjà identifié dans le code :
  **Nimba SMS** (`lib/auth/otp.ts`, commentaire "brancher l'envoi réel
  ici (Nimba SMS ou autre)" + fonction `envoyerSmsNimba` en TODO
  commenté). Dépendances nécessaires pour le brancher réellement :
  compte Nimba SMS + clé API (action externe, à faire par Bryan),
  puis implémentation de l'appel HTTP réel dans `genererEtEnvoyerOtp()`
  (le reste — génération aléatoire, hachage bcrypt, TTL 5 min, usage
  unique — est déjà écrit et fonctionnel des deux côtés, citoyen et
  institution).
- **Vérification du garde-fou en production** : confirmé par lecture de
  `lib/auth/otp.ts` et `app/api/institution/auth/send-otp/route.ts` —
  **aucun des deux flux ne bloque le fallback statique par
  `NODE_ENV==='production'`**. La seule condition est
  `process.env.SMS_PROVIDER` défini ou non — si absent (le cas réel
  aujourd'hui), le fallback (`CITOYEN_OTP_FALLBACK`/
  `INSTITUTION_OTP_FALLBACK`) s'applique **quel que soit
  l'environnement**, y compris un déploiement Netlify tournant en mode
  production.

**Décision de Bryan (question posée explicitement, réponse reçue)** :
**ne pas bloquer** le fallback par un garde `NODE_ENV` pour l'instant —
`yelen224.netlify.app` reste un environnement de développement/test
documenté (pas le domaine produit final `yelen224.app`), et Bryan
l'utilise activement pour tester les parcours d'inscription/connexion
(ex. le test "Nimba SMS" du 13/08/2026 lui-même). Bloquer maintenant
casserait cette capacité de test tant qu'aucun fournisseur SMS réel
n'est branché.

**Modification** : aucune — décision de documentation uniquement, comme
choisi.

**Tests** : sans objet.

**Résultat** : risque formalisé en **⚫ EXCEPTION APPROVED — TEMPORARY
ACCEPTED GAP** (DEC-2026-08-13-04), à réévaluer — et probablement
supprimer plutôt que bloquer — dès qu'un vrai fournisseur SMS est
branché.

**Preuves** : `lib/auth/otp.ts:38-69`,
`app/api/institution/auth/send-otp/route.ts:110-125`,
`docs/security/YELEN_SECURITY_MASTER.md` DEC-2026-08-13-04.

---

## Risques encore ouverts après ce Lot 1.1

| ID | Risque | Action restante |
|---|---|---|
| GAP-06-01 | RLS réel des 7 tables non confirmé | Bryan — requête SQL fournie ci-dessus |
| GAP-06-02 | Policies `institution_otp` en prod non confirmées | Bryan — requête SQL fournie ci-dessus |
| GAP-06-04 | Privilèges `EXECUTE` de `appliquer_recuperations_dues()` non confirmés | Bryan — requête SQL dans la section 06 |
| GAP-06-05 | Grants historiques `anon`/`authenticated` non confirmés | Bryan — requête SQL dans la section 06 |
| GAP-14-01 | 5 vulnérabilités npm restantes (bump `next` majeur) — analysé 13/08, `--force` volontairement non exécuté | Chantier dédié futur, testable (voir plan de test dans la section Lot 1.1 suite) |
| GAP-16-01 | CSP encore en Report-Only, pas bloquante | Bryan — vérification console navigateur puis bascule |
| GAP-14-02/03 | CI préparé mais pas activé comme "required check" ; branch protection réelle inconnue | Bryan — réglages GitHub |
| GAP-10-01 | Rate limiting en mémoire — formalisé **⚫ TEMPORARY ACCEPTED GAP** le 13/08 (DEC-2026-08-13-02), 5 conditions de levée définies | Suivi des 5 conditions, pas d'action immédiate |
| GAP-04-02 | OTP citoyen/institution sur fallback statique — formalisé **⚫ TEMPORARY ACCEPTED GAP** le 13/08 (DEC-2026-08-13-04), décision explicite de ne pas bloquer par `NODE_ENV` | Bryan — brancher Nimba SMS (compte + clé API), puis implémenter `envoyerSmsNimba()` |
| GAP-04-03 | ~~Gate MFA à valider~~ — **clos** (validation CEO 13/08/2026, tests TypeScript/build acceptés comme suffisants) | Clos. Amélioration future documentée (régénération/révocation de session immédiate après activation MFA dans `/2fa/verify`) — hors périmètre, à reprendre uniquement sur nouvelle demande |
| — | ~~`app/institution/verification/page.tsx` orpheline avec code fictif en dur~~ — **supprimée le 13/08/2026** sur demande de Bryan (0 référence trouvée nulle part dans l'app, flux entièrement remplacé par `/institution/inscription`) | Clos |

**Lot 1.1 terminé. Conforme à la consigne : aucun Lot 2 sans validation
explicite de ce Lot 1.1 par Bryan.**

---

## 04 — Identity & Authentication

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| GAP-04-01 | `app/api/institution/auth/register/route.ts:15` et `app/api/institution/auth/verify-otp/route.ts:18` définissent `const DEV_OTP = '123456'`, comparé sans condition d'environnement (`if (code === DEV_OTP) { verified = true }`) | Aucun bypass d'authentification ne doit être actif en production sans garde explicite | Le bypass fonctionne identiquement en dev et en prod — rien dans le code ne le désactive selon `NODE_ENV` | N'importe quel numéro de téléphone institution peut être connecté avec le code `123456`, en production comme en dev | High | Soit gater par `process.env.NODE_ENV !== 'production'`, soit remplacer par un mécanisme équivalent au fallback citoyen (`CITOYEN_OTP_FALLBACK`, env var, échec explicite si absente) | Fichiers cités, confirmé par 2 agents indépendants + lecture directe | 🟠 IN PROGRESS — dette déjà connue et documentée dans CLAUDE.md comme assumée par Bryan, mais jamais formalisée avec un statut d'exception au sens du master plan (section 00) |
| GAP-04-02 | `lib/auth/otp.ts` : le flux citoyen a été durci le 25/07/2026 (code aléatoire par tentative, bcrypt, TTL 5 min, usage unique) — mais tant qu'aucun `SMS_PROVIDER` n'est configuré, le code réellement vérifié est `process.env.CITOYEN_OTP_FALLBACK`, une valeur fixe partagée par tous les citoyens | Un OTP doit être unique par tentative et livré par un canal hors-bande réel | Code fixe partagé (valeur inconnue de cet audit, non lue) tant qu'aucun SMS n'est branché | Quiconque connaît `CITOYEN_OTP_FALLBACK` peut se connecter comme n'importe quel citoyen par numéro de téléphone seul | Medium | Brancher un fournisseur SMS réel (Nimba SMS déjà identifié dans le code comme cible) dès que possible ; en attendant, s'assurer que cette variable n'est jamais dans un contexte partagé/loggé | `lib/auth/otp.ts:16-23,43-59` | 🟠 IN PROGRESS — état intérimaire déjà documenté dans le code lui-même |
| GAP-04-03 | 2FA TOTP admin (`app/api/admin/auth/login/route.ts:120`) est conditionnée par `admin.totp_enabled`, un champ par compte — pas d'obligation globale. Un seul compte admin réel existe en base selon CLAUDE.md (non re-vérifié ici) | Les comptes à privilèges élevés doivent avoir MFA obligatoire (section 24 du master plan) | Pas de contrainte technique forçant `totp_enabled=true` pour les rôles admin | Un compte admin sans 2FA activée n'est protégé que par mot de passe (+ rate limit + verrouillage) | Medium | Décider si le 2FA doit devenir obligatoire pour `super_admin`/tous rôles admin, et vérifier l'état réel du compte existant | `app/api/admin/auth/login/route.ts:120-149` | 🟡 NEEDS REVIEW — statut réel du compte `totp_enabled` = **UNKNOWN**, à vérifier par Bryan via SQL |
| — | Rate limiting présent sur les 3 flux d'auth vérifiés (institution register, citoyen verify, admin login) : 5 tentatives/15min par IP + verrouillage persistant 5 échecs → 30min (admin) sur `failed_login_attempts`/`locked_until` | Brute force protégé | Aucun — implémentation correcte constatée | — | — | — | `app/api/admin/auth/login/route.ts:17-27,74-84,94-100` ; `app/api/citoyen/auth/verify/route.ts:14-26` ; `app/api/institution/auth/register/route.ts:22-35` | 🟢 VERIFIED (sur l'échantillon vérifié — voir GAP-10-01 pour la limite structurelle de ce mécanisme) |
| — | Protection timing-attack sur la comparaison de mot de passe admin (hash factice comparé même si le compte n'existe pas) | Ne jamais révéler l'existence d'un compte par le timing de réponse | Aucun | — | — | — | `app/api/admin/auth/login/route.ts:87-89` | 🟢 VERIFIED |
| GAP-08-01 | Vérification d'auth citoyen (`getAuthenticatedCitoyenId` appelant `supabase.auth.getUser()`) redéfinie localement dans chaque route citoyen plutôt que centralisée dans un fichier `lib/` unique (contrairement à `lib/institutionAuth.ts`, `lib/adminAuth.ts`, `lib/employeeAuth.ts`) | Une seule source de vérité par système d'auth | Fonction dupliquée par fichier | Risque de divergence future (un fichier corrigé, un autre oublié) — pas un trou aujourd'hui, un risque de maintenance | Low | Extraire une fonction `getAuthenticatedCitoyen()` unique dans `lib/` | Confirmé sur `app/api/citoyen/favoris/route.ts:17-23`, généralisé par l'agent (non ré-audité fichier par fichier au-delà de cet échantillon) | 🟡 NEEDS REVIEW |
| — | Sessions : institution 8h, admin 8h, employé 12h, citoyen "se souvenir" 60 jours (cookie `httpOnly`, `sameSite:strict`, `secure` en prod) | Durées explicites et cohérentes avec la sensibilité | Aucun écart trouvé | — | — | — | `app/api/institution/auth/register/route.ts:270`, `app/api/admin/auth/login/route.ts:166,199`, CLAUDE.md /chantier-clock-in-shift, `app/api/citoyen/auth/verify/route.ts:102-109` | 🟢 VERIFIED |

---

## 05 — Authorization / RBAC / ABAC

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| — | Matrice RBAC institution centralisée (`lib/institutionPermissions.ts`, `TAB_MATRIX`/`ACTION_MATRIX`, 5 rôles) ; matrice admin centralisée (`lib/adminAuth.ts`, deny-by-default) — les deux servent de source unique côté serveur, pas seulement côté UI | Autorisation vérifiée côté backend, jamais seulement frontend | Aucun trouvé dans ce lot (déjà audité et durci lors des chantiers précédents documentés dans CLAUDE.md — non re-vérifié ligne par ligne ici) | — | — | Re-confirmer périodiquement (section 38 du master plan) | `lib/institutionPermissions.ts`, `lib/adminAuth.ts` | 🟢 VERIFIED (hérité des audits précédents, non ré-exécuté intégralement dans ce Lot 1) |
| — | Zéro IDOR confirmé sur l'échantillon des 219 routes API : chaque identifiant sensible lu du body/query est soit une prétention pré-session prouvée cryptographiquement ensuite, soit comparé/filtré par l'identifiant dérivé de la session | Object-level authorization sur chaque endpoint | Voir limite ci-dessous | — | Medium | Étendre la vérification aux fichiers non couverts par les motifs de recherche utilisés (renommages de variable non standards) | Détail complet dans la section 08 ci-dessous | 🟡 NEEDS REVIEW — couverture partielle, pas exhaustive à 100% (voir limite documentée par l'agent) |

---

## 06 — Supabase Database Security (RLS)

**Couverture** : lecture exhaustive des 133 fichiers de `supabase/migrations/`. Aucune vérification en base réelle (hors de portée).

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| GAP-06-01 | 77 tables créées par migration ont toutes une trace `ENABLE ROW LEVEL SECURITY`. 7 tables préexistantes aux migrations (`institutions`, `users`, `rdv`, `avis`, `messages`, `notifications`, `admin_users`) n'ont **aucune** trace de `ENABLE ROW LEVEL SECURITY` dans les migrations | Toute table exposée doit avoir RLS actif, vérifié et tracé | Pour ces 7 tables, l'état réel en base est invérifiable depuis le code seul | Si l'une de ces tables n'a en réalité PAS RLS actif, elle est potentiellement lisible/modifiable en clair par le rôle `anon`/`authenticated` selon les GRANT réels (voir GAP-06-05) | **High** | `SELECT relrowsecurity FROM pg_class WHERE relname IN ('institutions','users','rdv','avis','messages','notifications','admin_users');` — à exécuter par Bryan | Rapport agent RLS, recoupement exhaustif CREATE TABLE ↔ ENABLE RLS sur 133 fichiers | 🟡 NEEDS REVIEW — **UNKNOWN réel, action requise de Bryan** |
| GAP-06-02 | `institution_otp` a eu 3 policies `TO anon` sans restriction réelle (`otp_read_anon`: lecture illimitée du code+téléphone ; `otp_insert_anon`: `WITH CHECK(true)` ; `otp_delete_anon`: `USING(true)`) créées le 09/07/2026, `DROP`-ées par `20260808000002_audit_rls_fixes.sql` le 08/08/2026 | Aucune policy `anon` ne doit exposer un secret d'authentification sans restriction | Correction présente dans les migrations mais application réelle en base de prod non confirmée | Si le `DROP POLICY` n'a pas été appliqué en prod, n'importe qui (clé `anon` publique) peut lire/manipuler les codes OTP institution de connexion | **High** | `SELECT * FROM pg_policies WHERE tablename='institution_otp';` — confirmer 0 ligne avec `anon` dans `roles` | `supabase/migrations/20260709000013_policies_otp_paid_services.sql`, `20260808000002_audit_rls_fixes.sql` | 🟡 NEEDS REVIEW |
| GAP-06-03 | Deux fichiers de migration portent le même horodatage `20260711000002` (`institution_responsable.sql` et `institution_responsable_et_fix_langue.sql`), chacun avec un `CREATE TABLE institution_responsables` identique | Historique de migrations cohérent, rejouable, sans ambiguïté | Un des deux fichiers n'a normalement pas pu s'exécuter tel quel (table déjà existante) sauf intervention manuelle | Signal de désordre dans l'historique — risque que l'état réel de la table diverge de ce qu'un rejeu des migrations produirait | Medium | Clarifier avec Bryan quel fichier a réellement été exécuté, corriger/documenter l'autre comme obsolète | Rapport agent RLS | 🟡 NEEDS REVIEW |
| GAP-06-04 | `appliquer_recuperations_dues()` (`SECURITY DEFINER`, sans paramètre, appelée par `pg_cron` toutes les 15 min) — aucun `REVOKE EXECUTE FROM PUBLIC` trouvé dans les migrations | Une fonction `SECURITY DEFINER` appelable sans contexte trigger doit soit vérifier l'autorisation en interne, soit avoir ses privilèges `EXECUTE` restreints | Pas de vérification d'appelant interne, privilèges `EXECUTE` réels non confirmés | Si exposée en RPC PostgREST à `anon`/`authenticated`, un appel manuel forcerait l'application immédiate de récupérations de compte déjà approuvées par un admin, contournant le délai de sécurité de 48h (mais sans pouvoir créer de fausse approbation ni cibler un compte précis) | Medium | `SELECT has_function_privilege('anon', 'appliquer_recuperations_dues()', 'execute');` — si `true`, ajouter `REVOKE EXECUTE FROM PUBLIC` | `supabase/migrations/20260725000006_citoyen_recuperation_compte.sql`, `20260725000007_recuperation_type_totp.sql` | 🟡 NEEDS REVIEW |
| GAP-06-05 | "Grants historiques dangereux" (anon+authenticated tous privilèges sur les 14 tables d'origine) documentés dans CLAUDE.md — zéro `GRANT`/`REVOKE` trouvé dans les 133 fichiers de migration (cohérent : ces grants prédateraient les migrations s'ils existent) | Grants minimaux, jamais de privilèges larges à `anon`/`authenticated` sur des tables sensibles | État réel des grants en base non vérifiable depuis les migrations | Si ces grants larges existent toujours, ils court-circuitent RLS pour certaines opérations selon la configuration | High (si confirmé) | `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated') AND table_schema='public';` | Rapport agent RLS, CLAUDE.md /securite | 🟡 NEEDS REVIEW |
| — | 58 `CREATE POLICY` inventoriées sur les tables créées par migration. Un seul cas de piège `FOR ALL`/`FOR UPDATE` sans `WITH CHECK` séparé trouvé (`notifications.notif_destinataire_own`), **déjà corrigé** par `20260808000002_audit_rls_fixes.sql`. Un second cas bénin (`avatars_citoyen_update_own`, condition symétrique, sans risque pratique) | Toute policy `FOR ALL`/write doit avoir un `WITH CHECK` explicite | Aucun gap actif restant trouvé | — | — | — | Rapport agent RLS, détail complet des 58 policies | 🟢 VERIFIED |
| — | Policies `anon`/PUBLIC restantes actives (hors `institution_otp` déjà traité) : toutes soit restrictives par condition métier (`statut='validee'/'publiee'`, `expires_at`, `reponse IS NOT NULL`), soit des compteurs à faible sensibilité (vues/likes, `USING(true)`) explicitement documentés comme volontaires par leurs auteurs | Accès `anon` limité au strict nécessaire | Fuite de comportement mineure possible ("qui a vu/liké quel avis/annonce") sur quelques tables à `USING(true)` | Faible — pas de PII directe exposée | Low | Confirmer avec Bryan si l'exposition "qui a vu/liké quoi" sans authentification est acceptable ; sinon restreindre à `authenticated` | Rapport agent RLS, détail complet section 4 | 🟡 NEEDS REVIEW (décision produit, pas un bug) |

---

## 08 — API Security

**Couverture** : 219 fichiers `app/api/**/route.ts` (compte réel au 13/08/2026, vs 207 documentés le 08/08/2026 — delta +12, cartographie précédente considérée comme approximative).

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| — | 32 routes sans appel direct à une fonction d'auth connue : 28 sont des routes d'authentification elles-mêmes (login/register/OTP/etc.), 4 sont des endpoints publics documentés comme volontairement ouverts (compteurs agrégés, fiche publique, vérification QR publique rate-limitée) | Improper Inventory Management (OWASP) évité — chaque route a une raison d'être documentée | Aucune route "trou de sécurité" trouvée sur cet échantillon | — | — | — | Liste complète des 32 fichiers dans le rapport agent | 🟢 VERIFIED (sur les 219 routes recensées) |
| — | Zéro IDOR confirmé : 12 occurrences d'identifiants sensibles lus du body/query examinées individuellement, toutes correctement gardées (comparaison à l'ID dérivé de la session, ou filtre combiné) | Broken Object Level Authorization évité (OWASP API #1) | Couverture non exhaustive à 100% (motifs de nommage standards uniquement, pas les 187 fichiers avec auth relus ligne à ligne en dehors de ces motifs) | Un IDOR pourrait exister sur un renommage de variable non standard, non couvert par la recherche | Medium | Étendre l'audit si une revue de sécurité plus approfondie est commandée (Lot API dédié) | Tableau complet des 12 cas dans le rapport agent | 🟡 NEEDS REVIEW — bon niveau de confiance, pas une garantie absolue |
| — | Zéro `.rpc()`, zéro driver Postgres brut, zéro ORM tiers, zéro littéral SQL — exclusivement client Supabase typé | Injection SQL structurellement exclue | Aucun | — | — | — | Recherche exhaustive documentée dans le rapport agent | 🟢 VERIFIED |
| — | Zéro `dangerouslySetInnerHTML` dans `app/`/`components/` | XSS via injection HTML structurellement exclu côté React | Aucun | — | — | — | `grep -rn "dangerouslySetInnerHTML" app components` → 0 résultat | 🟢 VERIFIED |

---

## 10 — Rate Limiting & Abuse Prevention

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| GAP-10-01 | Rate limiting implémenté via des `Map` JavaScript en mémoire, locales à chaque fichier de route (`app/api/admin/auth/login/route.ts`, `app/api/citoyen/auth/verify/route.ts`, `app/api/institution/auth/register/route.ts`) et dans `lib/edgeSecurity.ts` pour le middleware global | Rate limiting fiable indépendamment du cycle de vie de l'instance serveur | Ce pattern ne survit pas à un redémarrage/cold start, et sur une plateforme serverless (Netlify Functions) l'état n'est pas garanti partagé entre instances concurrentes — limitation déjà auto-documentée dans le code (`lib/edgeSecurity.ts`) | Sur un pic de trafic avec plusieurs instances concurrentes, le rate limit réel pourrait être significativement plus permissif que les seuils affichés (ex. "5 tentatives/15min" pourrait devenir "5 × N instances") | Medium | Évaluer un store partagé (Supabase table dédiée, Redis/Upstash, ou équivalent) pour les flux les plus sensibles (login/OTP) si le volume de trafic le justifie | `lib/edgeSecurity.ts` (commentaire explicite), `app/api/admin/auth/login/route.ts:15`, `app/api/citoyen/auth/verify/route.ts:14`, `app/api/institution/auth/register/route.ts:22` | 🟡 NEEDS REVIEW |

---

## 12 — Secrets Management

**Couverture** : recherche exhaustive dans le code source versionné + historique Git complet (90 commits).

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| — | Aucun fichier `.env*` tracké par git (`git ls-files \| grep -i env` vide) ; `.gitignore` couvre `.env*` correctement ; aucune clé/secret en dur trouvée dans le code source (motifs `sk_live`, `service_role` en valeur, hex/base64 longs, clés AWS/PEM/sk-ant : 0 résultat) | Zéro secret dans Git | Aucun | — | — | — | Rapport agent secrets, détail des commandes exécutées | 🟢 VERIFIED |
| — | Aucune fuite historique : `git log -p --all -- '*.env*'` vide, `git log --diff-filter=A --all --name-only -- '*.env*'` vide sur 90 commits | Historique Git propre | Aucun | — | — | — | Rapport agent secrets | 🟢 VERIFIED |
| — | Inventaire de ~22 variables d'environnement serveur référencées dans le code (liste complète dans le rapport agent : `ADMIN_JWT_SECRET`, `INSTITUTION_JWT_SECRET`, `EMPLOYEE_JWT_SECRET`, `CITOYEN_WEBAUTHN_JWT_SECRET`, `CITOYEN_TOTP_CHALLENGE_JWT_SECRET`, `INSTITUTION_TOTP_CHALLENGE_JWT_SECRET`, `QR_SECRET_KEY`, `CITOYEN_OTP_FALLBACK`, `VAPID_PRIVATE_KEY`, etc.) | Inventaire complet des secrets (section 02/12) | Pas de rotation documentée pour aucun de ces secrets | Impossible de savoir si un secret compromis serait détecté/renouvelé | Medium | Documenter une politique de rotation minimale, au moins pour les JWT secrets et `SUPABASE_SERVICE_ROLE_KEY` | Rapport agent secrets | 🔴 NOT STARTED (rotation) / 🟢 VERIFIED (inventaire) |
| — | `.env.local` présent sur disque local (1620 octets), correctement ignoré par git — **contenu non lu dans cet audit** (précaution : éviter d'exposer des valeurs de secrets dans un rapport/contexte) | — | — | — | — | — | `ls -la .env*` | 🟢 VERIFIED (couverture .gitignore) |

---

## 14 — Git & Supply Chain / CI-CD

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| GAP-14-01 | `npm audit --omit=dev` → **8 vulnérabilités (2 moderate, 6 high)** en production ; `npm audit` complet → **10 vulnérabilités (1 low, 2 moderate, 7 high)**. Paquets concernés : `next` (multiples CVE — DoS, XSS, SSRF, bypass middleware, cache poisoning), `postcss`, `brace-expansion`, `nanoid`, `js-yaml`, `ws`, `exceljs`→`uuid`. **Zéro "critical"** | Zéro vulnérabilité high/critical non traitée en production | 8 vulnérabilités production non corrigées, dont `next` lui-même | Exposition aux CVE listées, dont certaines exploitables à distance (DoS/SSRF) | **Medium-High** | Bump `next` 16.2.1→16.3.0 (déjà recommandé dans CLAUDE.md /audit-consolidation), `npm audit fix` pour le reste, revérifier après | Sortie exacte de `npm audit` dans le rapport agent | 🟠 IN PROGRESS — déjà identifié dans un audit précédent (CLAUDE.md), correctif non encore appliqué |
| GAP-14-02 | `.github/workflows/` n'existe pas | Pipeline CI avec au minimum build+test+scan avant merge (section 14/15 du master plan) | Aucun CI/CD, aucun test automatisé, aucun scan de sécurité automatisé | Toute régression (fonctionnelle ou sécurité) n'est détectée qu'en local par Claude Code ou manuellement par Bryan — rien de systématique à chaque push | Medium | Mettre en place un minimum : `npm run build` + `npm audit` + secret scanning en GitHub Action à chaque PR | `ls .github/workflows` → absent | 🔴 NOT STARTED |
| GAP-14-03 | Aucun `CODEOWNERS`, aucun template de PR, aucun hook git actif (seulement les `.sample` par défaut) trouvé en local | Branch protection + revue obligatoire sur `main` | État réel des réglages GitHub (Settings → Branches) non vérifiable depuis le code local | Un push direct sur `main` part immédiatement en production (CI/CD Netlify déjà confirmé par CLAUDE.md) sans qu'aucune barrière technique locale ne l'empêche | Medium | Vérifier/activer la protection de branche sur `main` dans les réglages GitHub | Rapport agent secrets | 🟡 NEEDS REVIEW — **UNKNOWN, à vérifier par Bryan sur github.com** |
| — | `package-lock.json` présent et tracké par git | Dépendances verrouillées de façon reproductible | Aucun | — | — | — | `git ls-files \| grep package-lock` → présent | 🟢 VERIFIED |
| — | 90 commits au total sur le repo, historique Git propre (voir section 12) | — | — | — | — | — | `git log --all --oneline \| wc -l` → 90 | 🟢 VERIFIED |

---

## 16 — Netlify Security

**Couverture** : uniquement ce qui est visible depuis le code (`netlify.toml`, `middleware.ts`). Le dashboard Netlify (domaine, DNS, variables d'environnement en production, previews, permissions de déploiement) est hors de portée de cet audit.

| ID | Current State | Required Standard | Gap | Risk | Priority | Recommendation | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| GAP-16-01 | `middleware.ts` définit 6 headers de sécurité (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-XSS-Protection`, `Permissions-Policy`, `Strict-Transport-Security`) sur toutes les réponses (matcher quasi global). **Aucun header `Content-Security-Policy` n'est défini nulle part** — ni dans `middleware.ts`, ni dans `netlify.toml` (aucune section `[[headers]]`) | CSP configurée pour limiter les sources de script/style/frame (section 16 du master plan cite CSP explicitement) | Absence totale de CSP | Surface XSS plus large en cas de faille future (pas de filet de rattrapage au niveau navigateur) — atténué par l'absence de `dangerouslySetInnerHTML` (GAP section 08) mais pas remplacé | Medium-High | Définir une CSP de base (au minimum `default-src 'self'`, ajuster pour Supabase/fonts/images distantes déjà listées dans `next.config.ts::remotePatterns`) | `middleware.ts:38-51`, `netlify.toml` (contenu intégral lu, aucune section `[[headers]]`) | 🔴 NOT STARTED |
| — | `netlify.toml` : build minimal (`npm run build`, publish `.next`, plugin `@netlify/plugin-nextjs`), `SECRETS_SCAN_OMIT_KEYS` limité à 3 clés `NEXT_PUBLIC_*` légitimement publiques | Configuration Netlify minimale et cohérente | Aucun gap trouvé sur ce qui est versionné | — | — | — | `netlify.toml` (fichier entier, 9 lignes) | 🟢 VERIFIED (sur le périmètre versionné) |
| — | Domaine/DNS, variables d'environnement de production réelles, permissions de déploiement, protection des previews, HTTPS/certificats | — | **UNKNOWN — dashboard Netlify non accessible depuis cet environnement** | — | — | Bryan à vérifier directement dans Netlify (Site settings → Domain/Environment/Deploys) | — | 🔴 NOT STARTED (non audité) |

---

## Sections explicitement NON auditées dans ce Lot 1

Ces sections du master plan nécessitent soit un accès à des dashboards
externes (Supabase Studio, Netlify, GitHub) que cet environnement n'a pas,
soit un travail de conception qui dépasse un audit en lecture seule du
code. Elles restent 🔴 NOT STARTED tant qu'un lot dédié ne les traite pas :

- **02 — Asset & Architecture Inventory** : partiellement couvert en creux
  par cet audit (secrets, routes, migrations), mais aucune cartographie
  formelle des services tiers/DNS/emails/analytics n'a été produite.
- **03 — Data Classification** : aucune classification formelle des
  données Yelen n'existe à ce jour.
- **06 (partie Supabase Studio)** : SSL enforcement, Network Restrictions,
  MFA organisation, OTP expiration Supabase Auth natif, SMTP, rate limits
  Supabase-side, Realtime authorization, backups/PITR — tout ce qui vit
  dans le dashboard Supabase et pas dans les migrations.
- **11 — File & Storage Security** : `lib/uploadSecurity.ts` a déjà été
  audité et durci lors d'un chantier précédent documenté dans CLAUDE.md
  (`/helper-upload-security`) — non ré-audité ligne par ligne dans ce
  Lot 1, à re-confirmer si un lot dédié Storage est lancé.
- **13 — Environnements** (séparation dev/staging/prod formelle) : le
  projet n'a aujourd'hui qu'un environnement Supabase/Netlify de fait
  (confirmé par CLAUDE.md : "yelen224.netlify.app est l'environnement de
  développement/test actuel").
- **17 — Supabase Production Hardening** : dépend de la checklist
  officielle Supabase, non vérifiable depuis le code.
- **18-20 — Backups, Restore Test, Disaster Recovery** : aucun RPO/RTO
  défini, aucun `DISASTER_RECOVERY_RUNBOOK.md` n'existe.
- **21-23 — Observability, Security Monitoring, Audit Trail applicatif
  général** : `journal_activite` (institution) et `admin_logs` existent et
  sont déjà des briques d'audit trail réelles (non ré-auditées en détail
  ici) ; pas d'observabilité infra (metrics/traces/alerting) au-delà de ce
  que Netlify/Supabase fournissent nativement.
- **24 (partie break-glass)** : pas de procédure d'urgence documentée pour
  un accès privilégié.
- **25 — Privacy & Data Governance** : `YELEN_DATA_GOVERNANCE.md` n'existe
  pas encore.
- **26 — Third-Party Security** : pas d'inventaire formel
  données-envoyées/pourquoi/où pour Supabase/Netlify/IPQualityScore/VAPID/
  futur fournisseur SMS.
- **27-28 — Performance, Scalability, Resilience** : aucun test de charge
  n'a été réalisé, aucun chiffre de trafic attendu n'a été défini.
- **29 — Mobile Security** : non applicable, aucune app native n'existe
  encore.
- **30-31 — Security Testing (SAST/DAST/pentest), Red Team** : aucun outil
  de ce type n'est branché dans le projet à ce jour.
- **32-34 — Incident Response, Vulnerability Management, Security
  Disclosure** : aucun document/processus formel n'existe.
- **35 — ADR** (`/docs/architecture/ADR/`) : n'existe pas.
- **36-37 — Business Continuity, Go/No-Go Framework** : non traités dans
  ce Lot 1, hors périmètre code.

---

## Synthèse

| Priorité | Nombre de gaps identifiés |
|---|---|
| High | 3 (GAP-06-01, GAP-04-01, GAP-06-02) |
| Medium-High | 2 (GAP-16-01, GAP-14-01) |
| Medium | 6 (GAP-06-03, GAP-06-04, GAP-10-01, GAP-04-02, GAP-04-03, GAP-14-02, GAP-06-05) |
| Low-Medium | 1 (GAP-14-03) |
| Low | 1 (GAP-08-01) |

**Aucune valeur n'a été inventée pour compléter ce tableau au-delà de ce
qui a été réellement trouvé.** Les sections non auditées sont listées
explicitement ci-dessus plutôt que remplies par supposition.

---

## LOT 1.3 — Security Surface Validation & Regression Audit (13/08/2026)

Validation de l'état actuel après les corrections des Lots 1, 1.1, 1.2 et
du chantier MFA Admin. Méthode : relecture complète des diffs réels
(`git diff` contre HEAD) des fichiers touchés par ces lots, relecture
intégrale de `middleware.ts`, vérification croisée des allowlists contre
les routes réellement présentes sur disque, `tsc`/`build` finaux. Aucune
nouvelle fonctionnalité, aucune refonte. Format
`preuve → risque → décision → correction éventuelle → test → résultat`.

### Authentification (4 systèmes)

**Preuve** : relecture des 4 mécanismes (citoyen Supabase Auth + OTP
haché, institution JWT custom + OTP durci ce lot, admin JWT + MFA
durci ce lot, employé JWT). Chaque système a son propre secret
(`*_JWT_SECRET`), son propre cookie, sa propre logique — aucun
chevauchement trouvé. **Risque** : aucun trouvé. **Décision** : aucune
action. **Correction** : aucune. **Test** : lecture de code. **Résultat** :
🟢 pas de régression.

### Sessions et JWT

**Preuve** : ajout du claim `mfaEnabled` au JWT admin (`login/route.ts`)
— vérifié qu'aucun autre système (citoyen/institution/employé) n'a été
touché. Durées de session inchangées (admin/institution 8h, employé 12h,
citoyen remember 60j). **Risque** : sessions admin signées avant le
déploiement du gate MFA traitées comme "MFA non active" jusqu'à
reconnexion (déjà documenté, comportement voulu). **Décision** :
accepté, déjà documenté dans le chantier MFA. **Correction** : aucune.
**Test** : `tsc`/`build`. **Résultat** : 🟢 conforme au comportement voulu.

### MFA Admin

**Preuve** : relecture complète de `middleware.ts` (gate) +
`login/route.ts` (claim) + vérification exhaustive des routes réelles
sous `app/api/admin/auth/` (`find`) contre les 2 listes d'exemption —
**aucun faux positif de préfixe trouvé** (ex. `/api/admin/auth/me` ne
matche accidentellement aucune autre route existante par
`startsWith()`). Vérifié aussi que `/admin/security` (page) et les 4
routes API qu'elle appelle (`me`, `change-password`, `2fa/setup`,
`2fa/verify`) sont bien toutes exemptées — pas de nouvelle omission
trouvée depuis la correction déjà appliquée au chantier. **Risque** :
aucun nouveau trouvé. **Décision** : aucune action. **Correction** :
aucune. **Test** : `tsc`/`build` + revue de code exhaustive. **Résultat** :
🟢 pas de régression, gate cohérent avec les routes réelles.

### Middleware (holistique)

**Preuve** : relecture intégrale du fichier (headers sécurité → CSP
Report-Only → géoblocage → mur mobile → anti-abus → protection admin
pages → protection admin API). Ordre des vérifications inchangé et
cohérent, aucun conflit entre les couches. **Observation non corrigée** :
les réponses `NextResponse.redirect()`/`.json()`/`.rewrite()` émises dans
les branches de blocage (géoblocage, mur mobile, UA suspect, rate limit,
redirections admin) ne portent pas les 6 headers de sécurité + CSP posés
sur l'objet `response` initial — **caractéristique pré-existante,
antérieure à tous les lots sécurité de cette session, pas une
régression introduite ici**. Sévérité réelle faible (ces réponses ne
rendent pas de contenu HTML exploitable par les headers concernés —
X-Frame-Options/CSP protègent du rendu de page, pas des redirections/JSON).
**Décision** : non corrigé — hors périmètre de ce lot ("corriger
uniquement un problème... directement démontré" ; ceci n'est ni une
régression ni démontré comme exploitable). Noté pour un futur
durcissement si voulu. **Test** : lecture de code. **Résultat** : 🟡
observation mineure documentée, pas d'action.

### Autorisations (RBAC institution + admin)

**Preuve** : diff complet de `lib/institutionPermissions.ts` relu ligne
par ligne — les seules additions sont soit antérieures à cette session
(Clock In Shift, Signalements, Documents clients, déjà documentées dans
CLAUDE.md), soit l'extraction pure de `tabAllowed`/`tabReadOnly` (Lot D
du chantier Centre de configuration), logique strictement identique à
l'original. `lib/adminAuth.ts` (matrice admin) **non touché** par aucun
lot sécurité. **Risque** : aucun. **Décision** : aucune action.
**Correction** : aucune. **Test** : diff line-by-line. **Résultat** : 🟢
aucune permission élargie ou affaiblie.

### Routes sensibles (institution register/verify-otp/send-otp, admin login)

**Preuve** : diff complet des 4 fichiers relu intégralement (voir
extraits dans ce document, sections précédentes). Suppression propre du
bypass `DEV_OTP`, logique de vérification réelle (`institution_otp`)
strictement identique à ce qu'elle était dans la branche "sinon" avant
le nettoyage — juste plus de branche de contournement à côté. **Risque** :
aucun nouveau. **Décision** : aucune action. **Correction** : aucune.
**Test** : `tsc`/`build`. **Résultat** : 🟢 conforme à l'intention du
Lot 1.1.

### RLS Supabase

**NOT VERIFIED** — aucun accès SQL Editor dans cet environnement,
inchangé depuis le Lot 1.1. Les 4 requêtes déjà fournies (GAP-06-01,
GAP-06-02, GAP-06-04, GAP-06-05) restent à exécuter par Bryan. Aucune
migration RLS n'a été écrite ni modifiée par aucun lot sécurité de cette
session — rien à re-vérifier côté code, seul l'état réel en base reste
en question.

### Séparation des rôles / multi-tenant

**Preuve** : aucun fichier touchant le scoping `institution_id`/
`citoyen_id`/`admin_id` n'a été modifié par les lots sécurité (seuls
touchés : auth OTP institution, login admin + MFA, middleware, CSP,
`.github/workflows/ci.yml`, page 404, docs). Le Lot 1 avait déjà confirmé
zéro IDOR sur 219 routes ; aucune de ces routes n'a été retouchée
depuis. **Risque** : aucun. **Décision** : aucune action. **Test** :
recoupement de la liste des fichiers modifiés. **Résultat** : 🟢 pas de
nouvelle surface IDOR introduite.

### OTP (citoyen + institution)

**Preuve** : relecture croisée de `lib/auth/otp.ts` (citoyen, inchangé
ce lot) et des 3 fichiers institution (modifiés ce lot). Les deux
suivent maintenant la même architecture (fallback env-gated, échec
explicite si absent, zéro valeur en dur). **Risque** : GAP-04-02 déjà
documenté et accepté (TEMPORARY ACCEPTED GAP), inchangé. **Décision** :
aucune nouvelle action. **Test** : lecture de code. **Résultat** : 🟢
cohérent entre les deux flux.

### API sensibles

**Preuve** : les routes `/api/admin/auth/*` et
`/api/institution/auth/*` modifiées ce lot ont toutes été relues
intégralement (pas seulement en diff) pour confirmer qu'aucune
vérification existante (rate limit, verrouillage, validation de format)
n'a été retirée par accident en supprimant le bypass OTP. **Risque** :
aucun. **Décision** : aucune action. **Test** : lecture intégrale,
`tsc`/`build`. **Résultat** : 🟢 aucune régression.

### Régressions générales / TypeScript / Build

**Preuve** : `npx tsc --noEmit` → exit 0. `npm run build` → exit 0,
~200+ routes compilées (dont `middleware` listé comme Proxy). Exécutés
en fin de Lot 1.3, sur l'état actuel complet du repo (tous les lots
sécurité + chantier MFA inclus). **Risque** : aucun. **Résultat** : 🟢
build et types propres.

---

## BILAN DES RISQUES OUVERTS (après Lots 1, 1.1, 1.2, MFA Admin, 1.3)

| ID | Risque | Statut | Action restante |
|---|---|---|---|
| GAP-06-01 | RLS réel des 7 tables non confirmé | 🟡 NOT VERIFIED | Bryan — SQL Editor |
| GAP-06-02 | Policies `institution_otp` en prod non confirmées | 🟡 NOT VERIFIED | Bryan — SQL Editor |
| GAP-06-04 | Privilèges `EXECUTE` de `appliquer_recuperations_dues()` | 🟡 NOT VERIFIED | Bryan — SQL Editor |
| GAP-06-05 | Grants historiques `anon`/`authenticated` | 🟡 NOT VERIFIED | Bryan — SQL Editor |
| GAP-14-01 | 5 vulnérabilités npm (bump `next` majeur) | 🟠 IN PROGRESS | Chantier dédié testable futur |
| GAP-16-01 | CSP en Report-Only, pas bloquante | 🟠 IN PROGRESS | Bryan — vérification console puis bascule |
| GAP-14-02/03 | CI préparé mais pas "required check" ; branch protection réelle inconnue | 🟠 IN PROGRESS / NOT VERIFIED | Bryan — réglages GitHub |
| GAP-10-01 | Rate limiting mémoire | ⚫ TEMPORARY ACCEPTED GAP | Suivi des 5 conditions de levée |
| GAP-04-02 | OTP citoyen/institution sur fallback statique | ⚫ TEMPORARY ACCEPTED GAP | Bryan — brancher Nimba SMS |
| GAP-04-03 | MFA admin | ✅ Clos | Amélioration future notée (régénération session), hors périmètre |
| — | Headers de sécurité absents sur les réponses redirect/error du middleware | 🟡 Observation mineure (pré-existante) | Aucune action requise, à considérer si un futur durcissement est demandé |

**Aucune correction supplémentaire appliquée dans ce Lot 1.3** — aucune
régression ni aucun bug de sécurité directement démontré n'a été trouvé
qui justifie une modification, conformément à la consigne. Aucun
commit. Aucun déploiement.

---

## LOT 1.4 — Production Configuration Verification (13/08/2026)

Audit de configuration uniquement, **aucune modification de code, de
migration ni de configuration**. Nouveauté par rapport aux lots
précédents : cet environnement dispose en réalité d'un accès réseau
sortant (confirmé par un test réel), ce qui a permis de vérifier
certains points **en conditions réelles sur le site de production
`yelen224.netlify.app`** au lieu de se limiter au code — plutôt que de
tout marquer NOT VERIFIED par réflexe. Aucun outil `gh`/`netlify` CLI
n'est disponible dans cet environnement (vérifié, pas supposé), donc
tout ce qui nécessite une authentification GitHub/Supabase/Netlify
reste NOT VERIFIED.

### 1. RLS Supabase
**NOT VERIFIED** — aucun accès SQL Editor. Requêtes déjà fournies au
Lot 1.1 (GAP-06-01), inchangées.

### 2. Policies
**NOT VERIFIED** — même raison. Requête déjà fournie (GAP-06-02,
`institution_otp`).

### 3. Grants
**NOT VERIFIED** — même raison. Requête déjà fournie (GAP-06-05).

### 4. Rôles anon/authenticated
**NOT VERIFIED** au niveau base de données (grants/policies réels).
**VERIFIED (partiel, en conditions réelles)** au niveau applicatif : test
live sans session sur 3 routes API sensibles représentatives —
`GET /api/institution/profile` → **401**, `GET /api/admin/citoyens` →
**401**, `GET /api/citoyen/favoris` → **401**. Les 3 rejettent
correctement un accès non authentifié sur le site de production réel.
Échantillon de 3 routes sur ~219 — pas une preuve exhaustive, mais une
preuve réelle sur les routes testées, exécutée le 13/08/2026 contre
`https://yelen224.netlify.app`.

### 5. Accès aux données sensibles
**VERIFIED (partiel, même échantillon que le point 4)** — aucune des 3
routes testées ne renvoie de donnée avant authentification. Cohérent
avec l'audit de code du Lot 1 (zéro IDOR confirmé sur 219 routes). Pour
une couverture exhaustive en conditions réelles, il faudrait tester les
219 routes une à une — hors périmètre raisonnable de cet audit de
configuration.

### 6. Configuration Supabase pertinente
**NOT VERIFIED** — SSL enforcement, Network Restrictions, MFA
organisation, OTP expiration Auth, SMTP, rate limits côté Supabase,
policies de bucket Storage, autorisation Realtime, backups/PITR :
aucun de ces réglages n'est accessible depuis cet environnement (dashboard
Supabase Studio requis). **Action requise de Bryan** : ouvrir
Supabase Studio → Project Settings, et vérifier un par un ces réglages
contre la checklist officielle Supabase Production ("Production
Checklist"), documentée comme référence dans le master plan section 39.

### 7. Configuration Netlify pertinente
**VERIFIED (partiel, en conditions réelles)** :
- HTTPS forcé : `curl http://yelen224.netlify.app` → `301` vers
  `https://yelen224.netlify.app/` confirmé.
- Le site répond bien via l'infrastructure Netlify (`Server: Netlify`,
  en-têtes `Cache-Status`/`X-Nf-Request-Id` cohérents avec une vraie
  requête Netlify Edge).
- `netlify.toml` (versionné, déjà revu au Lot 1) : build minimal,
  `SECRETS_SCAN_OMIT_KEYS` limité à 3 clés publiques légitimes — inchangé.

**NOT VERIFIED** : variables d'environnement réellement définies en
production (voir point 8), permissions de déploiement, protection des
previews, configuration DNS/domaine custom, règles de redirection/CORS
au-delà de ce qui est dans `netlify.toml` — tout ceci vit dans le
dashboard Netlify, non accessible depuis cet environnement.

### 8. Présence des variables d'environnement (sans exposer leur valeur)

**VERIFIED, local uniquement** — noms de variables extraits de
`.env.local` par un motif ciblé (`grep -oE '^[A-Z_]+='`), **aucune
valeur lue ni affichée**. 16 variables confirmées présentes par leur nom :
`ADMIN_JWT_SECRET`, `CITOYEN_OTP_FALLBACK`,
`CITOYEN_TOTP_CHALLENGE_JWT_SECRET`, `CITOYEN_WEBAUTHN_JWT_SECRET`,
`EMPLOYEE_JWT_SECRET`, `INSTITUTION_JWT_SECRET`,
`INSTITUTION_OTP_FALLBACK`, `INSTITUTION_TOTP_CHALLENGE_JWT_SECRET`,
`MOBILE_WALL_ENABLED`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`QR_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`.

Absentes localement, mais **attendu** (fonctionnalités désactivées par
défaut par design) : `SMS_PROVIDER` (aucun fournisseur SMS branché,
GAP-04-02), `IPQS_API_KEY` (optionnel, fail-open documenté),
`GEO_BLOCK_ENABLED`/`GEO_BYPASS_TOKEN` (géoblocage non activé),
`EDGE_RATE_LIMIT_ENABLED` (rate limit edge non activé), `NODE_ENV`
(généralement positionné automatiquement par l'environnement d'exécution,
pas par `.env.local`).

⚠️ **Absence notable, pas expliquée par un flag "désactivé par défaut"** :
`NEXT_PUBLIC_APP_URL`, référencée par les routes WebAuthn
(citoyen + institution) selon l'inventaire du Lot 1. Absente de
`.env.local`. **À vérifier par Bryan** : soit une valeur par défaut
existe dans le code (non confirmé, pas cherché en détail dans ce lot de
configuration), soit les flux WebAuthn (biométrie citoyen/institution)
sont potentiellement affectés en local. Pas testé en conditions réelles.

**NOT VERIFIED** : présence/valeurs des variables en production
(Netlify) — dashboard non accessible. C'est la vérification la plus
importante à faire côté Bryan (Netlify → Site settings → Environment
variables), en particulier pour confirmer que les secrets serveur
(`*_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) sont bien définis avec des
valeurs **différentes** de celles en local (principe déjà énoncé section
12 du master plan : "les secrets de production ne doivent jamais être
identiques à ceux du développement").

### 9. Protection GitHub/branches
**NOT VERIFIED** — confirmé concrètement, pas supposé : `gh` CLI absent
de cet environnement (`command not found`), aucun `netlify` CLI non
plus. Tentative d'appel direct à l'API GitHub publique sans
authentification : `GET api.github.com/repos/Sempya224/yelen224` → 404
(comportement normal de GitHub pour masquer un repo privé à un
utilisateur non authentifié) ; `GET .../branches/main/protection` → 401
"Requires authentication". **Action requise de Bryan** : vérifier
directement sur github.com → Settings → Branches, comme déjà noté au
Lot 1.1 (GAP-14-03).

### 10. Configuration du déploiement
**VERIFIED (partiel)** : `netlify.toml` déjà revu (Lot 1), build via
`@netlify/plugin-nextjs`, site réellement joignable et servi par
Netlify (confirmé en direct). **NOT VERIFIED** : permissions de
déploiement (qui peut déployer), séparation dev/staging/prod réelle
(le projet n'a aujourd'hui qu'un seul environnement de fait, déjà noté
au Lot 1 section 13), protection des URLs de preview.

### 11. Security headers effectivement servis

**FAILED / incohérence réelle constatée** — vérifié en direct sur
`https://yelen224.netlify.app`, pas supposé depuis le code :

| Route | Type | `X-Frame-Options` | `Referrer-Policy` | `X-XSS-Protection` | `Permissions-Policy` | `HSTS` | `X-Content-Type-Options` |
|---|---|---|---|---|---|---|---|
| `/` | statique, servie depuis un cache vieux de ~12 jours (`Age: 1072086`+, `X-Nextjs-Date: 11/08`) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `/recherche` | statique, cache | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `/institution/connexion` | statique, cache | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `/api/rdv-disponibilite` | API, **fraîche** (`Age: 0`, `fwd=bypass`, pas de cache) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `/admin/login` | dynamique, fraîche (`X-Nextjs-Date` = maintenant) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Constat** : seul `/admin/login` reçoit les 6 headers attendus. Toutes
les autres routes testées — y compris une route API fraîche, non mise
en cache — n'en reçoivent que 2 sur 6 (`Strict-Transport-Security` et
`X-Content-Type-Options`). **Cause exacte non déterminée avec
certitude** — hypothèses possibles, aucune confirmée : (a) artefact de
cache Netlify/Next.js sur les pages statiques ne s'appliquant pas à
`/api/rdv-disponibilite` (qui pourtant montre le même symptôme, ce qui
affaiblit cette hypothèse) ; (b) le dernier vrai déploiement (commit
`ca2b112`, 22/07/2026) contenait une version de `middleware.ts` qui ne
posait pas encore les 4 headers manquants, et seul un chemin de code
particulier (peut-être lié à la façon dont `/admin/login` est routée)
déclenche une exécution différente. **Aucune des deux hypothèses n'a
été vérifiée avec certitude** — ne pas conclure au-delà de ce qui est
observé.

**Décision** : aucune correction dans ce lot (audit de configuration
uniquement, comme demandé). **Action recommandée** : après un prochain
déploiement réel (qui invalidera le cache actuel), re-tester les mêmes
URLs pour voir si l'incohérence persiste — si elle disparaît, c'était un
artefact de cache/ancien déploiement ; si elle persiste, c'est un vrai
bug de configuration à investiguer plus profondément (hors périmètre
de cet audit).

---

## SYNTHÈSE LOT 1.4 — tableau récapitulatif

| Contrôle | Statut | Preuve / Action requise |
|---|---|---|
| RLS Supabase | 🔴 NOT VERIFIED | Bryan — SQL Editor |
| Policies | 🔴 NOT VERIFIED | Bryan — SQL Editor |
| Grants | 🔴 NOT VERIFIED | Bryan — SQL Editor |
| Rôles anon/authenticated (DB) | 🔴 NOT VERIFIED | Bryan — SQL Editor |
| Rôles anon/authenticated (API, échantillon) | 🟢 VERIFIED (partiel) | 3/3 routes testées rejettent correctement (401) en direct |
| Accès aux données sensibles (échantillon) | 🟢 VERIFIED (partiel) | Même test, aucune fuite constatée |
| Configuration Supabase (dashboard) | 🔴 NOT VERIFIED | Bryan — Supabase Studio |
| Configuration Netlify — HTTPS forcé | 🟢 VERIFIED | `curl` direct, 301 http→https confirmé |
| Configuration Netlify — reste (env vars prod, permissions, previews, DNS) | 🔴 NOT VERIFIED | Bryan — dashboard Netlify |
| Variables d'environnement — présence locale (noms seuls) | 🟢 VERIFIED | 16/16 attendues présentes, 1 absence notable (`NEXT_PUBLIC_APP_URL`) à vérifier |
| Variables d'environnement — présence production | 🔴 NOT VERIFIED | Bryan — dashboard Netlify (le plus prioritaire) |
| Protection GitHub/branches | 🔴 NOT VERIFIED | Confirmé non accessible (401/404 réels) — Bryan sur github.com |
| Configuration du déploiement | 🟡 VERIFIED (partiel) / NOT VERIFIED (reste) | `netlify.toml` + joignabilité confirmés, permissions/previews non vérifiables |
| Security headers effectivement servis | 🟠 FAILED (incohérent) | Preuve détaillée ci-dessus — à re-tester après un déploiement réel |

**Aucune valeur n'a été inventée. Aucune modification appliquée** —
conforme à la consigne "audit de configuration uniquement". Aucun
commit, aucun déploiement.

---

## LOT 1.5 — Production Security Headers Remediation & Verification (13/08/2026)

### Étape 1 — Diagnostic (cause identifiée avec certitude, pas supposée)

**Méthode** : comparaison directe entre `git show HEAD:middleware.ts`
(dernier commit réel, `3c1d101`, ce qui est déployé sur
`yelen224.netlify.app`) et le `middleware.ts` local actuel.

**Cause confirmée** : le `middleware.ts` **déployé** pose déjà les 6
headers de sécurité de façon inconditionnelle (identique au code local
sur ce point précis) — mais son `export const config.matcher` est :
```js
matcher: ['/admin/:path*', '/api/admin/:path*']
```
**Le middleware ne s'exécute donc QUE sur `/admin/*` et `/api/admin/*`
sur le site déployé.** Toutes les autres routes (`/`, `/recherche`,
`/institution/*`, `/api/rdv-disponibilite`, `/api/institution/*`,
`/api/citoyen/*`, etc.) ne passent jamais par le middleware en
production aujourd'hui — d'où l'absence des 4 headers app-level sur ces
routes. Les 2 headers universellement présents
(`Strict-Transport-Security`, `X-Content-Type-Options`) proviennent très
probablement d'un comportement par défaut de la plateforme Netlify
elle-même (hypothèse cohérente avec l'observation mais non confirmable
sans accès dashboard — n'affecte pas le diagnostic principal, qui lui
est confirmé par comparaison directe de code).

Le matcher a été élargi à tout le site dans une session ultérieure (09/08,
mission sécurité géo-restriction) mais **jamais déployé** — le code local
actuel a déjà le matcher large :
```js
matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-|apple-touch-icon|robots.txt|sitemap.xml).*)']
```

**Conclusion** : la cause est **le déploiement**, pas un bug de code
actif à corriger — le correctif du matcher existe déjà. Mais déployer ce
correctif seul, sans vérifier ce que les 4 headers fraîchement actifs
provoqueraient sur des fonctionnalités réelles, aurait révélé un second
problème réel (voir Étape 2/3 ci-dessous) — d'où l'importance de ne pas
se contenter de "il suffit de déployer".

**Reproduction par catégorie de route** (voir détail complet Lot 1.4) :
statique (`/`, `/recherche`, `/institution/connexion`) → 2/6 headers ;
dynamique/admin (`/admin/login`) → 6/6 headers ; API
(`/api/rdv-disponibilite`) → 2/6 headers. 404 et routes authentifiées
non testables en direct sans session valide — cohérent avec le
diagnostic matcher (le comportement dépend du préfixe de chemin, pas du
type de rendu Next.js).

### Étape 2 — Politique cible (inventaire réel, pas générique)

**Recherche exhaustive dans le code** (pas une politique copiée) pour
chaque directive demandée :

| Directive | Sources réelles trouvées | Preuve |
|---|---|---|
| `script-src` | Aucun script tiers, aucun analytics — `'self' 'unsafe-inline'` (hydratation Next.js/React inline) | Recherche exhaustive négative sur `<script src="http`, `gtag`, `google-analytics`, `plausible` |
| `style-src` | `'self' 'unsafe-inline'` (styles inline React massifs) | — |
| `img-src` | Supabase Storage, Pexels, YouTube thumbnails, **tuiles OpenStreetMap** (`*.tile.openstreetmap.org`, wildcard car sous-domaines a/b/c) | `next.config.ts::remotePatterns` + `components/CarteMap.tsx`, `LocationPicker.tsx` |
| `font-src` | `'self' data:` uniquement (voir migration polices ci-dessous) | — |
| `connect-src` | Supabase REST + Realtime (`wss:`), **formsubmit.co** (formulaire de contact) | `app/contact/page.tsx` fait un `fetch()` direct vers ce service tiers |
| `frame-src` | YouTube (lecteur embarqué), Supabase Storage (iframe d'impression PDF signée) | `app/page.tsx:1476`, `DocumentsFinanciersTab.tsx:202` |
| `frame-ancestors` | `'none'` | Équivalent CSP moderne de X-Frame-Options: DENY |
| `object-src` | `'none'` | Aucun plugin/embed nécessaire |
| `base-uri` | `'self'` | — |
| `form-action` | `'self'` | Recherche exhaustive : zéro `<form action="http...">` externe (formsubmit.co utilisé en `fetch()`, pas en soumission native) |

**WebAuthn** : aucune source CSP supplémentaire nécessaire —
`@simplewebauthn/browser` utilise l'API navigateur native
(`navigator.credentials`), zéro requête réseau propre ; toute
vérification passe par nos routes `/api/*` (déjà `'self'`).

**Géolocalisation** : ce n'est pas une directive CSP (gouvernée par
`Permissions-Policy`, voir Étape 3) — mais l'inventaire demandé par
Bryan a révélé un vrai problème dessus, traité en Étape 3.

**Toujours en mode Report-Only** — conforme à la consigne explicite de
tester d'abord sans bloquer.

### Étape 3 — Correction minimale

**Deux corrections appliquées, aucun refactoring, aucune fonctionnalité
nouvelle** :

**A) `Permissions-Policy` — régression réelle évitée avant qu'elle ne se
produise.** Avant : `camera=(), microphone=(), geolocation=()` (blocage
total des 3). Inventaire réel du code :
- `navigator.geolocation`/`getCurrentPosition` utilisé dans **8 fichiers
  réels** : `favoris-client.tsx`, `LocationPicker.tsx`, `mes-rdv/page.tsx`,
  `onboarding/page.tsx`, `app/page.tsx`, `RechercheInner.tsx`,
  `CarteMap.tsx`, `CarteMapHome.tsx`.
- Caméra utilisée par `app/institution/scanner/page.tsx` (`html5-qrcode`,
  scanner QR institution — fonctionnalité de présence documentée dans
  CLAUDE.md).
- Microphone : `app/compte/confidentialite/confidentialite-client.tsx`
  ne fait qu'une **lecture** de l'état de permission
  (`navigator.permissions.query`), jamais une demande d'accès réelle —
  aucune capture audio trouvée dans le code (`MediaRecorder`/
  `getUserMedia({audio})` absents). Laissé bloqué.

**Pourquoi c'est important** : ce header était déjà dans le code
**déployé** (voir Étape 1), mais son effet était masqué parce que le
matcher restreint empêchait le middleware de s'exécuter sur les pages
qui utilisent réellement géolocalisation/caméra. **Déployer uniquement
le correctif du matcher (Étape 1) sans corriger cette valeur aurait
cassé la carte, la recherche à proximité et le scanner QR institution
dès la mise en production** — exactement le type de régression que
Bryan a demandé d'éviter. Nouvelle valeur :
`camera=(self), microphone=(), geolocation=(self)`.

**B) CSP — sources réelles ajoutées** : `*.tile.openstreetmap.org`
(img-src), `formsubmit.co` (connect-src) — absents de la version Lot 1.1,
qui n'avait pas encore cet inventaire exhaustif.

**C) Migration Google Fonts → auto-hébergement** (décision de Bryan
suite à sa question explicite "ne pas garder une dépendance externe par
habitude") : les 9 pages qui chargeaient Inter/Sora/Nunito par `@import`
direct migrées vers `next/font/google` (même mécanisme déjà en place
pour la police de marque Plus Jakarta Sans dans `app/layout.tsx`) :
`app/ambassades/page.tsx`, `conditions-prestataires/page.tsx`,
`contact/page.tsx`, `education/page.tsx`, `faq/page.tsx`,
`institution/disponibilites/page.tsx`,
`mentions-legales/mentions-legales-client.tsx`,
`politique-cookies/page.tsx`, `signalement/page.tsx`. Résultat : les
exceptions CSP `fonts.googleapis.com`/`fonts.gstatic.com` **retirées** de
la politique — plus aucune dépendance externe pour les polices, zéro
requête réseau tierce, conforme au moindre privilège.

⚠️ **Bug réel trouvé et corrigé pendant la migration** : la police Sora
n'a pas de graisse statique 900 disponible via `next/font/google`
(confirmé dans les types du paquet) — `contact/page.tsx` et
`faq/page.tsx` l'utilisaient pourtant (`fontWeight: "900"` sur des
titres). Détecté par `tsc`, pas deviné. **Aucune régression réelle** :
Sora n'a jamais eu de graisse 900 sur Google Fonts non plus — le
navigateur retombait déjà silencieusement sur 800 avant la migration
(algorithme de matching de graisse CSS standard). Poids demandés
corrigés à 400-800.

### Étape 4 — Validation réelle

- `npx tsc --noEmit` → exit 0 (après correction de l'erreur Sora).
- `npm run build` → exit 0, ~200+ routes compilées, dont les 9 pages
  migrées confirmées toujours présentes et statiques (`○`).
- **Déploiement de test** : **non fait** — nécessiterait un commit/push,
  explicitement interdit sans validation CEO dans ce lot.
- **Tests HTTP réels sur le correctif** : **impossibles depuis cet
  environnement** tant que rien n'est déployé — les tests HTTP réels du
  Lot 1.4 portent sur l'ancien code toujours en production. **Action
  requise après un futur déploiement** : re-exécuter les mêmes `curl`
  qu'au Lot 1.4 sur `/`, `/recherche`, `/institution/connexion`,
  `/api/rdv-disponibilite`, `/admin/login` et comparer — les 6 headers
  devraient être présents partout après déploiement.
- **Aucune fonctionnalité cassée** : vérifié par lecture de code
  exhaustive (pas de régression identifiée), mais **non vérifié en
  navigateur réel** (aucun outil de ce type disponible ici) — la
  vérification visuelle réelle des 9 pages migrées et du comportement
  géolocalisation/caméra reste à faire par Bryan.

### Étape 5 — WebAuthn et `NEXT_PUBLIC_APP_URL`

**VERIFIED (code)** : `lib/config.ts` définit
`APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yelen224.netlify.app"`
— **un repli existe**, la variable n'est donc pas strictement requise
pour éviter un crash. Utilisée par les 8 routes WebAuthn (citoyen +
institution) pour construire l'origine attendue par la spec WebAuthn.

**Conséquence pratique (information, pas une action requise dans ce
lot)** : en local (sans la variable définie), WebAuthn retombe sur
`https://yelen224.netlify.app` comme origine attendue — ce qui ne
correspond PAS à `http://localhost:3000`, l'origine réelle en
développement local. WebAuthn vérifie l'origine strictement : un test
WebAuthn en local pourrait donc échouer par mismatch d'origine, pas par
absence de la variable elle-même. Aucune valeur secrète exposée pour
établir ce constat (uniquement lu le code source de `lib/config.ts`).

**NOT VERIFIED** : présence/valeur de `NEXT_PUBLIC_APP_URL` sur Netlify
en production — dashboard non accessible. Note : même si absente en
production, le repli (`https://yelen224.netlify.app`) est justement la
bonne valeur pour cet environnement — donc son absence éventuelle en
production ne casserait probablement rien, contrairement au cas local.

### Étape 6 — Voir aussi

`docs/security/YELEN_SECURITY_MASTER.md`, entrée DEC-2026-08-13-07, pour
le résumé décisionnel complet (cause → correction → tests → preuves →
résultat).

---

## Requêtes SQL toujours en attente (Bryan, pas chez lui — NOT VERIFIED, non bloquant)

Consolidées ici pour référence unique — détail de chaque item dans les
sections Lot 1.1/1.4 correspondantes :
1. RLS des 7 tables (GAP-06-01)
2. Policies `institution_otp` (GAP-06-02)
3. Privilèges `EXECUTE` de `appliquer_recuperations_dues()` (GAP-06-04)
4. Grants historiques `anon`/`authenticated` (GAP-06-05)
5. Clarification migration doublon `institution_responsables` (GAP-06-03)

**Confirmé explicitement par Bryan : ne bloque aucun autre travail.**
Statut inchangé : NOT VERIFIED, à traiter quand l'accès SQL Editor sera
disponible.
