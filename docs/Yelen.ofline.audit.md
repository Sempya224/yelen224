# Yelen Offline-First Native — Audit & Spécification (20/08/2026)

Mission CEO : concevoir l'architecture Offline-First **native** de Yelen,
sans construire une solution PWA qui devrait être abandonnée au passage
au natif. Document en 2 parties : **Partie A** (audit de l'existant, en
lecture seule) puis **Partie B** (spécification technique, 20 points
demandés). **Aucun code applicatif n'a été modifié pour produire ce
document.** Chaque affirmation est sourcée fichier:ligne, vérifiée par
lecture directe — conforme à la discipline déjà appliquée aux audits
précédents de ce projet (`docs/ui/YELEN_HOTEL_MODEL_AUDIT.md`,
`docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md`).

**Précision de vocabulaire actée dès le départ** : "Yelen Citoyen" et
"Yelen Professionnel" (institution) sont deux cibles natives distinctes
dans la vision produit finale ; "les prestataires/organisations restent
Web dans un premier temps" (décision déjà actée, brief CEO). Ce document
couvre donc en priorité **Yelen Citoyen** (le cas d'usage offline le plus
riche : profil, QR, documents, RDV) et **Yelen Entreprise/Clock In Shift**
(le cas d'usage critique n°1, pointage). Le dashboard institution web
n'est pas concerné par une migration native dans ce document.

---

# PARTIE A — Audit de l'existant

## A.1 — Ce qui est actuellement PWA/Web uniquement

**Verdict global, contraire à une hypothèse naturelle de départ** : Yelen
n'a **aujourd'hui aucune capacité offline réelle**, ni au sens PWA
(Workbox/cache stratégique) ni au sens applicatif (aucune file d'attente,
aucun stockage local métier). Ce qui existe est strictement de
l'**installabilité** :

| Élément | État réel | Preuve |
|---|---|---|
| `public/manifest.json` | Manifeste minimal (nom, icônes, `display:"standalone"`) — permet "Ajouter à l'écran d'accueil", rien de plus | `public/manifest.json:1-14` |
| `public/sw.js` | Service worker **à but unique** : recevoir un push Web et afficher une notification système au clic. Aucun `fetch` intercepté, aucun cache, aucune stratégie offline | `public/sw.js:1-42`, commentaire explicite "chantier Yelen Assistant... Rôle unique : recevoir les push Web" |
| `next-pwa` / Workbox / tout plugin PWA | **Absent** | `next.config.ts` — aucune trace, aucune dépendance PWA dans `package.json` |
| Recherche exhaustive `navigator.onLine`, `offline`, `hors ligne`, IndexedDB, Dexie | **0 résultat** dans `app/` et `lib/` | Grep exhaustif exécuté le 20/08/2026, aucune correspondance |

**Conclusion** : il n'y a rien à "arracher" d'une fausse fondation PWA —
c'est un vrai point de départ propre. Le risque n'est pas la dette
existante, il est dans les **couplages Web implicites** listés en A.6.

## A.2 — Données personnelles déjà disponibles côté client

Recensement des données qui transitent déjà vers le navigateur du citoyen
aujourd'hui (donc candidates naturelles à un cache local natif) :

- **Profil** (`public.users`) — nom/prénom/téléphone/email/photo/centres
  d'intérêt, chargé à la demande via Supabase Auth + `select` direct
  (RLS `auth.uid()`).
- **RDV** (gratuits + payants) — `app/mes-rdv/page.tsx`, `app/mon-qr/page.tsx`.
- **Documents citoyen** (`citoyen_documents`) — 7 statuts (cycle de vie
  complet, voir CLAUDE.md `/modules-livres` → Documents clients),
  fichiers dans un bucket Storage **privé**, accès via URL signée
  courte-vécue (jamais un lien permanent).
- **QR d'identité / RDV** — voir A.4, dépendances réseau non triviales.
- **Score de réputation institution** (`lib/reputationScore.ts`) — **ce
  n'est pas un score citoyen**, c'est la "Santé du compte" d'une
  institution (note/avis/annulations), calculé côté serveur/à la volée,
  jamais persisté nulle part. ⚠️ Voir A.7, tension terminologique
  importante avec le "Score Yelen" mentionné dans le brief.
- **Activités passées** (`app/api/citoyen/activites`) — agrégat déjà
  construit côté serveur (RDV, présence QR, paiements, avis, favoris,
  biométrie, documents, démarches, dépenses).
- **Historique de pointage** (Clock In Shift, employé — population
  distincte des citoyens, voir A.5) — `attendance_logs`, jamais exposé
  au citoyen classique.

## A.3 — Opérations qui nécessitent obligatoirement le serveur

Toute écriture qui touche une **table protégée par service_role
uniquement, zéro policy RLS** (convention systématique du projet pour
tout ce qui n'a pas de session Supabase Auth directe, ou tout ce qui doit
rester sous autorité serveur) est, par construction, non falsifiable
localement :

- Validation d'un RDV par une institution (`rdv.statut`).
- Confirmation de présence QR (`qr_valide`, `qr_scanne_le`) — l'scan est
  fait par l'institution, jamais par le citoyen lui-même.
- Décisions de vérification (`verification_decisions`, immuable,
  service_role uniquement).
- Validation/refus d'un document (`document_events`, source unique
  `lib/citoyenDocuments.ts:9-14` — "aucune route ne doit jamais écrire
  ces deux tables directement").
- Calcul du "Santé du compte" institution — dérivé de données serveur
  (avis, rdv_events), jamais calculable localement avec les seules
  données déjà en cache citoyen.
- Génération du QR "gratuit" — payload HMAC signé côté serveur
  (`/api/qr/generate`), jamais généré localement (voir A.4).
- Paiement/réception — `recus`, `transactions_financieres`,
  service_role uniquement.

## A.4 — Le cas QR : deux dépendances réseau non documentées jusqu'ici

Découverte importante de cet audit, avec un impact direct sur le point 7
du brief ("le QR doit pouvoir être affiché sans Internet") :

**RDV gratuit** (`app/mon-qr/page.tsx:176-195`) :
1. Le **payload** est un token signé, généré à la demande par
   `/api/qr/generate` (appel réseau obligatoire, `session.access_token`
   requis).
2. Il **expire après 3h** ("QR Code chiffré · Valide 3h", `mon-qr/page.tsx:564`).
3. L'**image** du QR elle-même n'est **jamais générée localement** — elle
   est construite en appelant une URL tierce
   `https://api.qrserver.com/v1/create-qr-code/?...` (`mon-qr/page.tsx:191`),
   documentée comme exception `next/image` volontaire
   (`mon-qr/page.tsx:303`, décision CEO 08/08/2026 : "ne pas ajouter ce
   tiers non maîtrisé aux remotePatterns"). **Sans réseau, cette image ne
   se charge jamais**, même si le payload était déjà en mémoire.

**Booking payant** (`app/mon-qr/page.tsx:197-201`) :
1. Le code (`confirmation_code`) est fixe, déjà connu côté client dès le
   chargement initial de la page (pas de régénération) — **cette partie
   est déjà offline-compatible en théorie**.
2. Mais l'**image** QR utilise exactement le **même service tiers**
   `api.qrserver.com` — donc, même avec un code déjà en mémoire,
   l'affichage réel du QR scannable échoue sans réseau.

**Conclusion, contraire à l'hypothèse implicite du brief** : "afficher un
QR offline" n'est aujourd'hui possible pour **aucun des deux flux**, et
pas seulement à cause du payload signé serveur (RDV gratuit) — même le
cas le plus favorable (code déjà connu) échoue à cause d'une dépendance
à un service de rendu tiers non maîtrisé. Les deux problèmes sont
distincts et se corrigent différemment (voir Partie B.7).

## A.5 — Le cas Clock In Shift (pointage) : 100% synchrone aujourd'hui

Architecture actuelle (`app/api/clock/pointage/route.ts`,
`supabase/migrations/20260805000007_clock_in_attendance_logs.sql`) :

- Auth employé : JWT dans un cookie httpOnly `yelen224_employee_session`
  (12h, `lib/employeeAuth.ts:10,25`) — **mécanisme Web (cookie)**, pas
  directement transposable à un client HTTP natif sans adaptation (voir B.15/B.16).
- **La direction du pointage (entrée/sortie) est déduite côté serveur**,
  jamais envoyée par le client — dérivée du dernier `attendance_logs`
  actif de l'employé (`pointage/route.ts:46-64`, commentaire explicite
  : "évite un état désynchronisé"). **Implication directe et non
  triviale pour l'offline** : un client qui pointerait localement sans
  jamais avoir confirmé son dernier état serveur ne peut pas décider
  seul s'il s'agit d'une entrée ou d'une sortie — voir Partie B.4 pour
  la conception retenue (ne pas dupliquer cette logique côté client).
- **Anti-double-tap actuel** : fenêtre de 5s, vérifiée côté serveur par
  requête (`DUPLICATE_TAP_MS = 5000`, `pointage/route.ts:20,57-62`) —
  **aucun identifiant d'opération généré côté client aujourd'hui**, donc
  aucune garantie d'idempotence en cas de perte de la réponse HTTP après
  un insert réussi (retry naïf = double pointage). C'est exactement le
  risque que le brief demande de fermer (point 4).
- **Immuabilité en base** (`attendance_logs_immuable`,
  `20260805000007...sql:58-71`) — aucune correction en place possible,
  100% insert-only. Compatible par nature avec un modèle de synchronisation
  append-only (bon point pour l'offline, à documenter comme un atout,
  pas un obstacle).
- **Aucune notion de file d'attente, aucun état `pending/syncing/synced`
  n'existe nulle part dans le projet** — confirmé par la recherche A.1.

## A.6 — Dépendances qui empêcheraient une migration native propre

| Dépendance actuelle | Où | Risque pour le natif |
|---|---|---|
| Session Supabase Auth citoyen dans **localStorage** navigateur | `lib/supabase.ts:19-22`, commentaire explicite : "session tenue dans le localStorage du navigateur" | `localStorage` n'existe pas nativement — remplacement direct par Keychain/Keystore (voir B.3), mais l'**intégralité** des ~35 fichiers citoyen qui appellent `supabase.auth.getSession()` ou lisent `localStorage.getItem(YELEN224_USER_ID_KEY)` (`lib/auth/constants.ts`, ex. `app/mon-qr/page.tsx:132`) devra passer par une couche d'abstraction plutôt qu'un accès direct à l'API navigateur |
| Session institution/admin/employé en **cookie httpOnly** | `lib/institutionAuth.ts`, `lib/adminAuth.ts`, `lib/employeeAuth.ts` | Les cookies httpOnly n'existent pas de la même façon dans un client HTTP natif — un client natif devra transporter le token autrement (header `Authorization`, stocké en Keychain/Keystore) |
| Rendu du QR via URL tierce (`api.qrserver.com`) | A.4 | Fonctionne uniquement avec réseau, quel que soit le client (Web ou natif) — c'est un problème **indépendant** de PWA vs natif, à corriger dans les deux cas (bibliothèque de génération QR locale) |
| Service worker (push Web) | `public/sw.js` | Push natif (APNs/FCM) est un mécanisme **complètement différent** — le SW actuel ne sera de toute façon jamais réutilisé tel quel en natif, mais il n'est pas non plus un obstacle : c'est un fichier isolé, sans dépendance croisée avec la logique métier |
| Aucun usage direct de `IndexedDB` | — | Rien à migrer ici — **bonne nouvelle**, la logique métier actuelle n'est couplée à aucune base locale Web |
| Next.js App Router (Server Components) pour une partie du rendu institution/admin | Ex. gating d'auth en Server Component | **Hors périmètre natif** (institutions restent Web, brief confirmé) — aucun risque pour Yelen Citoyen/Entreprise, qui passent déjà quasi exclusivement par des routes `/api/**` + composants `"use client"` (pattern déjà dominant côté citoyen et Clock In Shift) |
| `next-intl` (résolution de langue par cookie) | `next.config.ts:39-43` | Mécanisme Web-only (cookie) — équivalent natif trivial (préférence stockée localement), pas un vrai risque |

**Point positif à documenter explicitement** (falsifiabilité de
l'hypothèse "tout est à refaire")  : la quasi-totalité de la logique
métier citoyen et Clock In Shift est déjà organisée en **routes API
Next.js consommées via `fetch()` depuis des composants `"use client"`**
— c'est-à-dire déjà proche d'un modèle **client HTTP + API REST**, le
schéma exact dont un client natif a besoin. Le vrai travail de migration
n'est donc pas "réécrire toute la logique", mais "remplacer les deux
mécanismes de session Web (localStorage, cookie httpOnly) par un stockage
sécurisé natif équivalent" — un périmètre beaucoup plus resserré que ce
qu'un audit superficiel aurait pu craindre.

## A.7 — Tension à lever avant toute conception du "Score Yelen" local

Le brief demande de prévoir en cache local la "dernière version connue
du Score Yelen". **Contradiction directe avec une décision déjà actée du
projet**, à faire trancher explicitement par le CEO avant toute
conception (ne pas la résoudre silencieusement dans ce document) :

- `/chantier-strategie-retention-v2` (CLAUDE.md) : **"jamais de score
  numérique visible attribué à un citoyen"** — décision produit délibérée
  (risque de "crédit social", plateforme adossée à l'État).
- `/vision-long-terme-yelenid` (CLAUDE.md) : "Yelen Trust"/"Yelen Points"
  restent une **vision long terme non construite**, avec la même tension
  déjà identifiée et non tranchée ("visible au citoyen lui-même... jamais
  un classement public").
- Le seul "score" réellement implémenté aujourd'hui côté citoyen est
  `score_sante` (Accueil) — **calculé côté client, jamais persisté**
  (CLAUDE.md `/chantiers-citoyen-clos`).
- `lib/reputationScore.ts` est un score **institution**, pas citoyen
  (voir A.2) — à ne pas confondre avec le "Score Yelen" du brief.

**Recommandation de ce document** : soit le "Score Yelen" du brief
désigne en réalité `score_sante` (dans ce cas : le cacher localement ne
pose aucun problème produit, puisqu'il n'est déjà qu'un affichage
client, jamais un score "attribué"), soit il désigne une future brique
"Yelen Trust" pas encore construite — **dans ce cas, la construire (même
comme simple cache local) nécessite une clarification CEO explicite avant
tout travail**, cette tension n'ayant jamais été résolue. Partie B.2 le
traite comme `score_sante` (hypothèse la plus sûre, alignée sur
l'existant) et signale ce choix comme **à confirmer**.

## A.8 — Fonctionnalités déjà candidates à l'offline-first

Sur la base de A.2-A.3, les candidats naturels (donnée déjà rapatriable
côté client, écriture non systématiquement bloquante) :

- Consultation du profil déjà chargé.
- Consultation des RDV déjà chargés (lecture).
- Consultation des documents déjà chargés (métadonnées ; le fichier lui
  même dépend d'une politique de rétention locale, voir B.2).
- Affichage du QR (après correction des 2 dépendances réseau de A.4).
- **Pointage Clock In Shift** — cas d'usage n°1 du brief, voir Partie B.4.
- Fiches d'institutions récemment consultées (déjà un mécanisme
  `lib/institutionsRecentes.ts` basé sur `sessionStorage`/`localStorage`
  aujourd'hui — cache "meilleur effort", jamais critique).

---

# PARTIE B — Spécification technique (20 points du brief)

## B.1 — Architecture Offline-First cible

```
┌─────────────────────────────────────────────────────────────┐
│                      COUCHE UI (native)                       │
│         Écrans, navigation — ne parle jamais directement       │
│                    à la base locale ni au réseau                │
└───────────────────────────┬─────────────────────────────────┘
                             │
┌───────────────────────────▼─────────────────────────────────┐
│                LOGIQUE MÉTIER (couche partagée)                │
│   Règles déjà déterministes du projet (jamais de LLM, voir      │
│   CLAUDE.md /stack-specifique) — réutilisables telles quelles   │
│   si extraites de leurs fichiers actuels (lib/*.ts isomorphes)  │
└──────────┬───────────────────────────────────┬───────────────┘
           │                                     │
┌──────────▼──────────────┐         ┌───────────▼───────────────┐
│   COFFRE LOCAL (SQLite)   │         │   COUCHE SYNCHRONISATION    │
│  Source de vérité pour     │◄───────┤  File d'attente d'opérations │
│  tout ce qui est classé    │        │  + résolution de conflits    │
│  "local" ou "local+sync"   │────────►  + retry/backoff             │
│  (Partie B.4/B.6)          │         └───────────┬───────────────┘
└────────────────────────────┘                     │
                                         ┌───────────▼───────────────┐
                                         │      API SERVEUR YELEN      │
                                         │  (Next.js API routes déjà    │
                                         │  existantes — AUTORITÉ FINALE│
                                         │  sur tout ce qui est "serveur │
                                         │  requis", Partie A.3)         │
                                         └────────────────────────────┘
```

**Principe non négociable** : le coffre local n'est **jamais** une
seconde autorité. Il est soit (a) un cache d'une vérité serveur déjà
validée, soit (b) une file d'attente d'intentions **pas encore
validées** par le serveur. Aucune donnée locale n'est présentée comme
"vérifiée" tant que le serveur ne l'a pas confirmée — cohérent avec le
principe déjà répété du brief ("le téléphone conserve une copie
utilisable offline ; le serveur reste l'autorité").

## B.2 — Architecture native cible (vue produit)

| Application | Cible | État |
|---|---|---|
| Yelen Citoyen | Native Android/iOS | À construire (ce document) |
| Yelen Professionnel (institution) | Native, quand la roadmap le prévoit | Hors périmètre immédiat de ce document (brief confirmé) |
| Yelen Entreprise / Clock In Shift | Portail employé — cas d'usage critique n°1 offline (brief), cible native prioritaire | Traité en détail en B.4 |
| Prestataires/organisations (dashboard institution) | Web, décision déjà actée | Aucun changement |

Techniquement, ce document ne prescrit **pas** un framework natif
précis (Swift/Kotlin natif pur vs React Native/Flutter) — ce choix
dépasse le périmètre "architecture offline" et doit être une décision
séparée. Ce qui est prescrit ici est **indépendant de ce choix** : SQLite
comme coffre local, Keychain/Keystore pour les secrets, file de
synchronisation avec identifiants d'opération. Ces trois piliers sont
disponibles quel que soit le framework natif retenu.

## B.3 — Matrice de classification des données (par donnée, pas par écran)

Légende : **Local uniquement** (jamais transmis, jamais synchronisé) ·
**Cache local** (copie d'une donnée serveur, écrasable, non critique si
perdue) · **Serveur uniquement** (jamais persisté localement) · **Local
+ synchronisation** (écrit localement d'abord, doit atteindre le
serveur).

| Donnée | Classification | Justification |
|---|---|---|
| Profil citoyen (nom/téléphone/email/photo) | Cache local | Lecture fréquente, faible sensibilité, déjà public au sens "vu par les institutions contactées" — perte locale sans conséquence (re-fetch au retour réseau) |
| Session/tokens d'authentification | **Local uniquement, chiffré** (Keychain/Keystore) | Jamais dans SQLite en clair — voir B.5. Ce n'est pas une "donnée métier", c'est un secret |
| `score_sante` ("Score Yelen" présumé, voir A.7 — **à confirmer avec le CEO**) | Cache local, valeur **horodatée** | Uniquement si la clarification A.7 confirme qu'il s'agit bien d'un affichage client existant, jamais un score "attribué" stocké comme vérité — toujours affiché avec sa date de dernier calcul, jamais présenté comme "à jour" hors ligne |
| Documents personnels (métadonnées : nom, statut, date) | Cache local | Utile hors ligne (savoir ce qui a été demandé/envoyé), faible sensibilité si le contenu réel du fichier reste séparé |
| Documents personnels (**fichier binaire** — pièce d'identité, etc.) | **Local + politique de rétention stricte**, chiffré au repos | Donnée très sensible (KYC) — voir B.5, jamais mise en cache "par défaut" ; téléchargée à la demande explicite du citoyen pour un usage hors ligne précis (ex. présenter un document physiquement sans réseau), purgée après un délai court configurable |
| QR d'identité / RDV — **payload** | Local + synchronisation (régénération) | Voir B.7 — payload signé avec fenêtre de validité courte, jamais un secret permanent stocké tel quel |
| QR — **rendu image** | Local uniquement (généré on-device) | Doit être généré par une bibliothèque locale (ex. équivalent natif de `qrcode`), plus jamais par un appel réseau à un tiers (correction du problème trouvé en A.4) |
| Historique de pointage (Clock In Shift) déjà synchronisé | Cache local | Lecture seule, utile pour l'affichage "mes derniers pointages" hors ligne |
| **File d'attente de pointages non synchronisés** | Local + synchronisation (source de vérité de la file elle-même) | Cœur du cas d'usage critique — voir B.4 |
| RDV déjà chargés (lecture) | Cache local | Consultable hors ligne, jamais modifiable hors ligne (créer un RDV nécessite une vérification de disponibilité serveur — brief §6, tableau du CEO, "Nouveau RDV : Non offline") |
| Fiches d'institutions récemment consultées | Cache local (déjà partiellement existant via `lib/institutionsRecentes.ts`, mécanisme Web à remplacer en natif par le même principe sur SQLite) | Confort de navigation, aucune conséquence si périmé |
| Validations serveur (statut RDV confirmé, document validé, décision de vérification) | **Serveur uniquement comme preuve** — une **copie en cache local** est autorisée pour l'affichage, mais **jamais** utilisée comme preuve d'autorité (ex. jamais faire confiance à un `statut="confirme"` en cache pour laisser un tiers agir sans revérification serveur) | Cohérent avec le principe du brief : "ne jamais considérer une donnée locale comme une preuve de vérité serveur" |
| Résultat d'une vérification QR par un tiers (banque, entreprise...) | Serveur uniquement | Le tiers vérificateur doit interroger le serveur, jamais se fier à l'affichage local du citoyen (voir B.7) |

## B.4 — Yelen Entreprise : pointage offline (cas d'usage critique n°1)

### Flux cible

```
1. Employé appuie sur "Pointer" (hors ligne ou en ligne, indifférent à l'UI)
2. Écriture LOCALE immédiate dans la file (table sync_queue, SQLite) :
   { id_operation (UUID généré localement), type: "pointage",
     horodatage_local, statut: "pending", payload: { methode, device_id } }
   ⚠️ Le sens (entrée/sortie) N'EST PAS décidé ici — voir "Décision
   ci-dessous" — le payload transporte l'INTENTION ("pointer"), pas la
   direction, exactement pour ne jamais dupliquer côté client la logique
   serveur actuelle (A.5).
3. UI affiche IMMÉDIATEMENT : "Pointage enregistré — synchronisation en
   attente" (jamais un état "en cours" flou — l'employé doit savoir que
   son geste est déjà acquis localement, avant même toute confirmation
   serveur)
4. Dès que le réseau est disponible : la couche de synchronisation
   envoie l'opération avec son id_operation au serveur
5. Le serveur : reçoit id_operation → vérifie si déjà traité (table
   d'idempotence, voir ci-dessous) → si non, déduit la direction
   entrée/sortie exactement comme aujourd'hui (pointage/route.ts:46-64,
   logique serveur inchangée) → insère dans attendance_logs → renvoie
   { id_operation, type_action, horodatage_serveur }
6. Le client marque l'opération locale "synced", met à jour l'affichage
   avec l'horodatage/direction confirmés par le serveur (qui font foi,
   pas l'estimation locale)
```

### Pourquoi ne pas décider la direction (entrée/sortie) côté client

C'est une déviation volontaire par rapport à une intuition naïve
("dupliquer la logique de déduction côté client pour un affichage
optimiste immédiat"). Risque réel si on le faisait : deux appareils du
même employé (ou une correction serveur entre-temps) désynchronisent
l'estimation locale de l'état réel — exactement le problème que la route
actuelle a été conçue pour éviter (`pointage/route.ts:9-10` : "évite un
état désynchronisé"). **Compromis retenu** : l'UI locale affiche "Pointage
enregistré" (fait générique, toujours vrai), **pas** "Entrée enregistrée"
tant que le serveur n'a pas confirmé la direction réelle — l'affichage se
complète après synchronisation. C'est un choix UX délibéré à valider avec
Bryan, alternative documentée : afficher une estimation locale
("probablement une entrée") avec un badge explicite "à confirmer",
corrigée silencieusement si le serveur tranche différemment.

### Idempotence — empêcher le double pointage

- Chaque opération porte un **UUID généré côté client** au moment de
  l'appui (pas au moment de l'envoi réseau — génoré même hors ligne).
- Nouvelle colonne serveur nécessaire (migration à valider séparément,
  hors périmètre "aucun code" de cette mission) : `attendance_logs.id_operation_client uuid UNIQUE NULL` —
  une contrainte d'unicité fait qu'un retry avec le même UUID échoue
  silencieusement côté serveur (conflit ignoré, réponse = ligne déjà
  existante renvoyée), jamais une deuxième insertion.
- Ce mécanisme est **additif** sur `attendance_logs` (nullable, défaut
  NULL pour toute ligne existante/tout autre appelant qui n'envoie pas
  cet identifiant) — cohérent avec la discipline déjà appliquée sur ce
  projet pour toute extension de table partagée (voir
  `docs/ui/YELEN_HOTEL_SERVICES_V2_AUDIT.md` §F, même principe : zéro
  régression pour les appelants existants).

### États de la file locale

```
pending   → opération créée localement, pas encore envoyée
syncing   → envoi en cours (évite un double-envoi concurrent depuis
            la même file si le réseau revient pendant un cycle de retry)
synced    → confirmée par le serveur, id_operation reconnu, direction/
            horodatage définitifs reçus
failed    → échec définitif (ex. compte employé désactivé entre-temps,
            réponse 403 EMPLOYEE_INACTIVE déjà renvoyée aujourd'hui par
            la route, pointage/route.ts:33-35) — jamais retenté
            automatiquement, affiché à l'employé avec une action
            explicite
retry     → échec transitoire (timeout réseau, 5xx) — remis en file
            avec backoff, voir B.8
```

## B.5 — Stratégie de chiffrement et de gestion des clés

**Rejet explicite du modèle "PIN → clé de chiffrement de toute la base"**
demandé par le brief. Hiérarchie retenue :

```
Niveau 1 — Secure Enclave (iOS) / Android Keystore (Android)
  └─ Clé maîtresse matérielle, jamais exportable, jamais visible
     même par l'application elle-même (accès via API de signature/
     déchiffrement uniquement, jamais en lisant la clé brute)

Niveau 2 — Clé de chiffrement de la base (DEK, Data Encryption Key)
  └─ Générée aléatoirement à l'installation, stockée CHIFFRÉE par la
     clé de Niveau 1 (Keychain/Keystore protège la DEK, jamais les
     données elles-mêmes directement)
  └─ Le PIN citoyen (déjà existant, users.pin_hash côté serveur) reste
     un mécanisme de VÉRIFICATION D'IDENTITÉ LOCALE (déverrouiller
     l'app), jamais un matériau cryptographique — cohérent avec son
     usage actuel (vérification serveur bcrypt, jamais utilisé comme
     clé, confirmé par lecture du code existant)

Niveau 3 — Base SQLite chiffrée par la DEK
  └─ Chiffrement au repos de la base entière (ex. SQLCipher ou
     équivalent plateforme) — la DEK n'est jamais stockée en clair
     dans SQLite lui-même

Niveau 4 — Secrets individuels supplémentaires (tokens de session,
           documents KYC très sensibles)
  └─ Stockés directement en Keychain/Keystore (PAS dans SQLite, même
     chiffré) pour les éléments les plus critiques — tokens d'accès/
     rafraîchissement, jamais dans la base applicative
```

**Pourquoi cette séparation** : si la DEK (Niveau 2) devait un jour être
révoquée/changée (ex. compromission suspectée), il suffit de la
re-chiffrer sans devoir réécrire tout le contenu de la base avec une
nouvelle clé dérivée d'un PIN que l'utilisateur pourrait changer — le PIN
et la clé de chiffrement des données ne sont **jamais couplés**.

**Expiration/session** : la session native doit avoir sa propre durée de
vie côté Keychain/Keystore, indépendante de la présence ou non de
réseau — un token expiré reste inutilisable même hors ligne pour toute
opération qui nécessiterait une réautorisation serveur (cohérent avec
"ne jamais considérer une donnée locale comme une preuve de vérité
serveur", B.3).

**Suppression sécurisée** : à la déconnexion explicite ou à la
désinstallation, purge complète Niveau 2-4 (la DEK supprimée rend la base
chiffrée définitivement illisible, sans devoir écraser chaque ligne
individuellement — pattern standard "crypto-shredding").

## B.6 — Matrice offline/online complète (fonctionnalités Yelen)

| Fonction | Offline | Écriture locale | Serveur requis | Synchronisation |
|---|---|---|---|---|
| Mon profil (lecture) | Oui | — | Pour actualisation | Oui (pull) |
| Mon profil (modification) | Non | Brouillon local possible | Oui | Oui (push à la reconnexion) |
| Mes documents (consultation métadonnées) | Oui | — | Pour nouvelles données | Oui (pull) |
| Mes documents (téléchargement fichier) | Non (nécessite le réseau au moment du téléchargement) ; **consultation d'un fichier déjà téléchargé** : Oui | Oui, si téléchargé explicitement | Pour validation institution | Non (le fichier ne remonte jamais, seul le statut redescend) |
| Mon QR (affichage) | Oui, **après correction A.4** (génération d'image locale + payload déjà rafraîchi récemment) | Oui (cache du dernier payload valide) | Pour régénération après expiration (3h) | Oui |
| Score Yelen (`score_sante`, sous réserve A.7) | Dernière version connue, horodatée | Oui | Pour nouveau calcul | Oui (pull) |
| Pointage (Clock In Shift) | Oui | Oui (file d'attente) | Oui, pour validation/synchronisation définitive | Oui (push, idempotent) |
| Historique de pointage (lecture) | Oui | — | Pour nouvelles entrées | Oui (pull) |
| Nouveau RDV | Non (nécessite vérification de disponibilité serveur en temps réel) | Brouillon éventuel (présélection service/créneau) | Oui | Oui (push à la reconnexion, avec re-vérification serveur de la disponibilité — jamais garanti à l'avance) |
| Mes RDV (lecture) | Oui | — | Pour nouvelles données | Oui (pull) |
| Annuler/reporter un RDV | Non | Intention mise en file possible | Oui | Oui (push) |
| Vérification d'un QR par un tiers | Non pour la validité — le tiers doit interroger le serveur | — | Oui, toujours | — |
| Fiches d'institutions récemment consultées | Oui | Oui (cache) | Pour actualisation | Oui (pull) |
| Recherche d'institutions (nouvelle recherche) | Non | — | Oui | — |
| Notifications | Lecture de celles déjà reçues : Oui | Oui (cache) | Pour nouvelles notifications | Oui (push serveur→client natif, APNs/FCM) |

## B.7 — Le QR Yelen : affichage offline sans compromettre la vérification

Deux problèmes distincts à résoudre (voir A.4), traités séparément :

**1. Rendu de l'image** (problème indépendant d'offline vs online, à
corriger de toute façon) : remplacer l'appel à `api.qrserver.com` par une
génération **on-device**, dans les deux environnements (Web actuel ET
natif futur) — une bibliothèque de génération QR locale (ex. équivalent
de la librairie `qrcode` npm, ou son équivalent natif iOS/Android)
transforme n'importe quelle chaîne déjà en mémoire en image sans jamais
toucher le réseau.

**2. Le payload lui-même — proposition cryptographique** (répond
explicitement à la demande du brief "mécanisme cryptographique
permettant au QR de contenir une preuve/signature vérifiable, sans
transformer les données sensibles en données publiques") :

```
QR affiché = { citoyen_id_public (identifiant non sensible, PAS le
               vrai id interne),
               rdv_id ou confirmation_code,
               horodatage_emission,
               signature = HMAC-SHA256(payload, clé_serveur) }
```

- Le payload ne contient **aucune donnée personnelle sensible en clair**
  (pas de nom, téléphone, document) — seulement des identifiants
  opaques déjà utilisés côté serveur pour retrouver le contexte.
- La **signature** permet à un vérificateur de confirmer que le QR a
  bien été émis par Yelen, **sans appel réseau immédiat** — utile pour
  une vérification de premier niveau ("ce QR a une forme valide, il n'est
  pas fabriqué").
- **Mais** — distinction cruciale demandée par le brief — une signature
  valide ne prouve **jamais** que le RDV est toujours actif, non
  annulé, non déjà utilisé. **Toute vérification à enjeu réel (une
  banque, une entreprise, une administration) doit interroger le
  serveur** (`/api/qr/verify` déjà dans l'esprit de `/api/qr/generate`
  existant) pour confirmer le statut **actuel**. Le mécanisme
  cryptographique local sert à l'**affichage** et à une confiance de
  premier niveau, jamais à remplacer la vérification serveur pour un
  tiers qui a un enjeu réel — exactement la distinction demandée par le
  brief §7.
- Rotation/expiration : la fenêtre de validité (aujourd'hui 3h pour le
  flux gratuit) doit être **incluse dans le payload signé** (pas
  seulement stockée côté serveur), pour qu'un vérificateur hors-ligne
  de premier niveau puisse au moins rejeter un QR visiblement expiré
  sans appel réseau.

## B.8 — Stratégie de synchronisation

**Ne pas s'appuyer sur Background Sync Web** (déjà acquis, brief
confirmé — de toute façon jamais utilisé aujourd'hui, A.1). Mécanisme
natif à prévoir :

- **Détection réseau** : écoute native des changements de connectivité
  (équivalent `Reachability`/`ConnectivityManager`) — déclenche une
  tentative de synchronisation dès que le réseau redevient disponible,
  sans attendre une action utilisateur.
- **Synchronisation en arrière-plan quand l'OS l'autorise** : tâches
  différées natives (`BGTaskScheduler` iOS / `WorkManager` Android) pour
  vider la file même app fermée, dans les limites imposées par chaque
  OS (jamais garanti à un instant précis — les deux plateformes throttlent
  ce mécanisme, à documenter clairement pour ne jamais promettre une
  synchronisation "instantanée" en arrière-plan).
- **Reprise après fermeture/redémarrage** : la file (SQLite) survit par
  nature à un redémarrage — au premier lancement de l'app, un passage de
  purge tente de synchroniser toute opération encore `pending`/`retry`
  avant d'afficher l'écran principal (ou en tâche de fond non bloquante,
  à trancher en design UX).
- **Retry avec backoff** : délai croissant (ex. 5s, 15s, 1min, 5min,
  puis plafonné) par opération en échec transitoire, jamais une boucle
  serrée qui épuise la batterie/données mobiles.
- **Déduplication** : garantie par l'UUID d'opération (B.4) — un retry
  renvoie toujours le même UUID, le serveur ignore les doublons.
- **Gestion des conflits** : pour les données `local+synchronisation`
  autres que le pointage (ex. un brouillon de modification de profil
  fait hors ligne pendant qu'une institution modifie une donnée liée
  côté serveur) — stratégie par défaut **serveur gagne** (cohérent avec
  "le serveur reste l'autorité finale pour les données critiques", brief
  §5) ; le client réconcilie en réappliquant son intention par-dessus
  l'état serveur le plus récent seulement si l'opération est encore
  pertinente (ex. ne pas réappliquer une modification de profil si le
  champ a été modifié entre-temps par un autre appareil du même
  citoyen — cas rare, à couvrir par un avertissement explicite plutôt
  qu'un écrasement silencieux).
- **Journal de synchronisation** : chaque tentative (succès ou échec)
  loggée localement avec horodatage — utile pour le support ("pourquoi
  mon pointage de 8h n'est toujours pas synchronisé ?") sans dépendre
  d'un accès au serveur pour diagnostiquer.

## B.9 — Comportement après redémarrage du téléphone

La file de synchronisation (SQLite) est persistante par construction —
aucune opération `pending`/`retry` n'est perdue à un redémarrage. Au
prochain lancement de l'app : vérification de connectivité, tentative de
vidage de la file en tâche de fond, sans bloquer l'affichage de l'écran
principal (jamais un écran de chargement qui attend la fin de la
synchronisation pour être utilisable — cohérent avec le principe central
du brief : "Internet ne doit jamais être une condition pour utiliser les
fonctions personnelles déjà disponibles localement").

## B.10 — Comportement après plusieurs jours sans connexion

- Les caches locaux (profil, RDV déjà chargés, documents déjà
  téléchargés) restent affichables indéfiniment, mais **visuellement
  marqués comme potentiellement périmés** au-delà d'un seuil (ex. "Mis à
  jour il y a 4 jours") — jamais présentés comme temps réel sans cette
  indication.
- La file de pointages non synchronisés continue de s'accumuler
  localement, sans limite artificielle basse (un employé en zone
  blanche plusieurs jours ne doit jamais perdre un pointage) — seule
  limite réelle : l'espace de stockage disponible (voir B.11).
- Un QR affiché dont la fenêtre de validité (signature, B.7) a expiré
  doit se signaler clairement comme expiré à l'écran, avec une invite à
  se reconnecter pour régénérer — jamais un QR visuellement valide mais
  cryptographiquement expiré.
- Au retour réseau : synchronisation de la file dans l'**ordre
  chronologique de création** (pas l'ordre de retry), pour que
  l'historique reconstruit côté serveur respecte la séquence réelle des
  événements.

## B.11 — Comportement lorsque le stockage local est plein

- Priorité de purge (du moins critique au plus critique, jamais l'ordre
  inverse) : **caches** (fiches d'institutions récentes, documents déjà
  synchronisés dont le fichier binaire peut être re-téléchargé) purgés
  en premier ; **file d'attente de synchronisation** (pointages non
  encore confirmés) **jamais purgée automatiquement** — c'est une perte
  de preuve de travail réelle, inacceptable silencieusement.
- Si l'espace est insuffisant pour même écrire une nouvelle opération en
  file : l'app doit bloquer l'action avec un message explicite ("Espace
  de stockage insuffisant — libérez de l'espace pour continuer à
  pointer hors ligne") plutôt que d'échouer silencieusement ou de
  perdre l'intention de l'utilisateur.

## B.12 — Comportement lors d'une déconnexion pendant une synchronisation

- L'opération reste au statut `syncing` jusqu'à confirmation explicite
  du serveur — **jamais** marquée `synced` sur la base d'un simple envoi
  réseau réussi sans réponse confirmée (une requête peut partir sans que
  la réponse revienne).
- Au retour réseau, toute opération restée `syncing` au-delà d'un délai
  raisonnable (ex. 30s) est **re-tentée avec le même UUID** — sans
  risque de doublon grâce à l'idempotence serveur (B.4), que la première
  tentative ait ou non réellement atteint le serveur.

## B.13 — Stratégie Android

- Stockage sécurisé : **Android Keystore** pour la DEK et les tokens de
  session (B.5).
- Base locale : SQLite (nativement disponible), chiffrée (SQLCipher ou
  équivalent Android supportant le Keystore).
- Synchronisation en arrière-plan : **WorkManager** (API recommandée
  Google pour du travail différé fiable, survit au redémarrage de l'app
  et, selon contraintes, du téléphone).
- Détection réseau : `ConnectivityManager` / `NetworkCallback`.
- Notifications : Firebase Cloud Messaging (FCM) — mécanisme
  complètement distinct du service worker Web actuel (A.6), aucune
  réutilisation possible ni nécessaire.

## B.14 — Stratégie iOS

- Stockage sécurisé : **Keychain Services**, avec **Secure Enclave**
  pour la protection matérielle de la clé maîtresse quand le device le
  supporte (accès biométrique Face ID/Touch ID en option pour déverrouiller
  la session, cohérent avec le WebAuthn déjà existant côté citoyen web —
  CLAUDE.md `/chantier-securite-citoyen`, "WebAuthn réel côté serveur" —
  **principe transposable**, pas le même mécanisme technique).
- Base locale : SQLite, chiffrée (SQLCipher ou équivalent iOS).
- Synchronisation en arrière-plan : **BGTaskScheduler** (`BGAppRefreshTask`/
  `BGProcessingTask`), avec les mêmes réserves que B.8 sur le
  non-déterminisme du déclenchement.
- Détection réseau : `NWPathMonitor`.
- Notifications : Apple Push Notification service (APNs).

## B.15 — Impact sur l'architecture serveur

Changements côté serveur nécessaires pour supporter cette architecture
(aucun codé dans cette mission, à traiter comme un chantier séparé
après validation de ce document) :

1. **Idempotence par identifiant d'opération** sur au moins
   `attendance_logs` en priorité (B.4), généralisable ensuite à toute
   autre écriture "local+synchronisation" future.
2. **Authentification par token porté en en-tête** (au lieu du cookie
   httpOnly actuel pour institution/admin/employé) pour tout client
   natif — un client mobile ne gère pas les cookies comme un navigateur.
   Ne casse rien côté Web existant (cookie et header peuvent coexister,
   la route vérifie l'un ou l'autre).
3. **Endpoint de vérification QR pour tiers** (`/api/qr/verify`, B.7) —
   nouveau, distinct de la génération existante.
4. **Endpoints de synchronisation par lot** (idéalement) — recevoir
   plusieurs opérations en file en une seule requête au retour réseau,
   plutôt qu'un aller-retour par opération (optimisation réseau mobile,
   pas strictement nécessaire au MVP offline mais recommandée).
5. **Aucun changement** aux règles RLS/service_role déjà en place — le
   modèle d'autorité serveur ne change pas, seul le **transport** de
   l'authentification évolue pour le natif.

## B.16 — Plan de migration de la PWA actuelle vers le natif

**Principe directeur** : ne pas jeter ce qui fonctionne déjà. D'après
A.6, la logique métier (routes API + composants côté client) est déjà
largement réutilisable en **spécification** (contrats d'API, règles
métier déterministes dans `lib/*.ts`), même si son **implémentation**
(React/Next.js) ne l'est pas directement dans un client natif.

| Étape | Contenu | Statut |
|---|---|---|
| 1 | Validation de ce document par le CEO | En attente |
| 2 | Correction des 2 dépendances QR (A.4) — bénéficie **immédiatement** à la PWA actuelle, indépendamment du natif | Chantier séparé, priorité haute (dette identifiée, faible effort) |
| 3 | Ajout de l'idempotence serveur (B.15.1) sur `attendance_logs` | Chantier séparé — bénéficie à la PWA actuelle aussi (retry réseau déjà possible même en Web) |
| 4 | Authentification par header en plus du cookie (B.15.2) | Chantier séparé, additif, zéro régression Web |
| 5 | Choix du framework natif (React Native/Flutter/natif pur) — **hors périmètre de ce document** | Décision séparée à prendre |
| 6 | Implémentation du coffre local SQLite + hiérarchie de clés (B.5) sur l'app native | Développement natif |
| 7 | Implémentation de la file de synchronisation générique (B.8) | Développement natif |
| 8 | Pointage offline Clock In Shift (cas d'usage n°1) comme premier module natif complet | Développement natif, priorité brief |
| 9 | Extension progressive aux autres modules (profil, documents, QR, RDV) selon la matrice B.6 | Développement natif, itératif |
| 10 | La PWA Web actuelle **continue d'exister** pour les institutions (Web confirmé) — aucune obligation de "l'éteindre", elle reste la cible pour ce public | Continu |

**Ce qui ne doit surtout pas être fait maintenant** (rappel explicite du
brief, §9) : réécrire le code Web existant "parce que la cible est
native" sans besoin immédiat — les étapes 2-4 ci-dessus sont les seules
recommandées **avant** la décision de framework natif, parce qu'elles
sont des corrections de dette réelle indépendantes du choix technique
final et bénéficient à la PWA actuelle dès maintenant.

## B.17 — Risques de sécurité

1. **Coffre local mal chiffré** (rejet du modèle PIN→clé, déjà traité en
   B.5) — risque : extraction de la base sur un device rooté/jailbreaké
   révélerait des données personnelles en clair. Mitigé par la
   hiérarchie de clés B.5.
2. **File de synchronisation comme vecteur de rejeu** — un attaquant
   avec accès physique au device pourrait tenter de rejouer une
   opération en attente. Mitigé par l'authentification (token expiré =
   rejet serveur) et l'idempotence (rejeu = no-op, jamais une seconde
   écriture).
3. **QR affiché hors ligne présenté comme "vérifié"** — risque produit
   majeur si mal communiqué à l'utilisateur/aux tiers : un QR valide
   cryptographiquement (signature correcte) mais dont le statut réel a
   changé côté serveur (RDV annulé entre-temps) pourrait être perçu à
   tort comme "confirmé". Mitigé par la distinction stricte B.7 (signature
   ≠ statut actuel) — **nécessite une communication produit explicite**,
   pas seulement un contrôle technique.
4. **Documents KYC en cache local** — le risque le plus élevé de toute
   cette architecture (pièces d'identité sur un device qui peut être
   volé/perdu). Mitigé par une politique de rétention volontairement
   restrictive (téléchargement à la demande, purge automatique après un
   délai court — **paramètre à définir avec Bryan**, pas de valeur
   inventée ici).
5. **Corruption de la file de synchronisation** (crash pendant une
   écriture SQLite) — mitigé par les transactions ACID natives de
   SQLite (déjà une garantie du moteur, pas un mécanisme à construire).
6. **Divergence entre plusieurs devices du même citoyen** — un citoyen
   connecté sur 2 téléphones pourrait accumuler des files de
   synchronisation divergentes. Le pointage (B.4) est intrinsèquement
   protégé par l'idempotence + la déduction serveur de la direction ;
   les autres cas (brouillon de profil) suivent la règle "serveur
   gagne" (B.8).

## B.18 — Plan de tests offline

Scénarios minimaux à couvrir avant toute mise en production du module
offline (Clock In Shift en priorité, brief §4) :

1. Pointer en mode avion → vérifier l'affichage immédiat "en attente" →
   réactiver le réseau → vérifier la synchronisation et la direction
   (entrée/sortie) correcte.
2. Pointer deux fois rapidement en mode avion (simulateur de double-tap)
   → vérifier qu'un seul pointage est finalement synchronisé (test direct
   de l'idempotence, B.4).
3. Couper le réseau **pendant** l'envoi d'une synchronisation (après
   l'insert serveur mais avant la réponse reçue par le client) → vérifier
   qu'un retry ne crée pas de doublon (test de B.12).
4. Forcer un redémarrage de l'app avec une file `pending` non vide →
   vérifier la reprise automatique au relancement (B.9).
5. Simuler plusieurs jours hors ligne (horloge système avancée +
   accumulation d'opérations) → vérifier l'absence de perte, l'ordre
   chronologique de synchronisation au retour réseau (B.10).
6. Remplir artificiellement le stockage local → vérifier le comportement
   de purge (caches d'abord, jamais la file de sync) et le message
   explicite si la file elle-même ne peut plus écrire (B.11).
7. Afficher un QR, couper le réseau, attendre l'expiration de la
   fenêtre de validité → vérifier l'état "expiré" affiché correctement
   sans réseau (B.7/B.10).
8. Tenter une vérification QR côté tiers pendant que le citoyen est hors
   ligne → vérifier que le tiers ne peut confirmer que via un appel
   serveur réel, jamais via une donnée locale du citoyen (B.7).
9. Compte employé désactivé côté serveur pendant qu'un pointage est en
   file `pending` sur son téléphone → vérifier que la synchronisation
   échoue proprement en `failed` (403 EMPLOYEE_INACTIVE déjà géré
   aujourd'hui côté serveur, pointage/route.ts:33-35) sans boucle de
   retry infinie.
10. Test de charge locale : plusieurs centaines d'opérations en file
    (simulateur d'un employé plusieurs semaines hors ligne) → vérifier
    que la synchronisation par lot (si implémentée, B.15.4) ne dégrade
    pas les performances de l'app au retour réseau.

---

## Décisions à trancher avant tout développement (récapitulatif)

1. **A.7** — Le "Score Yelen" du brief est-il `score_sante` (déjà
   existant, calcul client jamais persisté) ou une future brique "Yelen
   Trust" pas encore construite ? Ce document part de l'hypothèse la
   plus sûre (`score_sante`) mais **cette hypothèse doit être confirmée**.
2. **B.4** — Confirmer l'UX exacte du pointage optimiste : affichage
   générique "Pointage enregistré" (recommandé) vs estimation locale de
   la direction avec badge "à confirmer".
3. **B.5** — Framework de chiffrement SQLite précis (SQLCipher ou
   équivalent) et durée de rétention exacte des documents KYC en cache
   local — paramètres à définir avec Bryan, aucune valeur inventée ici.
4. **B.16** — Choix du framework natif (React Native/Flutter/natif pur
   par plateforme) — hors périmètre de ce document, mais bloquant pour
   le développement réel.
5. **B.15.1-2** — Valider les 2 changements serveur additifs
   (idempotence, auth par header) comme un chantier serveur séparé,
   avant tout développement natif client.

**Aucun code applicatif, aucune migration, aucun commit n'a été effectué
pendant cette mission — document de conception uniquement, en attente de
validation CEO.**
