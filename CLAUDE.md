═══════════════════════════════════════════════════════════════
YELEN224 — CONTEXTE PROJET COMPLET
Plateforme civique de prise de rendez-vous — République de Guinée
Niveau : Google / Meta / Uber / DoorDash — Zéro amateurisme
═══════════════════════════════════════════════════════════════

⚠️ Ce fichier a été compressé une 3e fois le 12/08/2026 (après 21/07 et
26/07/2026) : ~35 chantiers accumulés depuis la dernière compression
avaient fait grossir le fichier à ~2940 lignes, dont une grande partie
d'historique lot-par-lot pour des chantiers déjà **clos**. Règle
appliquée : chantiers **clos** → état final + pièges à ne pas reproduire
uniquement (le code fait foi pour le détail, l'historique complet reste
dans `git log`) ; chantiers **ouverts** → tout le détail nécessaire pour
reprendre le travail. Les pièges techniques récurrents ont été regroupés
dans `/pieges-techniques-connus` plutôt que répétés à chaque chantier. Si
un détail manque pour un chantier fermé, lire le code directement plutôt
que de supposer.

## IDENTITÉ
Projet    : Yelen224 — prise de RDV en ligne (hôpitaux, mairies, banques, ambassades)
Marché    : République de Guinée
Développeur : Bryan (Balde224/Sempya224), full-stack solo dev
Nom       : "Yelen" = "lumière" en malinké
Repo      : github.com/Sempya224/yelen224, branche main
Chemin local : C:\Users\Balde224\yelen224\

## RÔLES DE TRAVAIL
Bryan       : product owner, seul développeur, exécute tout SQL et
              toutes commandes terminal manuellement
Claude/CC   : propose, diagnostique, écrit le code — n'exécute JAMAIS
              de SQL ou commande terminal directement sans validation explicite

⚠️ **Règle explicite : JAMAIS de `git commit`/`git push` sans ordre
explicite de Bryan pour CE commit précis.** `main` est en CI/CD Netlify
(voir /stack) : un commit non demandé part immédiatement en production.
Une validation donnée pour une tâche (ex. "corrige X") ne vaut pas
autorisation de commit — Bryan commit lui-même quand il est prêt. Ne
jamais committer "pour rendre service" après une modification, même
petite.

⚠️ **Règle explicite : JAMAIS d'outil Agent (sous-agent, y compris ceux
lancés automatiquement par un skill comme `/code-review`) sans demander
et justifier pourquoi le travail ne peut pas être fait directement.**
Chaque sous-agent consomme des tokens de façon significative — Bryan veut
garder le contrôle explicite de ce coût. Le fait qu'un skill lance des
agents par défaut (ex. les 8 angles de `/code-review`) n'est pas en
soi une autorisation : demander avant, ou faire la revue directement
avec Read/Grep/Bash. Violé 2 fois le 30/08/2026 avant d'être formalisé ici.

## /stack — STACK TECHNIQUE
Frontend    : Next.js 16.2.1 (App Router) + TypeScript strict
Backend     : Supabase (PostgreSQL + Auth + Realtime + Storage)
Styling     : Tailwind CSS
Déploiement : Netlify (CI/CD via GitHub)
OS dev      : Windows 11 / PowerShell
Supabase CLI : installée, init + link faits
Docker      : NON disponible sur cette machine (RAM insuffisante) → tout
              audit DB passe par SQL Editor manuel exclusivement

## /supabase — INFRASTRUCTURE
Project ID actuel : pgcabxgrgjgukuagpuhc
URL              : pgcabxgrgjgukuagpuhc.supabase.co
Organisation     : Sempya224
supabase/config.toml : présent
supabase/migrations/ : peuplée progressivement depuis le 07/07/2026,
dernière migration réelle : `20260809000003_document_events.sql`

⚠️ HISTORIQUE RÉEL : Yelen224 n'a JAMAIS fait partie de Sempya224 à l'origine.
Le projet existait sous un compte séparé yelen224@gmail.com, accès perdu
définitivement. Le projet actuel a été recréé par Bryan, tables reconstruites
manuellement — AUCUNE continuité de migrations avec l'ancien compte. Une
conséquence directe : plusieurs éléments (RLS sur 6 tables historiques,
index sur `rdv`) existent réellement en base sans trace dans les
migrations — toujours vérifier en base plutôt que de supposer une absence.

## /auth — DEUX SYSTÈMES D'AUTHENTIFICATION COHABITENT (+ 1 nouveau)
Ne jamais les confondre. Chaque route/fonctionnalité doit clarifier
explicitement lequel elle utilise.

1. CITOYENS : Supabase Auth — public.users lié à auth.users via id (FK ON
   DELETE CASCADE). Login téléphone +224 + OTP (HARDCODÉ en dev, ex:
   123456 — décision assumée de Bryan, PAS une dette à corriger sans
   demande explicite).
2. INSTITUTIONS : email + mot de passe + JWT custom (institutions.mot_de_passe_hash).
3. ADMINS : email + mot de passe bcrypt + JWT signé (ADMIN_JWT_SECRET,
   jamais exposé côté client), source unique `lib/adminAuth.ts` (voir
   /modules-livres).
4. EMPLOYÉS (Clock In Shift, nouveau) : Identifiant + PIN 4 chiffres,
   `employee_credentials` + `lib/employeeAuth.ts`, cookie
   `yelen224_employee_session` (JWT 12h, secret/issuer/audience distincts).

## /schema — SCHÉMA RÉEL (vérifié par SELECT direct, drift documenté au fil de l'eau)

Tables d'origine dans public : admins (⚠️ en réalité **admin_users**),
annonces, avis, disponibilites (⚠️ en réalité colonne jsonb sur
`institutions`), institutions, logs_admin, messages, notifications, rdv,
rdv_alertes, services_payants (⚠️ en réalité **paid_services** +
**paid_bookings**), signalements, users. Nombreuses tables ajoutées
depuis (citoyen_*, institution_*, rdv_events, push_subscriptions, clock-in
Enterprise, signalement_*, document_events, recus, etc.).

### public.users (liée à auth.users, PAS une table autonome d'auth)
id (uuid, FK → auth.users.id ON DELETE CASCADE), nom, prenom, email,
date_naissance, adresse, ville, photo_url, biometrie_activee, onboarding_complete,
created_at, mis_a_jour_le, phone, sexe, nationalite, profession, pin_hash,
cgu_acceptee_le, confidentialite_acceptee_le, centres_interet (text[],
ajouté 25/07/2026).
⚠️ Colonne "cree_le" renommée en "created_at" (drift non documenté sur le
moment, a cassé silencieusement `app/page.tsx`). Toujours vérifier
`information_schema.columns` avant de faire confiance à une note ancienne
de ce fichier si un comportement semble anormal.

### Drift confirmé sur `institutions` (vérifié par grep sur du code
fonctionnel, pas l'audit d'origine qui est faux sur ces colonnes) :
colonne **`name`** (pas `nom`), **`logo`** (pas `logo_url`), **`category`**
(pas `type`), **`phone`** (pas `telephone`). `type (enum)` largement
supplanté par **`secteur`** (CHECK, 8 valeurs : santé, administratif,
financier, juridique, beauté_bien_etre, commerce, artisanat,
services_divers). Autres colonnes : email, mot_de_passe_hash, adresse,
ville, pays, description, statut (enum), plan (enum), badge_verifie,
latitude, longitude (⚠️ toujours jamais écrites par aucun écran produit —
voir /backlog-produit), horaires (jsonb), services (jsonb),
disponibilites (jsonb), slug (URL-friendly, ajouté pour `/clock/{slug}`),
disponibilites_modifie_le/par (traçabilité, ajouté 05/08/2026).

### Autres tables clés
- annonces : institution_id, titre, contenu, **statut** (text), **date_expiration**,
  type, format, media_urls, epingle, image_url, created_at.
- avis : citoyen_id, institution_id, rdv_id, note, commentaire, created_at,
  titre, reponse_institution, reponse_le, masque, brouillon (trigger DB
  bloque toute écriture de reponse_institution hors service_role).
  `institutions.moyenne_avis`/`nb_avis` recalculées automatiquement par
  trigger depuis le 06/08/2026 (voir /modules-livres, avant ça figées à 0).
- rdv : citoyen_id, institution_id, service, date_rdv, heure_rdv, statut
  (enum **incluant `nouveau`**, valeur réelle très utilisée bien que
  absente de `/enums` ci-dessous — jamais revérifié par
  `enum_range(NULL::statut_rdv)`, à faire un jour), motif_refus, qr_code,
  qr_valide, qr_scanne_le, notes, presence, presence_status,
  presence_confirmed_at, duree_minutes, termine_par (⚠️ 2e FK vers
  institutions en plus de institution_id — toujours qualifier les joins
  Supabase : `institutions!rdv_institution_id_fkey(...)`, jamais
  `institutions(...)` non qualifié, sinon erreur PGRST201 invisible à `tsc`).
- messages : expediteur/destinataire citoyen/institution (FKs), contenu,
  lu, **cree_le** (pas created_at — seule `notifications.created_at` a été
  renommée).
- signalements : refondu en case management complet (voir
  /modules-livres) — `numero_public`, `statut` (8 valeurs), `priorite`,
  assignation, résolution structurée, `signalement_events`/`_notes`/`_attachments`.
- notifications : destinataire_id/destinataire_type (pas `user_id`),
  titre, message, type, lu, lien.
- paid_services / paid_bookings : institution_id, nom, prix, is_active
  (services) ; réservations avec statut_paid_booking (dont `rembourse`
  depuis 05/08/2026), montant_paye, methode_paiement, traite_le.
- citoyen_documents : refondu en système documentaire complet (voir
  /modules-livres) — 7 statuts, `document_events` (audit immuable).

## /enums — TYPES ÉNUMÉRÉS CONFIRMÉS
type_admin : super_admin, moderateur, support, admin (⚠️ un seul compte
réel existe en base aujourd'hui : super_admin — les 3 autres sont
possibles mais inutilisés)
type_institution : hopital, mairie, banque, ambassade, autre
statut_institution : en_attente, validee, suspendue, refusee
plan_abonnement : essentiel, pro, entreprise
statut_rdv : en_attente, confirme, refuse, annule, termine, **+ `nouveau`**
  (utilisé en pratique, absent de la dernière vérification SQL connue)
statut_signalement (legacy, remplacé par le nouveau modèle case
  management) : ouvert, en_cours, resolu, ignore — 'nouveau' n'existait
  PAS dans cette version legacy.

## /securite — ÉTAT SÉCURITÉ (baseline, largement fait évoluer depuis)
RLS activé sur toutes les tables. Convention systématique pour toute
nouvelle table sensible : RLS activé, **aucune policy**, accès
exclusivement service_role — jamais de policy RLS pour un rôle qui n'a
pas de session Supabase Auth (institutions, admins, employés). Pour les
tables où le citoyen est propriétaire direct (avis, favoris, rdv
lecture), policy `auth.uid() = citoyen_id` classique.
⚠️ Piège déjà rencontré : une policy `FOR ALL` sans `WITH CHECK` séparé
réutilise le `USING` pour valider les INSERT — corrigé une fois sur
`notifications` (audit 08/08/2026), voir /pieges-techniques-connus.
Grants historiques dangereux (anon+authenticated avec tous privilèges sur
les 14 tables d'origine) — à affiner à chaque nouvelle policy ajoutée,
jamais l'un sans l'autre.

## /protocole — NIVEAU GOOGLE/META/UBER/DOORDASH, NON NÉGOCIABLE

### Zéro improvisation
- Zéro donnée inventée : colonne, enum, type — si non confirmé par lecture
  réelle ou requête SQL exécutée par Bryan, ne jamais l'utiliser
- Zéro hypothèse présentée comme diagnostic
- Zéro fix avant validation explicite : Lire → Diagnostiquer → Attendre
  validation de Bryan → Corriger seulement après accord

### Zéro dette technique
- TypeScript strict — zéro any, zéro @ts-ignore sans justification écrite
- Zéro eslint-disable sans justification, zéro TODO en production
- Zéro mock data (OTP '123456' = dette CONNUE et assumée, pas un pattern
  à reproduire ailleurs)
- 2 fichiers/pages maximum modifiés à la fois — jamais plus
- npx tsc --noEmit → 0 erreur avant de considérer une tâche terminée

### Audit préalable obligatoire — AVANT TOUT CODE
- Avant modification de table → SELECT colonnes réelles
- Avant nouvelle policy RLS → lire les policies existantes
- Avant nouvelle route API → lire les routes similaires existantes
- Avant dépendance ajoutée → vérifier compatibilité Next.js 16/stack
- Avant déploiement → build Netlify réussi + tsc --noEmit à 0 erreur

### /securite-institutionnelle
Données citoyennes réelles liées à des institutions publiques guinéennes.
Zéro donnée exposée avant authentification, RLS partout, jamais de
credentials en dur, jamais de console.log de données sensibles en prod.

### /stack-specifique
Server Components pour vérifications d'auth, Client Components pour
interactivité uniquement. Client Supabase unique dans lib/supabase.ts.
Migrations versionnées dans supabase/migrations/. JWT admin :
ADMIN_JWT_SECRET jamais exposé côté client. **Philosophie systématique du
projet : zéro appel LLM pour tout calcul produit (scores, résumés,
recommandations) — toujours des règles déterministes (seuils/comptages),
voir `lib/reputationScore.ts`, `lib/citoyenSecurite.ts`,
`lib/journalTaxonomie.ts`.** Toute nouvelle brique de ce type doit suivre
la même discipline.

### /honnetete
Le briefing peut être partiellement périmé — revérifier en base avant
d'agir dessus. Chaque bug reproduit, compris, corrigé, puis vérifié.
Chaque livraison testée réellement avant d'être considérée terminée.
Quand un outil (navigateur, lecteur d'écran, Lighthouse) n'est pas
disponible dans l'environnement, le dire explicitement plutôt que de
cocher une case sans preuve.

### /separation-projets
Yelen224 et Youngouser (project ID uaikztzfhregzsnagznw, repo
Sempya224/Youngouser) sont deux bases de code/données/mémoires strictement
séparées. Ne jamais réutiliser un pattern/décision/donnée de l'un pour
l'autre sans demande explicite.

### /rappel-fondamental
Yelen224 traite des rendez-vous réels de citoyens avec des institutions
réelles. Une erreur ici n'est pas cosmétique — la rigueur n'est pas
optionnelle.

## /regles-ux-ui — voir docs/ui/YELEN_UX_RULES.md
Toutes les règles UX/UI (règles non négociables, audit boutons/
confirmations, propositions de composants partagés) ont été déplacées
dans `docs/ui/YELEN_UX_RULES.md` (16/08/2026) pour garder ce fichier
concentré sur le contexte projet — lire ce doc avant tout travail visuel,
institution ou admin. Voir aussi `docs/ui/YELEN_UI_REFERENCE.md`
(dimensions de composants) et `docs/ui/YELEN_UI_DENSITY_AUDIT.md`
(historique des Lots UI).

## /pieges-techniques-connus — gotchas récurrents à ne pas reproduire
Regroupe les leçons techniques transversales trouvées pendant les
chantiers 05/07-09/08/2026, pour éviter de les répéter dans chaque
section de chantier.

- **Embed PostgREST implicite sur une route centrale** : `table_liee(colonnes)`
  dans un `.select()` a cassé tout le chargement du dashboard institution
  une fois (`institution_membres(prenom,nom)` embedé dans
  `/api/institution/profile`, route consommée par tout `page.tsx` au
  chargement → `inst` reste `null` → tous les onglets s'affichent en
  blanc). Toujours préférer une requête séparée explicite sur une route
  centrale, même légèrement moins efficiente.
- **Composant défini à l'intérieur d'un composant parent** perd le focus
  de ses inputs à chaque frappe (React démonte/remonte le sous-arbre) —
  toujours sortir ce genre de composant au niveau module (React Compiler
  `static-components`, capturé au Lot 19 de l'audit consolidation).
- **Polling "Live" et spinner plein écran** : tout `setInterval` de
  rafraîchissement silencieux doit passer un paramètre explicite
  (`silencieux`/`avecSpinner`) pour ne jamais remettre tout l'écran en
  loading toutes les X secondes — bug trouvé 3 fois (Équipe, Clock In
  Shift Employés/Départements/Horaires) avant d'être généralisé.
  `PresencesView`/`SignalementsTab.tsx` ont le pattern correct dès le
  départ, à copier.
- **Triggers d'immuabilité** (pattern partagé par `journal_activite`,
  `attendance_logs`/`attendance_audit_logs`, `signalement_events`,
  `document_events`) : bloquent UPDATE/DELETE même pour service_role/
  superuser SQL Editor. Échappatoire dédiée par table (ex. `SET LOCAL
  app.autoriser_correction_journal = 'on'`) — jamais une correction en
  place, toujours une nouvelle ligne insert-only + trace.
- **Migration qui élargit un `CHECK` ET backfill des lignes** vers les
  nouvelles valeurs : toujours retirer la contrainte avant le backfill,
  jamais l'inverse — `ADD CONSTRAINT` valide toute la table immédiatement,
  y compris les lignes pas encore migrées (`ERROR 23514` rencontré 2 fois
  sur `citoyen_documents.statut` avant correction).
- **`next/image` et URL Storage signée** : `next.config.ts::remotePatterns`
  ne couvre que `/storage/v1/object/public/**` — une URL signée
  (bucket privé, `/storage/v1/object/sign/**`) doit rester en `<img>`
  classique avec commentaire `// IMG-EXCEPTION: reason=... | reviewed=DATE`.
  3 catégories d'exception actées : blob local (`URL.createObjectURL`),
  data URL base64 (QR codes), URL Storage signée courte-vécue.
- **`page.tsx` App Router n'autorise aucun export nommé** au-delà de
  `default`/`metadata`/`generateStaticParams` (`TS2344` sinon) — extraire
  le contenu réel dans un fichier séparé (`XxxInner.tsx`) et garder
  `page.tsx` en simple wrapper.
- **`useSearchParams()` sans `<Suspense>`** casse le build Netlify en
  prerendering (invisible à `tsc --noEmit`, seul un vrai `npm run build`
  le détecte) — toujours wrapper tout écran l'utilisant.
- **`localStorage.getItem/setItem`** peut lever une exception sur mobile
  (Safari navigation privée) — toujours `try { ... } catch {}`.
- **Règle ESLint `no-img-element` sur Windows** : bug connu de la règle
  (comparaison de chemin non cross-platform) compte parfois des faux
  positifs sur des fichiers `next/og` — sans impact réel, ces fichiers
  sont de toute façon exclus par nature (génération serveur).
- **Toute route qui lit une erreur Supabase** doit destructurer `error`
  explicitement avant de tester `!data` — sinon une vraie erreur serveur
  (colonne, connexion) se fait passer pour un 404 générique, invisible au
  diagnostic (rencontré sur `paid-bookings/valider/route.ts`).
- **RLS `FOR ALL` sans `WITH CHECK` séparé** réutilise le `USING` pour
  valider les INSERT — un insert avec un rôle destinataire différent de
  celui visé par la policy est rejeté silencieusement (corrigé sur
  `notifications`).

## /backlog-produit — reste à faire, pas commencé
- **Écran "Mes clients" Lot C** (messagerie directe dans la fiche client,
  dossier documentaire par client, export/purge RGPD côté citoyen) et
  **Lot D** (saisie manuelle d'un client sans RDV préalable) : PAS à
  construire sans validation explicite de Bryan.
- **Point ouvert** : `presence`/`presence_status`/`presence_confirmed_at`
  vs enum `statut_rdv` — lequel pilote réellement les valeurs de
  `MesClientsTab.tsx::stColor()` reste à vérifier par SQL.
- **Carte citoyenne "Aucun établissement localisé"** : aucun écran ne
  permet à une institution de renseigner latitude/longitude (grep
  exhaustif confirmé) — décision produit requise avant tout code : champ
  manuel, géocodage automatique, ou sélecteur sur mini-carte
  (react-leaflet déjà dépendance).
- **`app/avis/page.tsx`** : écran legacy orphelin (aucun lien nulle part
  dans le produit) déjà corrigé côté sécurité (Lot 7 audit consolidation)
  mais **décision en attente de Bryan** : le supprimer plutôt que le
  garder en doublon du flux "Mes avis".
- **`CarteMapHome.tsx::getStatus()`** : le format horaires attendu ne
  correspond pas au format réellement écrit par
  `lib/disponibilites.ts::generateSlots()` — le statut Ouvert/Fermé de
  cette carte ne peut jamais être juste, signalé en commentaire dans le
  code, non corrigé.
- **`notifications.user_id` vs `destinataire_id`/`destinataire_type`** et
  **`plan/route.ts` validant `['gratuit','premium']`** alors que le
  schéma réel utilise `essentiel/pro/entreprise` — drift signalé, non
  corrigé (hors périmètre des chantiers qui les ont trouvés).
- **97 → 0 `<img>` migrées** mais vérification visuelle réelle (desktop/
  mobile, CLS, distorsion) jamais faite — aucun outil navigateur
  disponible dans cet environnement.

## /chantier-design — refonte visuelle dashboard institution (en cours)
Contraintes strictes : jamais toucher `C.gold` (#F5A623, source unique
`theme.ts`) ni `--font-jakarta`. Phase 1 (`.yelen-page`, largeur max
1280px) et Phase 2 (Vue d'ensemble, Communication, Services) terminées.
**Reste à faire** : suite de `CommunicationTab.tsx`/`ServicesTab.tsx`
(respiration/espacement), puis Phase 3 (même logique sur Mes clients,
Équipe, Journal, Espace de travail — chantier séparé à planifier). Note :
Disponibilités, Équipe, Clock In Shift, Valider RDV ont depuis reçu leur
propre refonte "US" sous Mission 01 (voir /modules-livres) — Phase 3 ne
concerne donc plus que les onglets non encore traités par Mission 01.

## /chantier-journal-activite — "Boîte noire" institution (Lots A-G clos, H-I ouverts)
Système d'audit officiel de Yelen (Compte → Journal d'activité) :
`audit_id` séquentiel, immuabilité en base (voir
/pieges-techniques-connus), capture IP/user-agent, recherche universelle
+ filtres serveur + pagination, timeline en cartes avec score de risque
déterministe (`scoreRisque()` dans `journalTaxonomie.ts`), résumé "IA
Yelen" (règles déterministes, zéro LLM), export enrichi 5 formats
(CSV/Excel/JSON/PDF/Rapport signé SHA-256, `pdfkit` à installer par
Bryan : `npm install pdfkit @types/pdfkit`).
**Lots H (géoloc IP→ville, réseau interne, appareil connu) et I
(responsive final) — pas commencés.**

## /chantier-securite-citoyen — Centre de sécurité (Lots A-E clos)
Mirroring du système institution : PIN (`users.pin_hash`), WebAuthn réel
côté serveur (`CITOYEN_WEBAUTHN_JWT_SECRET` — ⚠️ **action requise de
Bryan** : volontairement gardé dans `.env.local` uniquement, pas
Netlify — la biométrie ne fonctionne donc PAS en prod tant que ce secret
n'est pas ajouté), remember-token (cookie `yelen224_citoyen_remember`, 60
jours). Écran `/compte/securite` réel : score de sécurité (règles
déterministes, `lib/citoyenSecurite.ts`), verrouillage rapide, appareils
mémorisés, guide de sécurité.
**Reste à faire (Lot F, pas commencé)** : historique sécurité immuable,
alertes, géolocalisation.

## /chantiers-citoyen-clos — résumé des écrans citoyens terminés
- **Mon Compte** (Lots A-D) : 5 sections + "Actions rapides".
  `/compte/parametres` dédié. `/profil` (ancien) coexiste volontairement
  avec `/compte/informations-personnelles` (nouveau canonique) car
  `app/dashboard/dashboard-client.tsx` (doublon connu) utilise encore
  l'ancien. **Reste à faire** : contenu réel des stubs (Langue,
  Accessibilité, Données mobiles, Stockage, Sons).
- **Confidentialité** : visibilité profil, partage de données (gating
  réel via `citoyen_prefs_partage`), consentements, export JSON, overlay
  suppression compte ("SUPPRIMER" + PIN).
- **Mes avis + Favoris** (Lots A-H) : favoris avec prochain créneau
  (`lib/disponibilites.ts` partagé), délai moyen observé (≥3 mesures
  seulement, jamais un chiffre inventé) ; avis brouillons/vues/utile,
  réponse d'établissement réelle. Masqués/brouillons exclus partout.
- **Activités passées** : agrège compte créé, connexions, cycle de vie
  RDV (`rdv_events`), présence QR, RDV manqué (dérivé), paiements,
  favoris, avis, biométrie, documents en un seul appel
  (`api/citoyen/activites`). Depuis étendu (voir /modules-livres,
  `/votre-activite-reservations`) avec démarches/dépenses.
- **Santé du compte institution** (`lib/reputationScore.ts`) : score
  0-100 sur 30 derniers RDV (note 60%, réponse avis négatifs 15%,
  annulation institution 15% dérivée par élimination via `rdv_events`,
  réclamations résolues 10%). Zéro fermeture automatique — signalement
  système + garde-fou anti-spam 7 jours. Coexiste volontairement avec
  `score_sante` (Accueil, calcul client-side jamais persisté).
- **Connexion institution** : `/institution/connexion` façon Mailchimp,
  palette dérivée du thème (`T[theme]`).
- **Déconnexion** (citoyen + institution) : `LogoutFlow` par côté,
  `AuthSessionWatcher` redirige vers `/login?session_expired=1` sur
  `SIGNED_OUT` (ignoré sur `/institution`/`/admin`, JWT custom).
- **Mon Assistant** (`components/MonAssistant.tsx`) : bandeau tirable
  Accueil, alimenté par `GET /api/citoyen/assistant`, messages
  déterministes (`lib/assistantMessages.ts`, zéro LLM). S'affiche
  toujours (même vide) — design différent du principe "jamais de digest
  forcé" (barre permanente, pas une notification), décision assumée.

## /vision-long-terme-yelenid — architecture identité/confiance/réputation (VISION LONG TERME UNIQUEMENT, aucune action immédiate)

**Positionnement produit à long terme** : Yelen = l'endroit où un citoyen
guinéen construit sa preuve de confiance, ouvrant progressivement l'accès
au crédit, au travail, aux opportunités. "Yelen, la lumière" = rendre
visible ce que quelqu'un a réellement fait.

**Architecture à 4 briques, à séparer complètement** :
1. **YelenID** (identité) 2. **Yelen Trust** (historique comportemental)
3. **Yelen Points** (valeur créée, récompenses) 4. **Yelen Skills** (plus
tard, non priorisé — réputation professionnelle).
Chaîne visée : Identité → Confiance → Réputation → Opportunités → Revenu.

⚠️ **Tension à lever avant toute construction** : `/chantier-strategie-
retention-v2` a explicitement décidé "jamais de score numérique visible
attribué à un citoyen" (risque crédit social, plateforme adossée à
l'État). "Yelen Trust"/"Yelen Points" chiffrés semblent aller à
l'encontre de ce principe si affichés publiquement — à clarifier
explicitement avec Bryan (piste probable : visible au citoyen lui-même et
à qui il choisit de le montrer, jamais un classement public) avant
d'écrire la moindre ligne de code sur ces briques.

**Lien avec le travail actuel** : les chantiers récents (Mes démarches,
menu Engagement) construisent déjà, sans le nommer ainsi, la matière
première de "Yelen Trust" — à garder en tête pour la cohérence des choix
futurs, sans sur-construire par anticipation.

## /chantier-strategie-retention-v2 — pivot stratégique rétention citoyenne (décisions de fond toujours valables)

**Constat** : Yelen perçu comme une appli de rendez-vous seule.
**Décisions actées** : Yelen = espace personnel de confiance, pas une
super app. Jamais de score numérique visible attribué à un citoyen
(badges factuels seulement — ne concerne pas le score réputation
**institution**, métrique business normale, voir tension ci-dessus avec
`/vision-long-terme-yelenid`). Compte famille : reporté, scope non
tranché. Digest proactif : jamais sans contenu réel, silence plutôt que
bruit forcé. Constat central ayant motivé "Mes démarches" : Yelen était
100% consultation, rien ne permettait au citoyen de **créer** quelque
chose qui vit sur plusieurs sessions.

## /chantier-mes-demarches — checklist personnelle + "Suivis" (refondu 26/07/2026)

`app/compte/mes-demarches/` : `citoyen_demarches` + `citoyen_demarche_etapes`
(RLS `auth.uid()=citoyen_id`, écriture directe client). V1 = **zéro
modèle Yelen pré-rempli** (décision explicite, engagerait la
responsabilité éditoriale de Yelen) — juste des intitulés d'exemple
cliquables, séparés Personnel/Professionnel. Auto-complétion à la
dernière étape cochée ; badge **"Clôturée"** (pas "Terminée") si
fermeture manuelle avec étapes non cochées. Toutes les confirmations
passent par une modale stylée maison, aucun `window.confirm`.

**Section "Votre activité"** (en tête d'écran, `GET
/api/citoyen/suivis`, même discipline zéro-LLM que `/api/citoyen/assistant`) :
RDV à venir, avis en attente, documents demandés, démarches en retard/
échéance, dépense la plus élevée du mois (`citoyen_depenses` +
`paid_bookings`), un centre d'intérêt sans aucune démarche (affiché
seulement si le citoyen n'a encore aucune démarche — jamais un "manque"
affirmé sans preuve). Chaque suivi "créer une démarche" réutilise
`ouvrirCreationDepuisExemple()` existant. Pop-up de création en plein
écran (header X + titre).
⚠️ **Reste à faire, décision CEO, chantier séparé pas commencé** : cette
section doit devenir la source qui alimentera l'Accueil avec de vraies
actions.

## /chantier-menu-engagement — menu "conçu pour vous" + écrans finance (inspiré Cash App/MoneyLion)

Logo Yelen de l'onglet Accueil remplacé par un bouton menu ouvrant
`components/CitoyenMenu.tsx` — overlay plein écran, 7 entrées (Vos
centres d'intérêt, Mes dépenses, Calculatrice, Leçons d'argent, Vos
tendances, Parrainage stub, Nouveautés Yelen stub). Header général : icône
casque (support) remplace le "?" partout sauf Accueil.

Tous les écrans financiers utilisent uniquement des données réelles
sourcées (Banque mondiale, BCRG, Crédit Rural de Guinée, BSIC Guinée,
Guinéenews, RFI) — jamais un chiffre inventé, chaque fait cite sa source.
Catégories adaptées à la réalité guinéenne (mobile money, tontines,
microfinance) plutôt que copiées d'un modèle américain.

- `app/menu/lecons-argent/` : 6 leçons + quiz, feedback sourcé.
- `app/menu/calculatrice/` : microcrédit (amortissement dégressif Crédit
  Rural) + épargne (tontine/OMIG Tik Tak/IMF type BSIC), 4 outils "Bientôt
  disponible" plutôt qu'inventés.
- `app/menu/interets/` (`users.centres_interet`) : 14 centres réutilisant
  les 8 `secteur` + 6 catégories Leçons d'argent. Retour bloqué (modale)
  tant qu'il y a des changements non enregistrés.
- `app/menu/depenses/` (`citoyen_depenses`) : dépenses manuelles +
  `paid_bookings` combinés, catégories du mois, détail au clic, CTA
  "Organiser un suivi" vers Mes démarches.

## /modules-livres — grands chantiers livrés récemment (résumé état final)

### Clock In Shift — module Enterprise de pointage employé
Population distincte des citoyens/membres dashboard. `employees` (profil
RH) ≠ `institution_membres` (accès dashboard), reliés par
`employee_id` nullable. Multi-tenant, RLS zéro policy (accès
service_role uniquement, comme partout où l'appelant n'a pas de session
Supabase Auth). URL V1 `yelen224.com/clock/{institution}` (pas de
sous-domaine). Pointage V1 libre (pas de géofencing/QR/biométrie — schéma
conçu pour ne jamais nécessiter de refonte à leur ajout,
lat/long/device_id déjà présents nullables). `attendance_logs`/
`attendance_audit_logs` immuables (voir /pieges-techniques-connus),
corrections 100% insert-only. `daily_attendance` recalculée par job Deno
+ pg_cron toutes les 15 min (`supabase/functions/clock-in-daily-attendance`),
Guinée = UTC+0 toute l'année (hypothèse documentée en tête de fichier).

**Livré et vérifié en conditions réelles (login employé → pointage →
visible dashboard)** : auth employé, CRUD employees/departments/
work_schedules/schedule-assignments, endpoint pointage (direction déduite
serveur, anti-double-tap 5s), corrections tracées, job nocturne, UI
dashboard (`ClockInShiftTab.tsx`, 4 sous-vues Présences/Employés/
Départements/Horaires), portail employé (`/clock/[slug]`).

**Refonte visuelle "Enterprise" (05/08/2026, clos)** : hero header + Live
polling, KPI exécutifs avec sparkline/delta (SVG manuel, aucune
librairie de charts), recherche + filtres avancés, IA Insights
déterministes (zéro LLM). Documents employé ajoutés
(`employee_documents`, bucket privé `documents-employes`). PIN jamais
affiché nulle part (non négociable). Rotation multi-semaines, heures
min/max, fenêtre Clock In/Out autorisée : reportés (nécessiteraient un
nouveau modèle de données + refonte du job nocturne).
**Reste à faire** : self-service changement de PIN employé au premier
accès (`doitChangerPin` déjà renvoyé par l'API, jamais consommé côté
portail), écran historique employé (route déjà prête).
**Vérification visuelle restant à faire par Bryan** : mode sombre,
Départements/Horaires jamais vus en navigateur.

### Mission 01 — UX & UI Hardening (écrans traités à ce jour)
Premier volet du programme Product Hardening (voir /programme-hardening).
Écrans refondus niveau Enterprise, logique métier inchangée à chaque
fois : **Disponibilités** (KPI exécutifs, mini-timeline, traçabilité
`disponibilites_modifie_le/par`, bouton "Aperçu citoyen" réutilisant
`generateSlotsInRange`, layout 2 colonnes ≥1024px) ; **Équipe & Accès**
(distinct de Clock In Shift par design — accès *Dashboard Yelen* vs
employés pointés ; verrouillage/dernière connexion persistés,
`fonction` informative) ; **Centre de validation** (`ValiderRdvTab.tsx`,
Front Desk check-in 5-10s, `paid_bookings.traite_le`, fiche citoyen 5
zones, "Annuler la validation" avec motif obligatoire + reversal complet
transactions/rdv, Timeline de la journée).

⚠️ **2 vrais bugs trouvés en testant** : (a) réservation payante partait
en statut `"en_attente"` au lieu de `"nouveau"` comme un RDV gratuit,
sautant l'étape accepter/refuser — corrigé, même valeur initiale pour les
deux flux (`paid_bookings.statut` reste une colonne séparée, non
affectée). (b) connexion principale téléphone+OTP ne journalisait jamais
"connexion" ni ne mettait à jour `derniere_connexion` (même en 2FA, le
nom membre n'était pas transporté dans le jeton de défi) — corrigé, non
rétroactif sur les sessions déjà ouvertes.

**Reste à faire sous Mission 01** : tous les autres écrans du produit non
encore audités (le programme prévoit un audit exhaustif, voir
/programme-hardening).

### Audit technique & consolidation (19 lots, quasi clos)
Développement de features suspendu le temps de l'audit (zéro commit/push/
SQL/terminal direct, sous-agents lecture seule). Baseline : `tsc`
propre, eslint 595→0 erreurs / 179→0 warnings, npm audit 9 vulnérabilités
corrigeables par bump mineur (à charge de Bryan).

**5 failles de sécurité réelles trouvées et corrigées** : IDOR génération
QR (citoyen_id accepté du corps de requête), policies RLS `institution_otp`
quasi ouvertes, policy `notifications` `FOR ALL` sans `WITH CHECK`,
`app/avis/page.tsx` orphelin sans scope citoyen (écran maintenu en
attente de décision, voir /backlog-produit), fuite de message d'exception
brut sur les routes QR. RLS des 6 tables historiques vérifié actif en
base (`relrowsecurity=true`) malgré absence des migrations — point clos.

**1 bug fonctionnel réel** : bouton "Marquer comme absent" du Centre de
validation contournait sa modale de confirmation (état créé, jamais
câblé) — corrigé, non testé visuellement par Bryan.

**Autres résultats** : 207 routes API cartographiées par système d'auth
(91 institution, 47 admin, 35 citoyen Supabase Auth, 31 sans auth
documentées comme publiques, 2 employee). Zéro `dangerouslySetInnerHTML`,
zéro SQL brut concaténé. 2 requêtes non bornées corrigées par `.limit()`
(`rdv-historique`, `messages` mode conversations) ; 3 documentées non
corrigées volontairement (voir /modules-livres → Dette requêtes non
bornées ci-dessous). localStorage : plus aucune occurrence non protégée.
97 `<img>` non migrées documentées (traité depuis, voir Migration
next/image ci-dessous).

### Durcissement autorisation admin
`lib/adminAuth.ts` créé — source unique (`authorizeAdmin`,
`verifyAdminSession`, deny-by-default même pour super_admin sur une
permission absente de la matrice), remplace 3 fonctions dupliquées sur 55
endpoints/47 fichiers. Matrice alignée sur `app/admin/layout.tsx::NAV_GROUPS`
déjà existant. `recuperation.manage`/`broadcast.create` restreints à
super_admin seul (durcissement volontaire). `export` scindé en 4
permissions par type. `logs/route.ts` : vrai contrôle BOLA (super_admin
voit tout, autres rôles forcés sur leur propre `admin_id`).
Vérifié par JWT forgés sur 10 endpoints × 4 rôles + cas limites, 0 échec.
**Reste ouvert** : BOLA générale au-delà de `logs`, tests automatisés
permanents (aucun framework de test dans le projet — décision de stack à
prendre avec Bryan).

### Dette requêtes non bornées (documentation uniquement, décision CEO)
`clients/route.ts` et `agenda/route.ts` : fermés, analysés, acceptés
(agrégats en mémoire / récurrence calculée côté client, un `.limit()`
casserait la correction fonctionnelle). `documents-citoyen/route.ts` :
pagination implémentée (`page`/`limit`, `hasMore` heuristique). Index
ajoutés sur `citoyen_documents`/`evenements_agenda`. Volumes réels
vérifiés triviaux (rdv 21 lignes, citoyen_documents 1, evenements_agenda 4).

### Migration next/image (97 warnings → 0, clos)
Chaque occurrence auditée et catégorisée (migration obligatoire /
exception documentée `IMG-EXCEPTION`, voir /pieges-techniques-connus) —
jamais de `unoptimized` en faux correctif. ~90 occurrences migrées sur 47
fichiers, `next.config.ts::remotePatterns` étendu (Supabase Storage,
Pexels, YouTube). 2 vrais bugs corrigés en migrant (collision `Image`
Canvas natif/`next/image`, replis d'erreur par mutation DOM directe
incompatibles avec `src` contrôlé). **Hors de portée de cet
environnement** : vérification visuelle réelle (aucun outil navigateur).

### Migration i18n (Phase 1 — architecture + preuve de concept)
Brief CEO : `fr`/`en`/`ar`, `fr` référence + `en` traduit maintenant, `ar`
structurellement préparé mais non traduit/non exposé. Mode `next-intl`
"Without i18n routing" : locale résolue via **cookie**
(`yelen224_locale`), pas de segment d'URL — décision validée après audit
ayant révélé ~235-245 chemins codés en dur non centralisés. Root layout
**non touché** (garde `<html lang="fr">` en dur) pour ne pas faire
basculer 107 routes statiques en dynamique — seuls les écrans migrés
individuellement deviennent dynamiques (3 routes basculées `○`→`ƒ`
vérifiées au build).
**4 écrans POC réels** : `/compte/langue` (+ `LanguageSwitcher`, `ar` non
exposé), `/mentions-legales` (traduction **partielle délibérée**, prouve
le fallback français en conditions réelles), `/recuperation-compte`
(formulaire complet), `/verify/recu/[id]` (pattern `useFormatter()` pour
date/devise).
**Hors périmètre explicite** : extraction du reste de l'app (~150+
fichiers), traduction arabe/RTL réel, root layout dynamique, blocage
build sur complétude des traductions, dashboard institution (dont Clock
In Shift/Documents clients — jamais dans le périmètre i18n).
**Vérification visuelle restant à faire par Bryan.**

### Signalements — case management (Lots 1-2, clos)
Refonte NIST SP 800-61/OWASP : création → triage → traitement →
résolution → clôture → audit. `signalements` (altérée, 8 statuts,
priorité, assignation, résolution structurée), `signalement_events`
(audit immuable), `signalement_notes` (internes), `signalement_attachments`
(bucket privé `signalements-preuves`). Légalité des *transitions* en code
(`lib/signalementsConstants.ts`), pas en trigger DB. Communauté Yelen
(forme de données différente) reste hors périmètre fonctionnel — seul son
point d'écriture a migré vers une route service_role dédiée pour ne pas
casser sous RLS.
UI (`SignalementsTab.tsx`) : boîte de réception complète, KPI/sparkline,
fiche 2 colonnes avec actions contextuelles dérivées des transitions
légales, formulaire avec étape de vérification.
⚠️ **2 bugs réels trouvés en testant** : sélecteur de citoyen interrogeait
`rdv` directement côté client (bloqué par RLS, aucune ligne jamais
renvoyée) — corrigé via `GET /api/institution/clients`. Colonne legacy
`titre` `NOT NULL` sans défaut, invisible dans les migrations, bloquait
toute création — corrigée (rendue nullable).
**Hors périmètre** : refonte admin `/admin/moderation`, SLA/délais,
anti-abus automatique.

### Documents clients — gestion documentaire (Lots 1-5, clos)
Brief NIST SP 800-171r3/OWASP Unrestricted File Upload : demande →
réception → vérification → validation/refus → archivage.
`citoyen_documents` élargi à 7 statuts, `document_events` (audit immuable,
séquence `YL-DOC-{année}-{8 chiffres}`). "Expiré" dérivé à la lecture
(non stocké, pas de job cron dédié). Refus → nouvelle demande via
`remplace_document_id` (optionnel).
`lib/citoyenDocuments.ts` : seul point d'écriture. UI
(`DocumentsClientsTab.tsx`) : boîte de réception + fiche consultation +
boutons de workflow contextuels (Commencer la vérification/Valider/
Refuser motif obligatoire/Archiver) + aperçu sécurisé intégré (images
seulement, PDF non prévisualisé — aucune librairie PDF dans le projet).
Flux création converti en plein écran avec étape de vérification.

**Audit final (Lot 5)** : 1 faille medium corrigée (`select("*")` sur
`document_events` exposait IP/user-agent sans besoin UI), 1 bug
fonctionnel découvert en corrigeant (nom citoyen jamais joint, vide
depuis le Lot 2), 1 point low (gate `canAccessTab` manquante sur une
route), 6 correctifs accessibilité (aria-label, navigation clavier).
**Non fait, honnêteté explicite** : WCAG 2.2 AA réel (aucun outil
disponible), i18n (hors périmètre acté), tests de charge (volume
trivial).

### Onglet Recherche accueil + aplatissement doré
Icône Recherche ajoutée à la barre du bas (2e position, après Accueil),
`RechercheInner` extraite de `page.tsx` vers un fichier séparé (piège
export nommé, voir /pieges-techniques-connus), props `embedded`/`onBack`.
`/recherche` standalone inchangée, vérifiée au build.
**Aplatissement dégradé→doré plat `#F5A623`** appliqué en série sur
Offres, RDV, login/inscription citoyen+institution, `CompteHeader` (source
unique des ~29 écrans `/compte/*`), icône "Offres" de la barre du bas
remise au même niveau que les autres (CTA flottant retiré). Bouton
"étincelle" animé de la barre de recherche Offres retiré entièrement
(redondant avec le clic sur la barre elle-même).

### Votre activité — évolution "Mes réservations"
Onglet RDV enrichi d'une section "Votre activité" (5 cartes : dernière
réservation/favori/avis/démarche/dépense), alimentée par extension de
`GET /api/citoyen/activites` (2 catégories ajoutées :
`demarche`/`depense`) plutôt que des requêtes ad hoc. Bug corrigé en
marge : `DOC_STATUT` de cette route utilisait encore les 4 anciennes
valeurs `citoyen_documents.statut` (documents valides/disponibles/
archivés affichés à tort "en attente" dans Activités passées).

### Module financier — reçus, transactions, avis (découvert via
migrations 05-06/08/2026, non documenté auparavant dans ce fichier —
trou comblé le 12/08/2026, détail complet dans les migrations elles-mêmes)
- **Rattrapage `module_financier`** : la migration d'origine
  (`20260722000001`) était documentée exécutée mais ne l'était en réalité
  jamais complètement (`paid_bookings.montant_paye` manquante, erreur
  réelle rencontrée en prod le 05/08/2026) — version idempotente rejouée.
- **Reçus Yelen** (`recus`, Lot A) : Reçu ≠ Facture (décision explicite),
  tri-partite citoyen/institution/Yelen, obligatoire dès confirmation de
  paiement. Bug réel trouvé le 06/08/2026 (reçus bloqués au statut
  `cree`, PDF jamais généré) — colonne `erreur_generation` ajoutée pour
  rendre l'échec consultable par SQL sans dépendre du terminal.
- **Transactions — refonte "journal financier Enterprise"** : référence
  lisible `TRX-{année}-{compteur6}` (même mécanisme de séquence que
  `journal_activite`/`recus`), contexte de requête ajouté.
- **Bug avis→moyenne institution** (06/08/2026, signalé par Bryan) :
  `institutions.moyenne_avis`/`nb_avis` n'étaient jamais recalculées
  (aucun trigger ni code applicatif) — figées à 0 depuis toujours malgré
  de vrais avis. Corrigé par trigger DB (recalcul systématique, exclut
  masqués/brouillons).
⚠️ **Ces briques n'ont pas été auditées avec la même rigueur que les
autres chantiers de ce fichier** (découvertes a posteriori via les
en-têtes de migration, pas une session dédiée) — à vérifier en base par
Bryan et à documenter plus en détail si un chantier y revient.

### Recherches populaires (découvert via migration 08/08/2026)
Chantier "Search Overlay" (décision CEO) : section "Recherches
populaires" de l'overlay plein écran. Aucun suivi de fréquence
n'existait — nouvelle table, compteur agrégé (pas un journal ligne par
ligne), `terme_normalise` comme clé d'upsert. Démarre vide, aucune valeur
de départ fabriquée (même principe que moyenne_avis avant son trigger).
⚠️ Même remarque que ci-dessus : détail complet uniquement dans la
migration, pas revérifié en session dédiée.

## /mission-securite-geo-restriction — restriction géographique de pré-lancement + anti-abus edge (code écrit, NON DÉPLOYÉ)

Brief CEO (format proche OWASP/NIST) : avant lancement public, réduire la
surface d'exposition avec un géoblocage temporaire (Afrique de l'Ouest +
New York), **au niveau Edge/middleware, jamais une décision JavaScript
côté client** — deny-by-default. Mise en garde explicite du brief : "pays
bloqué ≠ bot bloqué", ne pas s'arrêter au géoblocage seul.

**Livré (AUCUN commit/push, AUCUN build lancé — accumulation en attente
d'un signal explicite de Bryan)** :
- `lib/geoAccess.ts` : liste CEDEAO + Mauritanie, parsing `x-nf-geo`
  (Netlify), `estRegionAutorisee()` (CEDEAO OU US+NY), comparaison de
  cookie en temps constant (implémentation manuelle, Edge Runtime n'a pas
  `crypto.timingSafeEqual`). **Fail-open explicite** si l'en-tête est
  absent/invalide (dev local, runtime non Netlify).
- `lib/edgeSecurity.ts` : détection VPN/proxy via IPQualityScore
  (**désactivée tant que `IPQS_API_KEY` n'est pas définie**, fail-open),
  signatures d'outils de scan connus (sqlmap/nikto/nmap, toujours actif),
  rate limiting 2 niveaux (240 req/min/IP générique + seuil dédié 10-20
  req/min sur endpoints sensibles, état en mémoire d'instance edge — ne
  survit pas un redémarrage, défense en profondeur qui ne remplace pas
  les rate limits déjà posés route par route), log structuré JSON.
- `middleware.ts` : matcher élargi de `/admin`+`/api/admin` à **tout le
  site**. Ordre : headers sécurité → géo+VPN (off par défaut) → anti-abus
  → protection JWT admin (logique préexistante inchangée). `/api/**` et
  `/region-non-disponible` exemptés du géoblocage.
- `app/region-non-disponible/page.tsx` : écran dédié, atteint uniquement
  via `NextResponse.rewrite()` (jamais un redirect visible).
- `app/api/internal/geo-bypass/route.ts` : accès équipe technique sans IP
  codée en dur, token comparé en temps constant, cookie httpOnly 30 jours,
  404 générique si absent/faux.

**Décision d'architecture actée avec Bryan (en cours)** : passage à
**Cloudflare devant Netlify** (WAF managé, DDoS L3/L4/L7, Bot Management,
géoblocage natif, rate limiting edge) — remplacera à terme IPQualityScore,
sans migration d'hébergement (Netlify reste l'origine). Le code ci-dessus
reste en filet de sécurité supplémentaire (coût nul tant que les
variables d'environnement restent désactivées), pas de suppression prévue.

⚠️ **Hors de portée du code, actions 100% côté Bryan (dashboard/DNS)** :
1. Compte Cloudflare + domaine + nameservers + proxy activé.
2. Bot Fight Mode, règles WAF managées, géoblocage, rate limiting dans
   Cloudflare.
3. Variables Netlify (désactivées par défaut, à n'activer qu'après tests
   réels multi-régions) : `GEO_BLOCK_ENABLED`, `GEO_BYPASS_TOKEN`,
   `IPQS_API_KEY` (probablement superflu une fois Cloudflare actif),
   `EDGE_RATE_LIMIT_ENABLED`.
4. Alerting réel (email/Slack) — aucun webhook branché à ce jour.

## /programme-hardening — 20 missions Product Hardening (VISION/ROADMAP, mission par mission, validée par le CEO avant la suivante)

Après le MVP, phase "Product Hardening" : zéro nouvelle fonctionnalité,
élever l'existant au niveau Stripe/Notion/Shopify/Google Workspace.
**MISSION 01 — UX & UI Hardening** (en cours, voir /modules-livres pour
les écrans déjà traités) : audit et mise à niveau de tous les écrans —
layout, typographie, cartes, boutons (un seul système), tableaux,
formulaires, drawer/dialogs, les 7 états de chaque écran (loading/empty/
error/offline/no permission/no data/success), responsive, animations,
accessibilité. Critère de validation CEO : ouvrir n'importe quel écran
sans connaître le produit doit donner immédiatement une impression de
plateforme Enterprise premium, de façon constante.

**Missions 02-20 (titres seulement, aucun détail défini)** : 02 Design
System officiel · 03 Performance · 04 Sécurité · 05 QA · 06
Accessibilité · 07 Responsive · 08 Observabilité · 09 Base de données ·
10 API · 11 Fichiers & documents · 12 Notifications · 13 RBAC &
permissions · 14 Multi-tenant · 15 Journal d'audit (déjà largement
construit, à compléter) · 16 Sauvegarde & continuité · 17 Scalabilité ·
18 Documentation Enterprise · 19 Déploiement · 20 Audit final.

**Quand une mission est lancée par Bryan** : lire le protocole habituel
avant tout code (audit avant modification, 2 fichiers max à la fois,
zéro donnée inventée) — ce programme ne change pas les règles déjà en
place dans ce fichier, il leur donne juste un ordre de bataille explicite.

## /actions-manuelles-en-attente — checklist consolidée pour Bryan

**Migrations SQL non confirmées exécutées** (ordre chronologique, à
vérifier une à une — plusieurs chantiers ont été livrés en accumulation
sans confirmation systématique) :
`20260805000010` (slug institutions) → `000012` (statut employés) →
`000013` (documents employé) → `000014` (responsable département) →
`000015` (traçabilité disponibilités) → `000016`/`000017` (sécurité +
fonction équipe) → `000018` (paid_bookings.traite_le) →
`20260808000003` (index documents/agenda) → `000004`-`000007`
(signalements lifecycle/events/notes/attachments — 000004 doit être
déployée **en même temps que** le code du Lot 1, pas avant seule) →
`20260809000001` (titre signalements nullable) → `000002`/`000003`
(documents lifecycle + events). `20260805000011` (cron daily_attendance)
requiert aussi `supabase functions deploy clock-in-daily-attendance`.

**Buckets Storage privés à créer** (Public décoché) : `documents-citoyens`,
`documents-employes`, `signalements-preuves`, **`documents`** (documents de
vérification institution — `documents_institution`, table existante depuis
le 11/07/2026 mais bucket jamais créé, trouvé cassé le 14/08/2026 en
testant le nouveau Centre de configuration : `sb.storage.from("documents")`
dans `app/api/institution/documents/route.ts:108`).

**Variables d'environnement à ajouter (Netlify, déjà en local sauf
mention contraire)** :
- `CITOYEN_WEBAUTHN_JWT_SECRET` (volontairement absent de Netlify pour
  l'instant — biométrie citoyen non fonctionnelle en prod tant que ce
  n'est pas fait).
- `EMPLOYEE_JWT_SECRET` (requis même en local, sans quoi
  `app/api/clock/auth/login` échoue au démarrage).
- 3 variables VAPID (push notifications), déjà en `.env.local`.
- Geo-restriction (voir /mission-securite-geo-restriction) : tout
  désactivé par défaut, à activer volontairement plus tard.

**Autres actions ponctuelles** : `npm install pdfkit @types/pdfkit`
(export Journal d'activité), `npm install` sur toute machine/CI hors
session courante, bump mineur `next` 16.2.1→16.3.0 (corrige 9
vulnérabilités npm audit), déploiement Cloudflare (voir
/mission-securite-geo-restriction).
