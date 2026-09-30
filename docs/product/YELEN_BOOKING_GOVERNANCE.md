# Yelen — Booking Governance (vision CEO, chantier PAS DÉMARRÉ)

Capture de la vision produit donnée par Bryan le 30/09/2026 ("Decision
CEO"), + gap-analysis technique contre l'existant vérifié en code le même
jour. **Aucun code, aucune migration, aucune maquette écrits pour ce
chantier** — ce document sert uniquement à ne pas repartir "à l'aveugle"
à la reprise. Lire ce doc en entier avant la moindre ligne de code.

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

## 11. Reste à faire avant tout code

1. Trancher explicitement le point ouvert du §2 (state machine étendue
   vs nouveau modèle parallèle).
2. Décider si ce chantier remplace/absorbe le mécanisme "RDV non
   traités" existant (§10) ou le traite comme un cas particulier du
   nouveau modèle — ne jamais faire cohabiter 2 logiques de suspension
   indépendantes sur la même colonne `institutions.statut`.
3. Si repris, probablement commencer par la pièce la plus isolée (pause
   volontaire, §3) avant de toucher au moteur central partagé (§8), qui
   touche du code déjà en production et présente un risque de régression
   plus élevé.

**Aucune action de code à prendre sur ce chantier sans feu vert explicite
de Bryan pour ce lot précis.**
