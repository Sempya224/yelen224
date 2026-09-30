# Yelen Clock In — Analyse critique → Standards internationaux → Architecture cible → Roadmap

Étape 2 du chantier Clock In, suite directe de `YELEN_CLOCK_IN_AUDIT.md`
(21/09/2026). Ce document part du principe que l'inventaire factuel est
acquis — il ne le répète pas, il l'interprète.

**Statut de ce document : proposition, pas une décision.** Tout ce qui
suit — priorisation, architecture cible, roadmap — est une lecture
technique destinée à éclairer une décision produit qui reste celle de
Bryan/CEO. Rien ici n'est un engagement de développement.

**Révision du 21/09/2026** : la première version de ce document utilisait
un benchmark de solutions africaines (AttendanceGM, Konkouré, Kuwa, Wali)
comme définition de la cible produit ("parité marché"). Correction
explicite de Bryan : ce n'est pas le bon raisonnement pour Clock In.
Cette version reprend la méthode ci-dessous.

---

## 0. Positionnement et méthode

### 0.1 Le principe

> Yelen Clock In ≠ "meilleur système de pointage en Afrique".
> Yelen Clock In = une solution internationale de Time & Attendance /
> Workforce Management, conçue dès le départ avec des standards de
> fiabilité et d'expérience **enterprise**.

Les systèmes africains (AttendanceGM, Konkouré, Kuwa, Wali) ne sont **pas
la référence de niveau produit**. Ils sont observés uniquement comme
**contexte de marché local** — ce à quoi les institutions guinéennes sont
déjà exposées, ce qu'elles pourraient déjà attendre par comparaison. La
cible de conception, elle, est internationale : un niveau de rigueur
comparable à des produits Workforce Management établis comme **UKG** et
**Workday**.

**Important — pas une invitation à copier.** UKG et Workday servent de
**références de maturité** (quelles propriétés un système Time &
Attendance sérieux doit couvrir), pas de **modèles à reproduire écran par
écran**. Yelen n'a ni le périmètre, ni la taille d'équipe, ni le marché de
ces deux produits (suites RH complètes utilisées par des multinationales).
Ce qui est repris ici, ce sont des **propriétés architecturales et de
fiabilité**, pas une liste de fonctionnalités à copier telle quelle.

### 0.2 La chaîne de raisonnement retenue

```
Yelen actuel
   ↓
Standards internationaux Time & Attendance (propriétés attendues d'un système sérieux)
   ↓
Enterprise-grade architecture & reliability (comment ces propriétés se traduisent techniquement)
   ↓
UX internationale (comment ça se vit pour l'utilisateur, sans copier un écran précis)
   ↓
Contraintes réelles des marchés où Yelen sera déployé (Guinée aujourd'hui, potentiellement au-delà)
   ↓
Yelen Clock In cible
```

Chaque écart identifié dans ce document doit pouvoir se justifier par
cette chaîne — **jamais** par une simple comparaison "un concurrent
l'a, donc il nous le faut". Exemple appliqué à chaque brique :

- **Offline** → pas parce qu'un concurrent l'affiche, mais parce que la
  **continuité de service** est une propriété de fiabilité attendue d'un
  système Time & Attendance sérieux, particulièrement pertinente compte
  tenu des contraintes réseau réelles du marché de déploiement.
- **Audit trail** → pas parce qu'un concurrent en parle, mais parce
  qu'un système professionnel de gestion du temps doit produire une
  **preuve infalsifiable** de ce qui s'est passé, exploitable en cas de
  litige RH ou de contrôle.
- **Correction de pointage** → parce qu'un système professionnel doit
  savoir **gérer l'exception** (l'oubli, l'erreur) sans compromettre
  l'intégrité de la donnée d'origine.
- **Géolocalisation** → pas pour "faire comme" un concurrent local, mais
  parce qu'un système enterprise doit pouvoir **valider le contexte
  physique** d'un événement de présence quand l'activité l'exige.
- **Multi-site** → parce qu'une architecture enterprise doit pouvoir
  **évoluer** sans refonte quand une institution grandit ou se
  structure en plusieurs sites.
- **Workflow d'approbation** → parce que la gestion du temps en
  entreprise n'est pas qu'une capture de données, c'est aussi un
  **processus managérial** (une correction, une absence, une heure
  supplémentaire s'approuvent, elles ne s'enregistrent pas seules).
- **Reporting** → parce que les données de temps n'ont de valeur que si
  elles deviennent **exploitables** (paie, conformité, pilotage RH), pas
  seulement stockées.
- **API / intégrations** → parce qu'un produit enterprise ne doit pas
  être une île : un système de gestion du temps s'interface avec la
  paie, le SIRH, parfois la facturation.

### 0.3 Sources et limites de vérification

- **Yelen** : repris de l'audit du 21/09/2026, lecture de code directe.
- **UKG et Workday** : caractérisation basée sur le positionnement de
  marché largement documenté de ces produits (couverture multi-canal du
  pointage — mobile/web/kiosque —, geofencing, gestion des exceptions et
  anomalies, workflows d'approbation, audit permanent, reporting temps
  réel, intégration RH/paie, self-service mobile, notifications). **Tentative
  de vérification directe par lecture de leurs pages produit
  aujourd'hui : échec systématique** — `ukg.com` et `workday.com`
  bloquent les deux la récupération automatisée (403/404 sur plusieurs
  URLs testées). Cette caractérisation n'est donc **pas une citation
  vérifiée** au même niveau que l'audit Yelen ou le benchmark africain
  (§4, où 3 sources sur 4 ont été confirmées par lecture directe).
  **Conséquence méthodologique explicite** : une page marketing (ou son
  absence d'accès) ne permet ni de confirmer ni d'infirmer qu'un produit
  international possède ou non une capacité donnée. Tout ce qui suit
  concernant UKG/Workday doit être lu comme "propriétés attendues d'un
  système Time & Attendance de ce niveau de maturité", pas comme
  "fonctionnalité confirmée chez UKG/Workday à la date de ce document".
- **Concurrents africains (§4)** : conservés du document précédent, à
  titre de contexte de marché uniquement — voir §4 pour le détail des
  sources vérifiées/non vérifiées.

---

## 1. Analyse critique de l'existant Yelen

### 1.1 Ce que l'audit change dans la lecture du projet

Avant l'audit, l'hypothèse implicite (raisonnable vu qu'aucun retour
utilisateur n'existe encore sur ce module) était que Clock In Shift était
un module jeune, largement squelettique. L'audit montre le contraire :
**le schéma de données et les API sont d'un niveau de maturité rare pour
un module qui n'a reçu aucun usage réel** — immuabilité des pointages,
audit trail structuré, gestion correcte des horaires de nuit, calcul de
tolérance configurable, séparation nette RH/dashboard. C'est un niveau de
rigueur habituellement atteint après plusieurs itérations post-lancement,
pas dès la conception initiale.

**Mais la maturité n'est pas uniforme.** Elle est concentrée côté
*schéma* et *backend*. Côté *produit utilisable*, plusieurs briques
critiques sont soit absentes, soit construites côté API sans jamais
avoir été reliées à une interface. C'est le déséquilibre central de ce
module :

| Couche | Maturité |
|---|---|
| Modèle de données | Élevée — pensé pour durer, extensions déjà anticipées (`responsable_id`, `latitude/longitude`, statuts étendus) |
| API | Élevée — validations, permissions, audit, gestion d'erreurs cohérentes |
| Job de calcul automatique | Élevée à la lecture, **non confirmée en exécution réelle** |
| UI dashboard institution | Élevée sur *consultation*, incomplète sur *action* (corrections sans UI) |
| UI portail employé | Élevée sur l'écran principal, deux stubs visibles non câblés |
| Fiabilité terrain (device réel, réseau réel) | **Non vérifiée** — aucun test réel effectué à ce jour |

### 1.2 Le risque le plus concret : un produit qui "a l'air fini" mais ne l'est pas

Le dashboard institution, visuellement, ressemble à un produit terminé
(refonte "Enterprise" du 05/08/2026, KPI, sparklines, flux live). Ce
niveau de finition visuelle masque un vrai trou opérationnel : **un
manager qui doit gérer un vrai désaccord de pointage (oubli, erreur, employé
sans téléphone un jour) n'a aujourd'hui aucun outil produit pour le
faire.** C'est le type d'écart qui ne se voit pas en démo interne mais
qui devient bloquant dès le premier usage réel en entreprise — un
employé qui pointe *tous les jours* finira, statistiquement, par oublier
une fois. Dans un système Time & Attendance sérieux, la gestion de
l'exception fait partie du produit au même titre que la capture — ce
n'est pas un module optionnel qu'on ajoute après coup (voir §0.2).

### 1.3 Risque de dépendance invisible

Tous les indicateurs agrégés (statut du jour, KPI dashboard, résumé
"Ma journée" du portail) dépendent d'un job `pg_cron` dont l'exécution
réelle n'est pas confirmée. Si ce job ne tourne pas, **il n'y a aucun
signal d'erreur visible** — le dashboard affiche simplement des données
figées ou vides, sans distinction entre "aucune activité" et "le job ne
tourne pas". Un système Time & Attendance de niveau enterprise traite
ce genre de silence comme une anomalie à détecter et signaler
elle-même, pas comme un angle mort — c'est un risque d'observabilité, à
regarder avec la même rigueur que les anomalies de présence elles-mêmes.

### 1.4 Ce que possède déjà Yelen, et ce qui reste à déterminer

Formulation volontairement prudente, corrigée par rapport à la première
version de ce document : **Yelen possède déjà certaines fondations
techniques solides — immuabilité des pointages, audit trail structuré,
modèle horaire unifié couvrant 4 régimes avec tolérances configurables,
séparation nette RH/dashboard. Nous allons maintenant déterminer jusqu'où
elles doivent être renforcées pour atteindre notre propre standard
international**, pas pour dépasser tel ou tel concurrent visible sur une
page marketing. La première version de ce document affirmait que Yelen
pourrait être "en avance" sur des concurrents africains sur ces points —
formulation retirée : une page marketing publique (ou son absence
d'accès, comme pour UKG/Workday ci-dessus) ne permet de conclure ni
qu'un produit possède une capacité, ni qu'il en est dépourvu. Ces
fondations ne sont pas un point d'arrivée, elles sont un point de départ
solide pour construire vers le standard visé.

---

## 2. Standards internationaux — propriétés attendues d'un système Time & Attendance enterprise

Organisé par **propriété**, pas par fonctionnalité isolée — c'est la
lecture que la chaîne du §0.2 impose. Rappel : caractérisation non
vérifiée par lecture directe (§0.3), à traiter comme "niveau de maturité
visé", pas comme un cahier des charges calqué sur un produit précis.

| Propriété | Ce qu'elle recouvre chez un système enterprise mature | Où en est Yelen (audit du 21/09) |
|---|---|---|
| **Capture multi-canal** | Mobile, web, kiosque partagé, parfois badge/biométrique — plusieurs points d'entrée pour le même événement de présence | 🟡 Un seul canal réel (portail web mobile-first), pas de web desktop dédié ni de mode kiosque distinct |
| **Continuité de service** | Le système reste utilisable (au moins en capture) quand le réseau est instable — la fiabilité de la présence ne doit pas dépendre de la qualité du réseau au moment T | 🔴 Aucune file d'attente locale, un pointage sans réseau échoue simplement (écran d'erreur, rien n'est mis en attente) |
| **Validation contextuelle (géofencing)** | Capacité de valider qu'un événement de présence a bien eu lieu dans un contexte physique attendu, quand l'activité l'exige | 🔴 Colonnes prêtes (`latitude/longitude`), aucune validation implémentée |
| **Gestion des exceptions et anomalies** | Détection automatique des écarts (retard, absence, incohérence), et surtout **traitement** de ces écarts (pas seulement leur affichage) | 🟡 Détection oui (retard/absent/incomplet calculés), traitement non (aucune UI de correction, voir §1.2) |
| **Audit permanent** | Trace infalsifiable de tout événement et de toute correction, exploitable en cas de litige ou de contrôle | 🟢 Immuabilité au niveau trigger (bloque même un accès superuser), mais **non consultable** depuis une UI |
| **Workflow d'approbation** | Une correction, une absence exceptionnelle, une heure supplémentaire suivent un circuit de validation (pas juste une écriture directe par un admin) | 🔴 Absent — le concept de "validation manager" n'existe pas, une correction (si elle avait une UI) serait appliquée immédiatement par quiconque a le droit `clock_in.write` |
| **Reporting et analytics exploitables** | Les données de présence deviennent des rapports sur période, exportables, agrégés (pas juste consultables au jour le jour) | 🟡 Export CSV ponctuel d'un instantané, aucune agrégation sur période |
| **Intégration RH/paie et API ouverte** | Le système de temps n'est pas un silo — il alimente la paie, le SIRH, parfois la facturation, via une interface documentée | 🔴 Aucune API publique, aucune intégration paie (qui n'existe pas non plus comme domaine dans Yelen aujourd'hui) |
| **Self-service mobile** | L'employé consulte et gère lui-même son historique, son planning, ses demandes, sans dépendre d'un intermédiaire | 🟡 Planning/heures/profil oui, historique de pointage personnel non câblé (stub) |
| **Notifications proactives** | Alertes en temps réel sur un événement anormal (retard, absence, oubli de clock-out) adressées à la bonne personne (employé et/ou manager) | 🔴 Aucune notification liée aux événements de présence trouvée dans le code |

### 2.1 Lecture de ce tableau

Le déséquilibre déjà identifié en §1 se confirme sous cet angle : Yelen
est fort sur les propriétés qui touchent **l'intégrité de la donnée**
(audit, immuabilité) et faible sur les propriétés qui touchent
**l'usage du produit en continu** (continuité de service, gestion des
exceptions avec workflow, reporting exploitable, ouverture vers
l'extérieur). C'est cohérent avec le constat du §1.1 : la rigueur
s'est concentrée côté schéma/backend, pas côté produit vécu.

Aucune ligne de ce tableau n'est présentée comme "il faut le construire
parce que UKG/Workday l'a" — chacune est reliée à une propriété de
fiabilité ou de maturité produit, indépendamment de qui la propose sur
le marché (voir la chaîne de raisonnement §0.2).

---

## 3. Contexte de marché local (secondaire — pas la cible)

Cette section est **conservée à titre informatif uniquement**. Elle ne
définit pas ce que Yelen doit construire — elle donne une idée de ce à
quoi les institutions guinéennes pourraient déjà être exposées, ou de
l'argumentaire commercial qu'un concurrent local pourrait opposer à
Yelen. Aucune ligne de ce tableau ne doit être lue comme "donc il nous
le faut" — cette logique a été explicitement écartée en §0.

**Sources** : 3 des 4 produits cités vérifiés par lecture directe de leur
page publique le 21/09/2026 (AttendanceGM, Konkouré, Kuwa). Wali
(walirh.com) a renvoyé une erreur 403 à chaque tentative — ses
caractéristiques restent non vérifiées, marquées ⚠️.

| Fonctionnalité | **Yelen** | Wali ⚠️ (non vérifié) | AttendanceGM | Konkouré | Kuwa |
|---|---|---|---|---|---|
| Clock In/Out simple | ✅ | 🟡 (annoncé) | ✅ | ✅ | ✅ |
| QR code | ✅ (requis arrivée/fin de shift) | 🟡 (annoncé) | ✅ "scan et c'est fait, sans PIN ni app" | 🟡 (non explicitement cité comme méthode) | ✅ "QR à l'entrée" |
| Selfie / reconnaissance faciale | ❌ | ⚪ | 🔜 *"Coming Soon"* — ZKTeco + reconnaissance faciale | ⚪ | ✅ "selfie optionnel quand un site veut une preuve" |
| Géolocalisation / GPS | ❌ (colonnes prêtes, jamais validées) | 🟡 (annoncé) | ✅ | ✅ "zones de travail géolocalisées par site" | ✅ "pointage verrouillé à l'emplacement" |
| Multi-site | ❌ (une seule entité par institution) | ⚪ | ✅ | ✅ | ✅ "plusieurs agences depuis un seul compte" |
| Offline + synchronisation | ❌ (écran d'erreur seulement) | 🟡 (annoncé) | ✅ "synchronisé silencieusement au retour du réseau" | ✅ "fonctionne même sur réseau lent" | ⚪ |
| Corrections avec workflow | 🟡 backend complet, **zéro UI** | 🟡 (annoncé "avec validation") | ⚪ | ⚪ | ⚪ |
| Audit trail | ✅ backend, ❌ consultable en UI | ⚪ | ⚪ | ✅ "exportables pour paie et audits" | ⚪ |
| Rapports multi-période / export | 🟡 (CSV ponctuel jour uniquement) | ⚪ | ⚪ | ✅ | ⚪ |
| Intégration paie | ❌ | ✅ (Wali est un produit paie avant tout) | ⚪ | ✅ | ✅ |
| Prix public affiché | — | — | — | ✅ 440k–2,2M GNF/mois selon effectif | — |

Ce tableau confirme que plusieurs propriétés déjà identifiées en §2 par
la voie "standards internationaux" (offline, géolocalisation,
multi-site, intégration paie) sont **aussi** déjà attendues localement —
ce qui renforce leur pertinence sans en être la justification première.
À l'inverse, aucun des trois concurrents vérifiés ne met en avant le
workflow d'approbation ni le reporting analytique poussé — deux
propriétés que §2 identifie pourtant comme standard enterprise. C'est un
signal que la cible internationale (§0, §2) va **au-delà** de ce que le
marché local donne à voir aujourd'hui, pas un argument pour les
minimiser.

---

## 4. Écarts prioritaires

Classement par **écart entre "propriété enterprise manquante" et "coût
technique pour la combler"** — la colonne "signal marché local" est
donnée à titre indicatif, pas comme justification :

| Écart | Propriété enterprise concernée (§0.2) | Gravité usage réel | Coût technique estimé | Signal marché local (indicatif) |
|---|---|---|---|---|
| Corrections sans UI | Gestion des exceptions | **Élevée** — bloquant dès le 1er oubli de pointage réel | Faible — API déjà prête, juste un écran à construire | Faible mise en avant marketing, mais besoin opérationnel réel |
| Cron non confirmé en prod | Observabilité / fiabilité | **Élevée** si réellement inactif (silencieux) | Nul — vérification SQL, pas de code | N/A |
| QR jamais testé sur device réel | Fiabilité de capture | **Élevée** — un pointage qui échoue en usage réel bloque l'accès au poste | Nul à faible (test, correctifs mineurs) | Standard chez tous les concurrents vérifiés |
| Absence de workflow d'approbation | Processus managérial | Moyenne — la correction directe fonctionne en attendant, mais ne scale pas avec la confiance | Moyen — ajoute un état "en attente d'approbation" au modèle de correction existant | Non mis en avant localement, propriété identifiée via §2 uniquement |
| Audit trail non consultable | Audit permanent | Moyenne — la donnée existe, juste pas visible | Faible — écran de lecture seule sur une table déjà là | Konkouré le met en avant ("exportables pour audits") |
| Offline + queue | Continuité de service | Moyenne à élevée selon la zone de déploiement | **Élevé** — nouvelle architecture (queue locale, idempotence, sync) | Standard chez 2/3 concurrents vérifiés |
| Géolocalisation validée | Validation contextuelle | Moyenne — utile pour la confiance employeur, pas bloquant pour l'usage de base | Moyen — colonnes déjà là, logique de validation + UI de zone à construire | Standard chez 3/3 concurrents vérifiés |
| Multi-site | Extensibilité architecture | Faible pour une petite institution, **élevée** pour une chaîne | **Élevé** — extension de schéma non triviale | Standard chez 3/3 concurrents vérifiés |
| Rapports multi-période / export | Données exploitables | Moyenne — utile en fin de mois, pas quotidien | Moyen | Mis en avant chez Konkouré ("pour la paie et les audits") |
| Notifications proactives | Anomalies traitées en continu | Moyenne — utile pour la réactivité managériale | Moyen — logique de déclenchement + canal (push/email déjà existants ailleurs dans Yelen) | Non identifié chez les concurrents vérifiés |
| API / intégrations | Ouverture du système | Faible aujourd'hui, dépend entièrement du positionnement voulu | Élevé — nécessite une couche d'API documentée, authentification tierce | Wali/Konkouré/Kuwa orientés paie, donc probablement intégrés en interne à leur propre système |
| Biométrie (selfie/empreinte) | Capture multi-canal | Faible aujourd'hui | Élevé si empreinte/WebAuthn, moyen si simple selfie | 2/3 l'ont en "coming soon" ou option |
| Intégration paie | Ouverture du système | Dépend entièrement de la vision produit (Yelen n'est pas un produit de paie aujourd'hui) | Très élevé — sort du périmètre actuel de Yelen | Argument de vente principal de Wali, axe fort chez Konkouré/Kuwa |

---

## 5. Architecture cible — ce que chaque écart demanderait

Description de haut niveau uniquement — aucun code, aucune migration
proposée ici. Objectif : donner à Bryan une idée du niveau d'effort réel
derrière chaque brique, pas un plan d'implémentation.

### 5.1 Corrections avec UI (le plus rentable)
Aucun changement de schéma. Ajouter, dans `EmployeDetailModal` et/ou
`PresencesView`, des actions qui appellent la route
`/api/institution/clock-in/corrections` déjà fonctionnelle : bouton
"Ajouter un pointage oublié" sur un jour Absent/Incomplet, bouton
"Corriger" sur une ligne du flux live, et un écran de consultation de
`attendance_audit_logs` (lecture seule, filtrable par employé/date).
C'est le seul écart de ce document qui ne touche à aucune table.

### 5.2 Confirmation du cron + observabilité
Pas un chantier de code — une vérification SQL par Bryan
(`SELECT * FROM cron.job`, `cron.job_run_details`) et, si le besoin se
confirme, l'ajout d'un indicateur simple côté dashboard ("Dernier calcul :
il y a X minutes", dérivé de `daily_attendance.calcule_le`) pour rendre
visible un job qui s'arrêterait silencieusement.

### 5.3 Test QR réel + durcissement
Pas d'architecture nouvelle — un test réel sur plusieurs téléphones
(Android/iOS, conditions de luminosité variées), correctifs mineurs
probables (permissions caméra refusées, QR flou, écran figé).

### 5.4 Workflow d'approbation
S'appuierait sur le modèle de correction existant
(`attendance_audit_logs`) en lui ajoutant un état intermédiaire — une
correction proposée par un rôle donné (ex. manager) resterait
"en attente" jusqu'à validation par un rôle supérieur (ex. admin), avant
d'être réellement écrite dans `attendance_logs`. Demanderait une nouvelle
table ou une extension d'état sur le mécanisme de correction actuel, plus
une file d'attente d'approbations côté dashboard. Effort modéré,
conditionné à une vraie décision : Yelen veut-il un vrai circuit à 2
niveaux, ou la correction directe par un admin (déjà prévue à l'API)
suffit-elle pour la taille d'entreprise visée aujourd'hui ?

### 5.5 Offline + synchronisation (le plus gros chantier technique)
Nécessiterait : file d'attente locale (IndexedDB, pas juste
`localStorage` vu le volume potentiel), un identifiant idempotent généré
côté client à l'insertion dans la file (pour que
`attendance_logs.insert` ne duplique jamais un pointage rejoué), une
détection de reconnexion (`navigator.onLine` + tentative réelle, pas
seulement l'event browser qui peut mentir), et une UI qui montre
clairement "en attente de synchronisation" sur le portail. Impact sur le
schéma : ajouter une colonne d'idempotence sur `attendance_logs` (ex.
`client_token unique`). C'est un chantier de plusieurs semaines, pas de
jours — la complexité n'est pas la queue elle-même mais la garantie
qu'un pointage ne se duplique ni ne se perde entre plusieurs tentatives
de sync.

### 5.6 Géolocalisation validée
Les colonnes existent déjà (`attendance_logs.latitude/longitude`).
Manquerait : une table `work_zones` (ou équivalent) définissant un centre
+ rayon par institution (ou par site si le multi-site arrive en même
temps, voir §5.7), une validation côté route `/api/clock/pointage` qui
compare la position envoyée à la zone attendue, et une UI côté dashboard
pour définir/visualiser cette zone (une carte, probablement
`react-leaflet` déjà dépendance du projet). Question produit à trancher
avant tout code : que faire d'un pointage hors-zone — bloquer, ou
accepter en le marquant "hors-zone" pour supervision a posteriori.

### 5.7 Multi-site
Le changement le plus structurant du lot. Aujourd'hui,
`institutions.slug` porte l'URL du portail et tout le reste
(`departments`, `employees`, `work_schedules`) est directement rattaché
à `institution_id` — une seule "adresse" par institution. Passer
multi-site demanderait une nouvelle entité `sites` (nom, adresse,
slug propre ou sous-chemin `/clock/{institution}/{site}`,
géolocalisation de référence) intercalée entre `institutions` et
`employees`/`departments`/`work_schedules`. C'est une migration de fond,
pas un ajout de colonne — à ne considérer que si un besoin client réel
se présente, pas par anticipation, même si l'architecture cible doit
pouvoir l'accueillir sans refonte majeure le jour venu.

### 5.8 Rapports multi-période
Pas de nouveau schéma — un nouvel endpoint (ou extension de
`/api/institution/clock-in/attendance`) acceptant une plage de dates et
agrégeant `daily_attendance` sur la période, plus une UI de sélection de
période côté dashboard. Effort raisonnable, isolé.

### 5.9 Notifications proactives
Réutiliserait l'infrastructure de notifications déjà existante dans
Yelen (`notifications`, push VAPID déjà en place pour d'autres modules)
plutôt qu'un nouveau système. Demanderait un déclencheur (le job
`clock-in-daily-attendance` ou une route dédiée) qui insère une
notification sur retard/absence/oubli de clock-out détecté. Effort
modéré, réutilise l'existant.

### 5.10 API / intégrations et biométrie / intégration paie
Les trois sortent significativement du périmètre actuel et méritent une
décision de positionnement produit explicite avant toute estimation
technique sérieuse. Une API documentée demanderait authentification
tierce (clé API par institution, distincte du JWT interne), rate
limiting dédié, versionnement — un vrai chantier de plateforme, pas une
extension de Clock In. La biométrie pourrait réutiliser le pattern
WebAuthn déjà construit côté citoyen mais adapté à un contexte kiosque
partagé (device non personnel), ce qui change beaucoup de choses
(WebAuthn est pensé pour un device personnel de confiance).
L'intégration paie n'a **aucune fondation existante** dans Yelen — c'est
un domaine entièrement nouveau (calcul de salaire, retenues, bulletins),
pas une extension de Clock In.

---

## 6. Vers une définition de "V1 production-grade"

Proposition de barre minimale — un premier palier vers le standard
international visé (§0), pas une parité avec un concurrent local. **À
valider ou modifier par Bryan, pas une conclusion** :

1. Cron confirmé actif + indicateur de fraîcheur visible au dashboard (§5.2) — *observabilité*
2. QR testé et fiabilisé sur device réel (§5.3) — *fiabilité de capture*
3. Corrections accessibles depuis l'UI, au moins sur la fiche employé (§5.1) — *gestion des exceptions*
4. Audit trail consultable (même lecture seule minimale) — *audit permanent*
5. Une réponse au cas "pas de réseau au moment de pointer" au-delà de l'écran d'erreur actuel — pas nécessairement la queue complète de §5.5, mais au minimum un message qui dit à l'employé "réessayez, rien n'a été perdu côté serveur" plutôt qu'un échec silencieux ambigu — *premier pas vers la continuité de service*

Géolocalisation, multi-site, workflow d'approbation à 2 niveaux,
biométrie, API, paie relèveraient d'un palier "V2 enterprise" plutôt que
d'un plancher V1 — ce sont des propriétés de maturité plus profonde, pas
des conditions minimales d'utilisabilité. Encore une fois : c'est une
proposition de lecture, pas une décision.

---

## 7. Roadmap proposée (à valider, non engagée)

Phasage par rapport gravité/coût du §4, pas par ordre chronologique
imposé — Bryan reste seul décisionnaire de l'ordre et du "si".

**Phase 1 — Fermer ce qui est déjà construit (le plus rentable)**
Corrections UI (§5.1), consultation audit trail, vérification cron
(§5.2), test QR réel (§5.3), décision sur les stubs visibles non câblés
du portail ("Mes pauses", "Mon historique", "Disponibilités" — les
câbler ou les retirer plutôt que les laisser cliquables sans effet).

**Phase 2 — Propriétés enterprise de base**
Rapports multi-période/export (§5.8), affichage des heures
supplémentaires déjà calculées, notifications proactives (§5.9).

**Phase 3 — Propriétés structurantes (chantiers longs)**
Offline + synchronisation (§5.5), géolocalisation validée (§5.6),
workflow d'approbation (§5.4). Les trois touchent une architecture non
triviale — à ne lancer qu'après une décision explicite sur le niveau de
maturité réellement visé à ce stade du produit.

**Phase 4 — Optionnel / dépend d'un pivot de positionnement**
Multi-site (§5.7, uniquement si un vrai client à plusieurs agences se
présente), API/intégrations et biométrie/intégration paie (§5.10 — la
paie changerait la nature même du produit, question stratégique bien
au-delà de Clock In).

---

## 8. Ce que ce document ne tranche pas

Volontairement laissé ouvert, à décider par Bryan : decision prise par bryan 9/21/2026/  5:44


## 1. Clock In devient-il un axe stratégique ?

**Oui.**

Je recommande de faire de **Yelen Clock In un axe stratégique**, et non un simple module secondaire du dashboard institution.

La raison principale n'est pas simplement que le marché semble intéressant. C'est la nature du produit : le pointage crée une **utilisation quotidienne**, génère des données opérationnelles récurrentes et peut progressivement s'étendre vers horaires, exceptions, approbations, reporting et intégrations.

Les solutions internationales comme Workday et UKG traitent justement le Time & Attendance comme une composante opérationnelle importante de la gestion des équipes, avec pointage mobile, horaires, exceptions, approbations, géorepérage, reporting et intégrations. ([Workday][1])

**Décision : Clock In devient un chantier stratégique Yelen.**

---

## 2. Quel niveau de profondeur enterprise est réaliste pour un développeur solo ?

Il ne serait **pas réaliste de chercher immédiatement à reproduire toute la profondeur d'UKG Pro ou Workday**.

En revanche, il est réaliste de construire une **V1 production-grade extrêmement solide sur le cœur Time & Attendance**, puis d'étendre progressivement.

Le socle actuel de Yelen est déjà suffisamment avancé pour justifier cette approche : il existe notamment l'immuabilité des pointages, l'audit trail, les horaires, les calculs et les APIs. 

### Décision

**V1 proche : oui, production-grade.**

Mais je modifierais légèrement la proposition de l'ingénieure :

**Phase 1 — Fiabiliser le socle existant**

* vérifier le cron en réel ;
* tester réellement le QR ;
* terminer les corrections ;
* rendre l'audit consultable ;
* supprimer/câbler les stubs ;
* tester les parcours réels.

**Phase 2 — Construire les capacités indispensables**

* offline + synchronisation robuste ;
* géolocalisation ;
* gestion propre des exceptions ;
* rapports multi-périodes ;
* notifications ;
* règles de pointage.

**Phase 3 — Enterprise expansion**

* multi-site ;
* méthodes supplémentaires de pointage ;
* workflows avancés ;
* intégrations ;
* capacités workforce supplémentaires.

Je **ne commencerais donc pas plusieurs gros chantiers Phase 3 en parallèle**. Pour un développeur solo, cela augmente fortement le risque de créer beaucoup de fonctionnalités partiellement terminées.

L'objectif est plutôt :

> **un noyau Clock In exceptionnellement fiable avant d'élargir le périmètre.**

C'est cohérent avec les produits internationaux : UKG et Workday disposent de nombreuses capacités, mais leur profondeur vient d'un ensemble intégré de workflows, règles, validations et contrôles — pas simplement d'une longue liste de boutons. ([Workday][2])

---

## 3. Multi-agences ou site unique ?

**Architecture : préparer l'évolution.
Produit V1 : rester simple sur le site unique.**

ne pas faire aujourd'hui une migration lourde vers un modèle multi-site uniquement par anticipation.

L'architecture actuelle rattache directement les employés, départements et horaires à l'institution ; passer maintenant à une entité `sites` serait une modification structurante. 

En revanche, puisque Yelen vise une solution internationale, **ne pas non plus enfermer définitivement l'architecture dans “une institution = une adresse”.**

Donc :

> **V1 commercialisable : site unique.**
> **Architecture : conçue pour pouvoir évoluer vers plusieurs sites.**
> **Multi-site complet : lorsqu'un besoin commercial réel le justifie.**

Les solutions enterprise comme Workday et UKG prennent effectivement en charge des organisations multi-localisations, mais cela ne signifie pas que Yelen doit absorber toute cette complexité dès son premier palier. ([Workday][3])

---

## 4. La connectivité justifie-t-elle l'offline avant tout le reste ?

**Oui — mais après la fermeture des failles du socle déjà construit.**

C'est probablement la décision la plus importante de cette série.

Un système de présence ne peut pas simplement répondre :

> « Pas de connexion. Réessayez. »

si l'employé est réellement en train de commencer son travail.

Les solutions internationales prennent ce problème au sérieux : UKG documente notamment le **punch offline**, avec synchronisation ultérieure, et Workday propose plusieurs méthodes de capture et de continuité selon les configurations. ([UKG][4])

Pour Yelen,  :

**1. Fiabiliser ce qui existe déjà**
↓
**2. Offline + queue + synchronisation idempotente**
↓
**3. Géolocalisation validée**
↓
**4. Rapports / notifications / workflows**
↓
**5. Multi-site et capacités enterprise supplémentaires**

L'offline n'est donc pas un « bonus africain ».

C'est une **propriété de fiabilité du système**.

---

# Décision globale pour Yelen

| Question                                           | Décision                              |
| -------------------------------------------------- | ------------------------------------- |
| Clock In stratégique ?                             | **Oui**                               |
| V1 production-grade ?                              | **Oui**                               |
| Reproduire Workday/UKG immédiatement ?             | **Non**                               |
| Développer plusieurs gros chantiers en parallèle ? | **Non**                               |
| Offline important ?                                | **Oui, priorité élevée**              |
| Géolocalisation ?                                  | **Oui, après sécurisation du socle**  |
| Multi-site immédiatement ?                         | **Non**                               |
| Architecture préparée pour multi-site ?            | **Oui**                               |
| Paie dans Clock In maintenant ?                    | **Non**                               |
| Biométrie maintenant ?                             | **Non**                               |
| Référence qualité ?                                | **Standard international enterprise** |

### La direction a retenir 

**Yelen Clock In devient un produit stratégique.**

Mais son ambition doit être construite par couches :

> **Fiabilité → Time & Attendance solide → Workforce capabilities → Enterprise expansion**

et non :

> **essayer de devenir Workday en une seule version.**

Le point essentiel est que **Yelen possède déjà un socle suffisamment sérieux pour que l'investissement soit rationnel**, mais l'audit montre aussi que sa maturité est actuellement beaucoup plus forte dans le backend que dans l'expérience opérationnelle réelle et la fiabilité terrain. 

C'est donc **la fiabilité réelle du Clock In qui doit devenir la prochaine grande priorité**, avant d'empiler de nouvelles fonctionnalités.


---

*Document de proposition. Aucune implémentation ne doit démarrer sur la
base de ce document seul — attend une priorisation explicite de Bryan
avant tout premier commit.*
