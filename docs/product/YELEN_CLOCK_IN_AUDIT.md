# Yelen Clock In — Audit de l'existant

Document de référence, écrit le 21/09/2026. Photographie factuelle de ce qui
existe **réellement** dans le code aujourd'hui pour le module Clock In
Shift (présences, employés, départements, horaires, portail de pointage).

**Ce document n'est pas une roadmap.** Aucune proposition, aucun redesign,
aucune priorisation. Objectif unique : savoir ce que Yelen possède déjà,
avec quel niveau de fiabilité, avant toute décision produit. L'étape
suivante (analyse critique → benchmark → architecture cible → V1
production-grade → roadmap) sera un document séparé.

**Méthode** : lecture directe du code (migrations SQL, routes API,
composants, Edge Function), pas de supposition. Aucun outil navigateur ni
téléphone disponible dans cet environnement — tout ce qui nécessite une
vérification visuelle ou un test réel sur device est marqué explicitement
comme non vérifié, jamais présenté comme fonctionnel par défaut.

## Légende des statuts

| Symbole | Signification |
|---|---|
| 🟢 | Fonctionnel et vérifié (code lu + logique cohérente de bout en bout, ou déjà confirmé par Bryan dans CLAUDE.md) |
| 🟡 | Présent mais partiel — fonctionne pour un sous-ensemble de cas, ou dépend d'une action manuelle non confirmée |
| 🟠 | Code présent, cohérent à la lecture, mais comportement réel jamais observé (pas d'outil navigateur/téléphone dans cette session) |
| 🔴 | Non implémenté — recherché explicitement, absent |
| ⚪ | Non déterminé — nécessite une vérification en base ou par Bryan que cette session ne permet pas |

---

## 1. Vue d'ensemble — ce qui existe physiquement

**33 fichiers** touchent Clock In Shift :

- **14 migrations SQL** (`20260805000001` à `000014`) — schéma complet, aucune n'a été retouchée depuis leur création (05/08/2026)
- **1 Edge Function** Deno (`clock-in-daily-attendance`) — job de calcul planifié
- **11 routes API** — 6 côté employé (`/api/clock/*`), 7 côté institution (`/api/institution/clock-in/*`)
- **1 lib d'authentification dédiée** (`lib/employeeAuth.ts`)
- **2 écrans front** — portail employé (`app/clock/[slug]/`, 1384 lignes) et dashboard institution (`ClockInShiftTab.tsx`, 2698 lignes)

Aucune ligne de ce périmètre n'a été modifiée depuis la refonte visuelle
"Enterprise" du 05/08/2026 et le lot "Profil employé" du 10/09/2026 — le
module est stable, pas en cours de développement actif au moment de cet
audit.

---

## 2. Inventaire technique — base de données

### 2.1 Tables (9 tables dédiées + 2 colonnes ajoutées sur des tables existantes)

| Table | Rôle | RLS | Immuabilité |
|---|---|---|---|
| `departments` | Regroupement d'employés | Activé, **zéro policy** | Non |
| `employees` | Profil RH (distinct de `institution_membres`) | Activé, **zéro policy** | Non — soft delete uniquement (`statut='archive'`) |
| `employee_credentials` | Identifiant + PIN hashé, verrouillage | Activé, **zéro policy** | Non |
| `work_schedules` | Horaires (fixe/fractionné/nuit/variable) | Activé, **zéro policy** | Non |
| `employee_schedule_assignments` | Affectation employé ↔ horaire, avec historique | Activé, **zéro policy** | Non |
| `attendance_logs` | Événements bruts de pointage (entrée/sortie) | Activé, **zéro policy** | **Oui — trigger, bloque même service_role** |
| `daily_attendance` | Résumé quotidien précalculé | Activé, **zéro policy** | Non (résumé recalculable, override possible) |
| `attendance_audit_logs` | Audit des corrections manuelles | Activé, **zéro policy** | **Oui — trigger, bloque même service_role/superuser SQL Editor** |
| `employee_documents` | Documents employé (contrat, pièce d'identité) | Activé, **zéro policy** | Non |

Vérifié par grep exhaustif sur les 14 migrations (`CREATE POLICY`) : **aucune
occurrence**. Confirme le pattern documenté dans CLAUDE.md — accès
exclusivement `service_role`, jamais de session Supabase Auth côté
institution/employé, donc aucune policy RLS pour un rôle authentifié n'a
de sens ici. C'est cohérent, pas un oubli.

**Colonnes ajoutées hors du lot initial** :
- `institutions.slug` (migration 000010) — URL-friendly, requis pour `/clock/{slug}`
- `employees.statut` élargi de 5 à 7 valeurs (`teletravail`, `mission` ajoutés en 000012) — **purement informatif**, voir §6
- `departments.responsable_id` (migration 000014)
- `institution_membres.employee_id` (migration 000003) — lien optionnel, index unique partiel (1 compte dashboard max par employé, plusieurs employés peuvent n'avoir aucun compte)

### 2.2 Relations clés

- `employees.department_id` → `departments`, `ON DELETE SET NULL`
- `employees.manager_id` → `employees` (auto-référence, hiérarchie), `ON DELETE SET NULL`
- `employee_credentials.employee_id` → `employees`, `ON DELETE CASCADE`, **unique** (1:1 strict)
- `employee_schedule_assignments.work_schedule_id` → `work_schedules`, `ON DELETE RESTRICT` (oblige à réaffecter avant suppression)
- `attendance_logs.employee_id` → `employees`, `ON DELETE RESTRICT` (un employé ne peut jamais être supprimé physiquement une fois qu'il a pointé)
- `daily_attendance.employee_id` → `employees`, `ON DELETE RESTRICT`
- Index unique partiel sur `employee_schedule_assignments (employee_id) WHERE date_fin IS NULL` — garantit au plus une affectation "ouverte" à la fois

### 2.3 Colonnes présentes mais jamais utilisées

- `attendance_logs.latitude/longitude/device_id` — nullables, aucune route ne les valide ni ne les exploite. Pointage V1 explicitement "libre" (décision CEO documentée dans la migration).
- `attendance_logs.methode` accepte `'biometrique'` dans son `CHECK`, mais **aucun code path** ne produit cette valeur — seuls `pin`, `qr` et `manuel` sont réellement atteignables.
- `daily_attendance.statut` accepte `'Congé'`, mais le job de calcul (`clock-in-daily-attendance`) ne l'assigne **jamais** — seul `override_statut_jour` (voir §2.5) peut y mener, et aucune UI ne déclenche cette route (voir §5).

### 2.4 Edge Function — job de calcul

`supabase/functions/clock-in-daily-attendance/index.ts`, planifiée par
`pg_cron` toutes les 15 minutes (migration `20260805000011`).

- Traite systématiquement **aujourd'hui et hier** à chaque exécution (upsert `employee_id + date_jour`)
- Lit `employee_schedule_assignments` + `work_schedules.pattern` + `attendance_logs`, écrit `daily_attendance`
- Respecte `override_manuel = true` (ne réécrase jamais une correction humaine)
- Hypothèse structurante : **Guinée = UTC+0 toute l'année**, timestamps traités comme heure locale sans conversion
- Fenêtre de recherche des pointages élargie à 36h pour un horaire de nuit (heuristique documentée, pas une garantie absolue en cas de rotations de nuit très rapprochées)
- Calcule retard/départ anticipé/heures sup selon les tolérances définies par horaire

**Statut** : 🟠 Code cohérent et bien commenté, logique de calcul lisible de
bout en bout. Le déploiement effectif de la fonction (`supabase functions
deploy`) et l'activation réelle du job `pg_cron` ne sont **pas confirmés
dans cette session** — CLAUDE.md liste `20260805000011` parmi les actions
"non confirmées exécutées". ⚪ à vérifier par Bryan : `SELECT * FROM
cron.job WHERE jobname = 'yelen-clock-in-daily-attendance'` et `SELECT *
FROM cron.job_run_details ... ORDER BY start_time DESC LIMIT 20`.

### 2.5 Mécanisme de correction / audit trail

`app/api/institution/clock-in/corrections/route.ts` — 3 actions,
100% insert-only (jamais d'`UPDATE` sur une ligne `attendance_logs`
existante) :

1. `ajout_pointage` — insère un pointage manquant + une ligne `attendance_audit_logs`
2. `correction_pointage` — insère un pointage compensatoire (l'original reste intact) + audit, bloque une double-correction du même pointage (`409 ALREADY_CORRECTED`)
3. `override_statut_jour` — seul cas où un `UPDATE` direct a lieu (sur `daily_attendance`, pas immuable) + audit

Permission `clock_in.write` (admin institution uniquement). Chaque action
journalise IP, raison obligatoire, identité du membre.

**Statut** : 🟢 code backend complet et cohérent avec le pattern
d'immuabilité du reste du projet (`journal_activite`). **Mais** — voir
§5 — **aucun bouton, aucun écran du dashboard n'appelle cette route
aujourd'hui**. C'est un backend fonctionnel sans point d'entrée UI.

---

## 3. Inventaire technique — API

### 3.1 Côté employé (`/api/clock/*`) — authentification JWT cookie `yelen224_employee_session`

| Route | Rôle | Détail |
|---|---|---|
| `POST /api/clock/auth/login` | Connexion Identifiant+PIN | bcrypt, verrouillage compte (5 tentatives/15min, persisté en base) **+** throttle device/IP partagé (`lib/security/authSecurity.ts`, catégorie `employee_login`, ajouté 30/08/2026) |
| `POST /api/clock/auth/logout` | Déconnexion | Supprime le cookie |
| `GET /api/clock/auth/me` | Statut de session + données du jour | Renvoie statut courant, "Ma journée", "Cette semaine", "Planning" (13 jours) — **construit le 10/09/2026, non documenté dans CLAUDE.md avant cet audit** |
| `GET /api/clock/institution?slug=` | Identité entreprise pré-connexion | Public, aucune donnée sensible (name/logo/ville déjà publics ailleurs) |
| `POST /api/clock/pointage` | Pointer (entrée/sortie) | Direction déduite serveur (jamais envoyée par le client), anti-double-tap 5s, QR optionnel |
| `GET/POST /api/clock/profil` | Profil + changement de PIN self-service | **Le changement de PIN est câblé et consommé côté portail** (voir §7 — corrige une note obsolète de CLAUDE.md) |

### 3.2 Côté institution (`/api/institution/clock-in/*`) — JWT institution, permission `clock_in.write`/`clock_in.read_full`

| Route | Méthodes | Détail |
|---|---|---|
| `.../attendance` | GET | 3 modes : flux live (`feed`), historique 60 jours par employé, vue journée avec KPI + taux de conformité |
| `.../corrections` | POST | Voir §2.5 — sans UI |
| `.../employees` | GET/POST/PATCH/DELETE | DELETE = soft (statut `archive`), jamais de suppression physique |
| `.../employees/documents` | GET/POST/DELETE | Upload validé (`validateUpload`, même garde-fou que documents citoyens), URLs signées 60s |
| `.../departments` | GET/POST/PATCH/DELETE | DELETE réel possible (employés détachés, pas bloqués) |
| `.../schedule-assignments` | GET/POST/PATCH/DELETE | Création ferme automatiquement l'affectation ouverte précédente |
| `.../work-schedules` | GET/POST/PATCH/DELETE | Validation manuelle de la structure `pattern` (pas de zod dans le projet), suppression bloquée si horaire encore affecté (erreur 23503 interceptée, message clair) |

Toutes les routes institution vérifient explicitement que la ressource
ciblée appartient à `membre.institutionId` avant toute lecture/écriture
(pas de BOLA identifié sur ce module précis).

---

## 4. Inventaire fonctionnel — par domaine demandé

### Présences
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Présent / Retard / Absent / Incomplet | 🟢 | Logique de calcul lue de bout en bout dans l'Edge Function | `supabase/functions/clock-in-daily-attendance` |
| Congé | 🟡 | Existe dans le schéma/UI mais **jamais assigné automatiquement** — atteignable uniquement via `override_statut_jour`, route sans UI | `daily_attendance.statut`, `corrections/route.ts` |
| Clock In / Clock Out | 🟢 | Direction déduite serveur, anti-double-tap, code cohérent | `app/api/clock/pointage/route.ts` |
| Temps travaillé | 🟢 | Calculé côté job (paires entrée/sortie) ET côté portail (temps réel avec segment en cours) | Edge Function + `app/clock/[slug]/page.tsx` |
| Historique (dashboard) | 🟢 | 60 derniers jours par employé, endpoint dédié | `.../attendance?employeeId=` |
| Historique (portail employé) | 🔴 | Menu "Mon historique" visible mais `onClick: null` — stub non câblé | `app/clock/[slug]/page.tsx` ligne 823 |
| Statut temps réel (dashboard) | 🟢 | Polling 30s (Présences) / 60s (autres onglets), pattern `avecSpinner`/`silencieux` correct | `ClockInShiftTab.tsx` |

### Employés
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Création | 🟢 | Matricule + identifiant + PIN 4 chiffres, rollback manuel si l'insert des credentials échoue | `.../employees POST` |
| Modification | 🟢 | Champs partiels, changement de PIN possible depuis le dashboard | `.../employees PATCH` |
| Activation/désactivation | 🟡 | 7 statuts possibles (`actif/suspendu/en_conge/archive/desactive/teletravail/mission`) mais **teletravail/mission n'affectent pas le calcul de présence** — badge cosmétique uniquement, documenté comme limitation connue dans la migration | `employees.statut` |
| Affectation (département, manager, horaire) | 🟢 | Départements/managers en PATCH direct, horaires via `schedule-assignments` | `.../employees`, `.../schedule-assignments` |
| Suppression | 🔴 (par design) | Jamais de DELETE physique — `attendance_logs`/`daily_attendance` référencent l'employé en `ON DELETE RESTRICT` | `.../employees DELETE` (= archive) |
| Identification (portail) | 🟢 | Identifiant + PIN, unique par institution (pas globalement) | `.../auth/login` |
| Documents employé | 🟢 | Upload/liste/suppression, bucket privé, URLs signées | `.../employees/documents`, `EmployeDetailModal` |

### Départements
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Création / modification | 🟢 | Nom unique par institution, doublon rejeté (409) | `.../departments` |
| Affectation employés | 🟢 | Via `employees.department_id` | — |
| Responsable | 🟢 | `responsable_id` (ajouté 05/08/2026), anticipé dès le schéma d'origine | `.../departments` |
| Suppression | 🟢 | Réelle, employés détachés (pas bloqués) | `.../departments DELETE` |

### Horaires / Shifts
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| 4 régimes (fixe/fractionné/nuit/variable) | 🟢 | Même forme JSON `pattern` pour les 4, validée manuellement côté API | `.../work-schedules` |
| Horaires récurrents | 🟢 | `pattern.jours` — un jour de la semaine = config fixe répétée | Schéma `work_schedules` |
| Horaires individuels | 🟡 | Pas de concept "horaire par employé unique" — un `work_schedule` est réutilisable, l'individualisation se fait via l'affectation (`employee_schedule_assignments`) | — |
| Gestion des retards | 🟢 | Tolérance configurable par horaire (`tolerance_retard_minutes`), calculée par le job | Edge Function |
| Comparaison prévu/réel | 🟢 | `heures_prevues_minutes` vs `heures_travaillees_minutes`, affiché dashboard ET portail | `daily_attendance`, `/api/clock/auth/me` |
| Rotation multi-semaines | 🔴 | Recherché explicitement, absent — confirmé cohérent avec CLAUDE.md ("reporté") | — |
| Min/max heures, fenêtre Clock In/Out autorisée | 🔴 | Recherché explicitement, absent | — |

### Pointage
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Portail employé (URL `/clock/{slug}`) | 🟢 | Résolution slug → institution, backfill déterministe fait | `app/clock/[slug]/page.tsx` |
| Connexion Identifiant+PIN | 🟢 | Code cohérent, verrouillage + throttle | `.../auth/login` |
| QR | 🟠 | Requis pour arrivée et pour la fin de shift (pas pour partir en pause) — scan caméra via `html5-qrcode`, vérifie que le QR scanné correspond bien au slug de l'institution du compte connecté. **Jamais testé sur un vrai téléphone** (confirmé par CLAUDE.md, aucun outil navigateur/device disponible dans cette session) | `page.tsx` (`demarrerScanPointage`, `traiterScanPointage`) |
| Lien partageable | 🟢 | Affiché dans le dashboard (`PortailEmployeModal`), corrige un manque signalé par Bryan le 10/09/2026 | `ClockInShiftTab.tsx` |
| Méthode d'identification | 🟢 | PIN (portail) ou JWT existant (session 12h) | `employeeAuth.ts` |
| Clock In / Clock Out | 🟢 | Un seul bouton, direction auto-déduite | `pointer()`, `/api/clock/pointage` |
| Gestion des pauses | 🟡 | Pas de concept dédié en base — une pause = une "sortie" suivie d'une "entrée". Le portail l'affiche joliment ("Pause en cours", chrono) mais c'est une reconstruction côté client, pas un type de pointage distinct | `page.tsx` (état `en_pause`) |
| Biométrie | 🔴 | Valeur acceptée dans le `CHECK` SQL mais aucun code ne la produit | `attendance_logs.methode` |
| Géolocalisation / device de confiance | 🔴 | Colonnes présentes, nullables, jamais validées — V1 "pointage libre" assumé | `attendance_logs.latitude/longitude/device_id` |
| Mode hors-ligne | 🔴 (pour la queue) / 🟢 (pour la dégradation) | Un écran dédié ("Hors connexion") s'affiche proprement si le premier chargement échoue — mais **aucune queue locale, aucun retry automatique, aucun service worker** : un pointage tenté sans réseau échoue simplement, rien n'est mis en attente | `page.tsx` phase `hors_ligne` |

### Supervision
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Dashboard temps réel | 🟢 | KPI (présent/retard/absent/congé/incomplet), sparklines SVG maison, taux de conformité calculé | `PresencesView` |
| Actualisation | 🟢 | Polling 30s (Présences), 60s (autres onglets) — pattern `silencieux` correct, pas de spinner plein écran intempestif | `ClockInShiftTab.tsx` |
| Indicateurs | 🟢 | Présents/retards/absents/congés/incomplets, départs anticipés, heures travaillées moyenne | `PresencesView` |
| Filtres / recherche | 🟢 | Filtres rapides par statut, recherche par nom (Employés/Départements/Horaires) | Chaque `*View` |
| Vue par employé | 🟢 | `EmployeDetailModal` — 30 derniers jours, retards/absences comptés | `ClockInShiftTab.tsx` |
| Vue par département | 🟢 | `DepartementDetailDrawer` — effectif, stats | `ClockInShiftTab.tsx` |
| Flux d'activité live | 🟢 | Derniers pointages bruts (pas le résumé), exclut les lignes remplacées par une correction | `.../attendance?feed=` |

### Historique / corrections
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Modification d'un pointage | 🟢 (backend) / 🔴 (UI) | Route complète et testée à la lecture, **aucun bouton dans le dashboard ne l'appelle** | `.../corrections`, voir §2.5 et §5 |
| Correction d'un oubli | 🟢 (backend) / 🔴 (UI) | Idem — `ajout_pointage` | idem |
| Justification obligatoire | 🟢 | `raison` requis côté API pour toute correction | `.../corrections` |
| Validation manager | ⚪ | Le concept n'existe pas — toute correction avec `clock_in.write` est appliquée immédiatement, pas de workflow d'approbation à 2 étapes | — |
| Audit trail | 🟢 | `attendance_audit_logs`, immuable même pour service_role/superuser, séquence `YL-ATT-{année}-{8 chiffres}` | Migration `000009` |
| Consultation de l'audit trail | 🔴 | Aucune UI ne lit `attendance_audit_logs` — la table existe, se remplit potentiellement (si la route était appelée), mais rien ne l'affiche | Recherché explicitement, absent |

### Rapports
| Fonction | État | Vérification | Localisation |
|---|---|---|---|
| Export CSV | 🟢 | 3 points d'export distincts (Présences du jour, Départements, Employés) — génération **100% client-side**, snapshot ponctuel | `ClockInShiftTab.tsx` (`exporterCsv`) |
| Export multi-jours / période | 🔴 | Recherché explicitement, absent — chaque export ne couvre que l'état affiché à l'instant T | — |
| Statistiques temps travaillé | 🟡 | Moyenne du jour (dashboard) et moyenne 30 jours (fiche employé) — pas de vue agrégée sur une période choisie | `PresencesView`, `EmployeDetailModal` |
| Retards / absences | 🟡 | Comptés sur 30 jours dans la fiche employé, comptés au jour dans les KPI dashboard — pas de rapport dédié | idem |
| Heures supplémentaires | 🟡 | Calculées par le job (`heures_supplementaires_minutes`) si `heures_sup_autorisees` est activé sur l'horaire, stockées, **mais jamais affichées nulle part** dans le dashboard ou le portail (vérifié par grep, aucune occurrence UI) | `daily_attendance.heures_supplementaires_minutes` |
| Export PDF/Excel | 🔴 | Recherché explicitement, absent | — |

---

## 5. Le point le plus important de cet audit : corrections sans UI

`app/api/institution/clock-in/corrections/route.ts` est un backend
complet, sécurisé, testé à la lecture (validations, permissions,
immuabilité, audit). Mais **aucun écran du produit ne l'appelle** :

- `PresencesView` (dashboard, onglet Présences) est explicitement
  commentée dans le code comme "purement consultative" — voir
  `ClockInShiftTab.tsx` ligne ~2335 : *"les corrections passent par la
  fiche employé (à terme) ou directement via
  app/api/institution/clock-in/corrections"*.
- `EmployeDetailModal` (fiche employé) affiche l'historique 30 jours en
  lecture seule — aucun bouton "corriger ce jour" ou "ajouter un
  pointage oublié".

**Conséquence concrète** : aujourd'hui, si un employé oublie de pointer
ou qu'un pointage est erroné, **aucun manager ne peut le corriger depuis
le dashboard**. La seule voie est un appel direct à l'API (curl/Postman)
ou du SQL manuel (qui se heurterait d'ailleurs au trigger d'immuabilité
sur `attendance_logs`). Le "F. audit trail" vanté dans CLAUDE.md
existe au niveau schéma/API, pas au niveau produit utilisable.

---

## 6. Parcours réel Employé → Yelen

Étape par étape, ce qui fonctionne, ce qui est partiel, ce qui dépend
d'autre chose :

1. **Employé ouvre `/clock/{slug}`** → 🟢 résolution du slug fonctionne (backfill déterministe fait sur toutes les institutions existantes)
2. **Connexion Identifiant + PIN** → 🟢 logique complète (verrouillage, throttle), 🔴 jamais vue en navigateur dans cette session
3. **Premier login → `doit_changer_pin`** → 🟢 flag renvoyé par l'API ET consommé par le portail (`/compte/profil`, changement de PIN self-service) — **contrairement à ce que CLAUDE.md affirmait** ("jamais consommé côté portail" — note obsolète, voir §7)
4. **Écran principal — état de présence** → 🟢 logique riche (en_service/en_pause/termine/a_venir/retard/aucun_shift), dérivée honnêtement des données réelles (rien n'est affiché sans affectation/horaire réel)
5. **Clock In (arrivée)** → 🟠 requiert un scan QR de l'établissement (code cohérent, caméra via `html5-qrcode`), jamais testé sur device réel
6. **Aller en pause** → 🟢 ne requiert pas de QR (juste le bouton, session PIN suffit) — décision produit documentée (10/09/2026)
7. **Reprise après pause / Clock Out final** → 🟠 requiert de nouveau un QR, même limite de vérification device que l'étape 5
8. **Présence enregistrée** → 🟢 écrite dans `attendance_logs` immédiatement, visible côté dashboard institution au prochain polling (30s) — pas besoin d'attendre le job 15 min pour le flux live, mais `daily_attendance` (résumé/KPI) attend bien le prochain passage du job
9. **Historique employé** → 🔴 dépend d'un menu ("Mon historique") qui existe visuellement mais ne fait rien au clic

**Ce qui dépend encore d'une autre fonctionnalité** : le calcul du statut
du jour (Présent/Retard/Absent/Incomplet) dépend entièrement du job
`pg_cron` toutes les 15 min — dont l'activation réelle en production
n'est pas confirmée dans cette session (voir §2.4). Si le job n'est pas
actif, `attendance_logs` continue de se remplir normalement (le pointage
lui-même ne dépend pas du job), mais `daily_attendance` (donc tous les
KPI dashboard et le résumé "Ma journée" côté portail) resterait figé.

---

## 7. Écarts trouvés avec la documentation existante (CLAUDE.md)

Deux points où le code est **en avance** sur ce que CLAUDE.md décrit —
signalés ici pour que la doc soit corrigée séparément si utile, pas
modifiés dans ce document d'audit :

1. **PIN self-service** : CLAUDE.md (`/modules-livres`, section Clock In
   Shift) indique *"self-service changement de PIN employé au premier
   accès (`doitChangerPin` déjà renvoyé par l'API, jamais consommé côté
   portail)"* comme reste-à-faire. Le code montre que c'est **fait** —
   `app/api/clock/profil` (POST) + `changerPin()` dans `page.tsx` sont
   câblés et fonctionnels à la lecture.
2. **"Ma journée" / "Cette semaine" / "Planning"** : fonctionnalité
   substantielle construite le 10/09/2026 (`/api/clock/auth/me`, ~200
   lignes de logique), non mentionnée dans CLAUDE.md avant cet audit.

---

## 8. Sécurité — état vérifié

- **RLS** : activé sur les 9 tables, zéro policy — accès exclusivement via routes serveur authentifiées (`service_role`). Cohérent avec le reste du projet.
- **Immuabilité** : `attendance_logs` et `attendance_audit_logs` bloquent `UPDATE`/`DELETE` au niveau trigger, y compris pour `service_role` et superuser SQL Editor — échappatoire `SET LOCAL app.autoriser_correction_pointage='on'` documentée pour Bryan.
- **Auth employé** : JWT séparé de l'institution (secret/issuer/audience distincts), cookie `httpOnly`/`secure` (prod)/`sameSite=strict`, expiration 12h.
- **Verrouillage** : persisté en base (`employee_credentials.failed_attempts/locked_until`) — survit à un redémarrage/multi-instance, contrairement au pattern citoyen/institution existant ailleurs dans le projet (Map en mémoire). Complété par un throttle device+IP partagé (30/08/2026).
- **PIN** : bcrypt coût 12, aligné sur le standard du projet.
- **IDOR** : chaque route institution revérifie `institution_id` avant lecture/écriture — aucune faille de ce type identifiée sur ce périmètre précis à la lecture.
- **Upload documents employé** : passe par `validateUpload` (même garde-fou que les documents citoyens), bucket privé, URLs signées à durée limitée (60s). Bucket `documents-employes` confirmé existant et privé en base le 15/09/2026 (CLAUDE.md).

Aucune faille de sécurité identifiée dans ce périmètre au cours de cette
lecture — mais cet audit n'est pas un audit de sécurité formel (pas de
tentative d'exploitation, pas de JWT forgé testé comme cela a été fait
pour `lib/adminAuth.ts`).

---

## 9. Ce que Yelen possède déjà

### A. Fonctionnalités déjà solides
- Schéma de données complet et réfléchi (4 régimes horaires, historique d'affectation, immuabilité des pointages, audit trail structuré)
- CRUD employés/départements/horaires côté institution — complet, avec journalisation (`journal_activite`) sur chaque action
- Authentification employé dédiée avec verrouillage persisté + throttle
- Calcul automatique du statut de présence (retard/absent/incomplet), avec gestion correcte des horaires de nuit et des tolérances configurables
- Dashboard de supervision temps réel avec KPI, flux d'activité live, recherche/filtres
- Portail employé riche (planning 13 jours, temps travaillé en direct, comparaison prévu/réel)
- Documents employé (upload sécurisé, bucket privé)

### B. Fonctionnalités présentes mais incomplètes
- Statuts employé `teletravail`/`mission` : badge cosmétique, non intégré au calcul de présence
- Gestion des pauses : reconstruite depuis le modèle entrée/sortie, pas un concept de première classe
- Heures supplémentaires : calculées et stockées, jamais affichées
- Exports : CSV client-side ponctuel uniquement, aucun rapport sur période
- Statut "Congé" : existe dans le vocabulaire du produit, inatteignable par le flux normal

### C. Fonctionnalités présentes mais non vérifiées en conditions réelles
- Scan QR sur téléphone réel (code cohérent, jamais testé sur device)
- Exécution réelle du job `pg_cron` en production (déploiement de l'Edge Function + activation du cron non confirmés dans cette session)
- Rendu visuel des onglets Départements/Horaires du dashboard (jamais vus en navigateur, selon CLAUDE.md)
- Mode sombre de l'ensemble du module

### D. Fonctionnalités absentes
- Correction de pointage depuis une UI (backend existe, zéro point d'entrée produit)
- Consultation de l'audit trail (`attendance_audit_logs`) depuis une UI
- Historique de pointage côté portail employé (menu présent, non câblé)
- Gestion des pauses comme concept dédié (durée min/max, pause obligatoire réellement appliquée au calcul plutôt que juste stockée sur l'horaire)
- Géolocalisation / appareil de confiance (colonnes prêtes, aucune validation)
- Biométrie (valeur acceptée en base, aucun code)
- Mode hors-ligne avec file d'attente / retry
- Rapports multi-période, export PDF/Excel
- Rotation d'horaires multi-semaines, bornes min/max d'heures, fenêtre de pointage autorisée
- Notion de site/agence multiple par institution
- Workflow de validation manager à 2 étapes sur les corrections
- Notifications liées aux événements de présence (retard, absence, oubli de pointage) — aucune occurrence trouvée dans le code

### E. Risques techniques actuels
- Dépendance totale au job `pg_cron`/Edge Function pour tout indicateur agrégé (`daily_attendance`) — sans confirmation que ce job tourne réellement en production, le dashboard pourrait afficher des KPI figés sans qu'aucune erreur ne soit visible côté UI
- Le mécanisme de correction (audit trail complet, immuabilité) existe mais reste inaccessible sans intervention technique directe — un vrai besoin opérationnel (oubli de pointage) n'a aujourd'hui aucune réponse produit
- Fenêtre nocturne 36h du job explicitement documentée comme heuristique non garantie en cas de rotations de nuit rapprochées

### F. Dépendances actuelles
- `html5-qrcode` (^2.3.8) — scan caméra portail employé
- `qrcode` — génération QR branded (`lib/qrBrand.ts`, partagé avec `CodeQrTab.tsx`)
- `bcryptjs` — hachage PIN
- `jose` — JWT
- Extensions Postgres `pg_cron` + `pg_net`
- Secret Vault Supabase `service_role_key` (partagé avec `rappels-rdv`, pas spécifique à Clock In)
- Variable d'environnement `EMPLOYEE_JWT_SECRET` — confirmée présente en local (`.env.local`), statut Netlify non vérifié dans cette session

### G. Points nécessitant une décision produit
(Constat factuel uniquement — aucune recommandation dans ce document)
- Le mécanisme de correction doit-il rester "API only" ou avoir une UI ? Si oui, à quel niveau de workflow (validation manager ou action directe admin) ?
- Les statuts `teletravail`/`mission` doivent-ils entrer dans le calcul de présence, ou rester des badges informatifs ?
- Le concept de "pause" doit-il devenir un type de pointage à part entière ?
- Le mode hors-ligne doit-il gagner une vraie file d'attente, ou le pointage reste-t-il volontairement dépendant du réseau ?
- Le module doit-il gagner un vrai système de rapports sur période, ou les exports ponctuels suffisent-ils au besoin actuel ?
- La géolocalisation/biométrie (colonnes déjà prêtes) doivent-elles être activées, ou rester hors scope indéfiniment ?

---

*Fin de l'audit. Prochaine étape (document séparé, non commencé) : Yelen
Clock In — Analyse critique → benchmark → architecture cible → V1
production-grade → roadmap.*
