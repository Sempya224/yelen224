# Yelen — Stratégie de la plateforme de confiance

Rédigé le 16/08/2026. Remplace et absorbe la version précédente du même
document (16/08/2026) et prolonge `docs/product/YELEN_PRODUCT_STRATEGY_AUDIT.md`,
sur décision CEO. Aucune ligne de code modifiée pour produire ce document.
Aucun code, aucune migration, aucun changement UI, aucun commit.

**Portée** : l'abonnement (`institutions.plan`) est une décision
stratégique du CEO, non remise en question. Ce document l'analyse
uniquement comme surface d'intégration future de la valeur créée par la
boucle de confiance (section 11) — jamais comme sujet à corriger.

**Document compagnon** : `docs/product/YELEN_TRUST_MODEL.md` (Lot
Stratégique 0, 16/08/2026) définit le modèle de confiance lui-même —
états, preuves, axes Existence/Identité/Autorité/Réputation — à un
niveau de précision que ce document ne couvre pas. Les deux se
complètent : celui-ci répond au « pourquoi » et à la trajectoire, l'autre
au « quoi exactement ».

**Posture vis-à-vis des standards.** Ce document s'inspire du vocabulaire
et de la structure conceptuelle de NIST SP 800-63-4 (identity proofing,
niveaux d'assurance, cycle de vie des authentificateurs) et d'OWASP ASVS
5.0 (niveaux de vérification technique) parce que ce sont les cadres de
référence les plus rigoureux pour penser une architecture de confiance
et de sécurité. **Yelen ne "sera conforme" à aucun des deux tant qu'aucun
audit indépendant ne l'a confirmé.** Échelle honnête à utiliser partout
dans ce document et dans toute communication future sur le sujet :
*Inspiré par → Implémenté → Testé → Vérifié indépendamment.* Yelen est
aujourd'hui, sur le sujet confiance, au stade **« Inspiré par »
uniquement** (ce document). Le volet sécurité applicative est plus
avancé (`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, audit du
13/08/2026, remédiations en cours) mais n'a pas non plus été mappé
formellement à ASVS — à faire séparément, plus tard, pas dans ce document.

**Avertissement de lecture — désaccords assumés.** Le CEO a explicitement
demandé de ne pas simplement valider sa vision. Trois points de cette
vision sont, tels quels, en tension avec la réalité du terrain guinéen ou
avec les principes déjà actés du produit — développés en détail dans les
sections indiquées, pas édulcorés ici :
1. **L'inspiration NIST suppose des sources d'identité faisant autorité
   (registres d'entreprises, pièces d'identité vérifiables en base) qui
   n'existent pas pour une partie réelle du tissu économique guinéen** —
   `statut_juridique` inclut déjà `individuel_informel` dans le schéma
   actuel. Importer littéralement les paliers NIST exclurait précisément
   les artisans/commerçants informels que Yelen dit vouloir servir
   (section 5).
2. **Un « capital cumulatif » qui avantage l'ancienneté peut désavantager
   une organisation récente mais meilleure aujourd'hui** — à contrebalancer
   explicitement par un principe de fraîcheur, pas juste d'accumulation
   (section 12 et 17).
3. **Un système qui peut retirer un badge/statut à une organisation réelle
   a un pouvoir quasi réglementaire** — ça appelle une procédure
   contradictoire et un droit de recours dès la conception, pas après un
   premier incident (sections 6 et 16).

---

## 1. North Star

*Une présence Yelen doit valoir, pour une organisation, quelque chose
qu'elle ne peut pas reproduire facilement ailleurs — parce que Yelen
détient une preuve de légitimité vérifiée, un historique de comportement
réel, et un jugement impartial en cas de litige, que ni une page Facebook
ni une fiche Google ne peuvent offrir à ce niveau de rigueur locale.*

Et pour le citoyen : *Yelen est l'endroit où vérifier coûte moins cher
que de se renseigner soi-même, sans jamais exposer plus de sa propre vie
privée qu'il ne le choisit explicitement.*

Ce n'est pas une promesse de couverture (« Yelen référence toutes les
organisations ») — c'est une promesse de **qualité du jugement** (« ce que
Yelen affirme est vérifiable, daté, et peut être remis en question »).
C'est la différence entre un annuaire et une infrastructure de confiance.

---

## 2. Trust Model — pourquoi jamais un score unique

Décision déjà actée par le CEO, et confirmée par cette analyse : la
confiance d'une organisation ne doit **jamais** se réduire à un chiffre
composite (« Yelen Trust Score = 87/100 »). Trois raisons, au-delà de
l'argument esthétique :

- **Un score unique cache ses propres arbitrages.** Un score composite
  mélange nécessairement des choses incomparables (ancienneté, réactivité,
  conformité documentaire) derrière une seule pondération invisible — la
  transparence exigée en section 10 devient impossible dès qu'on résume
  tout à un nombre.
- **Un score unique est plus facile à gamer qu'un ensemble de facettes**
  — il suffit de sur-optimiser la dimension la plus facile (ex.
  compléter des champs de texte) pour compenser une dimension faible
  (ex. absence de preuve documentaire réelle).
- **Un score unique invite à la comparaison universelle** entre des
  organisations qui n'ont rien à voir (un hôpital et un artisan) — un
  système de facettes indépendantes évite ce faux classement.

**Modèle retenu : des facettes indépendantes, jamais agrégées en un seul
nombre.** Exemple conceptuel (pas une maquette à construire maintenant) :

```
Identité de l'organisation     — déclarée / vérifiée
Responsable                    — déclaré / identité confirmée
Documents                      — non fournis / déposés / examinés
Coordonnées                    — non confirmées / confirmées
Présence                       — profil incomplet / complet
Réputation                     — données insuffisantes / établie
Activité                       — inactive / active récemment
```

Chaque facette a son propre état, sa propre preuve, sa propre date. Le
citoyen voit un ensemble de faits, jamais une moyenne.

**Point de vigilance (à ne pas ignorer)** : un système à facettes n'est
pas automatiquement à l'abri du gaming — chaque facette doit avoir sa
propre défense (voir section 15, Abuse/fraud scenarios). « Profil
complet » ne doit jamais être satisfait par du texte plausible non
vérifié — sinon cette facette devient un théâtre de cases cochées plutôt
qu'un signal réel.

---

## 3. Trust Primitives

Les primitives sont les briques indépendantes sur lesquelles tout le
reste (réputation, découverte, transparence) doit s'appuyer. Format
`Decision → Reason → Existing capability → Gap → Dependency → Risk →
Success metric` pour chacune.

### Primitive 1 — Identité déclarée vs identité vérifiée (séparation explicite)
- **Decision** : distinguer techniquement et conceptuellement « ce
  qu'une organisation affirme » de « ce que Yelen a vérifié ».
- **Reason** : sans cette séparation, toute donnée saisie par
  l'organisation (nom, secteur, responsable) se confond avec une
  affirmation de Yelen — c'est exactement le problème actuel.
- **Existing capability** : le champ `institutions.*` (déclaré) existe
  déjà, séparé physiquement de `documents_institution` (preuve) et de
  `badge_verifie`/`niveau_confiance` (verdict) — la séparation en base
  existe déjà, elle manque seulement dans le comportement du produit.
- **Gap** : rien n'empêche aujourd'hui d'afficher une donnée déclarée
  comme si elle était vérifiée (ex. le nom affiché sur la fiche publique
  n'est jamais marqué comme « non vérifié »).
- **Dependency** : aucune — peut être une simple règle de présentation
  UI une fois le reste construit.
- **Risk** : si cette distinction n'est pas visible, le citoyen suppose
  que tout ce qui est affiché a été vérifié — exactement la confusion que
  le CEO veut éviter (« avoir un profil » ≠ « être une identité de
  confiance »).
- **Success metric** : aucune information affichée sur une fiche publique
  ne doit pouvoir être confondue avec une affirmation vérifiée par Yelen
  sans indication explicite de son statut de vérification.

### Primitive 2 — La preuve est une entité, pas un champ
- **Decision** : chaque preuve déposée (document, coordonnée confirmée,
  attestation) est un objet daté et traçable, pas une valeur qui écrase
  la précédente.
- **Reason** : une preuve remplacée sans historique empêche toute
  contestation ou audit ultérieur — et empêche de répondre à la question
  « sur quelle base cette organisation a-t-elle été vérifiée en 2026 ? »
  si elle est réexaminée en 2029.
- **Existing capability** : `documents_institution` a déjà une ligne par
  document avec horodatage — c'est déjà, par construction, une table
  d'événements plutôt qu'un simple champ. Le pattern d'audit immuable
  (`signalement_events`, `journal_activite`, `attendance_audit_logs`) est
  déjà prouvé trois fois ailleurs dans le projet.
- **Gap** : aucune table équivalente n'existe pour l'historique des
  *décisions* de vérification elles-mêmes (accord/révocation/expiration)
  — seul le dépôt est historisé, pas le jugement porté dessus.
- **Dependency** : dépend de la Primitive 3 (décision humaine) pour avoir
  quelque chose à historiser.
- **Risk** : sans historique des décisions, une révocation contestée n'a
  aucune trace de ce qui l'a motivée — risque juridique/réputationnel
  direct pour Yelen (voir section 16).
- **Success metric** : toute décision de vérification (accord, rejet,
  révocation, expiration) laisse une trace immuable, consultable, avec
  motif et identité du décideur.

### Primitive 3 — La décision de vérification est humaine et distincte de la gestion opérationnelle
- **Decision** : la revue de preuve devient une permission admin dédiée
  (ex. `institutions.verify`), distincte de `institutions.manage`
  utilisée aujourd'hui pour tout (suspendre, avertir, changer de plan,
  accorder le badge).
- **Reason** : juger une preuve et gérer un compte au quotidien sont deux
  pouvoirs de nature différente — le premier engage la crédibilité de la
  plateforme entière, le second est opérationnel.
- **Existing capability** : `lib/adminAuth.ts` a déjà un modèle de
  permission deny-by-default avec matrice par rôle — ajouter une
  permission dédiée est une extension naturelle du système déjà en place,
  pas une nouvelle architecture.
- **Gap** : aujourd'hui une seule permission (`institutions.manage`)
  couvre tout, y compris le badge.
- **Dependency** : aucune technique — dépend seulement d'une décision de
  gouvernance interne (qui a le droit de vérifier).
- **Risk** : sans séparation, un compte admin compromis ou peu formé peut
  accorder des badges sans discernement — la vérification n'a de valeur
  que si elle est elle-même digne de confiance.
- **Success metric** : aucune action de vérification n'est possible sans
  une permission distincte de la gestion opérationnelle générale.

### Primitive 4 — Le niveau de confiance a plusieurs paliers, pas un binaire
- **Decision** : réutiliser `niveau_confiance` (`profil_basique` /
  `profil_verifie` / `institution_certifiee`) comme socle du modèle à
  paliers, plutôt qu'un badge vrai/faux.
- **Reason** : un binaire vérifié/non-vérifié ne peut pas exprimer la
  réalité — une organisation peut avoir un profil complet sans document
  examiné, ou l'inverse.
- **Existing capability** : la colonne existe déjà en base avec un
  défaut correct (`profil_basique`) posé à l'inscription. C'est la bonne
  colonne à activer plutôt qu'en créer une nouvelle.
- **Gap** : rien ne la fait jamais progresser au-delà du défaut.
- **Dependency** : dépend des Primitives 2 et 3 pour avoir un critère de
  progression réel plutôt qu'arbitraire.
- **Risk** : si les paliers sont mal définis (trop faciles à atteindre),
  le problème actuel (badge décoratif) se reproduit à trois niveaux au
  lieu d'un.
- **Success metric** : chaque palier a une définition écrite, publique,
  et vérifiable — jamais laissée à l'appréciation individuelle d'un admin.

---

## 4. Identity Model

Trois identités distinctes, qui ne doivent jamais être confondues dans
la conception :

1. **Identité de l'organisation** (`institutions.*`) — l'entité elle-même
   : nom, secteur, forme juridique, existence.
2. **Identité du responsable** (`institution_responsables`) — la ou les
   personnes physiques autorisées à agir au nom de l'organisation.
   **Constat confirmé cette session** : cette table est aujourd'hui
   entièrement autodéclarée et librement modifiable sans aucune
   re-vérification (`app/api/institution/responsable/route.ts`, simple
   `upsert`). Une organisation peut être réelle sans que la personne qui
   la représente sur Yelen en soit réellement mandatée.
3. **Identité du citoyen** (`public.users`) — strictement privée par
   défaut, jamais exposée à un tiers sans action explicite (confirmé par
   grep exhaustif : aucune policy RLS de lecture publique sur `users`).

**Ce que le NIST suggère et ce qui est réellement applicable ici.**
NIST 800-63-4 sépare identity proofing (prouver qu'une identité existe),
authentication (prouver qu'on la contrôle) et federation (partager cette
assurance avec d'autres services). Le concept est juste. Mais NIST
suppose des sources d'autorité — registre national d'entreprises, pièce
d'identité vérifiable en base gouvernementale — **dont l'accessibilité
réelle en Guinée n'est pas établie dans ce dépôt et ne doit pas être
supposée acquise.** Le schéma actuel (`statut_juridique` incluant
`individuel_informel`) montre que le produit sert déjà, à raison, des
organisations qui n'ont probablement aucun registre formel à consulter.

**Recommandation concrète** : ne pas importer les paliers NIST tels
quels. Construire une échelle de preuve **adaptée aux évidences
réellement disponibles localement** — pièce d'identité du responsable +
document d'existence quand il existe (formel) + cohérence multi-signal
(téléphone stable, adresse cohérente avec l'activité déclarée, visite ou
confirmation communautaire) quand le formel n'existe pas. Une
organisation informelle ne doit jamais être structurellement incapable
d'atteindre un niveau de confiance décent — sinon Yelen exclut
précisément la partie de l'économie guinéenne qu'il dit vouloir servir.

**Vérification du responsable** : plutôt que d'exiger une preuve
juridique de mandat (souvent inexistante pour une PME/un indépendant),
un modèle de **vouching organisationnel** est plus réaliste à ce stade —
un second membre déjà présent dans l'équipe (`institution_membres`,
système déjà construit) peut attester qu'une personne est bien
responsable, en complément d'une pièce d'identité individuelle. À
concevoir, pas à coder maintenant.

---

## 5. Evidence Model

Ce qui compte comme preuve, et à quel niveau :

| Type de preuve | Disponibilité réelle en Guinée | État dans le produit |
|---|---|---|
| Registre d'entreprise formel | Partielle — dépend du `statut_juridique` | Jamais consulté (aucune intégration) |
| Document déposé (`documents_institution`) | Toujours disponible (upload) | Réel, mais jamais examiné |
| Pièce d'identité du responsable | Toujours disponible | N'existe pas encore comme preuve associée au responsable |
| Cohérence multi-signal (téléphone, adresse, activité) | Toujours disponible | Aucune détection de cohérence aujourd'hui |
| Attestation communautaire (vouching) | Toujours disponible | N'existe pas |
| Historique transactionnel Yelen (RDV honorés, factures) | Existe en interne dès qu'une organisation est active | Jamais utilisé comme preuve de légitimité |

Constat stratégique : **l'historique d'usage réel de Yelen (RDV, avis,
factures, activité mesurée par `journal_activite`) est probablement la
preuve la plus fiable et la moins falsifiable de toutes** — parce qu'elle
n'est pas déclarative, elle est comportementale. Un document peut être
faux ; six mois de RDV honorés avec des dizaines de citoyens différents
sont beaucoup plus difficiles à simuler. Ce type de preuve doit peser au
moins autant que la preuve documentaire dans le modèle à terme — et il
existe déjà.

---

## 6. Verification Lifecycle

États demandés par le CEO : *Pending → Under Review → Verified →
Expiring → Expired → Suspended → Revoked.*

| État | Ce que voit l'organisation | Ce que voit le citoyen | Actions admin possibles | Preuve requise |
|---|---|---|---|---|
| **Pending** | « Vérification non demandée » | Rien de spécifique (profil basique visible) | Aucune | — |
| **Under Review** | « Document déposé, en cours d'examen » | Rien (pas de statut intermédiaire affiché — évite un faux signal de progrès) | Examiner, demander complément, valider, rejeter | Document(s) déposés |
| **Verified** | Date d'octroi, niveau, prochaine échéance | Facette « Documents examinés par Yelen », date | Révoquer (motivé), laisser expirer | — |
| **Expiring** | Rappel actif (ex. 30 jours avant) | Rien de spécifique (pas d'alarme publique prématurée) | Renouveler, laisser expirer | Nouveau document si renouvellement |
| **Expired** | « Vérification expirée, à renouveler » | Facette repasse à son état précédent, jamais un signal négatif actif (l'absence de badge n'est pas une accusation) | Réactiver sur nouveau dépôt | Nouveau document |
| **Suspended** | Motif visible à l'organisation, procédure de contestation | Badge retiré, aucun détail négatif exposé publiquement | Lever la suspension avec motif | Réexamen |
| **Revoked** | Motif + historique de la décision, droit de recours | Badge retiré définitivement, aucun détail négatif exposé publiquement | Aucune sans nouvelle demande complète | Nouveau dossier complet |

**Principe de conception non négociable** : à aucun moment un état
« négatif » (Expired, Suspended, Revoked) ne doit s'afficher au citoyen
comme une accusation active (« Cette organisation a été suspendue pour
fraude ! ») — seule l'*absence* du badge doit être visible. Le motif
détaillé reste entre l'organisation et Yelen, sauf décision explicite
contraire liée à un signalement résolu publiquement (déjà le cas du
système d'arbitrage existant). Sans ce garde-fou, le système de
vérification devient un système d'accusation publique — un risque
juridique et réputationnel majeur (diffamation potentielle si une
décision s'avère erronée).

**Suspended vs Revoked** : distinction utile à conserver — Suspended
implique une procédure réversible en cours (ex. document expiré,
contestation en cours), Revoked implique une décision définitive après
procédure contradictoire complète. Ne pas les fusionner.

---

## 7. Organization Reputation Model

État réel : deux couches disjointes.
- **Publique, brute** : `moyenne_avis`/`nb_avis`, recalculées par trigger
  (corrigé le 06/08/2026 après avoir été figées à 0 malgré de vrais avis
  — donc un mécanisme automatique déjà pris en défaut une fois, à
  surveiller si le modèle de réputation s'enrichit).
- **Interne, riche** : `lib/reputationScore.ts` (note 60%, réponse aux
  avis négatifs 15%, annulations institution 15%, réclamations résolues
  10%, déterministe, zéro LLM) — jamais montrée au citoyen.

Vers un modèle exposable : ne pas montrer le score composite interne tel
quel (section 2 l'interdit), mais **traduire ses composantes en faits
publics indépendants** — « répond en moyenne sous X heures », « N litiges
résolus sur les 12 derniers mois », « active sur Yelen depuis [date] ».
Chaque fait vient d'une donnée déjà calculée en interne ; seule la
décision de l'exposer, fait par fait, manque.

**Principe de fraîcheur** (contrepoids nécessaire à la section 17,
capital cumulatif) : un fait doit être pondéré par sa récence, jamais par
la seule ancienneté brute — une organisation excellente depuis 3 mois
doit pouvoir dépasser en visibilité une organisation médiocre depuis
3 ans. L'historique est une preuve, pas un droit acquis.

---

## 8. Citizen Trust Model

Principe non négociable, déjà acté et confirmé dans le code : **aucun
score citoyen visible par un tiers, jamais.** Ce document ne le remet pas
en question — il en précise la construction positive.

Le citoyen construit un capital qui lui appartient, pas qui le classe :
- **Identité vérifiée** (déjà en germe via `identite_verifiee`, qui gate
  aujourd'hui la publication sur Yelen Community) — un fait binaire sur
  le citoyen lui-même, jamais un score.
- **Historique d'activité** (RDV honorés, démarches suivies, avis
  laissés) — déjà collecté (`GET /api/citoyen/activites`,
  `GET /api/citoyen/suivis`), déjà strictement privé.
- **Divulgation sélective** — le citoyen choisit *s'il* montre un fait
  (« 12 RDV honorés depuis 2026 ») et *à qui*. Le mécanisme de
  préférences de partage existe déjà en germe
  (`citoyen_prefs_partage`, chantier Confidentialité) — c'est le bon
  pattern à étendre, pas à réinventer.

**Ce qu'il ne faut jamais construire** : un profil citoyen public par
défaut, un classement entre citoyens, un score de fiabilité visible sans
action explicite du citoyen concerné. Le NIST-inspiré s'applique à
l'organisation (parce que l'organisation cherche activement à être
publiquement crédible) — l'appliquer au citoyen de la même façon
contredirait le principe de confidentialité déjà posé et validé comme
différenciant stratégique.

---

## 9. Search / Discovery Strategy

Objectif : répondre à *« parmi les organisations correspondant à ma
recherche, lesquelles sont les plus pertinentes et les plus dignes de
confiance, selon des signaux explicables »* — sans classement opaque, et
sans que la visibilité s'achète.

État réel : 3 tris côté client (note / nombre d'avis / alphabétique),
zéro pondération par vérification, complétude ou réactivité, malgré une
table `recherches_populaires` déjà collectée et jamais exploitée au-delà
de suggestions.

Dimensions à intégrer, dans un ordre de dépendance explicite (pas toutes
en même temps) :
1. **Pertinence textuelle** — déjà existante (fuzzy matching Levenshtein
   dans l'overlay de recherche).
2. **Vérification réelle** (une fois la section 6 construite) — pas un
   simple filtre binaire, une pondération.
3. **Complétude de fiche** — mesurable dès aujourd'hui sans nouvelle
   donnée (horaires/services/description renseignés ou non).
4. **Fraîcheur** — dernière mise à jour du profil, activité récente.
5. **Réputation factuelle** (section 7) — une fois exposée.
6. **Proximité** — déjà calculée côté client quand la géolocalisation est
   disponible, jamais injectée dans un tri serveur pondéré.

**Garde-fou explicite, à documenter publiquement dès la conception** :
le plan d'abonnement ne doit **jamais** être un facteur de classement
organique. La visibilité payante (mise en avant d'Offres, déjà un
mécanisme séparé et existant) doit rester visuellement et
structurellement distincte des résultats de recherche organiques — pas
un classement mixte où l'utilisateur ne peut pas distinguer ce qui est
gagné de ce qui est acheté.

---

## 10. Trust Transparency

La confiance n'a de valeur que si le citoyen comprend pourquoi elle
existe — sans exposer d'information sensible (documents eux-mêmes,
détails d'un litige en cours, données personnelles du responsable).

Principe : chaque facette affichée (section 2) doit pouvoir répondre à
« pourquoi ce statut ? » par une phrase factuelle et datée, jamais par un
downstream opaque. Exemple conceptuel (pas une maquette à construire
maintenant) :

```
Documents examinés par Yelen — depuis le 12/03/2027
Coordonnées confirmées — vérifiées le 12/03/2027
Profil mis à jour — il y a 4 jours
```

Ce principe s'applique aussi au classement de recherche (section 9) :
si un jour Yelen explique publiquement les grandes lignes de son
classement (« vérification, complétude, réactivité, pertinence » — sans
révéler les pondérations exactes, ce qui inviterait au gaming), la
confiance dans le système de découverte lui-même grandit. Le CEO a raison
de vouloir éviter un ranking opaque — mais la transparence totale des
pondérations exactes est elle-même un risque de manipulation ; la bonne
cible est « les facteurs sont connus, les poids exacts ne le sont pas »,
pattern déjà standard dans les moteurs de recherche sérieux.

---

## 11. Economic Model Boundaries

Rappel : l'abonnement est une décision CEO actée, non remise en question.
Ce que ce document fixe, c'est la frontière que l'abonnement ne doit
jamais franchir, une fois que la boucle de confiance existera :

**Peut être acheté** : profondeur d'analyse (Centre d'analyse déjà riche
en interne), amplification/mise en avant des Offres (tracking de clics
déjà existant), capacité d'équipe (Clock In Shift, comptes multiples,
déjà des fonctionnalités à volume), éventuellement des frais de dossier
pour le *processus* de revue humaine de vérification (jamais pour son
*résultat*).

**Ne doit jamais être acheté, quel que soit le plan** : le badge
vérifié, le niveau de confiance, la position dans le classement de
recherche organique, la suppression d'un avis négatif légitime, l'issue
d'un signalement/litige.

Cette frontière n'est pas une opinion sur l'abonnement — c'est un
principe d'architecture de la confiance qui doit survivre indépendamment
de la structure tarifaire choisie par le CEO, quelle qu'elle soit.

---

## 12. Network Effects

La boucle visée : *plus d'organisations vérifiées → plus d'information
fiable → plus d'utilité citoyenne → plus de citoyens → plus de visibilité
pour les organisations vérifiées → plus d'organisations veulent l'être →
davantage de confiance → davantage d'usage.*

Elle est aujourd'hui ouverte à deux endroits précis (déjà identifiés dans
l'audit précédent, confirmés ici) :
1. Entre *organisation vérifiée* et *organisation visible* — rien dans
   la découverte ne récompense encore la vérification (section 9).
2. Entre *comportement réel* et *réputation visible* — les données
   existent en interne, ne sont jamais montrées (section 7).

**Point de vigilance ajouté par cette analyse** : une boucle qui
fonctionne crée aussi un effet cumulatif qui peut cimenter les acteurs
déjà présents (section 17). Le principe de fraîcheur (section 7) est la
condition pour que la boucle profite à la qualité réelle plutôt qu'à la
seule ancienneté — sans ce contrepoids, le réseau devient un avantage
acquis plutôt qu'un avantage mérité, ce qui contredit l'esprit même de
la vérification.

---

## 13. Data / Architecture Implications

Conceptuel uniquement — aucune migration proposée ici.

Ce qui existe déjà et doit être réutilisé, pas recréé :
- Pattern d'audit immuable (`signalement_events`, `journal_activite`,
  `attendance_audit_logs`) — le bon modèle pour un futur historique de
  décisions de vérification.
- `documents_institution` — la bonne table pour la preuve, il manque une
  table de *décisions* liée (qui a examiné quoi, quand, avec quel motif)
  plutôt que de surcharger la table de preuve elle-même.
- `admin_logs` — déjà le bon mécanisme de traçabilité générale des
  actions admin, à continuer d'alimenter.
- `niveau_confiance` — la bonne colonne pour le palier, pas une nouvelle.
- Bucket de stockage privé déjà utilisé pour les documents (`"documents"`)
  — le bon modèle de confidentialité pour tout document sensible à venir
  (pièce d'identité du responsable, notamment).
- `institution_membres` — le bon socle pour un futur mécanisme de
  vouching organisationnel (section 4).

Ce qui manquerait conceptuellement à terme (à concevoir en détail
uniquement au moment de coder, jamais maintenant) : une table
d'événements de vérification distincte de `documents_institution`
(décision, motif, examinateur, date, expiration) ; une permission admin
dédiée (Primitive 3) ; un mécanisme de calcul des facettes de confiance
(probablement une vue ou un calcul à la lecture plutôt qu'une
dénormalisation, pour rester cohérent avec le reste du projet, qui
évite déjà les colonnes dénormalisées fragiles quand c'est possible).

---

## 14. Privacy Implications

Deux régimes de confidentialité distincts, à ne jamais confondre :
- **Citoyen** : privé par défaut, déjà bien construit, à préserver sans
  exception (section 8).
- **Organisation en cours de vérification** : les documents déposés
  (potentiellement pièce d'identité, preuve d'existence) sont des
  données sensibles qui méritent le même niveau de rigueur que les
  documents citoyens déjà traités ailleurs dans le projet (bucket privé,
  accès restreint, URL signée à durée limitée — patterns déjà en place
  pour `documents_citoyen` et `signalements-preuves`, directement
  réutilisables).

**Nouveau risque à anticiper** : élargir l'accès aux documents
d'organisation à un rôle de « vérificateur » (Primitive 3) crée une
nouvelle surface de données sensibles à protéger — ce rôle doit être
logué avec la même rigueur que l'accès aux documents citoyens
(actuellement déjà audité dans `docs/security/`), pas traité comme une
fonctionnalité admin ordinaire.

---

## 15. Abuse / Fraud Scenarios

- **Fausse organisation avec documents fabriqués** — seule la revue
  humaine protège à ce stade ; renforcer avec la cohérence multi-signal
  (section 5) plutôt que la seule lecture du document.
- **Compte admin compromis accordant des vérifications frauduleuses** —
  mitigé par la Primitive 3 (permission dédiée, moins de comptes y ont
  accès) + `admin_logs` déjà tracé ; envisager une double validation pour
  le palier le plus élevé (`institution_certifiee`) une fois construit.
- **Gaming d'une facette « profil complet »** avec du texte plausible non
  vérifiable — chaque facette doit avoir sa propre défense, pas
  seulement « le champ est rempli ».
- **Faux avis / avis en masse** pour gonfler ou saborder une réputation —
  aucune détection anti-fraude spécifique aux avis n'a été confirmée dans
  cette analyse ; à auditer séparément avant d'exposer davantage la
  réputation publiquement (dépendance de la section 7).
- **Représailles d'une organisation contre un citoyen** ayant laissé un
  avis négatif ou déposé un signalement — largement mitigé par le
  système d'arbitrage déjà construit cette semaine (Yelen seul juge, plus
  l'institution elle-même) : un vrai acquis à mettre en avant, pas un
  risque ouvert.
- **Faux vouching organisationnel** (section 4) — un membre complice
  attestant faussement qu'une personne non autorisée est responsable — à
  traiter comme un signal de risque accru plutôt qu'une preuve suffisante
  à elle seule, jamais comme équivalent à une pièce d'identité.

---

## 16. Failure Modes

- **Goulot d'étranglement humain** — si une petite équipe examine les
  documents, la croissance du nombre d'organisations vérifiées est
  plafonnée par la capacité de revue, pas par la demande. À anticiper
  comme un sujet opérationnel (staffing), pas seulement produit.
- **Faux sentiment de sécurité post-vérification** — un badge accordé
  une fois et jamais réexaminé devient trompeur si le comportement de
  l'organisation se dégrade ensuite. D'où l'expiration obligatoire
  (section 6), pas optionnelle.
- **Exclusion involontaire de l'économie informelle** — développé en
  détail en introduction et section 4-5 : le risque le plus sérieux si
  le modèle de preuve est calqué trop littéralement sur NIST.
- **Accusation publique non fondée** — si un état négatif (Suspended/
  Revoked) devient visible avec un motif public avant procédure
  contradictoire complète, risque de diffamation réel pour une vraie
  organisation. Le garde-fou de la section 6 (jamais d'accusation
  active, seulement une absence de badge) est la protection principale.
- **Ranking perçu comme injuste ou opaque** — si les critères de
  classement ne sont jamais communiqués, même de façon générale, la
  confiance dans la découverte elle-même s'érode au lieu de se construire
  (section 10).
- **Sur-promesse de conformité aux standards** — revendiquer une
  conformité NIST/ASVS non vérifiée est un risque réputationnel et
  potentiellement légal en soi si un client ou régulateur s'y fie.
  L'échelle *Inspiré par → Implémenté → Testé → Vérifié indépendamment*
  (introduction) est la protection contre ce risque spécifique.

---

## 17. Competitive Moat

**Constat honnête, pas commercial** : Yelen n'a aujourd'hui **aucun
moat** sur la confiance. Les données existent (avis, historique
d'activité, système d'arbitrage) mais ne créent aucun coût de sortie ni
aucun avantage compétitif visible, parce qu'elles ne sont ni exposées
(section 7) ni utilisées dans la découverte (section 9). Un concurrent
qui copierait l'interface de Yelen demain ne perdrait rien de significatif
par rapport à l'existant réel.

**Ce qui créerait un vrai moat, dans l'ordre de robustesse** :
1. **Le système d'arbitrage impartial** (déjà construit) — un
   différenciateur rare et difficile à copier rapidement, parce qu'il
   suppose une gouvernance et une discipline opérationnelle, pas
   seulement du code. Google/Facebook n'offrent rien d'équivalent à ce
   niveau de rigueur locale.
2. **La densité d'historique comportemental réel** (RDV honorés, litiges
   résolus) — non falsifiable, cumulatif, mais seulement une fois
   exposée et pondérée par la fraîcheur (sinon elle cimente l'existant
   plutôt que de récompenser la qualité, section 12).
3. **La confiance vérifiée elle-même**, une fois réelle — un badge qui
   veut dire quelque chose devient plus dur à obtenir ailleurs que chez
   Yelen précisément parce qu'il coûte un effort réel à obtenir.

Le moat n'est donc pas un chantier séparé — c'est la conséquence directe
de fermer les boucles déjà identifiées (sections 9 et 12). Il ne se
construit pas en ajoutant des fonctionnalités, il se construit en
fermant ce qui existe déjà.

---

## 18. Roadmap — Phase 0 à Phase 9

### Phase 0 — Truth Audit
Déterminer précisément ce qui est vrai aujourd'hui dans le produit.
**Statut : cette phase est faite** — c'est le contenu de ce document et
du précédent (`YELEN_PRODUCT_STRATEGY_AUDIT.md`). Rien à refaire ici tant
que le produit n'a pas significativement changé.

### Phase 1 — Trust Foundation
Établir le modèle conceptuel (facettes, primitives, cycle de vie) —
**contenu de ce document**. Décision de gouvernance : qui a le pouvoir de
vérifier (Primitive 3), quels paliers existent réellement (section 4-5),
adapté au contexte guinéen plutôt qu'importé tel quel de NIST.
*Dépendance : aucune technique — décision produit/gouvernance à valider
par le CEO avant la Phase 2.*

### Phase 2 — Evidence & Verification
Relier réellement `documents_institution` à une décision humaine tracée.
Ajouter la table d'événements de vérification (section 13). Faire
dépendre `badge_verifie`/`niveau_confiance` de cette décision, jamais
d'un clic seul. Ajouter expiration + révocation motivée.
*Dépendance : Phase 1 (le modèle doit être tranché avant d'être codé).*
*C'est la phase la plus critique de toute la roadmap — rien en aval n'a
de sens tant qu'elle n'est pas faite.*

### Phase 3 — Trust Transparency
Rendre les facettes de confiance compréhensibles au citoyen (section 10)
— affichage factuel, daté, jamais un score.
*Dépendance : Phase 2 (rien à rendre transparent tant que la vérification
n'est pas réelle).*

### Phase 4 — Reputation
Relier `moyenne_avis`, `reputationScore.ts` et l'historique comportemental
en faits publics (section 7), avec pondération de fraîcheur.
*Dépendance : peut commencer en parallèle de la Phase 3 (données déjà
existantes), mais son exposition publique suit la même logique de
transparence.*

### Phase 5 — Discovery
Classement de recherche pondéré par vérification, complétude, fraîcheur,
réputation, pertinence (section 9) — jamais par le paiement.
*Dépendance stricte : Phases 2 et 4. Construire le ranking avant reviendrait
à pondérer un signal qui ne veut encore rien dire.*

### Phase 6 — Organization Value
Faire du parcours vérification → partenariat une suite logique. Explorer
prudemment, à ce stade seulement, comment l'abonnement peut porter la
valeur ajoutée (section 11) — jamais avant.
*Dépendance : Phase 5 (la valeur de la présence dépend de la découverte
qui la récompense).*

### Phase 7 — Network Effects
Identité organisationnelle dans Yelen Community (une institution vérifiée
publie en tant qu'organisation, liée à sa fiche) — fermeture de la
boucle décrite en section 12.
*Dépendance : Phases 2, 4, 5, 6 déjà stables — c'est une phase
d'amplification, pas de fondation.*

### Phase 8 — National Trust Infrastructure
Preuve différenciée selon `statut_juridique` (formel vs informel, déjà
collecté, jamais exploité). Reporting agrégé pour des partenaires
institutionnels/régulateurs (le Centre d'analyse interne est déjà la
bonne base). La rigueur de sécurité déjà engagée séparément
(`docs/security/`) devient un prérequis explicite, pas une option.
*Dépendance : Phases 1-7 stables + posture de sécurité mature (au minimum
« Implémenté et testé » sur l'échelle de l'introduction, idéalement
vérifié indépendamment avant de porter une infrastructure nationale.)*

### Phase 9 — Regional Trust Network
Taxonomie secteur/statut juridique multi-pays. Une preuve valide dans un
pays n'est pas automatiquement valide dans un autre. Qui examine la
preuve à l'échelle régionale — un seul pool d'admins Yelen ne scale pas,
nécessite des partenaires locaux de confiance ou un processus
partiellement outillé, jamais au prix de la rigueur posée en Phase 2.
Langue/localisation (i18n déjà en germe, fr/en/ar).
*Dépendance : Phase 8 stable. Ne pas anticiper cette phase avant que la
confiance nationale soit elle-même solide — un moat régional prématuré
sur des fondations nationales fragiles est un risque, pas un avantage.*

---

## 19. Dependencies (vue synthétique)

```
Phase 0 (fait)
  → Phase 1 (décision de gouvernance, pas de code)
      → Phase 2 (Evidence & Verification — LA phase critique)
          → Phase 3 (Transparency)     ─┐
          → Phase 4 (Reputation)       ─┼→ Phase 5 (Discovery)
                                         ┘      → Phase 6 (Organization Value)
                                                     → Phase 7 (Network Effects)
                                                         → Phase 8 (National)
                                                             → Phase 9 (Regional)
```

Aucune phase en aval de la Phase 2 n'a de valeur si la Phase 2 n'est pas
réelle — c'est le goulot d'étranglement stratégique de toute la roadmap.
Les Phases 3 et 4 peuvent être menées en parallèle une fois la Phase 2
lancée. Les Phases 8 et 9 dépendent aussi, en dehors de ce document, de
la maturité du volet sécurité déjà suivi séparément.

---

## 20. Go/No-Go Criteria

Points de contrôle objectifs avant de considérer une phase terminée —
pas des dates, des faits vérifiables.

- **Fin de Phase 2** : zéro badge/niveau de confiance accordé sans une
  ligne dans la table d'événements de vérification, avec examinateur et
  motif. 100% des vérifications historiques (rétroactives) sont soit
  documentées soit explicitement marquées comme accordées avant la mise
  en place du processus (jamais réécrites silencieusement).
- **Fin de Phase 3** : chaque facette affichée au citoyen peut être
  reliée à un fait daté et sourcé, vérifiable en cliquant dessus — aucune
  facette « décorative ».
- **Fin de Phase 4** : les faits de réputation exposés sont recalculés
  automatiquement et correctement (condition explicite après l'incident
  du 06/08 où `moyenne_avis` est resté figé à 0 pendant des mois sans
  qu'aucune alerte ne le détecte) — un test de non-régression sur ce
  point spécifique avant toute exposition publique.
- **Fin de Phase 5** : les facteurs de classement sont documentés en
  interne et communicables publiquement dans leurs grandes lignes ; un
  audit manuel confirme qu'aucune corrélation entre plan payé et position
  organique n'existe.
- **Avant Phase 8** : le volet sécurité (`docs/security/`) a dépassé le
  statut « en cours » sur ses points High/Medium-High actuels — une
  infrastructure nationale de confiance ne peut pas reposer sur des gaps
  de sécurité encore ouverts.
- **Critère transversal, à chaque phase** : les cinq questions posées par
  le CEO (section suivante) restent répondables avec précision après
  chaque changement — si une phase rend une des cinq réponses plus floue
  qu'avant, c'est un signal d'arrêt, pas de continuation.

---

## Synthèse — les cinq questions

**Organisation — « Pourquoi ai-je besoin d'être sur Yelen ? »**
Parce qu'une fois les Phases 2 et 5 fermées, être vérifié et actif sur
Yelen devient visible et mesurable dans la façon dont les citoyens vous
trouvent — un avantage qu'une simple page Facebook ne peut pas offrir,
et qu'aucune organisation absente de Yelen ne peut reproduire ailleurs à
ce niveau de rigueur locale. **Aujourd'hui, cette réponse n'est pas
encore vraie** — c'est précisément ce que ce document propose de
construire.

**Citoyen — « Pourquoi dois-je faire confiance à Yelen ? »**
Parce que ce que Yelen affirme sur une organisation est vérifiable,
daté, et peut être contesté — pas parce que Yelen le dit, mais parce que
le système permet de vérifier pourquoi. Et parce que ses propres données
restent privées par défaut, ce qui est déjà vrai aujourd'hui.

**Administrateur — « Comment Yelen sait-il qu'une information est
vraie ? »**
Par une combinaison de preuve documentaire (quand elle existe), de
cohérence multi-signal (quand elle n'existe pas), et de comportement
réel observé dans le temps — jamais par une seule déclaration non
vérifiée. **Aujourd'hui, la réponse honnête est : il ne le sait pas
encore** — c'est le constat central de ce document.

**Ingénieur — « Quelle architecture préserve cette confiance à grande
échelle ? »**
La même que celle déjà en place pour l'audit et la sécurité —
événements immuables, permissions dédiées, service role pour tout ce qui
engage la crédibilité de la plateforme — étendue à la vérification plutôt
que réinventée. Rien de radicalement nouveau n'est nécessaire.

**CEO — « Pourquoi ce système devient-il plus précieux chaque année ? »**
Parce que chaque vérification réelle, chaque litige arbitré équitablement,
et chaque année d'historique comportemental accumulé rendent plus coûteux
pour un concurrent de reproduire ce que Yelen sait déjà — à condition que
ce capital soit exposé (sinon il ne vaut rien à l'extérieur) et pondéré
par la fraîcheur (sinon il fige les acteurs déjà présents plutôt que de
récompenser la qualité continue). C'est une propriété à construire, pas
une propriété acquise par la seule accumulation du temps.

---

Aucun développement ne démarre sans validation CEO.
