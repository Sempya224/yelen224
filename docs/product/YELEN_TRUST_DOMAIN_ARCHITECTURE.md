# Yelen Trust Domain & Data Architecture — Lot 1

Rédigé le 16/08/2026, sur décision CEO, après gel de
`docs/product/YELEN_TRUST_MODEL.md` (référence normative produit). Ce
document détermine comment ce modèle peut se représenter dans
l'architecture Supabase réelle, sans reconstruction inutile.

**Aucun code, aucune migration exécutée, aucune modification Supabase,
aucun changement UI, aucun commit, aucun déploiement.** Ce document est
exclusivement de l'analyse et de la documentation.

**Méthode** : lecture exhaustive de `supabase/migrations/*.sql` (133
fichiers), croisée avec `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`
(audit du 13-14/08/2026, déjà largement engagé sur ce périmètre — ce
document le complète, ne le refait pas) et le code applicatif déjà audité
cette semaine (signalements, permissions, profil institution). Toute
affirmation sur l'état réel de la base est explicitement classée :

- **VERIFIED IN CODE** — trouvé et cité dans une migration ou un fichier
  source.
- **VERIFIED IN DATABASE** — confirmé par Bryan via une requête SQL
  Editor réelle (jamais supposé).
- **VERIFIED IN PRODUCTION** — confirmé en environnement de production
  spécifiquement (distinct de la base de développement si applicable).
- **NOT VERIFIED** — absent des migrations et jamais confirmé par
  Bryan ; ne jamais présumer que l'absence de preuve dans le code
  signifie l'absence du problème en base réelle.

Rappel du précédent audit sécurité, valable pour tout ce document : **une
absence de `GRANT` explicite dans les migrations ne prouve jamais
l'absence de privilège en production** — 5 tables ont déjà été trouvées
avec des privilèges `anon`/`authenticated` implicites (privilèges par
défaut Postgres) jamais déclarés dans aucune migration (GAP-06-05). Ce
risque s'applique potentiellement à chaque table citée ci-dessous.

---

## 1. Architecture actuelle

### Cartographie élément par élément

| Élément | Statut | Preuve |
|---|---|---|
| **`institutions`** (Organization) | EXISTE | Table mature (~35 colonnes), RLS **VERIFIED IN DATABASE** par Bryan le 14/08/2026 (`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md:35`) |
| **`institution_responsables`** (Autorité — déclaratif) | EXISTE mais **INCOHÉRENT** avec le modèle gelé | Table réelle, RLS **VERIFIED IN CODE** (`...et_fix_langue.sql:23`), zéro policy (deny-by-default correct) — mais aucune preuve d'identité n'y est jamais rattachée, contenu 100% autodéclaré, modifiable sans re-vérification (`app/api/institution/responsable/route.ts`, simple `upsert`) |
| **`documents_institution`** (Preuves) | PARTIEL | Cycle de vie complet **VERIFIED IN DATABASE le 16/08/2026** (`recu/valide/complement_demande/rejete`, `examine_par`, `examine_le` — les 5 colonnes existent réellement en production) — mais aucune route n'écrit jamais `valide`/`rejete`/`examine_par`/`examine_le`. La FK `examine_par → admin_users(id)` est **correcte en base** (confirmé `documents_institution_examine_par_fkey`) ; seul le fichier de migration sur disque référence encore l'ancien nom `admins` — dette de documentation, sans impact fonctionnel (voir section 8 et GAP-06-06) |
| **Niveaux de confiance** (`niveau_confiance`) | EXISTE mais **MANQUANT en usage** | Colonne avec défaut correct (`profil_basique`) à l'inscription — jamais lue ni écrite par aucune route ailleurs |
| **Statuts** (`institutions.statut`) | EXISTE mais **INCOHÉRENT** avec le modèle gelé | Transition `en_attente→validee` = un `UPDATE` admin sans lien avec `documents_institution` (`app/api/admin/institutions/[id]/valider/route.ts`) — contredit l'invariant « aucun VERIFIED sans décision vérifiable » du Lot 0 |
| **Réputation** | EXISTE, et **déjà correctement isolée** — bonne nouvelle | `moyenne_avis`/`nb_avis` (trigger, public) + `lib/reputationScore.ts` (interne, riche, jamais public) — les deux chaînes (Claims vs Signals) ne se croisent jamais dans le code actuel (section 3) |
| **`avis`** | EXISTE | Table pré-migration, RLS **VERIFIED IN DATABASE** (dans les 7 tables du GAP-06-01). `avis_vues` autorise un `INSERT` anon sans aucune limite (`WITH CHECK (true)`, `...brouillon_vues_utile.sql:21-22`) — dette d'intégrité de signal, pertinente pour le Cas H du Lot 0 |
| **`signalements`** (arbitrage) | EXISTE, RLS actif **seulement depuis le 08/08/2026** | Avant cette date : **confirmé zéro policy, écrit directement depuis le navigateur avec la clé anon** (`...lifecycle_core.sql:96-101`, propre commentaire de la migration). Système d'arbitrage complet (transitions légales, notifications bidirectionnelles) construit cette semaine — c'est déjà, en production, le modèle de contestation du Lot 0 (section 7) |
| **`admin_logs`** | EXISTE mais **INCOHÉRENT** avec l'exigence « aucune preuve supprimée silencieusement » | RLS **VERIFIED IN CODE**, zéro policy, écriture exclusivement `service_role` depuis 31 fichiers `app/api/admin/**` confirmés (30 inserts + 1 lecture, zéro chemin client) — mais **aucun trigger d'immuabilité**, à la différence de `journal_activite`/`signalement_events`. Un `service_role` ou un superutilisateur SQL Editor pourrait aujourd'hui modifier ou supprimer une ligne sans laisser de trace de l'altération |
| **Historique** (`journal_activite`, `signalement_events`) | EXISTE, complet, **c'est le bon patron à réutiliser** | RLS **VERIFIED IN CODE**, zéro policy, trigger d'immuabilité réel bloquant même `service_role`/superutilisateur, avec échappatoire documentée (`SET LOCAL app.autoriser_correction_*`, transactionnelle, non persistante) |
| **Rôles** (`institution_membres.role`) | EXISTE | **Correction découverte cette session** : 5 valeurs réelles (`admin`/`agent`/`comptable`/`superviseur`/`dirigeant`, `...rbac.sql:7-12`), pas 4 comme documenté précédemment. RLS **VERIFIED IN CODE**, zéro policy. Aucune escalade possible : seul `admin` a `equipe.write`, le compte `compte_principal` est protégé même contre les autres admins (`app/api/institution/membres/route.ts:141-169`) |
| **Permissions** (`lib/adminAuth.ts`, `lib/institutionPermissions.ts`) | EXISTE, mature, **MANQUANT exactement ce que le Lot 0 exige** | Deny-by-default confirmé, matrice par rôle — mais **aucune permission dédiée à la vérification** (`institutions.verify` n'existe pas) ; `institutions.manage` couvre aujourd'hui badge, statut, plan et avertissement dans une seule permission (Primitive 3 du document stratégique, non implémentée) |
| **RLS** (posture globale) | EXISTE et cohérent partout où vérifié | Deny-by-default confirmé sur toutes les tables listées ci-dessus — **mais le caveat GRANT (introduction) s'applique à chacune sans exception** |

### Posture Supabase détaillée (tables critiques pour la confiance)

| Table | RLS (code) | Policies | GRANT explicite | Trigger immuabilité | Pré-existante (hors migrations) |
|---|---|---|---|---|---|
| `institution_responsables` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** en base | Aucun | Non (créée 11/07/2026) |
| `documents_institution` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | Aucun | **Oui** — seules des `ALTER TABLE` existent |
| `admin_logs` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | **Aucun** | Non (créée 09/07/2026) |
| `institution_membres` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | Aucun | Non (créée 14/07/2026) |
| `signalements` (parent) | VERIFIED IN CODE depuis le 08/08 (zéro avant) | Aucune | Aucun trouvé — **NOT VERIFIED** | Aucun | **Oui** |
| `signalement_events` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | **Oui** — le patron à copier | Non (créée 08/08/2026) |
| `signalement_notes` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | Aucun (choix explicite documenté) | Non |
| `signalement_attachments` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | Aucun | Non |
| `journal_activite` | VERIFIED IN CODE | Aucune | Aucun trouvé — **NOT VERIFIED** | **Oui** — le patron original | Non (créée 15/07/2026) |

**Action requise de Bryan pour clore le NOT VERIFIED sur chaque ligne** :
```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='<table>' AND grantee IN ('anon','authenticated');
```
à exécuter pour chacune des 9 tables ci-dessus dans le SQL Editor Supabase — jamais présumé par ce document.

---

## 2. Architecture cible

Aucune reconstruction. Le modèle de confiance gelé (Lot 0) se représente
dans l'architecture existante en ajoutant **une seule pièce structurelle
manquante** — une table d'événements de décision de vérification, sur le
même patron que `signalement_events`/`journal_activite` — et en
**connectant** des pièces déjà présentes (`documents_institution` →
`institutions.badge_verifie`/`niveau_confiance`) plutôt qu'en les
remplaçant. La cible n'est pas un nouveau système : c'est le système
actuel avec son maillon manquant posé, exactement comme diagnostiqué au
Lot 0.

---

## 3. Mapping complet des données

Les deux chaînes exigées par le CEO, **jamais fusionnées** — et confirmé
que le code actuel les tient déjà séparées (aucun croisement trouvé) :

### Chaîne Claims (Existence/Identité/Autorité)
```
institutions (Organization)
  ↓ déclaration (inscription / édition de profil)
institutions.* + institution_responsables.*          [Claims]
  ↓ dépôt volontaire
documents_institution (statut='recu')                 [Evidence]
  ↓ — MANQUANT : aucune route ne fait ce pas aujourd'hui —
[examen humain]                                        [Validation]
  ↓
documents_institution.statut ∈ {valide,rejete,        [Decision]
  complement_demande} + examine_par + examine_le
  (colonnes prêtes, jamais écrites)
  ↓ — MANQUANT : aucun lien aujourd'hui —
institutions.badge_verifie / niveau_confiance          [Trust State]
```

### Chaîne Activity → Signals → Reputation (jamais mélangée à la précédente)
```
institutions (Organization)
  ↓
rdv, avis, journal_activite, signalements résolus,     [Activity]
annonces (vues/likes/commentaires)
  ↓
moyenne_avis/nb_avis (trigger), avis_vues/avis_utile,  [Signals]
reputationScore.ts (inputs internes)
  ↓
Réputation affichée : citoyen voit la moyenne brute ;  [Reputation]
institution voit le score de santé interne riche
```

---

## 4. Mapping des permissions

- **Organisation** : écrit ses propres `institutions.*` (`PUT
  /api/institution/profile`, JWT institution), `institution_responsables`
  (`PUT /api/institution/responsable`, autodéclaré, zéro contrôle),
  dépose dans `documents_institution` (`POST
  /api/institution/documents`, gated `documents_institutionnels.write`).
- **Reviewer** (Primitive 3 du Lot 0) : **rôle à créer, n'existe pas
  aujourd'hui**. La permission la plus proche, `institutions.manage`
  (super_admin/moderateur/admin), mélange gestion opérationnelle et
  décision de vérification — exactement l'écueil identifié au Lot 0.
- **Administrateur** : `lib/adminAuth.ts`, deny-by-default, matrice par
  rôle déjà mature (super_admin/moderateur/support/admin) — juste
  incomplète sur ce point précis, une extension naturelle du système
  déjà en place (comme `signalements.moderate` l'a été).

---

## 5. Invariants

| Invariant | État | Mécanisme existant réutilisable |
|---|---|---|
| Aucun `VERIFIED` sans décision vérifiable | **MANQUANT** | Aucune table de décision n'existe encore |
| Aucune décision sans acteur autorisé | **PARTIEL** | Le patron existe (`admin_logs.admin_id`, `signalement_events.membre_id`/`acteur_type`) — pas encore appliqué à la vérification |
| Aucune décision sans horodatage | **EXISTE (patron)** | `created_at`/`examine_le` déjà présents partout où requis |
| Aucune preuve supprimée silencieusement | **PARTIEL, dépend de la table** | `signalement_events`/`journal_activite` : trigger DB réel. `documents_institution`/`admin_logs` : **aucun**, un `service_role` pourrait aujourd'hui altérer ces deux tables sans trace |
| Aucun signal de réputation ne peut établir l'identité | **EXISTE déjà de fait** | Confirmé section 3 — les deux chaînes ne se croisent nulle part dans le code actuel |
| Aucune réputation ne peut créer une autorité | **EXISTE déjà de fait** | Idem |
| Aucune révocation ne détruit l'historique | **MANQUANT tant que la table de décision n'existe pas** | Dépend du même trigger que l'invariant "preuve non supprimée" |
| Changement d'attribut critique → réévaluation | **MANQUANT** | Confirmé au Lot 0 (Cas D/F) — aucun code ne fait ce rapprochement aujourd'hui |
| Expiration d'une preuve → traitement déterministe | **MANQUANT** | `documents_institution` n'a **aucune** colonne d'expiration aujourd'hui, contrairement à ce qu'on pourrait supposer |
| Séparation organisation / reviewer / admin | **PARTIEL** | Organisation vs admin déjà séparés (JWT distincts) ; reviewer n'existe pas comme permission distincte |

---

## 6. Dépendances

- Une future table de décision de vérification dépend de `admin_users`
  (jamais `admins`, table renommée le 09/07/2026 — corriger la référence
  suspecte trouvée sur `documents_institution.examine_par` avant de
  construire dessus) et des tables `institutions`/`institution_membres`
  déjà stables.
- Le nouveau rôle « reviewer » dépend d'une extension de
  `lib/adminAuth.ts` — patron déjà mature, pas une nouvelle architecture
  de permission.
- Toute interface de revue dépend de ce Lot 1 et du Lot 0, mais peut être
  backend-first (une route + un examen possible avant toute UI) —
  cohérent avec la méthode déjà appliquée dans ce projet pour les
  signalements (Lot 1 backend avant Lot UI).

---

## 7. Risques

- **FK suspecte** `documents_institution.examine_par → admins(id)` — si
  la contrainte est effectivement cassée en production, toute écriture
  de `examine_par` échouerait au moment précis où on active enfin ce
  flux. À vérifier avant toute migration future (`SELECT conname,
  confrelid::regclass FROM pg_constraint WHERE
  conrelid='documents_institution'::regclass` en SQL Editor).
- **`admin_logs` sans trigger d'immuabilité** — si cette table sert de
  base à la traçabilité de vérification (comme envisagé au Lot 0), il
  faut soit lui ajouter le même trigger que `journal_activite`, soit (
  recommandé, cohérent avec le principe « jamais une correction en
  place, toujours une nouvelle table insert-only ») créer la nouvelle
  table de décision de vérification avec son propre trigger dès le
  départ, sans dépendre d'`admin_logs` pour la partie preuve.
- **Bucket Storage `documents` confirmé cassé** (jamais créé, per
  `CLAUDE.md:838-843`) — bloquant opérationnel réel, pas théorique, avant
  même de pouvoir tester un flux de revue de documents.
- **`avis_vues` INSERT anon illimité** — dette d'intégrité de signal,
  pertinente si la Réputation devient un jour publique (Lot 0, Cas H).
- **Caveat transversal** : tout ce qui est `NOT VERIFIED` (grants en
  production, bucket `signalements-preuves`) reste un angle mort tant
  que Bryan n'a pas confirmé — ne jamais présumer.

---

## 8. Dette technique

- Doublon de migration `institution_responsables` (deux fichiers au même
  timestamp `20260711000002`) — déjà documenté par l'audit sécurité
  existant, jamais assaini (le brouillon obsolète reste dans le dépôt).
- `documents_institution` : le schéma d'origine (avant la migration du
  11/07) n'a jamais été formellement documenté nulle part — seulement
  connu via un commentaire de migration listant les colonnes de base.
- Colonnes vues dans le code de `institution_membres` (`fonction`,
  `locked_until`, `derniere_connexion`) mais non retrouvées dans les 4
  migrations qui touchent cette table — à clarifier séparément, **NOT
  VERIFIED** quelle migration les a ajoutées.
- Fichier `supabase/migrations/20260711000005_documents_institution_workflow.sql`
  périmé : référence `admins(id)` alors que la contrainte réelle en
  production référence `admin_users(id)` (confirmé 16/08/2026, GAP-06-06)
  — à corriger pour que le dépôt reflète la réalité, sans urgence.

---

## 9. Éléments réutilisables

**EXISTANT → RÉUTILISABLE tel quel** :
- Le trigger d'immuabilité (`journal_activite`/`signalement_events`) —
  patron exact à copier pour une future table de décision de
  vérification.
- Le pattern deny-by-default RLS (activé, zéro policy, accès
  exclusivement service_role) — déjà la convention systématique du
  projet.
- `lib/adminAuth.ts` — extension naturelle, pas un remplacement.
- `documents_institution` — le cycle de vie enum (`recu/valide/
  complement_demande/rejete`) est déjà exactement ce qu'il faut.
- `institution_membres` — socle direct pour le vouching organisationnel
  du Lot 0 (section 2C).

**EXISTANT → À CONNECTER** :
- `documents_institution.statut` ↔ `institutions.badge_verifie`/
  `niveau_confiance` — aujourd'hui zéro lien entre les deux.

**EXISTANT → À NORMALISER** :
- Le FK `examine_par → admins(id)` (à corriger vers `admin_users`).
- Le doublon de migration `institution_responsables`.

**EXISTANT → À REMPLACER** : **rien d'identifié.** C'est la conclusion
principale de ce Lot 1 — aucune reconstruction nécessaire.

---

## 10. Éléments réellement manquants

**MANQUANT → À CRÉER** (conceptuel, aucune implémentation dans ce lot) :
- Une table d'événements de décision de vérification, même patron que
  `signalement_events` (immuable, `SET LOCAL` comme échappatoire).
- Une permission admin dédiée à la vérification, distincte de
  `institutions.manage`.
- Un mécanisme d'expiration (colonne ou table dédiée) — absent
  aujourd'hui de `documents_institution`.
- Un champ de preuve d'identité pour `institution_responsables` —
  aujourd'hui aucun document n'y est jamais rattaché.
- Un mécanisme de détection de changement matériel (nom, responsable,
  téléphone, adresse) — rien ne compare l'ancien/nouveau à l'écriture
  aujourd'hui.

---

## 11. Migrations éventuellement nécessaires (décrites, non écrites)

Purement descriptif, à valider avant toute écriture réelle par Bryan :
1. Nouvelle table de décision de vérification (forme proche de
   `signalement_events`), avec son propre trigger d'immuabilité.
2. Correction de la FK `documents_institution.examine_par` vers
   `admin_users` (actuellement `admins`).
3. Ajout d'une notion d'expiration sur `documents_institution` ou sur la
   nouvelle table de décision (à trancher au Lot 2).
4. Ajout, côté code uniquement (pas une migration DB), de la permission
   `institutions.verify` dans `lib/adminAuth.ts`.
5. Éventuellement, un champ dédié à la preuve d'identité du responsable
   (nouvelle colonne ou nouvelle table liée à `institution_responsables`).

---

## 12. Ordre recommandé des futurs lots

- **Lot 2 — Evidence & Verification Backend** : créer la table de
  décision, connecter `documents_institution` à `badge_verifie`/
  `niveau_confiance`, corriger la FK suspecte.
- **Lot 3 — Admin Review** : interface humaine de revue, permission
  dédiée.
- **Lot 4 — Trust Lifecycle** : expiration, détection de changement
  matériel, contestation (en réutilisant le système de signalement déjà
  construit, comme prévu au Lot 0).
- **Lot 5 — Citizen Trust Transparency** : affichage des facettes.
- **Lot 6 — Search/Discovery** : classement pondéré par la confiance,
  seulement une fois réelle.

---

---

## 13. Clôture des NOT VERIFIED (16/08/2026)

Sur instruction CEO, tentative de clôture des points `NOT VERIFIED`
avant tout Lot 2. **Limite structurelle du projet, non négociable** :
Claude Code n'exécute jamais de SQL sur la base réelle (règle CLAUDE.md
« Bryan exécute tout SQL manuellement ») — ce qui suit est donc tout ce
qui pouvait être fait *sans* accès base (P1 partiel, P2 entier), plus le
paquet de requêtes exact pour ce qui reste bloqué sur un accès réel (P1
final, P3).

### P1 — Schéma réel `documents_institution` — **CLOS 16/08/2026, requêtes exécutées par Bryan**

Hypothèse initiale (échec atomique de l'`ALTER TABLE` multi-colonnes à
cause de la FK `admins(id)` obsolète) **infirmée par les résultats
réels** :

**Requête 1 (colonnes)** — les 5 colonnes du workflow de vérification
existent toutes en production : `statut` (enum, NOT NULL), `motif_rejet`
(nullable), `soumis_le` (NOT NULL), `examine_le` (nullable),
`examine_par` (nullable, uuid). La migration a bien été appliquée dans
son intégralité.

**Requête 2 (contrainte)** — `documents_institution_examine_par_fkey:
FOREIGN KEY (examine_par) REFERENCES admin_users(id)`. La contrainte
réelle référence correctement `admin_users`, **pas** `admins` comme
écrit dans le fichier de migration sur disque. Le fichier du dépôt ne
reflète donc plus ce qui a réellement été exécuté — explication la plus
probable : correction manuelle par Bryan au moment de l'exécution SQL
(cohérent avec le mode opératoire du projet, aucune exécution
automatique de migrations), jamais reportée dans le fichier source.
**Aucun impact fonctionnel — la base est saine.**

**Conclusion P1 : VERIFIED IN DATABASE, RÉSOLU.** Seule action restante,
non bloquante et non urgente : corriger le fichier
`supabase/migrations/20260711000005_documents_institution_workflow.sql`
pour qu'il reflète `admin_users(id)` — dette de documentation pure,
ajoutée à la section 8, référencée GAP-06-06 (reclassé 🟢 VERIFIED /
Low dans `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`).

### P2 — `admin_logs` vs `journal_activite`/`signalement_events` (entièrement tranchable par le code, fait)

| | `journal_activite` | `signalement_events` | `admin_logs` |
|---|---|---|---|
| RLS actif | Oui | Oui | Oui |
| Policies | Zéro (deny-by-default) | Zéro | Zéro |
| Écriture | service_role uniquement | service_role uniquement | service_role uniquement (31 fichiers confirmés) |
| Trigger `BEFORE UPDATE OR DELETE` | **Oui** — `journal_activite_immuable` | **Oui** — `signalement_events_immuable` (copie explicite du précédent) | **Aucun** |
| Échappatoire | `SET LOCAL app.autoriser_correction_journal='on'` | `SET LOCAL app.autoriser_correction_signalement='on'` | — |
| Bloque `service_role`/superutilisateur SQL Editor | Oui | Oui | **Non** |

**Conclusion, tranchée sans avoir besoin d'accès base** : `admin_logs`
est la seule des trois tables d'audit du projet sans protection DB
contre une altération silencieuse. Ce n'est pas un bug — la table a
simplement été créée le 09/07/2026, avant que le patron d'immuabilité
n'existe (introduit le 23/07/2026 sur `journal_activite`, copié le
08/08/2026 sur `signalement_events`). C'est une dette d'incohérence entre
trois tables qui jouent le même rôle, pas une faille cachée.

**Recommandation (proposition, aucune action prise — attente de décision
explicite comme demandé)** :
- **Option A** — ajouter à `admin_logs` le même trigger que
  `journal_activite` (`admin_logs_immuable`, échappatoire `SET LOCAL
  app.autoriser_correction_admin_logs`). Durcit rétroactivement la
  traçabilité de **toutes** les actions admin existantes (badge, statut,
  plan, avertissement, etc.), coût fonctionnel nul — rien dans le code
  actuel ne modifie jamais une ligne `admin_logs`.
- **Option B** — laisser `admin_logs` tel quel, et donner à la future
  table d'événements de vérification (Lot 2) son propre trigger dès sa
  création, sans jamais faire transiter les décisions de vérification
  par `admin_logs`.
- **Recommandation par défaut de ce document : Option B.** Risque nul
  sur le système existant, cohérent avec le principe déjà appliqué au
  Lot 0 (« une nouvelle table plutôt qu'une correction en place »).
  L'Option A reste une amélioration valable, mais indépendante du Lot 2
  — à traiter séparément si le CEO la souhaite.

*Ajouté aux deux documents de référence* : `docs/security/
YELEN_SECURITY_GAP_ANALYSIS.md` — GAP-06-06 (P1) et GAP-06-07 (P2),
section « 06 — Supabase Database Security », avec les mêmes preuves et
requêtes que ci-dessus.

### P3 — Permissions/grants (entièrement bloqué sur un accès base — paquet de requêtes pour Bryan)

Ces vérifications ne peuvent pas être faites sans exécuter du SQL sur la
base réelle — hors de portée de Claude Code sur ce projet, quelle que
soit la formulation de la demande. Paquet complet, à exécuter dans le SQL
Editor Supabase, résultats à coller ici pour clôture :

```sql
-- 1. Colonnes réelles de documents_institution (résout P1 définitivement)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='documents_institution'
ORDER BY ordinal_position;

-- 2. Contrainte FK réelle sur examine_par (résout P1 définitivement)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.documents_institution'::regclass;

-- 3. Grants anon/authenticated sur les 9 tables critiques du Lot 1 (résout P3)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  AND table_name IN (
    'institution_responsables','documents_institution','admin_logs',
    'institution_membres','signalements','signalement_events',
    'signalement_notes','signalement_attachments','journal_activite'
  );

-- 4. Confirmation RLS actif sur ces mêmes 9 tables (recoupement, résout P3)
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN (
  'institution_responsables','documents_institution','admin_logs',
  'institution_membres','signalements','signalement_events',
  'signalement_notes','signalement_attachments','journal_activite'
);
```

### Résultats requête 3 (grants) et requête 4 (RLS) — **CLOS 16/08/2026**

**Requête 3** : les 9 tables testées ont **toutes** des privilèges
complets (`INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`)
accordés à `anon` **et** `authenticated` — confirmé en détail sur 7/9
(`admin_logs`, `institution_responsables`, `institution_membres`,
`documents_institution`, `journal_activite`, `signalement_notes`,
`signalements`), résultat tronqué dans la capture pour les 2 dernières
(`signalement_events`, `signalement_attachments` — seules 2 lignes sur 7
attendues visibles pour `signalement_events`, aucune pour
`signalement_attachments`). **Constat élargi par rapport au Lot 1** : ce
n'est pas un phénomène limité aux « 14 tables d'origine » de CLAUDE.md —
c'est le comportement par défaut de ce projet Supabase sur des tables
créées tout au long de l'historique (09/07 au 08/08/2026), jamais
neutralisé par un `REVOKE` explicite.

**Requête 4** : `relrowsecurity=true` confirmé sur les 9/9 tables
(`admin_logs`, `institution_responsables`, `institution_membres`,
`documents_institution`, `journal_activite`, `signalement_notes`,
`signalements`, `signalement_events`, `signalement_attachments`).

**Conclusion P3 : VERIFIED IN DATABASE.** RLS actif + zéro policy sur les
9 tables neutralise ces grants larges — même logique déjà établie et
acceptée sur les 5 tables de GAP-06-05, aucune exploitation réelle
aujourd'hui. Ajouté à `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`
sous GAP-06-08, avec une recommandation de vigilance systémique (toute
future table doit être vérifiée RLS-actif-zéro-policy avant mise en
production, puisque le grant large semble être la norme par défaut, pas
l'exception).

**Point non totalement clos** : confirmer intégralement les grants de
`signalement_events`/`signalement_attachments` (résultat tronqué) — sans
urgence, le RLS actif sur ces deux tables (requête 4) suffit déjà à
neutraliser le risque quel que soit le détail exact des grants.

### GO / NO-GO pour le Lot 2

**Tous les points bloquants sont clos. GO pour le Lot 2**, sous réserve
des points suivants, aucun n'étant bloquant :
- Corriger le fichier de migration périmé (`admins`→`admin_users`,
  cosmétique, section 8) — peut se faire en même temps que le Lot 2,
  pas avant.
- Décision de gouvernance Option A/B sur `admin_logs` (P2) reste ouverte
  mais non bloquante — le Lot 2 peut démarrer avec l'Option B par défaut
  (nouvelle table de décision de vérification avec son propre trigger,
  `admin_logs` non modifiée).
- Vigilance systémique sur les grants larges (GAP-06-08) — aucune action
  immédiate requise, mais toute nouvelle table du Lot 2 (notamment la
  future table d'événements de vérification) doit explicitement
  confirmer RLS actif + zéro policy avant d'être considérée sûre, plutôt
  que de présumer un `GRANT` minimal par défaut.

---

Aucune implémentation ne commence à la fin de ce document. Yelen possède
déjà l'essentiel de la plomberie nécessaire — ce Lot 1 confirme qu'il n'y
a rien à reconstruire, seulement à connecter, normaliser et compléter les
quelques pièces manquantes listées en section 10. Les 4 requêtes de
clôture ont été exécutées par Bryan le 16/08/2026 — tous les points
`NOT VERIFIED` bloquants sont désormais `VERIFIED IN DATABASE` (section
13). **GO pour le Lot 2.**

Arrêt ici malgré le GO. Attente de validation CEO explicite avant tout
code du Lot 2, comme convenu au Lot 0.
