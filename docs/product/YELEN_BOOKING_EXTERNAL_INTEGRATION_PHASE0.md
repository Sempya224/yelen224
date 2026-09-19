# Yelen Booking — Intégration externe, Phase 0 : Analyse d'architecture

Rédigé le 01/09/2026. **Mission d'analyse uniquement — aucun code écrit,
aucune migration créée, aucune route ajoutée, aucune dépendance
installée, aucune modification du système de réservation existant.**

## Méthode

Audit en lecture seule du code réel (`app/`, `lib/`, `supabase/migrations/`,
`proxy.ts`). Aucune supposition, aucune architecture imaginée. Chaque
affirmation technique importante est classée :

- **EXISTE** — trouvé et cité fichier:ligne.
- **EXISTE PARTIELLEMENT** — le mécanisme existe mais couvre une partie
  seulement du besoin, ou souffre d'une lacune vérifiée dans le code.
- **N'EXISTE PAS** — recherche exhaustive faite (grep sur mots-clés
  pertinents), zéro résultat.
- **NON VÉRIFIÉ** — non confirmable depuis cet environnement (état réel
  d'une table sans trace de migration, réglage de dashboard externe,
  comportement en production réelle).

`rdv` et `paid_bookings` n'ont **aucune trace de `CREATE TABLE`** dans
`supabase/migrations/` (confirmé par recherche exhaustive) — ce sont deux
des tables historiques pré-existantes documentées dans `CLAUDE.md`
(section `/supabase`, "6 tables historiques... sans trace dans les
migrations"). Leur schéma ci-dessous est donc **reconstruit par lecture
du code applicatif** (routes qui les lisent/écrivent), jamais par lecture
d'un `CREATE TABLE` — c'est la seule source disponible dans cet
environnement, mais ce n'est pas la même preuve qu'un `CREATE TABLE`
explicite. Marqué explicitement partout où c'est le cas.

---

# Analyse actuelle

## État réel du système

Yelen est une plateforme de prise de rendez-vous entre des **citoyens**
(authentifiés via Supabase Auth, téléphone + OTP) et des **institutions**
(authentifiées via un système JWT custom séparé, `lib/institutionAuth.ts`
— cookie `yelen224_institution_session`, jamais de session Supabase
Auth). Il n'existe aujourd'hui **aucun mécanisme d'intégration externe** :
pas de clé API, pas de portail développeur, pas de webhook, pas de widget
embarquable, pas d'endpoint documenté pour un tiers. Recherche exhaustive
(`webhook`, `api_key`/`apiKey`, `developer`, `widget`, `embed`, `iframe`)
sur tout `app/`/`lib/`/`proxy.ts` : **N'EXISTE PAS**, à une exception près
— `proxy.ts:252` contient le mot "webhooks" dans un commentaire expliquant
pourquoi `/api/**` est exempté du géoblocage (services tiers non cassés
par cette couche), pas un système réel.

La seule chose qui ressemble aujourd'hui à un "lien externe" est le lien
de partage public de la fiche institution (`/institution/{slug}-{id}`,
voir Niveau 1 plus bas) — **EXISTE**, mais mène à la fiche établissement,
pas directement à la réservation.

## Parcours actuel des rendez-vous

Chaîne réelle (citoyen), tracée fichier par fichier :

```
app/recherche (recherche institutions, lecture anon)
  → app/institution/[id]/InstitutionPublicClient.tsx (fiche publique)
  → clic "Prendre rendez-vous" → /rdv/{institutionId} (uuid brut, pas le slug)
  → app/rdv/[id]/page.tsx (wizard : créneau → objet → pour soi/autrui → champs complémentaires)
  → app/rdv/[id]/actions.ts::createRdv() (Server Action, "use server")
  → INSERT direct dans `rdv` (session Supabase Auth du citoyen, RLS)
  → lib/notificationEngine.ts::notifierReservation() (best-effort, service_role)
  → app/api/qr/generate (le citoyen génère son QR de présence)
  → app/api/qr/validate (l'institution scanne, POST puis PUT présent/absent)
  → app/api/institution/rdv/statut/route.ts (institution : accepter/refuser/terminer)
  → app/mes-rdv/actions.ts::annulerRdv() / reporterRdv() (citoyen : annulation/report)
```

**EXISTE** à chaque étape, preuves ci-dessous section "Routes / endpoints
identifiés".

## Architecture concernée

- **Frontend** : Next.js 16 App Router. Wizard de réservation citoyen en
  Client Component (`app/rdv/[id]/page.tsx`, "use client", 1224 lignes).
  Fiche publique institution également Client Component
  (`InstitutionPublicClient.tsx`, composant unique non découpé, cf.
  `docs/ui/YELEN_HOTEL_MODEL_AUDIT.md:22` pour cette caractéristique déjà
  documentée ailleurs).
- **Backend** : pas de service dédié — logique répartie entre Server
  Actions (`"use server"`, ex. `createRdv`, `annulerRdv`) et routes
  `app/api/**/route.ts`, toutes contre la même base Supabase.
- **Base de données** : PostgreSQL Supabase, RLS activé partout,
  `service_role` utilisé systématiquement pour bypasser RLS côté
  institution (aucune session Supabase Auth institution).
- **Deux systèmes d'authentification distincts et cloisonnés** touchent
  ce flux : Supabase Auth (citoyen, `auth.uid()`) et JWT custom
  (institution, cookie séparé) — **jamais de session partagée**, confirmé
  par `CLAUDE.md` (`/auth`) et par la lecture directe de
  `lib/institutionAuth.ts` (secret `INSTITUTION_JWT_SECRET`, distinct de
  `SUPABASE_SERVICE_ROLE_KEY`).

## Routes / endpoints identifiés

| Route | Méthode | Auth | Rôle | Preuve |
|---|---|---|---|---|
| `/api/rdv-disponibilite` | GET | **Aucune (publique)** | Comptages de créneaux déjà pris par institution/plage de dates | `app/api/rdv-disponibilite/route.ts:1-52`, commentaire ligne 4 confirme explicitement "route publique" |
| `/api/annonces-publiques` | GET | **Aucune (publique)** | Annonces publiées d'une institution | `app/api/annonces-publiques/route.ts:1-33` |
| `/rdv/[id]` → `createRdv` | Server Action (POST implicite) | Session Supabase Auth citoyen (`accessToken`) | Créer un RDV gratuit | `app/rdv/[id]/actions.ts:11-105` |
| `notifierReservationPayante` | Server Action | Session Supabase Auth citoyen | Notifier après un RDV payant (déjà inséré côté client) | `app/rdv/[id]/actions.ts:114-142` |
| `/api/qr/generate` | POST | Session Supabase Auth citoyen | Générer/renouveler le QR de présence | `app/api/qr/generate/route.ts:18-99` |
| `/api/qr/validate` | POST puis PUT | JWT institution (`getAuthenticatedMembre`) | Scanner puis confirmer présent/absent | `app/api/qr/validate/route.ts:14-193` |
| `mes-rdv` → `annulerRdv`/`reporterRdv` | Server Action | Session Supabase Auth citoyen | Annuler/reporter (citoyen) | `app/mes-rdv/actions.ts:56-137` |
| `/api/institution/rdv` | GET | JWT institution (`getAuthenticatedMembre` + `canAccessTab`) | Liste des RDV + avis de l'institution | `app/api/institution/rdv/route.ts:25-105` |
| `/api/institution/rdv-jour` | GET | JWT institution (`getAuthenticatedInstitutionId`) | RDV d'une journée précise | `app/api/institution/rdv-jour/route.ts:1-29` |
| `/api/institution/rdv-historique` | GET | JWT institution (NON VÉRIFIÉ en détail — non ouvert cette session, présent par nommage cohérent avec le reste) | Historique RDV | `app/api/institution/rdv-historique/route.ts` (fichier confirmé existant, contenu NON VÉRIFIÉ ici) |
| `/api/institution/rdv/statut` | PATCH | JWT institution (`getAuthenticatedMembre` + `can(role,"rdv.write")`) | Accepter/refuser/terminer/absent | `app/api/institution/rdv/statut/route.ts:28-134` |
| `/api/institution/rdv/events` | NON VÉRIFIÉ | NON VÉRIFIÉ | Probable lecture `rdv_events` (nommage cohérent) | Fichier confirmé existant (`app/api/institution/rdv/events/route.ts`), contenu non ouvert cette session |
| `/api/institution/rdv/guichet` | NON VÉRIFIÉ | NON VÉRIFIÉ | Probable création RDV guichet (walk-in) par l'institution | Fichier confirmé existant, contenu non ouvert cette session |

**Aucune de ces routes n'accepte de requête cross-origin par conception**
(pas de header CORS nulle part — voir section Sécurité). Les deux seules
routes publiques (`rdv-disponibilite`, `annonces-publiques`) sont donc
aujourd'hui consultables uniquement depuis le domaine Yelen lui-même côté
navigateur (fetch cross-origin bloqué par défaut par le navigateur en
l'absence de CORS) — un site externe ne pourrait les appeler en JS
qu'après ajout explicite d'en-têtes CORS, ou via un appel serveur-à-serveur
(pas soumis à CORS, mais alors ce n'est plus un "widget front" simple).

## Modèles de données concernés

### `rdv` — **EXISTE, table historique sans migration de création** (voir Méthode)

Colonnes confirmées par lecture croisée du code (liste non garantie
exhaustive — reconstruite, pas lue depuis un schéma) :
`id, citoyen_id, institution_id, date_rdv, heure_rdv, objet, statut,
pour_autre, nom_autre, phone_autre, qr_token, qr_expires_at,
champs_complementaires_reponses, duree_minutes, description_besoin,
provenance, motif_annulation, motif_report, presence, presence_status,
presence_confirmed_at, conversation_terminee, avis_demande, created_at,
termine_at, termine_par, guichet`.
Sources : `app/rdv/[id]/actions.ts:54-69`, `app/api/institution/rdv/route.ts:35`,
`app/api/institution/rdv/statut/route.ts:63-69`, `lib/rdvGating.ts` (usage
`presence_status`/`statut`).

**Valeurs de `statut` réellement écrites** : `nouveau` (création,
`actions.ts:60`), `en_attente` (acceptation par l'institution **ou**
report, `statut/route.ts:16` + `mes-rdv/actions.ts:111`), `annule`
(annulation citoyen **ou** refus institution — **la même valeur pour les
deux cas**, `statut/route.ts:16`), `confirme` (présence scannée pendant
que le RDV était `en_attente`, `qr/validate/route.ts:140-141`), `termine`.
CLAUDE.md mentionne aussi une valeur `nouveau` "jamais revérifiée par
`enum_range`" — cohérent avec ce qui est observé ici.

**RLS `rdv`** (`supabase/migrations/20260720000004_rdv_paid_bookings_citoyen_policies.sql:17-23`) :
- `rdv_citoyen_insert` : `FOR INSERT TO authenticated WITH CHECK (auth.uid() = citoyen_id)` — **aucune autre contrainte**. Rien n'empêche au niveau base qu'un `institution_id` inexistant, non `validee`, ou un créneau hors des `disponibilites` réelles de l'institution soit inséré.
- `rdv_citoyen_own` : `FOR SELECT TO authenticated USING (auth.uid() = citoyen_id)`.
- **Aucune policy UPDATE citoyen** — confirmé explicitement par le commentaire de `app/mes-rdv/actions.ts:4-14` : la mise à jour côté citoyen (annulation/report) passe donc obligatoirement par `service_role` (Server Action), jamais par un `UPDATE` direct RLS.
- **Aucune policy pour un rôle "institution"** — cohérent avec l'absence de session Supabase Auth institution ; tout accès institution passe par `service_role` après vérification du JWT custom.

### `paid_bookings` — **EXISTE, même statut historique**

Colonnes vues : `id, citoyen_id, institution_id, date_rdv, heure_rdv,
statut, montant_paye, montant_declare_citoyen, declare_le, traite_le,
confirmation_code`, relation vers `paid_services`. RLS quasi identique à
`rdv` (`paid_bookings_citoyen_insert`/`paid_bookings_citoyen_own`, même
migration, mêmes lignes 25-31) — mêmes limites (aucune validation
serveur de créneau/capacité à l'insertion).

### `institutions` — **EXISTE**, ~35 colonnes (cf. `docs/product/YELEN_TRUST_DOMAIN_ARCHITECTURE.md:44`)

Colonnes pertinentes pour cette mission : `id` (uuid, **la seule vraie
clé fonctionnelle**), `slug` (text, UNIQUE, CHECK de format, généré par
`lib/institutionSlug.ts:45-66`, migration `20260805000010`), `statut`
(enum, seule `'validee'` est publique), `disponibilites` (jsonb — format
détaillé ci-dessous), `horaires` (jsonb — **différent** de
`disponibilites`, sert uniquement au badge Ouvert/Fermé, confondu par
erreur dans `CarteMapHome.tsx::getStatus()` selon `CLAUDE.md`, non
revérifié ici), `capacite_par_creneau` (int, défaut effectif 1 —
`app/rdv/[id]/page.tsx:588`), `services` (jsonb).

**Format de `institutions.disponibilites`** (`lib/disponibilites.ts:20-75`,
`EXISTE`) — tableau de chaînes, 3 formats acceptés simultanément :
1. ISO ponctuel : `"2026-07-20T09:00"`.
2. Hebdomadaire récurrent : `"Lundi 09:00"`.
3. Quotidien récurrent : `"09:00"`.

C'est un **format texte libre parsé par regex**, pas une structure
normalisée (pas de table `creneaux`/`slots` séparée). `generateSlotsInRange()`
matérialise les occurrences futures sur N jours à la demande, côté client
et côté route `/api/rdv-disponibilite`.

### `institutions_public_read` (policy RLS) — **EXISTE, et c'est une vraie faille trouvée pendant cet audit**

`supabase/migrations/20260709000014_policy_institutions_public_read.sql:6-8` :
```sql
CREATE POLICY institutions_public_read ON institutions
  FOR SELECT TO anon, authenticated
  USING (statut = 'validee');
```
RLS Postgres est **filtrage par ligne, jamais par colonne**. Or
`InstitutionPublicClient.tsx:586` exécute :
```ts
const { data: row } = await supabase.from("institutions").select("*").eq("id", id).maybeSingle();
```
avec le client Supabase **anon** (navigateur, sans authentification).
**Conséquence directe et vérifiable** : `mot_de_passe_hash` (le hash du
mot de passe de connexion de l'institution, colonne confirmée existante
par `CLAUDE.md` `/auth` point 2 et `lib/institutionAuth.ts` référençant
le même mécanisme de login) était renvoyé dans la réponse JSON de
**chaque chargement de fiche publique**, pour **chaque institution
validée** — visible dans l'onglet Réseau de n'importe quel navigateur,
sans avoir besoin d'aucune intégration externe. Ceci n'était pas une
conséquence d'une future intégration : c'était un fait déjà vrai en
production, indépendant de cette mission.

**✅ CORRIGÉ le 01/09/2026** (hors périmètre strict de cette Phase 0,
mais fait à la demande explicite de Bryan dès la découverte, vu la
sévérité) : `InstitutionPublicClient.tsx:586` sélectionne désormais une
liste explicite de colonnes (celles réellement consommées par le
composant, vérifiées une par une par recoupement avec `favoris/route.ts`
et `rdv/[id]/page.tsx`, qui font déjà le même `select()` explicite en
production) au lieu de `select("*")`. `mot_de_passe_hash` et toute autre
colonne non listée ne sont plus jamais renvoyées à ce point. `tsc --noEmit`
→ exit 0. Les 3 colonnes `conditions_entreprise_creee_le`/
`informations_importantes_creee_le`/`informations_legales_creee_le`
(migration `20260831000001`), d'abord exclues par prudence (exécution
non confirmée), ont été réintégrées le même jour après confirmation de
Bryan que la migration a bien été exécutée. **Non commité, non testé en
navigateur réel** — Bryan a signalé ne pas avoir vérifié visuellement si
ces dates "Écrit le" s'affichent réellement sur la fiche (indépendant de
ce correctif). Détail complet dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`.
**NON VÉRIFIÉ** : si `mot_de_passe_hash` était la seule colonne
sensible réellement exploitée par un tiers avant ce correctif — un audit
colonne par colonne des ~35 colonnes d'`institutions` n'a pas été refait
ici (hors périmètre de cette Phase 0).

### `notifications`, `rdv_events`, `push_subscriptions` — **EXISTE**

`rdv_events` : RLS actif, **zéro policy** (`lib/notificationEngine.ts:256-258`,
confirmé par commentaire citant `20260709000012_create_rdv_events.sql`)
— écriture exclusivement `service_role`. Action enum observée :
`"creation" | "confirmation" | "annulation" | "report" | "termine" |
"absent" | "message" | "depasse"` (`lib/notificationEngine.ts:270`) —
**pas de valeur "refus"** : quand une institution refuse un RDV
(`statut/route.ts` action `annule`), aucun événement `rdv_events` n'est
journalisé pour cette action précise (seul `journal_activite`, propre à
l'institution, l'enregistre via `enregistrerAction`) — asymétrie d'audit
entre citoyen et institution sur ce point, notée ici car pertinente pour
toute future exigence d'audit d'une réservation venant d'une intégration
externe (section Sécurité, "journalisation").

## Composants frontend concernés

| Composant | Rôle | Fichier |
|---|---|---|
| `InstitutionPublicClient.tsx` | Fiche publique, CTA "Prendre rendez-vous" | `app/institution/[id]/InstitutionPublicClient.tsx` (2086+ lignes, composant unique) |
| Wizard de réservation | Sélection créneau → objet → soumission | `app/rdv/[id]/page.tsx` (1224 lignes, "use client") |
| Mes RDV | Liste, annulation, report | `app/mes-rdv/page.tsx` (1163 lignes) |
| Mon QR | Affichage du QR de présence | `app/mon-qr/` (existence confirmée par grep antérieur dans cette session de travail, contenu non ouvert dans cette mission) |
| `DisponibilitesTab.tsx` | Config créneaux institution | `app/[slug]/[id]/components/DisponibilitesTab.tsx` (existence confirmée, contenu non ouvert cette session — refonte "Mission 01" déjà documentée dans `CLAUDE.md`) |
| `ServicesTab.tsx` | Config services institution | `app/[slug]/[id]/components/ServicesTab.tsx` (idem) |
| Centre de validation RDV (institution) | Accepter/refuser/terminer | Consommateur probable de `/api/institution/rdv/statut` — fichier exact non ré-ouvert cette session, cité par nom dans `CLAUDE.md` (`ValiderRdvTab.tsx`), **NON VÉRIFIÉ dans cette mission précise** |

## Services backend concernés

- `lib/disponibilites.ts` — génération de créneaux à partir du texte
  libre `institutions.disponibilites`.
- `lib/notificationEngine.ts` — **service_role uniquement**, ne doit
  jamais être importé côté client (avertissement en tête de fichier,
  ligne 1-5) ; 8 phases fixes + envoi générique + Web Push (VAPID,
  best-effort) + `rdv_events`.
- `lib/institutionAuth.ts` — vérification JWT institution (cookie
  `yelen224_institution_session`), sessions individuelles
  (`institution_sessions`, révocation par session depuis le 30/08/2026).
- `lib/institutionPermissions.ts` — RBAC institution (`can()`,
  `canAccessTab()`), 5 rôles (cf. `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`,
  section Lot 3, déjà auditée `🟢 VERIFIED, mature`).
- `lib/rdvGating.ts` — fenêtre de confirmation de présence (jour même,
  dès 10 min avant l'heure), appliquée **côté serveur** dans
  `qr/validate` (défense en profondeur réelle, pas juste UI).
- `lib/institutionSlug.ts` — génération/résolution de slug public.
- Job `pg_cron` pour les rappels RDV — **EXISTE** par nom de migration
  (`supabase/migrations/20260724000009_cron_rappels_rdv.sql`, extension
  `pg_cron`/`pg_net` déclarée), **contenu SQL non ouvert dans cette
  mission** — mécanisme de déclenchement des `notifierRappel24h/2h/45min/15min`
  probable mais **NON VÉRIFIÉ précisément**.

## Dépendances

Aucune dépendance de scheduling/booking tierce trouvée (pas de Cal.com,
pas de Calendly SDK, pas de librairie de créneaux publiée) — le moteur de
créneaux (`lib/disponibilites.ts`) est un développement 100% interne,
texte libre parsé par regex, pas un format structuré (RRULE iCal ou
équivalent absent). `@simplewebauthn/*`, `jose` (JWT), `web-push`,
`bcryptjs`, `otplib` sont utilisés pour l'authentification/notifications
déjà en place, sans lien direct avec une intégration externe.

## Contraintes actuelles

1. **Deux systèmes d'auth cloisonnés, aucun n'est conçu pour un tiers.**
   Créer un RDV exige aujourd'hui une session Supabase Auth **citoyen**
   réelle (`accessToken` vérifié par `auth.getUser()`) — un site externe
   ne peut pas créer de réservation "au nom de" son visiteur sans que ce
   visiteur passe par le flux d'authentification Yelen (téléphone + OTP)
   d'une manière ou d'une autre.
2. **Aucune validation serveur de la cohérence créneau/institution à
   l'insertion.** `rdv_citoyen_insert` (RLS) ne vérifie que
   `auth.uid() = citoyen_id` — rien n'empêche en théorie un `institution_id`
   invalide, non validée, ou un couple date/heure hors des
   `disponibilites` réelles. La UI empêche ça côté client
   (`app/rdv/[id]/page.tsx`), mais **aucune règle équivalente n'existe
   côté serveur** dans `createRdv` (`app/rdv/[id]/actions.ts:54-72` —
   insertion directe, zéro `SELECT` de vérification préalable de
   l'institution ou du créneau).
3. **Pas de contrôle de capacité au moment de l'écriture (conflits de
   créneaux non gérés serveur).** `capacite_par_creneau` n'est comparée
   au nombre de RDV déjà pris qu'au moment de l'**affichage** du wizard
   (`GET /api/rdv-disponibilite`, calcul client dans `dayStatus()`/`remainingFor()`,
   `app/rdv/[id]/page.tsx:669-993`) — **jamais revérifiée au moment du
   `INSERT`** dans `createRdv`. Deux citoyens (ou deux intégrations
   externes) peuvent réserver simultanément le même créneau au-delà de
   la capacité annoncée ; aucune contrainte `UNIQUE`/transaction ne
   protège ce cas dans le code lu.
4. **Format de créneaux non structuré.** Le texte libre de
   `institutions.disponibilites` complique toute exposition via une API
   propre — un consommateur externe aurait besoin d'un format stable
   (ISO 8601 / RRULE), pas de la regex actuelle conçue pour un rendu UI.
5. **X-Frame-Options: DENY actif site-wide.** Voir section Sécurité —
   contrainte dure pour tout embed en iframe.
6. **Aucun identifiant/scope "institution partenaire API"**, aucune
   notion de clé, de quota, ni de consentement d'exposition granulaire
   par institution (rien dans le schéma `institutions` ne ressemble à un
   flag "autorise intégration externe").

## Sécurité actuelle

**Headers de sécurité (`proxy.ts`, appliqués site-wide sauf assets
statiques, `config.matcher` ligne 508)** :
- `X-Frame-Options: DENY` — **actif en production**, pas en mode test
  (`proxy.ts:206`). Bloque déjà tout iframe cross-origin de n'importe
  quelle page Yelen, y compris `/rdv/[id]`.
- `Content-Security-Policy-Report-Only` (`proxy.ts:183-195`) — inclut
  `frame-ancestors 'none'` (ligne 194), **pas encore bloquant** (mode
  Report-Only, cf. `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` GAP-16-01,
  toujours 🟠 IN PROGRESS). Une fois passée en mode bloquant, viendrait
  doubler `X-Frame-Options` avec la même restriction, en plus strict
  (contrôle par domaine exact possible, pas utilisé aujourd'hui — la
  valeur actuelle est `'none'`, pas une liste d'origines autorisées).
- `Strict-Transport-Security`, `Permissions-Policy`, `Referrer-Policy`,
  `X-Content-Type-Options` — actifs, sans rapport direct avec
  l'intégration externe.

**CORS** — **N'EXISTE PAS**. Recherche exhaustive (`Access-Control-Allow-Origin`,
`cors(`) sur tout `*.ts*` : zéro résultat. Aucune route `app/api/**`
n'envoie d'en-tête CORS. Conséquence : un site tiers ne peut **pas**
aujourd'hui appeler une route Yelen (`/api/rdv-disponibilite` y compris,
malgré son absence d'authentification) depuis du JavaScript exécuté sur
son propre domaine — le navigateur du visiteur bloquerait la réponse
(same-origin policy par défaut). Un appel serveur-à-serveur (backend du
site tiers → API Yelen) n'est **pas** soumis à cette restriction (CORS ne
s'applique qu'aux requêtes navigateur) — distinction importante pour les
Niveaux 3/4.

**Point non couvert par cette mission mais réel et à connaître** : le
projet utilise une clé Supabase `anon` publique côté navigateur (comme
tout projet Supabase — cette clé n'est pas un secret, elle est prévue
pour être publique). Cette clé permet, **indépendamment de toute
intégration Yelen future**, à quiconque l'extrait du bundle JS public
d'appeler directement l'API REST Supabase et de lire tout ce que les
policies RLS `anon` autorisent déjà — dont, comme démontré ci-dessus, la
totalité des colonnes d'`institutions` (`mot_de_passe_hash` inclus) via
`select("*")`. Ce n'est pas un risque *créé* par une future intégration,
mais tout élargissement de surface publique (Niveau 1/2) doit être
évalué en sachant que ce canal existe déjà en parallèle de n'importe
quelle route Next.js.

**Rate limiting** (`lib/edgeSecurity.ts:52-83`) :
- Générique : 240 requêtes/minute/IP sur tout le site (`MAX_REQUETES_PAR_FENETRE_DEFAUT`, ligne 54).
- Seuil renforcé (20/min) uniquement sur les routes d'authentification
  (`/api/(citoyen|institution|clock)/auth/`, `/api/citoyen/recuperation`,
  `/admin/login`, `/api/admin/auth/login` — `ENDPOINTS_SENSIBLES`, lignes 74-79).
- **`/api/rdv-disponibilite`, `createRdv`, `/api/annonces-publiques` ne
  bénéficient d'aucun seuil dédié** — seulement le générique 240/min/IP.
  Un abus de réservation (booking spam) resterait donc quasiment libre
  jusqu'à 240 requêtes/minute par IP, un volume élevé pour un usage
  humain normal.
- État **en mémoire d'instance edge**, ne survit pas un redémarrage, ne
  se partage pas entre instances (limite déjà documentée dans
  `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, GAP-10-01, ⚫ TEMPORARY
  ACCEPTED GAP).

**Anti-bot** : uniquement une liste de signatures de User-Agent d'outils
de scan connus (`sqlmap`, `nikto`, `nmap`, etc. — `lib/edgeSecurity.ts:16-20`)
et un blocage des User-Agent absents/vides. **Aucun CAPTCHA, aucun
challenge JS, aucun score comportemental.**

**CSRF** — recherche de `csrf`/`sameSite` dans `proxy.ts` : **N'EXISTE
PAS** de protection CSRF explicite trouvée dans le middleware. Les
Server Actions Next.js ont une protection CSRF native partielle (vérif.
d'origine sur les requêtes POST des Server Actions, mécanisme du
framework, **non ré-audité dans cette mission** — NON VÉRIFIÉ en détail).
Les routes `app/api/**` classiques n'ont pas de jeton CSRF explicite —
protégées uniquement par l'obligation d'un `Authorization: Bearer` ou
d'un cookie httpOnly non lisible en JS cross-site.

**Validation serveur des créneaux/capacité** : voir "Contraintes
actuelles" point 2-3 — **EXISTE PARTIELLEMENT** (fenêtre de présence
`lib/rdvGating.ts` bien revérifiée serveur ; cohérence créneau/capacité à
la création, non revérifiée serveur).

**Falsification d'un identifiant institution** : `rdv_citoyen_insert`
n'exige que `auth.uid() = citoyen_id` — un `institution_id` arbitraire
(existant ou non) peut être soumis sans rejet serveur à ce stade. Un
citoyen (ou une intégration qui obtiendrait un `accessToken` citoyen)
pourrait donc créer un RDV rattaché à une institution qu'il n'a jamais
consultée, ou à un uuid inexistant. **EXISTE (comme lacune), pas comme
protection.**

**Journalisation d'une réservation venant d'une intégration externe** :
`rdv_events` capture `auteur_type: "citoyen" | "institution" | "system"`
(`lib/notificationEngine.ts:269`) — **aucune valeur pour "intégration
externe"/"API"/"widget"** aujourd'hui. Une future Phase 1+ devrait
décider si une réservation externe doit être un citoyen normal (le
visiteur devient un vrai compte Yelen) ou un nouveau type d'auteur — la
distinction actuelle n'anticipe pas ce cas.

**Secrets** : `QR_SECRET_KEY` (a un défaut en dur `"yelen224-secret"` si
la variable d'environnement est absente — `app/api/qr/generate/route.ts:66`,
**risque déjà existant, hors périmètre de correction de cette mission,
signalé car directement lié à la génération d'un identifiant de
confirmation qu'un flux externe pourrait vouloir réutiliser**),
`SUPABASE_SERVICE_ROLE_KEY`, `INSTITUTION_JWT_SECRET` : tous lus depuis
`process.env`, jamais codés en dur (sauf l'exception `QR_SECRET_KEY`
ci-dessus), jamais exposés côté client (tous dans des fichiers serveur —
Server Actions ou routes API).

---

# Évolution envisagée

Rappel de cadrage (brief) : Calendly distingue un **embed** (afficher le
parcours de réservation directement) d'une **API** (intégration plus
poussée) — cette distinction externe est utilisée uniquement comme
référence de vocabulaire, rien n'est transposé sans vérification déjà
faite ci-dessus sur le code réel de Yelen.

## Niveau 1 — Lien

Un simple lien Yelen que l'entreprise place sur son site
("Prendre rendez-vous" → redirige vers Yelen).

**Ce qui existe déjà et se rapproche le plus de ce niveau** :
`/institution/{slug}-{id}` (`lib/institutionSlug.ts:85-87`,
`construireLienPartageInstitution()`) — lien de partage stable,
human-readable, déjà généré par le produit (chantier "lien de partage
fiche établissement", 29/08/2026 selon le commentaire du fichier). Mène
à la **fiche publique**, pas directement au wizard de réservation.

Le wizard lui-même (`/rdv/[id]`) **n'accepte que l'uuid brut**
(`app/rdv/[id]/page.tsx:490-491`, `useParams<{id:string}>()`, aucune
résolution de slug) — un lien direct "Réserver maintenant" vers le
wizard existe donc déjà **techniquement** (`/rdv/{uuid}`), mais n'est ni
documenté, ni conçu pour être partagé publiquement en dehors du produit
(pas de page de renvoi si le RDV est déjà pris/l'institution suspendue —
**NON VÉRIFIÉ**, wizard non ouvert intégralement pour ce cas précis).

## Niveau 2 — Embed

Widget/iframe intégrable sur le site de l'entreprise, affichant le
parcours de réservation Yelen directement.

**Bloqué net par une contrainte déjà active en production** :
`X-Frame-Options: DENY` (`proxy.ts:206`) s'applique à **toutes** les
pages du site sans exception de domaine — `/rdv/[id]` y compris. Aucune
iframe cross-origin ne peut aujourd'hui afficher une page Yelen, quel que
soit le domaine appelant. Ce n'est pas une limite théorique : c'est un
header HTTP actif, pas en Report-Only.

## Niveau 3 — Intégration avancée

Une entreprise avec son propre système communique avec Yelen (au-delà
d'un simple lien, en-deçà d'une API publique documentée) — ex. un
identifiant institution transmis, un retour de statut.

Rien de ce niveau n'existe dans le code aujourd'hui. Le plus proche
existant est la route publique `/api/rdv-disponibilite` (comptages de
créneaux, sans authentification) — utilisable en théorie
serveur-à-serveur (pas de CORS à contourner dans ce sens), mais ne permet
que la **lecture**, pas la création d'un RDV (qui exige une session
citoyen Supabase Auth réelle).

## Niveau 4 — API / Webhooks

API publique documentée, éventuellement des webhooks de synchronisation.

**N'EXISTE PAS** — confirmé par recherche exhaustive (voir "État réel du
système"). Aucune fondation de clé API, quota, scope, ou webhook
n'existe dans le schéma ou le code.

---

# Analyse de faisabilité

## Niveau 1 — Lien

- **Existant** : génération de lien de partage stable
  (`lib/institutionSlug.ts`), fiche publique déjà consultée sans
  authentification, wizard déjà accessible par uuid direct.
- **Manquant** : lien direct documenté/officiel vers le wizard (pas
  seulement vers la fiche), gestion des cas d'erreur pour un visiteur
  arrivant "à froid" sur `/rdv/{id}` sans être passé par la fiche
  (institution suspendue, id invalide — comportement **NON VÉRIFIÉ**).
- **Réutilisable** : la quasi-totalité du parcours citoyen existant, sans
  changement.
- **Risques** : faibles — c'est le niveau le plus proche de "ne rien
  changer".
- **Complexité** : faible.
- **Sécurité** : aucun changement de surface d'attaque — mêmes routes,
  mêmes protections (ou mêmes lacunes, dont la fuite `mot_de_passe_hash`
  déjà documentée, indépendante de ce niveau).
- **Dépendances** : aucune.

## Niveau 2 — Embed

- **Existant** : rien de directement réutilisable pour un rendu iframe
  cross-origin — le blocage `X-Frame-Options: DENY` est global,
  appliqué avant même d'atteindre le code de la page.
- **Manquant** : (a) une décision explicite d'assouplir
  `X-Frame-Options`/`frame-ancestors` **pour des routes précises
  seulement** (ex. une future `/embed/rdv/[id]` séparée du reste du
  site, jamais un assouplissement global) ; (b) probablement une version
  allégée du wizard sans le chrome de navigation Yelen (non existante) ;
  (c) une politique `frame-ancestors` **avec liste d'origines
  autorisées par institution** (aujourd'hui `'none'`, jamais une liste)
  — ce qui suppose de savoir, par institution, quels domaines ont le
  droit de l'embarquer (donnée qui n'existe nulle part dans le schéma
  actuel).
- **Réutilisable** : la logique de créneaux/réservation elle-même
  (`lib/disponibilites.ts`, `createRdv`), si exposée via une route
  dédiée.
- **Risques** : élevés si mal scopé — assouplir `frame-ancestors`
  globalement romprait une protection anti-clickjacking active sur
  **tout** le site (admin, dashboard institution, comptes citoyens
  inclus), pas seulement la réservation. Une route d'embed doit être
  strictement isolée du reste du site pour ce header.
- **Complexité** : moyenne à élevée — nouvelle surface UI + nouvelle
  politique de sécurité par route + gestion des origines autorisées.
- **Sécurité** : nécessite une politique CSP/`frame-ancestors` **par
  route**, pas par site (aujourd'hui la politique est unique et globale,
  posée une seule fois dans `proxy.ts`) — changement d'architecture non
  trivial du middleware.
- **Dépendances** : aucune dépendance externe nécessaire a priori
  (iframe = HTML natif), mais dépend directement de la décision
  d'architecture Niveau 3/4 (un embed doit appeler quelque chose — soit
  les routes existantes élargies, soit une future API).

## Niveau 3 — Intégration avancée

- **Existant** : `/api/rdv-disponibilite` (lecture de créneaux, déjà
  sans auth), le moteur `lib/disponibilites.ts`.
- **Manquant** : tout mécanisme d'écriture pour un tiers (créer un RDV
  sans passer par une session citoyen Supabase Auth) ; notion
  d'identifiant de partenaire ; validation serveur créneau/capacité à
  l'écriture (lacune déjà présente même en interne, cf. Contraintes
  actuelles point 2-3 — **à corriger avant, pas après, toute
  exposition externe**, sans quoi le problème d'overbooking déjà latent
  en interne deviendrait un problème public) ; format de créneaux
  structuré (le texte libre actuel n'est pas exposable tel quel à un
  tiers).
- **Réutilisable** : `notificationEngine.ts` (notifier institution/citoyen
  une fois un RDV créé, quel que soit le canal d'origine), `rdv_events`
  (audit trail, à étendre avec un nouveau type d'auteur).
- **Risques** : moyens à élevés — c'est le niveau où la question "qui
  est le citoyen final ?" doit être tranchée (compte Yelen provisoire ?
  compte existant lié ? invité anonyme rattaché après coup ?), ce qui
  touche à l'architecture d'authentification citoyen elle-même.
- **Complexité** : élevée.
- **Sécurité** : nécessite au minimum une validation serveur créneau/
  capacité (absente aujourd'hui même pour le flux interne), une
  identification fiable du "partenaire" appelant, et une décision sur la
  provenance de l'identité du visiteur final.
- **Dépendances** : dépend de décisions produit non techniques
  (l'entreprise partenaire a-t-elle besoin d'un compte Yelen "institution"
  préexistant ? le visiteur final doit-il avoir un compte Yelen ?).

## Niveau 4 — API / Webhooks

- **Existant** : rien de spécifique — les briques génériques
  (Supabase, Next.js API routes) sont là, mais aucune fondation de
  produit API (clés, quotas, scopes, documentation, versionnement).
- **Manquant** : tout — système de clés API, table de partenaires/scopes,
  rate limiting dédié par clé (le rate limiting actuel est par IP
  seulement, `lib/edgeSecurity.ts`, pas par identité de partenaire),
  système de webhooks (aucune infrastructure d'événements sortants
  n'existe — `notificationEngine.ts` écrit uniquement en base + push
  interne, jamais un appel HTTP sortant vers un tiers), documentation
  publique, gestion de versions d'API.
- **Réutilisable** : toute la logique métier des Niveaux 1-3 une fois
  bâtie, servirait de socle.
- **Risques** : élevés — plus grande surface d'attaque (clés API à
  distribuer/révoquer/faire tourner en toute sécurité, webhooks à signer
  pour éviter la falsification côté récepteur, `SUPABASE_SERVICE_ROLE_KEY`
  ne doit jamais transiter vers ce système).
- **Complexité** : élevée à très élevée — c'est un produit à part entière
  (gestion de partenaires, facturation éventuelle, support, SLA).
- **Sécurité** : dépend entièrement des décisions d'architecture des
  Niveaux 2-3 déjà posées correctement ; un Niveau 4 construit sans eux
  hériterait de toutes leurs lacunes non résolues (capacité, identité du
  visiteur, `frame-ancestors`).
- **Dépendances** : librairie de signature de webhooks (ex. HMAC standard
  — déjà un savoir-faire présent dans le code, `qr/generate` utilise déjà
  `crypto.createHmac`), système de gestion de clés API (aucune
  dépendance existante trouvée pour ça).

---

# Questions encore ouvertes

Le code actuel ne permet de répondre à aucune des questions suivantes —
ce sont des décisions produit/architecture, pas des faits vérifiables
dans le repo :

1. Un visiteur qui réserve depuis le site externe d'une entreprise
   doit-il obtenir un compte Yelen citoyen complet (téléphone + OTP), ou
   Yelen doit-il accepter une réservation "invitée" sans compte citoyen
   préalable ? Cette décision détermine si le Niveau 3/4 est même
   possible avec l'architecture d'authentification actuelle
   (aujourd'hui : `rdv_citoyen_insert` exige `auth.uid()` réel).
2. Une institution doit-elle explicitement **consentir/activer**
   l'intégration externe (Niveau 2+) par institution, ou est-ce un
   réglage global de plateforme ? Rien dans le schéma `institutions`
   n'anticipe ce choix aujourd'hui.
3. Si Niveau 2 (embed), sur quel(s) domaine(s) une institution a-t-elle
   le droit d'embarquer son propre widget ? Faut-il une liste
   d'origines autorisées par institution (nouvelle donnée), ou un
   domaine générique unique ?
4. Le format texte libre de `disponibilites` doit-il être conservé en
   interne et traduit à la volée pour toute exposition externe, ou
   faut-il migrer vers un format structuré (impact sur
   `DisponibilitesTab.tsx`, `lib/disponibilites.ts`, et toutes les
   lectures existantes) ?
5. La lacune de validation serveur créneau/capacité (Contraintes
   actuelles, point 2-3) doit-elle être corrigée **avant** toute
   exposition externe (recommandé) ou en parallèle ?
6. Quel modèle de facturation, s'il y en a un, pour un Niveau 4 (API) ?
   Aucune trace de facturation/abonnement lié à une intégration
   n'existe dans le schéma actuel (`plan_abonnement` existe pour les
   institutions elles-mêmes, sans lien avec une API).
7. Faut-il traiter l'exposition `mot_de_passe_hash` via `select("*")`
   comme un prérequis bloquant avant toute Phase 1, indépendamment de
   cette mission ?
8. Quel type d'auteur `rdv_events`/`journal_activite` pour une
   réservation venant d'une intégration externe — un nouveau type
   dédié, ou traité comme "citoyen" standard ?

# Décisions à prendre ultérieurement

Aucune décision d'implémentation n'est prise dans ce document. Les choix
suivants devront être tranchés avant d'écrire la moindre ligne de code
de Phase 1, dans cet ordre logique (chaque choix conditionne le
suivant) :

1. Modèle d'identité du visiteur externe (question ouverte 1).
2. Portée du Niveau 1 (lien direct documenté vers `/rdv/[id]` — risque
   et complexité faibles, activable rapidement une fois la décision 1
   prise, indépendamment des niveaux suivants).
3. Nécessité et portée du Niveau 2 (embed) — dépend d'une vraie demande
   business confirmée, pas seulement de la faisabilité technique.
4. Modèle de consentement/activation par institution (question 2/3).
5. Traitement de la lacune de validation serveur créneau/capacité —
   recommandé comme correctif indépendant, avant tout Niveau 3+.
6. Portée du Niveau 4 (API/webhooks) — probablement la dernière étape,
   seulement si une vraie demande de partenaires techniques apparaît.

# Prochaine étape proposée

**Uniquement après validation de cette analyse par Bryan/le CEO** :
clarifier les questions ouvertes 1 et 2 (modèle d'identité du visiteur
externe + modèle de consentement institution), qui conditionnent tout le
reste — sans réponse à ces deux questions, aucun niveau au-delà du
Niveau 1 (lien) n'est concevable avec l'architecture actuelle. Ne pas
commencer d'implémentation avant cette clarification.

**STOP — fin de la Phase 0.** Aucune phase suivante n'est engagée
automatiquement.
