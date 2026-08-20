# Yelen Trust Model — Lot Stratégique 0

Rédigé le 16/08/2026, sur décision CEO, comme préalable obligatoire à tout
code touchant la vérification. Modèle conceptuel uniquement — aucune
implémentation, aucune UI, aucune migration. Complète
`docs/product/YELEN_TRUST_PLATFORM_STRATEGY.md` (le « pourquoi » et la
roadmap) en fournissant le « quoi exactement » : la définition précise du
modèle de confiance lui-même.

Aucun code, aucune migration, aucun changement UI, aucun commit. Ce
document est la spécification de référence pour les lots suivants (Lot 1
Data Model, Lot 2 Evidence & Verification Backend, etc.) — chaque lot
futur doit s'y conformer ou justifier explicitement pourquoi il s'en
écarte.

---

## 0. Principe directeur

**Yelen n'affirme jamais plus que ce qu'il a réellement vérifié, et ne
laisse jamais deux choses différentes se faire passer l'une pour
l'autre.** Tout ce qui suit découle de ce principe unique : séparer ce
qui est déclaré de ce qui est prouvé, ce qui est prouvé de ce qui est
décidé, ce qui est décidé de ce qui est simplement observé dans le temps.

**Règle de nommage, désormais fondamentale (ajout CEO)** : ce système ne
s'appelle jamais un « score de confiance », dans aucun document, aucune
interface, aucune communication future. Des niveaux, des états, des
facettes et des signaux, oui — un score, jamais. La différence n'est pas
cosmétique : un score invite à se demander « combien », une facette
oblige à pouvoir répondre « pourquoi ». C'est précisément ce qui distingue
un annuaire à badges d'une infrastructure de confiance.

---

## 1. Pas de système universel — les organisations ne se prouvent pas de la même façon

Yelen sert des types d'organisations dont la nature juridique et les
preuves disponibles sont radicalement différentes. Le schéma actuel
(`statut_juridique`) en reconnaît déjà quatre : `public`, `prive_formel`,
`liberal`, `individuel_informel`. Le modèle ci-dessous les détaille et en
ajoute les autres catégories demandées par le CEO, avec le type de preuve
*réaliste* pour chacune — sans supposer que toutes disposent d'un accès
égal à la preuve documentaire formelle.

**Avertissement méthodologique** : les noms d'organismes/registres cités
ci-dessous (RCCM, NIF, ordres professionnels, régulateur des médias) sont
des catégories plausibles pour un pays de la zone OHADA comme la Guinée,
utilisées ici pour illustrer le *type* de preuve attendu — leur nom
exact, leur accessibilité réelle en ligne, et leur pertinence légale
précise doivent être confirmés par Bryan/une source juridique locale
avant toute implémentation. Ne pas les coder en dur sur la seule base de
ce document.

| Type d'organisation | `statut_juridique` actuel | Preuve d'existence réaliste | Preuve d'identité réaliste | Preuve d'autorité réaliste |
|---|---|---|---|---|
| **Institution publique** (hôpital d'État, mairie, ambassade) | `public` | Reconnaissance publique déjà établie (nom, fonction, existence non contestable) | Correspondance officielle, désignation par une autorité de tutelle, ou liste tenue par Yelen lui-même pour les institutions publiques connues | Lettre de mission ou attestation de fonction, à défaut vouching hiérarchique interne |
| **Entreprise formelle / PME** | `prive_formel` | Adresse physique + téléphone stable + activité observable | Document d'immatriculation (type RCCM), NIF si disponible | Statuts mentionnant le gérant, ou pièce d'identité + vouching d'un second membre de l'équipe déjà présent |
| **Professionnel libéral** (médecin, avocat, consultant) | `liberal` | Adresse d'exercice + téléphone stable | Carte d'ordre professionnel si la profession est réglementée, à défaut licence d'exercice ou diplôme | La personne EST l'organisation — Identité et Autorité se confondent |
| **Artisan / commerçant informel** | `individuel_informel` | Téléphone stable et joignable (déjà vérifié par OTP) + un contrôle de cohérence ponctuel et daté (ex. localisation confirmée à un instant T) — jamais un flux d'activité continu, voir note ci-dessous | Pièce d'identité nationale de l'individu + un contrôle de cohérence effectué une fois entre les informations déclarées et l'observation directe | La personne EST l'organisation — Identité et Autorité se confondent |
| **Association** | à cartographier (`public`/`prive_formel` selon reconnaissance) | Existence d'une activité observable + contact stable | Récépissé de déclaration si association déclarée, à défaut attestation communautaire | Statuts désignant un bureau, à défaut vouching des membres |
| **Média** | à cartographier | Publication observable, existence d'un contenu réel | Enregistrement auprès du régulateur des médias si applicable, à défaut cohérence éditoriale + ancienneté de publication | Carte de presse du responsable éditorial si disponible, à défaut déclaration + vouching |
| **Organisation communautaire** (groupement, coopérative) | `individuel_informel` probable | Existence observable localement | Attestation d'une autorité locale reconnue (chef de quartier, association faîtière) — évidence de type communautaire, pas documentaire | Vouching des membres, pas de document formel attendu |

**Conséquence directe pour le modèle** : le niveau de confiance maximal
atteignable ne doit **jamais** être structurellement plafonné par le
type d'organisation. Un artisan informel doit pouvoir atteindre un
niveau de confiance élevé par un contrôle de cohérence ponctuel et un
historique comportemental (Réputation, jamais une preuve d'Existence ou
d'Identité — voir la distinction stricte de la section 5), même sans
jamais produire de document formel — sinon Yelen exclut mécaniquement
une partie réelle de l'économie qu'il dit vouloir servir. Ce que le type
d'organisation détermine, c'est **le chemin de preuve emprunté**, jamais
le **plafond de confiance accessible**.

**Garantie de portabilité (répond au point 10 de la revue CEO)** : cette
section — le catalogue de preuves par type d'organisation — est
**volontairement la seule partie de tout ce modèle qui dépend du
contexte guinéen.** Les axes (section 2), le modèle d'état (section 3),
la distinction Evidence/Verification/Signal (section 5), le modèle de
fraîcheur (section 6) et le modèle de contestation (section 7) sont
écrits sans aucune dépendance à un pays précis. Étendre Yelen à un
nouveau marché signifie ajouter un nouveau catalogue de preuves
(nouvelle version de ce tableau) — jamais modifier les axes, les états,
ou les règles de séparation Evidence/Signal qui gouvernent tout le reste
du document.

---

## 2. Les quatre concepts — jamais confondus

### A. Existence
**Question** : cette organisation semble-t-elle réellement exister ?
**Nature** : la couche la plus basse, indépendante de toute légalité.
Une organisation informelle peut établir son Existence aussi solidement
qu'une entreprise formelle — c'est une question de réalité observable,
pas de statut juridique.
**Établie par** : contact stable et joignable (téléphone déjà vérifié à
l'inscription par OTP — un vrai début d'Existence, sous-exploité
aujourd'hui), localisation plausible, cohérence entre le nom déclaré et
une trace observable (enseigne, activité constatée).
**Ce que l'Existence ne prouve PAS** : ni que l'organisation est ce
qu'elle prétend être précisément (Identité), ni que la personne qui gère
le compte Yelen est autorisée (Autorité).

**Garde-fou trouvé par simulation croisée (Cas B)** : les facettes
affichées doivent toujours refléter *le type de preuve réellement
examiné*, jamais une catégorie plus large qu'il ne le justifie. Un
artisan informel vérifié via pièce d'identité individuelle doit voir/
montrer une facette « Identité personnelle vérifiée », jamais une facette
qui suggérerait une existence légale d'entreprise jamais établie ni
recherchée. L'inclusion de l'économie informelle (section 1) ne doit
jamais se payer par une affirmation plus large que la preuve réelle —
ce serait exactement le type d'excès que le principe directeur (section
0) interdit, dans l'autre sens.

### B. Identité
**Question** : les informations déclarées correspondent-elles à cette
organisation ?
**Nature** : dépend directement du type d'organisation (section 1) — la
preuve disponible n'est pas la même pour une PME formelle et un
professionnel libéral individuel.
**Établie par** : document déposé et examiné (`documents_institution`,
déjà construit côté dépôt) selon le chemin de preuve applicable au type
d'organisation.
**Ce que l'Identité ne prouve PAS** : ni que l'organisation a une bonne
réputation, ni que la personne actuellement aux commandes du compte est
toujours la bonne (l'Identité de l'organisation peut rester valide même
si son responsable change — voir Autorité).

### C. Autorité
**Question** : cette personne est-elle réellement autorisée à représenter
cette organisation ?
**Nature** : indépendante de l'Identité de l'organisation elle-même.
Une organisation peut être parfaitement identifiée et vérifiée, tout en
ayant un problème d'Autorité (ex. un ancien employé garde l'accès après
son départ).
**Établie par** : pièce d'identité individuelle du responsable
(aujourd'hui totalement absente — `institution_responsables` est du
texte libre non vérifié), + preuve de mandat quand elle existe (statuts
désignant un gérant), + à défaut vouching organisationnel (un second
membre déjà présent dans `institution_membres` atteste).
**Cas particulier** : pour un professionnel individuel ou un artisan
informel, Identité et Autorité se confondent — la personne EST
l'organisation. Le modèle doit prévoir cette fusion explicitement plutôt
que de forcer artificiellement deux vérifications identiques.

### D. Réputation
**Question** : quel historique observable possède cette organisation sur
Yelen ?
**Nature** : purement comportementale, s'accumule dès le premier jour
d'activité, **indépendamment** du statut de vérification. Une
organisation non vérifiée peut avoir une excellente réputation naissante ;
une organisation vérifiée peut ne pas encore avoir de réputation établie
(« données insuffisantes », jamais interprété comme négatif).
**Établie par** : signaux comportementaux (section 4) — jamais une preuve
en soi des trois autres axes.
**Ce que la Réputation ne prouve JAMAIS** : ni l'Existence, ni
l'Identité, ni l'Autorité. Un grand nombre d'avis positifs n'est pas une
preuve d'existence légale — c'est le garde-fou le plus important de tout
ce document, à ne jamais relâcher même sous la pression de vouloir
« simplifier » le modèle plus tard.

**Ces quatre axes sont indépendants, pas séquentiels.** Ils progressent
en parallèle, s'affichent séparément (cohérent avec le principe déjà
acté : jamais un score composite unique), et un système de facettes
(déjà proposé dans le document stratégique) est la bonne représentation
— pas un pipeline linéaire obligatoire.

**Précision nécessaire sur `niveau_confiance`** : cette colonne (section
3) ne doit représenter que la profondeur atteinte sur les axes Identité
et Autorité — jamais un composite incluant la Réputation. Si
`niveau_confiance` finissait par mélanger, même implicitement, de la
Réputation dans son calcul, il recréerait exactement le score composite
unique que ce document interdit en section 2 — simplement caché derrière
un nom différent. La Réputation reste, dans tous les cas, une facette
strictement séparée et jamais absorbée dans ce palier.

**Définition des 3 paliers — ajoutée après simulation croisée (Cas A/B),
absente jusqu'ici et source de non-déterminisme.** Chaque palier est
défini par l'état des axes, jamais par le *type* de document produit —
condition nécessaire pour qu'un acteur informel puisse légitimement
atteindre le palier le plus élevé par son propre chemin de preuve
(section 1) :
- **`profil_basique`** : aucun axe applicable n'a encore passé la revue
  — état par défaut (`REGISTERED`).
- **`profil_verifie`** : tous les axes applicables (Identité, et
  Autorité quand distincte) ont passé la revue avec une preuve jugée
  authentique et cohérente — l'état `VERIFIED` est atteint.
- **`institution_certifiee`** : mêmes axes que `profil_verifie`, mais
  avec une preuve dont l'examinateur juge la qualité maximale *pour le
  chemin de preuve applicable à ce type d'organisation* — inspiré du
  principe NIST cité par le CEO (authenticité, exactitude, rattachement
  à une identité réelle), jamais défini par la nature du document
  lui-même. Un artisan informel avec pièce d'identité + contrôle de
  cohérence + vouching organisationnel peut légitimement atteindre
  `institution_certifiee`, exactement comme une PME avec un document
  d'immatriculation officiel — les deux avec des preuves de qualité
  maximale *dans leur propre catégorie*, jamais l'un structurellement
  plafonné en dessous de l'autre.

---

## 3. Yelen Trust State — le modèle d'état

Modèle proposé, dérivé du brouillon CEO mais ajusté à la réalité
opérationnelle du produit (et réutilisant, quand c'est possible, un
vocabulaire déjà présent dans le schéma actuel plutôt que d'en inventer
un nouveau) :

```
UNCLAIMED  (futur, hors périmètre actuel)
    ↓
REGISTERED
    ↓
UNDER_REVIEW  ←──────────┐
    ↓                    │
COMPLEMENT_REQUESTED ─────┘
    ↓
VERIFIED ──→ VERIFICATION_EXPIRING ──→ EXPIRED ──→ (retour à UNDER_REVIEW sur nouveau dépôt)
    ↓
SUSPENDED ──→ (levée) ──→ VERIFIED
    ↓
REVOKED
```

**Note de simplification assumée** : le brouillon CEO distinguait
`CLAIMED` et `IDENTITY_PENDING` comme deux états séparés. Ce modèle les
fusionne dans `REGISTERED` — aujourd'hui, une organisation qui s'inscrit
sur Yelen (`app/api/institution/auth/register/route.ts`) crée directement
un compte opérationnel phone-vérifié ; il n'existe pas de notion de
« fiche réclamée » distincte d'une fiche déjà pleinement fonctionnelle.
`UNCLAIMED` est conservé comme état futur pour une capacité qui n'existe
pas encore (Yelen pré-listant une institution publique connue avant que
son équipe ne s'inscrive elle-même) — explicitement hors périmètre du
Lot 0, à ne pas construire maintenant.

**`COMPLEMENT_REQUESTED` n'est pas un nom inventé** — c'est la valeur
`complement_demande` qui existe déjà littéralement dans l'enum
`documents_institution.statut` depuis le 11/07/2026, jamais utilisée en
pratique faute de processus de revue. Encore une preuve que la plomberie
existe déjà.

**Portée exacte de ce modèle d'état — à ne jamais mal lire.** Ce cycle
d'états ne couvre que le processus de revue des axes **Identité et
Autorité** (section 2). Il ne couvre ni l'Existence (établie séparément,
automatiquement, dès `REGISTERED` — voir Evidence Model, Exemple 1), ni
la Réputation (jamais gouvernée par ce cycle, toujours indépendante et
continue). Un organisme peut donc être en `REGISTERED` avec une
Existence déjà établie et une Réputation déjà en construction, sans
que ni l'une ni l'autre n'attendent que ce cycle avance — c'est
volontaire, pas un oubli.

**Règle manquante, trouvée par simulation croisée (Cas D et Cas E — la
même faille sous deux angles différents).** Le brouillon initial
promettait (section 6, point 4) qu'un changement de responsable
déclenche une re-vérification, mais ne reliait jamais concrètement ce
déclencheur à une sortie de l'état `VERIFIED` — une organisation restait
donc, à la lecture littérale du modèle, indéfiniment `VERIFIED` malgré un
changement de responsable ou un document expiré, ce qui contredit
directement le principe directeur (section 0). Règle ajoutée pour fermer
ce trou :

**L'état global (`Yelen Trust State`) est une fonction recalculée en
continu de l'état de chaque axe applicable, jamais une valeur figée au
moment de l'octroi.** Concrètement : si l'Evidence qui soutenait un axe
spécifique expire (Cas E) ou devient caduque suite à un changement
matériel (Cas F), **seul cet axe repasse en révision** — pas
nécessairement les autres, et pas nécessairement un retour à
`SUSPENDED` (réservé aux préoccupations, pas aux mises à jour de
routine). L'affichage citoyen (section 8) doit refléter cet état
composite honnêtement (ex. « Identité vérifiée depuis [date] · Autorité
en cours de renouvellement ») plutôt que de montrer un badge global
« Vérifié » qui ne correspond plus à la réalité, ou de le retirer
entièrement alors qu'un axe reste valide.

### Détail par état

#### REGISTERED
- **Définition** : compte créé, téléphone vérifié par OTP, informations
  déclarées, aucune vérification demandée.
- **Condition d'entrée** : inscription réussie.
- **Condition de sortie** : dépôt d'au moins une preuve → `UNDER_REVIEW`.
- **Preuves nécessaires** : aucune (au-delà de l'OTP déjà fait).
- **Visibilité citoyenne** : profil visible, aucune facette de
  vérification active, jamais présenté comme un manque ou une alerte —
  simplement l'état par défaut, neutre.
- **Permissions organisation** : usage opérationnel complet (RDV,
  facturation, etc. — déjà le cas aujourd'hui), peut demander une
  vérification à tout moment.
- **Permissions admin** : aucune action de vérification à faire (rien à
  examiner).
- **Journalisation** : création de compte déjà tracée (`admin_logs`
  n'intervient pas ici, pas d'action admin).
- **Conséquences** : aucune restriction fonctionnelle — c'est l'état
  normal de la majorité des organisations aujourd'hui et pour longtemps.
- **Contestation** : sans objet (aucune décision n'a encore été prise).

#### UNDER_REVIEW
- **Définition** : au moins un document déposé, en attente d'examen
  humain.
- **Condition d'entrée** : premier dépôt dans `documents_institution`.
- **Condition de sortie** : décision admin → `VERIFIED`,
  `COMPLEMENT_REQUESTED`, ou retour à `REGISTERED` si rejet définitif
  sans complément possible.
- **Preuves nécessaires** : selon le chemin de preuve applicable au type
  d'organisation (section 1).
- **Visibilité citoyenne** : aucun signal intermédiaire affiché — un
  statut « en cours d'examen » visible publiquement créerait une fausse
  impression de progrès sans valeur réelle pour le citoyen, et une
  pression inutile sur les délais de revue.
- **Permissions organisation** : voit son propre statut d'examen, peut
  ajouter des documents complémentaires, ne peut pas influencer le délai.
- **Permissions admin** : examiner, valider, rejeter, demander complément
  — nécessite la permission dédiée (pas la permission générale de
  gestion des institutions, voir document stratégique, Primitive 3).
- **Journalisation** : chaque examen (même sans décision finale, ex. un
  premier coup d'œil) devrait laisser une trace — au minimum la décision
  finale, avec examinateur et date.
- **Conséquences** : aucune sur l'usage opérationnel.
- **Contestation** : sans objet à ce stade (pas encore de décision
  négative) — sauf si le délai devient excessif, auquel cas une
  escalade interne (pas un droit de recours formel) est raisonnable.

#### COMPLEMENT_REQUESTED
- **Définition** : la preuve déposée est insuffisante ou ambiguë, un
  élément précis manque.
- **Condition d'entrée** : décision admin explicite avec motif précis
  (jamais un rejet générique).
- **Condition de sortie** : nouveau dépôt → retour à `UNDER_REVIEW`.
- **Preuves nécessaires** : celles précisément identifiées par
  l'examinateur.
- **Visibilité citoyenne** : identique à `UNDER_REVIEW` — aucun signal
  public.
- **Permissions organisation** : voit le motif précis de la demande de
  complément, peut re-déposer.
- **Permissions admin** : mêmes que `UNDER_REVIEW`.
- **Journalisation** : motif de la demande de complément tracé,
  obligatoire.
- **Conséquences** : aucune sur l'usage opérationnel.
- **Contestation** : l'organisation peut contester le motif directement
  auprès de Yelen (canal support existant) avant de re-déposer — pas
  besoin d'une procédure formelle distincte à ce stade, la relation est
  encore collaborative, pas punitive.

#### VERIFIED
- **Définition** : **les axes applicables** (Identité, et Autorité quand
  elle est distincte de l'Identité — voir la fusion Identité/Autorité
  pour un professionnel individuel, section 2C) ont chacun passé la
  revue humaine avec succès. **Jamais « au moins un » des deux quand les
  deux sont distincts** — un organisme dont l'Identité est vérifiée mais
  dont personne n'a confirmé qui est autorisé à le représenter ne doit
  jamais afficher un badge « Vérifié » global, sous peine de donner une
  fausse impression de complétude. `niveau_confiance` reflète le palier
  atteint sur ces mêmes axes (jamais sur la Réputation, voir section 2).
- **Condition d'entrée** : décision admin positive, datée, motivée,
  examinateur identifié.
- **Condition de sortie** : expiration programmée → `VERIFICATION_EXPIRING`,
  ou signalement grave → `SUSPENDED`, ou décision de retrait → `REVOKED`,
  **ou régression d'un axe spécifique** (document expiré prématurément,
  changement matériel détecté — nom, responsable, téléphone officiel,
  adresse) → cet axe repasse en révision ciblée sans nécessairement
  entraîner les autres axes ni un passage par `SUSPENDED` (voir la règle
  générale ajoutée ci-dessus après simulation croisée Cas D/E/F).
  Correspondance attendue entre champ modifié et axe concerné : nom légal
  → Identité ; responsable → Autorité ; téléphone officiel → Existence
  (re-confirmation légère, largement automatisable) ; adresse → Identité
  ou le contrôle de cohérence ponctuel selon le chemin de preuve
  applicable (section 1).
- **Preuves nécessaires** : celles déjà validées, conservées comme
  référence de la décision.
- **Visibilité citoyenne** : facettes actives affichées avec date
  d'octroi (section « Trust UX » du document stratégique).
- **Permissions organisation** : usage complet + éligibilité aux
  bénéfices liés à la vérification (ex. parcours partenariat, une fois
  connecté — voir document stratégique).
- **Permissions admin** : peut réexaminer sur signalement, suspendre,
  révoquer — toujours avec motif et trace.
- **Journalisation** : décision d'octroi tracée de façon immuable
  (examinateur, date, preuve associée).
- **Conséquences** : accès aux bénéfices de la vérification.
- **Contestation** : sans objet dans ce sens (état positif) — la
  contestation s'applique aux décisions qui en sortent (Suspended/
  Revoked), voir section 7.

#### VERIFICATION_EXPIRING
- **Définition** : état temporel, pas une nouvelle décision — la date
  d'expiration approche (ex. 30 jours avant).
- **Condition d'entrée** : seuil temporel atteint automatiquement.
- **Condition de sortie** : renouvellement déposé et validé directement →
  reste `VERIFIED` avec nouvelle date ; renouvellement déposé mais
  incomplet → `COMPLEMENT_REQUESTED` (même cycle que pour une première
  demande, jamais un raccourci silencieux) ; absence d'action → `EXPIRED`.
- **Preuves nécessaires** : pour le renouvellement, un dépôt actualisé
  (pas nécessairement aussi lourd que la première demande, sauf
  changement matériel — voir section 5).
- **Visibilité citoyenne** : le badge reste actif — l'expiration
  imminente est une information interne à l'organisation, pas un signal
  d'alerte public prématuré.
- **Permissions organisation** : reçoit un rappel actif, peut renouveler
  directement.
- **Permissions admin** : peut initier ou répondre à un renouvellement.
- **Journalisation** : rappel envoyé tracé (pour audit du bon
  fonctionnement du système de rappel lui-même).
- **Conséquences** : aucune tant que non expiré.
- **Contestation** : sans objet.

#### EXPIRED
- **Définition** : la vérification n'a pas été renouvelée à temps.
- **Condition d'entrée** : délai de `VERIFICATION_EXPIRING` dépassé sans
  action.
- **Condition de sortie** : nouveau dépôt → `UNDER_REVIEW`.
- **Preuves nécessaires** : identiques à une nouvelle demande, sauf
  processus accéléré si le dossier précédent est récent et sans incident
  (décision de gouvernance à trancher plus tard, pas dans ce document).
- **Visibilité citoyenne** : le badge disparaît. **Jamais présenté comme
  une accusation** — juste une absence, identique visuellement à
  `REGISTERED`. Seule différence interne : l'organisation garde son
  historique de vérification passée, ce qui accélère un futur
  renouvellement.
- **Permissions organisation** : usage opérationnel inchangé, invitation
  à renouveler.
- **Permissions admin** : peut traiter un nouveau dépôt en priorité si le
  dossier précédent était propre.
- **Journalisation** : passage à expiration tracé automatiquement.
- **Conséquences** : perte des bénéfices liés à la vérification jusqu'au
  renouvellement.
- **Contestation** : sans objet — pas une décision punitive, un simple
  effet du temps.

#### SUSPENDED
- **Définition** : la vérification est temporairement neutralisée suite
  à une préoccupation précise (signalement grave escaladé, incohérence
  détectée, document expiré sans renouvellement d'un élément critique).
- **Condition d'entrée** : décision admin motivée, avec preuve du
  déclencheur.
- **Condition de sortie** : résolution du motif → retour à `VERIFIED` ;
  aggravation ou absence de réponse prolongée → `REVOKED`.
- **Preuves nécessaires** : celles qui répondent spécifiquement au motif
  de suspension.
- **Visibilité citoyenne** : badge retiré, **aucun motif détaillé exposé
  publiquement** — seule l'absence est visible, jamais une accusation
  active (voir section 7).
- **Permissions organisation** : voit le motif complet en privé, procédure
  de contestation active (section 7), peut soumettre une réponse/preuve.
- **Permissions admin** : lever la suspension avec motif, ou escalader
  vers révocation.
- **Journalisation** : obligatoire, complète, immuable.
- **Conséquences** : perte des bénéfices de vérification, aucune autre
  restriction opérationnelle automatique (la suspension du badge n'est
  pas une suspension du compte — deux mécanismes distincts, déjà séparés
  aujourd'hui via `institutions.statut='suspendue'`, différent de
  `badge_verifie`).
- **Contestation** : oui, active et documentée (section 7).

#### REVOKED
- **Définition** : Yelen retire définitivement son affirmation de
  vérification, après procédure contradictoire complète.
- **Condition d'entrée** : décision admin de niveau supérieur (jamais le
  même examinateur seul qui a initié la suspension — séparation des
  rôles, voir section 7), après réponse de l'organisation ou délai de
  réponse dépassé.
- **Condition de sortie** : uniquement un nouveau dossier complet, comme
  une première demande.
- **Preuves nécessaires** : pour ressortir de cet état, l'intégralité du
  parcours de preuve à nouveau.
- **Visibilité citoyenne** : identique à `SUSPENDED` — badge absent,
  aucun motif détaillé public.
- **Permissions organisation** : accès à l'historique complet de la
  décision, droit de recours documenté.
- **Permissions admin** : aucune réactivation directe sans nouveau
  dossier.
- **Journalisation** : la plus complète de tous les états — c'est la
  décision la plus lourde de conséquence.
- **Conséquences** : perte durable des bénéfices de vérification, mais
  **jamais** une exclusion de la plateforme elle-même (ça reste une
  décision distincte, via `institutions.statut`, pas ce mécanisme).
- **Contestation** : oui, formelle, avec séparation des rôles (section 7).

---

## 4. Evidence Model — la chaîne pour chaque affirmation

Chaîne demandée : *Claim → Evidence → Validation → Decision → Reviewer →
Timestamp → Audit trail.*

### Exemple 1 — « Cette organisation existe réellement »
```
Claim       : l'organisation "X" existe et est joignable
Evidence    : numéro de téléphone vérifié par OTP (déjà fait à
              l'inscription) + cohérence adresse/activité déclarée
Validation  : vérification automatique possible (OTP déjà validé
              techniquement) — le seul maillon de ce modèle qui peut
              rester largement automatisé sans risque
Decision    : Existence "établie" dès l'inscription réussie
Reviewer    : système (pas un humain, à ce niveau de preuve)
Timestamp   : date d'inscription
Audit trail : déjà présent (institution_sessions, created_at)
```

### Exemple 2 — « Cette organisation possède l'identité légale déclarée »
```
Claim       : l'organisation "X" est bien une entreprise formelle du
              secteur Y, sous le nom déclaré
Evidence    : document déposé dans documents_institution (type dépend
              du chemin de preuve, section 1)
Validation  : examen humain — vérifier la cohérence entre le document
              et les champs déclarés (nom, secteur, adresse)
Decision    : valide / rejeté / complément demandé
Reviewer    : admin avec permission dédiée (Primitive 3 du document
              stratégique)
Timestamp   : examine_le (colonne déjà existante, jamais alimentée)
Audit trail : nouvelle table d'événements de vérification (à concevoir
              au Lot 1, pas ici) — même pattern que signalement_events
```

### Exemple 3 — « Cette personne est autorisée à représenter l'organisation »
```
Claim       : la personne P est responsable autorisé de l'organisation X
Evidence    : pièce d'identité de P (n'existe pas encore comme preuve
              collectée) + preuve de mandat (statuts) OU vouching d'un
              second membre déjà présent dans institution_membres
Validation  : examen humain, plus élevé en exigence si l'enjeu est
              élevé (ex. organisation de type Institution publique/
              Média, où l'autorité mal établie a des conséquences
              disproportionnées)
Decision    : autorité confirmée / non confirmée
Reviewer    : admin avec permission dédiée
Timestamp   : à définir au Lot 1
Audit trail : à définir au Lot 1 — même pattern
```

**Constat transversal** : le maillon manquant est presque toujours le
même — *Validation* et *Decision* n'existent nulle part aujourd'hui.
*Evidence* est déjà largement collectée ou collectable, *Reviewer* a déjà
un modèle de permission à étendre, *Timestamp* et *Audit trail* ont déjà
un pattern éprouvé ailleurs dans le projet.

---

## 5. Evidence vs Verification vs Signal — trois catégories qui ne se mélangent jamais

| Catégorie | Définition | Exemples dans Yelen aujourd'hui | Peut établir Existence/Identité/Autorité ? | Peut nourrir la Réputation ? |
|---|---|---|---|---|
| **Evidence (preuve)** | Un artefact déposé pour établir un fait précis | Document dans `documents_institution`, futur document d'identité du responsable | Oui — c'est sa seule fonction | Non |
| **Verification (vérification)** | Le processus de jugement humain (ou automatisé pour les cas les plus simples) qui détermine si une preuve satisfait l'exigence | N'existe pas encore comme processus tracé | Oui — c'est l'acte qui transforme une preuve en fait établi | Non |
| **Signal** | Information comportementale ou contextuelle, jamais une preuve en soi | `moyenne_avis`, ancienneté (`created_at`), fréquence d'activité (`journal_activite`), avis, engagement Community | **Jamais** | Oui — c'est sa seule fonction légitime |

**Règle absolue, formulée explicitement pour ne jamais être oubliée dans
un futur lot** : un Signal ne peut jamais, seul ou en combinaison avec
d'autres Signaux, faire progresser l'axe Existence, Identité ou Autorité.
Une organisation avec 500 avis positifs et zéro document examiné reste,
sur ces trois axes, exactement au même point qu'une organisation avec
zéro avis. Ce n'est pas une punition — c'est la définition même de ce que
ces axes mesurent. Le mélange des deux est précisément le type de
fragilité scientifique que ce document est chargé d'empêcher.

**Cas limite à trancher explicitement (économie informelle, section 1)** :
le « contrôle de cohérence » utilisé comme preuve d'Existence/Identité
pour un acteur informel repose sur des données qui *ressemblent* à des
signaux comportementaux (activité, localisation). Pour ne jamais
contredire la règle ci-dessus, ce contrôle doit toujours être **un
Evidence — un jugement ponctuel, daté, produit une fois à partir de
l'observation, jamais un recalcul continu qui suivrait l'activité au fil
de l'eau.** Dès l'instant où une donnée réalimente automatiquement et en
continu un axe autre que la Réputation, elle a cessé d'être une preuve
pour redevenir un Signal déguisé — l'interdiction reste absolue,
seule la nature *ponctuelle vs continue* du traitement change.

---

## 6. Modèle de fraîcheur

Principe : **aucune preuve, aucune vérification, aucune réputation n'est
permanente par défaut.** Sept dimensions à faire vivre, jamais figer :

1. **Fraîcheur des informations déclarées** — dernière mise à jour du
   profil (`institutions.updated_at`-équivalent, à vérifier si présent).
2. **Dernière vérification** — date d'octroi vs aujourd'hui, condition
   du cycle `VERIFIED → VERIFICATION_EXPIRING → EXPIRED`.
3. **Activité récente** — dernier RDV traité, dernière connexion — un
   signal de Réputation, jamais de Vérification, mais pertinent pour la
   Découverte (document stratégique, section 9).
4. **Changements matériels** — un changement de nom, de forme juridique,
   ou de responsable devrait déclencher au minimum une re-vérification
   partielle et ciblée (pas nécessairement l'attente complète du cycle
   d'expiration) — principe à définir précisément au Lot 4, posé ici
   comme exigence de conception.
5. **Expiration des documents eux-mêmes** — certains documents ont leur
   propre date de péremption (ex. un agrément professionnel) — distincte
   de l'expiration du badge Yelen, mais doit l'influencer.
6. **Historique des incidents** — les signalements passés, même résolus,
   restent dans l'historique complet (immuabilité déjà garantie par
   `signalement_events`) mais leur **poids dans l'appréciation courante
   doit décroître avec le temps en l'absence de récidive** — un incident
   isolé et ancien ne doit pas peser comme un incident récent.
7. **Résolution des signalements** — un signalement résolu en faveur de
   l'organisation ne doit jamais être traité comme équivalent à un
   signalement jamais déposé ni à un signalement résolu en sa défaveur —
   trois issues différentes, trois traitements différents dans le futur
   modèle de Réputation.
8. **Ancienneté seule, jamais un facteur de confiance** — présent sur
   Yelen depuis longtemps ne vaut rien sans activité ou qualité récente
   pour l'accompagner. Une organisation nouvelle avec un comportement
   excellent doit pouvoir atteindre les mêmes facettes qu'une
   organisation ancienne dans un délai raisonnable — aucun palier ne
   doit être structurellement réservé, de fait, aux seuls acteurs
   historiques. C'est la condition directe pour que l'ancienneté ne
   verrouille jamais le marché au détriment de nouveaux acteurs.
9. **Intégrité des signaux eux-mêmes** — la Réputation (section 2D)
   n'est utile que si les signaux qui la nourrissent (avis, activité) ne
   sont pas eux-mêmes fabriqués ou manipulés. Ce document ne définit pas
   ici les mécanismes anti-fraude sur les avis/l'activité (réservé aux
   lots d'implémentation), mais pose comme exigence non négociable
   qu'une Réputation ne peut jamais être considérée comme un signal de
   confiance fiable tant que l'intégrité de sa source n'a pas été
   elle-même examinée — sans quoi « accumuler de la confiance » devient
   aussi facile à fabriquer artificiellement que de l'acheter, ce que ce
   modèle interdit par ailleurs explicitement (section 10, économie).
   **Troisième état trouvé par simulation croisée (Cas H)** : la facette
   Réputation ne doit pas se limiter aux deux états déjà posés
   (« données insuffisantes » / établie) — un troisième état honnête,
   « en cours de vérification », doit exister pour le cas d'une
   manipulation suspectée (ex. pic anormal d'avis). Jamais supprimer
   silencieusement les signaux suspects (l'historique reste, section 7 —
   Cas I), jamais non plus les laisser influencer l'affichage tant que le
   doute n'est pas levé.

**Ce que ce principe empêche explicitement** : qu'une organisation vérifiée
une fois en 2026 conserve indéfiniment un badge en 2036 sans que rien
n'ait jamais été réexaminé, et qu'une organisation présente depuis
longtemps reste mieux positionnée qu'une organisation récente et
meilleure aujourd'hui. La confiance dynamique n'est pas une
fonctionnalité parmi d'autres — c'est une condition de crédibilité du
système entier dans la durée.

---

## 7. Modèle de contestation

**Désambiguïsation terminologique, nécessaire après simulation croisée
(Cas G).** Un « Signal » (section 5 — donnée comportementale passive,
avis/activité, jamais une preuve) et un « signalement » (plainte
citoyenne active traitée dans cette section) sont deux choses
différentes malgré la proximité des mots en français. Un signalement,
une fois reçu, **n'est jamais lui-même un Signal au sens de la section
5** — c'est un déclencheur qui, une fois examiné par un humain, produit
soit une nouvelle Evidence (si la plainte révèle un fait vérifiable),
soit une Decision (résolution, sans effet sur les axes), en suivant
exactement la chaîne *Claim → Evidence → Validation → Decision → Reviewer
→ Timestamp → Audit trail* de la section 4 — jamais un raccourci qui
ferait passer une simple allégation non examinée pour une preuve.

### Quatre choses à ne jamais confondre

| | Nature | Visibilité citoyenne | Réversibilité |
|---|---|---|---|
| **Absence de vérification** | État neutre, pas un jugement | Aucun signal négatif — identique à un simple profil non encore vérifié | N/A |
| **Suspension** | Décision temporaire, motivée, réversible | Badge absent, aucun motif public | Oui, sur résolution du motif |
| **Révocation** | Décision définitive après procédure complète | Badge absent, aucun motif public | Non, sauf nouveau dossier complet |
| **Allégation de fraude** | Catégorie distincte, à traiter avec la plus grande prudence | **Ne doit jamais être publiée par Yelen comme une affirmation** — c'est le rôle des autorités compétentes, pas d'un badge de plateforme | N/A |

Le point le plus important de cette section : **retirer un badge dit
« Yelen ne peut plus vérifier ceci », jamais « cette organisation a
fraudé ».** La première est une affirmation que Yelen contrôle et peut
justifier. La seconde est une accusation qui expose Yelen à un risque
réel (diffamation potentielle si la décision s'avère erronée) et empiète
sur un rôle que Yelen n'a pas vocation à occuper.

### Exigences pour toute action de suspension/révocation

- **Justification interne** : motif écrit, daté, lié à une preuve
  concrète (document, signalement résolu, incohérence détectée).
- **Preuve** : jamais une décision sans élément factuel associé.
- **Historique** : trace immuable, consultable ultérieurement — même
  pattern que `signalement_events`/`journal_activite`.
- **Autorisation** : permission dédiée (pas la gestion générale des
  institutions), et pour une révocation, un niveau de décision supérieur
  à celui d'une simple suspension.
- **Possibilité de contestation** : l'organisation reçoit systématiquement
  le motif complet (jamais caché à elle-même, seulement au public) et un
  canal de réponse formel.
- **Séparation des rôles quand nécessaire** : celui qui initie une
  suspension ne devrait, dans l'idéal, pas être le même que celui qui
  tranche un appel contre cette même suspension. **Réalisme opérationnel**
  : avec une petite équipe admin, une séparation stricte est un objectif
  de maturité (P3, échelle nationale, document stratégique) plutôt qu'un
  prérequis bloquant du Lot 0 — mais le principe doit être posé
  maintenant pour ne pas être retrofité maladroitement plus tard.
- **Non-destruction, explicite (trouvé par simulation croisée, Cas I)** :
  suspendre ou révoquer ne supprime, ni ne modifie **jamais** les preuves
  déjà déposées, les décisions déjà prises, ni l'historique
  d'événements antérieur — la suspension change uniquement l'état
  affiché *actuel*, jamais le registre de ce qui s'est passé. Une
  organisation réhabilitée après une suspension injustifiée retrouve donc
  un dossier complet, pas une remise à zéro.

### Le système de signalement existant comme primitive réutilisable

Confirmé par cette analyse : le système d'arbitrage des signalements
(chantier clos le 15/08/2026) a **déjà** exactement l'architecture
nécessaire pour porter ce modèle de contestation — un graphe de
transitions légales entre statuts, une trace d'audit immuable
(`signalement_events`), une taxonomie de résolution structurée
(`avertissement/restriction/correction_donnees/aucune_action/
information_transmise/autre`), et surtout le principe déjà construit
cette semaine : **Yelen seul juge, jamais l'une des deux parties, décision
notifiée aux deux côtés.** Une contestation de suspension/révocation de
vérification est, structurellement, le même type d'objet qu'un
signalement — même si son contexte (`type_cible`) devrait rester
distinct pour ne pas mélanger les deux domaines fonctionnels. **Ne pas
construire un second système de contestation en parallèle — étendre
celui-ci au Lot 4.**

---

## 8. Trust UX — conceptuel uniquement, à ne pas construire maintenant

Rappel du principe déjà acté : jamais un score composite unique, toujours
des facettes indépendantes et datées. Exemple conceptuel du CEO,
conservé tel quel comme référence de sobriété visuelle à viser :

```
Identité de l'organisation   ✓ Vérifiée
Responsable                  ✓ Confirmé
Informations                 ✓ Vérifiées récemment
Présence Yelen                Depuis 2026
Réputation                    Données insuffisantes
```

« Données insuffisantes » n'est jamais un signal négatif — c'est un état
honnête, à traiter visuellement de façon neutre, jamais grisé/alarmant.
Ce sujet est développé en détail dans le document stratégique (section
Trust Transparency) — pas répété ici.

---

## 9. Search — dépendance stricte, rappel

Aucun classement de recherche ne doit pondérer par la confiance tant que
ce modèle n'est pas *implémenté et connecté* (Lots 1-4), pas seulement
défini sur le papier. Pondérer un classement par un signal encore fictif
serait pire que ne pas le faire du tout — ça donnerait l'illusion d'un
mérite qui n'existe pas encore. Développé dans le document stratégique,
section Search/Discovery.

---

## 10. Synthèse — réponses aux 12 questions de sortie du Lot 0

**Qui peut être vérifié ?** Toute organisation inscrite sur Yelen, quel
que soit son type (section 1) — le type détermine le chemin de preuve,
jamais l'éligibilité elle-même.

**Qu'est-ce qui peut être vérifié ?** Quatre choses indépendantes :
Existence, Identité, Autorité, Réputation (section 2) — jamais fusionnées
en un seul verdict.

**Avec quelles preuves ?** Des preuves adaptées au type d'organisation
(section 1) — document formel quand il existe, contrôle de cohérence
ponctuel et daté + pièce d'identité individuelle + vouching
organisationnel quand il n'existe pas. Jamais un signal comportemental
continu (section 5).

**Selon quel niveau d'assurance ?** Un modèle à paliers indépendant du
type d'organisation (`niveau_confiance`, déjà en base à 3 niveaux),
jamais plafonné par le statut juridique — un artisan informel peut
atteindre le palier le plus élevé par un chemin de preuve différent, pas
un chemin dégradé.

**Qui décide ?** Un rôle admin avec une permission dédiée à la
vérification, distincte de la gestion opérationnelle générale (section
3, Primitive 3 du document stratégique) — jamais un clic sans cette
permission spécifique.

**Comment la décision est-elle auditée ?** Trace immuable — examinateur,
date, preuve associée, motif — même pattern que `signalement_events`/
`journal_activite`, déjà prouvé ailleurs dans le projet (section 4).

**Quand expire-t-elle ?** Selon un cycle défini par état
(`VERIFIED → VERIFICATION_EXPIRING → EXPIRED`, section 3), jamais
indéfiniment, et re-déclenchée par tout changement matériel détecté
(section 6) — pas seulement par le temps écoulé.

**Comment est-elle contestée ?** Par un canal formel, avec motif complet
communiqué à l'organisation (jamais public), et une distinction stricte
entre absence de vérification / suspension / révocation / allégation de
fraude (section 7) — cette dernière n'étant jamais une affirmation que
Yelen porte lui-même.

**Que voit le citoyen ?** Des facettes factuelles et datées, jamais un
score composite, jamais une accusation active en cas de retrait — juste
une absence neutre (sections 3, 7, 8).

**Que se passe-t-il lorsqu'une information devient fausse ?** Le
signalement existant (« informations fausses ») déclenche un réexamen
possible (section 7) — la correction suit le même chemin de contestation
que toute autre remise en cause, jamais une modification silencieuse du
statut.

**Comment empêcher qu'une organisation riche achète sa confiance — ou
l'accumule artificiellement ?** Par séparation stricte et non
négociable entre le modèle économique (abonnement — décision CEO,
document stratégique section 11) et les quatre axes de confiance —
aucun des deux ne doit jamais influencer l'autre, à aucun niveau du
modèle. Et par l'interdiction absolue, posée en section 5, qu'un Signal
comportemental (donc potentiellement gonflable artificiellement) ne
puisse jamais faire progresser Existence/Identité/Autorité — seule la
Réputation en dépend, à condition que l'intégrité de ses propres sources
soit elle-même garantie (section 6, point 9).

**Comment éviter qu'une petite activité informelle soit injustement
exclue ?** En construisant, dès la conception (section 1), un chemin de
preuve alternatif et légitime pour l'économie informelle — jamais en
plafonnant son niveau de confiance atteignable par rapport à une
organisation formelle. C'est la condition la plus structurante de tout
ce modèle, et celle qui distingue une vérification bien conçue d'une
simple importation aveugle de standards internationaux.

---

## 11. Ce que ce document ne tranche pas (volontairement)

Pour rester fidèle au principe « modèle avant implémentation », ce
document laisse explicitement ouvertes des questions qui appartiennent
aux lots suivants, pas à celui-ci :
- Le nom exact et la structure précise des tables/colonnes futures (Lot 1).
- Les seuils précis d'automatisation possible (ex. l'Existence peut-elle
  rester 100% automatique à grande échelle, ou faut-il un contrôle
  humain d'appoint) — décision à prendre avec des données réelles de
  volume, pas en abstrait.
- La liste exacte et définitive des documents attendus par type
  d'organisation (section 1 donne des catégories illustratives, pas une
  liste juridique validée).
- Le SLA de délai d'examen humain — dépend de la capacité d'équipe, pas
  du modèle lui-même.

---

Aucun développement ne démarre sans validation CEO. Ce document ferme le
Lot Stratégique 0 tel que défini ; le Lot 1 (Data/Domain Model) ne
commence qu'après validation explicite de celui-ci.
