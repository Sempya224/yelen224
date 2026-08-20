# Yelen Trust — Data Model Audit (Lot 2.1)

Rédigé le 16/08/2026, sur décision CEO ("GO — Lot 2 autorisé"), après gel de
`docs/product/YELEN_TRUST_MODEL.md` (Lot 0, référence normative) et clôture
de `docs/product/YELEN_TRUST_DOMAIN_ARCHITECTURE.md` (Lot 1, GO confirmé).

**Règle absolue rappelée par le CEO : aucun développement en bloc.** Ce
document est le Lot 2.1 — audit du modèle de données existant uniquement.
**Aucune table créée, aucune migration écrite, aucune modification de code,
aucun déploiement, aucun commit.** Conforme à la règle CLAUDE.md : Claude
Code n'exécute jamais de SQL sur la base réelle — chaque affirmation ci-
dessous est classée VERIFIED IN CODE (trouvé dans une migration ou un
fichier source, cité) ou VERIFIED IN DATABASE (confirmé par une requête SQL
réellement exécutée par Bryan, avec sa date), ou explicitement **NOT
VERIFIED**.

**Méthode** : lecture exhaustive et systématique des 133 fichiers
`supabase/migrations/*.sql` pour les 9 catégories de tables demandées par le
CEO (recherche par table, trace chronologique complète colonnes/contraintes/
RLS/policies/triggers/index), croisée avec les résultats SQL déjà obtenus
par Bryan au Lot 1 (`docs/product/YELEN_TRUST_DOMAIN_ARCHITECTURE.md`
section 13) et `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` (GAP-06-01 à
GAP-06-08). Ce document ne refait pas ces vérifications — il les réutilise
et les complète là où le niveau de détail exigé par le Lot 2.1 (11
attributs par table) va au-delà de ce que le Lot 1 avait produit.

---

## 0. Rappel des invariants Lot 0 à préserver dans tout ce qui suit

1. Evidence ≠ Signal — un Signal ne peut jamais établir Existence/Identité/
   Autorité.
2. Verification ≠ Reputation — les deux chaînes ne se croisent jamais.
3. La Réputation ne peut jamais établir Identity ou Authority.
4. Aucun score global, aucun badge global basé sur un seul axe.
5. Chaque décision est traçable (acteur, preuve, date, justification).
6. Une régression fait sortir un axe de son état vérifié — jamais un
   maintien silencieux d'un état obsolète.
7. Les preuves historiques ne doivent jamais être détruites.

---

## 1. Constat prioritaire — la découverte qui doit encadrer tout le reste

**`documents_institution` détruit aujourd'hui sa propre preuve à chaque
resoumission — violation directe de l'invariant 7.**

Faits, `app/api/institution/documents/route.ts` (lu intégralement pour ce
lot) :

- La table porte `UNIQUE (institution_id, type)` —
  `documents_institution_institution_type_unique`,
  `20260711000005_documents_institution_workflow.sql` L28-29, **VERIFIED IN
  DATABASE** (confirmé littéralement par la requête 2 de Bryan le
  16/08/2026, Lot 1 §13).
- Le `POST` de cette route fait `sb.storage.from("documents").upload(
  \`${authInstId}/${type}.${ext}\`, ..., { upsert: true })` (chemin fixe,
  un seul fichier possible par institution × type) **puis**
  `documents_institution.upsert({ institution_id, type, statut:"recu",
  motif_rejet:null, examine_le:null, examine_par:null, soumis_le:now(), ...
  }, { onConflict: "institution_id,type" })`.
- Le renvoi n'est autorisé par la route que quand `statut` courant est
  `rejete` ou `complement_demande` (409 sinon) — **c'est-à-dire exactement
  au moment où l'historique de la décision précédente (qui a rejeté, quand,
  pourquoi) a le plus de valeur pour un futur litige ou audit.**

Conséquence : à chaque resoumission, (a) le fichier physique en Storage est
**écrasé** (même chemin, `upsert:true`), et (b) la ligne
`documents_institution` est **écrasée** — `motif_rejet`/`examine_le`/
`examine_par` de la décision précédente sont explicitement remis à `null`
par le payload d'upsert, avant même qu'aucune route n'écrive jamais ces
colonnes en pratique (Lot 1 §3 : "aucune route n'écrit jamais valide/
rejete/examine_par/examine_le" — donc ce risque est aujourd'hui latent,
mais se déclenchera dès la première décision réelle).

Ce n'est pas un cas parmi d'autres : c'est littéralement le nouveau
scénario que le CEO a demandé de vérifier explicitement pour ce lot
("document remplacé", item 9). Voir section 5 pour l'analyse de connexion
avec la future table de décision, et section 7 pour la vérification formelle
du scénario. Ce constat conditionne directement les sections C/D/G de la
clôture.

---

## 2. Cartographie par catégorie (11 attributs par table)

Légende des sources : **[MIG]** = trouvé dans les migrations (VERIFIED IN
CODE) ; **[DB]** = confirmé par requête SQL réelle de Bryan (VERIFIED IN
DATABASE, date citée) ; **[NV]** = NOT VERIFIED, à ne jamais présumer.

### 2.1 `institutions`

- **Rôle métier** : Organization — le sujet central de tous les axes de
  confiance (Existence/Identité/Autorité/Réputation).
- **Propriétaire de la donnée** : l'institution elle-même pour son profil
  (`PUT /api/institution/profile`) ; l'admin pour `statut`/`badge_verifie`/
  `plan`/`avertissements` ; le système (trigger) pour `moyenne_avis`/
  `nb_avis`.
- **Relations** : parent de `institution_responsables` (1:1 CASCADE),
  `institution_membres` (1:N CASCADE), `journal_activite` (1:N CASCADE),
  `signalements` (1:N, nullable depuis le 27/07), et de dizaines d'autres
  tables produit (`rdv`, `annonces`, `paiements`, etc. — hors périmètre de
  ce lot). `documents_institution.institution_id` et
  `avis.institution_id` existent comme colonnes mais **[NV]** : aucune
  déclaration `FOREIGN KEY` explicite vers `institutions` n'a été retrouvée
  dans les 133 migrations pour ces deux colonnes — ces deux tables
  pré-existent les migrations, l'intégrité référentielle réelle en base
  n'est pas confirmée par le code source disponible.
- **Contraintes** : `institutions_secteur_check`, `institutions_statut_
  juridique_check`, `institutions_niveau_confiance_check` **[MIG]**
  (`20260710000001` L12-17), `partenaire_statut` CHECK **[MIG]**
  (`20260726000010` L10), `institutions_slug_unique` UNIQUE +
  `institutions_slug_format` CHECK **[MIG]** (`20260805000010` L50-52).
  PK et contraintes sur les colonnes d'origine (`statut`, `plan`, etc.)
  **[NV]** — pré-existantes.
- **RLS** : **[DB]** `relrowsecurity=true` confirmé 14/08/2026 (GAP-06-01,
  7 tables dont `institutions`).
- **Policies** : une seule trouvée — `institutions_public_read` (`FOR
  SELECT TO anon, authenticated USING (statut = 'validee')`) **[MIG]**
  (`20260709000014`). D'autres policies pré-existantes non exclues,
  **[NV]** au-delà de celle-ci.
- **Grants** : le baseline CLAUDE.md ("14 tables d'origine", dont
  `institutions`) documente des grants historiques larges — mais la
  requête SQL réellement exécutée pour GAP-06-05 (16/08/2026) a listé
  nommément `institution_otp`, `institution_sessions`,
  `transactions_financieres`, `institution_partenariat_demandes`,
  `offres` comme résultats confirmés, **sans citer `institutions`
  explicitement dans la capture retenue**. Traiter comme **probable mais
  non re-confirmé spécifiquement** — voir section 3.
- **Données sensibles** : adresse, ville, téléphone, email, statut_
  juridique, niveau_confiance, badge_verifie — sensibilité modérée une
  fois `statut='validee'` (seule ligne lisible par `anon` via la policy),
  mais une institution `en_attente` ne devrait jamais fuiter au-delà de
  ce filtre.
- **Dépendances applicatives** : quasiment tout le produit (profil
  institution, fiche publique, admin, `lib/documentsInstitution.ts`
  lit `statut_juridique` pour dériver les documents requis).
- **Historique/migrations** : 16+ migrations touchent cette table entre
  09/07 et 05/08/2026 (voir trace complète en annexe de recherche) ; deux
  colonnes ajoutées puis supprimées la même semaine (`site_web`,
  `paid_rdv_active`) — signal de tâtonnement produit, sans impact
  aujourd'hui.
- **Risques de régression** : `statut` (`en_attente→validee`) est un
  simple `UPDATE` admin sans lien avec `documents_institution`
  (`app/api/admin/institutions/[id]/valider/route.ts`, Lot 1 §1) — toute
  connexion future à une décision structurée doit gérer la transition
  sans casser ce chemin déjà en production pour les institutions déjà
  validées.

### 2.2 `institution_responsables`

- **Rôle métier** : déclaration de l'Autorité (responsable légal/
  représentant) — aujourd'hui purement autodéclarée, aucune preuve
  rattachée.
- **Propriétaire** : l'institution (`PUT /api/institution/responsable`,
  simple upsert, zéro contrôle).
- **Relations** : `institution_id uuid NOT NULL UNIQUE REFERENCES
  institutions(id) ON DELETE CASCADE` **[MIG]** — relation 1:1 stricte.
  Aucune relation vers `documents_institution` — confirmé (Lot 1 §10 :
  "aucun document n'y est jamais rattaché").
- **Contraintes** : PK `id`, `institution_id` UNIQUE+NOT NULL+CASCADE,
  `prenom`/`nom` NOT NULL **[MIG]** (deux fichiers dupliqués, voir
  historique).
- **RLS** : **[MIG]** activé dans les deux fichiers dupliqués (même
  statut, donc peu importe lequel des deux a réellement tourné).
- **Policies** : aucune trouvée — commentaire explicite dans la migration
  ("accès exclusivement via routes serveur... aucune policy RLS
  pertinente ici").
- **Grants** : **[DB]** anon+authenticated ont des privilèges complets
  (16/08/2026, Lot 1 §13 requête 3), neutralisés par RLS actif (requête
  4, même date).
- **Données sensibles** : PII directe du responsable légal (nom, prénom,
  téléphone, email, photo).
- **Dépendances applicatives** : un seul point d'écriture (`app/api/
  institution/responsable/route.ts`).
- **Historique/migrations** : **doublon réel** — deux fichiers au même
  timestamp `20260711000002` (`institution_responsable.sql` et
  `_et_fix_langue.sql`), `CREATE TABLE` identique dans les deux. Déjà
  clos par GAP-06-03 : `_et_fix_langue.sql` est la version réellement
  exécutée (commit le jour même, `institutions.langue` confirmé `jsonb`
  par Bryan) ; l'autre fichier est un brouillon jamais assaini dans le
  dépôt.
- **Risques de régression** : table inchangée depuis sa création (aucune
  ALTER trouvée) — faible risque de régression aujourd'hui, mais c'est la
  table qui devra changer de **nature** au Lot 2.2 (passer de déclaratif à
  vérifiable) : toute migration future devra conserver les déclarations
  déjà existantes sans les traiter comme une preuve rétroactive.

### 2.3 `institution_membres`

- **Rôle métier** : comptes d'accès au Dashboard Yelen (RBAC) — distinct
  des employés pointés (Clock In Shift, `employees`). Support potentiel du
  vouching organisationnel (Lot 0 §2C).
- **Propriétaire** : l'institution, gestion réservée au rôle `admin`
  (`equipe.write`).
- **Relations** : `institution_id NOT NULL REFERENCES institutions(id) ON
  DELETE CASCADE` ; `employee_id REFERENCES employees(id) ON DELETE SET
  NULL` ; référencée en `ON DELETE SET NULL` par `institutions.
  disponibilites_modifie_par`, `journal_activite.membre_id`,
  `signalements.assigne_a_membre_id`/`assigne_par_membre_id`/
  `resolu_par_membre_id`/`cloture_par_membre_id`,
  `signalement_notes.auteur_membre_id`,
  `signalement_attachments.ajoute_par_membre_id`.
- **Contraintes** : PK `id`, `institution_id` NOT NULL CASCADE,
  `identifiant` UNIQUE, `role` CHECK 5 valeurs (`admin`/`agent`/
  `comptable`/`superviseur`/`dirigeant`, élargi de 3→5 le 18/07/2026 —
  correction confirmée cette session sur une documentation antérieure qui
  n'en citait que 4), index unique partiel sur `employee_id`.
- **RLS** : **[MIG]** activé à la création (14/07/2026).
- **Policies** : aucune trouvée.
- **Grants** : **[DB]** anon+authenticated privilèges complets
  (16/08/2026), neutralisés par RLS actif.
- **Données sensibles** : `pin_hash`, `totp_secret`/`totp_backup_codes`
  (secrets d'authentification), `failed_attempts`/`locked_until`,
  `derniere_connexion` — sensibilité élevée (compte d'accès opérationnel).
- **Dépendances applicatives** : la quasi-totalité du dashboard
  institution (auth membre, permissions, attribution d'actions).
- **Historique/migrations** : 5 migrations incrémentales et cohérentes
  (14/07 création → 18/07 RBAC élargi → 25/07 TOTP → 05/08 lien employé +
  sécurité + `fonction`), aucun doublon.
- **Risques de régression** : le futur rôle « reviewer » (Lot 0 Primitive
  3) **ne doit jamais** être un rôle `institution_membres` — une
  institution ne peut pas être reviewer de ses propres preuves. Attention
  explicite à ne jamais réutiliser cet enum `role` pour le reviewer, qui
  doit rester exclusivement côté `admin_users` (cohérent avec la
  séparation Organisation/Reviewer/Admin déjà actée PARTIEL au Lot 1 §5).

### 2.4 `documents_institution`

- **Rôle métier** : dépôt de preuves (Evidence) pour Identité/Autorité
  selon `statut_juridique` — seule table qui incarne aujourd'hui la
  chaîne Claims→Evidence du Lot 0.
- **Propriétaire** : l'institution (dépôt) ; le reviewer/admin (décision —
  jamais exercé en pratique, colonnes toujours à leur valeur par défaut,
  confirmé Lot 1 §3).
- **Relations** : `institution_id` — colonne présente (base pré-
  migration), **[NV]** FK explicite non retrouvée dans les migrations.
  `examine_par uuid REFERENCES admins(id)` **[MIG texte source]**, mais
  **[DB]** la contrainte réelle en base référence correctement
  `admin_users(id)` (confirmé par Bryan 16/08/2026, requête 2, Lot 1 §13)
  — le fichier de migration sur disque est simplement périmé (GAP-06-06).
- **Contraintes** : `documents_institution_institution_type_unique UNIQUE
  (institution_id, type)` **[MIG]**, `enum statut_document` (`recu`/
  `valide`/`complement_demande`/`rejete`) **[DB]** les 5 colonnes du
  workflow confirmées exister en production (Bryan, requête 1, Lot 1
  §13). **C'est cette contrainte UNIQUE, combinée à l'upsert applicatif,
  qui cause le problème de la section 1.**
- **RLS** : **[MIG]** activé (`20260711000005` L35) + **[DB]**
  `relrowsecurity=true` confirmé 16/08/2026 (GAP-06-08 requête 4).
- **Policies** : aucune — deny-by-default confirmé, commentaire explicite
  dans la migration.
- **Grants** : **[DB]** anon+authenticated privilèges complets confirmés
  16/08/2026 (GAP-06-08 requête 3), neutralisés par RLS actif.
- **Données sensibles** : **haute sensibilité** — pièces d'identité,
  RCCM, diplômes, preuves de domicile (PII + documents officiels), plus
  les fichiers eux-mêmes en Storage. **Dépendance opérationnelle
  bloquante déjà connue** : le bucket privé `documents` n'a jamais été
  créé (CLAUDE.md `/actions-manuelles-en-attente`, confirmé cassé le
  14/08/2026 en testant le Centre de configuration) — la route échoue
  donc probablement en pratique aujourd'hui pour tout dépôt réel.
- **Dépendances applicatives** : `app/api/institution/documents/route.ts`
  (seul point d'écriture), `lib/documentsInstitution.ts` (source des
  types requis par `statut_juridique`). **Aucune route de lecture/
  décision côté admin n'existe** — la chaîne Claims s'arrête à
  `statut='recu'` (Lot 1 §3, "examen humain" = maillon manquant).
- **Historique/migrations** : une seule migration structurante
  (`20260711000005`), fichier périmé sur le nom de la table FK (GAP-06-06,
  cosmétique, base saine, déjà clos).
- **Risques de régression** : **le plus élevé de toute cette
  cartographie** — voir section 1. Toute future table de décision qui
  référencerait `documents_institution.id` comme « preuve examinée »
  hériterait silencieusement de ce risque tant que la contrainte UNIQUE +
  upsert n'est pas traitée (section 5).

### 2.5 « Vérification » — n'existe pas comme brique dédiée

- **Rôle métier** : sans objet — aucune table. Ce qui en tient lieu
  aujourd'hui : `institutions.statut` (binaire admin,
  `en_attente→validee`), `institutions.badge_verifie`,
  `institutions.niveau_confiance` (écrite une fois à l'inscription,
  jamais relue par aucune autre route — confirmé Lot 1 ligne 47).
- **Propriétaire** : admin (`app/api/admin/institutions/[id]/valider|
  refuser|suspendre|reactiver|badge/route.ts`).
- **Relations** : **aucune** vers `documents_institution` — confirmé Lot 1
  §3, chaîne cassée.
- **Contraintes** : `institutions_statut_juridique_check` limite les
  valeurs possibles mais ne lie rien aux documents réellement examinés.
- **RLS/policies/grants** : hérités d'`institutions` (voir 2.1).
- **Données sensibles** : la décision elle-même (accepter/refuser une
  institution publique guinéenne) n'a aujourd'hui aucune trace structurée
  au-delà d'un `admin_logs`/`journal_activite` générique par action
  admin — pas d'audit dédié à la vérification.
- **Dépendances applicatives** : écrans `/admin/institutions`.
- **Historique/migrations** : aucune migration dédiée — c'est précisément
  le vide que le Lot 2.2 doit combler (cohérent avec Lot 1 §10, "MANQUANT
  → À CRÉER").
- **Risques de régression** : pas une régression (rien n'existe à
  régresser) mais une **fausse impression de rigueur** — `badge_verifie`/
  `statut=validee` s'affichent comme une vérification faite alors
  qu'aucune preuve n'est structurellement liée à la décision.

### 2.6 Réputation (`avis`, `avis_vues`, `avis_utile`, `lib/reputationScore.ts`)

- **Rôle métier** : Signal, jamais Evidence — chaîne Activity→Signals→
  Reputation, confirmée jamais croisée avec la chaîne Claims (Lot 1 §3).
- **Propriétaire** : les citoyens (avis), le système (trigger de
  recalcul), l'institution (réponse — colonnes protégées par trigger).
- **Relations** : `avis.institution_id`/`rdv_id`/`citoyen_id` — FK non
  retrouvées en migration (**[NV]**, table pré-existante) ; `avis_vues`/
  `avis_utile` → `avis` FK CASCADE **[MIG]** ; `institutions.moyenne_avis`/
  `nb_avis` mis à jour par le trigger `avis_recalcul_moyenne_institution`.
- **Contraintes** : `avis_utile` UNIQUE(`avis_id`,`citoyen_id`) **[MIG]** ;
  `masque`/`brouillon` booléens filtrant le recalcul (`AND masque=false
  AND brouillon=false`, `20260806000003` L11-12).
- **RLS** : `avis` **[DB]** confirmé 14/08/2026 (GAP-06-01) ;
  `avis_vues`/`avis_utile` **[MIG]** activé, mais avec des **policies
  publiques** (`avis_vues_insert_public`/`avis_vues_read_public`,
  `WITH CHECK/USING (true)` — INSERT `anon`+`authenticated` illimité,
  sans throttle) — dette d'intégrité de signal déjà notée Lot 1 §7,
  pertinente si la Réputation devient un jour publique agrégée au-delà
  de `moyenne_avis`.
- **Policies** : `avis_citoyen_own` référencée en commentaire mais son
  `CREATE POLICY` littéral **[NV]**, non retrouvé (pré-existante) ;
  `avis_vues_insert_public`, `avis_vues_read_public`,
  `avis_utile_read_public`, `avis_utile_insert_own`
  (`citoyen_id = auth.uid()`), `avis_utile_delete_own` — toutes **[MIG]**
  (`20260724000004`).
- **Grants** : `avis` suit le baseline CLAUDE.md ("14 tables d'origine",
  non re-confirmé par une requête spécifique cette session) ; `avis_vues`/
  `avis_utile` (créées 24/07/2026) **[NV]** — jamais testées ni par
  GAP-06-05 ni par GAP-06-08, potentiellement dans le même pattern
  systémique (à vérifier avant toute exploitation future de ces deux
  tables comme Signal fiable).
- **Données sensibles** : commentaires/notes (opinion publique sur une
  institution), `rdv_id` (lien indirect vers une visite réelle) —
  sensibilité modérée, déjà correctement filtrée côté public
  (`masque`/`brouillon` exclus du calcul).
- **Dépendances applicatives** : `lib/reputationScore.ts` (interne, riche,
  jamais exposé publiquement — bonne isolation confirmée Lot 1),
  écran Mes avis, fiche institution publique.
- **Historique/migrations** : 3 migrations (09/07 rename, 24/07
  fondations + brouillon/vues/utile, 06/08 trigger de recalcul —
  corrigeant un vrai bug où `moyenne_avis`/`nb_avis` étaient figées à 0
  depuis toujours, déjà documenté CLAUDE.md).
- **Risques de régression** : aucun lié à ce lot — chaîne déjà saine et
  isolée. Attention explicite à ne jamais faire lire `niveau_confiance`
  par le trigger de recalcul ni l'inverse en connectant la future brique
  Vérification.

### 2.7 `signalements` (+ `signalement_events`, `signalement_notes`, `signalement_attachments`)

- **Rôle métier** : modèle de contestation du Lot 0 §7 — déjà en
  production, arbitré exclusivement par Yelen (chantier livré cette
  semaine).
- **Propriétaire** : citoyen ou institution (création) ; Yelen/admin
  (décision exclusive, depuis ce chantier).
- **Relations** : `signalements.institution_id` (nullable depuis
  27/07/2026) → `institutions` (**[NV]** FK non confirmée, table pré-
  existante) ; `signalement_events`/`notes`/`attachments` →
  `signalements` (CASCADE ou RESTRICT selon la table) → `institutions`
  (CASCADE) ; assignation/résolution → `institution_membres` (SET NULL).
- **Contraintes** : `statut` CHECK 8 valeurs, `priorite`/`type_signaleur`/
  `type_cible` CHECK, `escalade_niveau` CHECK 3 valeurs,
  `resolution_action` CHECK, `signalements_resolution_complete` (résolu ⇒
  action+explication non nulles), `signalements_doublon_reference`
  (doublon ⇒ référence non nulle), `numero_public` UNIQUE.
- **RLS** : **[MIG]** activé seulement depuis le 08/08/2026 —
  **confirmé zéro policy avant cette date, écrit directement depuis le
  navigateur avec la clé anon** (commentaire explicite de la migration,
  déjà cité Lot 1 §1). Fait pertinent ici : c'est la preuve qu'une table
  pré-existante sans RLS pendant des semaines n'est pas une hypothèse
  abstraite pour ce projet, c'est arrivé au moins une fois concrètement.
- **Policies** : aucune sur `signalements`/`events`/`attachments`/
  `notes`.
- **Grants** : **[DB]** anon+authenticated privilèges complets confirmés
  16/08/2026 sur les 5 tables de cette famille (GAP-06-08), neutralisés
  par RLS actif.
- **Données sensibles** : `preuve_url`, motif, description d'un différend
  entre un citoyen et une institution publique — sensibilité élevée,
  pièces jointes en bucket privé `signalements-preuves`.
- **Dépendances applicatives** : `lib/signalements.ts`,
  `SignalementsTab.tsx`, `app/signalement/page.tsx`,
  `app/admin/moderation/page.tsx` (onglet Cas).
- **Historique/migrations** : refonte complète 08/08/2026 (lifecycle_core
  + events + notes + attachments), `titre` rendu nullable le 09/08
  (colonne legacy jamais vue dans les migrations, bug réel rencontré en
  testant).
- **Risques de régression** : directement réutilisable pour le modèle de
  contestation Lot 0 (déjà noté Lot 1 §12, Lot 4 futur) — mais un « faux
  signalement » (Cas I du Lot 0) ne doit jamais modifier silencieusement
  `niveau_confiance`/`badge_verifie` sans passer par la future table de
  décision, sinon on recrée le mélange Claims/Signals interdit.

### 2.8 Audit (`journal_activite`, `signalement_events`, `admin_logs`)

- **Rôle métier** : trace immuable des actions — le patron que la future
  table de décision de vérification doit copier à l'identique.
- **Propriétaire** : le système (écriture `service_role` uniquement dans
  les 3 cas).
- **Relations** : `journal_activite.institution_id` CASCADE, `membre_id`
  SET NULL ; `signalement_events.signalement_id` RESTRICT,
  `institution_id` CASCADE, `membre_id` SET NULL ; `admin_logs.admin_id`
  CASCADE → `admin_users`.
- **Contraintes** : `audit_id` UNIQUE (séquence dédiée par table,
  `journal_activite_audit_seq`/`signalements_numero_public_seq`,
  `signalement_events` a sa propre fonction `signalement_events_
  generer_audit_id()` **[MIG]**) ; `niveau`/`plateforme` CHECK sur
  `journal_activite`.
- **RLS** : les 3 tables **[MIG+DB]** activées, `journal_activite`/
  `admin_logs` confirmées **[DB]** 16/08/2026 (GAP-06-08 requête 4,
  9 tables) ; `signalement_events` idem.
- **Policies** : aucune sur les 3.
- **Grants** : **[DB]** anon+authenticated privilèges complets confirmés
  sur `journal_activite`/`admin_logs` 16/08/2026 ;
  `signalement_events` résultat tronqué dans la capture mais RLS confirmé
  suffisant (requête 4 recoupée).
- **Triggers d'immuabilité** : **présents** sur `journal_activite`
  (`journal_activite_immuable`, `BEFORE UPDATE OR DELETE`, échappatoire
  `SET LOCAL app.autoriser_correction_journal='on'`) et
  `signalement_events` (`signalement_events_immuable`, copie explicite du
  même patron) — **absents** sur `admin_logs` (GAP-06-07, décision de
  gouvernance ouverte, non bloquante pour ce lot).
- **Données sensibles** : `ip`/`user_agent`/`navigateur`/`os`
  (`journal_activite` — PII technique), détails d'actions admin
  (`admin_logs` — peut inclure des décisions sensibles sur des comptes
  citoyens/institutions).
- **Dépendances applicatives** : Journal d'activité (Compte institution),
  Signalements, 31 fichiers `app/api/admin/**` confirmés pour
  `admin_logs` (Lot 1 §13 P2).
- **Historique/migrations** : `journal_activite` est le patron original
  (15/07 création, 23/07 immuabilité+recherche), copié tel quel sur
  `signalement_events` (08/08) ; `admin_logs` créée avant ce patron
  (09/07), jamais rattrapée.
- **Risques de régression** : **la future table de décision de
  vérification ne doit pas être `admin_logs`** (recommandation Lot 1 déjà
  actée, Option B) — elle doit avoir son propre trigger d'immuabilité dès
  sa création, sans dépendre d'un rattrapage préalable de GAP-06-07.

### 2.9 Rôles et permissions

- **Rôle métier** : contrôle qui peut agir sur quoi — pertinent ici pour
  la séparation Organisation/Reviewer/Admin exigée par le Lot 0.
- **Propriétaire** : le code applicatif (`lib/adminAuth.ts`,
  `lib/institutionPermissions.ts`), pas de table de permissions dédiée en
  base — seulement les colonnes `role` sur `institution_membres` et
  `admin_users`.
- **Relations** : `institution_membres.role` (5 valeurs, CHECK) ;
  `admin_users.role` (enum Postgres `type_admin`, élargi le 09/07/2026
  pour ajouter `support`/`admin` — liste d'origine complète **[NV]**,
  CLAUDE.md documente 4 valeurs `super_admin`/`moderateur`/`support`/
  `admin`, un seul compte réel `super_admin` en base).
- **Contraintes** : `institution_membres_role_check` (5 valeurs) ;
  `admin_users.role` via enum Postgres (élargi, jamais rétréci dans les
  migrations, pas de CHECK textuel trouvé).
- **RLS/policies/grants** : sans objet direct (la matrice est du code) —
  `institution_membres`/`admin_users` eux-mêmes ont RLS actif (voir 2.3
  et GAP-06-01).
- **Données sensibles** : la matrice elle-même n'est pas une donnée mais
  définit l'accès à toutes les autres — rayon d'action large en cas
  d'erreur (déjà durci cette session : deny-by-default confirmé,
  `institutions.manage` unique gate actuelle sur badge/statut/plan/
  avertissement).
- **Dépendances applicatives** : 55+ endpoints admin (`lib/adminAuth.ts`,
  22 permissions listées à ce jour, lues intégralement pour ce lot) ;
  matrice institution `TAB_MATRIX`/`ACTION_MATRIX` (5 rôles).
- **Historique/migrations** : pas de migration dédiée (logique
  applicative) — mais `institution_membres_role_check` élargi 3→5 valeurs
  le 18/07/2026 (RBAC).
- **Risques de régression** : **confirmé directement dans ce lot** (pas
  seulement au Lot 1) — `lib/adminAuth.ts` ne contient **aucune**
  permission `institutions.verify` ; `institutions.manage`
  (`super_admin`/`moderateur`/`admin`) reste la seule permission couvrant
  badge/statut/plan/avertissement, et couvrirait par défaut une future
  décision de vérification si rien n'est ajouté — recréant exactement
  l'écueil identifié au Lot 0 (mélange gestion opérationnelle / décision
  de vérification).

---

## 3. Réévaluation least-privilege des grants — objet par objet

Consigne CEO explicite : ne jamais considérer `anon`+`authenticated` comme
acceptable par défaut, même neutralisé par RLS. Constat transversal
(GAP-06-08) : le grant large **est le comportement par défaut de ce projet
Supabase**, pas une exception — confirmé sur 9 tables créées à des dates
différentes entre 09/07 et 08/08/2026, jamais neutralisé par un `REVOKE`
explicite dans aucune migration.

Évaluation, table par table, du besoin réel (pas de la présomption) :

| Table | `anon` en a-t-il besoin ? | `authenticated` en a-t-il besoin ? | Cible recommandée (non exécutée) |
|---|---|---|---|
| `institutions` | **Oui, partiellement** — la policy publique exige `SELECT` pour afficher les fiches validées aux visiteurs non connectés | Oui, `SELECT` (même usage, citoyens connectés) | `SELECT` seul pour les deux ; `REVOKE INSERT/UPDATE/DELETE/TRUNCATE` (aucune écriture légitime hors service_role) |
| `institution_responsables` | **Non** — zéro accès direct légitime, tout passe par service_role | **Non** | `REVOKE ALL FROM anon, authenticated` |
| `institution_membres` | **Non** | **Non** — contient des secrets d'auth (`pin_hash`, `totp_secret`) | `REVOKE ALL FROM anon, authenticated` — priorité la plus haute de ce tableau vu la sensibilité |
| `documents_institution` | **Non** | **Non** — dépôt/lecture toujours via service_role | `REVOKE ALL FROM anon, authenticated` |
| `admin_logs` | **Non** | **Non** | `REVOKE ALL FROM anon, authenticated` |
| `journal_activite` | **Non** | **Non** | `REVOKE ALL FROM anon, authenticated` |
| `signalements` + 3 sous-tables | **Non** | **Non** — même les créations passent par une route service_role désormais | `REVOKE ALL FROM anon, authenticated` sur les 4 |
| `avis` | **Oui, partiellement** — lecture publique des avis non masqués/non brouillon | Oui, `SELECT` + `INSERT` (dépôt d'avis par un citoyen connecté, sous RLS `auth.uid()`) | `SELECT` pour `anon` ; `SELECT`+`INSERT`+`UPDATE` limité pour `authenticated` (jamais `DELETE`/`TRUNCATE`) |
| `avis_vues` | Discutable — la policy actuelle autorise déjà `INSERT`/`SELECT` `USING(true)` à tous | Idem | Sans objet pour ce lot (dette de policy déjà notée Lot 1 §7, pas un problème de grant) |
| `avis_utile` | **Non** (policy déjà restreinte à `auth.uid()`) | Oui, borné par policy déjà correcte | Grant déjà cohérent avec les policies existantes — pas prioritaire |

**Recommandation de méthode (proposition, non exécutée)** : plutôt que de
traiter chaque table au cas par cas indéfiniment, adopter pour **toute
nouvelle table du Lot 2.2** (en particulier la future table de décision de
vérification) un `REVOKE ALL FROM PUBLIC, anon, authenticated` explicite
**dès la migration de création**, avant même d'ajouter le moindre `GRANT`
minimal si un accès `anon`/`authenticated` s'avère réellement nécessaire —
inversant la présomption par défaut du projet plutôt que de compter
uniquement sur RLS comme seconde couche a posteriori. Ceci répond
directement à la consigne CEO ("RLS = seconde couche", pas l'unique
couche).

---

## 4. Vérification des invariants Lot 0 sur le modèle actuel

| Invariant | État constaté dans ce lot | Preuve |
|---|---|---|
| Evidence ≠ Signal | **Respecté structurellement** | Aucune route ne lit `avis`/`journal_activite` pour alimenter `documents_institution`/`institutions.statut` |
| Verification ≠ Reputation | **Respecté** | Confirmé section 2.6 — chaînes jamais croisées dans le code actuel |
| Réputation ne peut établir Identity/Authority | **Respecté de fait** | Idem — mais **fragile**, reposant sur l'absence de code plutôt que sur une contrainte structurelle (rien n'empêche techniquement un futur développeur de le faire par erreur) |
| Aucun score global | **Respecté** | `niveau_confiance` reste 3 paliers qualitatifs (Lot 0 §2), `reputationScore.ts` jamais public |
| Décision traçable (acteur/preuve/date/justification) | **MANQUANT** | Aucune table de décision de vérification n'existe (section 2.5) |
| Régression fait sortir un axe de son état vérifié | **MANQUANT** | `institutions.statut`/`niveau_confiance` ne sont jamais relus après écriture initiale — un changement de responsable, un document expiré ne déclenchent aujourd'hui rien |
| **Preuves historiques jamais détruites** | **VIOLÉ EN PRATIQUE** | Section 1 — `documents_institution` écrase fichier + ligne à chaque resoumission |

Ce dernier point est la seule violation active (pas seulement une absence)
trouvée dans ce lot — les autres lacunes sont des vides à combler, celle-ci
est un comportement actif qui produit une perte de données à chaque usage
réel de la fonctionnalité de renvoi de document.

---

## 5. `documents_institution` ↔ future table de décision — analyse de connexion

Le Lot 1 avait identifié la connexion `documents_institution.statut` ↔
`institutions.badge_verifie`/`niveau_confiance` comme la seule pièce
structurelle manquante. Ce lot va plus loin : **cette connexion ne peut pas
être construite en toute sécurité tant que `documents_institution` reste
insert-and-overwrite** — une future ligne de décision qui référencerait
`documents_institution.id` comme « preuve examinée » verrait cette
référence pointer silencieusement vers un *autre* document après une
resoumission, corrompant rétroactivement l'historique (la décision du
15/08 semblerait avoir examiné le document du 20/08).

**Deux options structurelles, à trancher explicitement au Lot 2.2 — aucune
choisie ici :**

**Option 1 — rendre `documents_institution` insert-only.** Retirer la
contrainte `UNIQUE(institution_id, type)` globale (remplacée par une
notion de soumission « active » — ex. un flag `statut_actif` ou un
chaînage `remplace_document_id`, sur le même patron que
`signalements.doublon_de_signalement_id`), et verser chaque resoumission
comme une **nouvelle ligne** plutôt qu'un upsert sur la ligne existante.
Le chemin Storage doit être versionné en conséquence (ex.
`${institution_id}/${type}/${document_id}.${ext}` au lieu du chemin fixe
actuel), sinon le fichier physique reste écrasable même si la ligne DB ne
l'est plus. La table de décision référence alors `documents_institution.id`
en toute sécurité, cet id ne changeant jamais de contenu une fois écrit —
cohérent avec le patron déjà établi deux fois dans ce projet
(`journal_activite`/`signalement_events`).

**Option 2 — laisser `documents_institution` inchangée (pointeur "état
courant" uniquement), et faire porter l'immuabilité par la table de
décision elle-même** : au moment de la décision, copier (snapshot) dans la
ligne de décision les champs pertinents du document examiné (type,
`soumis_le`, et un identifiant/hash du fichier physique au moment de
l'examen) plutôt que de se contenter d'une référence par id. **Limite
importante de cette option, à ne pas sous-estimer** : elle protège
l'enregistrement de la décision, mais ne résout pas le problème du côté
Storage — le fichier physique reste écrasable (`upsert:true`, chemin fixe)
tant que le chemin n'est pas lui-même versionné. Autrement dit, Option 2
sans changement de chemin Storage ne satisfait qu'à moitié l'invariant 7
(la décision reste traçable, mais la pièce elle-même peut disparaître).

**Recommandation de ce document (proposition, pas une décision arrêtée)** :
Option 1, pour cohérence avec le patron déjà éprouvé deux fois dans ce
projet (insert-only + immuabilité par trigger, plutôt qu'un correctif
partiel). Dans les deux cas, **le chemin Storage doit changer** — ce point
n'est pas optionnel quelle que soit l'option DB retenue.

---

## 6. Spec des champs — future table de décision de vérification (conceptuel, non implémenté)

Aucune migration n'est écrite dans ce lot. Ce qui suit est une proposition
de champs pour la future table (nom de travail :
`institution_verification_decisions`), à valider explicitement au Lot 2.2,
construite en respectant le vocabulaire déjà figé par le Lot 0 plutôt que
d'en inventer un nouveau.

| Champ | Type (indicatif) | Notes |
|---|---|---|
| `id` | uuid PK | — |
| `decision_id` | text UNIQUE | Identifiant lisible, même mécanisme de séquence que `audit_id`/`numero_public`/`TRX-*` déjà utilisé 3 fois dans ce projet (ex. `YL-VER-2026-00000001`) — cohérence de convention, pas une nouvelle |
| `institution_id` | uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE | — |
| `axe` | text NOT NULL CHECK IN ('identite','autorite') | Jamais `'existence'` (pas de décision humaine sur cet axe, Lot 0 §2/Evidence Model Exemple 1) ni `'reputation'` (chaîne toujours séparée, invariant 3) |
| `preuves_utilisees` | table de jointure dédiée (ou jsonb, à trancher Lot 2.2) référençant `documents_institution.id` | Dépend directement de la section 5 — nécessite Option 1 ou un snapshot (Option 2) pour rester fiable dans le temps |
| `type_decision` | text NOT NULL CHECK IN ('accordee','complement_demande','rejetee','revoquee') | Nommage aligné Lot 0 §7 — jamais un verdict de fraude, `'revoquee'` signifie « Yelen ne peut plus vérifier », pas « fraude constatée » |
| `niveau_preuve` | text NOT NULL CHECK IN ('profil_verifie','institution_certifiee') | **Réutilise exactement les 2 paliers actionnables du Lot 0 §2** (`profil_basique` ne s'applique pas à une décision positive, c'est l'état par défaut en l'absence de toute décision) — évite d'inventer un 3e vocabulaire de "niveau de preuve" que le Lot 0 n'a jamais figé |
| `examinateur_admin_id` | uuid REFERENCES admin_users(id) ON DELETE SET NULL | Jamais CASCADE — la décision doit survivre à la suppression d'un compte admin |
| `examinateur_nom` | text NOT NULL | Snapshot du nom au moment de la décision, même patron que `membre_nom` (journal_activite) — résiste à un renommage/suppression de compte |
| `decide_le` | timestamptz NOT NULL DEFAULT now() | — |
| `justification` | text NOT NULL | Jamais nullable — cohérent avec `signalements_resolution_complete`, déjà le même principe ailleurs dans ce projet |
| `expire_le` | timestamptz nullable | Toutes les décisions n'expirent pas nécessairement (à confirmer Lot 2.2 selon le type de preuve) |
| `complement_demande_motif` | text nullable | Pertinent seulement si `type_decision='complement_demande'` |
| `revoque_decision_id` | uuid REFERENCES institution_verification_decisions(id) ON DELETE SET NULL, nullable | Une révocation est un **nouvel enregistrement** (`type_decision='revoquee'`) qui référence la décision qu'il révoque — jamais un UPDATE de la ligne d'origine, cohérent avec l'immuabilité |
| `decision_precedente_id` | uuid REFERENCES institution_verification_decisions(id) ON DELETE SET NULL, nullable | Chaîne les décisions successives sur le même `institution_id`+`axe`, reconstruit l'historique complet sans jamais modifier une ligne |
| `created_at` | timestamptz NOT NULL DEFAULT now() | — |

**Mécanismes obligatoires dès la création (pas une amélioration
ultérieure)** : RLS activé + zéro policy + `REVOKE ALL FROM PUBLIC, anon,
authenticated` explicite dès la migration (voir section 3) ; trigger
d'immuabilité `BEFORE UPDATE OR DELETE` copié du patron
`journal_activite_immuable`/`signalement_events_immuable`, avec sa propre
échappatoire `SET LOCAL app.autoriser_correction_verification_decisions`.

**Relation avec l'état courant** (`institutions.niveau_confiance`/
`badge_verifie`) : ces colonnes dénormalisées ne doivent être écrites que
par un mécanisme dérivé de cette table — jamais indépendamment. Deux
approches possibles (à trancher Lot 2.2, même logique que la section 5) :
une vue/fonction qui calcule l'état courant à la volée depuis la dernière
décision non révoquée par axe (préféré, zéro risque de désynchronisation),
ou un trigger `AFTER INSERT` sur la nouvelle table qui met à jour
`institutions.niveau_confiance` — même patron déjà prouvé une fois dans ce
projet (`avis_recalcul_moyenne_institution`).

---

## 7. Vérification des scénarios (les 10 cas du Lot 0 + « document remplacé »)

| Scénario | Le modèle de données actuel le supporte-t-il ? |
|---|---|
| Entreprise formelle | **Partiellement** — `statut_juridique='prive_formel'` et `getRequiredDocuments()` existent et sont corrects ; aucune décision structurée n'existe pour clore le cycle |
| Professionnel individuel (libéral) | **Partiellement** — même constat, chemin de preuve `liberal` correctement défini dans `lib/documentsInstitution.ts` |
| Artisan informel | **Partiellement** — chemin `individuel_informel` existe (pièce d'identité + preuve de domicile), cohérent avec le principe Lot 0 §1 de non-plafonnement structurel |
| Changement de responsable | **NON supporté** — `institution_responsables` accepte un upsert libre sans déclencher aucune réévaluation d'axe (Lot 1 §10, confirmé toujours vrai) |
| Document expiré | **NON supporté** — `documents_institution` n'a **aucune** colonne d'expiration aujourd'hui (confirmé Lot 1 §5, revérifié ce lot) |
| **Document remplacé** (nouveau, cette session) | **NON supporté et actuellement destructeur** — c'est le constat central de la section 1 : la resoumission détruit la preuve précédente au lieu de créer un nouvel état à examiner |
| Organisation suspendue | **Partiellement** — `institutions.statut` a une valeur `suspendue`, mais rien ne relie cette suspension à un axe spécifique (Identité vs Autorité) ni à une preuve de la raison |
| Contestation | **Supporté** — le système de signalement (2.7), déjà en production avec arbitrage Yelen exclusif, correspond directement au modèle de contestation Lot 0 §7 |
| Faux signalement | **Partiellement** — `signalements.statut IN ('rejete',...)` existe, mais rien n'empêche techniquement (juste par absence de code, pas par contrainte) qu'un faux signalement affecte un jour `niveau_confiance` sans passer par la table de décision |
| Réputation insuffisante | **Supporté et correctement isolé** — `moyenne_avis`/`nb_avis` recalculés par trigger, jamais mélangés à Identité/Autorité |
| Réputation suspecte | **Partiellement** — `avis_vues`/`avis_utile` existent comme signaux bruts, mais `avis_vues` a une policy `INSERT` illimitée sans throttle (dette déjà notée Lot 1 §7) — un signal de réputation suspecte pourrait lui-même être manipulé sans détection |
| Nouvelle région/pays | **Hors périmètre confirmé** — aucune colonne région/pays au-delà de `ville`/`quartier` sur `institutions`, aucun impact du modèle actuel, cohérent avec le principe Lot 0 de ne pas construire un système universel prématurément |

---

## Clôture Lot 2.1

### A. Ce qui existe déjà et doit être réutilisé

- Le trigger d'immuabilité (`journal_activite`/`signalement_events`) —
  patron exact à copier pour la future table de décision.
- Le pattern RLS deny-by-default (activé, zéro policy, service_role
  uniquement) — déjà la convention systématique du projet.
- `lib/adminAuth.ts` — extension naturelle (nouvelle permission
  `institutions.verify`), pas un remplacement.
- `documents_institution` — le cycle de vie enum (`recu`/`valide`/
  `complement_demande`/`rejete`) reste exactement ce qu'il faut, une fois
  la question de la section 5 tranchée.
- `institution_membres` — socle direct pour le vouching organisationnel
  du Lot 0 (§2C), à condition de ne jamais y loger le rôle reviewer.
- Le système de signalement — directement réutilisable comme modèle de
  contestation (déjà noté Lot 1, confirmé toujours valable).
- Le mécanisme de séquence lisible (`audit_id`/`numero_public`/`TRX-*`) —
  à répliquer pour `decision_id`.

### B. Ce qui est insuffisant

- **`documents_institution` détruit sa propre preuve à chaque
  resoumission** (section 1) — le point le plus sérieux de ce lot.
- `institution_responsables` : déclaratif à 100 %, aucune preuve
  rattachée.
- `admin_logs` : sans trigger d'immuabilité (GAP-06-07, gouvernance
  ouverte, non bloquant pour ce lot précis mais pertinent si jamais
  réutilisée pour la vérification — recommandation : ne pas la
  réutiliser, voir A).
- `avis_vues` : policy `INSERT` illimitée sans throttle — dette
  d'intégrité de signal.
- Les grants `anon`/`authenticated` larges restent la norme par défaut du
  projet (section 3), jamais neutralisés explicitement à ce jour.

### C. Ce qui doit être créé

- La table de décision de vérification (section 6), avec son trigger
  d'immuabilité et ses grants restreints dès la création.
- Une permission admin dédiée `institutions.verify` dans
  `lib/adminAuth.ts`, distincte de `institutions.manage`.
- Un mécanisme d'expiration (colonne sur la table de décision, ou table
  dédiée — la table de décision porte déjà `expire_le`, suffisant a
  priori).
- Un mécanisme de détection de changement matériel (responsable, nom,
  adresse) déclenchant une sortie d'état vérifié — aucune table
  supplémentaire nécessaire a priori, plutôt un trigger/job comparant
  ancien/nouveau à l'écriture.

### D. Ce qui doit être modifié

- `documents_institution` : résoudre la contrainte UNIQUE +
  upsert-destructeur (Option 1 ou 2, section 5) — **préalable
  bloquant** à toute connexion réelle avec la future table de décision.
- Le chemin Storage du bucket `documents` : versionner (actuellement fixe
  par `${institution_id}/${type}.${ext}`), indépendamment de l'option DB
  choisie.
- `app/api/admin/institutions/[id]/valider/route.ts` : aujourd'hui un
  simple `UPDATE` sans lien avec une preuve — devra, à terme, dériver
  (ou au minimum être cohérent avec) l'état calculé depuis la nouvelle
  table de décision.
- Le fichier de migration périmé `20260711000005_documents_institution_
  workflow.sql` (référence `admins` au lieu de `admin_users`) — cosmétique,
  déjà noté Lot 1, sans urgence.

### E. Risques de migration

- Le bucket Storage `documents` n'existe pas en production — toute
  correction du chemin de fichier (section D) devra être coordonnée avec
  sa création (déjà une action manuelle en attente, CLAUDE.md).
- Modifier la contrainte `UNIQUE(institution_id, type)` sur une table déjà
  en production nécessite un plan de migration des lignes existantes
  (probablement peu nombreuses vu qu'aucune décision réelle n'a encore
  été prise, mais **NOT VERIFIED** — le volume réel de lignes
  `documents_institution` aujourd'hui n'a pas été confirmé par SQL dans ce
  lot).
- Toute nouvelle table doit explicitement confirmer RLS actif + zéro
  policy + grants restreints avant mise en production (GAP-06-08,
  vigilance systémique déjà recommandée au Lot 1, réaffirmée section 3).

### F. Dépendances

- La future table de décision dépend de `admin_users` (jamais `admins`),
  `institutions`, et de la résolution préalable de la section 5 sur
  `documents_institution`.
- Le nouveau rôle reviewer dépend d'une extension de `lib/adminAuth.ts`
  (patron déjà mature, pas une nouvelle architecture).
- Le calcul de l'état courant (`niveau_confiance`) dépend du choix entre
  vue calculée à la volée et trigger dénormalisant (section 6) — à
  trancher avant toute implémentation.

### G. Proposition du schéma cible (résumé, détail complet section 6)

Aucune reconstruction : une seule table nouvelle
(`institution_verification_decisions`, champs section 6, insert-only,
trigger d'immuabilité, RLS deny-by-default, grants restreints dès la
création), une modification structurelle de `documents_institution`
(section 5, option à trancher), un versionnement du chemin Storage, et une
permission admin dédiée. Rien d'autre dans la cartographie des 9 catégories
n'a besoin d'être remplacé (confirmé, cohérent avec la conclusion déjà
posée au Lot 1 : "aucune reconstruction nécessaire").

### H. Questions bloquantes éventuelles

Aucune question n'empêche techniquement la rédaction du Lot 2.2, mais 3
décisions doivent être prises explicitement par le CEO avant toute
migration réelle :

1. **Option 1 vs Option 2** pour `documents_institution` (section 5) —
   recommandation de ce document : Option 1 (insert-only), mais c'est un
   changement plus large qu'Option 2 et mérite une validation explicite.
2. **Vue calculée vs trigger dénormalisant** pour synchroniser
   `institutions.niveau_confiance` avec la nouvelle table de décision
   (section 6) — les deux sont viables, le choix affecte la complexité
   des futures requêtes de lecture (fiche citoyen, recherche).
3. **`admin_logs` (GAP-06-07)** : Option A (ajouter un trigger
   d'immuabilité rétroactif) ou B (laisser tel quel, ne jamais l'utiliser
   pour la vérification) — ce lot recommande B par défaut (déjà la
   recommandation Lot 1), aucune action requise avant Lot 2.2 si B est
   retenue.

### I. GO/NO-GO pour le Lot 2.2

**GO conditionnel.** Le modèle de données existant est majoritairement
réutilisable (section A) — pas de reconstruction. Une seule pièce
structurelle manque réellement (la table de décision, section 6) et un
seul vrai problème actif a été trouvé (`documents_institution`,
section 1/5), pas une simple lacune. Le Lot 2.2 peut démarrer la
conception détaillée (schéma final, migrations décrites non écrites,
comme au Lot 1) **à condition de trancher explicitement le point H.1**
(Option 1/2 sur `documents_institution`) avant d'écrire le moindre champ
`preuves_utilisees` définitif — c'est la seule dépendance dont l'ordre
compte réellement, tout le reste peut être conçu en parallèle.

Arrêt ici, conformément à la consigne CEO. Aucun passage automatique au
Lot 2.2 — attente de validation explicite, preuves et écarts présentés
ci-dessus.
