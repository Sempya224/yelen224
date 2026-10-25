# Rapport hebdomadaire — Audit du Lot 1 (moteur de calcul)

Date : 20/10/2026. **Audit uniquement** : aucune route créée, aucun cron
programmé, aucune notification ajoutée, aucune table modifiée. Architecture B
validée (pg_cron → route interne Next → réutilisation de
`rapportsAggregation.ts`), validation **d'architecture seulement**, pas de
mise en production.

Sources lues : `lib/rapportsAggregation.ts`, `app/api/institution/rapports/executif/route.ts`,
`lib/rdvGating.ts`, `app/api/institution/rdv/statut/route.ts`, migrations
`20260915000003`, `20260915000006`, plus les résultats SQL du 20/10/2026.

## 0. Corrections apportées au plan précédent (important)

1. **`calculerRapportExecutif(institutionId)` ne peut PAS être réutilisée
   telle quelle.** Elle n'accepte aucune période : tout est calculé par
   rapport à `new Date()` (« maintenant »). Elle ne sait pas produire la
   semaine précédente complète. Le plan disait « réutilise tel quel » : c'est
   inexact. Ce qu'on réutilise est **la convention**, pas la fonction.
2. **Deux définitions de « semaine » coexistent.** L'écran Rapports existant
   (`rapportsAggregation.ts`, `financeAggregation.ts`) : **dimanche→samedi**,
   semaine en cours « jusqu'à maintenant ». Le brief hebdomadaire :
   **lundi→dimanche**, semaine précédente complète. Les deux écrans afficheront
   des chiffres de « semaine » différents. Mitigation : le rapport affiche
   toujours ses dates exactes ; l'écran existant n'est pas modifié.
3. **Heures locales implicites.** `rapportsAggregation.ts` utilise
   `getDay()/getHours()/new Date(y, m, d)` (fuseau du serveur). Netlify tourne
   en UTC, donc cela équivaut à UTC+0 *par hasard*. Le nouveau code doit
   utiliser des méthodes `getUTC*` explicites.

## 1. Indicateurs calculables, définitions et sources

Légende des blocs : **G** = RDV gratuits (`rdv`), **P** = réservations
payantes (`paid_bookings`), **A** = avis, **R** = rapprochement G↔P.
Période `P` = lundi 00:00:00.000 UTC inclus → lundi suivant 00:00:00.000 UTC
exclu. Aucun total ne mélange G et P.

### Bloc G — RDV gratuits

| Indicateur | Définition | Source |
|---|---|---|
| Demandes reçues | `count(rdv)`, `created_at ∈ P` | `rdv.created_at` |
| Demandes sans réponse > 24 h | `statut='nouveau'`, `created_at ≤ génération − 24 h`, RDV pas encore passé la grâce de 30 min ; instantané « à la génération » | `rdv.statut`, `created_at`, `date_rdv`, `heure_rdv` |
| Acceptées | `accepte_le ∈ P` (historique incomplet : voir §5, anomalie 2) | `rdv.accepte_le` (écrit par la route statut ; plus fiable que `rdv_events`, incomplet) |
| Prestations réalisées | `statut='termine'` ET `date_rdv ∈ P` | `rdv.statut`, `date_rdv` ; `termine_at` pour audit |
| Refus de demande | événement `annulation`, auteur `institution`, `ancien_statut='nouveau'` | `rdv_events` (la route « refuser » écrit `statut='annule'`, il n'existe pas d'usage de `refuse`) |
| Annulations (hors suspension) | `statut='annule'`, `date_rdv ∈ P`, ni suspension ni écrasement (§5) | `rdv.statut`, `rdv_events` |
| Auteur d'une annulation | `rdv.annule_par` si non NULL (`'institution'` écrit par la route actuelle), sinon `rdv_events.auteur_type`, sinon « origine inconnue » | `annule_par` est NULL sur tout l'historique |
| Absences constatées | `presence_status='absent'`, `date_rdv ∈ P`, hors suspension (§5) | `rdv.presence_status` — écrit **uniquement** par une action explicite de l'établissement, avec motif obligatoire |
| RDV non traités | `non_traite_marque_le ∈ P` | Marqueur posé par le job pg_cron (15 min) ; permanent |
| Taux de réalisation / annulation / absence | numérateur ÷ « RDV échus acceptés » = `date_rdv ∈ P`, échus, `accepte_le` non NULL, hors suspension | Seuil §6 |
| Clients distincts servis | `count(distinct citoyen_id)` des `termine`, `date_rdv ∈ P` | `rdv.citoyen_id` (nullable → ignoré si NULL) |
| Nouveaux clients | clients servis sans `termine` antérieur dans la même institution | `rdv` historique |
| Créneaux les plus sollicités | `heure_rdv` par tranche, RDV non annulés, `date_rdv ∈ P` | `rdv.heure_rdv` |

Invariant vérifié dans le code : un RDV ne peut être `termine` que si
`presence_status='present'` (route statut, ligne ~71). Donc *réalisé ⇒
présence confirmée*, et un RDV `termine` ne peut pas être « absent ».

### Bloc P — réservations payantes

| Indicateur | Définition | Source |
|---|---|---|
| Réservations reçues | `count(paid_bookings)`, `created_at ∈ P`, tous statuts | `created_at` |
| **Encaissé** | `sum(montant_paye)` non NULL, `statut IN ('confirme','termine')`, date d'événement = `traite_le`, repli `created_at` si NULL, `∈ P` | Même convention que `rapportsAggregation.ts` (lignes 71, 91-93) |
| Nombre d'encaissements / panier moyen | nombre de lignes à `montant_paye` non NULL ; panier = Encaissé ÷ ce nombre, base affichée | Voir écart ci-dessous |
| No-show payant | `statut='no_show'`, `date_rdv ∈ P` ; montant affiché à part, jamais ajouté à Encaissé | `paid_bookings` |
| Sans suite | `statut='annule'`, `date_rdv ∈ P` | idem |
| Remboursé | `statut='rembourse'`, `traite_le ∈ P` (0 ligne aujourd'hui) | idem |
| Déclaré par le client | `sum(montant_declare_citoyen)`, `declare_le ∈ P`, libellé « non vérifié » | idem |
| Réservations non traitées | `statut='en_attente'` et `depasseFenetreGraceNonTraite(date_rdv, heure_rdv)` ; calculé à la génération (pas de marqueur en base) | `lib/rdvGating.ts` (déjà exporté, prévu pour le payant) |
| Montant sur réservations non traitées | `montant_paye` des `en_attente` : signalé, jamais encaissé | idem |
| Services les plus réservés / encaissés | par `service_id` → `paid_services.nom`, sur la période | jointure FK existante |

**Écart avec l'écran existant** : `rapportsAggregation.ts` remplace un
`montant_paye` NULL par 0 mais **compte quand même la ligne** dans `nb`
(« ventes »). Le rapport hebdomadaire ne compte dans le panier moyen que les
lignes à montant renseigné. Si les deux nombres diffèrent un jour, c'est
attendu et doit être documenté dans le rapport. Aujourd'hui toutes les
réservations `confirme` ont un montant (6 sur 6), donc aucune divergence
observée.

### Bloc A — avis

`avis.created_at ∈ P`, `masque=false`, `brouillon=false` : nombre, note
moyenne (toujours avec le nombre), nombre de notes ≤ 2 sans
`reponse_institution`. À vérifier au Lot 1 : noms exacts des colonnes par un
`SELECT information_schema` (non revérifiés dans cet audit).

### Bloc R — rapprochement payant ↔ RDV (informatif, jamais additif)

Clé d'indice : (`institution_id`, `citoyen_id`, `date_rdv`, `heure_rdv`).
Résultats réels du 20/10 : 16 réservations ; 10 avec exactement 1 candidat,
2 avec 2 candidats, 4 sans candidat.

| Classe | Règle | Usage |
|---|---|---|
| Confirmé | exactement 1 RDV candidat | Peut afficher « X réservations payantes correspondent à un RDV identifié » |
| Ambigu | ≥ 2 RDV candidats | Compté à part, jamais attribué à un RDV |
| Sans RDV | 0 candidat | Compté à part |

Une correspondance est un **indice**, pas une preuve d'identité. Elle n'entre
dans aucun total ni pourcentage ; elle sert uniquement à informer.

## 2. Période et fuseau

- Semaine : lundi 00:00:00.000 UTC → dimanche 23:59:59.999 UTC. Clé de
  stockage : `semaine_debut` (date du lundi).
- Fuseau : Guinée = UTC+0 toute l'année (hypothèse déjà documentée dans le
  projet). Toutes les bornes en `getUTC*`, jamais d'heure locale du serveur.
- Génération : lundi 06:00 UTC, pour la semaine écoulée. Comparaison :
  semaine précédente de même longueur.
- Les `date_rdv`/`heure_rdv` (sans fuseau en base) sont lues comme UTC.
  Attention : `lib/rdvGating.ts` construit ses dates en heure locale
  (`new Date(y, m-1, d, …)`) ; le nouveau code ne doit pas l'appeler sans
  vérifier que l'environnement d'exécution est UTC, ou doit réécrire la
  comparaison en UTC.
- Contrôle de période : une semaine est « complète » seulement si la
  génération a lieu après dimanche 23:59:59.999 UTC.

## 3. Séparation stricte G / P

Types distincts dans le code (`BlocRdvGratuits`, `BlocPaiements`,
`BlocRapprochement`), jamais un champ `total` qui additionne. Si un jour un
total consolidé est voulu : seulement après démonstration d'une règle de
rapprochement fiable (il y a aujourd'hui 4 réservations sans RDV et 2
ambiguës sur 16).

## 4. Seuil de 10 observations

« Observations » = dénominateur du taux (ou nombre de réservations pour une
variation de revenu).

- Taux affiché si dénominateur ≥ 10 sur la période.
- Variation (tendance) affichée si ≥ 10 sur **les deux** périodes comparées.
- Sinon : « Données insuffisantes ». Les comptes bruts restent affichés.
- Un manque de données n'est jamais présenté comme 0. Distinguer
  explicitement « 0 constaté » (données présentes, résultat nul) de
  « non mesurable » (pas de base).
- Sur les données réelles actuelles (25 RDV sur 90 jours pour la meilleure
  institution), presque aucun taux hebdomadaire ne sera affiché : comportement
  attendu et correct.

## 5. Annulations système (lot du 15/09/2026)

Faits établis : la version fautive de `institution_rdv_annuler_si_imminent_et_suspendue()`
a écrasé des RDV **déjà passés** (migration `20260915000006` le corrige). Le
code confirme par ailleurs que `presence_status='absent'` est écrit
uniquement par l'établissement et ne modifie pas `statut`.
**Reste une inférence** : que l'absence ait précédé l'écrasement (cohérent
avec le code, non prouvé par un horodatage d'absence).

Règle, appliquée par RDV portant un événement `annulation`/`system` :

| Condition | Classe | Effet |
|---|---|---|
| `created_at` de l'événement **<** `date_rdv + heure_rdv` | Annulation par suspension | Compte à part, exclue des taux |
| `created_at` de l'événement **≥** `date_rdv + heure_rdv` | Écrasement après coup | N'est pas une annulation ; le RDV est lu d'après `presence_status` (absent ⇒ absence) ou `non_traite_marque_le` (⇒ non traité). Sinon classé « annulation système postérieure, non qualifiée » |
| Aucun événement | Annulation d'origine inconnue ou ancienne | `annule_par`, sinon « origine inconnue » |

**Résultat de V5 (exécutée par Bryan le 20/10/2026)** : 18 événements
`annulation`/`system`.
- **17 « écrasement après coup »** : un seul lot, événement du 15/09/2026
  09:04:41, RDV du 13/07 au 15/09 07:00, tous antérieurs à l'événement.
  Dont **12 avec `presence_status='absent'`** (RDV-2026-000001, 02, 04, 05,
  08, 09, 10, 12, 13, 17, 21, 25) et **5 sans présence renseignée**
  (RDV-2026-000026 à 000030).
- **1 « suspension » authentique** : RDV-2026-000031 (RDV du 15/09 10:50,
  événement 08:53, donc avant l'heure du RDV).
- Le 13e RDV `annule`+`absent` (RDV-2026-000015) n'a aucun événement.

Lecture : les migrations `20260915000004` à `000006` ne modifient que
`statut` et `motif_annulation` (aucune écriture de `presence_status`). Les 12
absences ont donc été posées par une action de l'établissement, pas par la
fonction de suspension ; l'écrasement n'a changé que le statut. L'ordre exact
absence/écrasement reste non démontré, mais le classement par horodatage rend
la règle indépendante de cet ordre : les 12 absences sont conservées, aucune
n'est comptée comme annulation.

**Résultat de V6 (Bryan, 20/10/2026)** — les 5 RDV sans présence
(000026 à 000030) portent tous `non_traite_marque_le = 2026-09-15 07:45:00`
(un seul lot de marquage) avant l'écrasement de 09:04. Ce sont donc des
**RDV non traités à l'origine** (`en_attente` ×4, `nouveau` ×1), puis
écrasés : la règle les lit via `non_traite_marque_le` ⇒ classe « non traité »,
jamais « annulation ». La classe « annulation système postérieure, non
qualifiée » ne s'applique plus à aucun cas connu, elle reste un filet.

Anomalies relevées (à traiter dans le moteur, pas à corriger en base) :
1. **Un événement `annulation` n'implique pas `statut='annule'`.**
   RDV-2026-000029 a un événement `en_attente → annule` mais son statut
   actuel est `en_attente` (rétabli après coup). Le moteur doit croiser le
   **statut courant** ET l'événement, jamais l'événement seul.
2. **`accepte_le` NULL sur des RDV ayant été `en_attente`** (RDV-000026 :
   `ancien_statut='en_attente'`, `accepte_le` NULL). « Accepté » doit donc
   se lire : `accepte_le` non NULL, OU un événement `confirmation`, OU un
   événement dont `ancien_statut='en_attente'`. Pour les semaines générées
   après déploiement, la route statut écrit `accepte_le` : l'écart ne vise
   que l'historique.
3. **Date de marquage ≠ date du RDV.** Le lot du 15/09 a marqué en une fois
   des RDV de dates différentes. « Non traités de la période » se mesure sur
   `non_traite_marque_le ∈ P` (date de constat), jamais sur `date_rdv`. Une
   régénération historique attribuerait donc ces 5 RDV à la semaine du 15/09.
4. **RDV créé après son propre horaire** : RDV-2026-000030 (`created_at`
   15/09 07:22, `date_rdv` 15/09 07:00). Cas limite de données de test :
   ne pas le traiter comme une erreur, il devient simplement « non traité ».

Cette règle n'affecte que des semaines passées ; le moteur ne sera pas
rétro-généré pour les semaines d'avant le déploiement.

## 6. Règles de décision confirmées

- **Semaine vide** : aucune demande créée, aucun RDV daté, aucune réservation
  payante créée/traitée, aucun avis, aucun marquage « non traité » dans `P`.
  ⇒ instantané enregistré avec `vide=true` (pour l'historique et
  l'idempotence), **aucune notification**.
- **Demande sans réponse > 24 h** : horodatage réel `created_at`, évaluée à
  la génération, libellée « à la date de génération ». Un RDV déjà « non
  traité » n'est plus compté ici (il bascule dans l'indicateur dédié).
- **Seuil de 10** : voir §4.

## 7. Exemples chiffrés (jeu d'essai synthétique, vérifiable à la main)

Semaine P = lun 12/10 → dim 18/10/2026. Génération : 19/10 06:00.

**Exemple 1 — bloc G.** Huit RDV :

| Id | created_at | date/heure | État final | Particularités |
|---|---|---|---|---|
| r1 | 13/10 | 14/10 10:00 | termine | present, accepte_le renseigné |
| r2 | 13/10 | 14/10 11:00 | termine | present, accepte_le renseigné |
| r3 | 12/10 | 15/10 09:00 | annule | événement citoyen le 14/10, accepte_le renseigné |
| r4 | 14/10 | 16/10 09:00 | en_attente | presence_status=absent, accepte_le renseigné |
| r5 | 15/10 | 20/10 09:00 | nouveau | hors période d'activité |
| r6 | 10/10 | 16/10 14:00 | annule | événement système le 16/10 06:00 (avant le RDV) |
| r7 | 08/10 | 13/10 09:00 | annule | presence_status=absent, événement système le 15/10 09:00 (après le RDV), accepte_le renseigné |
| r8 | 16/10 | 17/10 08:00 | nouveau | `non_traite_marque_le` = 17/10 08:30 |

Résultats attendus :
- Demandes reçues (`created_at ∈ P`) : r1, r2, r3, r4, r5, r8 = **6**.
- Prestations réalisées (`termine`, `date_rdv ∈ P`) : r1, r2 = **2**.
- Annulations hors suspension : r3 = **1** (auteur citoyen).
- Annulations par suspension : r6 = **1** (événement avant le RDV).
- Écrasement après coup : r7 ⇒ pas une annulation.
- Absences : r4 et r7 = **2**.
- Non traités : r8 = **1**.
- RDV échus acceptés hors suspension (`date_rdv ∈ P`, échus, `accepte_le`) :
  r1, r2, r3, r4, r7 = **5** ⇒ 5 < 10 ⇒ aucun taux affiché,
  « Données insuffisantes » ; les comptes ci-dessus restent affichés.
- Demandes sans réponse > 24 h : r5 (nouveau, créé le 15/10, RDV non passé)
  = **1** ; r8 exclu (déjà non traité).
- Clients servis : dépend des `citoyen_id` de r1 et r2 (2 si distincts).

**Exemple 2 — seuil franchi.** Semaine courante : 12 RDV échus acceptés, 9
`termine` ⇒ taux de réalisation **75 %** affiché (12 ≥ 10). Semaine
précédente : 8 échus acceptés ⇒ la **tendance n'est pas affichée** (8 < 10),
motif « Données insuffisantes pour comparer ».

**Exemple 3 — bloc P.**

| Id | statut | montant_paye | traite_le | created_at | RDV candidats |
|---|---|---|---|---|---|
| b1 | confirme | 2000 | 14/10 | 13/10 | 1 |
| b2 | confirme | 3000 | NULL | 15/10 | 2 |
| b3 | termine | 1000 | 16/10 | 10/10 | 0 |
| b4 | no_show | 2000 | NULL | 11/10 | 1 |
| b5 | en_attente | 1500 | NULL | 17/10 | 0, RDV passé de plus de 30 min |

- Encaissé : b1 (traite_le ∈ P) + b2 (repli created_at ∈ P) + b3 (traite_le
  ∈ P) = 2000 + 3000 + 1000 = **6000**, **3** encaissements ⇒ panier moyen
  **2000** (base 3 affichée).
- No-show payant : b4 = 2000 **à part**, hors Encaissé.
- Montant sur réservations non traitées : b5 = 1500, **réservation non
  traitée** = 1, jamais encaissé.
- Rapprochement : b1 confirmé ; b2 ambigu ; b3 et b5 sans RDV ; b4 confirmé.
  Aucun total ne fusionne G et P.
- Variation de revenu : 3 réservations < 10 ⇒ non affichée.

**Exemple 4 — semaine vide.** Aucun événement dans `P` ⇒ instantané
`vide=true`, 0 notification.

## 8. Tests : situation réelle

Le projet n'a aucun framework de test (`CLAUDE.md`). Options :

1. **Ajouter un framework (ex. vitest, dépendance de développement)** et
   écrire les exemples ci-dessus comme tests du moteur pur. **Décision
   Bryan** (dépendance à installer par lui).
2. Sans framework : un script de vérification exécuté manuellement qui
   compare la sortie du moteur à des `SELECT` équivalents sur la base réelle.

Dans les deux cas : fonctions pures (lignes brutes + période → instantané),
requêtes et écriture séparées, ce qui rend les exemples 1 à 4 testables sans
base.

## 9. Sécurité et exécution de la future route (conception, non implémentée)

- **Secret dédié** `CRON_RAPPORT_SECRET`, en-tête de requête, comparaison en
  **temps constant** (`crypto.timingSafeEqual`, runtime Node), jamais exposé
  au frontend. Réponse **404 générique** si absent ou faux (sans distinguer
  les cas). Secret côté Supabase (Vault, comme `service_role_key`) et côté
  Netlify.
- **À vérifier avant le Lot 3** : que `proxy.ts` (anti-abus edge, rate limit,
  géoblocage) ne bloque ni ne limite les appels de `pg_net` vers
  `/api/internal/*`.
- **Fan-out** : le cron appelle une fonction SQL qui lance, via `pg_net`, une
  requête par institution éligible (asynchrone). Pas de boucle longue dans
  une seule fonction Netlify.
- **Idempotence** : `UNIQUE (institution_id, semaine_debut)` ;
  `INSERT … ON CONFLICT DO NOTHING RETURNING`. Une relance du même cycle ne
  crée jamais de second rapport.
- **Notification exactement-une-fois** : réservée par
  `UPDATE … SET notifie_le = now() WHERE notifie_le IS NULL RETURNING`
  *avant* l'envoi. Avantage : jamais de doublon. Coût : en cas de plantage
  entre la réservation et l'envoi, la notification est perdue (risque
  accepté, tracé dans le journal d'exécution).
- **Journal d'exécution** : une ligne par tentative (institution, semaine,
  résultat `ok | vide | deja_genere | erreur`, message d'erreur, durée),
  consultable par SQL ; aucune donnée client dedans.
- **Reprise après échec** : second passage du cron le lundi à 12:00 et le
  mardi à 06:00 (idempotents). Test de reprise prévu : tuer l'exécution entre
  l'insertion et la notification, relancer, vérifier 1 rapport, 0 ou 1
  notification, jamais 2.

## 10. Vérification SQL complémentaire (lecture seule) — V5

Classer les annulations système selon la règle d'horodatage :

```sql
SELECT r.reference, r.date_rdv, r.heure_rdv, r.presence_status,
       e.created_at AS evenement_le,
       (r.date_rdv + r.heure_rdv) AS rdv_le,
       CASE WHEN e.created_at < (r.date_rdv + r.heure_rdv) THEN 'suspension'
            ELSE 'ecrasement_apres_coup' END AS classe
FROM public.rdv r
JOIN public.rdv_events e ON e.rdv_id = r.id
WHERE e.action = 'annulation' AND e.auteur_type = 'system'
ORDER BY classe, r.reference;
```

À noter : la comparaison mélange `timestamptz` et `timestamp` ; en UTC+0 elle
est exacte, ce qui est l'hypothèse du projet.

## 11. Questions ouvertes pour Bryan

1. Framework de test : vitest (dépendance dev) ou script manuel ?
2. Colonnes exactes de `avis` à confirmer par `information_schema` (Lot 1).
3. Faut-il tracer les semaines vides dans l'historique (`vide=true`, ma
   proposition) ou ne rien stocker ?
4. Accord sur l'écart de semaine (dim→sam existant, lun→dim hebdomadaire).
