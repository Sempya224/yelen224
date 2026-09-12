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
| GAP-06-01 | 7 tables sans aucune trace d'activation RLS dans les migrations (`institutions`, `users`, `rdv`, `avis`, `messages`, `notifications`, `admin_users`) | **High** | 🟢 VERIFIED — RLS actif confirmé par Bryan (SQL Editor) 14/08/2026, voir clôture finale en fin de document |
| GAP-04-01 | OTP institution `DEV_OTP='123456'` en dur, sans garde `NODE_ENV`, dans le code de production | **High** | 🟢 VERIFIED — corrigé Lot 1.1, voir journal de remédiation |
| GAP-06-02 | `institution_otp` a eu des policies `anon` sans restriction (lecture/insertion/suppression libres du code OTP) entre le 09/07 et le 08/08/2026 — corrigé en migration, application en prod non confirmée | **High** | 🟢 VERIFIED — 0 policy + RLS actif confirmé par Bryan 14/08/2026 (deny-by-default, service_role uniquement), voir clôture finale |
| GAP-16-01 | Aucun header Content-Security-Policy configuré nulle part (middleware ni netlify.toml) | **Medium-High** | 🟠 IN PROGRESS — CSP Report-Only déployée Lot 1.1, pas encore en mode bloquant |
| GAP-14-01 | 8 vulnérabilités npm en production (2 moderate, 6 high), dont `next` lui-même | **Medium-High** | 🟠 IN PROGRESS — 5/10 corrigées Lot 1.1 (`ws`/`js-yaml`), reste 5 : analyse détaillée faite 13/08 (`--force` volontairement non exécuté), chantier dédié testable à planifier |
| GAP-06-03 | Doublon de migration au même horodatage (`20260711000002`, deux fichiers créant `institution_responsables`) | **Medium** | 🟢 VERIFIED — `institutions.langue` confirmée `jsonb` par Bryan 14/08/2026, `institution_responsable_et_fix_langue.sql` est la migration réellement exécutée, l'autre fichier est un brouillon obsolète |
| GAP-06-04 | Fonction `SECURITY DEFINER` `appliquer_recuperations_dues()` sans paramètre, privilèges `EXECUTE` réels non confirmés | **Medium** | 🟢 VERIFIED & CORRIGÉ — `anon` avait bien `EXECUTE` (confirmé `true` 14/08/2026), `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` exécuté par Bryan, revérifié `false` |
| GAP-10-01 | Rate limiting basé sur des `Map` en mémoire locale à l'instance serverless — efficacité réelle sur Netlify Functions non garantie | **Medium** | 🟠 IN PROGRESS — solution `authSecurity.ts` complète pour les 5 flux + 2 bugs réels trouvés et corrigés en la testant (03/09 : succès comptés comme échecs ; 12/09 : contournement du compteur via `trouve`/`code_envoye`), 13 tests vitest verts, `tsc` exit 0. **Toujours non commité, non déployé** — voir section "MISE À JOUR — 12/09/2026" en fin de document |
| GAP-04-02 | OTP citoyen/institution : code unique partagé (`*_OTP_FALLBACK`) tant qu'aucun fournisseur SMS n'est branché, aucun garde `NODE_ENV` | **Medium** | ⚫ EXCEPTION APPROVED — **TEMPORARY ACCEPTED GAP** (13/08, DEC-2026-08-13-04), décision explicite de Bryan de ne pas bloquer |
| GAP-04-03 | 2FA admin optionnelle par compte, non imposée globalement | **Medium** | ✅ **Chantier MFA Admin clôturé** (validation CEO 13/08) — gate implémenté (`middleware.ts` + `login/route.ts`), `tsc`/`build` propres. Amélioration future notée (régénération de session après activation 2FA), hors périmètre. |
| GAP-14-02 | Aucun CI/CD (`.github/workflows/` absent) — zéro test/scan automatisé | **Medium** | 🟠 IN PROGRESS — workflow minimal préparé Lot 1.1, activation de la protection de branche restant à Bryan |
| GAP-14-03 | Branch protection / revue de PR GitHub — état réel non vérifiable en local | **Low-Medium** | 🟡 NEEDS REVIEW |
| GAP-08-01 | Vérification d'auth citoyen dupliquée localement par route (pas de fonction centrale unique, contrairement à institution/admin/employé) | **Low** | 🟢 CORRIGÉ 31/08/2026 — centralisé dans `lib/citoyenAuth.ts` (`verifierCitoyenToken`), les 44 routes concernées basculées, zéro changement de comportement externe. `tsc --noEmit` exit 0. **Non commité, non retesté en conditions réelles** — voir section "LOT 4 (suite)" |
| GAP-06-06 | `documents_institution.examine_par` — fichier de migration périmé (référence `admins` au lieu de `admin_users`), base réelle correcte (trouvé pendant l'audit Trust Model, 16/08/2026) | Low (doc seulement) | 🟢 VERIFIED 16/08/2026 — base saine, ne bloque plus le Lot 2, correction cosmétique du fichier source recommandée |
| GAP-06-07 | `admin_logs` n'a aucun trigger d'immuabilité, contrairement à `journal_activite`/`signalement_events` — modifiable/supprimable sans trace même par `service_role` (trouvé pendant l'audit Trust Model, 16/08/2026) | **Medium** | 🟢 VERIFIED & CORRIGÉ 30/08/2026 — trigger `admin_logs_immuable` livré (Mission 2 Hardening Admin, point 8), migration `20260830000003` confirmée exécutée en base par Bryan (DEC-2026-08-30-11). Statut mis à jour ici le 31/08, resté à tort 🟡 dans ce tableau depuis le 16/08. |
| GAP-06-08 | 9 tables testées (dont `admin_logs`, `documents_institution`, `signalements`) ont toutes des grants complets `anon`+`authenticated` — pattern systémique, pas limité aux 14 tables d'origine (trouvé pendant la clôture Lot 1, 16/08/2026) | **Medium** | 🟢 VERIFIED 16/08/2026 — neutralisé par RLS actif sur les 9, aucune exploitation réelle aujourd'hui |
| GAP-11-01 | 3 buckets Storage contenant des données sensibles (`recus-paiement`, `documents-travail`, `messagerie-images`) jamais mentionnés dans la checklist manuelle de création/vérification de buckets — statut Public/Privé réel jamais confirmé, contrairement aux 4 autres buckets privés déjà sur la checklist (trouvé pendant l'audit Lot 4, 31/08/2026) | **Medium-High** | 🟡 NEEDS REVIEW — voir section "LOT 4" ci-dessous, action requise de Bryan (dashboard Supabase) |
| GAP-06-09 | `InstitutionPublicClient.tsx` faisait `select("*")` sur `institutions` avec le client **anon** — la policy RLS `institutions_public_read` (lecture publique) filtre par ligne, jamais par colonne, donc `mot_de_passe_hash` (identifiants de connexion institution) était renvoyé dans la réponse JSON de **chaque fiche publique**, pour **chaque institution validée**, sans authentification (trouvé pendant l'audit Phase 0 "Booking externe", 01/09/2026) | **Critical** | 🟢 CORRIGÉ 01/09/2026 — `select()` explicite (colonnes réellement consommées, vérifiées une par une), `mot_de_passe_hash` exclu. `tsc` exit 0. **Non commité, non testé en navigateur réel** |
| GAP-04-05 | `QR_SECRET_KEY \|\| "yelen224-secret"` — secret de repli codé en dur signant les tokens QR de présence ; si la variable manque sur un environnement, la clé HMAC est publique (trouvé pendant la revue critique express, 01/09/2026) | **High** | 🟢 CORRIGÉ 01/09/2026 — repli supprimé, échec explicite (500) si `QR_SECRET_KEY` absente. `tsc` exit 0. **Non commité.** Reste `NOT VERIFIED` : que la variable soit bien définie sur tous les environnements Netlify actifs |
| GAP-08-02 | Aucune validation serveur (institution existe/validée, créneau cohérent, capacité non dépassée) à la création d'un RDV (`createRdv`) — RLS n'exige que `auth.uid()=citoyen_id`, tout le reste n'est qu'un filtre UI (trouvé initialement pendant l'audit Phase 0 Booking externe, reporté ici comme gap de sécurité applicative à part entière, 01/09/2026) | **Medium-High** | 🟢 CORRIGÉ 01/09/2026 — `validerCreneauServeur()` ajoutée dans `createRdv` (institution validée + créneau cohérent avec `disponibilites` + capacité non dépassée). `tsc` exit 0. **Non commité, non testé en conditions réelles** |

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

  executer le 8/28/2026 par  bryan  resulat   :   relname,relrowsecurity
users,true
users,true
notifications,true
messages,true
avis,true
admin_users,true
messages,true
rdv,true
institutions,true :




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
Résultat :Success. No rows returned

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

resultat  :    data_type
jsonb             ,  executer par bryan  le 8/28/2026
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
| GAP-06-01 | 77 tables créées par migration ont toutes une trace `ENABLE ROW LEVEL SECURITY`. 7 tables préexistantes aux migrations (`institutions`, `users`, `rdv`, `avis`, `messages`, `notifications`, `admin_users`) n'ont **aucune** trace de `ENABLE ROW LEVEL SECURITY` dans les migrations | Toute table exposée doit avoir RLS actif, vérifié et tracé | Pour ces 7 tables, l'état réel en base est invérifiable depuis le code seul | Si l'une de ces tables n'a en réalité PAS RLS actif, elle est potentiellement lisible/modifiable en clair par le rôle `anon`/`authenticated` selon les GRANT réels (voir GAP-06-05) | **High** | `SELECT relrowsecurity FROM pg_class WHERE relname IN ('institutions','users','rdv','avis','messages','notifications','admin_users');` — à exécuter par Bryan | Rapport agent RLS, recoupement exhaustif CREATE TABLE ↔ ENABLE RLS sur 133 fichiers | 🟢 VERIFIED 14/08/2026 — `relrowsecurity=true` confirmé sur les 7 tables (requête exécutée par Bryan) |
| GAP-06-02 | `institution_otp` a eu 3 policies `TO anon` sans restriction réelle (`otp_read_anon`: lecture illimitée du code+téléphone ; `otp_insert_anon`: `WITH CHECK(true)` ; `otp_delete_anon`: `USING(true)`) créées le 09/07/2026, `DROP`-ées par `20260808000002_audit_rls_fixes.sql` le 08/08/2026 | Aucune policy `anon` ne doit exposer un secret d'authentification sans restriction | Correction présente dans les migrations mais application réelle en base de prod non confirmée | Si le `DROP POLICY` n'a pas été appliqué en prod, n'importe qui (clé `anon` publique) peut lire/manipuler les codes OTP institution de connexion | **High** | `SELECT * FROM pg_policies WHERE tablename='institution_otp';` — confirmer 0 ligne avec `anon` dans `roles` | `supabase/migrations/20260709000013_policies_otp_paid_services.sql`, `20260808000002_audit_rls_fixes.sql` | 🟢 VERIFIED 14/08/2026 — 0 ligne renvoyée (0 policy au total, pas seulement 0 `anon`) + `relrowsecurity=true` sur `institution_otp` confirmé séparément → deny-by-default, service_role uniquement, conforme au pattern documenté CLAUDE.md |
| GAP-06-03 | Deux fichiers de migration portent le même horodatage `20260711000002` (`institution_responsable.sql` et `institution_responsable_et_fix_langue.sql`), chacun avec un `CREATE TABLE institution_responsables` identique | Historique de migrations cohérent, rejouable, sans ambiguïté | Un des deux fichiers n'a normalement pas pu s'exécuter tel quel (table déjà existante) sauf intervention manuelle | Signal de désordre dans l'historique — risque que l'état réel de la table diverge de ce qu'un rejeu des migrations produirait | Medium | Clarifier avec Bryan quel fichier a réellement été exécuté, corriger/documenter l'autre comme obsolète | Rapport agent RLS | 🟢 VERIFIED 14/08/2026 — `institutions.langue` est `jsonb` (confirmé par Bryan), donc `institution_responsable_et_fix_langue.sql` est la migration réellement exécutée ; `institution_responsable.sql` (sans suffixe) est un brouillon jamais appliqué, à documenter comme obsolète |
| GAP-06-04 | `appliquer_recuperations_dues()` (`SECURITY DEFINER`, sans paramètre, appelée par `pg_cron` toutes les 15 min) — aucun `REVOKE EXECUTE FROM PUBLIC` trouvé dans les migrations | Une fonction `SECURITY DEFINER` appelable sans contexte trigger doit soit vérifier l'autorisation en interne, soit avoir ses privilèges `EXECUTE` restreints | Pas de vérification d'appelant interne, privilèges `EXECUTE` réels non confirmés | Si exposée en RPC PostgREST à `anon`/`authenticated`, un appel manuel forcerait l'application immédiate de récupérations de compte déjà approuvées par un admin, contournant le délai de sécurité de 48h (mais sans pouvoir créer de fausse approbation ni cibler un compte précis) | Medium | `SELECT has_function_privilege('anon', 'appliquer_recuperations_dues()', 'execute');` — si `true`, ajouter `REVOKE EXECUTE FROM PUBLIC` | `supabase/migrations/20260725000006_citoyen_recuperation_compte.sql`, `20260725000007_recuperation_type_totp.sql` | 🟢 VERIFIED & CORRIGÉ 14/08/2026 — `anon` avait bien `EXECUTE` (`true` confirmé), `REVOKE EXECUTE ON FUNCTION appliquer_recuperations_dues() FROM PUBLIC, anon, authenticated` exécuté par Bryan, revérifié `false` |
| GAP-06-05 | "Grants historiques dangereux" (anon+authenticated tous privilèges sur les 14 tables d'origine) documentés dans CLAUDE.md — zéro `GRANT`/`REVOKE` trouvé dans les 133 fichiers de migration (cohérent : ces grants prédateraient les migrations s'ils existent) | Grants minimaux, jamais de privilèges larges à `anon`/`authenticated` sur des tables sensibles | État réel des grants en base non vérifiable depuis les migrations | Si ces grants larges existent toujours, ils court-circuitent RLS pour certaines opérations selon la configuration | High (si confirmé) | `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated') AND table_schema='public';` | Rapport agent RLS, CLAUDE.md /securite | 🟢 VERIFIED 14/08/2026 — grants larges confirmés bien présents sur plusieurs tables non listées en GAP-06-01 d'origine (`institution_otp`, `institution_sessions`, `transactions_financieres`, `institution_partenariat_demandes`, `offres`), mais `relrowsecurity=true` confirmé sur les 5 → RLS fait écran, pas de contournement réel malgré les GRANT larges |
| GAP-06-06 | Trouvé pendant l'audit "Trust Model" (16/08/2026) — `documents_institution.examine_par uuid REFERENCES admins(id)` **tel qu'écrit dans le fichier de migration** `20260711000005` référence `admins`, renommée `admin_users` par une migration antérieure — hypothèse initiale d'échec atomique de l'`ALTER TABLE` (5 colonnes en jeu, pas seulement la FK) | Une FK doit référencer une table réellement existante ; le fichier de migration doit refléter ce qui a été exécuté | Le **fichier** de migration est incorrect/obsolète par rapport à la base réelle — pas la base elle-même | Aucun — la base réelle est saine, seul le dépôt Git contient une version périmée de cette migration | Low (documentation seulement, plus aucun risque fonctionnel) | Corriger le fichier `20260711000005_documents_institution_workflow.sql` pour qu'il reflète `admin_users(id)` (cosmétique, aucune ré-exécution nécessaire) | Requêtes exécutées par Bryan le 16/08/2026 | 🟢 **VERIFIED 16/08/2026 par Bryan (SQL Editor)** — les 5 colonnes (`statut`,`motif_rejet`,`soumis_le`,`examine_le`,`examine_par`) existent toutes en production ; la contrainte réelle `documents_institution_examine_par_fkey` référence bien `admin_users(id)`, pas `admins(id)` — la base est correcte, seul le fichier source du dépôt ne reflète plus l'exécution réelle (probablement corrigée à la main par Bryan au moment de l'exécution). **Ne bloque plus le Lot 2.** |
| GAP-06-08 | Trouvé pendant la clôture Lot 1 Trust Model (16/08/2026) — les 9 tables `admin_logs`, `institution_responsables`, `institution_membres`, `documents_institution`, `journal_activite`, `signalement_notes`, `signalements`, `signalement_events`, `signalement_attachments` ont **toutes** des privilèges complets (`INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`) accordés à `anon` **et** `authenticated`, sans qu'aucun `GRANT` explicite n'existe dans les migrations | Grants minimaux, jamais de privilèges larges à `anon`/`authenticated` sur des tables sensibles (même exigence que GAP-06-05) | Ce n'est **pas** limité aux « 14 tables d'origine » documentées dans CLAUDE.md — c'est le comportement par défaut de ce projet Supabase sur des tables créées tout au long de l'historique de migrations (09/07 au 08/08/2026), probablement un privilège par défaut PostgreSQL/Supabase (`ALTER DEFAULT PRIVILEGES` ou rôle `postgres` propriétaire) jamais neutralisé | Neutralisé aujourd'hui par RLS actif + zéro policy sur ces 9 tables (confirmé par la même requête) — mais toute table qui perdrait son RLS par erreur, ou gagnerait une policy trop permissive, deviendrait immédiatement lisible/modifiable via la clé `anon` publique, sans qu'aucun `GRANT` n'ait jamais été posé consciemment | **Medium** (sans exploitation actuelle, mais un pattern systémique à surveiller à chaque nouvelle table) | Étendre GAP-06-05 : traiter ce pattern comme la norme par défaut du projet plutôt qu'une exception des 14 tables historiques — envisager un `REVOKE` systématique + `GRANT` explicite minimal sur toute nouvelle table sensible, ou au minimum une checklist de vérification RLS avant toute mise en production d'une nouvelle table | Requêtes exécutées par Bryan le 16/08/2026 | 🟢 VERIFIED 16/08/2026 — grants larges confirmés sur les 9/9 tables testées (7 confirmées en détail, 2 dernières — `signalement_events`/`signalement_attachments` — résultat tronqué dans la capture mais RLS confirmé actif sur les 9 par la requête de recoupement), `relrowsecurity=true` confirmé sur les 9 → RLS fait écran, pas de contournement réel aujourd'hui |
| GAP-06-07 | Trouvé pendant l'audit "Trust Model" (16/08/2026) — `admin_logs` a RLS actif et zéro policy (deny-by-default correct, écriture confirmée exclusivement `service_role` depuis 30 fichiers `app/api/admin/**`), mais **aucun trigger d'immuabilité**, contrairement à `journal_activite` (`journal_activite_immuable`) et `signalement_events` (`signalement_events_immuable`), qui bloquent même `service_role`/superutilisateur SQL Editor via `RAISE EXCEPTION` (échappatoire transactionnelle `SET LOCAL app.autoriser_correction_*`) | Une table qui sert de trace d'audit d'actions admin devrait être infalsifiable même contre un accès `service_role`/SQL Editor direct — c'est déjà le principe appliqué 2 fois ailleurs dans ce projet | `admin_logs` peut aujourd'hui être modifiée/supprimée sans laisser de trace de l'altération, par quiconque a accès `service_role` ou SQL Editor | Faible aujourd'hui (aucun code n'altère jamais une ligne, aucun incident connu) — devient significatif si `admin_logs` est un jour choisi comme support de traçabilité pour les décisions de vérification (Lot 0) | Medium — décision de gouvernance à trancher avant le Lot 2, pas une urgence technique | Deux options, **aucune à exécuter sans décision explicite** : (A) ajouter à `admin_logs` le même trigger que `journal_activite` (durcit rétroactivement toutes les actions admin existantes, coût fonctionnel nul) ; (B) laisser `admin_logs` tel quel et donner à la future table d'événements de vérification son propre trigger dès sa création, sans jamais faire transiter les décisions de vérification par `admin_logs`. Recommandation par défaut : (B), risque nul sur l'existant | `supabase/migrations/20260709000002_admin_users_and_logs.sql:22-32` (pas de trigger), `20260723000001_journal_activite_fondations_audit.sql:65-78` (trigger original), `20260808000005_signalement_events.sql:55-68` (même patron copié) | 🟡 NEEDS REVIEW — décision de gouvernance CEO, pas une vérification SQL |
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
| High | 3 (GAP-06-01, GAP-04-01, GAP-06-02) — GAP-06-06 reclassé Low après clôture 16/08 (base saine) |
| Medium-High | 2 (GAP-16-01, GAP-14-01) |
| Medium | 9 (GAP-06-03, GAP-06-04, GAP-10-01, GAP-04-02, GAP-04-03, GAP-14-02, GAP-06-05, GAP-06-07, GAP-06-08) |
| Low-Medium | 1 (GAP-14-03) |
| Low | 2 (GAP-08-01, GAP-06-06) |
| — | GAP-06-06/07/08 ajoutés le 16/08/2026, trouvés pendant l'audit "Trust Model" (`docs/product/YELEN_TRUST_DOMAIN_ARCHITECTURE.md`), pas le Lot 1 sécurité d'origine du 13/08. GAP-06-06 et GAP-06-08 clos le 16/08 (requêtes exécutées par Bryan) ; GAP-06-07 reste ouvert (décision de gouvernance) |

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
| GAP-06-01 | RLS réel des 7 tables | ✅ Clos 14/08/2026 | `relrowsecurity=true` confirmé sur les 7, Bryan (SQL Editor) |
| GAP-06-02 | Policies `institution_otp` en prod | ✅ Clos 14/08/2026 | 0 policy + RLS actif = deny-by-default, conforme au pattern documenté |
| GAP-06-03 | Doublon migration `institution_responsables`/`langue` | ✅ Clos 14/08/2026 | `langue` confirmée `jsonb`, fichier sans suffixe = brouillon obsolète |
| GAP-06-04 | Privilèges `EXECUTE` de `appliquer_recuperations_dues()` | ✅ Clos 14/08/2026 | `anon` avait `EXECUTE` (confirmé `true`), `REVOKE` exécuté par Bryan, revérifié `false` |
| GAP-06-05 | Grants historiques `anon`/`authenticated` | ✅ Clos 14/08/2026 | Grants larges confirmés sur 5 tables non listées à l'origine, mais RLS actif sur les 5 → sans conséquence réelle |
| GAP-14-01 | 5 vulnérabilités npm (bump `next` majeur) | 🟠 IN PROGRESS | Chantier dédié testable futur |
| GAP-16-01 | CSP en Report-Only, pas bloquante | 🟠 IN PROGRESS | Bryan — vérification console puis bascule |
| GAP-14-02/03 | CI préparé mais pas "required check" ; branch protection réelle inconnue | 🟠 IN PROGRESS / NOT VERIFIED | Bryan — réglages GitHub |
| GAP-10-01 | Rate limiting mémoire | ⚫ TEMPORARY ACCEPTED GAP | Suivi des 5 conditions de levée |
| GAP-04-02 | OTP citoyen/institution sur fallback statique | ⚫ TEMPORARY ACCEPTED GAP | Bryan — brancher Nimba SMS |
| GAP-04-03 | MFA admin | ✅ Clos | Amélioration future notée (régénération session), hors périmètre |
| — | Headers de sécurité absents sur les réponses redirect/error du middleware | ✅ Clos 14/08/2026 | Trouvé en vérification production Lot 1.5 (`/admin`, `/api/admin/kpis` sans session), corrigé via helper `appliquerHeadersSecurite()` appliqué aux 11 points de sortie du middleware (commit `bdbf215`), revérifié en production |

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

## Requêtes SQL — clôturées le 14/08/2026

Les 5 requêtes ci-dessous, longtemps NOT VERIFIED faute d'accès SQL
Editor, ont toutes été exécutées par Bryan le 14/08/2026. Détail complet
dans les sections Lot 1.1/1.4/06 correspondantes :

1. RLS des 7 tables (GAP-06-01) — ✅ `relrowsecurity=true` sur les 7.
2. Policies `institution_otp` (GAP-06-02) — ✅ 0 policy + RLS actif
   (deny-by-default, service_role uniquement).
3. Privilèges `EXECUTE` de `appliquer_recuperations_dues()` (GAP-06-04) —
   ⚠️ `anon` avait `EXECUTE` (`true`) → ✅ corrigé, `REVOKE EXECUTE ON
   FUNCTION appliquer_recuperations_dues() FROM PUBLIC, anon,
   authenticated` exécuté, revérifié `false`.
4. Grants historiques `anon`/`authenticated` (GAP-06-05) — ✅ grants
   larges confirmés sur `institution_otp`, `institution_sessions`,
   `transactions_financieres`, `institution_partenariat_demandes`,
   `offres` (non listées dans le GAP-06-01 d'origine), mais
   `relrowsecurity=true` confirmé sur les 5 → RLS fait écran, pas de
   contournement réel.
5. Clarification migration doublon `institution_responsables`
   (GAP-06-03) — ✅ `institutions.langue` = `jsonb`, confirme que
   `institution_responsable_et_fix_langue.sql` est la migration
   réellement exécutée le 11/07/2026 ; `institution_responsable.sql`
   (sans suffixe) est un brouillon jamais appliqué — suppression/
   renommage laissé à la discrétion de Bryan, aucune urgence.

**Les 5 items du registre `06 — Supabase Database Security` sont donc
tous clos.** Seule action volontairement non prise : suppression du
fichier de migration brouillon obsolète (GAP-06-03) — décision produit
mineure, pas de sécurité, laissée à Bryan.

---

## Clôture de la session sécurité du 14/08/2026

**Décision CEO** : le chantier sécurité s'arrête ici pour aujourd'hui —
reprise prévue un autre jour, sans urgence. Le prochain focus est la
refonte (design).

**État réel à la reprise** (voir aussi `YELEN_SECURITY_MASTER.md`,
journal des décisions, pour le détail complet lot par lot) :
- **Clos** : GAP-06-01, 06-02, 06-03, 06-04, 06-05 (les 5 ci-dessus,
  vérification + correctif SQL faits en base réelle), GAP-04-01
  (bypass OTP institution en dur), GAP-04-03 (MFA admin), et le bug de
  perte de headers de sécurité sur les réponses redirect/json/rewrite
  du middleware (trouvé et corrigé pendant la vérification production du
  Lot 1.5, commit `bdbf215`).
- **Encore ouvert, aucune action prise aujourd'hui, à reprendre** :
  - GAP-16-01 — CSP toujours en `Content-Security-Policy-Report-Only`
    (observation seule, ne bloque rien). Passage en mode bloquant réel
    nécessite une navigation complète en conditions réelles (Bryan,
    aucun outil navigateur disponible dans cet environnement) pour
    confirmer 0 violation avant de renommer l'en-tête.
  - GAP-14-01 — 5 vulnérabilités npm restantes, nécessitent un bump
    majeur de `next` (16.2.1 actuel) — changement à risque de
    régression, volontairement pas fait sans un chantier dédié testable
    séparé.
  - GAP-14-02/03 — CI (`ci.yml`) préparé mais pas activé comme "required
    check" sur GitHub, branch protection réelle inconnue — réglages
    GitHub, action 100% côté Bryan.
  - GAP-10-01, GAP-04-02 — déjà formalisés `TEMPORARY ACCEPTED GAP` par
    décision explicite de Bryan (13/08/2026), pas des oublis : conditions
    de levée déjà écrites dans le journal des décisions, à surveiller,
    pas à corriger dans l'urgence.
- **Hors périmètre code, à faire par Bryan quand il aura le temps** :
  suppression du fichier de migration brouillon obsolète (GAP-06-03,
  aucune urgence), bump `next` majeur (GAP-14-01), configuration des
  réglages GitHub (GAP-14-02/03).

Rien de bloquant ne reste en suspens pour le reste du produit — ce
chantier peut être repris à tout moment sans dette supplémentaire
accumulée entre-temps.

---

## LOT 1.5 — Déploiement contrôlé (13/08/2026, en attente de vérification)

**Autorisé par Bryan/CEO** : déploiement contrôlé du correctif, scope
strictement limité (19 fichiers, liste ci-dessous), pas un commit
massif des ~370 autres fichiers accumulés d'autres chantiers.

**Commit** : `4acf972` sur `main`, poussé sur `origin/main`
(`ca2b112..4acf972`). Fichiers inclus : `middleware.ts`,
`app/api/admin/auth/login/route.ts`,
`app/api/institution/auth/{register,verify-otp,send-otp}/route.ts`,
suppression de `app/institution/verification/page.tsx`,
`.github/workflows/ci.yml`, les 2 documents sécurité, et les 9+1 fichiers
de la migration polices (`app/ambassades/page.tsx`,
`app/conditions-prestataires/page.tsx`, `app/contact/page.tsx`,
`app/education/page.tsx`, `app/faq/page.tsx`,
`app/institution/disponibilites/page.tsx`,
`app/mentions-legales/page.tsx` + `mentions-legales-client.tsx`,
`app/politique-cookies/page.tsx`, `app/signalement/page.tsx`).

**Vérification post-déploiement — INCOMPLÈTE** : après ~30 minutes de
sondage HTTP réel (`curl` répété sur `/api/rdv-disponibilite`, route
jamais mise en cache, donc un signal fiable), le déploiement Netlify
n'était **toujours pas visible** — la route montrait encore l'ancien
état (2/6 headers). Aucun accès au dashboard Netlify depuis cet
environnement pour distinguer "build encore en cours" de "build en
échec". **Décision de Bryan : reporter la vérification à quand il aura
accès à son dashboard Netlify.**

**Découverte annexe pendant l'attente** : le workflow CI GitHub Actions
(`ci.yml`, livré au Lot 1.1) a échoué sur le job `build-and-typecheck`
(succès du job `dependency-audit` séparé) — cause très probable, non
encore confirmée avec certitude : `npm run build` a besoin des secrets
serveur (`ADMIN_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) que
GitHub Actions n'a pas (jamais configurés en Secrets GitHub, le fichier
`.env.local` n'étant jamais commité par design). **N'affecte pas le
déploiement Netlify** (pipeline indépendant). Action requise de Bryan
si le CI doit devenir fonctionnel : ajouter les mêmes variables que
`.env.local` dans GitHub → Settings → Secrets and variables → Actions.

**Statut Lot 1.5** : 🟠 **NOT CLOSED — en attente de vérification**
(pas `CLOSED` comme visé, faute de confirmation HTTP réelle du
déploiement). Prochaine étape dès l'accès Netlify de Bryan disponible :
re-exécuter les tests de la checklist complète (`/`, `/recherche`,
`/institution/connexion`, `/admin/login`, 404, route API publique,
route API protégée, géolocalisation, scanner caméra/QR, WebAuthn,
chargement des polices, carte OpenStreetMap, formsubmit) et comparer
prod vs local avant de clore définitivement.

---

## LOT 2 — Identity & Authentication (30/08/2026)

Reprise du chantier sécurité après la pause du 14/08/2026 (voir
`YELEN_SECURITY_MASTER.md`, clôture de session). Audit en lecture seule
des 4 systèmes d'auth (citoyen, institution, admin, employé) selon la
section 04 du master plan — inscription, connexion, sessions, MFA,
appareils, révocation, token theft, session hijacking. Méthode : lecture
directe de 37 routes `app/api/**/auth/**` + les libs `lib/auth/*.ts`,
`lib/institutionAuth.ts`, `lib/adminAuth.ts`, `lib/employeeAuth.ts`.
Format identique aux lots précédents : constat → preuve → correction
éventuelle → test.

### Découverte préalable — chantier "Auth Security" non documenté, trouvé en cours d'audit

En lisant les routes citoyen/institution, plusieurs fichiers portaient
des commentaires "chantier 28/08/2026" référençant un mécanisme inconnu
de ce document : `lib/security/authSecurity.ts` (286 lignes) + une
migration `20260828000004_auth_security.sql` créant 3 tables
(`auth_device_security`, `auth_ip_security`, `auth_security_events`) —
un remplacement complet du rate limiting en `Map` mémoire par un état
device+IP persistant et partagé entre instances serverless, exactement
la remédiation que GAP-10-01 appelait de ses vœux.

**Aucune trace de ce chantier** dans `git log` (dernier commit `038fb16`
du 20/08/2026), dans ce document, ni dans CLAUDE.md. `git status` a
confirmé que tout le code (13 fichiers) était **staged mais jamais
commité**, et que la migration SQL elle-même était **untracked** (`??`)
— contrairement à toute autre migration de ce dossier, jamais annotée
"exécuté par Bryan le X/X" une fois confirmée. **Statut d'exécution en
base UNKNOWN** au moment de la découverte — Bryan, absent de son poste
au moment de l'audit, n'a pas pu confirmer immédiatement. Requête à
exécuter avant tout commit/déploiement de ce lot :
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('auth_device_security','auth_ip_security','auth_security_events');
```
0 ligne → jamais exécutée (déployer le code sans la migration casserait
immédiatement connexion/inscription citoyen et institution, 500 sur
tables inexistantes). 3 lignes → déjà exécutée, à documenter ici.

**Couverture d'origine (28/08), avant ce Lot 2** : citoyen
lookup/verify/register/totp-login-verify, institution
lookup/send-otp/verify-otp/register — **mais pas** institution
pin/verify, institution webauthn/auth-verify, institution membre/login,
admin/auth/login, ni clock/auth/login, tous restés sur leur mécanisme
`Map` en mémoire d'origine (ou, pour membre/login et clock/auth/login,
un verrouillage persistant par compte sans aucun frein device/IP).

**Décision de Bryan (30/08/2026, en déplacement)** : finir ce chantier
dans le cadre du Lot 2 plutôt que le traiter séparément.

### GAP-10-01 — mise à jour : couverture étendue aux 5 flux de connexion, toujours non déployée

**Modification (ce Lot 2)** — les 5 routes restantes ont été câblées sur
`lib/security/authSecurity.ts`, en réutilisant la catégorie
`institution_login` déjà existante (aucun changement de schéma) pour
PIN/WebAuthn/membre institution, et en ajoutant 2 nouvelles catégories
`admin_login`/`employee_login` à la contrainte `CHECK` de la migration
non exécutée (additif, sans risque tant qu'elle n'a pas tourné en base —
à confirmer par Bryan avant exécution) :
- `app/api/institution/auth/pin/verify/route.ts` : suppression des 2 Map
  locales (`ipAttempts`, `failedAttempts` par institutionId).
- `app/api/institution/auth/webauthn/auth-verify/route.ts` : suppression
  de la Map locale `failedAttempts` par institutionId.
- `app/api/institution/auth/membre/login/route.ts` : le verrouillage
  persistant par compte (`institution_membres.failed_attempts/
  locked_until`, déjà présent en base depuis la migration
  `20260805000016`, mais dont le code n'était lui-même jamais commité)
  est **conservé** — il protège un compte ciblé quel que soit
  l'appareil. Le throttle device+IP est ajouté par-dessus, en défense en
  profondeur, pour couvrir l'angle qu'il ne couvre pas seul :
  l'énumération de plusieurs `identifiant` différents depuis un même
  appareil/IP.
- `app/api/admin/auth/login/route.ts` : suppression de la Map locale
  `loginAttempts` (IP seule). Catégorie dédiée `admin_login` (jamais
  mêlée aux seuils citoyen/institution vu le niveau de privilège) —
  complète, sans le remplacer, le verrouillage persistant déjà en place
  (`admin_users.failed_login_attempts`/`locked_until`, actif depuis le
  Lot 1).
- `app/api/clock/auth/login/route.ts` : même logique que membre/login —
  verrouillage persistant par compte (`employee_credentials`) conservé,
  throttle device+IP catégorie `employee_login` ajouté par-dessus.

**Test** : `npx tsc --noEmit` → exit 0 après chaque fichier puis sur
l'ensemble des 5 routes + la migration/le type `AuthEndpointCategory`
étendu. Aucun test réel possible (migration non confirmée exécutée, donc
aucune tentative de connexion réelle n'a été faite contre ces routes
dans cet audit — cela casserait la connexion en environnement réel si la
migration n'a pas tourné).

**Résultat** : les 5 systèmes de connexion partagent maintenant la même
échelle d'escalade device+IP (avertissement à 3 tentatives/15min, blocage
30min→2h→24h par cycle répété sur 24h, `support_only` au 5e cycle). Mais
**ce lot ne change rien à l'état réel de production** : le code reste
100% non commité, la migration reste d'exécution non confirmée.
`GAP-10-01` ne peut pas passer à VERIFIED/CLOSED tant que : (1) Bryan
confirme/exécute la migration, (2) ce lot (~16 fichiers désormais) est
commité et déployé, (3) une vérification en production équivalente au
Lot 1.5 est faite.

**Statut** : 🟠 IN PROGRESS — code complet pour les 5 flux, **non
déployé**. Remplace le statut ⚫ EXCEPTION APPROVED précédent : ce n'est
plus une exception acceptée faute de solution, une solution existe et
est presque prête, il ne manque que la confirmation DB + le
commit/déploiement.

**Preuve** : `lib/security/authSecurity.ts`, `supabase/migrations/
20260828000004_auth_security.sql`, les 5 fichiers de route cités,
sortie `tsc` ci-dessus.

### GAP-04-04 (NOUVEAU) — aucune révocation serveur des sessions JWT institution/admin/employé

**Constat** : vérifié sur 6 points concrets — `logout` (institution/
admin/employé), changement de mot de passe admin
(`change-password/route.ts`), désactivation 2FA admin
(`2fa/disable/route.ts`), demande de suppression de compte institution
(`deletion/request/route.ts`), et le plus parlant :
**"Déconnecter tous les autres appareils"**
(`institution/auth/remember/revoke-all/route.ts`). Les 6 ne font que
supprimer un cookie et/ou des lignes `*_remember_tokens` en base —
**aucun ne touche au JWT lui-même**. `getAuthenticatedInstitutionId`/
`verifyAdminSession`/l'équivalent employé ne vérifient que la signature
et l'expiration du JWT (`jwtVerify`), jamais une liste de révocation ni
`institution_sessions`/`admin_logs` (tables insert-only, jamais
consultées pour l'autorisation). Un JWT déjà émis reste donc valide
jusqu'à ses 8h (institution/admin) ou 12h (employé) naturelles, **quelle
que soit l'action prise par le titulaire légitime du compte** — y
compris le bouton dont le nom promet explicitement le contraire.

**Citoyen est la seule exception** : session réelle Supabase Auth,
`supabase.auth.signOut()` invalide le refresh token côté serveur
(`lib/auth/logoutCitoyen.ts`).

**Risque** : un jeton volé (XSS, poste partagé, malware, extraction
physique du cookie) reste exploitable jusqu'à 12h après que la victime
a changé son mot de passe/PIN, désactivé sa 2FA compromise, ou cliqué
"déconnecter tous les appareils" en croyant reprendre le contrôle.
Scénario aggravant pour l'admin : un attaquant qui vole un JWT admin
juste avant que l'admin ne désactive sa propre 2FA compromise (pensant
couper court) garde un accès complet pendant les heures suivantes malgré
cette action.

**Décision de Bryan (30/08/2026, même jour)** : « Attack ceci » — corriger
maintenant plutôt que reporter à un chantier séparé.

**Correction appliquée** — colonne `session_revoked_at timestamptz`
ajoutée à `admin_users`/`institutions` (migration
`20260830000001_session_revocation.sql`, **non exécutée**, à confirmer/
lancer par Bryan), comparée au claim `iat` du JWT à chaque vérification
de session :
- `lib/adminAuth.ts::verifyAdminSession` — lecture `admin_users.session_revoked_at`
  (clé primaire indexée), rejette si postérieur à `iat`. Couvre les 55+
  routes admin via `authorizeAdmin`.
- `lib/institutionAuth.ts::getAuthenticatedInstitutionId`/`getAuthenticatedMembre`
  — même contrôle sur `institutions.session_revoked_at` (échelle
  institution entière, pas par membre — cohérent avec la granularité
  déjà existante de "revoke-all"/suppression de compte).
- **Employé exclu du scope** : aucun flux de type changement de mot de
  passe/désactivation 2FA/déconnexion globale n'existe encore côté
  `employee_credentials` pour justifier d'écrire cette colonne — pas de
  code mort ajouté par anticipation.

**Points d'écriture** (mettent `session_revoked_at = now()`) :
`admin/auth/change-password`, `admin/auth/2fa/disable`,
`institution/auth/deletion/request`, `institution/securite/totp/disable`,
`institution/auth/pin/set`, `institution/auth/remember/revoke-all`.

**Cas particulier traité** : `remember/revoke-all` ("déconnecter tous les
autres appareils") est la seule action où la session courante doit
*survivre* — après avoir posé la révocation, la route réémet
immédiatement un JWT frais (mêmes claims, `iat` postérieur) pour
l'appareil appelant, sinon la fonctionnalité se serait déconnectée
elle-même à la requête suivante. Les 4 autres points d'écriture
(change-password, 2FA disable ×2, pin/set) déconnectent volontairement
aussi l'appareil courant — même précédent que le chantier MFA Admin du
13/08/2026 (reconnexion requise après un changement de facteur de
sécurité), pas une réémission automatique.

**Test** : `npx tsc --noEmit` → exit 0 sur l'ensemble (2 libs + 6 routes
+ migration). **Aucun test fonctionnel réel possible** : la migration
n'est pas confirmée exécutée — tant qu'elle ne l'est pas, ces 8 fichiers
casseraient toute vérification de session institution/admin en
production (colonne inexistante) s'ils étaient déployés seuls.

**Statut** : 🟠 IN PROGRESS — code complet, **non commité, non
déployé**, migration d'exécution non confirmée. Mêmes conditions de
clôture que GAP-10-01 : confirmation DB (voir DEC-2026-08-30-01) puis
commit/déploiement/vérification production.

**Preuve** : `app/api/institution/auth/logout/route.ts`,
`app/api/admin/auth/{logout,change-password,2fa/disable}/route.ts`,
`app/api/institution/auth/{deletion/request,remember/revoke-all}/route.ts`,
`lib/institutionAuth.ts` (aucune vérification de révocation),
`lib/auth/logoutCitoyen.ts` (le seul système qui en a une, par nature de
Supabase Auth).

---

## MISSION — Sécurisation de l'accès Administration (30/08/2026)

Brief CEO dédié (niveau OWASP admin interface hardening), 9 exigences.
Audit d'abord (mapping current state → requirement), puis correction des
points sans risque de lockout sur validation explicite de Bryan — les
points 2 (segment secret) et 6 (réseau/IP allowlist) restent
partiellement/totalement en attente d'infrastructure ou de valeur propre
à Bryan.

### Constat de départ — déjà satisfait avant cette mission

| Exigence brief | État | Preuve |
|---|---|---|
| 3. Authentification séparée | 🟢 VERIFIED | JWT admin dédié (`ADMIN_JWT_SECRET`), cookie séparé, zéro chemin de code partagé avec citoyen (Supabase Auth) ou institution (`INSTITUTION_JWT_SECRET`) — vérifié serveur sur toutes les routes `/api/admin/**` via `lib/adminAuth.ts::authorizeAdmin`, jamais côté client seul. |
| 4. MFA obligatoire | 🟢 VERIFIED (TOTP, pas phishing-resistant) | Gate implémenté 13/08/2026 (DEC-2026-08-13-03) — `middleware.ts`, redirige/bloque tout accès sans 2FA active. Pas de WebAuthn/clé de sécurité pour l'admin (existe pour citoyen/institution, pas ce système) — le brief ne le rend obligatoire que "lorsque l'infrastructure le permet", non traité dans cette mission. |
| 5. RBAC réel | 🟢 VERIFIED | `lib/adminAuth.ts` — 4 rôles (`super_admin/moderateur/support/admin`), matrice de permissions par action (`ADMIN_PERMISSIONS`), deny-by-default (rôle absent de la liste = refusé, y compris `super_admin`). Jamais un `is_admin=true`. |

### GAP corrigés dans cette mission (30/08/2026)

**Point 1 — `/admin` public ne doit jamais révéler l'existence de la
console** : avant, `/admin` sans session **redirigeait vers
`/admin/login`** (`middleware.ts:240`, préexistant) — révèle
explicitement qu'une interface d'administration existe à n'importe quel
visiteur. Corrigé : tout `/admin/*` en dur **sans aucun cookie de
session admin** (même expiré) → 404 muet (`NextResponse.rewrite` vers un
chemin garanti inexistant, `app/not-found.tsx` gère le rendu). Un
navigateur qui a déjà un cookie (valide ou expiré) continue de passer
par la logique existante (redirect login si invalide) — condition
volontaire : la navigation interne du dashboard (liens, `router.push`)
pointe massivement vers des `/admin/*` en dur, jamais préfixés ; casser
ça pour un admin déjà connecté aurait cassé tout le dashboard existant
pour un gain de sécurité nul (un attaquant qui a déjà un cookie valide
n'a de toute façon pas besoin de deviner l'URL).

**Point 2 — URL admin non prédictible** : `ADMIN_ENTRY_TOKEN` (variable
d'environnement, valeur choisie et gardée par Bryan, **jamais devinée
par Claude Code**). Absente par défaut → **fail-open explicite**, `/admin`
reste l'entrée directe, même discipline que `GEO_BLOCK_ENABLED`/
`MOBILE_WALL_ENABLED` — zéro risque de lockout au déploiement de ce
code. Une fois définie : seul `/{ADMIN_ENTRY_TOKEN}/admin/login` (et
tout `/{ADMIN_ENTRY_TOKEN}/admin/*`) reste atteignable pour un
navigateur sans cookie ; réécrit en interne vers `/admin/*` (les pages
ne bougent pas sur disque). `/api/admin/**` **volontairement non
touché** : les appels fetch du dashboard sont same-origin et absolus
(`/api/admin/kpis`, etc.), les préfixer aurait exigé de modifier des
dizaines de points d'appel pour un gain nul — la protection réelle de
ces routes est déjà le JWT+RBAC (point 8 du brief lui-même : l'URL
n'est jamais le mécanisme d'autorisation).

**Point 7 — Audit des échecs de connexion admin** : avant, un échec de
connexion (mot de passe ou TOTP incorrect) n'était **jamais** journalisé
dans `admin_logs` — seul le compteur `failed_login_attempts` avançait,
invisible dans une revue d'audit humaine. Corrigé : `admin_logs.insert({action: 'LOGIN_FAILED', details: {reason, role, ip, user_agent}})`
sur les 2 branches d'échec (mot de passe, TOTP), uniquement quand le
compte existe réellement (sinon `admin_id` NOT NULL n'a rien à
référencer — cohérent avec la garde anti-énumération déjà en place).
`role` ajouté aussi à l'entrée `LOGIN` réussie existante, absent avant.

**Test** : `npx tsc --noEmit` → exit 0 après chaque étape. Comportement
inchangé confirmé par relecture : `ADMIN_ENTRY_TOKEN` absent ⇒ toutes les
nouvelles branches s'évaluent à l'identique du code d'avant (chemin
interne = pathname brut, base publique = chaîne vide, réécriture
neutre). **Aucun test réel en navigateur possible** (pas d'outil
disponible) — à vérifier par Bryan avant toute mise en prod, en
particulier : `/admin` sans cookie → 404 réel, un admin déjà connecté
navigue sans régression, et si `ADMIN_ENTRY_TOKEN` est configuré,
`/{token}/admin/login` fonctionne bien de bout en bout (login → cookie
posé → navigation `/admin/*` normale ensuite).

### Reste ouvert, décision/infrastructure de Bryan requise

| Exigence brief | Gap | Action requise |
|---|---|---|
| 6. Réseau/contexte | Aucune IP allowlist/VPN (le brief lui-même le conditionne à l'infra disponible — probablement lié à la décision Cloudflare déjà actée ailleurs, voir `/mission-securite-geo-restriction`) ; aucune détection "nouvel appareil" admin (existe côté citoyen, pas admin) ; aucune réauthentification pour action critique (ex. suspendre une institution) ; aucune détection d'activité anormale | Décision d'architecture — hors périmètre code seul |
| 7. Audit | Toujours pas de trigger d'immuabilité sur `admin_logs` (GAP-06-07, ouvert depuis le 16/08) ; IP/contexte toujours pas systématique sur les ~90 autres points d'écriture `admin_logs.insert` du produit (seuls les 3 touchés dans cette mission le garantissent) | Décision de gouvernance (GAP-06-07) + chantier dédié si l'exhaustivité IP/contexte est jugée prioritaire |
| 4. MFA phishing-resistant | TOTP seulement, pas de clé de sécurité pour l'admin | Non traité — le brief le rend conditionnel, pas obligatoire |
| 9. Tests | Suite de tests dédiée (les 10 scénarios du brief) jamais exécutée formellement | À faire une fois les points ci-dessus tranchés — certains scénarios (citoyen/institution authentifié → refus sur `/admin`, manipulation de rôle client → refus) sont déjà couverts structurellement par la séparation des systèmes d'auth, non re-testés un par un dans cette mission |

**Statut mission (30/08/2026, avant hardening complet)** : 🟠 IN
PROGRESS — 3 des 9 points corrigés (1, 2, 7), 3 déjà satisfaits avant
cette mission (3, 4 partiel, 5), 3 restent ouverts en attente de
décision/infrastructure (6, 7 partie immuabilité/exhaustivité, 9).
Aucun commit, aucun déploiement.

---

## MISSION 2 — Hardening complet de l'accès Administration (30/08/2026, même jour)

Brief CEO élargi (10 exigences, niveau OWASP admin interface hardening
complet), reçu juste après la clôture de la mission ci-dessus. Décisions
de Bryan avant tout code : (1) construire une vraie table
`admin_sessions` par session plutôt que garder le timestamp unique par
compte (GAP-04-04/mission 1) ; (2) reporter la refonte des rôles
fonctionnels (point 3) — un seul compte admin réel existe aujourd'hui ;
(3) continuer immédiatement sur réauthentification critique (point 5) et
immuabilité `admin_logs` (point 8, GAP-06-07).

### Découverte annexe critique — `middleware.ts` supprimé hors git

Avant de commencer l'audit de cette mission, `middleware.ts` (318
lignes — headers de sécurité, géoblocage, gate MFA admin) introuvable
sur disque. `git status` a montré une suppression **non stagée**
(`Changes not staged for commit`), contrairement aux ~600 autres
changements en attente ce jour-là (restructuration dashboard, tous
stagés délibérément) — distinction qui a permis de conclure à une perte
accidentelle sans deviner. Restauré (`git restore middleware.ts`) à
l'identique du dernier commit (`bdbf215`), `tsc` propre après
restauration, aucune autre modification affectée (602 → 601 entrées
`git status`, delta exact de -1). **Clos**, détail complet dans
`YELEN_SECURITY_MASTER.md`, DEC-2026-08-30-04.

### Constat de départ (points déjà satisfaits, non re-détaillés — voir Mission 1 ci-dessus)

Points 1, 2 (URL), 3 (auth séparée), 4 (MFA — TOTP, pas phishing-resistant) :
état inchangé depuis la Mission 1 du même jour, ci-dessus.

### GAP corrigés dans cette mission

**Point 7 — Sessions admin durcies (le plus lourd)** : remplace
`admin_users.session_revoked_at` (mission 1, jamais exécuté en base —
migration amendée le jour même avant toute exécution) par une vraie
table `admin_sessions` : une ligne par session (`id` = claim JWT `sid`),
`expires_at` (absolu, miroir 8h du JWT), `last_seen_at` (fenêtre glissante
d'inactivité, **60 min**, nouvelle exigence non couverte avant), `revoked_at`/
`revoked_reason`, `reauth_at` (voir point 5). `lib/adminAuth.ts::verifyAdminSession`
vérifie désormais la session par `sid` (existe, non révoquée, non expirée,
non inactive) plutôt que par comparaison de timestamp global — et met à
jour `last_seen_at` à chaque appel (non bloquant).
- **Logout** : révoque uniquement la session courante (`revoked_reason:
  'logout'`) — corrige une limite de la Mission 1 (un timestamp unique
  par compte ne permettait pas de distinguer "cette session" des autres,
  donc *aucune* route de logout n'y touchait pour ne pas casser les
  autres appareils). Possible maintenant que chaque session a sa propre
  ligne.
- **Change-password / 2FA disable** : révoquent toutes les sessions du
  compte (`revoked_reason: 'password_change'`/`'2fa_disable'`) —
  comportement inchangé de la Mission 1, migré vers la nouvelle table.
- **Rotation de session** ("après authentification/réauthentification",
  exigence explicite du point 7) : implémentée dans `/api/admin/auth/reauth`
  (voir point 5) — mint une session neuve, révoque l'ancienne, réémet le
  cookie. Pas de rotation au login initial (une connexion n'est pas une
  "ré"-authentification, rien à faire tourner).
- **Non fait dans cette mission** : détection de connexion inhabituelle
  (la table pose la fondation — `ip`/`user_agent`/`device_label` par
  session — mais aucune logique de comparaison/alerte n'existe encore) ;
  pas d'écran "sessions actives" pour l'admin (table + révocation
  individuelle existent côté backend, aucune UI de gestion construite).

**Point 5 — Réauthentification pour actions critiques** : nouvel
endpoint `POST /api/admin/auth/reauth` (mot de passe + TOTP si actif,
même logique anti-bruteforce que le login — verrouillage 5 échecs/30 min
partagé avec `admin_users.failed_login_attempts`). Succès → pose
`admin_sessions.reauth_at` sur une session neuve (rotation, voir point
7). Nouvelle fonction `lib/adminAuth.ts::verifyRecentReauth(session)` —
fenêtre de fraîcheur **10 minutes** (`REAUTH_WINDOW_MS`), relit
`admin_sessions.reauth_at` en base (pas un claim JWT, pour rester valable
même si le JWT courant n'a pas encore été réémis).
**Appliqué à** : `admins/route.ts` (POST — création admin), `admins/[id]/route.ts`
(PATCH — modification de rôle, DELETE — suppression), `export/route.ts`
(GET — les 4 types d'export). **Décision de portée** : `auth-security/unblock/route.ts`
(déblocage d'un device/IP bloqué) **volontairement exclu** — jugé plus
proche d'une action de support/modération routinière que d'un
"changement de configuration de sécurité" au sens du brief ; à revoir
si Bryan considère que ça doit être couvert aussi. "Opération financière
sensible" et "paramètres critiques de la plateforme" (brief) : aucune
route existante ne correspond clairement à ces deux catégories — non
mappé, pas deviné.
`code: 'REAUTH_REQUIRED'` ajouté à `adminAuthErrorResponse` (absent
avant — le frontend ne pouvait pas distinguer un 403 "permission
insuffisante" d'un 403 "reconfirmez votre mot de passe").

**Point 8 — Immuabilité `admin_logs` (GAP-06-07, clos)** : même pattern
exact que `journal_activite`/`signalement_events`/`auth_security_events`
— trigger `BEFORE UPDATE OR DELETE`, bloque même `service_role`,
échappatoire `app.autoriser_correction_admin_logs`. Décision de
gouvernance tranchée par le choix de Bryan de continuer sur ce point
sans réserve.

**Point 9 — Détection renforcée** : `authorizeAdmin()` journalise
désormais chaque refus de permission (`action: 'ACCES_REFUSE'`,
centralisé dans `lib/adminAuth.ts` plutôt que dans les ~90 routes
appelantes — "tentative d'accès admin refusée" du brief). Échecs de
réauth journalisés (`REAUTH_FAILED`). **Non fait** : détection de
connexion inhabituelle, alerting actif (les logs existent, rien ne les
surveille), notion de "compte de secours" (n'existe pas dans
l'architecture actuelle — rien à journaliser).

**Test** : `npx tsc --noEmit` → exit 0 après chaque étape, puis sur
l'ensemble (3 migrations + `lib/adminAuth.ts` + 7 routes + 1 nouvelle
route). **Aucun test fonctionnel réel possible** — 3 migrations
(`20260830000001` amendée, `20260830000002`, `20260830000003`) toutes
d'exécution non confirmée.

### Reste ouvert après cette mission

| Exigence brief | Gap | Action requise |
|---|---|---|
| 3. Rôles fonctionnels | Reporté sur décision de Bryan — un seul compte réel aujourd'hui | Reprendre quand une vraie équipe existera |
| 4. MFA phishing-resistant | TOTP seulement | Non traité, conditionnel selon le brief lui-même |
| 6. Réseau/IP allowlist | Absent | Infrastructure (probablement lié à Cloudflare, `/mission-securite-geo-restriction`) |
| 7. Détection connexion inhabituelle, UI sessions actives | Fondation posée (table), logique/UI absentes | Chantier dédié si priorisé |
| 9. Alerting actif, accès inhabituels, compte de secours | Logs existent, rien ne surveille | Chantier observabilité dédié (section 21-22 du master plan, jamais construit) |
| 10. Suite de tests dédiée | Jamais exécutée formellement | À faire une fois tout déployé — nécessite un vrai navigateur |

**Statut mission 2** : 🟠 IN PROGRESS — 4 points supplémentaires traités
(5, 7, 8, 9 partiel) en plus des 3 déjà faits en Mission 1. **Aucun
commit, aucun déploiement.** 3 migrations en attente d'exécution par
Bryan (voir liste ci-dessus).

### Autres constats du Lot 2 (mineurs, non corrigés)

| ID | Constat | Priorité | Statut |
|---|---|---|---|
| — | `admin/auth/login` conserve son propre verrouillage persistant par compte (`failed_login_attempts`/`locked_until`), désormais doublé du throttle device+IP — aucun gap, juste noté comme cohérent avec le pattern membre/employé | — | 🟢 VERIFIED |
| — | Remember-tokens (citoyen/institution) : génération correcte (32 octets aléatoires, hash SHA-256 stocké, jamais le token brut), expiration vérifiée à la lecture — aucun gap trouvé | — | 🟢 VERIFIED |
| — | Détection "nouvel appareil" citoyen (`lib/auth/citoyenSession.ts::notifierNouvelAppareilSiBesoin`) — mécanisme correct, limite déjà documentée en commentaire (cookie effacé = reclassé "nouvel appareil") | — | 🟢 VERIFIED |

### Résumé Lot 2

**1 gap majeur ouvert (GAP-04-04, nouveau)** : révocation de session
impossible sur 3 systèmes sur 4 — décision d'architecture requise, non
corrigée. **1 gap mis à jour (GAP-10-01)** : la solution technique existe
désormais pour les 5 flux de connexion mais reste non déployée — ne peut
pas être clos tant que la migration et le commit/déploiement ne sont pas
confirmés. Aucune nouvelle vulnérabilité "Critical" trouvée. Conforme à
la consigne : arrêt du lot, rapport présenté, pas de Lot 3 sans
validation de Bryan.

---

## MISSION — Trusted Device / Device Enrollment (30/08/2026, même jour)

Brief CEO dédié, 8 exigences + 8 cas de test (A-H), niveau OWASP
authentification adaptative. Consigne explicite : auditer l'existant,
proposer schéma + flux de migration, aucun changement en production sans
validation — audit et proposition faits et validés par Bryan avant tout
code (2 décisions : réutiliser `citoyen_remember_tokens`/
`institution_remember_tokens` plutôt que des tables dédiées ; "nouvel
appareil" = notification + confirmation différée, pas de blocage dur).

### Audit préalable (résumé, détail complet donné à Bryan avant validation)

Constat central : **aucune porte de confiance n'existe aujourd'hui sur
le facteur principal (OTP)** — un citoyen/une institution sans PIN/
WebAuthn configuré obtient un accès complet depuis n'importe quel
appareil dès que l'OTP est correct, sans aucune notion de confiance
device. `citoyen_remember_tokens`/`institution_remember_tokens`
existaient déjà mais servaient uniquement à choisir un écran (PIN/
biométrie vs OTP complet) — jamais un signal de sécurité. Anti-pattern
exact du brief : "Phone number → Access".

### Schéma retenu — extension de l'existant, pas de nouvelle infrastructure

`citoyen_remember_tokens`/`institution_remember_tokens` (migration
`20260830000004_trusted_device.sql`) augmentées de : `status`
(`pending`/`trusted`/`revoked`, défaut `trusted` — les lignes déjà
existantes avant ce chantier ne sont pas rétrogradées), `device_type`
(catégorie large web/mobile/tablette, jamais un fingerprint —
conforme au point 1 du brief), `revoked_at`. `institution_remember_tokens`
recevait aussi `device_label`/`ip`/`last_used_at`, absents avant
(présents côté citoyen depuis le 18/07).

### Logique d'enrôlement/confiance implémentée

- **Premier appareil d'un compte** → `trusted` immédiat (rien à comparer,
  pas de friction sur le tout premier accès).
- **Appareil suivant, inconnu** → `pending`. Citoyen : notification
  immédiate (`notifierNouvelAppareilSiBesoin`, existante, câblée sur le
  nouveau statut plutôt que redéveloppée). Institution : **pas de canal
  de notification équivalent** (n'existe pas dans l'architecture
  actuelle — gap documenté, pas construit, aurait été une nouvelle
  brique contraire à la consigne "pas d'infrastructure inutile").
  Décision Bryan : session accordée quand même (pas de blocage dur).
- **Reconnexion réussie depuis un appareil `pending`** → promotion
  automatique `pending → trusted` (repasser par le même appareil avec
  succès est un signal de confiance suffisant, pas d'action manuelle
  requise — mais une confirmation explicite depuis l'écran Sécurité
  reste possible à ajouter plus tard, non construite ici, travail
  frontend).
- **Révocation** (`securite/remember/revoke`, `revoke-all` — citoyen et
  institution) : `status='revoked'` **plutôt qu'un DELETE** — historique
  conservé (brief : "voir les appareils" implique une liste persistante).
  `remember/check` filtre désormais explicitement les appareils
  `revoked`, qui ne peuvent plus jamais proposer le déverrouillage
  rapide ni redevenir `trusted` sans un nouvel enrôlement complet.

### Limite architecturale assumée — révocation par appareil précis impossible aujourd'hui

**Trouvé et corrigé une incohérence pendant l'implémentation** : le plan
initial proposait d'appeler `supabase.auth.admin.signOut()` (citoyen) sur
révocation — abandonné en cours de route car ça aurait **cassé
`revoke-all` lui-même**, qui exclut délibérément l'appareil courant de la
révocation ("déconnecter tous les *autres* appareils") ; un sign-out
global aurait déconnecté l'appareil courant aussi.

Conclusion honnête, documentée dans le code (pas cachée) : révoquer un
appareil **empêche sa reconnaissance future** (plus de raccourci PIN/
biométrie, plus de statut de confiance) mais **ne tue pas
instantanément une session déjà ouverte sur cet appareil précis** — ni
côté citoyen (session Supabase Auth jamais liée à `citoyen_remember_tokens`),
ni côté institution pour une révocation à l'unité (`remember/revoke`).
**Seule exception** : `institution/auth/remember/revoke-all` révoque
réellement les JWT des autres appareils, parce que cette route touche
déjà `institutions.session_revoked_at` depuis GAP-04-04 (ce matin même).
Un vrai cloisonnement par appareil (comme `admin_sessions` construit ce
matin pour l'admin) est le seul moyen d'obtenir une révocation
instantanée par appareil précis — chantier séparé, pas fait ici.

### Cas de test du brief (A-H) — couverture

| Cas | Attendu | Couvert |
|---|---|---|
| A. 1er appareil → approuvé | ✅ `status='trusted'` direct |
| B. 2e appareil → challenge | 🟠 `status='pending'` + notification (citoyen), session accordée quand même (décision Bryan) — pas un vrai blocage |
| C. Challenge réussi → approuvé | ✅ promotion automatique à la reconnexion |
| D. Appareil A connecté pendant que B est ajouté | ✅ naturel, tokens indépendants |
| E. Révocation A → perte de confiance immédiate | 🟠 vrai pour la confiance/le raccourci, **pas** pour une session déjà ouverte (limite ci-dessus) — sauf institution `revoke-all` |
| F. Attaquant avec le seul numéro → pas de session approuvée automatique | 🟠 obtient quand même une session (décision Bryan, pas de blocage dur) mais **jamais** `trusted` — appareil reste `pending`, visible/révocable, notifié |
| G. Nouvel appareil + comportement suspect → step-up | 🔴 non fait — aucune évaluation de risque au-delà de "connu/inconnu" (pas de signaux comportementaux, pas de lien avec `auth_device_security` construit le 28/08) |
| H. Appareil perdu → révocation à distance | 🟠 révoque la confiance/le raccourci, pas la session déjà ouverte (limite ci-dessus) |

### Non fait dans cette mission (périmètre explicitement laissé de côté)

- Évaluation de risque adaptative (point 5 du brief : contexte/
  comportement/signaux) — seule la dimension "connu/inconnu" est
  implémentée, pas de scoring multi-signaux.
- Canal de notification institution (n'existe pas, pas construit).
- Confirmation manuelle explicite d'un appareil `pending` depuis l'écran
  Sécurité (la promotion automatique par réutilisation existe déjà,
  un bouton explicite serait un ajout frontend).
- Révocation par session individuelle citoyen/institution (nécessiterait
  une architecture `*_sessions` comme `admin_sessions`).
- Journalisation dans `auth_security_events` : évaluée puis écartée —
  cette table est structurée autour des tentatives de connexion
  device+IP (rate limiting), pas des changements de confiance
  d'appareil ; forcer l'un dans l'autre aurait été un mauvais
  raccourci. L'historique vit dans les tables remember-tokens
  elles-mêmes (`status`, `revoked_at`, jamais supprimées).

**Test** : `npx tsc --noEmit` → exit 0 (vérifié explicitement avec code
de sortie imprimé après un faux-positif de vérification en arrière-plan
plus tôt dans la session — voir incident noté à Bryan). **Aucun test
fonctionnel réel possible** — migration `20260830000004_trusted_device.sql`
non exécutée.

**Statut** : 🟠 IN PROGRESS — code complet pour la logique de confiance/
révocation de base (Cas A-D couverts, E/F/H partiellement, G non fait),
non commité, non déployé. Bryan a demandé à voir chaque migration SQL
une par une à la fin de ce chantier avant exécution — liste complète
dans `YELEN_SECURITY_MASTER.md`.

**Mise à jour — les 6 migrations du 30/08/2026 exécutées par Bryan une
par une, SQL Editor** (voir aussi `20260828000004_auth_security.sql`,
amendée par `20260830000005` suite à un drift constaté en base — détail
complet dans `YELEN_SECURITY_MASTER.md`). Toutes vérifiées en base avant
exécution (précaution prise après la surprise `auth_security_events`
déjà existante) — aucun autre écart trouvé sur les 5 suivantes.

---

## REVUE CRITIQUE + LOT 3 (30/08/2026, même jour)

Consigne de Bryan : suivre le master plan de bout en bout, revue
critique, puis `tsc`/build complet, en notant tout ce qui nécessite son
action sans s'arrêter.

### Revue critique — 8 angles (agents) + repasse personnelle directe

Diffs scannés : tout le travail du jour (Auth Security étendu, GAP-04-04,
Hardening Admin, Trusted Device) — ligne par ligne, comportements
supprimés, traceur cross-file, réutilisation, simplification, efficacité,
altitude, conventions CLAUDE.md. Puis une seconde passe personnelle
(sans agent, demande explicite de Bryan) sur les zones les plus
sensibles.

**Corrigé** :
1. **Révocation contournable sur 9 routes institution** — `pin/set`,
   suppression PIN, `webauthn/revoke`, `webauthn/register-verify`,
   `webauthn/register-options`, `security-status`, `remember/revoke`,
   `deletion/status`, `notification-prefs` gardaient chacune une
   vérification d'auth locale dupliquée (héritée d'avant ce chantier),
   jamais mise à jour avec la révocation de session ajoutée aujourd'hui.
   Un JWT révoqué continuait donc de fonctionner sur ces 9 routes.
   Corrigé : toutes importent maintenant `lib/institutionAuth.ts`.
2. **Régression réelle de sécurité (pas hypothétique)** — le remplacement
   des verrous par compte (PIN/OTP/WebAuthn institution, ancien Map par
   `institutionId`, 5 échecs/5-15 min) par le throttle device+IP partagé
   avait supprimé toute protection PAR COMPTE sans la remplacer : le
   cookie device est entièrement côté client (non envoyé = "nouvel
   appareil"), donc un attaquant ciblant une institution précise pouvait
   ne jamais déclencher de blocage pour cette cible. Corrigé : verrou
   partagé persistant restauré (`institutions.login_failed_attempts`/
   `login_locked_until`, migration `20260830000006`), complémentaire au
   throttle device+IP, appliqué aux 3 facteurs de connexion institution.
3. **`middleware.ts` (→ `proxy.ts`) ne vérifiait jamais `admin_sessions`**
   — seulement signature/expiration JWT. Une session révoquée pouvait
   encore charger la coquille de page admin (les données auraient été
   bloquées côté API par `lib/adminAuth.ts`, mais jamais au niveau page).
   Corrigé : lecture (seule, non bloquante pour l'écriture) de
   `admin_sessions` ajoutée à `verifierTokenAdmin()`.
4. **`auth-security/unblock` sans réauthentification** — trouvé
   indépendamment par 4 angles de revue différents. Le docstring de
   `verifyRecentReauth` citait pourtant déjà ce cas. Corrigé.
5. **`lib/security/authSecurity.ts` avalait les erreurs Supabase**
   (`{data}` sans `error`) — piège déjà documenté dans CLAUDE.md
   (`/pieges-techniques-connus`), ici sur une porte anti-abus qui
   échouait *ouverte* silencieusement en cas d'erreur DB. Corrigé :
   reste fail-open par choix (bloquer tout login sur une erreur
   transitoire serait pire), mais désormais tracé via `logSecurite`.
6. **Course `iat`/`revoked_at`** dans `institution/auth/remember/revoke-all`
   — le JWT réémis pour l'appareil qui doit rester connecté pouvait, si
   la révocation et la signature tombaient dans la même seconde
   d'horloge, se faire rejeter par sa propre révocation (précision
   seconde du JWT vs milliseconde de la DB). Corrigé : `iat` fixé
   explicitement à `revokedAt + 1s`.
7. **3 derniers survivants de l'ancien pattern Map mémoire** trouvés et
   migrés vers `authSecurity` : `institution/webauthn/auth-options`,
   `citoyen/securite/webauthn/auth-verify`, `citoyen/securite/webauthn/auth-options`.
8. **Incohérence dans mon propre commentaire** (`lib/adminAuth.ts`)
   affirmant que `reauth/route.ts` "ne fait pas tourner le sid" alors
   que j'avais bien implémenté la rotation — corrigée.

**Découverte annexe critique — `middleware.ts`/`proxy.ts` en conflit** :
build cassé, Next.js 16.2.1 refuse la coexistence des deux fichiers.
`proxy.ts` trouvé = tentative de migration abandonnée le 19/08/2026
(jamais commitée), figée avant toutes les corrections d'aujourd'hui.
Résolu : contenu à jour consolidé dans `proxy.ts` (export renommé
`middleware` → `proxy`, seule vraie différence), `middleware.ts`
supprimé.

**Non corrigé, documenté comme dette** : duplication de code réelle
entre `lib/auth/citoyenSession.ts`/`lib/auth/institutionSession.ts`
(logique Trusted Device quasi identique) et entre les ~12 routes qui
répètent le même bloc "porte anti-abus + finaliser" — un helper partagé
réduirait ~100 lignes dupliquées, pas fait faute de temps dans ce lot.
Quelques requêtes DB redondantes (performance, pas sécurité) :
`lireEtat`/`incrementerEtEvaluer` relisent ce qu'ils viennent de lire,
`verifyRecentReauth` requête `admin_sessions` une 2e fois juste après
`verifyAdminSession`. Portée de révocation institution encore à
l'échelle du compte entier (pas par session individuelle comme admin) —
décision déjà actée avec Bryan (mission Trusted Device), pas un oubli.

### Lot 3 — Authorization/RBAC/ABAC (audit, section 05 du master plan)

**Matrice institution** (`lib/institutionPermissions.ts`) — relue
intégralement : 5 rôles, `TAB_MATRIX` (cosmétique, masquage nav) +
`ACTION_MATRIX` (la vraie barrière, vérifiée serveur via `can()`), 35
clés d'action, chaque choix de rôle justifié en commentaire. 🟢 VERIFIED,
mature, rien à corriger.

**Couverture des routes** — vérifié systématiquement (script) qu'aucune
route `POST/PATCH/PUT/DELETE` sous `app/api/institution/**` ou
`app/api/admin/**` (hors routes d'auth elles-mêmes) n'existe sans
référencer une fonction de vérification d'auth. **0 route suspecte sur
les deux périmètres.** Côté citoyen, 5 routes signalées par le script,
toutes vérifiées une par une : 3 volontairement publiques et documentées
comme telles (compteur de partage, tendances de recherche, demande de
récupération de compte — pré-auth par nature), 2 routes de connexion
WebAuthn (légitimement pré-auth, c'est le mécanisme d'authentification
lui-même) — ce sont les 2 qui avaient le Map mémoire résiduel, déjà
corrigé ci-dessus.

**Non fait dans ce Lot 3** (périmètre restant, à reprendre si priorisé) :
audit IDOR exhaustif ligne par ligne des ~219 routes (Lot 1 avait déjà
vérifié un échantillon de 12 cas, tous corrects — non ré-audité à 100%
ici, seule la présence d'une vérification d'auth a été confirmée
systématiquement, pas la justesse du scoping par tenant sur chaque
requête individuelle) ; test explicite "institution A peut-elle lire/
modifier une ressource d'institution B en devinant un id" sur un
échantillon plus large ; RBAC citoyen (n'existe pas en tant que tel,
chaque citoyen n'a accès qu'à ses propres données via `auth.uid()`
RLS — modèle différent, pas de matrice de rôles à auditer).

### Vérifications finales

`npx tsc --noEmit` → exit 0, vérifié explicitement à chaque étape après
un incident de vérification en arrière-plan trop hâtive plus tôt dans la
session (voir `YELEN_SECURITY_MASTER.md`). **`npm run build` → exit 0,
zéro warning, zéro erreur, 321+ routes compilées, `proxy.ts` reconnu
comme middleware.** Premier build complet réussi de la journée (jusque-là
seul `tsc` avait été vérifié).

**Statut** : revue critique + Lot 3 clos pour ce qui était raisonnable
dans ce lot. Aucun commit, aucun déploiement — décision de Bryan à
suivre.

---

## LOT 4 — DATABASE & STORAGE SECURITY, audit (31/08/2026)

Suite logique du master plan après la clôture du Lot 3 (Authorization).
Périmètre : compléter les items de la section 06 non couverts au Lot 1
(vues, triggers, extensions) + premier passage sur la section 11
(Storage). Audit en lecture seule uniquement — aucune exécution SQL,
aucun changement de code, cohérent avec l'absence d'accès SQL
Editor/navigateur de Bryan au moment de ce lot.

### Vues, triggers, extensions (section 06, items restants)

**Vues** : 0 `CREATE VIEW`/`CREATE MATERIALIZED VIEW` trouvée dans
`supabase/migrations/` (recherche exhaustive, insensible à la casse).
🟢 VERIFIED — rien à auditer côté vues. Réserve identique à celle déjà
actée pour les 6 tables historiques sans trace de migration : si une vue
existe en base sans être passée par une migration versionnée, elle reste
invisible depuis cet environnement (NOT VERIFIED pour ce cas précis).

**Triggers** : 20 `CREATE TRIGGER` inventoriés sur 16 fichiers de
migration. Deux familles cohérentes, aucun trigger orphelin ou
inattendu : (1) immuabilité — 13 occurrences, le pattern déjà documenté
dans `/pieges-techniques-connus` de CLAUDE.md (`journal_activite`,
`points_transactions`, `attendance_logs`/`attendance_audit_logs`,
`recus`, `signalement_events`, `document_events`,
`verification_decisions`/`verification_decision_preuves`,
`documents_institution` partiel, `activite_historique`,
`activite_demandes`/`activite_demande_decisions` partiel,
`auth_security_events`, `admin_logs`) ; (2) logique métier applicative —
7 occurrences (recalcul moyenne avis institution, solde/paliers points,
protection réponse institution sur avis, validation conversation RDV,
protection identité/contenu messagerie Yelen-citoyen, limite de
fréquence questions institution, recalcul nb abonnés institution). Aucun
trigger `SECURITY DEFINER` caché en dehors de la fonction déjà auditée
au Lot 1 (`appliquer_recuperations_dues`). 🟢 VERIFIED.

**Extensions** : seules `pg_cron` et `pg_net` déclarées
(`CREATE EXTENSION IF NOT EXISTS`, répétées de façon idempotente dans 7
fichiers de migration — sans risque, un des fichiers le documente même
explicitement en commentaire). Aucune extension à risque trouvée
(`pg_stat_statements` exposée, usage détourné de `pgcrypto`, etc.).
🟢 VERIFIED — surface minimale, cohérente avec les jobs cron déjà
documentés dans CLAUDE.md (rappels RDV/démarches, recalcul
`daily_attendance`, récupération de compte).

### Storage — inventaire complet et nouvelle constatation (GAP-11-01)

**Méthode** : recherche exhaustive de `storage.from(...)` sur
`app/api/**` (~60 points d'appel), croisée avec la méthode d'accès
utilisée par le code lui-même sur chaque bucket
(`getPublicUrl()` vs `createSignedUrl()`) — un choix qui, fait par le
développeur au moment d'écrire la route, révèle son intention réelle sur
le statut Public/Privé attendu du bucket, indépendamment de ce qui est
documenté ailleurs.

| Bucket | Méthode utilisée dans le code | Doit être | Sur la checklist manuelle CLAUDE.md ? |
|---|---|---|---|
| `avatars` | `getPublicUrl` + 2 policies RLS `storage.objects` (upload direct citoyen) | Public | Oui — bucket d'origine |
| `offres` | `getPublicUrl` | Public | Non — jamais mentionné |
| `annonces` | `getPublicUrl` | Public | Non — jamais mentionné |
| `post-images` | `getPublicUrl` | Public | Non — jamais mentionné |
| `documents-citoyens` | `createSignedUrl` uniquement | **Privé** | Oui |
| `documents-employes` | `createSignedUrl` uniquement | **Privé** | Oui |
| `signalements-preuves` | `createSignedUrl` uniquement | **Privé** | Oui |
| `documents` | `createSignedUrl` uniquement | **Privé** | Oui (déjà trouvé cassé le 14/08 — bucket jamais créé) |
| `recus-paiement` | `createSignedUrl` uniquement | **Privé** | **Non — absent de la checklist** |
| `documents-travail` | `createSignedUrl` uniquement | **Privé** | **Non — absent de la checklist** |
| `messagerie-images` | `createSignedUrl` uniquement | **Privé** | **Non — absent de la checklist** |

**Constat structurel (rassurant)** : tous les accès Storage passent par
le client `service_role` server-side (`supabaseAdmin`/`sb`,
`SUPABASE_SERVICE_ROLE_KEY`) — confirmé sur l'intégralité des ~60 points
d'appel grep-és, jamais un accès direct client anon/authenticated, sauf
`avatars` (2 policies RLS légitimes pour l'upload direct citoyen, déjà
en place depuis le 17/07/2026). RLS `storage.objects` est donc **non
pertinent** pour 11 des 12 buckets (`service_role` la contourne de toute
façon, par conception) — le contrôle de sécurité réel est le seul flag
**Public/Privé du bucket**, réglage du dashboard Supabase, hors du code
et donc **NOT VERIFIED** depuis cet environnement.

**Risque réel identifié** : `createSignedUrl()` appelé sur un bucket qui
serait resté **Public** par erreur (ou jamais explicitement mis en
Privé) rend le contrôle d'accès illusoire — quiconque devine ou observe
un `storage_path` (réponse API, log, énumération) peut lire le fichier
directement via l'URL publique du bucket, sans jamais passer par la
signature à durée limitée. `recus-paiement`, `documents-travail` et
`messagerie-images` contiennent des données `Confidential`/`Highly
Sensitive` au sens de la section 03 du master plan (reçus de paiement,
documents financiers/RH institution, images échangées en messagerie
privée citoyen↔institution) et **n'ont jamais été confirmés Privés nulle
part dans la documentation existante**, contrairement aux 4 buckets déjà
sur la checklist manuelle de CLAUDE.md.

**Action requise de Bryan (NOT VERIFIED, dashboard Supabase → Storage →
bucket → toggle Public)** : confirmer `recus-paiement`,
`documents-travail` et `messagerie-images` marqués **Privé**, au même
titre que les 4 déjà connus. Si l'un des trois est Public, c'est un gap
réel à corriger immédiatement (décocher Public dans le dashboard — pas
un correctif de code). Ajouté à la checklist
`/actions-manuelles-en-attente` de CLAUDE.md.

**Priorité** : Medium-High (données sensibles réelles en jeu, mais
aucune preuve d'exploitation — seulement une vérification jamais faite
ni documentée).

**Non fait dans ce Lot 4** (périmètre restant, à reprendre si priorisé) :
GAP-06-08 (grants `anon`+`authenticated` trop larges sur 9 tables,
neutralisés par RLS mais jamais resserrés) — resserrement possible par
migration à rédiger, non fait ici faute de décision explicite sur la
priorité ; audit des permissions PostgreSQL par rôle au-delà des grants
déjà connus ; audit `service_role` lui-même (rotation de clé, exposition)
— dépend de réglages Supabase, hors code.

**Test** : aucun (audit en lecture seule, zéro fichier de code modifié
dans ce lot — seuls les documents de sécurité sont mis à jour).

**Statut** : 🟢 VERIFIED pour vues/triggers/extensions — 🟡 NEEDS REVIEW
pour GAP-11-01 (Storage), action requise de Bryan. Conforme à la
consigne du master plan : rapport présenté, pas de Lot 5 avant validation
de Bryan.

---

## GAP-06-09 — Fuite `mot_de_passe_hash` via `select("*")` public, corrigée (01/09/2026)

Trouvé pendant l'audit "Phase 0 — Booking externe"
(`docs/product/YELEN_BOOKING_EXTERNAL_INTEGRATION_PHASE0.md`), hors du
fil de travail sécurité habituel — corrigé immédiatement sur demande de
Bryan vu la sévérité (Critical), avant de reprendre le reste.

**Avant** : `app/institution/[id]/InstitutionPublicClient.tsx:586` —
```ts
const { data: row } = await supabase.from("institutions").select("*").eq("id", id).maybeSingle();
```
Client Supabase **anon** (navigateur, sans authentification). La seule
policy RLS SELECT sur `institutions`
(`supabase/migrations/20260709000014_policy_institutions_public_read.sql:6-8`,
`FOR SELECT TO anon, authenticated USING (statut = 'validee')`) filtre
par **ligne**, jamais par colonne — RLS Postgres ne sait pas faire
autrement. `select("*")` renvoyait donc **toutes** les colonnes
d'`institutions` (~35, dont `mot_de_passe_hash`) dans la réponse JSON, à
chaque chargement de la fiche publique de n'importe quelle institution
validée. Exploitable sans authentification, sans intégration externe,
juste en ouvrant l'onglet Réseau du navigateur sur `/institution/{id}`.

**Modification** : `select()` explicite, limité aux colonnes réellement
consommées par le composant (vérifiées une par une en lisant chaque
`r.xxx` du bloc `setInst({...})` et les usages ultérieurs de `r`/`row`
dans le même fichier) :
```
id,slug,name,category,secteur,description,conditions_entreprise,
informations_importantes,informations_legales,conditions_entreprise_le,
informations_importantes_le,informations_legales_le,
equipements_etablissement,adresse,ville,quartier,phone,whatsapp,email,
website,logo,banniere,moyenne_avis,nb_avis,badge_verifie,horaires,
services,disponibilites,annee_creation,capacite,langue,
activite_categorie_id
```
**Méthode de vérification de chaque nom de colonne** (pour ne jamais
casser la requête en nommant une colonne inexistante — un nom faux fait
échouer tout PostgREST avec une erreur 400, contrairement à `select("*")`
qui ne peut jamais échouer sur ce point) :
- `name`/`category`/`phone` confirmés réels par recoupement avec 2
  `select()` déjà en production ailleurs (`app/api/citoyen/favoris/route.ts`,
  `app/rdv/[id]/page.tsx:563`) — **exclu** `nom`/`categorie`/`telephone`
  (repli JS défensif dans le même fichier, jamais de vraies colonnes,
  drift déjà documenté dans `CLAUDE.md` `/schema`).
- `langue` confirmé réel (migration `20260711000002_institution_responsable_et_fix_langue.sql:7-8`,
  déjà `langue confirmée jsonb par Bryan 14/08/2026` selon GAP-06-03).
- `capacite` confirmé réel (mentionné explicitement comme "champ texte
  libre" pré-existant dans le commentaire de
  `20260720000005_institutions_capacite_creneau.sql:3`, distinct de
  `capacite_par_creneau`).
- `annee_creation` confirmé réel par un point d'écriture existant
  (`app/api/institution/profile/route.ts`, `app/[slug]/[id]/components/ProfilEntrepriseTab.tsx`
  — écran de configuration institution qui l'édite).
- `equipements_etablissement`, `conditions_entreprise`/`informations_importantes`/
  `informations_legales` (+ leurs `_le`) confirmés par migrations commitées
  plus anciennes (`20260821000012`, `20260724000016`, `20260724000017`).
- `conditions_entreprise_creee_le`/`informations_importantes_creee_le`/
  `informations_legales_creee_le` (migration
  `20260831000001_institutions_conditions_creation_dates.sql`) — d'abord
  **exclues par prudence** (untracked dans git au moment du premier
  correctif, exécution non confirmée), **réintégrées le 01/09/2026** :
  Bryan a confirmé que la migration a bien été exécutée en base. Champ
  `dateCreation` consommé dans le popup "Conditions de l'entreprise /
  Informations importantes / Informations légales"
  (`InstitutionPublicClient.tsx:2495,2499,2503`).

**Test** : `npx tsc --noEmit` → exit 0 (×2 — après le correctif initial
et après la réintégration des 3 colonnes).

**Non fait** : audit colonne par colonne des ~35 colonnes d'`institutions`
pour confirmer que `mot_de_passe_hash` était la seule donnée réellement
sensible exposée par l'ancien `select("*")` — hors périmètre de ce
correctif ponctuel. Aucun test en navigateur réel (page publique à fort
trafic potentiel — recommandé avant tout commit/déploiement) : Bryan a
signalé ne pas avoir vérifié visuellement si les dates "Écrit le"
s'affichent réellement sur la fiche (indépendant de ce correctif — ce
popup existait avant, jamais revérifié visuellement selon Bryan).

**Statut** : 🟢 CORRIGÉ, type-vérifié, colonnes complètes — **non
commité, non testé en conditions réelles**. Action requise de Bryan avant
push : recharger une fiche publique en navigateur réel, vérifier dans
l'onglet Réseau que la réponse ne contient plus `mot_de_passe_hash`, et
que l'affichage (dont les dates "Écrit le" du popup Conditions/Informations)
est correct.
**Date** : 01/09/2026 (correctif initial + réintégration le même jour).

---

## LOT 4 (suite) — GAP-08-01 : centralisation de l'auth citoyen (31/08/2026, même soir)

Consigne de Bryan (lancement imminent) : ne pas se limiter à documenter,
corriger ce qui est sûr et purement code — sans SQL, sans navigateur,
sans dépasser la portée validée. Seul GAP-08-01 (parmi tout ce qui était
encore ouvert au moment de la demande) était un vrai correctif de code
faisable dans ces conditions ; les autres gaps ouverts dépendent tous de
SQL Editor, d'un dashboard (Supabase/Netlify/GitHub) ou d'un test
navigateur réel — aucun n'a été traité ce soir, aucun forcé.

**Avant** : `supabaseAdmin.auth.getUser(accessToken)` (ou `sb.auth.getUser`)
dupliqué indépendamment dans 44 fichiers `app/api/citoyen/**`, chacun
avec sa propre gestion d'erreur.

**Modification** : nouveau fichier `lib/citoyenAuth.ts`
(`verifierCitoyenToken(accessToken)`, retourne l'utilisateur Supabase ou
`null`) — seul point d'appel désormais pour vérifier un token citoyen.
Les 44 routes basculées une par une, remplaçant uniquement le bloc
`const { data: { user }, error } = await client.auth.getUser(accessToken); if (error || !user) return ...;`
par `const user = await verifierCitoyenToken(accessToken); if (!user) return ...;`
— **le texte, le code HTTP et le `code` de chaque réponse d'erreur
existante sont restés strictement identiques**, route par route (certaines
renvoient "Non authentifié" pour un token absent ET invalide, d'autres
distinguent "Non authentifié"/"Session invalide ou expirée", certaines
incluent un `code: "NO_SESSION"`, d'autres non — chaque variante
préservée telle quelle, aucune harmonisation forcée qui aurait changé un
contrat d'API sans le tester). Méthode d'extraction du token également
inchangée par route (header `Authorization`, query string, body JSON ou
`form-data` selon le fichier). Les fonctions locales préexistantes
(`getAuthenticatedCitoyenId`, `authentifier`) gardent leur signature
exacte, elles délèguent simplement à la fonction centrale en interne.

**Fichiers touchés** : `lib/citoyenAuth.ts` (nouveau) + 44 fichiers sous
`app/api/citoyen/**` (liste complète : `activites`, `assistant`,
`attention`, `avis/notifier-publication`, `bio`, `communaute/signaler`,
`confidentialite/{consentement,communication,partage,visibilite,status}`,
`decouverte`, `demarches/notifier-creation`, `documents`,
`documents/upload`, `donnees/export`, `favoris`, `feedback`,
`messagerie/{upload-image,image-url}`, `paid-bookings/declarer-paiement`,
`paiements`, `post-suggestions`, `posts`, `posts/media`, `profil/photo`,
`recus/[id]/pdf`, `rewards`, `securite/status`,
`securite/pin/{route,set,verify}`,
`securite/remember/{revoke,revoke-all}`,
`securite/totp/{setup,verify,disable}`,
`securite/webauthn/{register-options,register-verify,revoke}`,
`semaine`, `signalements`, `suivis`, `verification-identite/upload`) —
largement au-delà de la règle "2 fichiers max" du protocole, exception
explicitement demandée et accordée par Bryan pour ce chantier précis.

**Test** : `npx tsc --noEmit` → **exit 0**, confirmé par le code de sortie
de la notification de fin de tâche (pas une lecture anticipée de sortie —
leçon de méthode du 30/08/2026 appliquée). **Aucun test fonctionnel réel
possible** ce soir (pas de navigateur disponible) — comportement identique
par construction (même appel Supabase, mêmes réponses d'erreur), mais pas
encore prouvé en conditions réelles.

**Non fait, explicitement hors périmètre de ce soir** : `lib/citoyenAuth.ts`
ne factorise que l'appel `auth.getUser()` lui-même, pas l'extraction du
token (qui varie légitimement par route) ni le format de réponse
d'erreur (qui aurait changé un contrat d'API sans pouvoir le vérifier en
navigateur) — décision volontairement conservatrice. La duplication
`supabaseAdmin`/`sb` (client Supabase instancié séparément dans chacun des
44 fichiers) n'a pas été touchée non plus — DRY, pas un gap de sécurité,
laissé pour ne pas élargir davantage la portée.

**Statut** : 🟠 IN PROGRESS — code corrigé et type-vérifié, **non commité,
non poussé, non testé en conditions réelles**. Action requise de Bryan
avant tout push : se reconnecter/naviguer sur au moins les parcours
citoyen les plus fréquents (connexion, Mes RDV, Favoris, Sécurité,
Confidentialité) pour confirmer 0 régression, puis commit à son
initiative.
**Preuve** : `lib/citoyenAuth.ts`, diff des 44 fichiers listés ci-dessus,
sortie `tsc`. **Date** : 31/08/2026.

---

## REVUE CRITIQUE EXPRESS — Posture "doit survivre pour toujours" (01/09/2026)

Demande explicite de Bryan : revue critique de tout le système, mode
expert cybersécurité, standard visé = plateforme durable niveau
Amazon/Facebook. **Audit uniquement — aucune correction dans cette
phase**, conforme à la consigne. Fait personnellement (pas d'agent),
lecture directe du code + `npm audit` réel.

Ce n'est **pas** un Lot 1 refait de zéro — les Lots 1-4 déjà présents
dans ce document restent valides et ne sont pas repris ici en détail.
Cette section couvre : (a) ce qui a changé depuis (nouveau CVE), (b) ce
qu'une passe fraîche et sceptique a trouvé de nouveau, (c) une évaluation
honnête de ce qui manque structurellement pour l'ambition "pour
toujours" — au-delà du code, à l'échelle organisation/infrastructure.

### Constats nouveaux ou aggravés depuis le dernier audit

| ID | Constat | Preuve | Sévérité |
|---|---|---|---|
| GAP-14-01 (aggravé) | `npm audit` réel ce soir : les 5 vulnérabilités déjà connues sont **toujours présentes**, mais une **nouvelle CVE Next.js non trackée jusqu'ici** apparaît : "Unauthenticated disclosure of internal Server Function endpoints" (GHSA-955p-x3mx-jcvp) | `npm audit --omit=dev`, sortie ce soir | **High** — directement pertinent : ce projet utilise massivement les Server Actions (`"use server"`, 9+ fichiers déjà recensés dans un audit précédent — `createRdv`, `annulerRdv`, etc.) |
| GAP-04-05 (nouveau) | `QR_SECRET_KEY` a un **secret de repli codé en dur** : `process.env.QR_SECRET_KEY \|\| "yelen224-secret"` — si la variable est absente d'un environnement (Netlify preview, nouvel environnement, oubli de config), la clé HMAC signant les tokens de présence QR devient une chaîne **publique, présente dans ce document et dans le code source**. N'importe qui pourrait alors forger un `qr_token` valide pour n'importe quel `rdv_id`/`citoyen_id`/date et se faire scanner "présent" frauduleusement | `app/api/qr/generate/route.ts:66` | **High** si la variable venait à manquer sur un environnement réel — **NOT VERIFIED** que `QR_SECRET_KEY` est bien définie partout (aucun accès aux variables d'environnement Netlify depuis cet outil) |
| GAP-08-02 (nouveau) | Aucune validation serveur de la cohérence créneau/institution/capacité à la création d'un RDV (`createRdv`, `app/rdv/[id]/actions.ts:54-72`) — RLS n'exige que `auth.uid() = citoyen_id`. Un `institution_id` inexistant/non validée, un créneau hors des disponibilités réelles, ou un dépassement de `capacite_par_creneau` ne sont bloqués **nulle part côté serveur**, seulement suggérés côté UI. Déjà documenté en détail dans `docs/product/YELEN_BOOKING_EXTERNAL_INTEGRATION_PHASE0.md` (section Contraintes actuelles, points 2-3) — reporté ici car c'est un vrai gap de sécurité applicative, pas seulement un sujet d'intégration externe | `app/rdv/[id]/actions.ts:54-72`, `supabase/migrations/20260720000004...sql:17-19` | **Medium-High** — overbooking/abus possible dès aujourd'hui, sans avoir besoin d'aucune intégration tierce |
| — (hygiène, pas un gap réel) | 5 routes de médias institution/citoyen construisent le nom de fichier Storage avec `Date.now() + Math.random().toString(36)` plutôt que `crypto.randomUUID()` (utilisé partout ailleurs dans le projet pour ce même besoin) — entropie plus faible, chemin théoriquement plus devinable | `app/api/institution/services/media/route.ts:50`, `offres/media/route.ts:29`, `communaute-posts/media/route.ts:32`, `annonces/media/route.ts:48`, `app/api/citoyen/posts/media/route.ts:37` | **Low** — ces buckets (`offres`, `annonces`, `post-images`) sont déjà publics par conception (`getPublicUrl`, voir GAP-11-01), la confidentialité du nom de fichier n'est pas un contrôle de sécurité ici ; signalé pour cohérence de code, pas comme faille exploitable |
| — | Zéro secret trouvé dans Git (historique inclus), `.gitignore` couvre bien `.env*`, zéro `dangerouslySetInnerHTML` sur tout `app/` — **reconfirmé sain** par recherche fraîche ce soir, pas juste hérité de l'audit du 13/08 | `git log --all -- .env*` (vide), `.gitignore:` `.env*`, grep exhaustif `dangerouslySetInnerHTML` (0 résultat) | 🟢 VERIFIED |
| — | `lib/uploadSecurity.ts` reconfirmé mature à la lecture directe : détection par signature binaire réelle (magic bytes, jamais `file.type`/extension client), chemin de stockage toujours généré serveur (`crypto.randomUUID()` dans la quasi-totalité des routes, sauf les 5 citées ci-dessus), cas legacy CFB (.doc/.xls) correctement restreint à une liste fermée. Rien à corriger | `lib/uploadSecurity.ts:106-129` | 🟢 VERIFIED |

### Ce qui manque structurellement pour "survivre pour toujours" (au-delà du code)

Un système qui doit tenir indéfiniment à l'échelle d'une plateforme
nationale ne se juge pas seulement sur ses routes API. Sections du
master plan (`YELEN_SECURITY_MASTER.md`) **jamais construites à ce
jour**, honnêtement listées plutôt que passées sous silence :

1. **Observabilité (section 21-22)** : aucun système de métriques/traces/
   alerting actif — les logs existent (`console.warn` structuré dans
   `lib/edgeSecurity.ts`, tables d'audit immuables) mais **rien ne les
   surveille**. Un pic d'attaque, une chute de disponibilité, ou une
   dérive de comportement ne déclenchent aujourd'hui **aucune alerte** —
   ils ne seraient découverts qu'a posteriori, en lisant les logs
   manuellement.
2. **Sauvegardes & continuité (sections 18-19)** : RPO/RTO jamais
   définis pour aucun système. Aucune preuve qu'une restauration ait
   jamais été testée (`YELEN_SECURITY_MASTER.md` section 19 : "un backup
   qui n'a jamais été restauré est une hypothèse"). Dépend entièrement du
   tier Supabase souscrit (PITR, fréquence des backups) — **NOT
   VERIFIED**, réglage dashboard hors de portée de cet environnement.
3. **Reprise après sinistre (section 20)** : aucun `DISASTER_RECOVERY_RUNBOOK.md`
   n'existe. Scénarios non préparés : compromission de compte, fuite de
   secret, panne Supabase/Netlify prolongée, perte d'accès admin.
4. **WAF / anti-DDoS réel** : le plan Cloudflare est acté en décision
   (`/mission-securite-geo-restriction` de `CLAUDE.md`) mais **non
   déployé** — la seule défense actuelle est un rate limiting en mémoire
   d'instance edge (`lib/edgeSecurity.ts`), déjà documenté comme
   insuffisant sous charge distribuée réelle (GAP-10-01).
5. **Gestion des secrets** : tous les secrets vivent en variables
   d'environnement brutes (Netlify), jamais dans un vrai coffre-fort
   (Vault/AWS Secrets Manager/Doppler). Aucune politique de rotation
   documentée pour `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`,
   `INSTITUTION_JWT_SECRET`, etc. — un secret compromis aujourd'hui n'a
   pas de procédure de rotation d'urgence écrite.
6. **Facteur bus / continuité organisationnelle (section 36)** : un seul
   développeur (Bryan) a la connaissance complète du système et l'accès
   à tous les secrets. Aucune séparation des privilèges, aucun second
   accès de secours documenté — risque organisationnel, pas technique,
   mais réel pour une plateforme "pour toujours".
7. **Tests de sécurité formels (section 30)** : aucun SAST/DAST
   automatisé en CI (le `.github/workflows/ci.yml` du 13/08 ne fait que
   `tsc`/`build`/`npm audit` informationnel), aucun pentest externe
   jamais réalisé.
8. **Disclosure de vulnérabilité (section 34)** : aucun `security.txt`,
   aucun canal de signalement pour un chercheur externe qui trouverait
   une faille.

### Solution robuste proposée — priorisée, pas un mur de recommandations

**Immédiat (avant tout, indépendant de toute nouvelle fonctionnalité)** :
1. Confirmer `QR_SECRET_KEY` définie sur **tous** les environnements
   Netlify (production + preview) — sinon le secret de repli en dur est
   une vraie clé publique. Envisager, dans un futur lot de code (pas
   maintenant), de faire échouer explicitement la génération de QR si la
   variable est absente plutôt que de retomber sur une valeur devinable
   — même discipline déjà appliquée à `INSTITUTION_OTP_FALLBACK`.
2. Ajouter une validation serveur minimale à `createRdv` (institution
   existe + `statut='validee'` + créneau cohérent avec `disponibilites` +
   capacité non dépassée) — un futur lot de code, pas ce soir, mais à
   prioriser avant toute exposition externe (cohérent avec la Phase 0
   déjà documentée).
3. Programmer l'upgrade `next` (16.2.1→16.3.x) comme chantier dédié
   testable — la nouvelle CVE "Server Function endpoints" concerne
   directement l'architecture Server Actions de ce projet, ce n'est plus
   seulement une bonne pratique générale.

**Moyen terme (fondations avant la montée en charge)** :
4. Déployer Cloudflare devant Netlify (déjà décidé, jamais exécuté) —
   WAF managé + DDoS L3/L4/L7 + Bot Management, remplace la défense
   edge actuelle qui ne survit pas un redémarrage d'instance.
5. Basculer la CSP de Report-Only vers bloquant, une fois la navigation
   réelle confirmée (déjà en attente depuis le 13/08, GAP-16-01).
6. Construire une alerting minimale (Slack/email sur pic d'erreurs 5xx,
   sur seuil de rate limiting dépassé, sur échec de sauvegarde) — même
   un système simple vaut mieux que zéro visibilité active.
7. Documenter RPO/RTO réels par système critique, et **tester** une
   restauration au moins une fois — actuellement une hypothèse, jamais
   une preuve.
8. Écrire `INCIDENT_RESPONSE_PLAN.md` et `DISASTER_RECOVERY_RUNBOOK.md`
   (sections 20/32 du master plan, jamais commencées) — même un document
   simple change radicalement le temps de réaction en cas d'incident réel.

**Long terme (ambition "pour toujours")** :
9. Migrer les secrets vers un vrai gestionnaire de secrets avec
   rotation programmée, pas des variables d'environnement statiques.
10. SAST/dependency scanning automatisé en CI (bloquant, pas seulement
    informationnel), premier pentest externe une fois le produit en
    charge réelle.
11. `security.txt` + canal de disclosure — signal de maturité vis-à-vis
    de tout chercheur qui trouverait une faille, mieux vaut qu'il la
    signale que la vende.
12. Réduire le facteur bus : documentation d'urgence accessible à une
    personne de confiance désignée, accès de secours (break-glass)
    documenté et testé.

**Rien de tout ceci n'a été implémenté dans cette phase — audit et
proposition uniquement, conforme à la consigne de Bryan.**

**Mise à jour — GAP-04-05 et GAP-08-02 corrigés le même soir** (Bryan :
"Corige d'abord") :
- `app/api/qr/generate/route.ts` — repli `"yelen224-secret"` supprimé,
  échec explicite (500 `QR_SECRET_MISSING` côté log, message générique
  côté client) si `QR_SECRET_KEY` est absente au moment de générer un
  nouveau token (un token déjà valide continue d'être réutilisé sans
  cette vérification, comportement inchangé).
- `app/rdv/[id]/actions.ts` — nouvelle fonction `validerCreneauServeur()`,
  appelée dans `createRdv` avant toute écriture : institution existe et
  `statut='validee'`, créneau présent dans
  `generateSlotsInRange(institution.disponibilites, 28)` (même fenêtre de
  28 jours que le wizard, `app/rdv/[id]/page.tsx:658` — jamais de rejet
  d'un créneau que l'écran propose lui-même), capacité non dépassée
  (comptage `rdv`+`paid_bookings` par tally JS sur les 5 premiers
  caractères de `heure_rdv`, même pattern déjà éprouvé dans
  `app/api/rdv-disponibilite/route.ts` — évite un risque de non-
  correspondance si la colonne renvoie des secondes).
- **Test** : `npx tsc --noEmit` → exit 0.
- **Non fait** : aucun test fonctionnel réel (navigateur) — Bryan doit
  tester une réservation de bout en bout (créneau valide accepté,
  créneau complet/hors disponibilités refusé avec le bon message) avant
  tout commit/push.

**Statut** : 🟢 CORRIGÉ (code) pour GAP-04-05 et GAP-08-02 — **non
commité, non testé en conditions réelles**. Le reste (observabilité/DR/
secrets/organisation) reste un constat honnête de dette structurelle,
pas une action de code.
**Date** : 01/09/2026.

---

## MISE À JOUR — 12/09/2026 : GAP-10-01, correctif du contournement du rate limiting (`trouve`/`code_envoye`) + suite de tests

Dans le cadre de la revue de sécurité complète demandée par Bryan
(architecture + audit exécutable), reprise de la session en cours sur
`lib/security/authSecurity.ts` (modifiée, non commitée) pour la vérifier,
la tester et la documenter avant tout commit — conformément à la
consigne explicite : "ne laisse pas ce correctif non commité ou non
testé."

### Cause (2 bugs réels, trouvés à deux dates différentes en testant ce module)

1. **03/09/2026** — avant ce correctif, `enregistrerTentative()`
   incrémentait `attempts_in_window` pour **toute** tentative, y compris
   un succès. Le flux citoyen normal fait 2 appels par connexion réussie
   (`lookup` → outcome `trouve`, puis `verify` → outcome `code_correct`) :
   2 connexions légitimes en 15 minutes suffisaient à atteindre
   `SEUIL_BLOCAGE` (4) et bloquaient un citoyen honnête dès sa 3e
   connexion, elle aussi correcte.
2. **12/09/2026 (trouvé en revérifiant le correctif du 03/09 pour cet
   audit)** — le correctif du 03/09 avait classé `trouve` (compte trouvé,
   `lookup`) et `code_envoye` (OTP généré/envoyé, `send-otp`) comme des
   **succès**, au même titre que `code_correct`. Ces deux outcomes ne
   prouvent pourtant rien : ils signalent seulement qu'une étape
   *préalable* à la vérification a eu lieu, avant toute preuve
   d'identité. Comme ils partagent le même compteur device+IP que
   l'étape de vérification qui suit, un attaquant pouvait rappeler
   `lookup`/`send-otp` en boucle pour remettre son compteur d'échecs à
   zéro à chaque itération et **neutraliser complètement l'escalade
   warning/blocked/support_only** sur les flux `citoyen_login`,
   `institution_login` et `institution_register` — sans jamais avoir
   besoin de deviner un seul code.

### Impact potentiel

Le rate limiting device+IP censé protéger les 5 flux de connexion
(`citoyen_login`, `citoyen_register`, `institution_login`,
`institution_register`, `recuperation`) était, pour les 2 endpoints
`lookup`/`send-otp`, **entièrement contournable** — un attaquant capable
d'appeler ces routes en boucle ne déclenchait jamais de blocage, tant
qu'il ne tentait pas réellement un code. Combiné à l'OTP de repli statique
documenté (`GAP-04-02`, `TEMPORARY ACCEPTED GAP`), ce bug aggravait
concrètement le risque de credential stuffing sur ces deux flux — sans
lui, un attaquant énumérant des numéros de téléphone/comptes via `lookup`
n'aurait jamais été freiné.

### Correctif (`lib/security/authSecurity.ts`)

`OUTCOMES_SUCCES` ne contient plus que les outcomes qui constituent une
**preuve d'identité réelle** : `code_correct` (OTP/PIN/mot de
passe/TOTP), `compte_cree` (inscription aboutie), `demande_creee`
(récupération de compte), `verification_ok` (WebAuthn). `trouve` et
`code_envoye` retombent désormais dans le chemin échec/incrément normal
— confirmé par grep exhaustif de tous les appelants réels
(`enregistrerTentative`/`enregistrerTentativeAdmin`/
`enregistrerTentativeAdminEntry`, 15 fichiers `app/api/**`) : aucun autre
outcome de type "étape intermédiaire sans preuve" n'est classé succès à
tort. `reinitialiserApresSucces()` (ajoutée le 03/09) reste inchangée :
un vrai succès remet `attempts_in_window` à 0 sans effacer
`block_cycles_24h` — l'historique d'abus sur 24h d'un device/IP donné
n'est jamais effacé par un succès isolé au milieu d'une vague d'attaque.

### Preuve / tests

- **13 tests vitest** dans `lib/security/authSecurity.test.ts` (10
  préexistants + 3 ajoutés pour ce correctif) — `npx vitest run
  lib/security/authSecurity.test.ts` → **13 passed (13)**, 0 échec :
  1. *Régression de l'exploit du 12/09* : un device/IP qui répète
     `trouve` puis `code_envoye` sans jamais vérifier de code atteint
     bien `warning` puis `blocked` (avant le correctif : jamais).
  2. *Non-régression du succès (03/09)* : un `code_correct` réinitialise
     `attempts_in_window` à 0 sur les scopes device **et** ip, tout en
     préservant `block_cycles_24h` (vérifié explicitement, pas seulement
     supposé par lecture du code).
  3. *Non-régression du flux légitime* : une séquence
     `trouve` → `code_correct` répétée 3 fois de suite en moins de 15
     minutes ne déclenche jamais `warning` (garde contre une
     réintroduction du bug du 03/09).
- `npx tsc --noEmit` sur l'ensemble du projet → **exit 0** (aucune
  régression de type malgré ~150 fichiers modifiés en parallèle par
  d'autres chantiers en cours dans le working tree).
- **Non fait, honnêteté explicite** : aucun test en conditions réelles
  (navigateur/API contre une vraie instance Supabase) — les tables
  `auth_device_security`/`auth_ip_security` dépendent de la migration
  `20260828000004_auth_security.sql`, dont l'exécution en base n'est
  toujours pas confirmée (voir GAP-10-01 ci-dessus et section "P0-1"
  demandée par Bryan) ; un test réel contre ces tables sans confirmation
  romprait potentiellement la connexion en environnement réel si la
  migration n'a pas tourné.

### Statut

🟠 IN PROGRESS — correctif complet et testé unitairement, prêt pour
commit (voir commit dédié `fix(security): OTP envoye/compte trouve ne
doivent jamais compter comme echec du rate limiting`). Le déploiement
réel reste bloqué sur les mêmes 3 conditions que GAP-10-01 depuis le
30/08 : (1) confirmation/exécution de la migration
`20260828000004_auth_security.sql`, (2) commit + déploiement de
l'ensemble du chantier `authSecurity.ts` (~16 fichiers de routes
concernés au total, pas seulement ce correctif), (3) vérification en
production équivalente au Lot 1.5.
**Date** : 12/09/2026.
