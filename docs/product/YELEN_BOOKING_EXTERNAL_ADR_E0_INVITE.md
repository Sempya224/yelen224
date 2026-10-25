# ADR-001 — Réservation invité : vérification téléphonique avant création du RDV

**Statut** : Accepté (19/10/2026), révisé le même jour suite au retour
CEO (résolution de la tension sur la création de la ligne `users`, flag
`compte_complete_le` spécifié, flux de conversion ajouté). **Design non
encore implémenté — aucune ligne d'E0.1 n'est écrite.** Décide le
séquencement, pas le code.

**Contexte complet** : `docs/product/YELEN_BOOKING_EXTERNAL_INTEGRATION_PHASE0.md`
(Phase 0, Phase E0 — lots E0-A/B/C, Retour CEO, vérification `pg_policies`
live). Ce document ne reprend pas cette analyse — il fixe la décision qui
en découle et ce qu'elle exige avant tout code.

## Décision

**Design A.** Un invité vérifie son téléphone (OTP réel) **avant** que le
RDV ne soit créé. Aucun créneau n'est jamais verrouillé par une identité
non vérifiée. Pas de nouveau statut RDV, pas de TTL, pas de cron de purge
de RDV pour ce problème.

**[MISE À JOUR 19/10/2026, retour CEO]** La version initiale de cet ADR
créait la ligne `users` de l'invité *avant* la vérification OTP (pour
obtenir un OTP réel plutôt que le `CITOYEN_OTP_FALLBACK` partagé) — ce
qui recréait un risque différent : pollution de `users` et SMS pumping
par création de sessions en masse jamais finalisées. Résolu en §
Séquencement, étape 2 révisée : **aucune ligne durable n'est créée avant
succès de l'OTP**, dans aucune version du design. Le slot hoarding reste
fermé par construction (RDV) ; la pollution de table est fermée par
construction (identité).

**Raison** : un créneau ne doit pas être immobilisé par une identité qui
n'a pas encore prouvé qu'elle est récupérable. Élimine le slot hoarding à
la racine plutôt que de le contenir après coup — cohérent avec la
discipline "zéro dette technique" du projet.

## Séquencement

Le parcours **citoyen permanent existant reste inchangé** — cette
séquence ne s'applique qu'à un visiteur sans session valide.

1. **Sélection** — institution/service/créneau. Lecture seule
   (`generateSlotsInRange`), rien n'est réservé, rien n'est verrouillé.
   La disponibilité affichée peut évoluer d'ici l'étape 4.
2. **Identité** — au clic sur "confirmer", écran de vérification
   téléphone. **Révisé (retour CEO, point 3)** : aucune ligne
   `users`/`auth.users` n'est créée à ce stade — rien de durable tant que
   l'OTP n'a pas réussi. L'OTP réel (mêmes garanties que
   `lib/auth/otp.ts` : hash bcrypt, `crypto.randomInt`, TTL 5 min, usage
   unique) est émis contre un enregistrement de vérification **éphémère**,
   lié au seul numéro (proposition, table légère à spécifier —
   `phone`/`otp_hash`/`otp_expires_at`/`tentative_count`, généralise
   `otp.ts` plutôt que de le dupliquer, voir « Décisions encore ouvertes »).
   Le rate limit existant (`lib/security/authSecurity.ts`, scope
   `destination` = numéro ciblé) s'applique à l'identique, avec ou sans
   ligne `users`. Plus besoin de `CITOYEN_OTP_FALLBACK` (c'était la seule
   raison de créer la ligne tôt dans la version précédente de cet ADR) —
   et plus aucun risque de pollution de `users`/SMS pumping par création
   de sessions en masse jamais finalisées, puisque rien n'est créé avant
   succès.
3. **Vérification** — comparaison contre l'enregistrement éphémère.
   Échec → retour à l'étape 2 (incrémente `tentative_count`, même
   discipline qu'aujourd'hui). **Succès** — c'est seulement à cet instant
   que la ligne `users` + la coquille `auth.users` sont créées (mécanisme
   exact — natif `signInAnonymously()` vs coquille email synthétique —
   reste ouvert, voir « Décisions encore ouvertes », n'affecte pas ce
   séquencement), puis le pont magic-link mint une session réelle
   (`completerConnexionCitoyen`/`mintCitoyenSessionTokenHash`,
   `lib/auth/citoyenSession.ts`), redeemée côté client
   (`supabase.auth.verifyOtp()`) pour obtenir un `access_token` réel.
4. **Création** — `createRdv()` appelé avec cet `access_token`. Tous les
   contrôles serveur existants s'appliquent sans exception (section
   suivante). Le verrou de créneau n'intervient **qu'à cet instant**, pas
   avant.
5. **Confirmation** — code affiché, comme aujourd'hui.

**Cas d'échec à l'étape 4** (créneau pris pendant que l'invité tapait son
OTP) : comportement déjà existant de `reserver_creneau_rdv`
(`CRENEAU_COMPLET` → message humanisé, disponibilités rafraîchies). Aucun
changement requis ici, seulement confirmer qu'il s'applique identiquement
à l'invité — voir matrice de tests, item 4.

## Contrôles serveur

**Existants, à préserver tels quels — aucun n'est remplacé ou contourné
par l'étape OTP** : `chargerRestrictionActive` (no-show),
`chargerSuspensionInactiviteActive`, `chargerPauseEtablissementActive`
(Booking Governance), `validerCreneauServeur` (institution validée +
créneau réel), `reserver_creneau_rdv` (verrou atomique de capacité,
migration `20260915000001`), `users_phone_unique` (rejet `23505`, jamais
un `SELECT` préalable racy).
*(`getBookingAccess`/`lib/bookingAccess.ts` est hors périmètre — c'est un
contrôle côté **institution**, utilisé par `rdv/statut`/`qr/validate`,
jamais par la création côté citoyen.)*

**Nouveaux, à ajouter en E0.1+, aucun codé à ce jour** :
- Filtre identité dans `soumettreAvis()` (après l'appel à
  `chargerRdvEtVerifier()`, jamais dans la fonction elle-même — partagée
  avec `annulerRdv()`/`reporterRdv()` qui n'ont pas besoin de cette
  restriction).
- Filtre identité central dans `accorderPoints()` (`lib/rewardsEngine.ts`,
  même emplacement que le plafond anti-abus `max_par_periode` déjà
  centralisé là).
- **Correction requise par ce design A lui-même, clarifiée (retour CEO)** :
  un citoyen permanent **ne reçoit jamais un OTP supplémentaire à chaque
  réservation** — son téléphone a déjà été vérifié une fois, à
  l'inscription (`register`/`verify` actuels), et sa session suit le
  parcours inchangé (§ Séquencement). Le point est différent : une fois
  qu'un invité peut, lui aussi, vérifier son téléphone pour réserver,
  **l'ensemble des citoyens ayant déjà un RDV aura toujours un téléphone
  vérifié** — invité ou permanent, à un moment ou un autre. `phone_verifie_le`
  cesse donc d'être un critère utile pour distinguer les deux dans
  `soumettreAvis()`/`accorderPoints()`. Il faut un second flag, distinct
  de la vérification téléphonique, marquant un compte réellement complété
  (CGU acceptées, informations personnelles renseignées — l'équivalent de
  ce que `register/route.ts` fait déjà aujourd'hui pour tout permanent).

  **Spécification proposée** (à valider par Bryan avant le code, pas
  pendant) :
  - Colonne `users.compte_complete_le timestamptz`, cohérente avec la
    convention déjà en usage dans le schéma (`cgu_acceptee_le`,
    `disponibilites_modifie_le`).
  - Écrite exclusivement par du code `service_role` — jamais un champ
    accepté du client.
  - Posée à l'instant où `register/route.ts` (ou son équivalent futur)
    termine avec succès — c'est-à-dire **dès aujourd'hui, pour toute
    inscription**, puisque le parcours `register` actuel exige déjà CGU
    + informations personnelles complètes.
  - **Backfill, condition de déploiement avant d'activer les filtres** :
    aucun invité n'existe en production à ce jour (fonctionnalité non
    codée) — donc 100% des lignes `users` actuelles proviennent du
    `register` complet. Backfill trivial et sûr :
    `UPDATE users SET compte_complete_le = COALESCE(cgu_acceptee_le, created_at) WHERE compte_complete_le IS NULL;`
    exécuté **avant** la mise en service des filtres `soumettreAvis()`/
    `accorderPoints()` — jamais après, même piège que "CHECK avant
    backfill" déjà documenté dans `CLAUDE.md`. Sans cet ordre, tous les
    citoyens existants seraient traités comme "non complétés" le jour où
    les filtres entrent en vigueur et perdraient l'accès à
    avis/récompenses — voir test de non-régression dédié ci-dessous.

## Conversion invité → compte permanent

Absent de la version précédente de cet ADR — ajouté suite au retour CEO,
point 4. Le test 6 couvre déjà le sens "numéro déjà permanent, invité
rejeté" (`23505`). Le sens inverse manquait : un invité vérifié qui veut
ensuite devenir un compte permanent complet.

**Flux proposé** : la ligne `users` de l'invité existe déjà (créée à
l'étape 3 du séquencement, `phone` déjà rempli et vérifié) — la
conversion ne peut donc pas repasser par `register/route.ts` tel quel
(qui suppose la création d'une ligne neuve et rejette tout `phone` déjà
présent). Il faut un chemin dédié "compléter mon compte" : **UPDATE** de
la ligne existante (CGU + informations personnelles manquantes), jamais
un nouvel INSERT — pose `compte_complete_le`. Pas de fusion de deux
identités Supabase Auth différentes à gérer : la ligne `auth.users`
créée à l'étape 3 reste la même avant et après la conversion.

**Question produit non tranchée ici** : la conversion rend-elle
éligibles rétroactivement les RDV déjà pris en tant qu'invité (avis
possible sur un RDV passé, points crédités rétroactivement) ou
seulement les RDV futurs ? Je recommande "futurs seulement" (plus simple,
pas de recalcul rétroactif de `reward_events` déjà émis ou non) mais
c'est un arbitrage produit, pas une évidence technique.
- Policies RLS des tables classées "permanent requis"/"à trancher" par
  E0-A (`citoyen_demarches`, `citoyen_projets`, `citoyen_favoris`,
  `messages`, `citoyen_budgets`, `citoyen_objectifs_financiers`, etc.) —
  confirmé par `pg_policies` en live qu'aucune n'a de protection
  aujourd'hui au-delà de `auth.uid() = citoyen_id`. Défaut recommandé :
  **fail-closed** — invité exclu partout sauf `rdv`/`paid_bookings`,
  jusqu'à décision explicite contraire table par table.

## Matrice de tests — condition de sortie du lot

**Non négociable** : chaque ligne doit passer avant que E0.1 soit
considéré terminé. Pas une formalité de QA après développement — un
critère de sortie du lot, à vérifier avant merge.

| # | Test | Résultat attendu | Catégorie |
|---|------|-------------------|-----------|
| 1 | Citoyen permanent existant réserve (parcours actuel) | Comportement identique à aujourd'hui, ne passe jamais par l'étape OTP invité **et ne reçoit jamais un second OTP pour cette réservation** | Non-régression |
| 2 | Invité sélectionne un créneau puis abandonne avant l'OTP | Aucun RDV créé, **aucune ligne `users`/`auth.users` créée** (étape 2 révisée), aucun créneau verrouillé, rien à purger | Design A — comportement central |
| 3 | Invité complète l'OTP correctement | RDV créé, code de confirmation affiché, créneau verrouillé seulement à cet instant, ligne `users` créée seulement à cet instant | Fonctionnel |
| 4 | Deux invités visent le même créneau, l'un termine l'OTP avant l'autre | Le premier obtient le RDV (verrou atomique), le second reçoit `CRENEAU_COMPLET` + disponibilités rafraîchies | Concurrence |
| 5 | Rejeu du même code OTP après usage | Rejeté (`aucun_code`) | Sécurité — régression OTP |
| 6 | Vérification tentée sur un numéro déjà lié à un compte permanent | Rejeté par `23505`, aucune fusion automatique, message orientant vers la connexion normale | Sécurité |
| 7 | Appel direct de `createRdv()` sans `access_token` valide | Rejeté ("Session expirée, reconnectez-vous"), déjà le comportement actuel | Sécurité — non-régression |
| 8 | Invité vérifié mais `compte_complete_le` null appelle `soumettreAvis()`/`accorderPoints()` sur son propre RDV | Rejeté — le filtre se base sur `compte_complete_le`, jamais sur `phone_verifie_le` (devenu universel sous design A) | Sécurité |
| 9 | Citoyen permanent classique soumet un avis sur son propre RDV terminé | Accepté, comportement actuel préservé | Non-régression |
| 10 | Les 6 sites d'appel `accorderPoints()` testés individuellement avec un citoyen `compte_complete_le` null | Aucun point crédité, sur chacun des 5 `eventType` | Sécurité |
| 11 | Institution marque un RDV invité comme `absent`/`termine` | `accorderPoints()` ne crédite rien pour un citoyen `compte_complete_le` null | Sécurité |
| 12 | Accès direct (hors UI) à **chacune** des tables fail-closed (boucle sur la liste complète issue d'E0-A + `pg_policies` live — `citoyen_demarches`, `citoyen_projets`, `citoyen_favoris`, `messages`, `citoyen_budgets`, `citoyen_objectifs_financiers`, `avis`, etc.) avec une session invité `compte_complete_le` null | Rejeté sur **chaque** table de la liste une fois les policies RLS corrigées — un seul exemple ne suffit pas | Sécurité |
| 13 | **(Ajouté)** Backfill `compte_complete_le` rejoué sur l'état actuel de `users` avant activation des filtres | 100% des lignes existantes obtiennent `compte_complete_le` non-null — zéro citoyen permanent existant ne perd l'accès à avis/récompenses | Non-régression — backfill |
| 14 | **(Ajouté)** Rejeu du `tokenHash` magic-link (ou de l'`access_token` qui en résulte) après une première utilisation réussie | Rejeté — usage unique, même discipline que l'OTP lui-même | Sécurité |
| 15 | **(Ajouté)** Invité vérifié (`compte_complete_le` null) complète son compte via le flux de conversion avec le même `phone` | Accepté via **UPDATE** de la ligne existante, jamais un nouvel INSERT ; aucun rejet `23505` (le flux de conversion n'est pas `register/route.ts` tel quel) ; `compte_complete_le` posé | Sécurité — conversion |

## Décisions encore ouvertes (ne bloquent pas cet ADR, bloquent le code)

1. **Mécanisme exact de création de l'identité invité** — natif
   `signInAnonymously()` Supabase vs coquille email synthétique
   (`register/route.ts`-like), appliqué à l'étape 3 révisée (après succès
   OTP). **Recommandation** : la coquille. Avec elle, pas besoin d'activer
   les "anonymous sign-ins" Supabase — évite d'ouvrir un endpoint public
   natif de création de sessions, cohérent avec la décision du
   19/10/2026 de ne pas les activer. Aucun `is_anonymous` natif n'existe
   alors : c'est `compte_complete_le` qui porte toute la distinction.
   Avec le natif, `is_anonymous` est obtenu gratuitement mais un endpoint
   ouvert doit être activé, avec CAPTCHA et limites dédiées — le design A
   impose de toute façon un OTP avant tout RDV, donc l'avantage du natif
   est marginal ici. **Décision de Bryan requise avant le code**, pas
   pendant.
2. **Enregistrement de vérification éphémère** (étape 2 révisée) — table
   légère à spécifier précisément (nom, colonnes, TTL, purge — plus
   simple qu'une purge de `users` puisqu'aucune identité Supabase Auth
   n'y est attachée) avant le code. Généralise `lib/auth/otp.ts` plutôt
   que de le dupliquer — modalités exactes à trancher avec Bryan.
3. Flag `compte_complete_le` (voir Contrôles serveur) — spécification
   proposée ci-dessus, à valider explicitement par Bryan avant migration.
4. Les 5 décisions produit d'E0-A (messages invité, feedback/satisfaction
   invité, favoris invité, points Yelen invité, canal support invité) —
   défaut fail-closed proposé en attendant.
5. Activation des "anonymous sign-ins" côté dashboard Supabase — **non
   activée à ce jour**, et **probablement jamais nécessaire** si la
   coquille (point 1) est retenue.
6. **BLOQUANT pour E0.1, pas une simple ligne de liste** : provider SMS
   réel, coût par envoi, fiabilité Guinée. Le design A fait de l'OTP la
   **porte d'entrée unique** du parcours invité — sans un canal SMS
   fonctionnel, E0.1 bloquerait 100% des invités dès le premier pas.
   Business, hors code, mais conditionne le lancement, pas seulement la
   qualité.
7. Rotation/reset des mots de passe institution suite à l'exposition
   `mot_de_passe_hash` pré-01/09/2026 — indépendant de ce chantier,
   recommandé par précaution (coût d'un reset faible, coût d'une
   compromission non prouvable par les logs disponibles), non tranché.
8. Conversion invité → permanent : rétroactivité sur les RDV déjà pris en
   tant qu'invité (voir § Conversion) — recommandation "futurs seulement",
   à confirmer.
9. Besoin business démontré pour le Niveau 2+ (embed) — le Niveau 1
   (lien direct) ne requiert aucun des développements de cet ADR. Une
   institution a-t-elle réellement demandé l'embed ?

## Conséquences

Un visiteur externe ne peut jamais verrouiller un créneau réel sans
preuve de téléphone valide, **et** ne peut jamais polluer `users` ou
déclencher des envois SMS en masse sans finaliser l'OTP (révision du
19/10/2026) — les deux risques relevés par le CEO sont fermés par
construction. Coût : une étape de friction avant confirmation, assumée
comme compromis volontaire. Le design ne règle pas à lui seul les 5
décisions produit d'E0-A, le choix d'architecture d'identité invité, ni
le flux de conversion — ce sont des chantiers distincts, dont la liste
ci-dessus est la seule autorité à jour.

**Hors périmètre de cet ADR, non traité ici** (niveau "équipe
d'ingénierie sérieuse" visé mais pas encore atteint, retour CEO) :
feature flag et plan de rollback pour E0.1, découpage en PR isolées
(migration / serveur / UI, chacune derrière le flag), observabilité
(invités créés, OTP envoyés/vérifiés/abandonnés), et un threat model
d'une page (SMS pumping, énumération de numéros via le message "numéro
déjà lié à un compte" qui révèle l'existence d'un compte). Ces points
relèvent de la mise en œuvre d'E0.1, pas du séquencement — à traiter au
moment de planifier le lot technique, pas avant.

**Toujours rien codé, migré ni installé.**
