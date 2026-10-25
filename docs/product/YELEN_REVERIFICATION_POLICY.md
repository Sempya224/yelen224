# Politique de revérification des modifications d'établissement

## ⚠️ Mise à jour 20/10/2026 — PUBLICATION DIFFÉRÉE (Lot 1, en base et validé)

Décision produit de Bryan du 20/10/2026 qui **remplace** la règle « enregistrement immédiat » ci-dessous pour les champs de niveau B :
- `institutions.*` = valeurs **publiées** (celles que voit le citoyen). Pour un établissement `validee`, un changement de nom, ville, adresse, coordonnées ou catégorie + activité principale reste une **proposition** (`institution_change_requests`, état `a_examiner`) jusqu'à la décision d'un admin ; l'établissement reste visible avec l'ancienne valeur.
- L'établissement voit **sa** proposition dans son espace (`GET /api/institution/profile` la superpose) ; une pastille rouge et un bloc de suivi signalent « en attente ».
- Une seule proposition ouverte par champ ; une nouvelle proposition ou le retour à la valeur publiée retire la précédente (état `retiree`).
- Admin : « Approuver et publier » (publie dans la même transaction, régénère le slug pour un nom) ou « Refuser » (motif obligatoire, la valeur publiée reste). Notification à l'établissement dans les deux cas. Relance : ancienneté « en attente depuis N j », aucune publication automatique.
- Établissement pas encore validé (`en_attente`, `refusee`, `suspendue`) : application directe, pas de demande. Réauthentification exigée dans tous les cas.
- Migration `20261020000001` (remplace les fonctions de `20261019000002/3`), scénarios `supabase/tests/publication_differee_scenarios.sql` : 17/17 OK. Les anciens scripts de scénarios sont marqués obsolètes.
- **Lot 2 — compléments répétables (en base et validé, 17/17)** : migration `20261020000002`, journal d'échanges immuable `institution_change_request_events` (on n'utilise PAS `verification_decisions.complement_demande`, dont la dernière décision par axe remplacerait la décision courante du dossier de confiance). L'admin demande un complément (motif obligatoire, pièces attendues facultatives, répétable) pendant que la proposition reste ouverte ; l'établissement est notifié, dépose les pièces dans l'onglet Documents existant (versionné) puis répond depuis le bloc de suivi. L'état se déduit du dernier événement ; compteur admin « Compléments reçus à réexaminer ». Scénarios : `supabase/tests/complements_scenarios.sql`.
- **Lot 3 — restriction d'accès citoyen (en base et validé, 14/14)** : migrations `20261020000003` et `20261020000004`. L'admin (permission `institutions.manage`, confirmation explicite côté serveur, motif obligatoire, durée facultative 1–365 j) restreint l'accès pendant l'examen : on RÉUTILISE la suspension existante (statut `suspendue`, référence `SUS-…`, annulation des RDV imminents, écran « Espace suspendu » avec droit de révision, levée manuelle ou automatique) — appliquée en une seule transaction liée à la demande (statut + suspension + événement du journal + admin_logs) par `restreindre_acces_changement_profil`. La proposition reste ouverte ; approuver/refuser ne lève PAS la restriction (la levée se fait par la page Institutions existante). Trou corrigé : un établissement `suspendue` reste protégé (ses changements sensibles restent des propositions, `appliquer_modifications_sensibles` traite `validee` et `suspendue` comme publics). Scénarios : `supabase/tests/restriction_scenarios.sql`.
- **Reste ouvert** : niveau C (statut juridique) à spécifier ; relance automatique des propositions anciennes (aujourd'hui : ancienneté affichée à l'admin, aucune relance push) ; vérification visuelle réelle (aucun navigateur disponible dans cet environnement).
- ECOBANK : sa demande n°8 (ancien modèle, valeur déjà publiée) reste ouverte ; l'approuver la clôt sans effet visible.

Les sections 1 à 10 ci-dessous décrivent le modèle INITIAL (publication immédiate) et restent valables pour le reste (réauthentification, normalisation, droits) ; là où elles disent « enregistrement immédiat », c'est la mise à jour ci-dessus qui fait foi.

Statut initial : **décisions produit validées par Bryan le 19/10/2026 (niveaux A, B, C-verrou ; 7 points tranchés). Migrations 20261019000001 et 20261019000002 exécutées par Bryan le 20/10/2026 ; vérifications de structure conformes ; scénarios SQL S1–S14 : 100 % OK (rapport du 20/10/2026). Restent : confirmation du `REVOKE` service_role (étape 1b, §7bis), S15 (concurrence réelle, optionnel, institution de test), puis phase 5 (route backend, REAUTH_REQUIRED web + mobile, écran admin) — non commencée, en attente d'autorisation explicite.**
Périmètre : `PUT /api/institution/profile` (web `ProfilEntrepriseTab.tsx`, mobile `mobile/src/hooks/useEntreprise.ts`).

## 1. Niveaux

| Niveau | Champs | Règle |
|---|---|---|
| A | description, logo, bannière, horaires, langues, contacts (phone, whatsapp, email, website), année, capacité, services, conditions/informations, **quartier**, **activités secondaires** | Enregistrement immédiat, inchangé, aucune demande |
| B | nom, ville, adresse, coordonnées (latitude+longitude), catégorie + activité principale | Réauthentification → enregistrement immédiat → statut de l'établissement inchangé → demande d'examen administratif + compteur admin + historique traçable |
| C | statut juridique | **Non modifié par cette fonctionnalité.** Parcours existant conservé, avec son erreur 409 quand le verrou s'applique. Demande de changement : à spécifier séparément (§9) |

## 2. Décisions produit (19/10/2026)

| # | Point | Décision |
|---|---|---|
| 1 | Réauthentification | PIN existant + TOTP si activé, via `POST /api/institution/auth/reauth` (fenêtre 10 min). Aucun nouveau mécanisme. |
| 2 | Quartier | Niveau A (sauf règle réglementaire/métier ultérieure). |
| 3 | Activités secondaires | Niveau A, aucune demande automatique. |
| 4 | Notification équipe | Compteur « À examiner » dans l'admin + événement dans `admin_logs`. Pas d'e-mail dans cette phase. **Voir §6 : `admin_logs` ne peut pas recevoir l'événement de création.** |
| 5 | Décision `a_corriger` | Aucune modification automatique du profil ni du statut. La correction reste une action explicite du responsable. |
| 6 | Atomicité | Une seule transaction pour la mise à jour du profil et la création des demandes (§5). |
| 7 | Niveau C | À spécifier séparément avant implémentation. |

## 3. Transitions autorisées (niveau B)

- Une demande naît à l'état `a_examiner`, jamais autrement.
- `a_examiner` → `examinee` : une seule transition, par un admin actif ayant `institutions.verify`, avec décision `conforme` ou `a_corriger` (commentaire obligatoire pour `a_corriger`), nom et date de l'acteur.
- Aucune autre transition ; une demande `examinee` ne se rouvre pas (nouvel examen = nouvelle demande).
- L'existence ou la décision d'une demande **ne modifie jamais** `institutions.statut`, `badge_verifie` ni `niveau_confiance`. Toute action sur le statut reste faite explicitement via les routes admin existantes (`avertir`, `suspendre`…).
- `a_corriger` : le responsable voit la demande et le commentaire (route de lecture filtrée par `membre.institutionId`, étape 5) et corrige lui-même via le profil — ce qui crée alors une nouvelle demande si le champ re-change.

## 4. Comparaison avant/après (aucune demande si identique)

Faite **côté base**, sous verrou, contre la ligne réellement enregistrée (`appliquer_modifications_sensibles`). Le diff éventuel fait par la route ne sert qu'à répondre tôt `403 REAUTH_REQUIRED`.
- Textes (nom, ville, adresse) : NFC, trim, espaces multiples réduits, insensible à la casse ; un accent différent reste une vraie différence.
- Écriture vs demande : si seule la forme change (casse, espaces), la valeur brute est enregistrée mais **ni réauthentification ni demande** ne sont requises ; si la valeur normalisée change, réauth + demande.
- Coordonnées : arrondi à 6 décimales (≈ 0,1 m) pour décider d'une demande ; la valeur exacte est tout de même enregistrée.
- Catégorie + activité principale : comparaison d'identifiants (uuid).
- Le formulaire envoie tous les champs à chaque sauvegarde : seuls les champs réellement différents comptent.

## 5. Transaction atomique et anti-doublon

- Fonction `public.appliquer_modifications_sensibles(...)` (migration `20261019000002`), même modèle que `decider_demande_activite` : `SECURITY DEFINER`, `search_path = public`, verrou `pg_advisory_xact_lock('institution_profil:<id>')`, `EXECUTE` réservé à `service_role`.
- Dans la même transaction : revérification de la réauth en base (`institution_sessions.reauth_at`, session + membre + institution correspondants, non révoquée), `UPDATE institutions`, réécriture de `institution_activites` si besoin, `INSERT` d'une demande par champ logique réellement modifié (`name`, `ville`, `adresse`, `coordonnees`, `activite`).
- Toute exception (réauth `YR001`, contrainte, index anti-doublon, cast invalide) annule tout : aucun état partiel.
- Doublons : (1) recalcul du diff sous verrou → une requête identique rejouée ou concurrente ne trouve aucun changement ; (2) index unique partiel `icr_pas_de_doublon_ouvert` (institution, champ, ancienne→nouvelle valeur, état `a_examiner`) en dernier filet.
- Ordre dans la route : validations → contrôle de rôle → pré-vérification réauth → RPC (niveau B) → UPDATE niveau A (idempotent). Si l'UPDATE niveau A échoue après la RPC, le niveau B reste enregistré et le rejeu ne crée aucune demande supplémentaire.

## 6. Notification équipe — constat sur `admin_logs`

`admin_logs.admin_id` est `NOT NULL` et référence `admin_users(id)` (migration `20260709000002`), la table est immuable depuis `20260830000003`. Un événement de **création** de demande n'a pas d'admin acteur : il ne peut pas y être écrit sans inventer un acteur.
Proposition (à valider) : le compteur « À examiner » = `COUNT(*)` des demandes `statut='a_examiner'` (index partiel dédié, aucune table de plus) ; la création est tracée par la demande elle-même (numéro `YL-CHG-…`, auteur, IP, date) ; l'**examen** écrit bien une ligne `admin_logs` (acteur admin réel) dans la future fonction de décision. Journal d'activité institution (`journal_activite`) : une ligne côté institution à la création, comme pour les autres actions du profil.

## 7. Vérifications SQL à exécuter AVANT les migrations (Bryan, SQL Editor)

```sql
-- Q1 : types réels des colonnes utilisées par les migrations
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND (
     (table_name = 'admin_users'          AND column_name IN ('id','prenom','nom','is_active'))
  OR (table_name = 'institution_membres'  AND column_name IN ('id','institution_id','prenom','nom'))
  OR (table_name = 'institution_sessions')   -- toutes les colonnes : le script de scénarios y insère des sessions de test
  OR (table_name = 'institutions' AND column_name IN ('statut','badge_verifie','niveau_confiance','statut_juridique','plan'))
  OR (table_name = 'institutions'         AND column_name IN ('id','name','slug','ville','adresse','latitude','longitude','activite_categorie_id'))
  OR (table_name = 'institution_activites' AND column_name IN ('institution_id','activite_id','principale','ordre'))
)
ORDER BY table_name, ordinal_position;

-- Q2 : clés étrangères réelles (admin_users, sessions, activités)
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND (conrelid IN ('public.admin_logs'::regclass, 'public.institution_sessions'::regclass, 'public.institution_activites'::regclass)
       OR confrelid = 'public.admin_users'::regclass)
ORDER BY 1, 2;

-- Q3 : effets de bord possibles (triggers/RLS sur les tables écrites) + version/extension
SELECT tgrelid::regclass AS table_name, tgname FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.institutions'::regclass, 'public.institution_activites'::regclass);
SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.institutions'::regclass, 'public.institution_activites'::regclass);
SELECT version();
SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp';
```
Attendu : `id`/FK en `uuid`, `reauth_at`/`revoked_at` en `timestamp with time zone`, PostgreSQL ≥ 13 (`normalize()`), `uuid-ossp` présent, aucun trigger inattendu sur `institutions` (un trigger existant pourrait réagir à l'UPDATE de la fonction). Aucune hypothèse sur ces résultats n'est faite dans le code.

### 7bis. Prérequis d'exécution et ordre (rapport technique du 20/10/2026)

Ordre strict, exécuté par Bryan dans le SQL Editor, une étape à la fois, en vérifiant le résultat avant la suivante :
1. Q1, Q2, Q3 ci-dessus (lecture seule) → comparer au « Attendu ». Toute divergence bloque : corriger la migration avant exécution.
2. `20261019000001_institution_change_requests.sql` (table, séquence, trigger, index, droits).
3. `20261019000002_appliquer_modifications_sensibles.sql` (dépend de la table ; crée aussi `normaliser_texte_profil`).
4. `supabase/tests/institution_change_requests_scenarios.sql` : doit se terminer par une erreur dont le message est le rapport ; **aucune ligne FAIL** attendue. Tout est annulé par cette erreur finale.
5. Seulement ensuite : route backend, `REAUTH_REQUIRED` web + mobile, écran admin.
Rollback : bloc en fin de chaque migration (fonction d'abord, table ensuite). Le code applicatif de phase 5 ne doit pas être déployé avant les migrations (la route appellerait une fonction inexistante).
Résultats Q1–Q3 relevés par Bryan le 20/10/2026 : types et clés étrangères conformes à l'attendu ; PostgreSQL 17.6 ; RLS active sur `institutions` et `institution_activites` ; `uuid-ossp` présent ; un seul trigger existant sur `institutions`, `trg_institutions_maj` (BEFORE UPDATE, fonction `update_mis_a_jour_le()` qui ne fait que `NEW.mis_a_jour_le = NOW()`), compatible : l'UPDATE de la fonction mettra donc aussi `mis_a_jour_le` à jour, sans toucher au statut. Aucun trigger sur `institution_activites`.
Tests automatisés disponibles dès maintenant : `npx vitest run supabase/tests` (13 garde-fous statiques sur le texte des migrations : périmètre d'écriture, droits, absence de CASCADE/SET NULL, ordre de verrouillage…).

## 8. Tests prévus

**Vitest (route, mocks, comme `app/api/qr/validate/route.test.ts`)**
1. 401 non authentifié ; 403 rôle sans `profil_entreprise.write` sur un champ de niveau B.
2. Corps ne contenant que des champs de niveau A → aucun appel RPC, aucune exigence de réauth, comportement actuel.
3. Changement sensible sans réauth récente → 403 `REAUTH_REQUIRED`, aucun appel RPC, aucune écriture.
4. Changement sensible avec réauth → RPC appelé avec les bons paramètres (institution/membre/session issus de la session, jamais du corps) ; le PIN/mot de passe n'apparaît dans aucun paramètre ni log.
5. RPC répond `YR001` (course : réauth expirée entre-temps) → 403 `REAUTH_REQUIRED`.
6. RPC répond une autre erreur → 500 générique sans fuite du message interne ; aucun UPDATE de niveau A tenté.
7. Corps complet identique à l'existant (mobile/web renvoient tout) → pas de demande, réponse OK.
8. Valeur invalide (URL, latitude hors bornes) → 400 avant tout appel RPC.
9. Statut juridique différent avec documents soumis → 409 inchangé ; statut juridique n'est jamais transmis à la RPC.
10. UPDATE niveau A échoue après RPC réussie → erreur renvoyée, rejeu ne crée aucune demande (RPC mockée idempotente).

**Scénarios SQL (script à rejouer par Bryan dans une transaction terminée par `ROLLBACK`, écrit après validation des migrations ; aucun Docker disponible)**
1. Aucun changement → 0 demande. 2. Changement de casse/espaces seul → valeur écrite, 0 demande, pas de réauth. 3. Changement de nom avec réauth fraîche → 1 demande, `institutions.statut` identique. 4. Même appel sans réauth / réauth périmée / session révoquée / session d'un autre membre → `YR001`, rien d'écrit. 5. Rejeu identique → 0 nouvelle demande. 6. Delta de coordonnées < 1e-7 → 0 demande. 7. Échec forcé après l'UPDATE (index anti-doublon via insertion manuelle d'une demande ouverte identique) → nom inchangé (rollback complet). 8. Insertion directe d'un doublon ouvert → refusée par l'index. 9. Trigger : UPDATE du contenu, DELETE, double examen refusés ; une seule transition `a_examiner→examinee` acceptée ; `a_corriger` sans commentaire refusé. 10. Rôles `anon`/`authenticated` : SELECT sur la table et EXECUTE sur les deux fonctions refusés. 11. Membre d'une autre institution → erreur. 12. Concurrence : deux sessions SQL appelant la fonction en parallèle avec la même valeur → une seule demande.

## 8 bis. Relance automatique des propositions anciennes (20/10/2026, migration `20261020000005`, NON exécutée)

Job pg_cron quotidien (08:00 UTC) `relancer_propositions_anciennes()` : pour chaque proposition `a_examiner` d'un établissement `validee`, inactivité = depuis la création ou le dernier échange de complément (demandé/fourni). À 7 jours puis à 14 jours : un événement journal `relance_envoyee` (acteur `systeme`, marqueur `relance_7j`/`relance_14j`, immuable) + une notification in-app à l'établissement (« toujours en cours d'examen » ou « complément attendu » si la balle est chez lui). Une seule relance par palier et par période d'activité ; un nouvel échange redémarre l'horloge. **Ne publie jamais** et ne touche ni `institutions` ni la demande. Établissements non publics : pas de relance. Côté admin : la chronologie affiche « Relance automatique envoyée » ; les relances sont ignorées par `etatComplement` et par le compteur « compléments reçus ». Seuils alignés SQL/TS par test (`PALIERS_RELANCE_JOURS`). Vérification : `supabase/tests/relance_scenarios.sql`.

## 9. Niveau C — à spécifier (rien n'est implémenté)

Création de la demande, traitement par Yelen, documents éventuellement requis, décision finale, conséquences sur `statut`/`badge_verifie`/dossier de vérification. Le verrou 409 de `api/institution/profile` reste le seul comportement.

## 10. Hors périmètre actuel

Identité internationale (`api/institution/identite-internationale`) : à classer séparément. Écran admin de traitement et fonction de décision : étape 6.
