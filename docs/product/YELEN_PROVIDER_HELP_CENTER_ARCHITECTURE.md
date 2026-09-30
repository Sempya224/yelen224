# Yelen Provider Help Center — Architecture (Phase D)

Document de conception, pas de contenu. Aucun article, aucun texte
destiné au prestataire, aucun changement de code dans ce document.
S'appuie entièrement sur l'audit `docs/product/YELEN_PROVIDER_HELP_CENTER_AUDIT.md`
(Phases A, B1-B3, C, validées) — toute référence à un pattern (P),
une connaissance transverse (T), un problème UX (UX) ou un besoin issu
du support réel (B3-x) pointe vers ce document, jamais réexpliquée en
détail ici.

**Statut : PHASE E — vertical slice Signalements accepté, E.1/E.2/E.2.1
closes (21/09/2026, détail section 12). Architecture confirmée par une
implémentation réelle. B3-1 suspendu (pas rejeté) suite à la
découverte d'UX6, hors périmètre Help Center. Généralisation aux 7
autres domaines non engagée — prochain lot à choisir parmi T1+T2, T11,
T5 sur preuve (matrice C), sélection en attente de Bryan.**

---

## 1. Périmètre utilisateur

**Provider Help Center = aide destinée aux prestataires (institutions)
Yelen.** Distinct et sans lien de contenu avec un futur Help Center
citoyen (hors périmètre, jamais mentionné comme un chantier engagé —
audit Phase 1, portée explicitement limitée aux institutions).

- **Population couverte, confirmée** : les 5 rôles `institution_membres`
  (`admin`/`agent`/`comptable`/`superviseur`/`dirigeant`,
  `lib/institutionPermissions.ts`, audité Domaine 1) — chacun avec un
  accès réel différent aux 47 écrans (`TAB_MATRIX`), donc potentiellement
  à des besoins d'aide différents sur les mêmes sujets (ex. un
  `comptable` ne voit jamais `valider-rdv`, un `agent` ne voit jamais
  `paiements`).
- **Clock In Shift — vérifié dans le code réel, décision recommandée** :
  le portail employé (`app/clock/[slug]/page.tsx`, population
  `employees`, auth séparée `lib/employeeAuth.ts`, Domaine 5) **reste
  hors périmètre du Provider Help Center**. Vérification faite plutôt
  que supposée : (1) les employés n'ont ni `institution_membres`, ni
  rôle RBAC, ni accès à aucun `TabKey` — toute l'architecture ci-dessous
  (contextualisation par `TabKey`, section 5 ; audience par rôle,
  section 2bis) est construite sur des identifiants qui n'existent
  simplement pas pour cette population ; (2) le seul lien "Aide"
  trouvé dans tout `app/clock/**` (`page.tsx:481`, écran de connexion
  uniquement) pointe vers `/contact`, la page de contact publique
  générique — **aucun lien vers Support Yelen, aucune intégration avec
  le ticketing institution**. Le portail est aujourd'hui isolé du
  système d'aide du dashboard, pas juste "non encore connecté".
  **La gestion de Clock In Shift côté institution** (écran
  `ClockInShiftTab.tsx`, `TabKey: "clock-in-shift"`, Domaine 5) reste
  en revanche pleinement dans le périmètre — c'est un module comme un
  autre pour les `institution_membres`, seul le portail employé
  lui-même est exclu. Si un jour une aide employé est jugée nécessaire,
  ce sera un système séparé (pas une extension de celui-ci), cohérent
  avec la séparation de population déjà actée au Domaine 5.
- **Aucun contenu citoyen hérité ou réutilisé par automatisme** — même
  si un futur Help Center citoyen existe un jour, aucune structure ni
  aucun contenu de ce document ne doit être partagé sans décision
  explicite séparée (cohérent avec CLAUDE.md `/separation-projets`,
  qui pose le même principe entre projets Yelen224/Youngouser — même
  logique appliquée ici entre populations citoyen/prestataire).

---

## 2. Principes directeurs (invariants, non négociables sans revalidation)

Ces principes sont déjà établis par les Phases A-C — rappelés ici
comme contraintes de conception, pas comme nouveauté :

1. **Zéro donnée inventée.** Confirmé comme discipline architecturale
   du produit lui-même (Domaine 8, composant partagé `ChampBientot`/
   `SectionBientot`) — s'applique identiquement au contenu du Help
   Center : aucun délai, aucune règle, aucune procédure n'est publiée
   sans preuve réelle (code, donnée observée, ou explicitement marquée
   provisoire).
2. **4 niveaux, jamais confondus** (posé Domaine 4, confirmé stable
   depuis) : aide contextuelle → article → connaissance transverse →
   support humain. Le Help Center n'est **pas** une interface qui
   remplace ou duplique le produit — il le complète aux endroits
   précis où le produit seul ne suffit pas.
3. **Généraliser avant d'inventer.** Confirmé Phase C : la majorité
   des besoins identifiés se résolvent en étendant des patterns déjà
   réels (P5, P8, P15, P16...) plutôt qu'en construisant un système
   d'aide étranger au produit.
4. **UX ≠ contenu.** Un problème classé UX (registre UX1-UX5) ne
   devient jamais un article — il reste un ticket produit, même si un
   palliatif temporaire côté contenu est envisageable en attendant une
   correction (ex. UX2, convention de nommage).
5. **Alimenté en continu, jamais figé.** Le corpus support réel
   (Phase B) est aujourd'hui minuscule (1 ticket, 4 signalements) — le
   système doit être conçu pour être révisé au fil de l'eau à mesure
   que le volume réel grandit, pas verrouillé sur cette photographie
   initiale.
6. **Rattaché au produit réel, jamais orphelin.** Chaque connaissance
   publiée doit pouvoir être reliée à un écran, une route, une règle
   ou un comportement identifiable (D8) — c'est la règle fondatrice de
   l'audit lui-même, elle continue de s'appliquer une fois le contenu
   écrit, pas seulement pendant l'audit.
7. **Règle de routage officielle (garde-fou le plus important du
   chantier)** — appliquée en continu, pas seulement pendant cet audit :

   | Nature du problème | Destination |
   |---|---|
   | Code/UX incorrect ou ambigu | Backlog produit (jamais un article) |
   | Produit correct mais incompris | Aide contextuelle (niveau 1) |
   | Règle complexe traversant plusieurs écrans | Connaissance transverse / article (niveaux 2-3) |
   | Cas individuel nécessitant une intervention/décision | Support humain (niveau 4) |

   Toute nouvelle classification (section 7, gouvernance) doit passer
   par ce tableau avant de produire du contenu — si la case est
   "backlog produit", le circuit s'arrête là (voir aussi section 10).
8. **Un pattern UX est une primitive de présentation, jamais une
   preuve de comportement métier** (découvert Phase E, vertical slice
   Signalements, section 12.2 — vient préciser le principe 3, pas le
   contredire : "généraliser" veut dire réutiliser la *forme*, jamais
   copier le *texte* tel quel). Avant de réutiliser un pattern déjà
   enregistré (P1-P16) dans un nouveau domaine, vérifier dans le code
   réel de ce domaine, dans cet ordre :

   **qui agit → sur quoi → dans quel état → quelles transitions
   existent réellement → quelle prochaine étape est réellement
   possible pour cet acteur.**

   Puis réécrire le contenu à partir de ces preuves, et vérifier que le
   texte final ne promet à l'utilisateur aucune action qu'il ne peut
   pas réellement effectuer. Exemple fondateur : `STATUT_INFO.
   prochaineEtape` (Communauté Pro, P8) suppose que l'institution est
   l'actrice de sa propre transition — transposé tel quel sur
   Signalements, il aurait affirmé une capacité que l'institution n'a
   pas (la transition de statut n'y est pilotée que par l'équipe Yelen,
   `lib/signalements.ts::changerStatut` n'étant appelé que depuis
   `app/api/admin/signalements-cas/**`).

---

## 2bis. Audience documentaire (visibilité du contenu)

**Principe posé ici, aucune règle de contenu concrète décidée.** Les 5
rôles `institution_membres` confirmés (section 1) n'ont pas tous accès
aux mêmes écrans (`TAB_MATRIX`, Domaine 1) — un contenu qui suppose un
accès que le lecteur n'a pas serait trompeur (ex. expliquer une action
`paiements.rembourser` à un `agent` qui ne verra jamais cet écran).
L'audience documentaire doit donc être une propriété du contenu, avec
4 granularités possibles — **aucune tranchée en détail ici, seulement
la nécessité de la distinction** :

- **`all_provider_members`** — contenu valable pour les 5 rôles sans
  restriction (ex. Support Yelen, Domaine 4/8.1, déjà ouvert aux 5
  rôles dans `TAB_MATRIX`).
- **`role-specific`** — contenu qui ne concerne réellement qu'un ou
  plusieurs rôles précis (ex. tout ce qui touche `paiements`/
  `facturation`, pertinent pour `admin`/`comptable`, pas pour `agent`).
- **`permission-specific`** — plus fin que le rôle de base : les rôles
  personnalisés existent déjà dans le produit (`acces_restreints`,
  `DOMAINE_KEYS`, Domaine 1/5) — un contenu pourrait en théorie suivre
  cette même granularité si elle s'avère nécessaire, sans qu'il soit
  décidé ici qu'elle le sera dès la V1.
- **`institution-type-specific`** — le secteur/l'activité de
  l'institution change déjà l'écran affiché pour un même `TabKey` (ex.
  gating hôtel sur `disponibilites`/`services`/`configuration-hotel`,
  Domaines 1 et 3) — un contenu lié à ces écrans devrait hériter du
  même filtrage, pour ne jamais montrer un contenu hôtel à un hôpital
  ou l'inverse.

**Réutilisation recommandée** : les identifiants d'audience n'ont pas
besoin d'être inventés — `MembreRole`, `DomaineKey` et le code secteur
(`activite_principale_code`) existent déjà et sont déjà la source de
vérité du RBAC produit (`lib/institutionPermissions.ts`, Domaine 1).
Faire porter l'audience documentaire par ces mêmes identifiants évite
une seconde source de vérité pour "qui peut voir quoi" — cohérent avec
la même logique déjà appliquée au `TabKey` pour la contextualisation
(section 5).

---

## 3. Architecture de l'aide — 4 niveaux et leur articulation

### 3.1 Aide contextuelle (dans l'écran)

Réponse courte, au moment précis où le prestataire bloque ou hésite.
**Déjà largement pratiquée dans le produit** — le registre de patterns
(P1-P16, audit) est la preuve que ce niveau n'est pas à inventer mais à
généraliser. Voir 5 (primitives réutilisables).

### 3.2 Article (Help Center)

Explication ou procédure complète, consultable indépendamment de
l'écran d'origine — pour ce qui ne peut raisonnablement pas tenir dans
une info-bulle ou un court texte contextuel. **Absent aujourd'hui**
(ancien `guide-prestataire` retiré, jamais repris comme source — audit
1.7). Premier niveau réellement nouveau à construire.

### 3.3 Connaissance transverse

Règle ou concept qui traverse plusieurs écrans/domaines (registre T) —
ne "vit" naturellement sur aucun écran en particulier. Peut être
publiée comme un article un peu particulier (accessible depuis
plusieurs points de contextualisation, D4) plutôt que comme un type de
contenu technique séparé — **décision d'implémentation reportée à la
Phase E**, ce document se contente de reconnaître que T1/T2/T9/T12 (par
exemple) ont ce besoin de rattachement multiple, contrairement à un
article classique rattaché à un seul écran.

### 3.4 Support humain

**Déjà un vrai système du produit** (`SupportYelenTab`, ticketing
institution, Domaine 4/8.1) — **pas à reconstruire**. Le Help Center
s'articule avec lui dans un seul sens net : quand les 3 premiers
niveaux ne suffisent pas, le chemin vers le support humain doit rester
visible et rapide (déjà le cas, popover "Aide Yelen" du header,
Domaine 1) — l'architecture ci-dessous ne change rien à ce mécanisme,
elle ajoute seulement des étages **avant** lui.

### Articulation entre les 4 niveaux

```
Écran Yelen (contexte réel : TabKey, rôle, état)
   │
   ├─→ Aide contextuelle courte (si suffisant) ────────── FIN
   │
   ├─→ "En savoir plus" → Article ou Connaissance transverse
   │        │
   │        └─→ toujours un chemin visible vers le Support humain
   │
   └─→ Support humain directement (si le prestataire saute l'étape aide)
```

Aucun niveau n'est obligatoire avant le suivant — un prestataire peut
toujours aller directement au support humain (déjà vrai aujourd'hui,
popover header). L'objectif des niveaux 1-3 est de **réduire le besoin
d'atteindre le niveau 4**, jamais de le retarder artificiellement.

---

## 4. Navigation

**Proposition, pas une structure imposée** — l'audit donne un signal
plus fort que le générique "Accueil → recherche → domaines → sujets →
article" : les **8 domaines fonctionnels réels** (Accueil &
configuration, Rendez-vous & clients, Services & offres, Communication
& réputation, Équipe & organisation, Sécurité & conformité, Finance,
Yelen Business — audit 2.1) sont déjà la structure mentale que le
produit lui-même utilise pour s'organiser (dashboard, nav, programme
Product Hardening — CLAUDE.md `/programme-hardening`, même liste vue
sous l'angle UX). Les recopier comme catégories de premier niveau du
Help Center n'est pas "recopier l'organisation interne du code" au
sens négatif — c'est aligner le Help Center sur une organisation déjà
familière au prestataire, puisqu'il navigue déjà le dashboard suivant
ces mêmes 8 domaines au quotidien.

**Nuance nécessaire (conforme à la consigne D3)** : cette structure par
domaine convient à la **navigation par exploration** (un prestataire
qui parcourt), pas nécessairement à la **recherche par intention** (un
prestataire qui tape une question). Les deux entrées doivent coexister :

- **Navigation** : Accueil Help Center → 8 domaines → sujets/écrans du
  domaine → article/connaissance liée.
- **Recherche** : point d'entrée unique par question, sans passer par
  la hiérarchie de domaines (voir 6).

**Ce qui reste non tranché ici** : la granularité entre "domaine" et
"sujet" (47 `TabKey` est-il le bon niveau de "sujet", ou trop fin pour
certains domaines à 10 écrans comme Finance/Yelen Business ?) —
décision de contenu, pas d'architecture, reportée à la Phase E quand
les premiers sujets réels seront rédigés.

---

## 5. Contextualisation — comment un écran Yelen ouvre de l'aide

**Principe** : réutiliser un identifiant déjà stable du produit plutôt
qu'inventer une nouvelle taxonomie de rattachement. Le candidat naturel
est le **`TabKey`** (47 valeurs, `lib/institutionPermissions.ts`,
source unique déjà utilisée pour le RBAC) — chaque écran du dashboard
en porte déjà un, de façon stable et déjà maintenue.

**Modèle conceptuel** (pas un schéma de base de données) :

```
TabKey (ex. "signalements")
   → 0..n aides contextuelles (ancrées à un composant/état précis)
   → 0..n articles liés
   → 0..n connaissances transverses liées (ex. T12 liée à signalements,
     documents-clients ET support — plusieurs TabKey pointent vers la
     même connaissance, jamais dupliquée)
```

**Ce que le contexte produit disponible permet d'éviter au
prestataire** — déjà des données réelles à exploiter, pas à inventer :
rôle courant (`membreRole`), statut de l'écran (ex. `SignalementStatut`,
`DocumentStatut` — T12), secteur de l'institution (gating hôtel déjà
utilisé Domaine 1/3), état du Setup Center (Domaine 1). Un futur
mécanisme de contextualisation peut s'appuyer sur ces données déjà
présentes pour éviter qu'un prestataire reformule un contexte que le
produit connaît déjà (ex. ne pas proposer un article "Configuration
Hôtel" à une institution qui n'est pas du secteur hôtelier).

**Cas à traiter explicitement** : les connaissances transverses (T)
n'ont pas un seul `TabKey` d'ancrage — T9 (canaux de communication)
concerne 4 écrans (Questions clients, Messagerie, Avis, Signalements),
T12 (machines à états) en concerne 3. Le modèle de rattachement doit
donc permettre **plusieurs `TabKey` par connaissance**, pas une relation
1-vers-1.

---

## 6. Recherche — exigences fonctionnelles (pas d'implémentation)

- **Recherche par question/intention**, pas seulement par mot-clé
  technique — un prestataire tape "pourquoi mon compte est bloqué",
  pas nécessairement "réauthentification" (vocabulaire du produit,
  T3).
- **Terminologie Yelen**, pas générique — les mots réels du produit
  (ex. "Litiges", "Badge QR", "Espace de travail") doivent être
  indexés tels quels, y compris quand ils sont ambigus dans l'absolu
  (T10, 3 systèmes "QR").
- **Synonymes** là où le vocabulaire produit diverge du vocabulaire
  naturel d'un prestataire (à documenter au fil des premiers vrais
  usages de recherche, pas à deviner maintenant).
- **Résultats contextuels** — un résultat de recherche devrait pouvoir
  tenir compte de l'écran d'où la recherche a été lancée (même
  mécanisme que la contextualisation, section 5) sans l'imposer comme
  seul filtre.
- **Lien explicite entre l'écran courant et les résultats** — cohérent
  avec le principe de contextualisation (section 5), pas une recherche
  isolée du reste du produit.
- **Absence de résultat, traitée explicitement** — jamais un écran vide
  silencieux (cohérent avec le principe déjà pratiqué ailleurs dans le
  produit, empty states conçus — P1/P9).

**Ce qui n'existe pas encore et ne doit pas être simulé** : aucun
tracking de recherche côté institution aujourd'hui (confirmé absent,
audit 8.1 — seul `recherches_populaires` existe, exclusivement côté
citoyen). Les **recherches sans résultat et sans clic** deviendront un
vrai signal de lacune documentaire, mais **seulement une fois le Help
Center en production** — ce n'est pas une donnée à réintégrer
rétroactivement dans le corpus actuel, c'est un mécanisme à prévoir
structurellement (ex. logger la requête + le résultat cliqué ou non
dès la conception) pour ne pas avoir à le rajouter après coup.

---

## 7. Gouvernance

### Rôles conceptuels (pas des personnes assignées)

```
Owner → Auteur → Reviewer → Validation technique → Publication → Maintenance
```

**Réalité actuelle du projet** (CLAUDE.md — Bryan, seul développeur,
product owner) : ces rôles se superposent aujourd'hui sur une seule
personne. Les nommer séparément malgré tout sert un objectif précis :
permettre au système de **scaler sans redesign** si une équipe support/
contenu apparaît plus tard — pas une bureaucratie à appliquer dès la
V1.

### Boucle Support → Knowledge Base (besoin confirmé, Phase C.6)

Constat déjà posé : **aucun mécanisme aujourd'hui** ne permet à un
agent (console Support Yelen, `app/admin/support/page.tsx`, ou
signalements-cas, `app/admin/moderation/page.tsx`) de signaler qu'un
cas révèle un besoin de contenu. L'architecture doit prévoir la
**capacité conceptuelle** de qualifier un ticket/signalement traité
comme :

- **nouveau contenu nécessaire** ;
- **contenu existant incorrect** ;
- **contenu existant obsolète** ;
- **contenu manquant identifié mais non qualifiable immédiatement**.

**Non conçu ici** : l'interface de ce signalement, son stockage, son
workflow de traitement. Seule la nécessité fonctionnelle est actée.

### Revue technique avant publication

Toute connaissance publiée (article, connaissance transverse) doit
être vérifiable contre le produit réel avant publication — cohérent
avec la méthode entière de cet audit (citation systématique de
fichier/route/table). La forme de cette revue (checklist, outil,
processus) est une décision de Phase E, pas de ce document.

---

## 8. Relation avec le code réel — éviter la dérive documentaire

**Motivation concrète, déjà observée dans le produit lui-même**
(Domaine 8) : le commentaire d'en-tête de `layout.tsx` sur l'état de
la section Yelen Business est resté faux après que 8 des 9 écrans ont
été construits — preuve que **même la documentation interne au code
peut devenir fausse sans mécanisme de détection**. Un Help Center
hériterait du même risque, en pire (le lecteur n'est pas un
développeur qui peut recouper avec le code source).

**Modèle conceptuel de rattachement** (pas un schéma de base de
données) :

```
Connaissance publiée
   → Source de vérité (fichier/route/table réel, comme cité dans cet audit)
   → Contenu (le texte lui-même)
   → Dernière vérification (date + éventuellement commit/version)
   → Propriétaire (qui a écrit/validé en dernier)
   → Statut (voir section 9)
```

**Ancrage recommandé** : réutiliser les identifiants déjà stables du
produit (`TabKey`, `ActionKey`, noms de tables/colonnes réels) comme
référence de la "source de vérité", plutôt qu'une description libre —
cohérent avec la discipline de citation déjà pratiquée dans tout ce
chantier d'audit. Un changement de code touchant un `TabKey` ou une
`ActionKey` référencée devient alors un signal factuel de révision
nécessaire, pas une supposition.

---

## 9. États du contenu (cycle de vie)

États conceptuels complets, tels que demandés :

```
Brouillon → En revue → Validé → Publié → À revoir → Archivé
```

**Recommandation, pas une obligation immédiate** : dans le contexte
actuel (un seul auteur/reviewer réel), les états "En revue" et
"Validé" comme étapes *séparées* et *outillées* n'apportent probablement
rien tant qu'il n'y a qu'une seule personne des deux côtés — un chemin
simplifié `Brouillon → Publié → À revoir → Archivé` couvrirait le même
besoin réel aujourd'hui, en gardant "En revue"/"Validé" comme des
états **conceptuellement prévus** dans le modèle pour ne pas devoir le
redessiner si une deuxième personne rejoint un jour la revue de
contenu. **Décision finale reportée à la Phase E**, ce document expose
seulement l'arbitrage.

"À revoir" est l'état le plus directement issu de la section 8 — un
contenu dont la source de vérité a changé (détecté ou signalé) bascule
ici avant d'être re-publié ou archivé, jamais silencieusement laissé
tel quel.

---

## 10. Séparation stricte UX / Help Center

**Règle simple, déjà appliquée dans la matrice de décision (Phase C)** :
un besoin classé dans le registre UX (UX1-UX5) **ne produit jamais de
contenu Help Center** — il reste dans le backlog produit. Exemple déjà
tranché : UX5 (`yelen-support` sans rendu) est un bug à corriger, pas
un sujet à expliquer.

**Mécanisme de garde proposé pour la gouvernance (section 7)** : avant
qu'un besoin identifié (via le corpus support réel ou un futur signal)
ne devienne du contenu, il doit d'abord être classé selon la même
grille que la Phase C (P/T/UX/M/À VÉRIFIER) — **si la classification
aboutit à UX, le circuit s'arrête là et redirige vers le backlog
produit**, il ne continue jamais vers un brouillon d'article. Ce
garde-fou doit rester actif en continu, pas seulement pendant cet
audit ponctuel.

---

## 11. Ce que ce document ne tranche pas (explicitement reporté)

- ~~Portée employé (Clock In Shift)~~ — **résolu** (section 1) : hors
  périmètre, vérifié dans le code réel, pas seulement supposé.
- Granularité exacte domaine/sujet dans la navigation — section 4, **à
  tester avec le premier lot réel** (Bryan, revue critique : vérifier
  si un prestataire pense réellement dans ces 8 catégories).
- Où "vivent" exactement les connaissances transverses multi-écrans —
  section 3.3 (le principe TabKey ≠ Knowledge ID, plusieurs TabKey par
  connaissance, est acté — pas encore l'implémentation).
- Granularité concrète de l'audience documentaire (quels contenus
  exacts dans quelle case `role-specific`/`permission-specific`/
  `institution-type-specific`) — section 2bis, principe posé, aucune
  règle de contenu décidée.
- États du contenu simplifiés vs complets — section 9.
- Toute question de CMS, stockage, interface d'administration,
  technologie de recherche — hors périmètre de ce document par
  construction (architecture fonctionnelle/informationnelle
  uniquement, pas technique).
- Le contenu du premier lot réel (quels articles, dans quel ordre) —
  Phase E, après validation finale de cette architecture.

## 12. Phase E — Vertical slice (Signalements) : preuve par l'implémentation

Architecture validée en théorie (Phase D) puis **testée dans le code
réel** (21/09/2026) sur un seul domaine (Signalements, Domaine 6),
choisi parce qu'il concentre les deux besoins à plus haute preuve de
toute la matrice C (B3-1 et T12, niveau PR3). 3 fichiers modifiés
(`ReauthModal.tsx`, `SecuriteCompteTab.tsx`, `SignalementsTab.tsx`),
4 checkpoints `tsc --noEmit` propres. Détail des changements dans
l'historique de conversation du chantier — ce document ne reproduit
pas le diff, seulement ce que l'implémentation confirme sur
l'architecture elle-même.

### 12.1 Phase E.1 — Revue de réutilisabilité (aucun nouveau code)

| # | Point | Statut | Preuve issue du vertical slice |
|---|---|---|---|
| 1 | Réutilisation de `ReauthModal` contextualisé | **Démontré** | `reason?: string` optionnel, comportement identique si absent, composant resté agnostique de la logique métier (le caller — `SecuriteCompteTab.tsx` — fournit le texte) |
| 2 | Pattern `prochaineEtape` | **Démontré** | Transposé de `CommunauteProTab.tsx::STATUT_INFO` vers `SIGNALEMENT_PROCHAINE_ETAPE`, mais **pas copié mécaniquement** : à la différence de Communauté Pro (l'institution est l'actrice de sa propre transition), Signalements a exigé une réécriture des 8 phrases en registre passif, parce que la transition de statut n'est jamais pilotée par l'institution (`lib/signalements.ts::changerStatut` n'est appelé que depuis `app/api/admin/signalements-cas/**`) — la généralisation du pattern demande donc de vérifier *qui déclenche la transition* avant d'écrire le texte, pas seulement de rebrancher le même mapping |
| 3 | Relation `TabKey → contenu` | **Démontré** | Le point d'accès à T9 et le `prochaineEtape` vivent tous deux dans `SignalementsTab.tsx`, contextualisés au `TabKey` `signalements`, sans nouvelle table ni identifiant |
| 4 | Audience documentaire via `MembreRole` | **Partiellement démontré** | La distinction "lisible par tous / actionnable par admin+superviseur seulement" a pu être formulée en texte, mais **aucun mécanisme de filtrage réel n'a été construit** (l'article reste visible à tous dans le code actuel) — Phase E n'a testé que la formulation, pas l'application technique de la règle d'audience |
| 5 | Article transverse multi-`TabKey` | **Démontré** | T9 référence `questions-clients`/`messagerie`/`avis-reputation`/`signalements` mais **vit physiquement dans un seul** de ces écrans (Signalements) — confirme le principe de la section 3.3 (TabKey ≠ Knowledge ID) sans encore répondre à la question ouverte "faut-il un point d'accès sur les 4 écrans, ou un seul suffit ?" (non tranché par ce seul slice) |
| 6 | Sortie vers Support existant | **Démontré, mais minimalement** | Lien textuel seul (pas de deep-link cliquable) — évite de conclure que la "sortie vers Support" est un mécanisme complexe à concevoir ; un simple rappel du nom de l'onglet a suffi ici, à revérifier si ça reste vrai sur un besoin plus urgent qu'un article comparatif |
| 7 | Source de vérité code → contenu | **Démontré** | Chaque phrase du contenu (statuts, transitions, visibilité des 4 canaux) a nécessité une relecture directe du code source avant rédaction (`signalementsConstants.ts`, `TAB_MATRIX`, `QuestionsClientsTab.tsx` etc.) — zéro contenu écrit de mémoire de l'audit |
| 8 | Limites découvertes pendant l'implémentation | — | Voir 12.2 |

**12.2 Limites découvertes, non anticipées par la Phase D telle qu'écrite** :
- Le point 2 ci-dessus est la découverte la plus importante : **un
  pattern P (ex. P8) ne se généralise pas par copier-coller** — il faut
  revérifier, domaine par domaine, qui est l'acteur réel de l'action
  décrite avant de réutiliser la structure. Un futur lot qui
  généraliserait T12 sans cette vérification produirait un contenu qui
  suggère au prestataire une action qu'il ne peut pas faire.
- Le point 4 montre que "l'audience documentaire" (section 2bis) reste
  un principe de **formulation** tant qu'aucun mécanisme de filtrage
  n'est construit — les deux ne sont pas la même preuve, à ne pas
  confondre dans un futur bilan.

### 12.3 Ce qui doit rester générique vs ce qui doit rester spécifique au domaine

**Générique (réutilisable tel quel sur un autre domaine)** :
- Le mécanisme `reason?: string` sur un composant partagé (le principe,
  pas forcément `ReauthModal` lui-même) — composant agnostique, caller
  contextualisé.
- Le principe qu'un `TabKey` est le point d'ancrage de l'aide
  contextuelle et des liens vers une connaissance transverse.
- Le principe qu'une connaissance transverse peut référencer plusieurs
  `TabKey` sans dupliquer son contenu sur chacun.
- La discipline de vérification systématique du code avant toute
  phrase (point 7) — non négociable, quel que soit le domaine.

**Spécifique au domaine (à revérifier, jamais supposé identique)** :
- **Qui est l'acteur réel d'une transition d'état** — Signalements
  (Yelen) diffère de Communauté Pro (l'institution elle-même) ; un
  futur domaine peut avoir un troisième cas de figure.
- **Le ton et la structure du "prochaine étape"** — dépend de qui agit
  (point précédent), ne peut pas être un simple mapping statut→texte
  copié d'un domaine à l'autre sans revérification.
- **La pertinence même d'un article comparatif** — T9 existait parce
  que 4 écrans réels se recoupaient fonctionnellement ; ce recoupement
  ne se retrouve pas nécessairement dans un autre domaine (à
  redémontrer, pas à supposer par analogie).

### 12.4 Décision

**Vertical slice Signalements : accepté comme preuve d'architecture.**
**Généralisation aux 7 autres domaines : non engagée** — le prochain
lot, s'il y en a un, doit être choisi à partir d'un besoin démontré
dans la matrice C (audit), pas par couverture systématique de la
navigation.

### 12.5 Phase E.2 / E.2.1 — B3-1 suspendu (pas rejeté), leçon méthodologique

Investigation technique du candidat le mieux prouvé de la matrice C
(B3-1, PR3 — premier signalement "Contre vous" reçu). Deux constats
réels, tous deux confirmés dans le code, ont conduit à suspendre
l'implémentation plutôt qu'à la poursuivre :

- Le code permet de détecter *"premier signalement citoyen en base
  pour cette institution"* (calculable sans nouvelle infrastructure,
  `GET /api/institution/signalements` sans `.limit()`), mais pas
  *"premier signalement réellement découvert par ce membre"* — deux
  définitions différentes de "premier", et pour un sujet sensible
  (une plainte reçue), cette distinction ne peut pas être ignorée.
- En vérifiant si le système de notifications existant
  (`notifications`, type `"signalement"`, déjà déclenché à chaque
  création réelle) pouvait servir de mécanisme réutilisable, un
  problème produit indépendant a été découvert : son clic navigue
  **systématiquement** vers le mauvais onglet (`rdv` au lieu de
  `signalements`) — `rdv_id` est obligatoire côté serveur pour ce
  type de signalement, donc ce n'est jamais un cas limite. Enregistré
  comme **UX6** dans l'audit (registre UX), **hors périmètre de ce
  chantier**.

**Décision** : B3-1 reste un besoin valide (PR3, toujours la preuve la
plus forte de la matrice C) mais **suspendu**, pas rejeté ni
transformé artificiellement en lot. Construire une aide événementielle
aujourd'hui aurait ajouté un deuxième chemin, à côté d'une cloche déjà
cassée sur le même événement — exactement ce que le principe 7
(section 2) interdit : l'aide ne comble jamais un problème que
l'interface doit résoudre elle-même. Séquence retenue si UX6 est un
jour corrigé côté produit : notification → fiche Signalement
correctement ciblée → **puis seulement** revérifier si une explication
supplémentaire apporte encore une valeur réelle, ou si l'orientation
native suffit déjà.

**Leçon méthodologique retenue** : un besoin support réel (Phase B,
preuve PR3) peut aboutir à la conclusion qu'**aucun contenu Help
Center n'est la bonne réponse** — la correction produit peut suffire.
C'est la preuve que la séparation UX / Help Center / Support humain
(section 10) fonctionne dans un cas réel, pas seulement en théorie.

---

**ARRÊT — Phase E (vertical slice Signalements) acceptée. Phase E.1
(revue de réutilisabilité) et E.2/E.2.1 (investigation B3-1, suspendu)
restituées ci-dessus. UX6 enregistré, hors périmètre Help Center.
Aucune extension aux 7 autres domaines engagée. Candidats encore
ouverts dans la matrice C : T1+T2, T11, T5. Prochain lot à choisir sur
preuve, pas par couverture de domaine — sélection en attente de
Bryan.**
