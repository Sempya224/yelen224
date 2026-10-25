# Rapport hebdomadaire — Audit du Lot 3 (route interne + déclenchement pg_cron)

Date : 20/10/2026. **Audit et plan uniquement.** Aucune route créée, aucun cron
programmé, aucune migration écrite ni exécutée, aucun déploiement, aucun
commit. Décisions Bryan intégrées : architecture B (pg_cron -> route Next
interne -> moteur), conservation 104 semaines, **régénération réservée au
super-administrateur** avec journalisation, tâches automatiques avec leur
**propre** autorisation serveur (sans se faire passer pour un humain).

Sources lues : `proxy.ts`, `lib/edgeSecurity.ts`, `lib/deviceAccess.ts`,
`lib/geoAccess.ts`, `app/api/internal/geo-bypass/route.ts`,
`supabase/migrations/20260724000009_cron_rappels_rdv.sql`,
`20260805000011_clock_in_daily_attendance_cron.sql`, `lib/rapportsAggregation.ts`,
`lib/notificationEngine.ts`, `lib/config.ts`, `netlify.toml`, `supabase/config.toml`.

## 1. Constats sur l'existant

| # | Constat | Source | Conséquence |
|---|---|---|---|
| 1 | Aucune route Next n'est aujourd'hui appelée par `pg_net`. Tous les crons existants appellent des **Edge Functions Supabase** (`/functions/v1/...`) avec `Authorization: Bearer <service_role_key lue dans Vault>`. | migrations 20260724000009, 20260805000011 | Pas de précédent à copier pour une route Next ; le pattern Vault est réutilisable. |
| 2 | `proxy.ts` s'applique à **tout** chemin (matcher large), y compris `/api/internal/*`. Géoblocage et mur mobile **exemptent `/api`** ; restent actifs : signatures d'outils de scan (toujours) et rate limiting (si `EDGE_RATE_LIMIT_ENABLED=true`). | `proxy.ts` l.275-367, `deviceAccess.ts` l.50 | Seules deux couches peuvent atteindre un appel pg_net, voir 3 et 4. |
| 3 | **User-Agent vide = requête refusée (403 « Requête refusée »)** par `estUserAgentSuspect`. Je n'ai pas pu confirmer l'en-tête `User-Agent` que `pg_net` envoie par défaut. | `edgeSecurity.ts` l.25-27 | **Risque de blocage silencieux.** À neutraliser : l'appel envoie son propre `User-Agent: yelen-pgcron/1`. [À VÉRIFIER en conditions réelles] |
| 4 | Rate limit edge : 240 req/min/IP, **état en mémoire par instance**, aujourd'hui désactivé par défaut. `ENDPOINTS_SENSIBLES` ne contient pas `/api/internal/*`. | `edgeSecurity.ts` l.52-89 | Un envoi en rafale de N requêtes depuis la même IP pourrait être limité si l'option est activée et N > 240/min : le déclencheur doit étaler (voir §5). |
| 5 | Le secret de contournement géo `GEO_BYPASS_TOKEN` utilise `timingSafeEqual` **manuelle** (Edge, sans `crypto`). Une route Node peut utiliser `crypto.timingSafeEqual`. | `geo-bypass/route.ts`, `geoAccess.ts` | Pour la route (runtime Node), utiliser `crypto.timingSafeEqual` après égalisation des longueurs. 404 générique en cas d'échec, comme `geo-bypass`. |
| 6 | URL de base : `https://yelen224.netlify.app` (défaut de `lib/config.ts`). Domaine `yelen224.com` prévu via **Cloudflare** (21/10, mémoire projet). | `lib/config.ts` | **Deux pièges** (§7) : redirection netlify.app -> domaine principal, et défi bot de Cloudflare sur un appel pg_net. |
| 7 | `netlify.toml` ne définit **aucun** délai/limite de fonction ; plugin `@netlify/plugin-nextjs`. | `netlify.toml` | Délai par défaut des fonctions serverless (de l'ordre de 10 s) : **une institution par appel**, requêtes bornées. Valeur exacte non lue dans ce dépôt. [À VÉRIFIER dans le tableau de bord Netlify] |
| 8 | PostgREST plafonne les lignes (`max_rows = 1000` dans le `config.toml` local ; valeur du projet cloud non vérifiée). | `supabase/config.toml` l.18 | Le chargeur **doit paginer** (`.range`). Une lecture sans pagination tronquerait silencieusement les données. |
| 9 | `lib/rapportsAggregation.ts` fait `.limit(5000)` sur `paid_bookings` : au-delà du plafond serveur, la limite demandée ne suffit pas. | `rapportsAggregation.ts` l.74 | Ne pas copier ce pattern tel quel ; pagination explicite. |
| 10 | Les notifications d'institution ciblent l'**institution** (`destinataireId = institutionId`, `destinataireType = "institution"`), pas un membre. | `notificationEngine.ts`, `activiteInstitution.ts` | Lot 6 : une notification par établissement, pas par membre. |
| 11 | Privilèges Lot 2 : `service_role` a SELECT/INSERT/UPDATE sur les rapports, SELECT/INSERT sur le journal, EXECUTE sur 4 fonctions. | contrôles du 20/10 | La route peut fonctionner avec `SUPABASE_SERVICE_ROLE_KEY` sans nouveau privilège. |

## 2. Contrat de la route interne (proposition)

`POST /api/internal/rapport-hebdo/generer` — runtime Node, `dynamic = "force-dynamic"`.

Entrée (JSON) : `{ "institution_id": "<uuid>", "lundi": "YYYY-MM-DD" }`.
Aucun autre champ n'est lu. **Pas de paramètre `regenerer`** : cette route ne
régénère jamais (l'appel interne passe toujours `p_regenerer = false`).

| Étape | Règle |
|---|---|
| 1. Authentification | En-tête `Authorization: Bearer <secret>` comparé en temps constant à `CRON_RAPPORT_SECRET`. Variable absente, en-tête absent ou faux -> **404 générique**, corps identique à une route inexistante, aucune distinction entre les cas. Méthodes autres que POST -> 404. |
| 2. Validation | `institution_id` UUID valide ; `lundi` = date valide, un lundi, semaine terminée (le moteur lève sinon). Sinon 400 **après** authentification seulement. |
| 3. Éligibilité | L'établissement existe et a le statut retenu (décision §10). Sinon `200 { resultat: "ignore" }` sans écriture. |
| 4. Chargement | Chargeur dédié (§4). |
| 5. Calcul | `calculerRapportHebdo(entree)` (moteur validé, pur). |
| 6. Écriture | RPC `institution_rapport_hebdo_enregistrer` avec `p_regenerer = false`. Réponses : `cree` ou `deja_genere`. |
| 7. Échec | Toute exception -> RPC `institution_rapport_hebdo_journaliser_echec` (message technique tronqué, **jamais** de donnée client) puis `500`. Si même cet appel échoue : log structuré sur la sortie standard (`console.error` JSON : identifiant, semaine, étape), sans contenu métier. |
| 8. Réponse | `{ resultat, numero_version }` uniquement. Aucun contenu du rapport n'est renvoyé. |

La route ne renvoie jamais de donnée métier : un secret compromis permet donc
au pire de **forcer un calcul idempotent**, pas de lire des données.

## 3. Séparation des autorisations : cron vs super-administrateur

| Acteur | Chemin | Autorisation | Peut régénérer ? |
|---|---|---|---|
| Tâche automatique | `POST /api/internal/rapport-hebdo/generer` | Secret serveur dédié `CRON_RAPPORT_SECRET` | **Non**, jamais |
| Super-administrateur | `POST /api/admin/rapports-hebdo/regenerer` (à créer) | Session admin via `lib/adminAuth.ts::authorizeAdmin`, **nouvelle permission réservée à `super_admin`** (deny-by-default déjà en place pour toute permission absente de la matrice) | Oui, avec motif ≥ 5 caractères et version attendue |
| Prestataire (institution) | routes de lecture du Lot 4 | session institution + onglet `rapports` | **Non**, lecture seule |

Journalisation exigée par Bryan : acteur, date, motif, version précédente.
Aujourd'hui le schéma stocke le **motif**, la **date** (`created_at`) et la
**version précédente** (`remplace_id`) mais **PAS l'acteur**. **Écart à combler
avant le Lot 3** : migration complémentaire (non écrite, non exécutée) :
- colonne `acteur text NOT NULL` sur `institution_rapports_hebdo_executions`
  et `genere_par text` sur `institution_rapports_hebdo` (valeurs : `cron` ou
  `admin:<admin_users.id>`), avec contrainte de format ;
- paramètre `p_acteur text` dans `enregistrer` et `journaliser_echec`
  (nouvelle signature : les 24 tests SQL et le script de concurrence sont à
  mettre à jour) ;
- l'acteur n'est jamais fourni par le corps d'une requête : la route le
  déduit (`cron` pour la route interne, id issu de la session pour l'admin).

## 4. Chargeur de données (`lib/rapportHebdoChargeur.ts`, à créer)

Client `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`
(même schéma que `rapportsAggregation.ts`). Une institution, une semaine.
Fenêtre : 14 jours (semaine rapportée + précédente) ; non traités sur 30 jours.

| Donnée | Requête | Remarques |
|---|---|---|
| `rdv` | trois lectures dédupliquées par `id` : `created_at` dans la fenêtre ; `date_rdv` dans la fenêtre ; `non_traite_marque_le` dans les 30 derniers jours | colonnes exactement celles de `RdvLigne` ; **pagination `.range`** |
| `evenements` | `rdv_events` pour les `rdv_id` lus, par lots de 100 identifiants (longueur d'URL) | pagination ; colonnes de `RdvEvenementLigne` |
| `paiements` | `paid_bookings` (+ nom de service) : `created_at` / `traite_le` / `date_rdv` / `declare_le` dans la fenêtre, **plus** tous les `en_attente` (réservations non traitées) | pagination ; embed `paid_services(nom)` comme `rapportsAggregation.ts` (FK existante) |
| `avis` | `avis` de la semaine rapportée | colonnes vérifiées le 20/10 : `id, note, created_at, masque, brouillon, reponse_institution, institution_id` |
| `clientsServisAvant` | pour les seuls `citoyen_id` servis pendant la semaine : RDV `termine` de cet établissement avec `date_rdv` < lundi | requête bornée par le nombre de clients servis, pas par l'historique |

Règles : toute erreur Supabase est **destructurée et propagée** (piège connu
« erreur prise pour un 404 ») ; jamais un tableau vide en cas d'erreur, car il
produirait une semaine « vide » fausse. Aucune donnée personnelle n'est
journalisée. Volume attendu : quelques dizaines de lignes par établissement.

## 5. Déclenchement : file d'attente idempotente plutôt qu'un envoi unique

Constat : `pg_net` est asynchrone, et si la requête n'atteint jamais la route
(secret erroné, domaine, blocage edge) **aucun journal Next n'est écrit** : la
semaine resterait silencieusement « jamais tentée ». Proposition :

1. **Fonction de sélection** `institution_rapports_hebdo_a_generer(p_lundi date, p_limite int)` :
   renvoie les établissements éligibles **sans rapport courant** pour la
   semaine et avec **moins de 3 échecs** au journal. Testable en SQL sans HTTP.
2. **Fonction de déclenchement** : lit le secret et l'URL de base dans Vault,
   appelle `net.http_post` pour chaque identifiant sélectionné (au plus
   `p_limite`, p. ex. 25), avec `User-Agent: yelen-pgcron/1`.
3. **Planification** (UTC, la base est en UTC) : un passage toutes les 5
   minutes le lundi de 06:00 à 08:55, puis un passage le mardi 06:00. Chaque
   passage ne traite que ce qui manque encore : c'est à la fois l'étalement de
   charge (§1.4), la reprise après échec et le filet contre une route
   injoignable. Rien n'est relancé après le mardi : intervention manuelle.
4. **Surveillance** (aucune infrastructure d'alerte n'existe) : requête de
   contrôle sur la vue d'état (`etat = 'echec'` ou semaine éligible
   `non_genere` après le mardi) ; carte de suivi côté admin = lot ultérieur.

Semaine ciblée : `date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7`.

## 6. Idempotence et reprise

- Une relance de la même semaine ne crée jamais de second rapport : verrou
  consultatif + index unique partiel + résultat `deja_genere` (testé en SQL,
  24 tests passés le 20/10).
- Deux appels simultanés pour le même établissement : un `cree`, l'autre
  `deja_genere` (scénario C1 du script de concurrence, **non exécuté**).
- L'envoi de notification est un mécanisme séparé (Lot 6, table des envois) ;
  la génération n'envoie rien.
- Test de reprise prévu : rendre le calcul volontairement en échec pour un
  établissement de test, vérifier `echec` au journal et dans la vue, puis
  corriger et vérifier le passage suivant -> `calcule`, une seule ligne
  courante.

## 7. Secret, URL et domaine

**Secret `CRON_RAPPORT_SECRET`** (distinct de la clé service_role ; ne donne
accès qu'à cette route) :
- généré par Bryan (32 octets aléatoires), stocké **deux fois** : variable
  d'environnement Netlify et secret Vault `cron_rapport_secret` ;
- jamais dans une migration, un fichier versionné ni un log ;
- rotation : ajouter la nouvelle valeur côté Netlify, mettre à jour Vault,
  vérifier un passage, retirer l'ancienne ; la route n'accepte qu'une valeur
  à la fois (fenêtre de rotation courte) — évolution possible vers deux
  valeurs si la coupure est inacceptable.

**URL de base** : à lire dans Vault (`app_base_url`) et non codée en dur dans
la fonction de déclenchement, pour pouvoir la changer sans migration. Deux
risques à lever **avant** la mise en production :
1. [À VÉRIFIER] Si `yelen224.com` devient le domaine principal sur Netlify, le
   sous-domaine `*.netlify.app` peut être **redirigé** vers lui ; `pg_net` ne
   suivrait pas correctement une redirection de POST.
2. Cloudflare devant Netlify (bot management, règles WAF) peut **défier ou
   bloquer** une requête issue d'un datacenter sans navigateur : prévoir une
   règle d'exception limitée au chemin `/api/internal/rapport-hebdo/*`
   (et au secret), ou appeler l'origine directement.
Ces deux points dépendent de la configuration de Bryan (Netlify, Cloudflare) et
sont indémontrables par le code seul.

## 8. Droits d'accès

La route utilise `SUPABASE_SERVICE_ROLE_KEY` (contourne la RLS) mais **n'appelle
que** 4 RPC et des lectures ciblées sur 6 tables, toutes filtrées par
`institution_id` : jamais une lecture globale. `anon` et `authenticated`
n'ont aucun droit sur les objets du rapport (vérifié). La clé reste côté
serveur uniquement.

## 9. Plan de tests (rien n'est écrit)

| Niveau | Cas | Condition de réussite |
|---|---|---|
| Route (Vitest, supabase simulé, modèle `route.test.ts` existants) | pas de secret / mauvais secret / variable absente | 404 identique, aucune requête base |
| | GET au lieu de POST | 404 |
| | corps invalide ou lundi non lundi | 400 après authentification |
| | semaine non terminée | échec journalisé, pas de rapport |
| | établissement inéligible | `ignore`, aucune écriture |
| | succès puis rejeu | `cree` puis `deja_genere` |
| | exception en cours de calcul | `journaliser_echec` appelé, 500, aucun détail interne dans la réponse |
| | échec de `journaliser_echec` | log structuré, 500 |
| Chargeur | plus de 1000 lignes (simulées) | pagination complète |
| | erreur Supabase | exception propagée, jamais un tableau vide |
| | citoyen avec RDV `termine` antérieur | exclu des nouveaux clients |
| SQL (lecture) | fonction de sélection | renvoie seulement les établissements sans courant et < 3 échecs |
| Bout en bout (après validation) | un établissement de test, une semaine passée, appel manuel avec curl | `calcule` ou `vide` dans la vue ; aucune notification créée |
| Sécurité | appel avec User-Agent vide | refusé par `proxy.ts` (comportement actuel, à documenter) ; appel avec `yelen-pgcron/1` accepté |

## 10. Décisions attendues de Bryan

1. **Statuts éligibles** : `validee` seul (ma proposition), ou aussi `suspendue` ?
2. **Plan d'abonnement** : le rapport est-il réservé à certains plans ? Je n'ai
   trouvé aucune restriction par plan sur l'onglet `rapports`.
3. **Acteur journalisé** : valider la migration complémentaire (§3) avant le Lot 3.
4. **Passages du cron** : lundi 06:00-08:55 toutes les 5 min + mardi 06:00 ; 3 échecs maximum par semaine et établissement ; 25 établissements par passage : à confirmer.
5. **Secret** : accord pour un secret dédié `CRON_RAPPORT_SECRET` (génération, Netlify et Vault par Bryan).
6. **Domaine** : calendrier de la bascule `yelen224.com` / Cloudflare, car il conditionne l'URL appelée par le cron (§7).

## 11. Ordre d'exécution proposé (après validation)

1. Migration complémentaire (acteur, sélection, déclenchement) — exécutée par Bryan, **sans** `cron.schedule`.
2. Code : chargeur, route interne, route admin de régénération, permission `super_admin`, tests Vitest — PR vers `main` (protégée : CI `build-and-typecheck` + review).
3. Secret : Netlify + Vault ; déploiement par la PR ; test manuel avec `curl`.
4. Seulement ensuite : `cron.schedule` (ordre inverse = appels vers une route inexistante).
5. Surveillance les deux premiers lundis.

## 12. Limites de cet audit
- Je n'ai pas pu confirmer l'en-tête `User-Agent` de `pg_net`, le délai de fonction Netlify, la valeur de `max_rows` du projet cloud ni le comportement de redirection netlify.app / domaine principal.
- Rien n'a été exécuté : tout le plan est à valider avant écriture.
- La couverture des tests du moteur reste limitée (voir `lot2/PROPOSITION_LOT2.md` §1).
