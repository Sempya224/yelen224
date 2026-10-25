# Gestion des comptes inactifs (citoyens + Yelen Business)

Statut : **Phases 1-3 réalisées le 15/10/2026** (audit, conception validée,
implémentation contrôlée — autorisation CEO explicite reçue pour la
Phase 3). **Aucune migration exécutée, aucun déploiement, aucune
activation réelle** — mode observation à false partout (voir rapport final,
§Phase 3, en bas de ce document). Phase 4 (déploiement/activation)
**non commencée**, conditionnée à 30 jours d'observation + validation de
Bryan.

Décision CEO déclenchant ce chantier : J30 rappel, J60 avertissement,
J90 suspension réversible, politiques séparées citoyens / Yelen Business,
compteur remis à zéro par une connexion vérifiée ou une action métier
qualifiante. Zéro suppression de données, zéro interruption d'opération
métier sans règle validée, zéro suspension auto avant validation du
parcours de réactivation.

## 1) Ce qui existe déjà et qu'il ne faut pas redupliquer

Le projet a **déjà construit exactement ce type de moteur deux fois**,
pour deux causes différentes (jamais l'inactivité) :

### a) `institution_suspensions` — "Espace suspendu v2" (17/08/2026, étendu 15/09/2026)
- Table événement insert-only : `reference` (séquence `SUS-{année}-{8}`),
  `motif`, `duree_jours`/`jusqu_au` (NULL = indéfini), `statut` (`active`/
  `levee`), `levee_par` (`admin`/`auto`/`revision`), **`origine`** (ajoutée
  15/09/2026 : `admin` / `auto_rdv_non_traites`, `CHECK` — **conçue pour
  accueillir une 3e valeur** sans rien casser).
- `institution_suspension_revisions` : système d'appel, une seule révision
  `en_attente` à la fois (contrainte unique en base), traitée par un admin.
- Effet : `institutions.statut = 'suspendue'` → écran `CompteSuspenduScreen`,
  dashboard limité à `ALLOWED_TABS_SUSPENDU` (Communication/Support,
  Paramètres/Compte) — **mais chaque route API revérifie indépendamment le
  statut**, l'UI n'est qu'un confort, pas la vraie barrière.
- Réactivation : cron horaire (`institution-suspension-autoreactivate`,
  pg_cron + pg_net + secret Vault `service_role_key`) lève toute suspension
  dont `jusqu_au` est dépassé. Une suspension indéfinie (`jusqu_au` NULL,
  cas `auto_rdv_non_traites` à 10 occurrences) ne se lève QUE par révision
  admin acceptée — jamais automatiquement.
- Détection pour la cause existante (`auto_rdv_non_traites`,
  `institution_rdv_evaluer_restriction()`, SQL pur, cron 15 min) :
  fenêtre glissante 30 jours, paliers 3→7j / 5→30j / 10→indéfini,
  checkpoint sur la dernière révision acceptée (évite qu'une réouverture
  immédiate reparte des compteurs pré-révision).
- Cascade métier : si un RDV `nouveau`/`en_attente` tombe dans les 48h
  suivantes pendant que l'institution reste suspendue, il est **annulé
  automatiquement** (`rdv.statut='annule'`, `paid_bookings` jumeau annulé),
  avec un message citoyen qui ne mentionne jamais "suspension" (ton
  DoorDash : s'excuser, ne jamais blâmer, jamais exposer la cause interne).

### b) `citoyen_rdv_restrictions` — restriction no-show (03/09/2026)
- Même architecture exacte (table événement, `niveau` `restreint_7j`/
  `restreint_30j`/`clos`, `citoyen_rdv_appels` miroir de
  `institution_suspension_revisions`, cron horaire d'auto-réactivation).
- Différence volontaire et **explicitement actée** : aucune colonne sur
  `users`, aucun blocage de compte global — seule la fonctionnalité RDV est
  bloquée (policy `WITH CHECK` sur `rdv`/`paid_bookings` en INSERT). Le
  commentaire de la migration dit littéralement "jamais un blocage global
  du compte citoyen, ce que le brief interdit explicitement" (brief
  no-show, pas celui-ci).

**Conséquence pour ce chantier** : côté Yelen Business, le moteur
d'inactivité devrait très probablement être une **3e valeur d'`origine`**
sur `institution_suspensions` (ex. `auto_inactivite`) plutôt qu'une
nouvelle table — récupère gratuitement l'écran de suspension, le système
de révision/appel et l'auto-réactivation horaire déjà en prod. Côté
citoyen, il n'existe **aucun équivalent "blocage de compte global"** :
`citoyen_rdv_restrictions` a explicitement refusé ce rôle. Une suspension
J90 citoyenne est donc un **concept entièrement nouveau** côté citoyen, et
elle entre en tension frontale avec une décision produit antérieure
(`chantier-strategie-retention-v2`, voir CLAUDE.md) : *"jamais un blocage
global du compte citoyen"* — décision prise pour un contexte différent
(no-show), mais qui montre une sensibilité de fond sur ce sujet. **Point à
trancher explicitement avec le CEO avant la conception**, pas une simple
formalité technique.

## 2) Suivi d'activité — ce qui existe, ce qui manque

- **Citoyens** : authentification 100% Supabase Auth (`supabase.auth.verifyOtp`
  côté client, `app/login/page.tsx`/`app/inscription/page.tsx`) → Supabase
  renseigne nativement `auth.users.last_sign_in_at` à chaque connexion
  vérifiée, sans aucun code applicatif. C'est un signal déjà fiable et
  gratuit pour "connexion vérifiée" — aucune nouvelle colonne nécessaire
  pour ce seul événement. En revanche, **aucune colonne n'existe
  aujourd'hui** pour une action métier qualifiante faite en session longue
  (ex. prendre un RDV 3 jours après la dernière connexion) : `users` n'a
  aucun `derniere_activite_le`, et je n'ai trouvé aucune table centralisant
  "dernière action" tous types confondus pour un citoyen.
- **Yelen Business** : JWT custom (`lib/institutionAuth.ts`), zéro session
  Supabase Auth, donc **zéro `last_sign_in_at` natif**. `institutions` n'a
  aucune colonne de dernière connexion/activité au niveau tenant.
  `institution_membres.derniere_connexion` existe (ajoutée 05/08/2026,
  `20260805000016_equipe_securite_tracabilite.sql`) mais c'est un suivi
  **par membre**, pas au niveau de l'institution — une institution avec 5
  membres dont un seul se connecte encore resterait "active" si on
  agrège par `MAX(derniere_connexion)`, ce qui est probablement le bon
  comportement mais reste une décision à valider explicitement.
- **`journal_activite`** (boîte noire institution, 15/07/2026) journalise
  déjà chaque action d'un membre avec horodatage — c'est un historique
  d'audit, pas une table d'état, et il ne couvre que les institutions
  (rien côté citoyen). Pourrait servir de **vérification croisée**
  ("dernière ligne journal_activite de cette institution") mais ne doit
  pas devenir la source de vérité principale (volume/coût de requête,
  portée différente de ce qu'on veut compter).
- Aucune colonne `statut`/`derniere_activite_le` n'existe sur `users` ni
  `institutions` à ce jour (vérifié par recherche exhaustive des `ALTER
  TABLE users|institutions ADD COLUMN` dans `supabase/migrations/`).

## 3) Opérations à protéger — état réel

- **RDV** : `rdv.statut` (`nouveau`/`en_attente`/`confirme`/`refuse`/
  `annule`/`termine`), cycle piloté par `lib/rdvGating.ts` + `rdv_events`
  (audit immuable). Le seul précédent d'annulation automatique liée à une
  suspension (`institution_rdv_annuler_si_imminent_et_suspendue`, cron
  15 min) **annule activement** les RDV non traités dans les 48h — c'est
  le comportement voulu pour une suspension *disciplinaire*
  (l'institution ne répond pas). Pour une suspension *pour inactivité*,
  ce même réflexe serait probablement le mauvais choix par défaut : un
  citoyen ou une institution "inactifs" côté connexion peuvent très bien
  avoir un RDV réel et confirmé à venir — l'annuler unilatéralement casse
  un engagement réel. **Décision Phase 2 à trancher explicitement.**
- **Réservations payées / paiements / remboursements** : `paid_bookings`
  (`statut`, `montant_paye`, `methode_paiement`, `traite_le`), `recus`
  (génération PDF, tri-partite citoyen/institution/Yelen), `transactions`
  (journal financier `TRX-{année}-{6}`). Aucun de ces flux ne vérifie
  aujourd'hui un état d'inactivité (normal, le système n'existe pas
  encore) — ce sont les premiers candidats à "ne jamais interrompre".
- **Documents / dossiers en cours** : `citoyen_documents` (7 statuts,
  `document_events` audit immuable, `lib/citoyenDocuments.ts` seul point
  d'écriture) — un dossier "en cours de vérification" côté institution ne
  doit pas se figer si l'institution est suspendue entre-temps pour
  inactivité alors qu'un autre membre de son équipe reste actif.

## 4) Notifications — conventions déjà en place à réutiliser

- `lib/notificationEngine.ts` (service_role, bypass RLS, push Web-Push
  best-effort si clés VAPID présentes) — point d'écriture central déjà
  utilisé pour les notifications multi-phases RDV. Toute notification
  J30/J60/J90 devrait passer par ce module plutôt que réinventer un insert
  direct, **sauf** si elle doit être déclenchée depuis une Edge Function
  Deno (web-push non importable depuis Deno — convention déjà actée :
  `rappels-rdv`, `institution-suspension-autoreactivate`,
  `citoyen-rdv-restriction-autoreactivate` font un insert direct minimal
  dans `notifications`, pas de push réel depuis le cron).
- Salutation Bonjour/Bon après-midi/Bonsoir + prénom obligatoire en
  `titre` (règle CEO 20/07/2026, dupliquée dans chaque Edge Function faute
  d'import possible du module Next.js).
- 9 cron jobs `pg_cron` déjà actifs (`yelen-rappels-rdv`,
  `yelen-institution-suspension-autoreactivate`,
  `yelen-citoyen-rdv-restriction-autoreactivate`,
  `yelen-institution-rdv-non-traites-evaluer`,
  `yelen-rdv-annulation-institution-suspendue`,
  `yelen-rappels-demarches`, `yelen-documents-relances`,
  `yelen-demarches-recompenses`, `yelen-depenses-alertes`,
  `yelen-annonces-notifications`, `yelen-publications-planifiees`,
  `yelen-clock-in-*`, `yelen-reconciliation-points`,
  `yelen-recuperations-comptes`) — même mécanisme `pg_net.http_post` +
  secret Vault `service_role_key` (déjà créé, ne jamais recréer) à
  réutiliser pour les nouveaux jobs J30/J60/J90.
- **Piège déjà rencontré 2 fois** (`institution_suspensions_revisions`,
  `citoyen_rdv_restrictions`) : le `pg_cron.schedule` échoue
  **silencieusement** tant que la fonction Edge correspondante n'a pas été
  déployée manuellement par Bryan (`supabase functions deploy <nom>`) —
  à documenter explicitement dans la migration du nouveau chantier pour
  ne pas perdre un 3e tour de ce piège.

## 5) Reprise après panne / idempotence — état réel

Aucun mécanisme dédié de "reprise après panne" n'existe pour les cron jobs
actuels au-delà de `cron.job_run_details` (historique Supabase natif,
consultable par SQL). Les jobs existants sont déjà conçus idempotents par
construction (requêtes `WHERE statut = 'active' AND jusqu_au < now()` —
rejouer le job deux fois ne produit pas de double effet), c'est le pattern
à reproduire pour J30/J60/J90 plutôt qu'introduire un nouveau mécanisme de
verrouillage distribué (aucun besoin identifié au volume réel du projet).

## 6) Fichiers / tables probablement concernés (Phase 2, à confirmer)

**Tables (modification, pas de nouvelle table pour Yelen Business)** :
`institution_suspensions` (nouvelle valeur `origine='auto_inactivite'`),
`institutions` (colonne de dernière activité à ajouter — nom à trancher).

**Tables (nouvelles, côté citoyen, vu qu'aucun équivalent n'existe)** :
une table d'état pour la suspension citoyenne (miroir structurel de
`institution_suspensions`, PAS une colonne statut brute sur `users` pour
rester cohérent avec la réticence déjà actée dans ce domaine) + colonne de
dernière activité qualifiante sur `users`.

**Code probablement touché** : `lib/institutionAuth.ts` et point d'entrée
citoyen équivalent (gate de lecture du statut), `middleware.ts` ou layout
serveur pour le blocage citoyen (à concevoir, aucun précédent existant),
`lib/notificationEngine.ts` (nouveaux types de notification), nouvelle(s)
Edge Function(s) + migrations cron, écran citoyen "espace suspendu"
(aucun précédent, à construire), admin (visibilité + override manuel,
probablement `app/admin/institutions/page.tsx` et équivalent citoyen si
un espace admin citoyen existe — à vérifier en Phase 2).

## 7) Points à trancher avec le CEO avant la conception (Phase 2)

1. **Tension décision produit** : suspension de compte citoyen globale
   (demandée ici) vs décision antérieure "jamais de blocage global du
   compte citoyen" (contexte no-show). Confirmation explicite requise que
   ce chantier prime sciemment sur cette décision pour le motif
   inactivité.
2. **RDV à venir confirmés pendant une suspension pour inactivité** :
   jamais annulés automatiquement (recommandation), contrairement au
   précédent disciplinaire existant — à valider.
3. **Granularité Yelen Business** : activité mesurée par institution
   (`MAX` sur tous les membres) ou par compte principal uniquement ?
4. **Liste exacte des "actions métier qualifiantes"** qui remettent le
   compteur à zéro, par côté (citoyen : prise de RDV, paiement, avis... ;
   institution : traitement RDV, réponse avis, édition profil...) —
   nécessaire avant d'écrire le point d'écriture central (même discipline
   que `moyenne_avis`/`lib/rdvGating.ts` : un seul calcul, jamais dupliqué
   route par route).
5. **Déploiement en mode observation** (demandé en Phase 4) : combien de
   temps avant d'activer réellement les notifications/suspensions ?

Aucune ligne de code, migration ou modification de schéma n'a été
produite à ce stade — ce document était la Phase 1 uniquement.

---

## Phase 2 — Conception (proposition, en attente de validation CEO/Bryan)

### Décision CEO complémentaire reçue (15/10/2026) — contraintes actées

- Philosophie : qualité de l'engagement réel, pas la taille de la base.
  Ne jamais conserver un compte artificiellement pour la statistique.
- **La simple présence d'un enregistrement (démarche, projet, dépense...)
  n'est PAS une preuve d'activité récente** — seul l'instant où l'action a
  été posée compte, jamais l'existence continue de la ligne en base.
- Compteur remis à zéro par connexion vérifiée OU action métier
  qualifiante (confirmé, J30/J60/J90 inchangés).
- **Zéro suppression de données, zéro annulation automatique d'un
  engagement réel (RDV, paiement, reçu, document) du seul fait de la
  suspension pour inactivité** — confirme et tranche le point 2 soulevé en
  Phase 1 : contrairement à `institution_rdv_annuler_si_imminent_et_suspendue`
  (suspension disciplinaire), une suspension pour inactivité ne doit JAMAIS
  déclencher la même cascade d'annulation. Les dossiers/RDV/paiements
  continuent de vivre selon leurs propres règles métier, indépendamment du
  statut d'activité de leur propriétaire.
- Une absence de progression dans un programme (ex. Mes démarches,
  Rewards) est une règle métier **séparée**, qui ne doit jamais se
  substituer à ce moteur si une connexion vérifiée ou une action
  qualifiante a eu lieu entre temps — ce chantier ne doit donc lire
  QUE les deux signaux définis (connexion, action qualifiante), jamais
  "présence/absence de contenu" dans une table produit.
- Tranche implicitement le point 1 de Phase 1 (tension avec "jamais de
  blocage global du compte citoyen") : le CEO maintient la suspension
  compte citoyen à J90, "sous réserve des exceptions métier et de la
  validation technique" — donc actée, mais avec un filet d'exceptions à
  définir (voir plus bas) avant activation réelle.

### 2.1 — Principe directeur : un seul moteur, deux lecteurs de signal

Un **moteur central de règles** unique (seuils J30/J60/J90, logique
d'escalade, déduplication, réactivation) paramétré par une **politique**
par côté (citoyen / Yelen Business) qui ne diffère que sur :
- la source du signal "connexion vérifiée",
- la source du signal "action métier qualifiante",
- la table de suspension cible.

Pas de doublon avec les moteurs existants : réutilise `institution_suspensions`
(nouvelle valeur `origine`) côté Yelen Business ; côté citoyen, nouvelle
table dédiée **structurellement identique** à `institution_suspensions`
(même squelette événementiel) mais distincte de `citoyen_rdv_restrictions`,
qui reste réservée à sa portée actuelle (no-show, RDV uniquement) — les
deux tables citoyen coexistent sans jamais se lire l'une l'autre.

### 2.2 — Signal "connexion vérifiée" (lecture seule, aucune duplication)

- **Citoyen** : `auth.users.last_sign_in_at` (natif Supabase Auth, déjà
  renseigné à chaque `verifyOtp` réussi — zéro nouvelle écriture).
- **Yelen Business** : `MAX(institution_membres.derniere_connexion)
  WHERE institution_membres.institution_id = X AND actif = true` — exclut
  les sièges désactivés (confirmé : `institution_membres.actif boolean`
  existe déjà). Point 3 de Phase 1 (granularité) tranché par cette
  proposition : l'institution est active si **au moins un membre actif**
  s'est connecté récemment — à confirmer explicitement, c'est un choix
  produit (une institution à 5 sièges où 1 seul membre revient encore
  reste "active").

### 2.3 — Signal "action métier qualifiante" (nouvelle colonne, écriture centralisée)

Nouvelle colonne nullable par côté : `users.derniere_action_qualifiante_le`
et `institutions.derniere_action_qualifiante_le` — écrites **uniquement**
par une fonction serveur unique par côté (`lib/activiteCitoyenne.ts::toucherActiviteCitoyenne(citoyenId)`,
`lib/activiteInstitution.ts::toucherActiviteInstitution(institutionId)`),
jamais un `UPDATE` direct dupliqué route par route — même discipline que
`lib/rdvGating.ts`/le bug `moyenne_avis` déjà rencontré deux fois dans ce
projet.

**Allowlist proposée des actions qualifiantes (à confirmer explicitement
avant implémentation — c'est un choix produit, pas une déduction
technique)** :

| Côté | Actions proposées comme qualifiantes |
|---|---|
| Citoyen | Création d'un RDV (gratuit/payant), paiement effectué, avis publié (non brouillon), document soumis, message envoyé, création/mise à jour explicite d'une démarche ou d'un projet, modification de profil/paramètres |
| Yelen Business | Traitement d'un RDV (confirmer/refuser/absent/terminé), réponse à un avis, publication d'une annonce/offre, modification des disponibilités, validation d'un paiement, action sur un document client, modification du profil |

Explicitement **non qualifiant** par construction (conforme à la décision
CEO) : la simple existence d'une ligne dans `citoyen_projets`/`citoyen_demarches`/
`citoyen_depenses` sans action nouvelle, un simple chargement de page
(GET), une notification reçue mais non agie.

### 2.4 — Activité effective (calcul, jamais stocké tel quel)

```
derniere_activite(acteur) = GREATEST(
  connexion_verifiee(acteur),       -- 2.2
  derniere_action_qualifiante_le,   -- 2.3
  created_at                        -- plancher : un compte neuf n'est jamais "à J30" le jour de sa création
)
```

Calculé à la volée dans la fonction d'évaluation cron, jamais persisté
comme une vérité indépendante — élimine tout risque de drift (même
principe que `calculerCheckInStatus`/`rdvGating.ts` : une seule formule).

### 2.5 — États et transitions (par côté, symétrique)

Nouvelles colonnes marqueurs (pattern `non_traite_marque_le` déjà utilisé
dans le projet — marqueur permanent posé par le cron, jamais recalculé a
posteriori, mais **effacé dès que l'activité reprend**, voir 2.6) :
`inactivite_j30_notifie_le`, `inactivite_j60_notifie_le` (nullable,
`users`/`institutions`).

Cron quotidien (`yelen-citoyen-inactivite-evaluer`,
`yelen-institution-inactivite-evaluer`), idempotent, même esprit que
`institution_rdv_evaluer_restriction` :

1. `derniere_activite` ≥ J30 et < J60, `inactivite_j30_notifie_le` IS NULL
   → notifier (rappel), poser le marqueur.
2. `derniere_activite` ≥ J60 et < J90, `inactivite_j60_notifie_le` IS NULL
   → notifier (avertissement), poser le marqueur.
3. `derniere_activite` ≥ J90 et pas déjà suspendu pour `origine='auto_inactivite'`
   actif → créer la suspension (voir 2.7), notifier.

### 2.6 — Réactivation : événementielle, pas par cron

Différence volontaire avec le mécanisme existant (`institution-suspension-autoreactivate`,
basé sur `jusqu_au` écoulé) : ici la sortie de suspension doit être
**immédiate** dès la preuve d'activité, pas à la prochaine passe horaire.
Donc : `toucherActiviteCitoyenne()`/`toucherActiviteInstitution()` (2.3)
et le point de vérification de connexion (2.2) appellent systématiquement
une fonction `reactiverSiInactif(acteurId)` qui, si une suspension
`origine='auto_inactivite'` est `active`, la lève (`levee_par='auto'`),
remet `statut` à sa valeur active, efface `inactivite_j30_notifie_le`/
`inactivite_j60_notifie_le`, notifie ("bon retour"). Aucun appel/révision
admin nécessaire pour ce motif précis — se distingue explicitement de
`auto_rdv_non_traites`, où un palier `clos` ne se lève que par révision.

### 2.7 — Suspension (structure cible)

- **Yelen Business** : ligne `institution_suspensions` avec
  `origine='auto_inactivite'` (3e valeur du `CHECK` existant),
  `institutions.statut='suspendue'` — réutilise intégralement l'écran
  `CompteSuspenduScreen`/`ALLOWED_TABS_SUSPENDU` déjà en prod. Le texte
  affiché doit distinguer la cause (inactivité ≠ RDV non traités ≠ admin)
  — `CompteSuspenduScreen` lit aujourd'hui `motif` en texte libre, à
  vérifier s'il affiche déjà `origine` ou doit être étendu.
- **Citoyen** : nouvelle table `citoyen_inactivite_suspensions` (miroir
  structurel : `reference` séquencée, `statut active/levee`, `levee_par`
  CHECK `('auto')` uniquement pour ce motif précis — pas de révision admin
  nécessaire par design (2.6), `created_at`). Écran citoyen dédié à
  construire (aucun précédent : premier blocage de compte global côté
  citoyen) — gate à poser au niveau du layout racine authentifié citoyen
  (à localiser précisément en Phase 3, candidat : un server component
  équivalent à `getAuthenticatedInstitutionSession` pour le côté citoyen).

### 2.8 — Exceptions proposées (à valider explicitement, aucune n'est actée)

1. Un compte déjà suspendu pour une autre cause (`origine='admin'` /
   `'auto_rdv_non_traites'` côté institution ; une éventuelle sanction
   citoyen future) n'est jamais aussi suspendu pour inactivité — éviter
   une double suspension incohérente à lever.
2. Un dossier avec une action admin en cours (ex. révision de suspension
   `en_attente`) ne doit pas être perturbé par une suspension inactivité
   qui se déclencherait pendant l'examen.
3. Grâce implicite de `created_at` (2.4) : un compte créé il y a moins de
   30 jours n'est jamais notifié, même sans aucune activité.
4. **Point ouvert** : faut-il exempter un citoyen/institution avec un RDV
   confirmé à venir (donc un engagement réel non encore honoré) de la
   suspension elle-même, ou seulement protéger cet engagement une fois
   suspendu (déjà acté en 2.7/philosophie : jamais annulé) ? Proposition :
   ne PAS exempter la suspension elle-même (le compte peut être inactif
   côté connexion tout en ayant un RDV pris il y a longtemps) — seul
   l'engagement reste protégé. À confirmer.

### 2.9 — Déduplication des notifications

Garantie par construction : les marqueurs `inactivite_j30_notifie_le`/
`_j60_notifie_le` empêchent un renvoi tant qu'ils sont posés ; ils ne sont
effacés que par une reprise d'activité réelle (2.6) ou par la levée
définitive de la suspension — jamais par le seul écoulement du temps.
Aucune nouvelle notification J30/J60 tant que la suspension J90 est
active (elle a déjà son propre message).

### 2.10 — Points encore ouverts avant d'écrire la moindre migration (statut initial)

1. Validation de l'allowlist d'actions qualifiantes (2.3) — liste
   proposée, pas confirmée.
2. Granularité Yelen Business "au moins un membre actif" (2.2) — à
   confirmer.
3. Exception 2.8.4 (RDV futur confirmé face à une suspension inactivité).
4. Durée du mode observation (Phase 4) avant activation réelle des
   notifications/suspensions.
5. Contenu exact de l'écran citoyen "compte suspendu pour inactivité"
   (aucun précédent UI à copier, contrairement au côté institution).

Dès validation de ces points, passage à l'écriture des migrations SQL
(non exécutées par moi — remises à Bryan, conformément au protocole) et
du code applicatif (Phase 3 : tests, avant toute activation réelle en
Phase 4).

### 2.11 — Arbitrages reçus le 15/10/2026 (revue CEO) — résolution des 5 points

**⚠️ Ces arbitrages valident la conception comme base de travail. Ils ne
constituent PAS l'accord explicite de Bryan pour démarrer la Phase 3
(écriture des migrations/tests) — ce document reste une proposition tant
que cet accord n'a pas été donné séparément, conformément au protocole
"Zéro fix avant validation explicite".**

1. **Actions qualifiantes** : l'allowlist proposée en 2.3 est retenue
   comme base — à affiner uniquement si Bryan identifie une action
   manquante/à exclure au moment de l'implémentation, pas une nouvelle
   ronde de conception.

2. **Activité Yelen Business** : confirmé — actif si **au moins un membre
   actif ET autorisé** se connecte **ou réalise une action qualifiante**.
   Ajustement par rapport à 2.2 : le signal "action qualifiante" de 2.3
   (aujourd'hui stocké uniquement au niveau `institutions`, sans
   distinction de membre) compte donc lui aussi pour la granularité
   "au moins un membre", pas seulement la connexion. "Autorisé" exclut
   tout membre dont l'accès est restreint au point de ne pas pouvoir agir
   (`institution_membres.actif = true` couvre déjà la désactivation ;
   `accesRestreints` — voir `lib/institutionAuth.ts` — est à vérifier au
   moment de l'implémentation pour savoir s'il doit aussi exclure un
   membre dont tous les accès sont restreints, cas limite rare).

3. **Rendez-vous futurs et nouvelles opérations** : confirmé — aucune
   annulation automatique d'un engagement existant (acté dès la décision
   CEO précédente). **Nouveau** : le traitement des *nouvelles* opérations
   pendant une suspension pour inactivité doit être défini séparément des
   engagements existants. Proposition pour Phase 3 :
   - **Citoyen suspendu** : bloque la création de nouveaux RDV/réservations
     payantes — même mécanisme que `citoyen_rdv_restrictions` (policy
     `WITH CHECK` sur `rdv`/`paid_bookings`), étendu pour vérifier aussi
     `citoyen_inactivite_suspensions`. Les RDV déjà existants restent
     inchangés (lecture, présence, paiement déjà engagé).
   - **Yelen Business suspendue** : déjà couvert par le comportement
     existant de `institutions.statut='suspendue'` (la fiche publique
     n'accepte plus de nouvelle réservation tant que `statut != 'validee'`,
     comportement identique aux autres causes de suspension — à
     revérifier précisément en Phase 3, pas supposé ici). Les RDV déjà
     pris restent traitables par l'établissement (consultation,
     confirmation de présence) — pas bloqués par ce chantier.

4. **Mode observation** : 30 jours retenus, avec rapport des faux
   positifs à présenter avant toute activation réelle des notifications
   et suspensions (Phase 4). **Précision actée** : cette durée est un
   paramètre de pilotage technique du déploiement (vérifier que le moteur
   ne déclenche pas à tort), **distincte** de toute politique de
   conservation de données au sens CNIL — ce chantier n'introduit aucune
   nouvelle donnée personnelle au-delà d'horodatages déjà équivalents à
   l'existant (`derniere_connexion`, `created_at`), et ne modifie pas les
   politiques de conservation déjà en place ailleurs dans le produit. Si
   une politique de conservation formelle doit être documentée pour ces
   nouveaux horodatages/tables, ce serait un chantier séparé (RGPD/CNIL),
   pas un sous-produit de ce mode observation.

5. **Écran citoyen suspendu** : contenu cadré — expliquer la raison
   (inactivité, jamais honteux/accusateur, même ton que le reste du
   produit), garder un accès à l'assistance/support (miroir de
   `ALLOWED_TABS_SUSPENDU` côté institution qui garde Communication/Support
   navigable), et une voie de réactivation. **Point de sécurité à traiter
   en Phase 3** : la réactivation (2.6) se déclenche sur une connexion
   vérifiée OU une action qualifiante — si le citoyen atteint cet écran
   avec une session déjà ouverte avant la suspension, le simple
   chargement de la page ne doit PAS suffire à se réactiver (ce serait un
   GET passif, pas un signal qualifiant). L'écran doit donc proposer une
   action explicite et vérifiée (ex. ré-authentification OTP, ou une
   action qualifiante réelle choisie dans l'allowlist) plutôt qu'un simple
   bouton "Réactiver" qui ferait confiance à la session existante — cohérent
   avec les recommandations OWASP sur la revalidation d'une session avant
   une reprise de droits sensibles.

### 2.12 — État d'avancement

Conception validée comme base de travail. Phase 3 autorisée explicitement
par le CEO le 15/10/2026 (périmètre : migrations, implémentation serveur,
notifications, contrôles d'accès, parcours de réactivation, tests —
conditions impératives listées en tête de son message d'autorisation,
reprises une à une au §Phase 3 ci-dessous).

---

## Phase 3 — Rapport final (implémentation contrôlée, 15/10/2026)

**Aucun `git commit`, aucun `git push`, aucune commande SQL exécutée par
moi contre la base — tout ci-dessous est écrit sur disque, à exécuter/
déployer par Bryan.** `npx tsc --noEmit` et `npx vitest run` ont été
exécutés (lecture seule, aucune donnée affectée) pour vérifier le travail
avant de clore cette phase.

### 3.1 — Fichiers livrés

**Migrations SQL (non exécutées), `supabase/migrations/`** :
- `20261015000001_inactivite_fondations.sql` — colonnes d'activité sur
  `users`/`institutions`, extension du `CHECK` sur
  `institution_suspensions.origine` (+`auto_inactivite`), nouvelle table
  `citoyen_inactivite_suspensions`, `inactivite_observation_log`
  (journal d'observation insert-only), `inactivite_mode` (singleton,
  2 flags à `false` par défaut).
- `20261015000002_inactivite_moteur_evaluation.sql` — fonctions SQL pures
  `citoyen_inactivite_evaluer()`/`institution_inactivite_evaluer()` (+
  leurs fonctions `notifier`/`suspendre` et `yelen_salutation()`), cron
  quotidien (`yelen-citoyen-inactivite-evaluer` 03h00,
  `yelen-institution-inactivite-evaluer` 03h05).
- `20261015000003_inactivite_bloque_nouvelles_reservations.sql` — étend
  les policies RLS `rdv_citoyen_insert`/`paid_bookings_citoyen_insert`
  (déjà posées par `20260903000001`) pour bloquer aussi la création de
  nouvelles réservations pendant une suspension citoyen pour inactivité.

**Code applicatif (nouveaux fichiers)** :
`lib/activiteCitoyenne.ts`, `lib/activiteInstitution.ts`,
`lib/inactiviteCitoyenne.ts`, `app/api/citoyen/compte/suspension-inactivite/route.ts`,
`app/api/citoyen/auth/touch-login/route.ts`,
`components/SuspensionInactiviteCitoyenGate.tsx`, `app/compte/suspendu/page.tsx`,
`lib/activiteCitoyenne.test.ts`, `lib/activiteInstitution.test.ts`.

**Code applicatif (fichiers modifiés)** :
`lib/institutionAuth.ts` (réactivation branchée sur `creerSessionInstitution`,
point unique couvrant les 5 flux de connexion institution existants),
`app/login/page.tsx` (appel `touch-login` après `verifyOtp` frais),
`app/layout.tsx` (montage du gate citoyen), `app/api/institution/suspension/route.ts`
(expose `origine`), `app/[slug]/[id]/components/CompteSuspenduScreen.tsx`
(texte contextualisé pour `auto_inactivite`), `app/rdv/[id]/actions.ts`
(pré-vérification humanisée + action qualifiante sur les 3 flux de
création RDV/réservation), `app/api/institution/rdv/statut/route.ts`,
`app/api/institution/paid-bookings/valider/route.ts`,
`app/api/institution/avis/repondre/route.ts`,
`app/api/citoyen/avis/notifier-publication/route.ts` (action qualifiante
institution/citoyen sur un sous-ensemble représentatif de l'allowlist
2.11.1 — voir §3.4 pour ce qui reste à instrumenter).

### 3.2 — Respect des conditions impératives du CEO

| Condition | Statut |
|---|---|
| Réutiliser les moteurs existants sans dupliquer leur logique | **Fait** — `institution_suspensions` étendu (nouvelle valeur `origine`) plutôt qu'une table parallèle ; côté citoyen, nouvelle table nécessaire (aucun équivalent de blocage de compte global n'existait) mais au squelette identique, jamais un recalcul dupliqué des seuils (tout vit dans les 2 fonctions SQL `_evaluer()`). |
| Préserver tous les engagements et données existants | **Fait** — zéro `DELETE`, zéro `UPDATE` sur `rdv`/`paid_bookings`/`recus`/`citoyen_documents` existants dans tout ce chantier. Seule la *création* de nouvelles réservations est bloquée pendant une suspension (3.1, migration 3), jamais l'existant. |
| Ne jamais déclencher de suspension automatique avant validation du parcours de réactivation | **Fait** — `inactivite_mode.suspensions_actives = false` par défaut (posé par la migration 1) ; tant que Bryan ne l'active pas lui-même, `*_inactivite_suspendre()` se contente d'écrire dans `inactivite_observation_log`, jamais dans `citoyen_inactivite_suspensions`/`institution_suspensions`. |
| Maintenir le mode observation 30 jours avant activation | **Fait, techniquement garanti** — rien dans le code ne force une durée de 30 jours (ce serait un minuteur arbitraire) ; la garantie réelle est que l'activation est un geste manuel explicite de Bryan (`UPDATE inactivite_mode SET ...`), jamais automatique. Le compteur des 30 jours est donc une discipline opérationnelle, pas un mécanisme technique — à respecter au moment de l'activation, pas avant. |
| Déployer les Edge Functions avant de programmer les cron | **Sans objet pour ce chantier** — contrairement aux 2 précédents disciplinaires (réactivation par `jusqu_au` écoulé, nécessitant un cron + une Edge Function), la détection J30/J60/J90 est 100% SQL pur (même précédent que `institution_rdv_non_traites_suspension`) et la réactivation est événementielle (code Next.js, pas de cron). Aucune Edge Function n'a été créée dans ce chantier — rien à déployer avant le cron de la migration 2. |
| Ne pas déployer en production sans validation tests/retour arrière/observation | **Respecté** — rien n'a été exécuté ni déployé ; voir §3.6 (plan de retour arrière) et §3.5 (risques résiduels) ci-dessous, à valider avant toute exécution par Bryan. |

### 3.3 — Tests exécutés

- `npx tsc --noEmit` (avec `NODE_OPTIONS=--max-old-space-size=6144`,
  piège déjà connu du projet) : **0 erreur** sur l'ensemble du projet
  après toutes les modifications de ce chantier.
- `npx vitest run lib/activiteCitoyenne.test.ts lib/activiteInstitution.test.ts` :
  **7/7 tests passés**. Couvre : écriture du signal d'action qualifiante
  sans réactivation si le compte n'est pas suspendu ; levée de suspension +
  effacement des marqueurs + notification de retour quand le compte est
  suspendu ; **non-régression critique** — `reactiverInstitutionSiInactif`
  ne touche jamais une suspension active d'une autre origine
  (`admin`/`auto_rdv_non_traites`), vérifié explicitement par un test dédié
  (exception 2.8.1) ; no-op complet en l'absence de toute suspension.
- `npx vitest run` (suite complète du projet, 159 tests) : **153 passés,
  6 échecs** — les 6 échecs sont **tous** dans
  `app/api/qr/validate/route.test.ts`, un fichier que ce chantier n'a
  jamais touché. Vérifié par `git diff --stat HEAD -- lib/rdvGating.ts
  lib/qrValidation.ts app/api/qr/validate/route.ts` : seul `lib/rdvGating.ts`
  a un diff non commité (38 insertions), et il ne vient pas de ce
  chantier — il faisait déjà partie de l'état non commité du dépôt avant
  le début de cette session (voir `git status` initial : `lib/rdvGating.ts`
  déjà modifié). **Pas corrigé ici** (hors périmètre explicite de ce
  chantier, et toucher un fichier partagé par un autre chantier en cours
  sans contexte serait risqué) — signalé pour que Bryan le rattache au bon
  chantier avant de committer quoi que ce soit.
- **Non testé par construction** : le seuil de jours (J29 vs J30/60/90)
  vit entièrement en SQL pur (`EXTRACT(DAY FROM ...)`), pas en TypeScript
  — aucun test vitest ne peut l'exercer. Seule vérification possible :
  Bryan exécute manuellement `SELECT citoyen_inactivite_evaluer();` /
  `SELECT institution_inactivite_evaluer();` en SQL Editor contre des
  lignes de test aux dates ajustées, puis lit
  `SELECT * FROM inactivite_observation_log ORDER BY created_at DESC;`
  pour confirmer le comportement réel avant d'activer quoi que ce soit.

### 3.4 — Ce qui reste explicitement hors de ce tour (honnêteté, pas une case cochée sans preuve)

- **Allowlist d'actions qualifiantes instrumentée partiellement** — câblé :
  citoyen (création RDV gratuit/payant/chambre hôtel, publication d'avis),
  institution (traitement RDV, validation réservation payante, réponse à
  un avis). **Pas câblé** : paiement déclaré côté citoyen, soumission de
  document, message envoyé, modification de profil/paramètres (citoyen) ;
  publication d'annonce/offre, modification des disponibilités, action
  sur un document client, modification du profil (institution). Même
  fonction centrale déjà prête (`toucherActiviteCitoyenne`/
  `toucherActiviteInstitution`) — il ne reste qu'à ajouter l'appel dans
  chaque route restante, un chantier de câblage, pas de conception.
- **Vérification visuelle réelle de `/compte/suspendu`** — aucun outil
  navigateur disponible dans cet environnement (même limite documentée
  ailleurs dans CLAUDE.md). Le composant compile et type-check, mais n'a
  jamais été vu rendu.
- **Hypothèse non confirmée** : exclusion des institutions `en_attente`/
  `refusee` du cron d'évaluation (commentée explicitement dans la
  migration 2) — c'est un choix de conception raisonnable, pas une
  certitude produit validée par le CEO.
- **Granularité "membre actif ET autorisé"** (point 2 de la revue CEO) :
  implémenté comme "membre actif" (`institution_membres.actif = true`) ;
  le cas limite d'un membre actif mais dont tous les accès seraient
  restreints (`accesRestreints`) n'est pas distingué — à affiner si ce cas
  réel se présente.
- **Écran admin de rapport d'observation** (lecture de
  `inactivite_observation_log` avec filtres/export) — pas construit, hors
  périmètre explicite de ce tour. Lecture SQL directe par Bryan en
  attendant.

### 3.5 — Risques résiduels

1. **Nom de contrainte CHECK supposé** (migration 1, `institution_suspensions_origine_check`)
   — si Postgres l'a nommée différemment, le `DROP CONSTRAINT IF EXISTS`
   échoue silencieusement (pas d'erreur, mais la nouvelle contrainte avec
   `IF EXISTS` absent sur l'`ADD` lèverait une erreur de double contrainte).
   Bryan doit vérifier le nom réel avant d'exécuter (`\d institution_suspensions`).
2. **`auth.users` accessible depuis une fonction SQL `plpgsql` standard**
   — supposé (convention Supabase usuelle avec le rôle d'exécution du SQL
   Editor), jamais vérifié en conditions réelles dans ce projet pour ce
   cas précis. Si l'accès est refusé, `citoyen_inactivite_evaluer()`
   échouera explicitement (pas un échec silencieux) au premier test manuel.
3. **Aucune Edge Function, donc aucun push réel** — les notifications
   J30/J60/J90/réactivation passent uniquement par un insert direct dans
   `notifications` (lu au prochain chargement) côté SQL, mais PAR
   `envoyerNotification()` (donc avec push réel) côté code applicatif
   (réactivation événementielle) — cohérence déjà actée ailleurs dans le
   projet, pas une régression.
4. **Volume non mesuré** — les deux fonctions d'évaluation parcourent
   respectivement toute la table `users`/`institutions` chaque jour (boucle
   `FOR r IN SELECT ...`) ; au volume réel actuel du projet (quelques
   dizaines de comptes), aucun souci, mais aucun index spécifique n'a été
   ajouté sur `derniere_action_qualifiante_le`/`created_at` — à surveiller
   si la base grossit avant la Phase 4.
5. **Échec pré-existant non lié** (`qr/validate/route.test.ts`, voir 3.3)
   — à ne pas confondre avec une régression de ce chantier au moment de
   committer.

### 3.6 — Plan de retour arrière

- **Avant exécution des migrations** : aucune action nécessaire, rien
  n'est en base.
- **Après exécution, avant toute activation** (état actuel visé à court
  terme) : pas de retour arrière nécessaire — `inactivite_mode` à `false`
  partout rend tout le moteur inerte (observation seule). Pour désactiver
  complètement : `SELECT cron.unschedule('yelen-citoyen-inactivite-evaluer');`
  et `SELECT cron.unschedule('yelen-institution-inactivite-evaluer');`.
- **Rollback complet du schéma** (si le chantier est abandonné) :
  `DROP TABLE citoyen_inactivite_suspensions, inactivite_observation_log, inactivite_mode CASCADE;`
  puis retirer `'auto_inactivite'` du `CHECK` sur `institution_suspensions.origine`
  (remettre l'ancienne liste à 2 valeurs) et `ALTER TABLE users/institutions
  DROP COLUMN derniere_action_qualifiante_le, inactivite_j30_notifie_le, inactivite_j60_notifie_le;`.
  Aucune de ces colonnes/tables n'est référencée par autre chose que le
  code de ce chantier — un rollback ne casse aucune autre fonctionnalité.
- **Après activation réelle** (Phase 4, si un faux positif grave est
  détecté) : `UPDATE inactivite_mode SET suspensions_actives = false;`
  stoppe immédiatement toute nouvelle suspension (les suspensions déjà
  créées restent actives, à lever une par une via
  `UPDATE citoyen_inactivite_suspensions/institution_suspensions SET statut='levee', levee_par='admin', levee_le=now() WHERE id = ...;`).

### 3.7 — Étapes restant à valider avant la Phase 4

1. Bryan exécute les 3 migrations dans l'ordre, vérifie la contrainte
   CHECK (3.5.1) et teste manuellement les 2 fonctions d'évaluation en
   SQL Editor contre quelques lignes réelles/synthétiques.
2. Laisser le cron tourner en mode observation (les 2 flags restent à
   `false`) pendant au moins 30 jours.
3. Lire `inactivite_observation_log` régulièrement — construire le rapport
   de faux positifs demandé par le CEO avant d'envisager l'activation.
4. Trancher les points ouverts du §3.4 (allowlist complète, granularité
   Business, cas `en_attente`/`refusee`) à la lumière des vraies données
   d'observation plutôt qu'en théorie.
5. Seulement alors, activer `notifications_actives` puis, séparément et
   plus tard, `suspensions_actives` — jamais les deux en même temps.
