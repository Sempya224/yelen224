# Yelen — Booking Governance (vision CEO, Lots 1-3 implémentés — chantier clos)

Capture de la vision produit donnée par Bryan le 30/09/2026 ("Decision
CEO"), + gap-analysis technique contre l'existant vérifié en code le même
jour. Lire ce doc en entier avant la moindre ligne de code.

⚠️ **Mise à jour 19/10/2026** : le Lot 1 (pause volontaire établissement,
§3/§11.3-a) a en réalité été codé et câblé intégralement entre la
rédaction de ce document et cette mise à jour, sans que ce doc soit tenu
à jour au fil de l'eau — voir §12 pour l'état vérifié. Les sections
ci-dessous décrivant encore "aucun code écrit" pour le Lot 1 sont donc
périmées ; seuls les Lots 2 et 3 (§11.3-b/c) restent non commencés.

## 1. Principe directeur

> L'établissement contrôle volontairement sa disponibilité. Yelen
> contrôle l'accès au système de réservation lorsqu'une mesure de
> conformité l'exige. Une pause bloque les nouvelles réservations, mais
> ne détruit jamais par défaut les engagements déjà confirmés.

Deux mécanismes à bien garder séparés :
1. **Pause volontaire** — déclenchée par l'établissement lui-même,
   réversible par lui à tout moment.
2. **Suspension imposée** — déclenchée par Yelen (conformité/comportement),
   l'établissement ne peut jamais la lever lui-même.

Référence produit citée par Bryan : OpenTable permet de bloquer les
nouvelles réservations sur une période donnée sans toucher aux
réservations déjà confirmées — c'est le comportement de référence pour
les deux mécanismes ci-dessus.

## 2. Modèle d'états proposé

| État | Nouvelles réservations |
|---|---|
| Active | Autorisées |
| Pause établissement | Bloquées (volontaire, réversible par l'établissement) |
| Pause temporaire Yelen | Bloquées (imposée) |
| Restriction | Limitées selon conditions |
| Suspendue | Bloquées (imposée, la plus sévère) |
| Rétablie | Réactivées |

Point non tranché : comment cette table s'articule avec l'enum existant
`institutions.statut` (`en_attente`/`validee`/`suspendue`/`refusee`) —
state machine étendue sur la même colonne, ou nouvelle colonne/table
parallèle dédiée à la disponibilité de réservation (avec le risque de 2
sources de vérité mal synchronisées si c'est fait sans y réfléchir
explicitement). **Décision à prendre avant tout code.**

## 3. Pause volontaire établissement

Emplacement proposé : `Réservations → Disponibilité → Pause des
réservations`.

Options proposées :
- Pause immédiate
- Pause jusqu'à une date
- Pause sur une période précise
- Éventuellement : pause limitée à certains services/motifs/créneaux

Règle non négociable : une pause ne doit **jamais** annuler
automatiquement les RDV déjà confirmés. Ils continuent normalement, sauf
si une autre règle Yelen s'applique par ailleurs.

## 4. Suspension imposée par Yelen — escalade automatisée

Bryan rejette explicitement le modèle "sanction → fermeture immédiate
opaque". Modèle proposé :

```
Comportement constaté → avertissement → obligation d'action (délai affiché)
  → si aucune action à l'échéance → suspension automatique des nouvelles réservations
```

L'établissement voit dans son dashboard une échéance explicite ("Action
requise avant le [date/heure]"), pas une sanction qui tombe sans préavis.
Message affiché après bascule automatique :

> Les nouvelles réservations sont temporairement suspendues. Une action
> requise concernant votre établissement n'a pas été effectuée dans le
> délai prévu. Vos réservations déjà confirmées restent accessibles.

## 5. Séparation stricte nouvelles réservations / réservations existantes

| Élément | Effet d'une suspension |
|---|---|
| Nouvelles réservations | Bloquées |
| RDV déjà confirmés | Conservés |
| RDV du jour | Accessibles |
| Historique | Conservé |
| Communication avec les clients concernés | Maintenue |
| Annulation automatique des RDV existants | Non, sauf règle spécifique et explicitement prévue |

## 6. Protection du citoyen

Un citoyen ouvrant la fiche d'un établissement en pause/suspendu ne doit
jamais voir de simples créneaux vides sans explication. État explicite
requis :

> Réservations temporairement indisponibles — Cet établissement
> n'accepte actuellement pas de nouvelles réservations sur Yelen.

La raison interne de la mesure ne doit **jamais** être exposée
publiquement — reste uniquement visible côté établissement/Yelen.

## 7. Centre de contrôle dashboard établissement

Bloc "État Yelen" proposé, deux lignes : "Réservations" (Actives/en
pause/suspendues) et "Conformité" (Aucun élément en attente / Action
requise avec échéance). Objectif explicite : donner à l'établissement une
vraie chance d'agir avant l'application automatique de la mesure.

## 8. Moteur central — ne pas dupliquer la logique par écran

Recommandation forte de Bryan : un service central unique, type
`ReservationEligibility`/`BookingAccess`, qui renvoie un état parmi
`CAN_BOOK` / `PAUSED_BY_ESTABLISHMENT` / `PAUSED_BY_YELEN` / `RESTRICTED`
/ `SUSPENDED`. **Tous** les points d'entrée doivent consommer la même
décision : page établissement, recherche, fiche service, création RDV,
API réservation, mobile, web, et tout futur partenaire/API externe — pour
qu'un établissement sanctionné ne puisse jamais contourner la mesure via
une interface non couverte.

## 9. Journal d'audit

Chaque changement d'état tracé, y compris la réactivation. Format
illustratif donné par Bryan :

```
30/09/2026 — 16:35
Yelen a suspendu les nouvelles réservations
Motif : action requise non effectuée
Mesure : suspension temporaire
Déclencheur : expiration du délai
ID de la mesure : YC-XXXX
Prochaine étape : action de l'établissement requise
```

## 10. Gap-analysis — ce qui existe déjà vs ce qui manque (vérifié en code le 30/09/2026)

**Déjà construit et vérifié en production**, à réutiliser plutôt que
reconstruire — voir `docs/product/YELEN_RDV_NOSHOW_RESTRICTIONS.md` §7
("Suspension automatique institution — RDV non traités", 15/09/2026) :
- Suspension automatique sur seuils (3/5/10 RDV non traités / fenêtre
  glissante de 30 jours), portée par `institutions.statut = 'suspendue'`
  + `institution_suspensions`/`institution_suspension_revisions`
  ("Espace suspendu v2").
- RDV déjà confirmés **jamais** annulés automatiquement, à une exception
  près et déjà cadrée : un RDV **imminent** (fenêtre 48h) d'une
  institution encore suspendue est annulé proactivement avec un message
  citoyen neutre — **le mot "suspension" n'apparaît jamais** côté
  citoyen (principe identique au §6 ci-dessus, déjà en place).
- Réactivation automatique par cron (`pg_cron`, même mécanisme que le
  reste du produit).
- Système de révision/appel déjà construit côté institution
  (`app/api/institution/suspension/revision`,
  `app/admin/revisions/page.tsx`).
- Traçabilité via `rdv_events` (`auteur_type='system'`) et `admin_logs`.

**Anti-pattern déjà identifié en production, non résolu** — exactement
le risque que Bryan pointe au §8 ci-dessus : la vérification
`institutions.statut` a été ajoutée **route par route** le 15/09/2026,
après un bug réel constaté par Bryan (une institution suspendue pouvait
quand même faire accepter un RDV existant via un raccourci — widget
calendrier — non couvert par le tab-gating principal). Corrigé au coup
par coup dans 3 routes (`rdv/statut`, `paid-bookings/valider`,
`qr/validate`), **jamais centralisé dans un service unique**. Un futur
point d'entrée (API réservation externe, partenaire) reproduirait le même
trou s'il n'est pas explicitement audité.

**N'existe pas du tout** (vérifié par recherche dans
`supabase/migrations/` et le code applicatif, aucun faux négatif
connu) :
- Pause volontaire établissement — aucune colonne, aucune table, aucun
  écran. Zéro dépendance sur l'existant : candidat naturel pour démarrer
  en premier si ce chantier est repris, sans toucher au code de
  suspension déjà en prod.
- Service central `ReservationEligibility`/`BookingAccess` — la
  vérification actuelle reste dispersée (§ ci-dessus).
- Escalade à délai affiché ("Action requise avant le [date/heure]") — le
  modèle actuel est un comptage de seuils sur fenêtre glissante, pas une
  échéance communiquée à l'avance à l'établissement.
- Bloc "État Yelen" / "Conformité" dans le dashboard établissement.

## 11. Reste à faire avant tout code — RÉSOLU (18/10/2026)

Décisions actées par Bryan, après passage en revue des solutions
américaines de référence (Stripe Connect capabilities/requirements,
Uber Eats pause marchand vs désactivation Trust & Safety, GitHub
`archived` vs `disabled`, policy decision point façon AWS IAM) :

1. **§2 — tranché : nouveau modèle calculé, pas d'extension de l'enum.**
   `institutions.statut` reste inchangé (zéro migration, zéro risque sur
   le code déjà en prod). Un nouveau service central
   `BookingAccess`/`ReservationEligibility` dérive l'état final
   (`CAN_BOOK`/`PAUSED_BY_ESTABLISHMENT`/`PAUSED_BY_YELEN`/`RESTRICTED`/
   `SUSPENDED`) en lisant plusieurs sources indépendantes — jamais une
   colonne unique que plusieurs sous-systèmes se disputent en écriture.
2. **§10 — tranché : absorbé comme input séparé, jamais fusionné.**
   Le mécanisme "RDV non traités" déjà en prod
   (`institution_suspensions`/`institution_suspension_revisions`) devient
   un input parmi d'autres consommé par `BookingAccess` — pas remplacé,
   pas dupliqué. Précision de Bryan (18/10/2026) sur la nature de la
   pause volontaire, qui motive cette séparation : une pause établissement
   **ne dit rien sur la santé/l'activité générale** de l'établissement —
   c'est un signal opérationnel ponctuel et réversible (pause déjeuner,
   personnel sous-effectif temporaire, etc.), qui bloque uniquement
   l'admission de nouvelles entrées pendant une fenêtre. Sémantiquement
   distinct de la suspension imposée (conformité/comportement, Yelen
   seul peut lever). Les deux restent deux sources de vérité séparées,
   réconciliées uniquement au niveau du service central — jamais
   fusionnées en un seul sens.
3. **§11.3 — tranché : séquencement confirmé.**
   Ordre de lots validé : (a) pause volontaire établissement seule
   d'abord — zéro dépendance sur l'existant, candidat le plus isolé ;
   (b) service central `BookingAccess` construit avec ce seul input,
   vérifié en prod ; (c) migration progressive, une par une, des 3
   points de vérification dispersés déjà identifiés comme anti-pattern
   au §10 (`rdv/statut`, `paid-bookings/valider`, `qr/validate`) pour
   qu'ils consomment le service central au lieu de vérifier
   `institutions.statut` chacun de son côté — chaque migration
   indépendamment vérifiable et réversible.

**Aucune action de code prise au moment de cette décision (18/10/2026).**
Ces décisions clôturent la phase de cadrage — le premier lot (pause
volontaire, §3) a depuis été codé, voir §12. Le prochain feu vert de
Bryan portera sur le Lot 2 (service central `BookingAccess`), toujours un
lot à la fois.

## 12. État vérifié — Lot 1 (pause volontaire établissement), 19/10/2026

Vérification en lecture seule du code réel (pas une relecture du plan) :
Lot 1 est **complet et câblé de bout en bout**, pas seulement amorcé.

- **Migration** `supabase/migrations/20261018000006_institution_reservation_pause.sql`
  — table `institution_reservation_pauses`, fonction SECURITY DEFINER
  `institution_a_pause_active()`, et les policies RLS INSERT de `rdv`
  **et** `paid_bookings` réécrites pour bloquer au niveau base (pas
  seulement une vérification JS contournable). **Confirmée exécutée en
  base le 19/10/2026** (table + fonction + les deux policies `WITH CHECK`
  vérifiées par SQL direct) — Lot 1 clos en production.
- **API** `app/api/institution/reservations/pause/route.ts` — GET/POST/DELETE,
  gating par rôle (`disponibilites.write`), invariant "une seule pause
  ouverte à la fois" porté par l'application, journalisé via
  `enregistrerAction` (actions `pause_reservations_activee`/`_levee`).
- **UI** `app/[slug]/[id]/components/PauseReservationsCard.tsx`, montée en
  tête de `DisponibilitesTab.tsx:513`, `access` ("full"/"read") propagé
  depuis `layout.tsx:5592` via `tabReadOnly()`.
- **Côté citoyen** — `lib/institutionReservationPause.ts::chargerPauseEtablissementActive()`
  consommé dans `app/rdv/[id]/actions.ts` pour les 3 chemins de création
  couverts par la policy RLS (RDV gratuit/payant via
  `validerCreneauServeur`, et réservation chambre hôtel séparément) —
  message humanisé §6 relayé jusqu'au wizard (`app/rdv/[id]/page.tsx:857`),
  motif interne jamais exposé.

**1 écart réel trouvé et corrigé le 19/10/2026** : `pause_reservations_activee`/
`pause_reservations_levee` étaient absents de
`lib/journalTaxonomie.ts::ACTION_CATEGORIE` — la journalisation
fonctionnait, mais ces entrées tombaient dans la catégorie fallback
`"autre"` au lieu de `"disponibilites"`, invisibles au filtre par
catégorie du Journal d'activité. Corrigé (catégorie `disponibilites`,
niveau `attention` pour l'activation).

**Hors scope du Lot 1, confirmé non fait** : bannière sur la fiche
publique institution (le message §6 n'apparaît qu'au moment où le
citoyen déclenche une réservation, jamais en bandeau permanent — décision
déjà actée au moment de l'écriture du code, pas un oubli).

**Reste à faire** : Lots 2 (service central `BookingAccess`/
`ReservationEligibility`) et 3 (migration des 3 points de vérification
dispersés `rdv/statut`/`paid-bookings/valider`/`qr/validate`) — aucun des
deux n'a de code écrit, cohérent avec le séquencement §11.3.

## 13. État — Lot 2 (service central `BookingAccess`), 19/10/2026

Codé, `tsc --noEmit` propre, **volontairement non branché nulle part**
(scope du Lot 2 arrêté avec Bryan à la seule création du service).

- `lib/bookingAccess.ts` — `getBookingAccess(sb, institutionId)` lit les
  deux sources séparées (pause volontaire via
  `chargerPauseEtablissementActive`, et `institutions.statut`) sans les
  fusionner en amont (§11.3-2), et renvoie un état unique parmi les 5 du
  §2. Seuls `CAN_BOOK`/`PAUSED_BY_ESTABLISHMENT`/`SUSPENDED` ont une
  source réelle aujourd'hui — `PAUSED_BY_YELEN`/`RESTRICTED` restent dans
  le type sans jamais être produits (cohérent avec §10 "n'existe pas du
  tout").
- `bloqueTraitementExistant(etat)` — dérivée explicite pour le Lot 3 :
  seule `SUSPENDED` bloque le traitement d'un RDV déjà existant, jamais
  `PAUSED_BY_ESTABLISHMENT` (la pause ne bloque que l'admission de
  nouvelles réservations, déjà appliqué au niveau RLS par le Lot 1 —
  confusion à éviter puisque les 2 mécanismes partagent la même racine
  "bloquer des réservations" mais pas le même périmètre d'effet, §5).
- Suspension imposée priorisée sur la pause volontaire si les deux sont
  vraies en même temps (mesure la plus sévère, §4).

## 14. État — Lot 3 (migration des 3 points dispersés), 19/10/2026

Codé, `tsc --noEmit` propre. Les 3 routes identifiées au §10 comme
anti-pattern (vérification `institutions.statut` dupliquée route par
route) consomment maintenant `getBookingAccess` + `bloqueTraitementExistant` :

- `app/api/institution/rdv/statut/route.ts`
- `app/api/institution/paid-bookings/valider/route.ts`
- `app/api/qr/validate/route.ts` (POST + PUT)

Chaque route garde son propre texte de message citoyen/institution
existant (`BOOKING_ACCESS_SUSPENDU_MESSAGE` réutilisé seulement sur
`rdv/statut`, qui en était la source d'origine ; les 2 autres gardent
leur formulation locale inchangée) — ce lot migre uniquement le
mécanisme de détection, jamais l'UX, pour rester dans le scope convenu.

**1 gap réel trouvé et corrigé le 19/10/2026 (revue critique post-Lot 3)** :
`getBookingAccess` ne destructurait pas `error` sur le `SELECT
institutions.statut` — sur une vraie erreur DB (pas juste "institution
introuvable"), la fonction renvoyait silencieusement `CAN_BOOK`
(fail-open). Contrairement à la pause (Lot 1, verrou RLS réel en base),
`bloqueTraitementExistant` n'a aucun filet de sécurité au niveau base :
c'était le seul rempart. Corrigé en fail-closed (`throw` propagé, aucune
des 3 routes appelantes n'ayant de try/catch autour → 500 générique Next,
sans fuite de message).

**Chantier Booking Governance clos** (Lots 1-3). Un futur point d'entrée
réservation (API externe, partenaire — voir
`docs/product/YELEN_BOOKING_EXTERNAL_INTEGRATION_PHASE0.md`) devra
consommer `lib/bookingAccess.ts` dès sa conception, pour ne pas
reproduire le trou identifié au §10.
