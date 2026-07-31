═══════════════════════════════════════════════════════════════
YELEN224 — CONTEXTE PROJET COMPLET
Plateforme civique de prise de rendez-vous — République de Guinée
Niveau : Google / Meta / Uber / DoorDash — Zéro amateurisme
═══════════════════════════════════════════════════════════════

⚠️ Ce fichier a été compressé le 21/07/2026 puis à nouveau le 26/07/2026
(le pivot rétention v2 était devenu un historique lot par lot de ~250
lignes pour un chantier déjà clos) : les chantiers **terminés** sont
réduits à leur état final + pièges à ne pas reproduire (l'historique lot
par lot n'est plus détaillé ici — le code fait foi). Les chantiers
**ouverts** gardent tout leur détail. Raison : un CLAUDE.md trop long
dégrade le contexte utile (signalé par Anthropic). Si un détail manque
pour un chantier fermé, lire le code directement plutôt que de supposer.

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

⚠️ **Règle explicite (24/07/2026) : JAMAIS de `git commit`/`git push` sans
ordre explicite de Bryan pour CE commit précis.** `main` est en CI/CD Netlify
(voir /stack) : un commit non demandé part immédiatement en production. Une
validation donnée pour une tâche (ex. "corrige X") ne vaut pas autorisation
de commit — Bryan commit lui-même quand il est prêt. Ne jamais committer
"pour rendre service" après une modification, même petite.

## /stack — STACK TECHNIQUE
Frontend    : Next.js 15 (App Router) + TypeScript strict
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
supabase/migrations/ : peuplée progressivement depuis le 07/07/2026

⚠️ HISTORIQUE RÉEL : Yelen224 n'a JAMAIS fait partie de Sempya224 à l'origine.
Le projet existait sous un compte séparé yelen224@gmail.com, accès perdu
définitivement. Le projet actuel a été recréé par Bryan, tables reconstruites
manuellement — AUCUNE continuité de migrations avec l'ancien compte.

## /auth — DEUX SYSTÈMES D'AUTHENTIFICATION COHABITENT
Ne jamais les confondre. Chaque route/fonctionnalité doit clarifier
explicitement lequel elle utilise.

1. CITOYENS : Supabase Auth — public.users lié à auth.users via id (FK ON
   DELETE CASCADE). Login téléphone +224 + OTP (HARDCODÉ en dev, ex:
   123456 — décision assumée de Bryan, PAS une dette à corriger sans
   demande explicite).
2. INSTITUTIONS : email + mot de passe + JWT custom (institutions.mot_de_passe_hash).
3. ADMINS : email + mot de passe bcrypt + JWT signé (ADMIN_JWT_SECRET,
   jamais exposé côté client).

## /schema — SCHÉMA RÉEL (vérifié par SELECT direct, drift documenté au fil de l'eau)

14 TABLES d'origine dans public : admins (⚠️ en réalité **admin_users**,
drift confirmé 19/07/2026, `admins` n'existe pas), annonces, avis,
disponibilites (⚠️ en réalité colonne jsonb sur `institutions`, pas une
table séparée), institutions, logs_admin, messages, notifications, rdv,
rdv_alertes, services_payants (⚠️ en réalité **paid_services** +
**paid_bookings**), signalements, users. Nombreuses tables ajoutées depuis
(citoyen_*, institution_*, rdv_events, push_subscriptions, etc.).

### public.users (liée à auth.users, PAS une table autonome d'auth)
id (uuid, FK → auth.users.id ON DELETE CASCADE), nom, prenom, email,
date_naissance, adresse, ville, photo_url, biometrie_activee (bool,
⚠️ colonne existe mais n'était lue/écrite nulle part avant le chantier
Sécurité citoyen du 18/07/2026), onboarding_complete, created_at,
mis_a_jour_le, phone, sexe, nationalite, profession, pin_hash,
cgu_acceptee_le, confidentialite_acceptee_le.
⚠️ Colonne "cree_le" renommée en "created_at" entre le 07/07 et le
18/07/2026 (drift non documenté sur le moment, a cassé silencieusement
`app/page.tsx` — `ft()` avalait l'erreur 400 sans la logger). Toujours
vérifier `information_schema.columns` avant de faire confiance à une note
ancienne de ce fichier si un comportement semble anormal (ex. précédent
réel : `avis.brouillon` documenté "terminé" alors que la migration n'avait
jamais été exécutée par Bryan — cassait "Répondre à un avis" en prod).

### Drift confirmé sur `institutions` (18/07/2026, vérifié par grep sur du
code fonctionnel, pas l'audit du 07/07 qui est faux sur ces colonnes) :
colonne **`name`** (pas `nom`), **`logo`** (pas `logo_url`), **`category`**
(pas `type`), **`phone`** (pas `telephone`). `type (enum)` largement
supplanté par **`secteur`** (CHECK, 8 valeurs : santé, administratif,
financier, juridique, beauté_bien_etre, commerce, artisanat,
services_divers). Autres colonnes : email, mot_de_passe_hash, adresse,
ville, pays, description, statut (enum), plan (enum), badge_verifie,
latitude, longitude (⚠️ jamais écrites par aucun écran produit — aucune
institution ne peut renseigner sa position, voir /backlog-carte-institutions),
horaires (jsonb), services (jsonb), disponibilites (jsonb).

### Autres tables clés
- annonces : institution_id, titre, contenu, **statut** (text, pas booléen
  `publiee`), **date_expiration** (pas date_debut/date_fin), type, format,
  media_urls, epingle, image_url, created_at.
- avis : citoyen_id, institution_id, rdv_id, note, commentaire, created_at,
  titre, reponse_institution, reponse_le, masque, brouillon (trigger DB
  bloque toute écriture de reponse_institution hors service_role).
- rdv : citoyen_id, institution_id, service, date_rdv, heure_rdv, statut
  (enum), motif_refus, qr_code, qr_valide, qr_scanne_le, notes,
  presence, presence_status, presence_confirmed_at, duree_minutes,
  termine_par (⚠️ 2e FK vers institutions en plus de institution_id —
  toujours qualifier les joins Supabase : `institutions!rdv_institution_id_fkey(...)`,
  jamais `institutions(...)` non qualifié, sinon erreur PGRST201 à
  l'exécution, invisible à `tsc`).
- messages : expediteur/destinataire citoyen/institution (FKs), contenu,
  lu, **cree_le** (pas created_at — seule `notifications.created_at` a été
  renommée, `messages` jamais touchée).
- signalements : citoyen_id, institution_id, rdv_id, titre, **motif**
  (pas `description`), statut (enum), traite_par, traite_le, priorite,
  type_signaleur, type_cible.
- notifications : destinataire_id/destinataire_type (pas `user_id` —
  drift qui cassait silencieusement la cloche citoyen avant le 20/07/2026),
  titre, message, type, lu, lien.
- paid_services / paid_bookings : institution_id, nom, prix, is_active
  (services), + réservations liées.

## /enums — TYPES ÉNUMÉRÉS CONFIRMÉS
type_admin : super_admin, moderateur
type_institution : hopital, mairie, banque, ambassade, autre
statut_institution : en_attente, validee, suspendue, refusee
plan_abonnement : essentiel, pro, entreprise
statut_rdv : en_attente, confirme, refuse, annule, termine
statut_signalement : ouvert, en_cours, resolu, ignore
⚠️ **'nouveau' n'existe PAS dans statut_signalement** malgré un bug
historique où plusieurs routes admin filtraient dessus par défaut
(comptaient/affichaient toujours zéro) — corrigé le 18/07/2026, seul
`'en_cours'` est utilisé en pratique à la création.

## /securite — ÉTAT SÉCURITÉ (baseline 07/07/2026, largement fait évoluer depuis)
RLS activé sur toutes les tables. Convention désormais systématique pour
toute nouvelle table sensible (sécurité citoyen, documents, webauthn,
remember tokens) : RLS activé, **aucune policy**, accès exclusivement
service_role — jamais de policy RLS pour un rôle qui n'a pas de session
Supabase Auth (institutions, admins). Pour les tables où le citoyen est
propriétaire direct (avis, favoris, rdv lecture), policy `auth.uid() =
citoyen_id` classique.
⚠️ Piège déjà rencontré : une policy `FOR ALL` sans `WITH CHECK` séparé
réutilise le `USING` pour valider les INSERT — un insert avec un rôle
destinataire différent (ex. notification vers une institution) est donc
rejeté silencieusement si la policy ne visait que `destinataire_type =
'citoyen'`. Toujours passer par une route service_role pour toute écriture
cross-partie plutôt que d'élargir une policy RLS.
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
- Avant dépendance ajoutée → vérifier compatibilité Next.js 15/stack
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

### /separation-projets
Yelen224 et Youngouser (project ID uaikztzfhregzsnagznw, repo
Sempya224/Youngouser) sont deux bases de code/données/mémoires strictement
séparées. Ne jamais réutiliser un pattern/décision/donnée de l'un pour
l'autre sans demande explicite.

### /rappel-fondamental
Yelen224 traite des rendez-vous réels de citoyens avec des institutions
réelles. Une erreur ici n'est pas cosmétique — la rigueur n'est pas
optionnelle.

## /regles-ux-ui — règles système, non négociables (établies 24/07/2026)
Applicables à tout le dashboard institution. Public cible : dirigeants
d'institutions, pas un public grand public — police délibérément plus
grande/foncée/affirmée (référence : DoorDash).
1. Zéro emoji, nulle part. Icônes SVG inline style trait (stroke,
   viewBox 24x24, strokeWidth 2), convention Feather-icons.
2. Taille de texte minimale fonctionnelle ~12-13px, poids 700-800. KPI
   gros et gras (20-22px, 900).
3. Un état "sélectionné" change bordure + texte + fond, jamais le fond seul.
4. Toute action cliquable doit avoir une affordance visible au repos
   (fond + bordure), jamais une icône nue révélée au survol seul.
5. Toute fiche détail/modal s'adapte au desktop : bottom sheet mobile-first,
   dialogue centré ≥1024px (convention `.client-fiche-overlay/panel/grip/
   close-x` de `MesClientsTab.tsx`, à réutiliser renommée par écran).

## /backlog-produit — reste à faire, pas commencé
**Écran "Mes clients" Lot C** (messagerie directe dans la fiche client,
dossier documentaire par client, export/purge RGPD côté citoyen) et
**Lot D** (saisie manuelle d'un client sans RDV préalable — casse la règle
actuelle "client = a eu ≥1 RDV") : PAS à construire sans validation
explicite de Bryan.
**Point ouvert** : `presence`/`presence_status`/`presence_confirmed_at`
(migration `20260709000003`) vs enum `statut_rdv` — lequel pilote
réellement les valeurs absent/effectue/honore/nouveau de
`MesClientsTab.tsx::stColor()` reste à vérifier par SQL avant tout travail
sur le taux de présence.

## /historique-deploiement — premier commit général + build Netlify (22/07/2026)
Après 4+ semaines sans commit, commit général de tous les chantiers
accumulés (330 fichiers) effectué et poussé sur `origin/main` à la demande
de Bryan/CEO, pour permettre une revue du rendu réel déployé plutôt que de
continuer à accumuler du code non testé en conditions réelles.
⚠️ **Bug réel détecté au premier build Netlify depuis longtemps** :
`app/institution/connexion/page.tsx` et `app/login/page.tsx` utilisaient
`useSearchParams()` directement dans le composant par défaut, sans
frontière `<Suspense>` — Next.js App Router exige ce wrapping pour le
prerendering statique, sinon le build échoue entièrement (`Error occurred
prerendering page`). Corrigé en renommant chaque composant en
`XxxInner()` et en ajoutant un wrapper `export default` avec `<Suspense
fallback=...>`. Les 5 autres pages du projet utilisant `useSearchParams`
(recherche, signalement, institution/signalements, avis,
messagerie/citoyen) suivaient déjà correctement ce pattern — vérifié une
à une avant de repousser.
**Leçon à retenir** : toute nouvelle page utilisant `useSearchParams()`
doit être vérifiée avec un `npm run build` local avant de considérer un
chantier "terminé" — `tsc --noEmit` ne détecte pas ce genre d'erreur de
prerendering, seul un vrai build Next.js le fait. Un ancien commentaire
affirmant que `app/login/page.tsx` "fonctionnait déjà ainsi en
production" était faux (jamais vérifié par un build réel) — encore un
exemple de note non revérifiée à ne pas prendre pour argent comptant.

## /backlog-technique — localStorage non protégé
`localStorage.getItem(...)` peut lever une exception sur mobile (Safari
navigation privée, etc.) — pattern de protection déjà établi :
`try { id = localStorage.getItem(...); } catch {}`. Corrigé dans 4
fichiers le 13/07/2026. **Reste à corriger** (pas urgent) :
`app/messagerie/citoyen/page.tsx`, `app/mes-rdv/page.tsx`,
`app/rdv/[id]/page.tsx` (3 occurrences).

## /backlog-carte-institutions — la carte citoyenne ne peut jamais afficher d'établissement
Aucun écran du produit ne permet à une institution de renseigner
latitude/longitude (vérifié par grep exhaustif) — le filtre carte est donc
structurellement toujours vide. Correctif appliqué : état "Aucun
établissement localisé" au lieu de "Chargement..." infini.
**Vraie solution non commencée** — décision produit de Bryan requise avant
tout code : (1) champ manuel lat/long, (2) géocodage automatique depuis
l'adresse déjà saisie, ou (3) sélecteur de position sur mini-carte
(react-leaflet déjà une dépendance) à l'inscription/profil.

## /chantier-design — refonte visuelle dashboard institution (en cours depuis 13/07/2026)
Contraintes strictes : jamais toucher `C.gold` (#F5A623, source unique
`theme.ts`) ni `--font-jakarta`. Phase 1 (`.yelen-page`, largeur max
1280px) et Phase 2 (hiérarchie Vue d'ensemble, Communication, Services)
terminées.
**Reste à faire** : suite de `CommunicationTab.tsx`/`ServicesTab.tsx`
(respiration/espacement), puis Phase 3 (déployer la même logique sur Mes
clients, Équipe, Journal, Espace de travail — chantier séparé à planifier).

## /chantier-journal-activite — "Boîte noire" institution (Lots A-G terminés, H-I ouverts)
Système d'audit officiel de Yelen (Compte → Journal d'activité) :
`audit_id` séquentiel, immuabilité en base (trigger bloque DELETE/UPDATE
même pour postgres superuser — échappatoire :
`SET LOCAL app.autoriser_correction_journal = 'on';`), capture IP/user-agent,
recherche universelle + filtres serveur + pagination, timeline en cartes
avec score de risque déterministe (`lib/reputationScore.ts`-like,
`scoreRisque()` dans `journalTaxonomie.ts`), résumé "IA Yelen" (règles
déterministes, zéro LLM), export enrichi 5 formats (CSV/Excel/JSON/PDF/
Rapport signé avec empreinte SHA-256, `pdfkit` à installer par Bryan :
`npm install pdfkit @types/pdfkit`).
⚠️ Gotcha à retenir : un composant défini À L'INTÉRIEUR d'un composant
parent perd le focus de ses inputs à chaque frappe (React démonte/remonte
le sous-arbre) — toujours sortir ce genre de composant (`Section`, etc.)
au niveau module.
**Lots H (géoloc IP→ville, réseau interne, appareil connu) et I
(responsive final) — pas commencés.**

## /chantier-mon-compte — refonte "Mon Compte" citoyen (Lots A-D terminés)
5 sections (Profil, Paramètres, Mon Activité, Aide et support, Mentions
légales) + bloc "Actions rapides" toujours visible, sections repliées par
défaut. Écran `/compte/parametres` dédié (mirroring Apple/Android
Settings). `/profil` (ancien) coexiste volontairement avec
`/compte/informations-personnelles` (nouveau canonique) car
`app/dashboard/dashboard-client.tsx` (2e accueil citoyen, doublon connu)
utilise encore l'ancien — réconciliation reportée.
**Reste à faire** : contenu réel des stubs restants (Langue,
Accessibilité, Données mobiles, Stockage, Sons), un lot à la fois.

## /chantier-securite-citoyen — Centre de sécurité (Lots A-E terminés)
Mirroring exact du système institution déjà fonctionnel : PIN
(`users.pin_hash`), WebAuthn réel côté serveur
(`CITOYEN_WEBAUTHN_JWT_SECRET` — ⚠️ **action requise de Bryan avant prod** :
volontairement gardé dans `.env.local` uniquement, pas Netlify pour
l'instant — la biométrie ne fonctionnera donc PAS en prod tant que ce
secret n'est pas ajouté), remember-token avec vrai bypass (cookie
`yelen224_citoyen_remember`, 60 jours). Écran `/compte/securite` réel :
score de sécurité (règles déterministes, `lib/citoyenSecurite.ts`),
verrouillage rapide, appareils mémorisés, guide de sécurité.
**Reste à faire (Lot F, pas commencé)** : historique sécurité immuable,
alertes, géolocalisation.

## /chantier-confidentialite-citoyen — écran Confidentialité (terminé)
Centre de contrôle vie privée : visibilité du profil, partage de données
(gating réel de l'historique visible par une institution dans
`api/institution/clients/route.ts` via `citoyen_prefs_partage`),
consentements avec date, export JSON complet (`api/citoyen/donnees/
export`), autorisations navigateur en lecture seule (limite plateforme
web, pas du code). Suppression de compte via overlay plein écran (mot
"SUPPRIMER" + PIN si configuré).

## /chantier-avis-favoris-citoyen — "Mes avis" + "Favoris" (Lots A-H complets)
Favoris : ouvert/fermé, annonce active, services actifs, dernière visite,
**prochain créneau disponible** (moteur `lib/disponibilites.ts` partagé
avec le wizard de réservation) et **délai moyen observé** (basé sur
`presence_confirmed_at` réel, affiché seulement si ≥3 mesures — jamais un
chiffre inventé). Mes avis : brouillons, vues, "utile", réponse
d'établissement réelle (`api/institution/avis/repondre`, rôles
admin/agent/superviseur). Avis masqués/brouillons systématiquement
exclus des vues institution et de la fiche publique.
Lancement prévu ~1 semaine après le 18/07/2026 — rien commité (commit
général prévu 2 jours avant).

## /chantier-activites-passees-citoyen — écran "Activités passées" (COMPLET)
Remplace "Historique des scans QR". Agrège en un seul appel
(`api/citoyen/activites`) : compte créé, connexions nouvel appareil,
cycle de vie RDV (table `rdv_events`, RLS sans policy → service_role
uniquement), présence QR, **RDV manqué** (dérivé : passé + pas de présence
+ pas annulé, aucun second scan nécessaire), paiements/remboursements,
favoris, avis, biométrie, documents. "Documents clients" : nouvelle brique
institution↔citoyen (`citoyen_documents`, RLS sans policy, bucket Storage
**privé** "documents-citoyens" — ⚠️ **action requise de Bryan** : créer ce
bucket manuellement, Public décoché). Rattaché à n'importe quel RDV
(passé inclus, pas seulement en cours).

## /chantier-avis-reputation-institution — écran "Santé du compte" (Lots A-F complets)
`lib/reputationScore.ts` : score 0-100 + niveau (Platinum/Gold/Silver/
Danger) sur les 30 derniers RDV évaluables, combinant note (60%), réponse
aux avis négatifs (15%), annulation institution (15%, dérivée par
élimination via `rdv_events` — aucune colonne `annule_par` n'existe),
réclamations résolues (10%). Zéro fermeture automatique — sous le seuil
critique, insertion d'un `signalements` (`type_signaleur: "system"`) pour
qu'un admin examine, garde-fou anti-spam 7 jours.
⚠️ Coexiste volontairement avec `score_sante` (onglet Accueil, calcul
client-side jamais persisté) — deux scores différents, assumé.

## /historique-session — 07/07/2026
supabase init + link faits. Docker abandonné (RAM insuffisante) — tout
audit DB via SQL Editor manuel. Intégration GitHub connectée au projet
Supabase.

## /chantier-notifications-assistant — "Yelen Assistant" (Lots A-D terminés côté code)
Refonte notifications RDV : messages personnalisés (salutation
Bonjour/Bon après-midi/Bonsoir + prénom, `lib/salutation.ts`), moteur
`lib/notificationEngine.ts` (service_role uniquement, jamais importé
côté client) couvrant réservation, arrivée QR + prise en charge (même
événement : le scan QR), fin de prestation. Rappels planifiés (24h/2h/
45min/15min) via Edge Function Deno + pg_cron (`supabase/functions/
rappels-rdv`) — **vérifié fonctionnel en prod le 20/07/2026**. Push web
complet (VAPID, service worker `public/sw.js`, table
`push_subscriptions`). Centre de notifications institution construit
(n'existait pas avant). Bug critique corrigé au passage : `annuler`/
`reporter` côté citoyen ne touchaient jamais réellement `rdv` en base
(policy RLS manquante) — déplacé vers Server Actions service_role
(`app/mes-rdv/actions.ts`).
⚠️ **Actions manuelles encore dues par Bryan** :
1. Exécuter les migrations `..._cron_rappels_rdv.sql` et
   `..._push_subscriptions.sql` si pas déjà fait.
2. Ajouter les 3 variables VAPID aux variables d'environnement Netlify
   (déjà dans `.env.local` pour le local).
3. `npm install` sur toute machine/CI autre que celle de la session.
⚠️ L'Edge Function Deno (Lot C) n'envoie PAS encore de push — seul le
moteur Node le fait.

## /chantier-connexion-institution — écran connexion façon Mailchimp (clos)
`/institution/connexion` : formulaire direct sans pop-up marketing,
palette dérivée de `T[theme]` (plus de couleurs codées en dur), largeur
cohérente (`.yelen-login-card.wide`, 820px) entre les étapes
téléphone/preview/otp. `<img>` du logo volontairement pas migré vers
`next/image` (utilisé nulle part dans les 61 usages du projet — chantier
séparé si un jour prioritaire).

## /chantier-deconnexion — flux de déconnexion citoyen + institution (clos)
Un composant `LogoutFlow` par côté (`confirm → transitioning → success →
error-network`), montés en rendu conditionnel (pas de prop `open`
booléenne, évite le lint `set-state-in-effect`). `logoutCitoyenStrict()`
ne doit jamais avaler un échec réseau. Écouteur `AuthSessionWatcher`
(monté dans `app/layout.tsx`) redirige vers `/login?session_expired=1` sur
l'événement Supabase `SIGNED_OUT`, ignoré sur `/institution` et `/admin`
(JWT custom, pas de session Supabase Auth). Hors périmètre explicite :
déconnexion forcée par un admin (aucun mécanisme backend n'existe).

## /chantier-mon-assistant — bandeau tirable "Mon Assistant" (découvert le 22/07/2026, déjà construit avant cette session — documentation rétroactive)
En travaillant sur l'item 5 du plan rétention (`/chantier-strategie-retention-v2`
ci-dessous), découverte d'un widget déjà construit et fonctionnel dont
l'entrée CLAUDE.md manquait (probablement perdue lors d'une compression
antérieure de ce fichier, ou jamais documentée) : `components/MonAssistant.tsx`,
un bandeau tirable (bottom sheet, glissement par pointer events, aucune
librairie de gestes) sur l'écran Accueil citoyen, sous les 4 onglets, entre
le contenu et la nav du bas. Alimenté par `GET /api/citoyen/assistant`
(agrège RDV à venir, RDV terminés en attente d'avis, annonces des
établissements avec historique+favoris), messages contextuels dans
`lib/assistantMessages.ts` (règles déterministes par seuil de temps, zéro
LLM, isomorphe client/serveur). Position réduite = un message unique
prioritaire ; dépliée = sections par catégorie. S'affiche toujours (même
état vide "Mon Assistant est prêt"), contrairement au principe "jamais de
digest forcé" du plan rétention — décision déjà prise avant cette session,
pas remise en cause ici (design différent : barre permanente, pas une
notification).
**Étendu le 22/07/2026** (voir item 5 du plan rétention juste en dessous)
avec démarches en retard/à échéance proche et documents en attente.

## /vision-long-terme-yelenid — architecture identité/confiance/réputation (décision CEO 26/07/2026 — VISION LONG TERME UNIQUEMENT, aucune action immédiate, "on fera ça pas à pas")

**Positionnement produit à long terme** : Yelen = l'endroit où un citoyen
guinéen construit sa preuve de confiance — preuve qui peut progressivement
ouvrir l'accès au crédit, au travail, aux services et aux opportunités.
"Yelen, la lumière" = rendre visible ce que quelqu'un a réellement fait,
pas ce qu'il prétend être ou qui il connaît.

**Architecture à 4 briques, à séparer complètement l'une de l'autre** :
1. **YelenID** — qui es-tu ? (identité)
2. **Yelen Trust** — peut-on te faire confiance dans tes interactions avec
   Yelen ? (historique comportemental)
3. **Yelen Points** — quelle valeur as-tu créée dans l'écosystème ?
   (récompenses)
4. **Yelen Skills** (plus tard, pas priorisé) — qu'est-ce que tu sais
   faire et as prouvé ? (réputation professionnelle)

Chaîne visée : Identité → Confiance → Réputation → Opportunités → Revenu.
Exemple produit du CEO : un jeune de 22 ans sans patrimoine ni relations,
mais avec 2 ans de YelenID actif (RDV honorés, démarches réussies,
missions pro, 0 fraude), devient lisible et vérifiable par un employeur
qui ne le connaît pas.

⚠️ **Tension à lever avant toute construction** : `/chantier-strategie-
retention-v2` a explicitement décidé "jamais de score numérique visible
attribué à un citoyen" (risque crédit social, plateforme adossée à
l'État). "Yelen Trust"/"Yelen Points" chiffrés semblent aller à
l'encontre de ce principe si affichés publiquement — à clarifier
explicitement avec Bryan (piste probable : visible au citoyen lui-même et
à qui il choisit de le montrer, jamais un classement public/comparatif)
avant d'écrire la moindre ligne de code sur ces briques.

**Lien avec le travail actuel** : les chantiers récents (`/chantier-mes-
demarches`, `/chantier-menu-engagement` ci-dessous) construisent déjà,
sans le nommer ainsi, la matière première de "Yelen Trust" (comportement
réel : RDV honorés, démarches suivies, activité financière). À garder en
tête pour la cohérence des choix futurs, sans sur-construire par
anticipation.

## /chantier-strategie-retention-v2 — pivot stratégique rétention citoyenne (décisions actées le 21/07/2026)

**Constat** : Yelen perçu comme une appli de rendez-vous seule — un
citoyen peut ne plus l'ouvrir pendant des semaines entre deux RDV.

**Décisions de fond toujours valables** :
- Yelen = espace personnel de confiance du citoyen, pas une super app.
- Jamais de score numérique visible attribué à un citoyen (badges
  factuels seulement) — ne concerne pas le score réputation
  **institution** (`/chantier-avis-reputation-institution`, métrique
  business normale). Voir tension avec `/vision-long-terme-yelenid`.
- Compte famille : reporté, scope non tranché.
- Digest proactif : jamais sans contenu réel, silence plutôt que bruit forcé.
- Constat central : Yelen était 100% consultation, rien ne permettait au
  citoyen de **créer** quelque chose qui vit sur plusieurs sessions — d'où
  "Mes démarches" (voir `/chantier-mes-demarches`).

**Réalisé depuis (détail dans le code, pas ici)** : bilan périodique
(`app/compte/activites`) + notifications documents/favoris intégrés à
`components/MonAssistant.tsx`/`GET /api/citoyen/assistant`.

## /chantier-mes-demarches — checklist personnelle + "Suivis" (créé 22/07, refondu 26/07/2026)

`app/compte/mes-demarches/` : `citoyen_demarches` + `citoyen_demarche_etapes`
(migrations `20260724000011`/`...012`, RLS `auth.uid()=citoyen_id`,
écriture directe client, pas de route API). V1 = **zéro modèle Yelen
pré-rempli** (décision explicite, engagerait la responsabilité éditoriale
de Yelen sur une procédure potentiellement fausse) — juste des intitulés
d'exemple cliquables, séparés Personnel/Professionnel (élargi aux
entrepreneurs/chefs d'entreprise le 22/07). Auto-complétion à la dernière
étape cochée ; badge **"Clôturée"** (pas "Terminée") si fermeture manuelle
avec étapes non cochées — distinction qui pilote aussi le déclenchement de
la popup de célébration. Toutes les confirmations passent par une modale
stylée maison, aucun `window.confirm`. FAQ + guide "Comment ça marche ?"
intégrés à l'écran.

**Refonte "Suivis" (26/07/2026, décision CEO — écran majeur d'engagement,
doit devenir la source qui alimentera l'Accueil avec de vraies actions,
chantier séparé pas commencé)** : nouvelle section "Votre activité" en
tête d'écran (au-dessus de "Vos démarches"), alimentée par
`GET /api/citoyen/suivis` (nouvelle route, même discipline zéro-LLM que
`/api/citoyen/assistant`, logique dupliquée volontairement). Analyse : RDV
à venir, avis en attente, documents demandés, démarches en retard/
échéance, **dépense la plus élevée du mois** (`citoyen_depenses` +
`paid_bookings`), et **un centre d'intérêt sans aucune démarche**
(`users.centres_interet`, affiché **seulement si le citoyen n'a encore
aucune démarche** — jamais un "manque" affirmé sans preuve). Chaque suivi
de type "créer une démarche" réutilise `ouvrirCreationDepuisExemple()`
existant (titre pré-rempli, jamais un modèle avec étapes imposées).
Animation de chargement façon radar (pas le spinner générique). Pop-up de
création converti en plein écran (header X + titre), même pattern que
`/chantier-menu-engagement` → Mes dépenses.

## /chantier-menu-engagement — menu "conçu pour vous" + écrans finance (25-26/07/2026, décision CEO, inspiré Cash App/MoneyLion)

Logo Yelen de l'onglet Accueil remplacé par un bouton menu (icône 3
lignes) ouvrant `components/CitoyenMenu.tsx` — overlay plein écran,
bandeau identité (nom + Yelen ID) en dégradé doré Yelen, 7 entrées à
badges illustrés sur mesure : Vos centres d'intérêt, Mes dépenses,
Calculatrice, Leçons d'argent, Vos tendances, Parrainage (stub),
Nouveautés Yelen (stub). Header général (`CompteHeader` partagé +
`app/page.tsx`) : icône casque (support) remplace le "?" partout, visible
sur tous les onglets sauf Accueil.

Tous les écrans de contenu financier utilisent uniquement des données
réelles sourcées (recherches Perplexity commandées par Bryan le
25/07/2026 : Banque mondiale, BCRG, Crédit Rural de Guinée, BSIC Guinée,
Guinéenews, RFI) — jamais un chiffre inventé, chaque fait cite sa source
cliquable. Catégories/secteurs adaptés à la réalité guinéenne (mobile
money, tontines, microfinance) plutôt que copiés du modèle américain de
référence (ex. "score de crédit public" n'existe pas en Guinée — devenu
une question de quiz plutôt qu'ignoré).

- **`app/menu/lecons-argent/`** (`lib/leconsArgent.ts`) : 6 leçons (une
  par catégorie : épargne/tontines, mobile money, microfinance/crédit,
  revenus, budget, fraudes), quiz 2-3 questions chacune, réponses en
  pilules pleines colorées, feedback vert/rouge sourcé, célébration
  confettis CSS en fin de leçon.
- **`app/menu/calculatrice/`** (`lib/calculateurs.ts`) : "Vos outils
  financiers", 2 outils actifs (microcrédit — amortissement dégressif
  2-3,5%/mois façon Crédit Rural de Guinée ; épargne — 3 scénarios réels :
  tontine 0%, OMIG Tik Tak 3%/an, IMF type BSIC 4-4,5%/an), 4 outils
  "Bientôt disponible" plutôt qu'inventés.
- **`app/menu/interets/`** (`lib/centresInteret.ts`, migration
  `users.centres_interet text[]`) : 14 centres d'intérêt réutilisant 1:1
  les 8 `secteur` d'institutions + les 6 catégories Leçons d'argent (pas
  une taxonomie inventée, exploitable plus tard pour de vraies
  recommandations). Bouton "Enregistrer"/"Modifier" actif seulement si la
  sélection diffère de ce qui est déjà enregistré ; retour bloqué (modale)
  tant qu'il y a des changements non enregistrés — prop `onBackIntercept`
  ajoutée à `CompteHeader` (optionnelle, rétrocompatible avec les ~29
  autres écrans qui ne la passent pas).
- **`app/menu/depenses/`** (migration `citoyen_depenses`, RLS
  `auth.uid()=citoyen_id`) : dépenses manuelles + RDV payés
  (`paid_bookings`, jamais dupliqués en base) combinés. Catégories du mois
  en cartes horizontales scrollables. Détail au clic (plein écran) :
  date/heure réelles (`created_at`), établissement/service pour les RDV
  Yelen. CTA "Organiser un suivi" vers Mes démarches sur la catégorie la
  plus dépensière.

⚠️ **Migrations pas encore exécutées par Bryan** :
`20260725000008_users_centres_interet.sql`,
`20260725000009_citoyen_depenses.sql`.
