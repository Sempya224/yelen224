# Yelen Trust — Admin Verification Workflow (Lot 2.5)

Rédigé le 16/08/2026, sur décision CEO ("Lot 2.4 validé, GO Lot 2.5 — Admin
Verification Workflow"). Fait suite à `YELEN_TRUST_MODEL.md` (Lot 0, gelé),
`YELEN_TRUST_DOMAIN_ARCHITECTURE.md` (Lot 1), `YELEN_TRUST_DATA_AUDIT.md`
(Lot 2.1), `YELEN_TRUST_VERIFICATION_DATA_MODEL.md` (Lot 2.2/2.3),
`YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md` (Lot 2.3),
`YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md` (Lot 2.4, 15/15 VERIFIED IN
DATABASE).

## Statut de ce document

Couvre les **étapes 1 à 8** du Lot 2.5 (audit + conception — "aucun code
avant cette cartographie"). Les **étapes 9 et 10** (implémentation réelle,
revue de sécurité du code livré, 15 tests VERIFIED IN DATABASE/APPLICATION)
nécessitent d'écrire du vrai code — elles sont **proposées comme suite
explicite** en fin de document, pas encore commencées. Conforme à la
discipline déjà appliquée dans ce projet : ne jamais présenter une lecture
de code comme un test réel, ne jamais dépasser 2 fichiers modifiés sans
validation.

**Aucun code, migration, commit ou déploiement dans ce document.**

---

## 1. Audit — cartographie de l'existant

### 1.1 RBAC admin (`lib/adminAuth.ts`)

- `ADMIN_ROLES` : `super_admin`/`moderateur`/`support`/`admin`, deny-by-
  default (une permission absente de la matrice refuse tout le monde, y
  compris `super_admin`).
- 22 permissions actuelles. **Confirmé par lecture directe des 2 routes
  ci-dessous** : `institutions.manage` (`super_admin`/`moderateur`/`admin`)
  est aujourd'hui la **seule** permission couvrant badge, statut, plan et
  avertissement d'une institution — exactement l'écueil que le Lot 0
  interdit (mélange gestion opérationnelle / décision de vérification).
  **Aucune permission `institutions.verify` n'existe.**
- MFA obligatoire déjà en place et clos (gate `middleware.ts` +
  `login/route.ts`, GAP-04-03, validé CEO 13/08/2026) — item "MFA déjà en
  place" de l'étape 9 du CEO déjà satisfait, à revérifier seulement pour
  la nouvelle permission une fois créée.

### 1.2 Routes admin institutions existantes (à ne pas dupliquer)

Lues intégralement pour cet audit :

- **`app/api/admin/institutions/[id]/valider/route.ts`** —
  `UPDATE institutions SET statut='validee'`, gate `institutions.manage`,
  log `admin_logs` (`action='VALIDER_INSTITUTION'`), notification
  institution. **Aucune référence à `documents_institution` ni
  `verification_decisions`** — confirme le constat déjà posé au Lot 1
  ("chaîne cassée entre le statut et les preuves").
- **`app/api/admin/institutions/[id]/badge/route.ts`** —
  `UPDATE institutions SET badge_verifie=<bool>`, même gate, toggle
  manuel binaire, **aucune justification structurée capturée**.
- `.../refuser/route.ts`, `.../suspendre/route.ts`, `.../reactiver/route.ts`
  — patron présumé identique par cohérence de nommage (non relus mot à
  mot ce tour, à confirmer si un de ces flux devient pertinent pour
  l'implémentation).
- Confirmé (grep, cohérent avec les audits précédents) : **aucune route
  admin ne lit ni n'écrit `documents_institution`/`verification_decisions`/
  `verification_decision_preuves` aujourd'hui.** Ce lot construit ce
  premier point de contact, pas une correction d'un point existant.

### 1.3 Patron à réutiliser — le système signalements-cas (livré cette session)

Le chantier "Yelen arbitre seul les signalements" (livré plus tôt dans
cette session) a déjà construit exactement le type d'outil administratif
dont ce lot a besoin — **patron à répliquer, jamais à réinventer** :

- `app/admin/adminTypes.ts::SignalementCas` — type dédié, distinct du
  type "Communauté".
- `app/api/admin/signalements-cas/route.ts` (GET liste) +
  `[id]/route.ts` (GET détail, **colonnes explicites, jamais
  `select("*")`** — leçon retenue d'une fuite IP/UA déjà corrigée
  ailleurs dans ce projet) + `[id]/actions/route.ts` (POST, discriminé
  par un champ `action`, gate dédié).
- `app/admin/moderation/page.tsx` — sélecteur d'onglet, réutilise
  `DataTable`/`SlidePanel`/`Badge`/`ToastContainer`/`YelenLoader`
  (`app/admin/adminUiKit.tsx`) et les tokens `D`/`Ic`
  (`adminTheme.ts`/`adminIcons.tsx`) — **zéro nouveau design system**.
- `lib/signalements.ts` — logique métier centralisée côté serveur,
  transitions légales explicites, acteur typé
  `{type:"admin_yelen", id, nom}`.

**Décision de conception directe pour ce lot** : le dossier de
vérification suit ce même patron — nouvel écran admin (`app/admin/
verification/page.tsx` ou nouvel onglet, à trancher étape suivante),
mêmes briques UI, même discipline de select explicite, même séparation
stricte lecture/action.

### 1.4 Schéma déjà en place (Lot 2.2-2.4, rappel factuel, VERIFIED IN DATABASE)

- `documents_institution` : versionné (`numero_version`, `statut_actif`,
  `remplace_version_id`), immuabilité **partielle** (une décision
  recu→{valide,rejete,complement_demande} autorisée une fois, figée
  ensuite avec ses 4 colonnes ensemble).
- `verification_decisions` : `decision_id` (`YL-VER-{année}-{8 chiffres}`),
  `axe` (`identite`/`autorite`), `type_decision`
  (`accordee`/`complement_demande`/`rejetee`/`revoquee`), `niveau_preuve`
  (`profil_verifie`/`institution_certifiee`), `examinateur_admin_id`/
  `_nom`, `justification` (NOT NULL), `expire_le`, `decision_precedente_id`,
  `revoque_decision_id` — **immuabilité totale**, insert-only.
- `verification_decision_preuves` : snapshot figé (type/version/statut/
  chemin/hash/dates) — **immuabilité totale**.
- Aucune des 3 tables n'a de policy RLS — accès exclusivement
  `service_role`, donc exclusivement via routes serveur. Cohérent avec
  l'exigence CEO "aucun accès citoyen/institution non autorisé" : c'est
  déjà structurellement impossible aujourd'hui, pas seulement une
  intention.

### 1.5 Storage — statut RLS non confirmé (gap hérité du Lot 2.4, toujours ouvert)

La requête `SELECT policyname,... FROM pg_policies WHERE
schemaname='storage' AND tablename='objects'` (fournie par
`verify-documents-bucket.mjs`) **n'a jamais été exécutée** dans ce projet.
**NOT VERIFIED.** À faire avant que le dossier de vérification (section 2)
puisse afficher un aperçu de fichier — l'accès en lecture au bucket
`documents` en dépend directement.

### 1.6 Gap déjà identifié, toujours ouvert : expiration

Confirmé une nouvelle fois : `documents_institution` n'a **aucune** colonne
d'expiration — seule `verification_decisions.expire_le` porte cette notion,
**au niveau de la décision**, jamais du document brut. Le dossier de
vérification (section 2/4) doit calculer "cette décision est-elle expirée"
à la lecture (`expire_le < now()`), jamais présumer qu'un document
"semble ancien" indique une expiration — piège explicitement visé par
l'étape 4 du CEO.

---

## 2. Le dossier de vérification (conception)

Écran admin unique par institution, 4 zones — chacune répond à "pourquoi
Yelen peut ou ne peut pas affirmer quelque chose", jamais un résumé
composite :

### Identité
- Déclaré : `institutions.name`/`statut_juridique`/`secteur`.
- Preuves : requête `documents_institution` filtrée `type` pertinent pour
  l'axe identité selon `statut_juridique`
  (`lib/documentsInstitution.ts::getRequiredDocuments`), **`statut_actif=
  true` uniquement pour la vue "état courant"**, avec un lien explicite
  vers l'historique complet (section Historique) plutôt que de les
  mélanger.
- Statut actuel : dérivé de la **dernière décision non révoquée**
  `WHERE axe='identite'` (jamais de `institutions.badge_verifie`/
  `statut` directement — ces deux colonnes restent en lecture seule dans
  ce dossier, jamais écrites par lui, voir section 3).

### Autorité
- Déclaré : `institution_responsables.*` (toujours 100% déclaratif,
  confirmé Lot 1/2.1 — **aucune preuve n'y est rattachée aujourd'hui**,
  gap à afficher explicitement dans le dossier plutôt que masqué : "Aucune
  preuve d'autorité rattachée à ce responsable" si c'est le cas, jamais un
  vide silencieux).
- Preuves : même mécanisme que Identité, `type` pertinent pour l'axe
  autorité (ex. `nomination_habilitation`).
- Historique des changements de responsable : **n'existe pas encore comme
  mécanisme tracé** (`institution_responsables` est un simple upsert sans
  journal — gap déjà noté Lot 2.1 section C "MANQUANT → À CRÉER", non
  résolu par ce lot, à afficher comme limite connue dans le dossier plutôt
  que fabriqué).

### Existence
- Distinction formel/informel dérivée de `statut_juridique`
  (`prive_formel`/`liberal`/`individuel_informel`/`public`) — jamais une
  colonne séparée, cohérent avec le principe Lot 0 "pas de système
  universel" (section 1 du modèle gelé).
- Établie automatiquement dès `REGISTERED` (inscription + OTP), jamais
  soumise à décision admin (rappel Lot 0 section 3, "Existence... hors du
  cycle Identité/Autorité") — le dossier l'affiche en lecture seule,
  informative, **aucune action possible dessus dans ce dossier**.

### Historique
- Timeline fusionnée, triée par date : toutes les versions
  `documents_institution` (actives et inactives, chaînées par
  `remplace_version_id`) + toutes les `verification_decisions` (chaînées
  par `decision_precedente_id`/`revoque_decision_id`) pour cette
  institution, tous axes confondus.
- Chaque entrée affiche explicitement son `numero_version`/`decision_id`,
  jamais une position ambiguë dans une liste.

---

## 3. Actions explicites — aucune décision implicite

Trois actions pour l'examinateur, strictement mappées sur
`type_decision` déjà existant (`revoquee` reste hors du périmètre de ce
dossier — une révocation est une action distincte, hors scope de l'examen
initial, à concevoir séparément si le CEO le demande) :

| Bouton | `type_decision` | Champs obligatoires |
|---|---|---|
| **VALIDER** | `accordee` | `niveau_preuve` (choix explicite, jamais déduit), `justification` |
| **DEMANDER UN COMPLÉMENT** | `complement_demande` | `complement_demande_motif`, `justification` |
| **REJETER** | `rejetee` | `justification` (motif obligatoire, cohérent avec la contrainte CHECK déjà en base) |

**Aucun bouton n'est actionnable si aucune preuve `statut_actif=true`
n'existe pour l'axe concerné** — une décision "accordée" sans preuve
active serait un `type_decision='accordee'` sans
`verification_decision_preuves` cohérente, contraire à l'esprit du modèle
même si la contrainte SQL actuelle ne l'interdit pas explicitement au
niveau décision seule (voir section 4, prévention).

L'écriture passe par une nouvelle fonction transactionnelle dédiée (voir
section 7 — même discipline que `deposer_nouvelle_version_document`,
**jamais un insert direct depuis la route**).

---

## 4. Prévention des erreurs humaines

- **Version active vs historique, jamais ambiguë visuellement** :
  badge explicite "Version active" / "Remplacée le [date]" sur chaque
  entrée de preuve — jamais une simple liste sans distinction (le champ
  `statut_actif` existe précisément pour ça, section 1.4).
- **Document expiré ≠ document qui a l'air ancien** : le dossier calcule
  l'expiration exclusivement depuis `verification_decisions.expire_le <
  now()` de la dernière décision par axe — jamais une heuristique sur
  `soumis_le`. Si aucune décision n'existe encore, aucune notion
  d'expiration ne s'applique (état `REGISTERED`, section Identité vide de
  décision).
- **La décision affiche exactement ce sur quoi elle s'appuie** : au moment
  de VALIDER/COMPLÉMENT/REJETER, l'écran liste explicitement les
  `document_institution_id` + `numero_version` qui seront snapshotés —
  jamais une décision "sur l'institution en général" sans preuve
  identifiée précisément.
- **Impossible de valider sans preuve active** (voir section 3) — contrôle
  à ajouter dans la future fonction transactionnelle, pas seulement côté
  UI (l'UI seule ne protège jamais contre un appel API direct).

---

## 5. Séparation absolue des axes

Réaffirmation directe des invariants Lot 0, déjà respectés structurellement
par le schéma existant (aucun changement requis ici, section de
vérification plutôt que de conception) :

- `verification_decisions.axe CHECK IN ('identite','autorite')` — aucune
  valeur `'existence'`/`'reputation'` n'est même acceptable en base
  (contrainte déjà là, confirmée Lot 2.2).
- Le dossier n'affiche **jamais** de score composite — chaque axe reste
  visuellement et structurellement séparé (4 zones distinctes, section 2),
  jamais une note globale calculée en les combinant.
- La zone Réputation (`moyenne_avis`/`reputationScore.ts`) reste **hors de
  ce dossier** — confirmé Lot 1 "chaînes jamais croisées" — si une future
  itération veut l'afficher à titre informatif, ce sera un onglet
  séparé, jamais mélangé aux décisions de vérification.
- Un signalement citoyen (`signalements`) n'est **jamais** une preuve
  automatique dans ce dossier — il peut motiver une ouverture de dossier,
  mais son contenu n'alimente jamais directement `verification_decision_
  preuves` (qui ne référence que `documents_institution`, par construction
  du schéma — FK typée, pas une possibilité ouverte).

---

## 6. Cas informel — vérification contre le design ci-dessus

Scénario CEO : artisan / professionnel individuel / activité informelle.

- `statut_juridique='individuel_informel'` → `getRequiredDocuments()`
  retourne `piece_identite` + `preuve_domicile` uniquement — **aucune
  exigence d'immatriculation fabriquée** (déjà vrai dans le code existant,
  confirmé Lot 2.1).
- Le dossier (section Identité) affichera donc, pour cet acteur, une
  preuve d'identité + une preuve de domicile — jamais un champ vide
  "RCCM manquant" qui laisserait croire à une exigence non remplie.
- **Point de vigilance explicite pour l'implémentation (étape 9/10)** :
  l'écran ne doit **jamais** afficher le libellé "entreprise enregistrée"
  pour ce type d'acteur — le `niveau_preuve` (`profil_verifie`/
  `institution_certifiee`) doit avoir un libellé neutre côté UI
  (ex. "Identité vérifiée" / "Identité vérifiée — preuve renforcée"),
  jamais une formulation impliquant une personnalité juridique qui
  n'existe pas pour ce type d'acteur. **Aucune colonne actuelle ne
  distingue ce libellé par type d'acteur — à concevoir à l'implémentation,
  pas encore fait ici.**
- Identité personnelle vérifiée ≠ existence juridique d'une entreprise :
  déjà garanti structurellement — l'axe `identite` ne porte que sur la
  personne/l'entité déclarante, jamais sur une distinction d'existence
  légale (qui reste hors du cycle de décision, section 2 "Existence").

---

## 7. Concurrence admin — proposition de conception (à valider avant implémentation)

**Problème posé par le CEO** : deux admins ouvrent le même dossier
simultanément, ne doivent jamais produire deux décisions contradictoires
sans détection ni trace.

**Contrainte de départ** : `verification_decisions` est **déjà déployée,
déjà testée (Lot 2.4), et totalement immuable** — aucune colonne
`est_courante` ou équivalent n'existe pour marquer "la décision active"
par axe (contrairement à `documents_institution.statut_actif`). Deux
options :

**Option A — ajouter une colonne + assouplir l'immuabilité de
`verification_decisions`.** Rejetée par ce document : reviendrait sur une
table déjà validée par 15 tests réels au Lot 2.4, pour un gain qui peut
être obtenu autrement — risque de régression sur une table qui fonctionne,
contraire au principe "ne pas reconstruire".

**Option B (recommandée) — verrouillage optimiste via une nouvelle
fonction transactionnelle dédiée**, même patron que
`deposer_nouvelle_version_document` (Lot 2.4, déjà éprouvé) :
- Au chargement du dossier, l'écran capture l'`id` de la dernière décision
  connue par axe (ou `NULL` si aucune).
- À la soumission, l'admin envoie ce `dernier_id_vu` avec sa décision.
- La nouvelle fonction `prendre_decision_verification(...)` :
  1. `pg_advisory_xact_lock(hashtext(institution_id || ':' || axe))` —
     même mécanisme de verrou nommé que le RPC documents.
  2. Relit **la vraie dernière décision actuelle** pour cet axe
     (`ORDER BY decide_le DESC LIMIT 1`).
  3. Si son `id` ne correspond pas à `dernier_id_vu` fourni par le client
     → `RAISE EXCEPTION` explicite ("une autre décision a été prise
     entretemps par <examinateur>, rechargez le dossier") — **aucune
     décision n'est créée**, l'admin doit recharger et réévaluer.
  4. Sinon, insère la nouvelle décision avec `decision_precedente_id =
     dernier_id_vu`, puis les lignes `verification_decision_preuves`
     correspondantes, **relues depuis l'état courant de
     `documents_institution` au moment de l'insertion** — jamais depuis
     ce que l'UI affichait à l'ouverture (protège aussi contre le cas
     "preuve remplacée pendant l'examen" : la décision porte toujours sur
     l'état réel au moment de la soumission, pas sur un instantané
     périmé).
- **Traçabilité de la tentative rejetée** : même si la fonction n'insère
  rien en cas de conflit, la route appelante doit logger la tentative
  (ex. `admin_logs`, action `VERIFICATION_CONFLIT_DETECTE`) — sinon le
  conflit est détecté mais pas tracé, contraire à l'exigence CEO.

**Cas "changement de responsable pendant l'examen"** : couvert par le même
mécanisme — la fonction relit `institution_responsables` au moment de la
décision, jamais l'état capturé à l'ouverture du dossier.

**Cas "document expiré pendant l'examen"** : ne peut pas se produire au
sens strict (l'expiration vit sur la décision, pas sur le document —
section 1.6) ; ce qui peut arriver, c'est qu'une décision antérieure sur
laquelle l'admin s'appuyait implicitement expire pendant qu'il travaille —
la fonction doit donc aussi vérifier `expire_le` de la dernière décision
au moment de l'insertion et refuser de créer une décision "accordee" qui
s'appuierait silencieusement sur un `niveau_preuve` déjà expiré sans le
signaler.

**Cette proposition doit être validée explicitement avant toute
implémentation réelle** — c'est la seule pièce de ce lot qui introduit un
mécanisme réellement nouveau (pas une simple réutilisation), donc celle
qui mérite le plus de scrutin avant code, cohérent avec la discipline déjà
appliquée à la décision RPC vs séquentiel du Lot 2.3.

---

## 8. Audit immuable — déjà garanti par l'existant

Aucune conception nouvelle nécessaire — confirmé par les 15 tests du Lot
2.4 :
- `verification_decisions`/`verification_decision_preuves` : immuabilité
  totale déjà testée en conditions réelles (tentatives de modification/
  suppression bloquées, Lot 2.4 section 5).
- Reconstruction historique déjà prouvée possible (test 11, Lot 2.4) — la
  même requête de reconstruction sert de base à la section Historique du
  dossier (section 2).
- Une nouvelle décision (jamais une modification) est déjà le seul
  mécanisme de correction possible — le dossier ne doit jamais proposer
  de bouton "modifier une décision passée", seulement "prendre une
  nouvelle décision" (qui se chaîne automatiquement via
  `decision_precedente_id`).

---

## Suite — étapes 9 et 10 (en cours)

Répartition en 4 sous-étapes (max 2 fichiers à la fois) :

1. ✅ **Fait, VERIFIED IN CODE, pas encore exécuté** — permission
   `institutions.verify` ajoutée à `lib/adminAuth.ts` (même périmètre de
   rôles que `institutions.manage` pour l'instant, clé distincte comme
   exigé) ; fonction transactionnelle
   `supabase/migrations/20260816000006_verification_admin_decision_rpc.sql`
   (`prendre_decision_verification`) — verrouillage optimiste par
   `pg_advisory_xact_lock` (espace de noms préfixé `verif_decision:`,
   distinct de celui de `deposer_nouvelle_version_document`), relecture de
   la vraie dernière décision + des preuves citées au moment de l'insertion
   (jamais l'état vu à l'ouverture), `examinateur_nom` dérivé
   server-side depuis `admin_users` (jamais accepté du client). `npx tsc
   --noEmit` → 0 erreur.
2. ✅ **Fait, VERIFIED IN CODE, pas encore exécuté/déployé** — section 1.5
   close : `storage.objects` confirmé `relrowsecurity=true`, zéro policy
   (requêtes réelles de Bryan, 16/08/2026) — deny-by-default, accès
   exclusivement `service_role`, cohérent avec le reste du projet.
   Routes écrites : `app/api/admin/institutions/[id]/verification/route.ts`
   (GET, dossier complet — institution, responsable, documents requis,
   toutes les versions de preuve avec URL signées 60s, décisions par axe
   avec leurs snapshots) et `.../verification/decision/route.ts` (POST,
   appelle exclusivement `prendre_decision_verification`, distingue le
   conflit de concurrence — 409 `CONFLIT_CONCURRENCE` — et la preuve
   périmée — 409 `PREUVE_PERIMEE` — des autres erreurs, log `admin_logs`,
   notifie l'institution). `npx tsc --noEmit` → 0 erreur.
3. Écran admin (`app/admin/verification/...`) — **pas commencé, bloqué
   jusqu'à la fin des étapes 4/5/6 ci-dessous, sur ordre explicite du
   CEO** ("PAS encore l'UI").
4. Sécurité + 15 tests réels.

### Relecture finale du RPC avant migration (16/08/2026)

**1 bug réel trouvé et corrigé avant exécution** : `p_niveau_preuve NOT IN
(...)` ne se déclenchait pas si `p_niveau_preuve` était `NULL` (sémantique
SQL à 3 valeurs — un `IF` avec une condition `NULL` est traité comme faux
en PL/pgSQL). La contrainte CHECK de la table aurait quand même empêché
toute donnée invalide, mais avec un message d'erreur opaque. Corrigé :
`(p_niveau_preuve IS NULL OR p_niveau_preuve NOT IN (...))`.

**1 limite réelle documentée, non corrigée (décision assumée)** : le RPC
ne vérifie pas que le `type` de chaque preuve correspond à l'axe décidé —
`YELEN_TRUST_MODEL.md` section 1 montre que cette correspondance dépend du
`statut_juridique` (contexte-dépendante, pas un mapping global figé) — un
mapping en dur serait une supposition. Mitigation : contrôle côté écran
admin (étape 3), pas côté RPC. Documenté en commentaire dans la migration.

### Vérification post-migration (16/08/2026) — VERIFIED IN DATABASE

- Fonction créée, signature exacte, propriétaire `postgres`,
  `SECURITY DEFINER=true`, `search_path=public`.
- Grants `EXECUTE` : uniquement `service_role` (+ `postgres`, propriétaire,
  normal) — aucun `anon`/`authenticated`.
- RLS actif (`relrowsecurity=true`) sur `verification_decisions`/
  `verification_decision_preuves`, zéro policy.
- Triggers d'immuabilité confirmés actifs sur les deux tables.

### Tests RPC directs (16/08/2026) — 15/15 VERIFIED IN DATABASE

Institution de test jetable, exécutés en séquence, résultats réels collés
et vérifiés un par un (script `scripts/verification-lot25-rpc-tests.sql`) :

| # | Scénario | Résultat |
|---|---|---|
| 1-2 | Décision valide, axe Identité (accordee) | ✅ `decision_precedente_id=NULL`, `examinateur_nom` dérivé serveur |
| 3 | Décision valide, axe Autorité (accordee) | ✅ Indépendante de l'axe Identité — séparation confirmée |
| 4 | Complément demandé | ✅ Chaînée à la décision précédente |
| 5 | Rejet | ✅ Réussi sans preuve requise |
| 6 | Admin inexistant/inactif | ✅ `ERROR "examinateur inconnu ou inactif"` |
| 7 | Preuve inexistante | ✅ `ERROR "preuve inconnue"` |
| 8-9 | Preuve remplacée/périmée pendant l'examen | ✅ `ERROR "n'est plus la version active"` (même garde, testée une fois) |
| 10 | Responsable modifié | **NOT APPLICABLE** — documenté, non fabriqué |
| 11-12 | Décision concurrente / contradictoire | ✅ **`ERROR` explicite nommant l'examinateur et la décision en conflit — exactement le résultat exigé par le CEO. Confirmé : 3 décisions en base, pas 4 (aucune créée par la tentative périmée)** |
| 13 | Rollback (fonction jumelle) | ✅ Compte identique avant/après l'échec forcé — verrou pris puis relâché sans rien persister |
| 14 | Contournement direct (bypass RPC) | ✅ Réussit (attendu, documente le risque résiduel `service_role` déjà acté — pas un échec) |
| 15 | Reconstruction historique | ✅ Chaîne complète et cohérente sur les 2 axes ; la ligne du test 14 visible comme anomalie (`decision_precedente_id=NULL` alors que ce n'est pas la première décision réelle) — signal d'audit naturel |

Nettoyage confirmé (échappatoires d'immuabilité utilisées explicitement,
institution de test supprimée entièrement).

### Tests des 2 routes admin (16/08/2026) — 13/13 VERIFIED IN APPLICATION

Contre le serveur dev réellement démarré, cookies de session JWT admin
fabriqués avec le vrai secret/issuer/audience/claim `mfaEnabled`
(`scripts/verify-admin-verification-routes.mjs`). **Piège trouvé en
préparant le test** : `middleware.ts` exige `mfaEnabled:true` dans le JWT,
sinon bloque la requête avant même la route (403 `MFA_SETUP_REQUIRED`) —
intégré comme cas de test explicite plutôt que découvert en échec surprise.

| # | Scénario | Résultat |
|---|---|---|
| 1 | GET sans cookie | ✅ 401 |
| 2 | GET admin sans `institutions.verify` (rôle `support`) | ✅ 403 |
| 3 | GET admin sans MFA activée | ✅ 403 `MFA_SETUP_REQUIRED` |
| 4 | GET avec cookie institution (jamais admin) | ✅ 401 |
| 5 | GET institution inexistante | ✅ 404 |
| 6 | GET admin autorisé — dossier complet | ✅ 200, forme correcte |
| 6b | URL signée → contenu réel accessible | ✅ 200, contenu du fichier confirmé (premier essai avait révélé un gap de test : ligne DB créée sans fichier réel uploadé, corrigé) |
| 6c | Accès direct sans signature (bucket privé) | ✅ Refusé (`400`, jamais `200`) — confirme en conditions réelles que `storage.objects` RLS bloque bien, pas seulement en théorie |
| 7 | POST sans cookie | ✅ 401 |
| 8 | POST admin sans `institutions.verify` | ✅ 403 |
| 9 | POST décision valide | ✅ 200, `decision_id` réel |
| 10 | POST avec état périmé | ✅ 409 `CONFLIT_CONCURRENCE` |
| 11 | POST avec preuve remplacée | ✅ 409 `PREUVE_PERIMEE` |

Nettoyage confirmé après chaque exécution.

**Vérification code (pas d'exécution nécessaire)** : aucune autre route
du dépôt ne référence `verification_decisions`/`verification_decision_preuves`
en écriture — confirmé par grep, seule `prendre_decision_verification`
(via `.../decision/route.ts`) y écrit.

---

## GO / NO-GO pour la suite du Lot 2.5

### Bilan final backend (16/08/2026)

| Point (ordre imposé par le CEO) | Statut |
|---|---|
| 1. Relecture RPC avant migration | ✅ VERIFIED IN CODE — 1 bug corrigé, 1 limite documentée |
| 2. Vérification post-migration | ✅ VERIFIED IN DATABASE — fonction, propriétaire, `SECURITY DEFINER`, `search_path`, grants, RLS, triggers |
| 3. Tests RPC directs | ✅ 15/15 VERIFIED IN DATABASE |
| 4. Test critique de concurrence | ✅ VERIFIED IN DATABASE — conflit détecté, tracé, aucune décision contradictoire créée |
| 5. Tests des 2 routes | ✅ 13/13 VERIFIED IN APPLICATION |
| 6. Storage | ✅ VERIFIED IN APPLICATION — bucket privé, RLS actif zéro policy, URL signée fonctionnelle, accès direct non signé refusé (`400`), aucune route alternative |
| 9. Sécurité (checklist) | ✅ `institutions.verify` (permission dédiée, testée) ; RBAC (testé, rôle refusé confirmé) ; MFA admin (testé, gate confirmé) ; RLS (confirmé sur les 2 tables + Storage) ; permissions RPC (`EXECUTE` limité à `service_role`, confirmé) ; `SECURITY DEFINER`/`search_path` (confirmés) ; aucune fuite de document (URL signées 60s, jamais d'URL publique) ; aucun accès citoyen/institution (testé, 401) ; aucune route parallèle (grep confirmé) |

**Tout le backend est validé en conditions réelles — GO explicite du CEO
obtenu pour cette étape avant de continuer.**

**Reste manuel pour Bryan** : nettoyage final SQL de la dernière
institution de test (fournie après la dernière exécution du script de
routes).

**GO pour l'écran admin (étape 3)** — sous réserve de confirmation
explicite du CEO, comme demandé ("Si les 15 tests backend passent
réellement : GO écran admin").

---

## Écran admin — rapport d'implémentation (16/08/2026, GO explicite reçu)

### Fichiers créés

- `app/api/admin/verification/route.ts` — liste/recherche d'institutions,
  gardée exclusivement par `institutions.verify` (jamais
  `institutions.manage`, conformément à la consigne CEO).
- `app/admin/verification/page.tsx` — console de vérification : liste
  recherchable → `SlidePanel` dossier complet → décision par axe avec
  étape de confirmation obligatoire.

### Fichiers modifiés

- `app/admin/layout.tsx` — entrée de navigation "Vérification" ajoutée
  (groupe Modération, mêmes rôles que `institutions.verify`).
- `app/api/admin/institutions/[id]/verification/route.ts` — ajout de
  `hash_integrite` au `select`/à la réponse (gap trouvé en écrivant
  l'écran : le hash était prévu à l'affichage mais jamais renvoyé par la
  route) — modification additive, lecture seule, aucun impact sur les 13
  tests déjà validés (revérifiés non affectés par grep des assertions).

**Aucune modification du modèle de données, du RPC, du trigger, ou des
migrations validées au Lot 2.4/2.5 — conformément à la consigne CEO.**

### Composants réutilisés (aucun nouveau système visuel)

`D` (adminTheme), `Ic` (adminIcons), `Badge`/`DataTable`/`SlidePanel`/
`ToastContainer` (adminUiKit), `YelenLoader`, type `ToastItem`
(adminTypes) — patron structurel répliqué de `CasTab`
(`app/admin/moderation/page.tsx`) : liste → clic → panneau latéral →
formulaire de décision contextuel.

### Parcours utilisateur couvert

- Recherche/liste d'institutions (nom, statut, statut juridique, niveau
  de confiance).
- Dossier complet : identité, responsable déclaré (avec rappel explicite
  qu'aucune preuve n'y est aujourd'hui rattachée), documents requis
  manquants signalés, **tous les documents avec toutes leurs versions**
  (badge Active/Remplacée, statut, dates, hash tronqué, aperçu signé),
  décisions actuelles et historique complet par axe.
- Bandeau permanent rappelant que ce dossier ne reflète jamais la
  réputation.
- Par axe (Identité, Autorité) : 3 actions distinctes et séparées
  ("Vérifier l'axe X" / "Demander un complément" / "Refuser la
  vérification de l'axe X") — jamais de bouton générique "Valider
  l'institution".
- **Étape de confirmation obligatoire** avant tout envoi : récapitulatif
  exact (axe, décision, niveau de preuve, preuves sélectionnées avec leur
  version, justification) + rappel que la décision sera permanente.
- Concurrence gérée côté client : `derniere_decision_vue_id` toujours
  envoyé depuis l'état chargé ; sur `409 CONFLIT_CONCURRENCE` ou `409
  PREUVE_PERIMEE`, le formulaire est réinitialisé et le dossier
  entièrement rechargé — aucun contournement client possible, l'admin
  doit re-décider depuis l'état réel.
- Aucun accès Storage direct ajouté — uniquement les URL signées déjà
  renvoyées par la route dossier.

### Tests réellement exécutés pour cette étape

| Test | Méthode | Résultat |
|---|---|---|
| `npx tsc --noEmit` | Réel, sortie vérifiée vide avant conclusion (leçon de l'incident précédent appliquée) | ✅ **VERIFIED — 0 erreur** |
| `npm run build` | Réel, log complet capturé sans troncature après une première tentative tronquée par erreur | ✅ **VERIFIED — "Compiled successfully in 3.5min", exit 0** |
| Présence des 2 nouvelles routes dans le manifeste de build | `grep` sur le log complet | ✅ **VERIFIED** — `/admin/verification` (○ statique), `/api/admin/verification` + les 2 routes dossier/décision (ƒ dynamique) |
| Aucun nouveau warning de build | `grep -i warn` sur le log complet | ✅ **VERIFIED — 0 résultat** |
| Aucune route parallèle vers `verification_decisions`/`verification_decision_preuves` | `grep` exhaustif sur `app/` | ✅ **VERIFIED — seuls les 2 fichiers déjà autorisés y écrivent** ; confirmé que `page.tsx` n'importe aucun client Supabase (`createClient`/`supabase` absent), uniquement des `fetch()` vers les routes déjà auditées |
| États normaux/409 concurrence/preuve périmée/permission/MFA en conditions réelles **dans le navigateur** | — | ⏳ **NOT VERIFIED** — aucun outil navigateur disponible dans cet environnement (déjà documenté comme limite structurelle à plusieurs reprises dans ce projet). Ces 5 états sont couverts et déjà validés **au niveau API** (13/13 tests du Lot 2.5 étape 5, section précédente) — l'écran consomme exactement ces mêmes réponses (codes `CONFLIT_CONCURRENCE`/`PREUVE_PERIMEE` gérés explicitement dans le code, relu ligne par ligne), mais le rendu visuel réel (le bandeau d'erreur s'affiche-t-il correctement, le formulaire se vide-t-il bien à l'écran) n'a pas été observé par un humain dans un navigateur |

### Gaps honnêtes, non cachés

- **Vérification visuelle réelle non faite** (point ci-dessus) — reste à
  faire par Bryan en conditions réelles avant tout usage en production.
- **Filtrage des preuves "pertinentes pour l'axe" non implémenté** — la
  migration RPC documente déjà cette limite (pas de mapping type→axe
  figé, section Étape 9 du corps de ce document) ; l'écran affiche donc
  **tous** les documents actifs comme sélectionnables pour n'importe quel
  axe, laissant le jugement à l'examinateur humain plutôt que de filtrer
  silencieusement sur une supposition. Cohérent avec la décision déjà
  actée, pas un oubli.
- **Aucun mécanisme de révocation dans cet écran** — `type_decision=
  'revoquee'` existe dans le schéma mais n'est pas exposé ici, cohérent
  avec le RPC qui ne le gère pas non plus (décision déjà actée à l'étape
  1 de la relecture RPC).

### Continuation autonome (16/08/2026, pendant l'absence de Bryan)

Sur instruction CEO explicite ("continue le travail de manière autonome
sur le plan déjà validé"). Respecte strictement la règle CLAUDE.md :
aucune exécution de SQL ni de script mutant la base par Claude Code, même
en mode autonome — uniquement relecture, correctifs de code, `tsc`,
`grep`, documentation.

**Relecture critique de `page.tsx` et des 3 routes — jamais faite avec
la même rigueur que le RPC/trigger. 3 vrais bugs trouvés et corrigés :**

| Bug trouvé | Sévérité | Correction |
|---|---|---|
| Badge de statut document réutilisait `TYPE_DECISION_LABEL` (enum décision) au lieu d'un mapping dédié — `documents_institution.statut` (`recu`/`valide`/`rejete`/`complement_demande`) n'est **pas** le même vocabulaire que `verification_decisions.type_decision` (`accordee`/`rejetee`/`complement_demande`/`revoquee`), chevauchement trompeur sur un seul mot. Conséquence : un document validé ou rejeté s'affichait toujours en gris neutre, jamais vert/rouge | Cosmétique, mais contraire à l'exigence CEO "zéro ambiguïté" | Nouveau mapping `STATUT_DOCUMENT_LABEL` dédié |
| Résumé de décision affichait l'enum brut (`"rejetee"`) au lieu du libellé français quand `niveau_preuve` est vide (cas normal pour un rejet/complément) | Cosmétique | Fallback corrigé vers `TYPE_DECISION_LABEL[...].label` |
| `limit` non numérique dans la route de liste → `NaN` transmis à Supabase sans garde | Robustesse mineure, route admin uniquement | `Number.isFinite()` + valeur par défaut |

**1 point produit trouvé, remonté avant correction plutôt que tranché
seul** : `decision/route.ts` transmettait le texte de `justification` tel
quel à l'institution par notification, alors que l'écran le présentait
comme une note interne permanente sans le préciser. **Décision CEO reçue
("Ça y 1")** : ajouter la divulgation dans l'écran de confirmation plutôt
que de séparer les champs (option plus lourde, non retenue). Fait :
avertissement orange ajouté à l'étape de confirmation ("sera transmise
telle quelle à l'institution").

**`tsc --noEmit` revérifié après chaque correctif (3 passes), sortie vide
à chaque fois — jamais annoncé avant confirmation réelle du fichier de
sortie (règle tirée de l'incident du build tronqué de ce même lot).**

**Grep de sécurité reconfirmé** : toujours exactement 3 fichiers
référençant `verification_decisions`/`verification_decision_preuves`
(`page.tsx` en lecture `fetch()` uniquement, les 2 routes déjà auditées) —
aucune route parallèle introduite par les correctifs.

### Ce qui reste BLOCKED (nécessite Bryan, pas exécutable en autonome)

- Nettoyage de l'institution de test `f98d295d-e228-4110-a9cc-fa02e44c030a`
  — **TEST DATA — CLEANUP PENDING**, SQL déjà fourni, jamais exécuté (ni
  par Bryan avant son départ, ni par Claude Code — règle absolue).
- Ré-exécution de `scripts/verify-admin-verification-routes.mjs` après
  les 3 correctifs de ce tour — nécessite le serveur dev démarré et
  l'exécution par Bryan. Dernier résultat connu (avant ces correctifs) :
  13/13 PASS — aucun des 3 correctifs ne touche la logique testée
  (calculs d'affichage côté client, pas de nouveau code serveur testable
  différemment), donc risque de régression jugé faible mais **non
  reconfirmé**.
- Vérification visuelle réelle dans un navigateur (parcours de décision
  complet, affichage 409, permission refusée, MFA) — aucun outil
  navigateur disponible dans cet environnement.

### GO / NO-GO pour le Lot 2.6

**NO-GO automatique inchangé.** Le code est VERIFIED IN CODE (relecture
approfondie faite, bugs trouvés et corrigés), le build est VERIFIED, mais
aucune affirmation "l'écran fonctionne visuellement" n'est faite sans
preuve réelle. Étapes suivantes, non commencées, en attente de Bryan :
nettoyage SQL, re-test des routes après correctifs, test manuel navigateur
des 5 états, puis décision explicite du CEO sur un éventuel Lot 2.6.

Arrêt ici, conformément à la consigne CEO ("aucun nouveau lot produit ou
architecture ne doit être lancé en parallèle"). Aucun commit, aucun
déploiement.
