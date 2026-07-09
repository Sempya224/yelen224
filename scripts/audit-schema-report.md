# Audit alignement code ↔ schéma Supabase — Yelen224

Généré le 2026-07-09 par `scripts/audit-supabase-schema.mjs` (analyse statique, aucune modification).
Référence : 14 tables confirmées le 07/07/2026 (CLAUDE.md, /schema) ; colonnes et fonctions
confirmées par SELECT information_schema.columns / pg_proc exécutés par Bryan le 09/07/2026.

## Légende

- ✅ table/colonne présente dans le schéma confirmé
- ❌ **certain** : table hors des 14 tables, colonne absente du schéma exhaustif confirmé en base, ou RPC absente de `pg_proc`

Les 14 tables sont confirmées exhaustivement (colonnes + fonctions) — plus aucun verdict « à confirmer ».

### Limites de l'analyse statique

- Seuls les littéraux de chaîne sont analysés ; les tables/colonnes passées via variables sont signalées « dynamiques », pas validées.
- Les chaînes de requête coupées (`const q = supabase.from('x'); ... q.eq(...)`) ne rattachent que la partie contiguë.
- Les relations imbriquées dont le nom n'est pas une table connue (alias de FK) sont signalées sans validation des colonnes internes.

## Résumé exécutif

- Fichiers scannés : 93 (.ts/.tsx sous app/ et lib/)
- Fichiers utilisant Supabase (from/rpc/storage) : 60
- Appels `.from()` analysés : 210

### ❌ Tables appelées qui N'EXISTENT PAS en base (9)

| Table fantôme | Fichiers |
|---|---|
| `admin_logs` | `app/api/admin/admins/[id]/route.ts`<br>`app/api/admin/admins/route.ts`<br>`app/api/admin/annonces/[id]/route.ts`<br>`app/api/admin/annonces/route.ts`<br>`app/api/admin/auth/login/route.ts`<br>`app/api/admin/auth/logout/route.ts`<br>`app/api/admin/broadcast/route.ts`<br>`app/api/admin/export/route.ts`<br>`app/api/admin/institutions/[id]/avertir/route.ts`<br>`app/api/admin/institutions/[id]/badge/route.ts`<br>`app/api/admin/institutions/[id]/plan/route.ts`<br>`app/api/admin/institutions/[id]/reactiver/route.ts`<br>`app/api/admin/institutions/[id]/refuser/route.ts`<br>`app/api/admin/institutions/[id]/suspendre/route.ts`<br>`app/api/admin/institutions/[id]/valider/route.ts`<br>`app/api/admin/logs/route.ts`<br>`app/api/admin/signalements/[id]/ignorer/route.ts`<br>`app/api/admin/signalements/[id]/resoudre/route.ts` |
| `admin_users` | `app/api/admin/admins/[id]/route.ts`<br>`app/api/admin/admins/route.ts`<br>`app/api/admin/auth/login/route.ts` |
| `institution_members` | `app/institution/router/page.tsx` |
| `institution_otp` | `app/institution/connexion/page.tsx` |
| `institution_sessions` | `app/institution/connexion/page.tsx` |
| `paid_bookings` | `app/dashboard/dashboard-client.tsx`<br>`app/institution/services-payants/page.tsx`<br>`app/institution/valider-rdv/page.tsx`<br>`app/rdv/[id]/page.tsx` |
| `paid_services` | `app/institution/services-payants/page.tsx`<br>`app/rdv/[id]/page.tsx` |
| `paiements` | `app/api/admin/activity/route.ts`<br>`app/api/admin/export/route.ts`<br>`app/api/admin/kpis/route.ts`<br>`app/institution/abonnement/actions.ts` |
| `rdv_events` | `lib/notifications.ts` |

### Colonnes problématiques par table réelle

| Table | Colonne | Verdict | Fichiers |
|---|---|---|---|
| `annonces` | `created_at` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/[id]/page.tsx`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `date_expiration` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/[id]/page.tsx`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `date_publication` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `epingle` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/[id]/page.tsx`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `image_url` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/[id]/page.tsx`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `nb_clics` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `nb_vues` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `regions_cibles` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `statut` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/[id]/page.tsx`<br>`app/institution/annonce/page.tsx` |
| `annonces` | `type` | ❌ n'existe pas | `app/api/admin/annonces/route.ts`<br>`app/institution/[id]/page.tsx`<br>`app/institution/annonce/page.tsx` |
| `avis` | `created_at` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/institution/[id]/page.tsx`<br>`app/institution/statistiques/page.tsx` |
| `institutions` | `avertissements` | ❌ n'existe pas | `app/api/admin/export/route.ts`<br>`app/api/admin/institutions/[id]/avertir/route.ts`<br>`app/api/admin/institutions/route.ts` |
| `institutions` | `category` | ❌ n'existe pas | `app/api/admin/export/route.ts`<br>`app/api/admin/institutions/route.ts`<br>`app/api/admin/kpis/route.ts`<br>`app/api/admin/search/route.ts`<br>`app/avis/page.tsx`<br>`app/carte/page.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/annonce/page.tsx`<br>`app/institution/codeqr/page.tsx`<br>`app/institution/connexion/page.tsx`<br>`app/institution/document/page.tsx`<br>`app/institution/inscription/page.tsx`<br>`app/institution/services-payants/page.tsx`<br>`app/institution/statistiques/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx` |
| `institutions` | `created_at` | ❌ n'existe pas | `app/api/admin/activity/route.ts`<br>`app/api/admin/export/route.ts`<br>`app/api/admin/institutions/route.ts`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/page.tsx` |
| `institutions` | `disponibilites` | ❌ n'existe pas | `app/carte/page.tsx`<br>`app/institution/disponibilites/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx` |
| `institutions` | `document_officiel` | ❌ n'existe pas | `app/api/admin/institutions/route.ts`<br>`app/institution/document/page.tsx` |
| `institutions` | `documents_urls` | ❌ n'existe pas | `app/institution/document/page.tsx` |
| `institutions` | `logo` | ❌ n'existe pas | `app/api/admin/institutions/route.ts`<br>`app/avis/page.tsx`<br>`app/carte/page.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/annonce/page.tsx`<br>`app/institution/codeqr/page.tsx`<br>`app/institution/connexion/page.tsx`<br>`app/institution/services-payants/page.tsx`<br>`app/institution/statistiques/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx`<br>`app/signalement/page.tsx` |
| `institutions` | `moyenne_avis` | ❌ n'existe pas | `app/api/admin/institutions/route.ts`<br>`app/avis/page.tsx`<br>`app/carte/page.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/connexion/page.tsx`<br>`app/institution/inscription/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx` |
| `institutions` | `name` | ❌ n'existe pas | `app/api/admin/activity/route.ts`<br>`app/api/admin/export/route.ts`<br>`app/api/admin/institutions/[id]/avertir/route.ts`<br>`app/api/admin/institutions/[id]/refuser/route.ts`<br>`app/api/admin/institutions/[id]/suspendre/route.ts`<br>`app/api/admin/institutions/[id]/valider/route.ts`<br>`app/api/admin/institutions/route.ts`<br>`app/api/admin/search/route.ts`<br>`app/avis/page.tsx`<br>`app/carte/page.tsx`<br>`app/dashboard/dashboard-client.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/annonce/page.tsx`<br>`app/institution/codeqr/page.tsx`<br>`app/institution/connexion/page.tsx`<br>`app/institution/disponibilites/page.tsx`<br>`app/institution/document/page.tsx`<br>`app/institution/inscription/page.tsx`<br>`app/institution/services-payants/page.tsx`<br>`app/institution/statistiques/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx`<br>`app/signalement/page.tsx`<br>`lib/notifications.ts` |
| `institutions` | `nb_avis` | ❌ n'existe pas | `app/api/admin/institutions/route.ts`<br>`app/avis/page.tsx`<br>`app/carte/page.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/connexion/page.tsx`<br>`app/institution/inscription/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx` |
| `institutions` | `phone` | ❌ n'existe pas | `app/api/admin/export/route.ts`<br>`app/api/admin/institutions/route.ts`<br>`app/carte/page.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/codeqr/page.tsx`<br>`app/institution/connexion/page.tsx`<br>`app/institution/inscription/page.tsx`<br>`app/institution/services-payants/page.tsx`<br>`app/institution/verification/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx` |
| `institutions` | `quartier` | ❌ n'existe pas | `app/api/admin/institutions/route.ts`<br>`app/carte/page.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`app/recherche/page.tsx` |
| `institutions` | `site_web` | ❌ n'existe pas | `app/api/admin/institutions/route.ts`<br>`app/institution/[id]/dashboard/page.tsx` |
| `institutions` | `user_id` | ❌ n'existe pas | `app/api/admin/broadcast/route.ts`<br>`app/institution/router/page.tsx` |
| `institutions` | `website` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/institution/inscription/page.tsx` |
| `institutions` | `whatsapp` | ❌ n'existe pas | `app/api/admin/institutions/route.ts` |
| `messages` | `created_at` | ❌ n'existe pas | `app/mes-rdv/page.tsx` |
| `messages` | `destinataire_id` | ❌ n'existe pas | `app/mes-rdv/page.tsx` |
| `messages` | `rdv_id` | ❌ n'existe pas | `app/mes-rdv/page.tsx` |
| `messages` | `receiver_id` | ❌ n'existe pas | `app/page.tsx` |
| `notifications` | `created_at` | ❌ n'existe pas | `app/page.tsx`<br>`lib/notifications.ts` |
| `notifications` | `destinataire_id` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx`<br>`lib/notifications.ts` |
| `notifications` | `destinataire_type` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx`<br>`lib/notifications.ts` |
| `notifications` | `rdv_id` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx`<br>`lib/notifications.ts` |
| `notifications` | `user_id` | ❌ n'existe pas | `app/page.tsx` |
| `rdv` | `avis_demande` | ❌ n'existe pas | `app/mes-rdv/page.tsx`<br>`lib/notifications.ts` |
| `rdv` | `conversation_terminee` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx` |
| `rdv` | `created_at` | ❌ n'existe pas | `app/api/admin/activity/route.ts`<br>`app/api/admin/export/route.ts`<br>`app/api/admin/kpis/route.ts`<br>`app/api/admin/rdv/route.ts`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/institution/statistiques/page.tsx`<br>`app/mes-rdv/page.tsx` |
| `rdv` | `depasse_notifie` | ❌ n'existe pas | `lib/notifications.ts` |
| `rdv` | `motif_annulation` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`lib/notifications.ts` |
| `rdv` | `motif_report` | ❌ n'existe pas | `app/mes-rdv/page.tsx`<br>`lib/notifications.ts` |
| `rdv` | `nom_autre` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/rdv/[id]/page.tsx` |
| `rdv` | `objet` | ❌ n'existe pas | `app/api/admin/rdv/route.ts`<br>`app/api/institution/rdv-jour/route.ts`<br>`app/api/qr/validate/route.ts`<br>`app/avis/page.tsx`<br>`app/dashboard/dashboard-client.tsx`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/mon-qr/page.tsx`<br>`app/page.tsx`<br>`app/rdv/[id]/page.tsx`<br>`lib/notifications.ts` |
| `rdv` | `phone_autre` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/rdv/[id]/page.tsx` |
| `rdv` | `pour_autre` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/mes-rdv/page.tsx`<br>`app/rdv/[id]/page.tsx` |
| `rdv` | `presence` | ❌ n'existe pas | `app/institution/[id]/dashboard/page.tsx`<br>`app/institution/statistiques/page.tsx`<br>`app/mes-rdv/page.tsx` |
| `rdv` | `presence_confirmed_at` | ❌ n'existe pas | `app/api/qr/validate/route.ts` |
| `rdv` | `presence_status` | ❌ n'existe pas | `app/api/institution/rdv-jour/route.ts`<br>`app/api/qr/generate/route.ts`<br>`app/api/qr/validate/route.ts`<br>`app/institution/[id]/dashboard/page.tsx`<br>`app/mon-qr/page.tsx`<br>`app/page.tsx` |
| `rdv` | `qr_expires_at` | ❌ n'existe pas | `app/api/qr/generate/route.ts`<br>`app/api/qr/validate/route.ts` |
| `rdv` | `qr_token` | ❌ n'existe pas | `app/api/qr/generate/route.ts`<br>`app/api/qr/validate/route.ts`<br>`app/institution/valider-rdv/page.tsx`<br>`app/rdv/[id]/page.tsx` |
| `rdv` | `termine_at` | ❌ n'existe pas | `lib/notifications.ts` |
| `rdv` | `termine_par` | ❌ n'existe pas | `lib/notifications.ts` |
| `rdv` | `user_id` | ❌ n'existe pas | `app/api/admin/export/route.ts` |
| `signalements` | `auteur_id` | ❌ n'existe pas | `app/api/admin/signalements/route.ts` |
| `signalements` | `cible_id` | ❌ n'existe pas | `app/api/admin/signalements/route.ts` |
| `signalements` | `cible_type` | ❌ n'existe pas | `app/api/admin/signalements/route.ts` |
| `signalements` | `created_at` | ❌ n'existe pas | `app/api/admin/activity/route.ts`<br>`app/api/admin/signalements/route.ts`<br>`app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx` |
| `signalements` | `motif` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx` |
| `signalements` | `preuve_url` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx` |
| `signalements` | `priorite` | ❌ n'existe pas | `app/api/admin/signalements/route.ts` |
| `signalements` | `type` | ❌ n'existe pas | `app/api/admin/activity/route.ts`<br>`app/api/admin/signalements/route.ts` |
| `signalements` | `type_cible` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx` |
| `signalements` | `type_signaleur` | ❌ n'existe pas | `app/institution/signalements/page.tsx`<br>`app/signalement/page.tsx` |
| `users` | `created_at` | ❌ n'existe pas | `app/api/admin/activity/route.ts`<br>`app/api/admin/citoyens/route.ts`<br>`app/api/admin/export/route.ts`<br>`app/api/admin/kpis/route.ts` |
| `users` | `institution_id` | ❌ n'existe pas | `app/institution/router/page.tsx` |
| `users` | `name` | ❌ n'existe pas | `app/dashboard/dashboard-client.tsx`<br>`app/inscription/page.tsx`<br>`app/login/page.tsx`<br>`app/page.tsx` |

### Fonctions RPC appelées (2)

| RPC | Verdict | Fichiers |
|---|---|---|
| `generate_institution_otp` | ❌ n'existe pas (pg_proc confirmé le 09/07/2026) | `app/institution/connexion/page.tsx`<br>`app/institution/inscription/page.tsx` |
| `verify_institution_otp` | ❌ n'existe pas (pg_proc confirmé le 09/07/2026) | `app/institution/connexion/page.tsx`<br>`app/institution/inscription/page.tsx` |

## Détail par fichier

### 🔴 `app/api/admin/activity/route.ts`

- **L34** — `.from("rdv")` ✅ existe — méthodes : `select.order.limit`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `statut` ✅ _(select)_
  - `institution_id` ✅ _(select)_
- **L41** — `.from("users")` ✅ existe — méthodes : `select.order.limit`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
- **L48** — `.from("institutions")` ✅ existe — méthodes : `select.order.limit`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
- **L55** — `.from("signalements")` ✅ existe — méthodes : `select.order.limit`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `type` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
- **L62** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.order.limit`
  - `id` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(select, filter)_
  - `montant` — (table inexistante) _(select)_
  - `statut` — (table inexistante) _(select)_

### 🔴 `app/api/admin/admins/[id]/route.ts`

- **L29** — `.from("admin_users")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `update.eq`
  - `id` — (table inexistante) _(filter)_
  - 📝 `.update(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `body`)
- **L35** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_
- **L59** — `.from("admin_users")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `delete.eq`
  - `id` — (table inexistante) _(filter)_
- **L62** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/admins/route.ts`

- **L27** — `.from("admin_users")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.order`
  - `id` — (table inexistante) _(select)_
  - `email` — (table inexistante) _(select)_
  - `nom` — (table inexistante) _(select)_
  - `prenom` — (table inexistante) _(select)_
  - `role` — (table inexistante) _(select)_
  - `is_active` — (table inexistante) _(select)_
  - `last_login` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(select, filter)_
- **L50** — `.from("admin_users")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert.select.single`
  - `email` — (table inexistante) _(insert, select)_
  - `password_hash` — (table inexistante) _(insert)_
  - `nom` — (table inexistante) _(insert, select)_
  - `prenom` — (table inexistante) _(insert, select)_
  - `role` — (table inexistante) _(insert, select)_
  - `is_active` — (table inexistante) _(insert)_
  - `id` — (table inexistante) _(select)_
- **L57** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/annonces/[id]/route.ts`

- **L28** — `.from("annonces")` ✅ existe — méthodes : `update.eq`
  - `id` ✅ _(filter)_
  - 📝 `.update(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `body`)
- **L34** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_
- **L53** — `.from("annonces")` ✅ existe — méthodes : `delete.eq`
  - `id` ✅ _(filter)_
- **L56** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/annonces/route.ts`

- **L31** — `.from("annonces")` ✅ existe — méthodes : `select.order.range`
  - `id` ✅ _(select)_
  - `titre` ✅ _(select)_
  - `contenu` ✅ _(select)_
  - `type` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `date_expiration` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_vues` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_clics` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `epingle` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `image_url` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `regions_cibles` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `date_publication` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L53** — `.from("annonces")` ✅ existe — méthodes : `insert.select.single`
  - `titre` ✅ _(insert)_
  - `contenu` ✅ _(insert)_
  - `type` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `statut` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `date_expiration` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `epingle` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `institution_id` ✅ _(insert)_
  - `date_publication` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
- **L69** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/auth/login/route.ts`

- **L68** — `.from("admin_users")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.single`
  - `id` — (table inexistante) _(select)_
  - `email` — (table inexistante) _(select, filter)_
  - `password_hash` — (table inexistante) _(select)_
  - `role` — (table inexistante) _(select)_
  - `nom` — (table inexistante) _(select)_
  - `is_active` — (table inexistante) _(select)_
- **L108** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_
- **L116** — `.from("admin_users")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `update.eq`
  - `last_login` — (table inexistante) _(update)_
  - `id` — (table inexistante) _(filter)_

### 🔴 `app/api/admin/auth/logout/route.ts`

- **L25** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/broadcast/route.ts`

- **L49** — `.from("users")` ✅ existe — méthodes : `select`
  - `id` ✅ _(select)_
- **L54** — `.from("institutions")` ✅ existe — méthodes : `select.eq`
  - `user_id` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(filter)_
- **L80** — `.from("notifications")` ✅ existe — méthodes : `insert`
  - 📝 `.insert(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `batch`)
- **L84** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/citoyens/route.ts`

- **L32** — `.from("users")` ✅ existe — méthodes : `select.order.range`
  - `id` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_

### 🔴 `app/api/admin/export/route.ts`

- **L56** — `.from("users")` ✅ existe — méthodes : `select.order`
  - `id` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
- **L72** — `.from("institutions")` ✅ existe — méthodes : `select.order`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `email` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `plan` ✅ _(select)_
  - `badge_verifie` ✅ _(select)_
  - `avertissements` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
- **L94** — `.from("rdv")` ✅ existe — méthodes : `select.order`
  - `id` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `date_rdv` ✅ _(select)_
  - `heure_rdv` ✅ _(select)_
  - `institution_id` ✅ _(select)_
  - `user_id` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L112** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.order`
  - `id` — (table inexistante) _(select)_
  - `montant` — (table inexistante) _(select)_
  - `statut` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(select, filter)_
  - `institution_id` — (table inexistante) _(select)_
  - `user_id` — (table inexistante) _(select)_
- **L132** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/avertir/route.ts`

- **L29** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `avertissements` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L36** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `avertissements` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L42** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/badge/route.ts`

- **L28** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `badge_verifie` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L34** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/plan/route.ts`

- **L32** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `plan` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L38** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/reactiver/route.ts`

- **L27** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L33** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/refuser/route.ts`

- **L41** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L48** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L53** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/suspendre/route.ts`

- **L32** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L39** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L44** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/[id]/valider/route.ts`

- **L32** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L39** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L44** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_
  - `details` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/institutions/route.ts`

- **L33** — `.from("institutions")` ✅ existe — méthodes : `select.order.range`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `email` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `avertissements` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `plan` ✅ _(select)_
  - `document_officiel` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `description` ✅ _(select)_
  - `whatsapp` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `site_web` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `adresse` ✅ _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `quartier` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_

### 🔴 `app/api/admin/kpis/route.ts`

- **L47** — `.from("institutions")` ✅ existe — méthodes : `select`
  - `id` ✅ _(select)_
- **L48** — `.from("institutions")` ✅ existe — méthodes : `select.eq`
  - `id` ✅ _(select)_
  - `statut` ✅ _(filter)_
- **L49** — `.from("institutions")` ✅ existe — méthodes : `select.eq`
  - `id` ✅ _(select)_
  - `statut` ✅ _(filter)_
- **L50** — `.from("institutions")` ✅ existe — méthodes : `select.eq`
  - `id` ✅ _(select)_
  - `statut` ✅ _(filter)_
- **L52** — `.from("users")` ✅ existe — méthodes : `select`
  - `id` ✅ _(select)_
- **L53** — `.from("users")` ✅ existe — méthodes : `select.gte`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L54** — `.from("users")` ✅ existe — méthodes : `select.gte`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L56** — `.from("rdv")` ✅ existe — méthodes : `select`
  - `id` ✅ _(select)_
- **L57** — `.from("rdv")` ✅ existe — méthodes : `select.gte`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L58** — `.from("rdv")` ✅ existe — méthodes : `select.gte`
  - `id` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L60** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select`
  - `montant` — (table inexistante) _(select)_
- **L61** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.gte`
  - `montant` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(filter)_
- **L62** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.gte`
  - `montant` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(filter)_
- **L64** — `.from("signalements")` ✅ existe — méthodes : `select.eq`
  - `id` ✅ _(select)_
  - `statut` ✅ _(filter)_
- **L65** — `.from("avis")` ✅ existe — méthodes : `select`
  - `id` ✅ _(select)_
  - `note` ✅ _(select)_
- **L66** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq`
  - `id` — (table inexistante) _(select)_
  - `statut` — (table inexistante) _(filter)_
- **L68** — `.from("rdv")` ✅ existe — méthodes : `select.gte`
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
- **L69** — `.from("users")` ✅ existe — méthodes : `select.gte`
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
- **L70** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.gte`
  - `montant` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(select, filter)_
- **L71** — `.from("institutions")` ✅ existe — méthodes : `select.eq`
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(filter)_

### 🔴 `app/api/admin/logs/route.ts`

- **L31** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.order.range`
  - `id` — (table inexistante) _(select)_
  - `action` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(select, filter)_
  - `admin_id` — (table inexistante) _(select)_
  - `cible_table` — (table inexistante) _(select)_
  - `cible_id` — (table inexistante) _(select)_
  - `details` — (table inexistante) _(select)_

### 🔴 `app/api/admin/rdv/route.ts`

- **L32** — `.from("rdv")` ✅ existe — méthodes : `select.order.range`
  - `id` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `date_rdv` ✅ _(select)_
  - `heure_rdv` ✅ _(select)_
  - `institution_id` ✅ _(select)_
  - `citoyen_id` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_

### 🔴 `app/api/admin/search/route.ts`

- **L36** — `.from("institutions")` ✅ existe — méthodes : `select.ilike.limit`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
- **L42** — `.from("users")` ✅ existe — méthodes : `select.or.limit`
  - `id` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_

### 🔴 `app/api/admin/signalements/[id]/ignorer/route.ts`

- **L32** — `.from("signalements")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L38** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/signalements/[id]/resoudre/route.ts`

- **L32** — `.from("signalements")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L38** — `.from("admin_logs")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `admin_id` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `cible_table` — (table inexistante) _(insert)_
  - `cible_id` — (table inexistante) _(insert)_

### 🔴 `app/api/admin/signalements/route.ts`

- **L33** — `.from("signalements")` ✅ existe — méthodes : `select.order.range`
  - `id` ✅ _(select)_
  - `type` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `description` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `priorite` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `cible_type` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `cible_id` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `auteur_id` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_

### 🔴 `app/api/institution/rdv-jour/route.ts`

- **L9** — `.from("rdv")` ✅ existe — méthodes : `select.eq.eq.order`
  - `id` ✅ _(select)_
  - `heure_rdv` ✅ _(select, filter)_
  - `statut` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `citoyen_id` ✅ _(select)_
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(filter)_
  - `date_rdv` ✅ _(filter)_
- **L18** — `.from("users")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `prenom` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `phone` ✅ _(select)_

### 🔴 `app/api/qr/generate/route.ts`

- **L18** — `.from("rdv")` ✅ existe — méthodes : `select.eq.eq.single`
  - `id` ✅ _(select, filter)_
  - `date_rdv` ✅ _(select)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(select)_
  - `citoyen_id` ✅ _(select, filter)_
  - `qr_token` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `qr_expires_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L54** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `qr_token` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `qr_expires_at` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_

### 🔴 `app/api/qr/validate/route.ts`

- **L39** — `.from("rdv")` ✅ existe — méthodes : `select.eq.single`
  - relation `users` ✅ (table connue)
  - `id` ✅ _(select, filter)_
  - `date_rdv` ✅ _(select)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(select)_
  - `citoyen_id` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `qr_token` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `qr_expires_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `users.nom` ✅ _(select)_
  - `users.prenom` ✅ _(select)_
  - `users.phone` ✅ _(select)_
- **L103** — `.from("rdv")` ✅ existe — méthodes : `select.eq.eq.single`
  - `id` ✅ _(select, filter)_
  - `institution_id` ✅ _(select, filter)_
- **L114** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `presence_confirmed_at` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_

### 🔴 `app/avis/page.tsx`

- **L53** — `.from("rdv")` ✅ existe — méthodes : `select.eq.single`
  - `id` ✅ _(select, filter)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `date_rdv` ✅ _(select)_
  - `heure_rdv` ✅ _(select)_
  - `institution_id` ✅ _(select)_
  - `citoyen_id` ✅ _(select)_
  - `statut` ✅ _(select)_
- **L71** — `.from("avis")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `rdv_id` ✅ _(filter)_
- **L83** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L116** — `.from("avis")` ✅ existe — méthodes : `insert`
  - `citoyen_id` ✅ _(insert)_
  - `institution_id` ✅ _(insert)_
  - `rdv_id` ✅ _(insert)_
  - `note` ✅ _(insert)_
  - `commentaire` ✅ _(insert)_
- **L128** — `.from("avis")` ✅ existe — méthodes : `select.eq`
  - `note` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
- **L135** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_

### 🔴 `app/carte/page.tsx`

- **L31** — `.from("institutions")` ✅ existe — méthodes : `select.not.then`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `quartier` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `adresse` ✅ _(select)_
  - `latitude` ✅ _(select, filter)_
  - `longitude` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `disponibilites` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_

### 🔴 `app/dashboard/dashboard-client.tsx`

- **L173** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `prenom` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone` ✅ _(select)_
  - `email` ✅ _(select)_
  - `id` ✅ _(filter)_
- **L190** — `.from("rdv")` ✅ existe — méthodes : `select.eq.order.limit`
  - `id` ✅ _(select)_
  - `date_rdv` ✅ _(select, filter)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(select)_
  - `citoyen_id` ✅ _(filter)_
- **L200** — `.from("institutions")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L208** — `.from("rdv")` ✅ existe — méthodes : `select.eq.eq`
  - `citoyen_id` ✅ _(filter)_
  - `statut` ✅ _(filter)_
- **L217** — `.from("paid_bookings")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.order.limit`
  - relation `paid_services` ⚠️ (pas une table connue — alias FK ?)
  - relation `institutions` ✅ (table connue)
  - `id` — (table inexistante) _(select)_
  - `confirmation_code` — (table inexistante) _(select)_
  - `statut` — (table inexistante) _(select)_
  - `date_rdv` — (table inexistante) _(select)_
  - `heure_rdv` — (table inexistante) _(select)_
  - `created_at` — (table inexistante) _(select, filter)_
  - `institutions.name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `citoyen_id` — (table inexistante) _(filter)_
  - 📝 relation imbriquée `paid_services(nom,prix)` : `paid_services` n'est pas un nom de table connu (peut être un alias de FK — colonnes internes non vérifiées)

### 🟢 `app/inscription/actions.ts`

- **L28** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `phone` ✅ _(filter)_
- **L43** — `.from("users")` ✅ existe — méthodes : `insert.select.single`
  - `phone` ✅ _(insert)_
  - `id` ✅ _(select)_

### 🔴 `app/inscription/page.tsx`

- **L123** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `phone` ✅ _(filter)_
- **L154** — `.from("users")` ✅ existe — méthodes : `insert.select.single`
  - `phone` ✅ _(insert)_
  - `prenom` ✅ _(insert)_
  - `nom` ✅ _(insert)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `id` ✅ _(select)_
  - 📝 `.insert(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (spread `...(ville ? { ville } : {})`)

### 🔴 `app/institution/[id]/dashboard/page.tsx`

- **L1234** — `.from("rdv")` ✅ existe — méthodes : `update.eq.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
  - `institution_id` ✅ _(filter)_
- **L1246** — `.from("rdv")` ✅ existe — méthodes : `update.eq.eq`
  - `statut` ✅ _(update)_
  - `motif_annulation` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
  - `institution_id` ✅ _(filter)_
- **L1258** — `.from("rdv")` ✅ existe — méthodes : `update.eq.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
  - `institution_id` ✅ _(filter)_
- **L1268** — `.from("rdv")` ✅ existe — méthodes : `update.eq.eq`
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
  - `institution_id` ✅ _(filter)_
- **L1291** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `description` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `email` ✅ _(select)_
  - `website` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `site_web` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
  - `plan` ✅ _(select)_
  - `adresse` ✅ _(select)_
  - `quartier` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L1299** — `.from("rdv")` ✅ existe — méthodes : `select.eq.order.limit`
  - `id` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `date_rdv` ✅ _(select)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `citoyen_id` ✅ _(select)_
  - `pour_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nom_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `presence` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `conversation_terminee` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `motif_annulation` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `institution_id` ✅ _(filter)_
- **L1310** — `.from("users")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
- **L1368** — `.from("avis")` ✅ existe — méthodes : `select.eq.order.limit`
  - `id` ✅ _(select)_
  - `note` ✅ _(select)_
  - `commentaire` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
- **L1378** — `.from("users")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
- **L1386** — `.from("rdv")` ✅ existe — méthodes : `select.eq.in`
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
  - `statut` ✅ _(filter)_
- **L1506** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
  - `id` ✅ _(filter)_

### 🔴 `app/institution/[id]/page.tsx`

- **L209** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(filter)_
- **L233** — `.from("annonces")` ✅ existe — méthodes : `select.eq.eq.order.order.limit`
  - `id` ✅ _(select)_
  - `titre` ✅ _(select)_
  - `contenu` ✅ _(select)_
  - `type` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `epingle` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `image_url` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `date_expiration` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(filter)_
  - `statut` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L241** — `.from("avis")` ✅ existe — méthodes : `select.eq.order.limit`
  - `id` ✅ _(select)_
  - `note` ✅ _(select)_
  - `commentaire` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
- **L251** — `.from("users")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
- **L259** — `.from("rdv")` ✅ existe — méthodes : `select.eq.in`
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
  - `statut` ✅ _(filter)_

### 🔴 `app/institution/abonnement/actions.ts`

- **L12** — `.from("paiements")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `statut` — (table inexistante) _(insert)_
  - `methode` — (table inexistante) _(insert)_
  - `reference` — (table inexistante) _(insert)_

### 🔴 `app/institution/annonce/page.tsx`

- **L135** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `plan` ✅ _(select)_
  - `id` ✅ _(filter)_
- **L136** — `.from("annonces")` ✅ existe — méthodes : `select.eq.order.order`
  - `institution_id` ✅ _(filter)_
  - `epingle` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L173** — `.from("annonces")` ✅ existe — méthodes : `insert`
  - `institution_id` ✅ _(insert)_
  - `titre` ✅ _(insert)_
  - `contenu` ✅ _(insert)_
  - `type` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `statut` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `date_expiration` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `date_publication` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `image_url` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `epingle` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `regions_cibles` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `nb_vues` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `nb_clics` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
- **L193** — `.from("annonces")` ✅ existe — méthodes : `update.eq`
  - `epingle` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L200** — `.from("annonces")` ✅ existe — méthodes : `update.eq`
  - `statut` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L205** — `.from("annonces")` ✅ existe — méthodes : `delete.eq`
  - `id` ✅ _(filter)_
- **L261** — `.from("annonces")` ✅ existe — méthodes : `update.eq`
  - `id` ✅ _(filter)_
  - 📝 `.update(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `payload`)
- **L263** — `.from("annonces")` ✅ existe — méthodes : `insert`
  - `nb_vues` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `nb_clics` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - 📝 `.insert(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (spread `...payload`)
- **L233** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)
- **L235** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)

### 🔴 `app/institution/codeqr/page.tsx`

- **L144** — `.from("institutions")` ✅ existe — méthodes : `select.order`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `email` ✅ _(select)_
  - `adresse` ✅ _(select)_
  - `ville` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `badge_verifie` ✅ _(select)_

### 🔴 `app/institution/connexion/page.tsx`

- **L120** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
- **L156** — `.from("institution_otp")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert.maybeSingle`
  - `phone` — (table inexistante) _(insert)_
  - `code` — (table inexistante) _(insert)_
  - `expires_at` — (table inexistante) _(insert)_
- **L212** — `.from("institution_otp")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.eq.gt.order.limit.maybeSingle`
  - `id` — (table inexistante) _(select)_
  - `code` — (table inexistante) _(select, filter)_
  - `expires_at` — (table inexistante) _(select, filter)_
  - `phone` — (table inexistante) _(filter)_
- **L256** — `.from("institution_otp")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `delete.eq`
  - `id` — (table inexistante) _(filter)_
- **L273** — `.from("institution_sessions")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert.maybeSingle`
  - `institution_id` — (table inexistante) _(insert)_
  - `phone` — (table inexistante) _(insert)_
  - `user_agent` — (table inexistante) _(insert)_
  - `is_active` — (table inexistante) _(insert)_
- **L172** — `.rpc("generate_institution_otp")` ❌ **N'EXISTE PAS** (pg_proc confirmé le 09/07/2026) — params : `p_phone`
- **L224** — `.rpc("verify_institution_otp")` ❌ **N'EXISTE PAS** (pg_proc confirmé le 09/07/2026) — params : `p_phone, p_code`

### 🔴 `app/institution/disponibilites/page.tsx`

- **L117** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle.then`
  - `id` ✅ _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `disponibilites` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L149** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `disponibilites` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_

### 🔴 `app/institution/document/page.tsx`

- **L1096** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L1196** — `.from("institutions")` ✅ existe — méthodes : `update.eq`
  - `document_officiel` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `documents_urls` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `statut` ✅ _(update)_
  - `id` ✅ _(filter)_
- **L1174** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)
- **L1177** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)
- **L1187** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)
- **L1190** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)

### 🔴 `app/institution/inscription/page.tsx`

- **L103** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L203** — `.from("institutions")` ✅ existe — méthodes : `insert.select.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `ville` ✅ _(insert)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `email` ✅ _(insert)_
  - `website` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `description` ✅ _(insert)_
  - `badge_verifie` ✅ _(insert)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `id` ✅ _(select)_
- **L128** — `.rpc("generate_institution_otp")` ❌ **N'EXISTE PAS** (pg_proc confirmé le 09/07/2026) — params : `p_phone`
- **L166** — `.rpc("verify_institution_otp")` ❌ **N'EXISTE PAS** (pg_proc confirmé le 09/07/2026) — params : `p_phone, p_code`

### 🔴 `app/institution/profil/page.tsx`

- **L101** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single.then`
  - `id` ✅ _(filter)_
- **L211** — `.from("institutions")` ✅ existe — méthodes : `update.eq.select`
  - `id` ✅ _(filter, select)_
  - 📝 `.update(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `payload`)
- **L162** — `storage.from("bucket")` (bucket Storage, hors périmètre schéma SQL)
- **L164** — `storage.from("bucket")` (bucket Storage, hors périmètre schéma SQL)

### 🔴 `app/institution/router/page.tsx`

- **L120** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `user_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L132** — `.from("institution_members")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.maybeSingle`
  - `institution_id` — (table inexistante) _(select)_
  - `user_id` — (table inexistante) _(filter)_
- **L144** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `institution_id` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_

### 🔴 `app/institution/services-payants/page.tsx`

- **L440** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
- **L448** — `.from("paid_services")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.order`
  - `institution_id` — (table inexistante) _(filter)_
  - `created_at` — (table inexistante) _(filter)_
- **L459** — `.from("paid_bookings")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.in.order`
  - `service_id` — (table inexistante) _(filter)_
  - `created_at` — (table inexistante) _(filter)_
- **L467** — `.from("users")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
- **L496** — `.from("paid_services")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `institution_id` — (table inexistante) _(insert)_
  - `nom` — (table inexistante) _(insert)_
  - `prix` — (table inexistante) _(insert)_
  - `duree_minutes` — (table inexistante) _(insert)_
  - `description` — (table inexistante) _(insert)_
  - `is_active` — (table inexistante) _(insert)_
- **L514** — `.from("paid_services")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `update.eq`
  - `is_active` — (table inexistante) _(update)_
  - `id` — (table inexistante) _(filter)_
- **L527** — `.from("paid_services")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `delete.eq`
  - `id` — (table inexistante) _(filter)_

### 🔴 `app/institution/signalements/page.tsx`

- **L85** — `.from("rdv")` ✅ existe — méthodes : `select.eq`
  - relation `users` ✅ (table connue)
  - `citoyen_id` ✅ _(select)_
  - `users.id` ✅ _(select)_
  - `users.nom` ✅ _(select)_
  - `users.prenom` ✅ _(select)_
  - `users.phone` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
- **L103** — `.from("signalements")` ✅ existe — méthodes : `select.eq.eq.order`
  - `id` ✅ _(select)_
  - `motif` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `description` ✅ _(select)_
  - `preuve_url` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(filter)_
  - `type_signaleur` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L112** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `nom` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `phone` ✅ _(select)_
  - `id` ✅ _(filter)_
- **L143** — `.from("signalements")` ✅ existe — méthodes : `insert`
  - `institution_id` ✅ _(insert)_
  - `citoyen_id` ✅ _(insert)_
  - `type_signaleur` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `type_cible` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `motif` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `description` ✅ _(insert)_
  - `preuve_url` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `rdv_id` ✅ _(insert)_
  - `statut` ✅ _(insert)_
- **L157** — `.from("notifications")` ✅ existe — méthodes : `insert`
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `destinataire_type` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `rdv_id` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `type` ✅ _(insert)_
  - `titre` ✅ _(insert)_
  - `message` ✅ _(insert)_
- **L136** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)
- **L138** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)

### 🔴 `app/institution/statistiques/page.tsx`

- **L48** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `id` ✅ _(filter)_
- **L64** — `.from("rdv")` ✅ existe — méthodes : `select.eq.gte`
  - `id` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `presence` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `institution_id` ✅ _(filter)_
- **L65** — `.from("avis")` ✅ existe — méthodes : `select.eq.gte`
  - `id` ✅ _(select)_
  - `note` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `institution_id` ✅ _(filter)_

### 🔴 `app/institution/valider-rdv/page.tsx`

- **L182** — `.from("paid_bookings")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.eq.neq.order`
  - relation `paid_services` ⚠️ (pas une table connue — alias FK ?)
  - relation `users` ✅ (table connue)
  - `id` — (table inexistante) _(select)_
  - `confirmation_code` — (table inexistante) _(select)_
  - `statut` — (table inexistante) _(select, filter)_
  - `date_rdv` — (table inexistante) _(select, filter)_
  - `heure_rdv` — (table inexistante) _(select)_
  - `users.prenom` ✅ _(select)_
  - `users.nom` ✅ _(select)_
  - `institution_id` — (table inexistante) _(filter)_
  - `created_at` — (table inexistante) _(filter)_
  - 📝 relation imbriquée `paid_services(nom,prix)` : `paid_services` n'est pas un nom de table connu (peut être un alias de FK — colonnes internes non vérifiées)
- **L271** — `.from("paid_bookings")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.eq.maybeSingle`
  - relation `paid_services` ⚠️ (pas une table connue — alias FK ?)
  - relation `users` ✅ (table connue)
  - `id` — (table inexistante) _(select)_
  - `confirmation_code` — (table inexistante) _(select, filter)_
  - `statut` — (table inexistante) _(select)_
  - `date_rdv` — (table inexistante) _(select)_
  - `heure_rdv` — (table inexistante) _(select)_
  - `users.prenom` ✅ _(select)_
  - `users.nom` ✅ _(select)_
  - `users.phone` ✅ _(select)_
  - `institution_id` — (table inexistante) _(filter)_
  - 📝 relation imbriquée `paid_services(nom,prix,duree_minutes)` : `paid_services` n'est pas un nom de table connu (peut être un alias de FK — colonnes internes non vérifiées)
- **L325** — `.from("paid_bookings")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `update.eq`
  - `id` — (table inexistante) _(filter)_
  - 📝 `.update(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `updateData`)
- **L344** — `.from("rdv")` ✅ existe — méthodes : `update.eq.eq`
  - `statut` ✅ _(update)_
  - `qr_token` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `institution_id` ✅ _(filter)_

### 🔴 `app/institution/verification/page.tsx`

- **L87** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L101** — `.from("institutions")` ✅ existe — méthodes : `insert.select.single`
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `statut` ✅ _(insert)_
  - `id` ✅ _(select)_

### 🔴 `app/login/page.tsx`

- **L162** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select)_
  - `prenom` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone` ✅ _(filter)_
- **L213** — `.from("users")` ✅ existe — méthodes : `select.eq.single`
  - `id` ✅ _(select)_
  - `phone` ✅ _(filter)_

### 🔴 `app/mes-rdv/page.tsx`

- **L159** — `.from("rdv")` ✅ existe — méthodes : `select.eq.order`
  - relation `institutions` ✅ (table connue)
  - `id` ✅ _(select)_
  - `date_rdv` ✅ _(select, filter)_
  - `heure_rdv` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
  - `pour_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nom_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `presence` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `motif_annulation` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `motif_report` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `avis_demande` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institutions.id` ✅ _(select)_
  - `institutions.name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institutions.category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institutions.logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institutions.ville` ✅ _(select)_
  - `institutions.badge_verifie` ✅ _(select)_
  - `citoyen_id` ✅ _(filter)_
- **L175** — `.from("messages")` ✅ existe — méthodes : `select.eq.eq.eq`
  - `id` ✅ _(select)_
  - `rdv_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `lu` ✅ _(filter)_
- **L181** — `.from("messages")` ✅ existe — méthodes : `select.eq.order.limit.maybeSingle`
  - `contenu` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `rdv_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L295** — `.from("avis")` ✅ existe — méthodes : `insert`
  - `institution_id` ✅ _(insert)_
  - `citoyen_id` ✅ _(insert)_
  - `rdv_id` ✅ _(insert)_
  - `note` ✅ _(insert)_
  - `commentaire` ✅ _(insert)_
- **L302** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `avis_demande` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_

### 🔴 `app/mon-qr/page.tsx`

- **L27** — `.from("rdv")` ✅ existe — méthodes : `select.eq.neq.gte.order.limit.then`
  - `id` ✅ _(select)_
  - `date_rdv` ✅ _(select, filter)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select, filter)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(select)_
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `citoyen_id` ✅ _(filter)_

### 🔴 `app/page.tsx`

- **L828** — `.from("notifications")` ✅ existe — méthodes : `select.eq.order.limit`
  - `user_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L973** — `.from("institutions")` ✅ existe — méthodes : `select`
- **L974** — `.from("users")` ✅ existe — méthodes : `select`
- **L981** — `.from("institutions")` ✅ existe — méthodes : `select.not.order.limit`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `quartier` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `adresse` ✅ _(select)_
  - `latitude` ✅ _(select)_
  - `longitude` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `disponibilites` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L989** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `prenom` ✅ _(select)_
  - `nom` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `phone` ✅ _(select)_
  - `id` ✅ _(filter)_
- **L998** — `.from("rdv")` ✅ existe — méthodes : `select.eq.order.limit`
  - `id` ✅ _(select)_
  - `date_rdv` ✅ _(select, filter)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institution_id` ✅ _(select)_
  - `presence_status` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `citoyen_id` ✅ _(filter)_
- **L1004** — `.from("institutions")` ✅ existe — méthodes : `select.in`
  - `id` ✅ _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L1011** — `.from("notifications")` ✅ existe — méthodes : `select.eq.eq`
  - `user_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `lu` ✅ _(filter)_
- **L1015** — `.from("messages")` ✅ existe — méthodes : `select.eq.eq`
  - `receiver_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `lu` ✅ _(filter)_

### 🔴 `app/profil/actions.ts`

- **L34** — `.from("users")` ✅ existe — méthodes : `update.eq`
  - `id` ✅ _(filter)_
  - 📝 `.update(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `updatePayload`)
- **L47** — `.from("users")` ✅ existe — méthodes : `delete.eq`
  - `id` ✅ _(filter)_

### 🟢 `app/profil/profil-client.tsx`

- **L63** — `.from("users")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(filter)_
- **L127** — `storage.from("avatars")` (bucket Storage, hors périmètre schéma SQL)
- **L135** — `storage.from("avatars")` (bucket Storage, hors périmètre schéma SQL)

### 🔴 `app/rdv/[id]/actions.ts`

- **L53** — `.from("rdv")` ✅ existe — méthodes : `insert`
  - 📝 `.insert(...)` : payload partiellement/totalement dynamique — colonnes non analysables statiquement (payload non littéral `row`)

### 🔴 `app/rdv/[id]/page.tsx`

- **L553** — `.from("institutions")` ✅ existe — méthodes : `select.eq.maybeSingle`
  - `id` ✅ _(select, filter)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `quartier` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `adresse` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `description` ✅ _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `disponibilites` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
- **L572** — `.from("paid_services")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `select.eq.eq.order`
  - `id` — (table inexistante) _(select)_
  - `institution_id` — (table inexistante) _(select, filter)_
  - `nom` — (table inexistante) _(select)_
  - `prix` — (table inexistante) _(select)_
  - `duree_minutes` — (table inexistante) _(select)_
  - `description` — (table inexistante) _(select)_
  - `is_active` — (table inexistante) _(select, filter)_
  - `created_at` — (table inexistante) _(filter)_
- **L620** — `.from("paid_bookings")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `service_id` — (table inexistante) _(insert)_
  - `citoyen_id` — (table inexistante) _(insert)_
  - `institution_id` — (table inexistante) _(insert)_
  - `date_rdv` — (table inexistante) _(insert)_
  - `heure_rdv` — (table inexistante) _(insert)_
  - `confirmation_code` — (table inexistante) _(insert)_
  - `statut` — (table inexistante) _(insert)_
- **L630** — `.from("rdv")` ✅ existe — méthodes : `insert`
  - `citoyen_id` ✅ _(insert)_
  - `institution_id` ✅ _(insert)_
  - `date_rdv` ✅ _(insert)_
  - `heure_rdv` ✅ _(insert)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `statut` ✅ _(insert)_
  - `pour_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `nom_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `phone_autre` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `qr_token` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_

### 🔴 `app/recherche/page.tsx`

- **L165** — `.from("institutions")` ✅ existe — méthodes : `select.eq`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `category` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `ville` ✅ _(select)_
  - `quartier` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `moyenne_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `nb_avis` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `badge_verifie` ✅ _(select)_
  - `description` ✅ _(select)_
  - `statut` ✅ _(select, filter)_
  - `adresse` ✅ _(select)_
  - `latitude` ✅ _(select)_
  - `longitude` ✅ _(select)_
  - `phone` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `disponibilites` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_

### 🔴 `app/signalement/page.tsx`

- **L86** — `.from("institutions")` ✅ existe — méthodes : `select.eq.order`
  - `id` ✅ _(select)_
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(filter)_
- **L96** — `.from("signalements")` ✅ existe — méthodes : `select.eq.eq.order`
  - `id` ✅ _(select)_
  - `motif` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `description` ✅ _(select)_
  - `preuve_url` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `statut` ✅ _(select)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `institution_id` ✅ _(select)_
  - `citoyen_id` ✅ _(filter)_
  - `type_signaleur` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L105** — `.from("institutions")` ✅ existe — méthodes : `select.eq.single`
  - `name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `logo` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `id` ✅ _(filter)_
- **L135** — `.from("signalements")` ✅ existe — méthodes : `insert`
  - `citoyen_id` ✅ _(insert)_
  - `institution_id` ✅ _(insert)_
  - `type_signaleur` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `type_cible` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `motif` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `description` ✅ _(insert)_
  - `preuve_url` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `rdv_id` ✅ _(insert)_
  - `statut` ✅ _(insert)_
- **L149** — `.from("notifications")` ✅ existe — méthodes : `insert`
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `destinataire_type` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `rdv_id` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `type` ✅ _(insert)_
  - `titre` ✅ _(insert)_
  - `message` ✅ _(insert)_
- **L128** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)
- **L130** — `storage.from("documents")` (bucket Storage, hors périmètre schéma SQL)

### 🔴 `lib/notifications.ts`

- **L71** — `.from("notifications")` ✅ existe — méthodes : `insert`
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `destinataire_type` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `rdv_id` ❌ n'existe pas (liste de colonnes exhaustive) _(insert)_
  - `type` ✅ _(insert)_
  - `titre` ✅ _(insert)_
  - `message` ✅ _(insert)_
  - `lu` ✅ _(insert)_
- **L95** — `.from("rdv_events")` ❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026) — méthodes : `insert`
  - `rdv_id` — (table inexistante) _(insert)_
  - `auteur_id` — (table inexistante) _(insert)_
  - `auteur_type` — (table inexistante) _(insert)_
  - `action` — (table inexistante) _(insert)_
  - `ancien_statut` — (table inexistante) _(insert)_
  - `nouveau_statut` — (table inexistante) _(insert)_
  - `motif` — (table inexistante) _(insert)_
  - `metadata` — (table inexistante) _(insert)_
- **L267** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `termine_at` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `termine_par` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `avis_demande` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L329** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `statut` ✅ _(update)_
  - `motif_annulation` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L390** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `date_rdv` ✅ _(update)_
  - `heure_rdv` ✅ _(update)_
  - `statut` ✅ _(update)_
  - `motif_report` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L448** — `.from("rdv")` ✅ existe — méthodes : `update.eq`
  - `depasse_notifie` ❌ n'existe pas (liste de colonnes exhaustive) _(update)_
  - `id` ✅ _(filter)_
- **L476** — `.from("rdv")` ✅ existe — méthodes : `select.eq.eq.eq.eq`
  - relation `institutions` ✅ (table connue)
  - relation `users` ✅ (table connue)
  - `id` ✅ _(select)_
  - `date_rdv` ✅ _(select, filter)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select, filter)_
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(select, filter)_
  - `depasse_notifie` ❌ n'existe pas (liste de colonnes exhaustive) _(select, filter)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `motif_annulation` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `motif_report` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institutions.name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `users.prenom` ✅ _(select)_
  - `users.nom` ✅ _(select)_
  - `users.phone` ✅ _(select)_
- **L520** — `.from("rdv")` ✅ existe — méthodes : `select.eq.eq.in`
  - relation `institutions` ✅ (table connue)
  - relation `users` ✅ (table connue)
  - `id` ✅ _(select)_
  - `date_rdv` ✅ _(select, filter)_
  - `heure_rdv` ✅ _(select)_
  - `statut` ✅ _(select, filter)_
  - `citoyen_id` ✅ _(select)_
  - `institution_id` ✅ _(select)_
  - `objet` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `institutions.name` ❌ n'existe pas (liste de colonnes exhaustive) _(select)_
  - `users.prenom` ✅ _(select)_
  - `users.nom` ✅ _(select)_
  - `users.phone` ✅ _(select)_
  - 📝 `.eq(userType === "citoyen" ? "citoyen_id" : )` : premier argument non littéral
- **L542** — `.from("notifications")` ✅ existe — méthodes : `select.eq.eq`
  - `type` ✅ _(select)_
  - `rdv_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L593** — `.from("notifications")` ✅ existe — méthodes : `select.eq.order.limit`
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `created_at` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L605** — `.from("notifications")` ✅ existe — méthodes : `update.eq.eq`
  - `lu` ✅ _(update, filter)_
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
- **L616** — `.from("notifications")` ✅ existe — méthodes : `select.eq.eq`
  - `id` ✅ _(select)_
  - `destinataire_id` ❌ n'existe pas (liste de colonnes exhaustive) _(filter)_
  - `lu` ✅ _(filter)_

## Statut de la vérification

Schéma 100 % confirmé en base (09/07/2026) : colonnes des 14 tables via
`information_schema.columns`, fonctions via `pg_proc` (seule fonction : trigger
`update_mis_a_jour_le`). Aucune vérification SQL restante pour cet audit.
