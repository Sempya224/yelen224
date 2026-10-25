# Rapport hebdomadaire — Lot 2 : stockage (v2, 20/10/2026)

## État au 20/10/2026
- **Migration EXÉCUTÉE en base par Bryan** (SQL Editor, "Success. No rows
  returned"). Copie conforme : `supabase/migrations/20261020000001_institution_rapports_hebdo.sql`
  (non commitée).
- **Contrôles post-exécution conformes** : 4 tables avec RLS, 1 vue, 5 fonctions,
  2 triggers d'immuabilité ; privilèges : `anon` et `authenticated` aucun,
  `service_role` sans DELETE (et sans UPDATE sur le journal).
- **`TESTS_LOT2.sql` : 24 tests passés** (résultat : « TOUS LES TESTS
  AUTOMATISABLES SONT PASSES (T1 a T24) »), transaction annulée, rien ne
  persiste.
- **Pas encore faits** : scénarios de concurrence (`CONCURRENCE_LOT2.mjs`,
  écrit dans la base réelle, exige la clé service_role de Bryan) ; décisions
  conservation 104 semaines et qui peut régénérer ; Lot 3 (route interne,
  cron), Lot 4+ (lecture, interface, notification) : non commencés.
- Aucun code applicatif ne lit ni n'écrit encore ces tables.

Historique ci-dessous : proposition initiale puis revue. Dossier
`docs/rapport-hebdomadaire/lot2/` :

| Fichier | Rôle |
|---|---|
| `MIGRATION_PROPOSEE_20261020000001_institution_rapports_hebdo.sql` | Migration complète (non placée dans `supabase/migrations/`) |
| `TESTS_LOT2.sql` | Tests de doublons, états, journal, envois, accès (transaction annulée) |
| `CONCURRENCE_LOT2.mjs` | Scénarios de concurrence réels (appels RPC parallèles) |
| `ROLLBACK_LOT2.sql` | Retour arrière |
| `PURGE_CONSERVATION_104_SEMAINES.sql` | Purge manuelle de conservation |
| `VERIFICATION_MOTEUR.sql` | Requêtes de comparaison moteur ↔ SQL (déjà jouées) |
| `lib/rapportHebdo.reel.test.ts` | Banc de comparaison sur données réelles (ignoré sans fichier) |

## 0. Ce que la revue a changé (v1 → v2)
La v1 ne distinguait pas un **échec de génération** d'une **semaine jamais
tentée** : un échec ne laissait aucune trace. v2 ajoute :
- un **journal insert-only des tentatives** (`institution_rapports_hebdo_executions`) ;
- une **vue d'état** (`institution_rapports_hebdo_etat`) : `calcule`, `vide`,
  `regenere`, `echec`, `non_genere` — et le drapeau `echec_apres_rapport`
  (une régénération a échoué, le rapport courant reste en place) ;
- le **contrôle de version attendue** pour la régénération (résultat `conflit`).

Règle d'interprétation, à graver dans les futures routes et écrans :
**l'absence de ligne signifie « jamais tentée », jamais « semaine vide ».**
`vide = true` signifie « calculé, sans activité ». Un échec n'est jamais
affiché comme une semaine sans activité.

## 1. Préalables (rappel)
- **Comparaison moteur ↔ SQL indépendant : faite, 0 écart** sur 11 semaines
  actives (RDV gratuits) et les lignes payantes de l'établissement c8f35698-…
  (32 RDV, 27 événements, 15 réservations payantes, 4 avis). Limites :
  mêmes auteur et spécification des deux côtés ; non comparés : taux et
  variations, créneaux, avis, rapprochement payant/RDV, plan d'action,
  demandes sans réponse ; un seul établissement de test, aucune semaine à
  ≥ 10 observations.
- **Suite globale** : 5 échecs, tous dans `app/api/qr/validate/route.test.ts`,
  dus à une modification non commitée de la route (`getBookingAccess`) que le
  test ne simule pas ; le 6e échec du premier passage ne s'est pas reproduit.
  Préexistants par rapport à ces fichiers, non corrigés.
- **`tsc`** : une erreur dans `app/api/admin/changements-profil/[id]/decision/route.test.ts`
  (dossier non suivi, hors de ce chantier). Aucune erreur dans les fichiers du
  rapport hebdomadaire.

## 2. Schéma (4 objets, 4 fonctions)
- `institution_rapports_hebdo` : instantanés (id, établissement, `semaine_debut`
  lundi / `semaine_fin` dimanche en UTC, `numero_version`, `est_courante`,
  `remplace_id`, `motif_regeneration`, `version_moteur`, `vide`, `contenu`,
  `genere_le`, `created_at`).
- `institution_rapports_hebdo_executions` : journal des tentatives
  (`cree | deja_genere | regenere | conflit | echec`).
- `institution_rapports_hebdo_etat` : vue d'état.
- `institution_rapports_hebdo_envois` : réservation d'envoi.
- Fonctions : `enregistrer`, `journaliser_echec`, `reserver_envoi`, `terminer_envoi`.

Contenu = `RapportHebdo` du moteur : blocs RDV gratuits et réservations
payantes séparés, aucun total consolidé, **aucune donnée personnelle** (ni
`citoyen_id`, ni nom, téléphone ou e-mail ; seuls comptes, montants, services,
créneaux).

## 3. RLS et privilèges
RLS activé sur les 4 tables, **aucune policy** (accès exclusif `service_role`,
convention du projet pour un appelant sans session Supabase Auth).
`REVOKE ALL` sur `PUBLIC`, `anon`, `authenticated` **et `service_role`** avant
les `GRANT` : les privilèges par défaut Supabase donnent déjà tous les droits à
`service_role` sur toute nouvelle table.

| Objet | anon | authenticated | service_role |
|---|---|---|---|
| `institution_rapports_hebdo` | aucun | aucun | SELECT, INSERT, UPDATE (pas de DELETE) |
| `..._executions` (journal) | aucun | aucun | SELECT, INSERT (insert-only) |
| `..._etat` (vue) | aucun | aucun | SELECT |
| `..._envois` | aucun | aucun | SELECT, INSERT, UPDATE |
| 4 fonctions | aucun | aucun | EXECUTE |

Triggers : le rapport n'accepte que `est_courante` true → false ; le journal
est insert-only. Échappatoire `SET LOCAL app.autoriser_correction_rapport_hebdo = 'on'`
(SQL Editor). Supprimer un établissement (cascade) l'exige aussi, comme pour
`journal_activite` et `document_events`.

## 4. Unicité
Index unique partiel `(institution_id, semaine_debut) WHERE est_courante` :
**un seul rapport courant par établissement et semaine**, les anciennes
versions restant consultables ; `UNIQUE (institution, semaine, numero_version)`.
La fonction `enregistrer` y ajoute un verrou consultatif par (établissement,
semaine) : l'index est le dernier garde-fou, pas le seul. Une unicité simple
sur (établissement, semaine) serait incompatible avec la conservation des
versions.

## 5. Conservation sur 104 semaines
- Rien n'est supprimé automatiquement. Les versions remplacées restent.
- Purge **manuelle**, par `PURGE_CONSERVATION_104_SEMAINES.sql` : aperçu des
  volumes, puis suppression en une transaction des **trois** tables
  (envois → journal → rapports, ordre imposé par les clés étrangères),
  terminée par un `ROLLBACK;` à remplacer par `COMMIT;` seulement si les
  chiffres sont conformes.
- Pas de donnée personnelle : la durée est un choix d'usage, **à valider** au
  regard des besoins métier et des obligations applicables (pas tranché ici).

## 6. Régénération et versionnement
- Jamais déclenchée par le cron. Réservée à un **processus serveur autorisé**
  (`service_role`), jamais au prestataire. Qui l'invoque (script, écran
  d'administration) reste à décider.
- `enregistrer(..., p_regenerer => true, p_motif, p_version_attendue)` :
  motif ≥ 5 caractères **et** version attendue obligatoires.
  - Version courante ≠ version attendue → **`conflit`**, rien n'est écrit
    (deux régénérations simultanées n'en produisent qu'une).
  - Sinon : ajout de la version n+1, ancienne conservée (non courante,
    chaînée par `remplace_id`), motif tracé.
- Rejeu sans régénération → `deja_genere`, aucune écriture de rapport.
- Chaque issue est inscrite au journal ; une exception annule l'appel et la
  route journalise l'échec par un second appel (`journaliser_echec`).

## 7. Doubles notifications : génération ≠ envoi
1. Générer ou régénérer un rapport **n'envoie rien** et n'écrit rien dans
   `notifications`.
2. L'envoi passe par `reserver_envoi` : insertion atomique dans
   `..._envois`, clé `(établissement, semaine, canal)` **sans numéro de
   version**, qui renvoie `true` à un seul appelant.
3. Une version régénérée ne rouvre jamais l'envoi. Un envoi `envoye` n'est
   jamais repris ; seul un `echec` peut l'être (compteur `tentatives`).
4. Un envoi `reserve` n'est **jamais relancé automatiquement** (risque de
   doublon) : détection par `reserve_le < now() - 15 minutes`, revue manuelle.
5. Pas d'envoi pour `vide = true` : règle côté appelant (Lot 6).
Limite assumée (at-most-once) : un arrêt entre la réservation et l'insertion
de la notification **perd** la notification, sans la dupliquer.
`notifications` n'a pas de clé naturelle et ne protège pas par elle-même.

## 8. Tests
**SQL (`TESTS_LOT2.sql`)** : transaction annulée, préconditions : migration
appliquée, au moins un établissement, semaines 2020. Résultat attendu :
`OK T1 … T24` puis `TOUS LES TESTS AUTOMATISABLES SONT PASSÉS`. Couvre :
création, idempotence, motif et version attendue obligatoires, régénération,
conflit, un seul courant, contenu immuable, réactivation et suppression
refusées, contraintes de période et de type, états `regenere` / `vide` /
`echec` / `calcule`, échec après rapport, journal complet et insert-only,
semaine jamais tentée, envois, accès `anon` / `authenticated` / `service_role`.

**Concurrence (`CONCURRENCE_LOT2.mjs`)** — l'éditeur SQL Supabase passe par un
pool de connexions et ne garantit pas deux sessions réelles ; les appels RPC
sont donc lancés en parallèle depuis Node, avec la clé `service_role`.
Conditions de réussite :

| Scénario | Condition de réussite |
|---|---|
| C1 : 10 créations simultanées de la même semaine | exactement 1 `cree`, 9 `deja_genere` |
| C2 : 6 régénérations simultanées sur la version 1 | exactement 1 `regenere`, 5 `conflit` |
| C3 : état final | 2 versions, 1 seule courante |
| C4 : 10 réservations d'envoi simultanées | exactement 1 `true` |
| C5 : échec simulé puis 10 reprises simultanées | exactement 1 `true` |
| C6 : création et régénération simultanées d'une semaine neuve | jamais 2 courants |

⚠️ Ce script **écrit dans la base réelle** (semaines de test 2020-03). Les
lignes ne sont pas supprimables par `service_role` : nettoyage SQL manuel
décrit en bas du script. À ne lancer qu'après validation et application de la
migration.

**Rien n'a été exécuté** (pas de Postgres local) : migration et tests ont été
relus à la main ; la syntaxe JavaScript du script est vérifiée (`node --check`),
le SQL ne l'est pas.

## 9. Rollback
`ROLLBACK_LOT2.sql` : contrôle des volumes, puis en une transaction
suppression de la vue, des 4 fonctions, des 3 tables (envois, journal,
rapports) et de la fonction de trigger. Destructif ; désactiver d'abord tout
cron ou route des Lots 3+. Les notifications déjà insérées ne sont pas
retirées.

## 10. Limites à conserver
- Moteur validé sans écart sur un jeu de test restreint ; taux, variations,
  rapprochements, plan d'action et demandes sans réponse non comparés au SQL.
- SQL de la migration et des tests **non exécuté ni validé syntaxiquement**.
- Conservation de 104 semaines à confirmer ; règles de régénération (qui, par
  quel canal) à décider.
- Les 5 échecs de `qr/validate/route.test.ts` et l'erreur `tsc` du dossier
  `changements-profil` restent à traiter séparément.

## 11. Décision attendue
Revue du SQL et des tests de ce dossier, puis décision : la migration peut-elle
être déplacée dans `supabase/migrations/` et exécutée (après passage des tests
en transaction annulée) ? Aucune exécution tant que ce n'est pas dit.
