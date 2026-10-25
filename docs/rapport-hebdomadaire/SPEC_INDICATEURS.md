# Rapport hebdomadaire d'activité — spécification des indicateurs (V1, brouillon)

Statut : **spécification, aucun code, aucune migration.** Écrite le 20/10/2026
à partir de requêtes SQL réellement exécutées par Bryan (rdv, rdv_events,
paid_bookings, paid_services) et de la lecture du code cité. Tout ce qui n'est
pas confirmé est marqué **[À VÉRIFIER]**.

## 1. Périmètre V1 (décisions Bryan, 20/10/2026)

- Tous les prestataires : socle commun, sections masquées si pas de données.
- Format : rapport dans Yelen + notification + PDF téléchargeable.
- Finances : uniquement des montants réellement enregistrés.
- Zéro LLM : règles déterministes (seuils/comptages), comme `reputationScore.ts`.

## 2. Constats de données (base réelle au 20/10/2026)

| Constat | Source | Conséquence |
|---|---|---|
| `rdv` n'a aucune colonne de montant | information_schema | CA uniquement via `paid_bookings` |
| Statuts `rdv` utilisés : `nouveau` → `en_attente` (= accepté, à venir) → `termine` / `annule`. `confirme` et `refuse` : 0 ligne | enum + répartition | « Réservation confirmée » = `en_attente`, **[À VÉRIFIER dans le code]** |
| `presence` (bool) toujours NULL ; `presence_status` ('present'/'absent') seul utilisé | répartition | Absence = `presence_status='absent'` |
| `annule_par` toujours NULL | requête | Auteur d'une annulation = `rdv_events.auteur_type` |
| `rdv_events` : 0 événement `creation`, 0 `termine` | requête | Demandes = `rdv.created_at` ; réalisées = `rdv.statut='termine'` |
| 18 annulations `system` = fonction de suspension d'institution | migration 20260915000006 | À exclure du taux d'annulation, afficher à part |
| « Non traité » = marqueur distinct `rdv.non_traite_marque_le` (job pg_cron 15 min, RDV passé > 30 min) | migration 20260915000003 | Indicateur à part, jamais fusionné avec absence/annulation |
| 13 RDV `annule` + `absent` ; 12 ont un événement `annulation`/`system` daté du **15/09/2026 09:04:41** (un seul lot, horodatage identique), 1 n'a aucun événement | requête V3 | Très probablement l'écrasement de RDV déjà passés par la version fautive de la fonction de suspension, corrigé le jour même (migration 20260915000006). **Inférence** (en-tête de migration + horodatage), non prouvée. Règle d'horodatage §4 |
| Enum `statut_paid_booking` : `en_attente`, `confirme`, `termine`, `no_show`, `annule`, `rembourse` (0 ligne `termine`/`rembourse` aujourd'hui) | requête V2 | `termine` existe côté payant : un statut « réalisé » payant est possible, non utilisé à ce jour |
| `no_show` payé existe (1 ligne, 2000) | requête | À traiter à part |
| `rdv.service` est NULL sur les 35 RDV | requête V4 | Pas d'analyse par service sur les RDV gratuits ; services = `paid_bookings.service_id` → `paid_services.nom` |
| Jointure `paid_bookings` ↔ `rdv` (même institution/citoyen/date/heure) : 18 lignes jointes pour 16 réservations | requête V1 | Plusieurs RDV par réservation pour au moins 2 cas : lien non fiable, **inconclusif** sur la couverture. Ne jamais joindre les deux pour compter |
| `paid_bookings` : `montant_paye` (nullable), `montant_declare_citoyen` (déclaratif), `traite_le` ; **aucun prix figé à la réservation** | information_schema | « Facturé » n'existe pas ; `montant_declare_citoyen` ≠ encaissé |
| `paid_bookings.statut = en_attente` avec montant : 4 lignes sur 6 | requête | Montant sur réservation non traitée : exclu de « encaissé », signalé |
| Volume : 35 rdv, 2 institutions avec rdv (25 et 3 sur 90 j), 5 institutions, 4 avis | requêtes P3/P4 | Seuils de volume obligatoires, voir §3 |
| Aucune table rapport existante ; `notifications`, `push_subscriptions` existent | P5 | Nouvelle table d'instantanés nécessaire, notifications réutilisées |

## 3. Règles transversales

- **Période** : lundi 00:00:00 → dimanche 23:59:59, UTC+0 (Guinée, hypothèse
  déjà documentée ailleurs dans le projet). Génération le lundi matin.
  Comparaison = semaine précédente équivalente.
- **Décisions validées (20/10/2026)** : seuil 10 ; `no_show` payant à part ;
  aucune notification pour une semaine vide ; demande sans réponse à partir
  de 24 h. Consolidation RDV + payant bloquée tant que V1 n'est pas résolue.
- **Seuil de volume** : un pourcentage ou une tendance n'est affiché que si le
  dénominateur ≥ 10 sur la période ET ≥ 10 sur la période de comparaison.
  Sinon : « Données insuffisantes » (le compte brut reste toujours affiché).
  **[DÉCISION BRYAN]** valeur 10 à confirmer — à ce seuil, 1 institution sur 5
  atteindrait un pourcentage aujourd'hui.
- **Activité vs création** : l'activité d'une semaine se rattache à `date_rdv`
  (RDV dont la date tombe dans la période) ; les nouvelles demandes à
  `created_at`. Les deux ne sont jamais mélangées.
- **Aucun verdict universel** : jamais « bon/mauvais » ; uniquement variation
  vs semaine précédente, avec les deux valeurs et leurs bases.
- **Trois niveaux de formulation** dans le plan d'action : fait mesuré /
  hypothèse (« peut s'expliquer par… ») / action suggérée. Jamais de cause
  affirmée.
- **Confidentialité** : aucun nom de client ni donnée de santé dans le rapport
  général ; agrégats uniquement. Les détails nominatifs restent dans les
  écrans existants (accès permissionné).

## 4. Définitions stables

Notation : `P` = période, `inst` = institution, « échu » = `date_rdv + heure_rdv`
< maintenant au moment de la génération.

| Indicateur | Définition | Notes |
|---|---|---|
| Demandes reçues | `count(rdv)` avec `created_at ∈ P` | `paid_bookings` comptées à part (lien avec `rdv` non fiable, §2) ; jamais additionnées sans règle validée |
| Demandes en attente de réponse | `rdv.statut='nouveau'`, `created_at` < P.fin | Instantané à la génération |
| Acceptées | `rdv_events.action='confirmation'`, `created_at ∈ P` | Valide seulement depuis l'existence de ces événements |
| Prestations réalisées | `rdv.statut='termine'` ET `date_rdv ∈ P` | Jamais assimilée à « payée » |
| Annulations par suspension | `statut='annule'` avec événement `annulation`/`system` **créé avant** `date_rdv + heure_rdv` | Affichées à part, exclues des taux |
| Annulations (hors suspension) | `statut='annule'`, `date_rdv ∈ P`, ni suspension ci-dessus ni écrasement après coup (ci-dessous) | Ventilées citoyen / établissement / origine inconnue (aucun événement) |
| Écrasement après coup | événement `annulation`/`system` créé **après** `date_rdv + heure_rdv` | N'est ni une annulation ni une suspension : le RDV garde son `presence_status` d'origine pour les absences. Neutralise les 12 lignes du 15/09 |
| Absences | `presence_status='absent'`, `date_rdv ∈ P`, hors annulation par suspension (avant l'heure du RDV) | La ligne sans événement (RDV-2026-000015) est comptée en absence |
| RDV non traités | `non_traite_marque_le ∈ P` | Indicateur propre, relié au mécanisme de suspension (3 / 30 j) |
| Taux de réalisation | réalisées ÷ (RDV échus de `P` ayant été acceptés, hors suspension) | Dénominateur affiché. Seuil §3 |
| Taux d'annulation | annulations hors suspension ÷ (RDV de `P` hors suspension) | Idem |
| Taux d'absence | absences ÷ (RDV échus de `P` ayant été acceptés, hors suspension) | Idem |
| Clients distincts servis | `count(distinct citoyen_id)` des RDV `termine`, `date_rdv ∈ P` | `pour_autre=true` : le bénéficiaire n'est pas identifié, **[À VÉRIFIER]** traitement |
| Nouveaux clients | clients servis en `P` sans aucun RDV `termine` antérieur chez `inst` | Historique `rdv` suffisant (pas `rdv_events`) |
| Clients déjà connus | clients servis en `P` − nouveaux | |
| Taux de retour | **Non calculé en V1** — « Données insuffisantes » | Exige cohorte + fenêtre définies ; ne jamais le remplacer par un compte de récurrents |
| Taux d'occupation | **Non calculé en V1** | « Temps réellement disponible » non défini dans le modèle actuel |
| Services les plus demandés / réalisés | **services payants uniquement** : `paid_bookings.service_id` → `paid_services.nom`, demandes (`created_at ∈ P`) et réalisées (`termine`) | `rdv.service` est vide partout → « Données insuffisantes » pour les RDV gratuits |
| Créneaux les plus sollicités | `heure_rdv` par tranche, RDV non annulés de `P` | |
| Nouveaux avis / note moyenne | `avis.created_at ∈ P`, `masque=false`, `brouillon=false` ; moyenne + nombre | Moyenne toujours accompagnée du nombre d'avis |
| Avis négatifs sans réponse | note ≤ 2 et `reponse_institution` NULL | Entrée du plan d'action |
| **Encaissé** | `sum(paid_bookings.montant_paye)`, statut `confirme` ou `termine`, date = `traite_le` (repli `created_at` si NULL) `∈ P` | Même règle que `lib/rapportsAggregation.ts` (écran Rapports existant) : à **réutiliser**, pas recalculer. Un `rembourse` sort naturellement du filtre |
| Remboursé | `sum(montant_paye)` des `rembourse`, `traite_le ∈ P` | Déduit ou affiché à part |
| Déclaré par le client (non vérifié) | `sum(montant_declare_citoyen)`, `declare_le ∈ P` | Libellé explicite, jamais mêlé à Encaissé |
| Montant sur réservations non traitées | `montant_paye` des `en_attente` | Signalé comme point d'attention |
| No-show payant | `no_show` avec `montant_paye` | Affiché à part, **[DÉCISION BRYAN]** : encaissé ou non |
| Panier moyen | Encaissé ÷ nombre de réservations `confirme` avec `montant_paye` non NULL | Base affichée |
| Facturé | **N'existe pas** (aucune facture, aucun prix figé) | Non affiché. Ne pas reconstruire depuis le prix catalogue : il a pu changer |

## 5. Sections V1 et conditions d'affichage

1. Bilan exécutif — toujours (texte généré par gabarits, deux variations
   principales choisies par amplitude, priorité = première règle du plan).
2. Activité et demandes — toujours.
3. Performance commerciale — seulement si ≥ 1 `paid_bookings` dans la période.
4. Clients — toujours ; fidélisation limitée à nouveaux/connus.
5. Services — si ≥ 1 RDV dans la période.
6. Équipe — **hors V1** (Clock In réservé aux comptes Enterprise, données
   non vérifiées pour ce rapport).
7. Qualité et réputation — si ≥ 1 avis dans la période, sinon omise.
8. Plan d'action — 3 priorités maximum, uniquement des règles déclenchées.

## 6. Catalogue de règles du plan d'action (V1)

Ordre de priorité fixe ; au plus 3 règles retenues.

1. **Non traités** — si `non_traite_marque_le` ≥ 1 dans la période : constat
   (nombre, et cumul sur 30 j glissants), rappel du palier de suspension
   (3 / 5 / 10), action : traiter les demandes dès réception, vérification :
   0 nouveau marquage la semaine suivante.
2. **Demandes sans réponse** — si des RDV `nouveau` datent de > 24 h
   **[seuil à valider]**.
3. **Annulations** — si le taux est affichable et en hausse : ventilation par
   auteur et par service, hypothèse formulée avec prudence.
4. **Avis négatifs sans réponse** — nombre, action : répondre.
5. **Montants sur réservations non traitées** — si > 0.

## 7. Stockage et génération (proposition, non réalisée)

- Table d'instantanés, p. ex. `institution_rapports_hebdo` :
  `institution_id`, `semaine_debut`, `semaine_fin`, `version_calcul`,
  `contenu jsonb`, `genere_le`, `UNIQUE (institution_id, semaine_debut)`.
  RLS activé, **aucune policy**, accès service_role (convention du projet).
  Immuable (même pattern de trigger que `journal_activite`) : un rapport
  passé ne change jamais, même si un RDV est corrigé ensuite.
- Génération : fonction Deno + pg_cron le lundi matin (modèle
  `clock-in-daily-attendance`), calcul en fonctions pures versionnées.
- Notification : table `notifications` existante (+ push si abonné).
  **[DÉCISION BRYAN]** : pas de notification pour une semaine totalement vide.
- PDF : généré à la demande depuis l'instantané (`pdfkit`, installation par
  Bryan).
- Historique : liste des instantanés par institution.

## 8. Vérifications SQL encore nécessaires avant implémentation

- **V1** (20/10) inconclusive : jointure produisant plus de lignes que de
  réservations. À refaire par `count(DISTINCT pb.id)` pour savoir combien de
  réservations payantes n'ont aucun RDV jumeau.
- **V2, V3, V4** : faites le 20/10/2026, résultats intégrés au §2.
- Confirmation par lecture du code que `en_attente` = « accepté, à venir ».
- Utilité de `rdv.objet` / `description_besoin` pour une analyse par motif
  (non évalué).

## 9. Hors périmètre V1 (explicite)

Taux de retour, taux d'occupation, section Équipe/Clock In, variantes par
métier (hôtel, clinique, salon…), envoi e-mail, objectifs personnalisés.
