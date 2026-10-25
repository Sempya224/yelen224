# Rapport hebdomadaire — plan d'implémentation (brouillon, 20/10/2026)

Complète `SPEC_INDICATEURS.md` (définitions). Aucun code ni migration écrit.
Les lots respectent la règle « 2 fichiers maximum à la fois » et
« audit avant modification ».

## 0. Décisions validées par Bryan (20/10/2026)

- Seuil minimal : 10 observations avant tout pourcentage ou toute tendance.
- `no_show` payant : affiché à part, jamais compté comme encaissé.
- Semaine entièrement vide : aucune notification automatique.
- Demande sans réponse : signalée à partir de 24 h (horodatage `created_at`).
- **Point bloquant** : tant que la couverture réservations payantes ↔ RDV
  (requête V1 corrigée) n'est pas connue, aucun total ni pourcentage ne
  croise les deux systèmes. Trois blocs strictement séparés dans le rapport :
  RDV gratuits, réservations payantes, correspondances confirmées. Une donnée
  insuffisante n'est jamais affichée comme un zéro.

### Résultats du Lot 0 (20/10/2026, SQL exécuté par Bryan)

- **V1** : 16 réservations payantes, 12 avec au moins un RDV candidat, donc
  **4 sans aucun RDV** (25 %).
- **V1b** : 2 réservations (1 `confirme`, 1 `no_show`) ont chacune 2 RDV
  candidats. Rapprochement non univoque pour elles.
  → Correspondances confirmées = exactement 1 candidat : 12 − 2 = **10 sur 16**.
  → Les réservations payantes ne sont **pas** un sous-ensemble des RDV : le
  bloc payant se calcule seul, sans passer par `rdv`. Règle de rapprochement
  retenue : confirmée si exactement 1 candidat, « ambiguë » si ≥ 2, « sans
  RDV » si 0 ; jamais fusionnée dans un total.
- **N1** : `notifications.type` est un `text` libre. Le résultat de la requête
  sur les contraintes CHECK n'a pas été transmis : pas de contrainte supposée,
  à confirmer au premier insert de test.
- **N2** : types institution existants en snake_case (`rdv_annule`,
  `avis_publie`, `institution_suspendue_rdv_non_traites`…). Nom proposé :
  `rapport_hebdomadaire`. **[À VÉRIFIER Lot 6]** : un écran qui associe une
  icône/libellé à chaque type et un repli pour un type inconnu.

## 1. Existant à réutiliser (constaté dans le code)

- **Un écran Rapports existe déjà** : `RapportsTab.tsx`,
  `lib/rapportsAggregation.ts` (`calculerRapportExecutif`, KPI
  jour/semaine/mois/année, top services, delta), `lib/rapportsPdf.ts`
  (pdfkit, **déjà installé**), routes `app/api/institution/rapports/{route,executif,pdf}`.
  Convention d'encaissement déjà en place : `paid_bookings.statut IN
  ('confirme','termine')`, date = `traite_le` avec repli `created_at`.
  → La section « Performance commerciale » doit **réutiliser ces fonctions**,
  sinon deux chiffres de revenu hebdomadaire différents coexisteraient.
- Permission : l'onglet `rapports` existe déjà dans la matrice
  (`lib/institutionPermissions.ts`). Aucun nouveau droit à inventer.
- Notifications : `lib/notificationEngine.ts::envoyerNotification`
  (destinataireType `"institution"`). Un doublon historique
  `lib/notifications.ts` existe : utiliser le moteur, pas le doublon. Types de
  notification à enregistrer **[À VÉRIFIER : contrainte sur `notifications.type`]**.
- Planification : pg_cron + pg_net + secret Vault `service_role_key` déjà en
  place (migrations `20260724000009`, `20260805000011`).

## 2. Décision d'architecture à trancher

Où s'exécute le calcul hebdomadaire ?

| Option | Pour | Contre |
|---|---|---|
| A. Edge Function Deno (modèle `clock-in-daily-attendance`) | Pattern déjà connu, pas de timeout Netlify | Logique dupliquée en Deno : deux sources de vérité pour les revenus |
| **B. Route Next interne appelée par pg_cron (recommandée)** | Réutilise `rapportsAggregation.ts` tel quel ; une seule source de vérité | Timeout des fonctions Netlify : traiter une institution par appel (fan-out) ; secret d'appel à créer ; dépend de l'URL de prod (domaine prévu 21/10) |

Recommandation : B, avec une institution par requête, secret dédié
`CRON_RAPPORT_SECRET` (comparaison en temps constant, 404 générique sinon),
route sous `app/api/internal/`. **[DÉCISION BRYAN]**

## 3. Lots

Chaque lot : audit lecture seule → validation Bryan → code → `tsc` → fin.

1. **Lot 0 — dernières vérifications (SQL par Bryan)**
   V1 corrigée (couverture), contrainte/valeurs de `notifications.type`,
   confirmation par le code que `en_attente` = « accepté, à venir ».
2. **Lot 1 — moteur de calcul pur** (`lib/rapportHebdo.ts`, 1 fichier) :
   fonctions pures `(lignes brutes, période) → instantané typé`, version de
   calcul explicite (`version_calcul`), seuil 10 centralisé, règle
   d'horodatage des annulations système, trois blocs séparés. Section
   financière : appel à `rapportsAggregation`, pas de recalcul.
   Le projet n'a aucun framework de test : validation par comparaison
   manuelle avec des `SELECT` sur l'établissement de 25 RDV / 90 jours
   (Bryan exécute, je compare).
3. **Lot 2 — migration** (1 fichier SQL) : table d'instantanés
   (`institution_rapports_hebdo`, `UNIQUE (institution_id, semaine_debut)`,
   `contenu jsonb`, `version_calcul`), RLS activé **sans policy**, trigger
   d'immuabilité (pattern `journal_activite`), grants minimaux. Exécution par
   Bryan uniquement.
4. **Lot 3 — génération** (route interne + migration cron, 2 fichiers) : un
   appel par institution, lundi 06:00 UTC, idempotent (re-run = pas de
   doublon grâce à la contrainte unique), journalisation des échecs, pas de
   notification si la semaine est vide.
5. **Lot 4 — lecture** (2 routes API institution, pattern des routes
   `rapports/*` existantes, permission `rapports`) : liste des semaines +
   détail d'un instantané ; PDF à la demande depuis l'instantané via un
   nouveau module PDF calqué sur `lib/rapportsPdf.ts`.
6. **Lot 5 — interface** : nouvelle vue « Hebdomadaire » **dans**
   `RapportsTab.tsx` (pas un nouvel onglet), historique des semaines,
   composants `components/ui/*` existants, institution = PC d'abord, aucun
   emoji, boutons ≤ 40 px, CTA en `C.gold`, heures en AM/PM si affichées.
7. **Lot 6 — notification** : `envoyerNotification` après génération réussie
   et semaine non vide, lien vers la vue Hebdomadaire.

## 4. Risques connus

- Couverture paid↔rdv inconnue : consolidation bloquée jusqu'au résultat V1.
- Une seule institution a assez de volume pour afficher des pourcentages :
  la plupart des rapports montreront surtout des comptes bruts.
- Données de test (ECOBNAKGN) : ne pas valider la logique sur un seul
  établissement ; prévoir une seconde vérification dès qu'un vrai prestataire
  a de l'activité.
- Fuseau : hypothèse UTC+0 identique au reste du projet.
- Confidentialité : agrégats uniquement dans le rapport général.

## 5. Ordre proposé

Lot 0 (Bryan) → trancher §2 → Lot 1 → Lot 2 → Lot 3 → Lot 4 → Lot 5 → Lot 6.
