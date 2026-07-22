═══════════════════════════════════════════════════════════════
YELEN224 — CONTEXTE PROJET COMPLET
Plateforme civique de prise de rendez-vous — République de Guinée
Niveau : Google / Meta / Uber / DoorDash — Zéro amateurisme
═══════════════════════════════════════════════════════════════

⚠️ Ce fichier a été compressé le 21/07/2026 : les chantiers **terminés** ont
été réduits à leur état final + pièges à ne pas reproduire (l'historique
lot par lot n'est plus détaillé ici — le code fait foi). Les chantiers
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

## /chantier-strategie-retention-v2 — pivot stratégique rétention citoyenne (débat du 21/07/2026, DISCUSSION UNIQUEMENT — aucun code écrit)

**Risque identifié** : Yelen est perçu comme une appli de rendez-vous —
un citoyen peut ne plus l'ouvrir pendant des semaines entre deux RDV. Débat
stratégique mené (panel d'experts produit simulé + contre-analyse) pour
définir comment transformer Yelen en produit ouvert 4-5x/semaine sans
spam ni gadget hors-sujet (météo/actu/foot explicitement exclus).

**Décisions actées** :
- Vision produit : Yelen = espace personnel de confiance du citoyen
  (identité, historique, preuves, établissements, confiance) — pas une
  super app qui fait tout, reste centré sur la mission civique/institutionnelle.
- **Jamais de score numérique visible attribué à un citoyen** (risque
  politique majeur pour une plateforme adossée à l'État en Guinée — trop
  proche du crédit social). Uniquement des badges factuels ("Identité
  vérifiée", "X ans d'historique", "0 signalement"). Le score de
  réputation **institution** (`avis-reputation-institution` ci-dessus)
  n'est pas concerné, c'est une métrique business normale.
- Compte famille (gérer les RDV d'un proche) : valeur réelle en Afrique de
  l'Ouest mais item le plus complexe (consentement, mineurs,
  confidentialité médicale) — **reporté**, scope étroit (mineurs
  uniquement) si un jour construit, jamais un graphe familial adulte
  ouvert d'entrée.
- Un digest/résumé personnel proactif ("Bonjour {prénom}, aujourd'hui...")
  ne doit **jamais s'afficher/se pousser sans contenu réel** — silence
  plutôt que bruit forcé, cohérent avec la discipline déjà en place
  partout ailleurs dans le projet (zéro donnée inventée).
- **Constat central** : tout ce qui existe dans Yelen aujourd'hui est en
  mode consultation (le citoyen reçoit/regarde/répond). Aucune brique ne
  lui permet de **créer** quelque chose qui vit sur plusieurs sessions —
  c'est ce mode "investissement" qui manque pour générer des événements de
  retour indépendants des institutions et des rendez-vous.
- **Premier chantier concret retenu (pas commencé)** : "Mes démarches" —
  checklist libre multi-étapes, rédigée par le citoyen lui-même, liée ou
  non à une institution (ex. suivi d'un dossier universitaire, permis de
  construire, création d'entreprise, visa). **V1 = zéro modèle pré-rempli
  par Yelen** (décision explicite de Bryan) : un modèle "officiel" suggéré
  engagerait la responsabilité éditoriale de Yelen sur une procédure
  potentiellement fausse/obsolète — risque de confiance direct pour un
  produit dont l'ADN est la fiabilité. Les échéances de documents
  (expiration passeport/CNI/assurance) deviennent un cas particulier de
  démarche, pas un chantier séparé.
- **Gains à coût quasi nul identifiés pour le démarrage de ce chantier**
  (infra déjà existante, jamais exploitée) : notifier le citoyen quand le
  statut d'un `citoyen_documents` change (colonne existe, aucune
  notification déclenchée aujourd'hui) ; notifier quand un établissement
  en favori publie une annonce ou ouvre un créneau (trou identifié, rien
  n'existe).
- **Bilan périodique** (mensuel/annuel, "il y a 1 an vous rejoigniez
  Yelen...") retenu comme boucle de retour supplémentaire — entièrement
  calculable depuis l'historique déjà stocké, zéro nouvelle donnée.

**Item 1 du plan — notifier changement de statut document citoyen (terminé
le 22/07/2026)** : `citoyen_documents` ne déclenchait jusqu'ici aucune
notification. `lib/notificationEngine.ts` gagne 3 fonctions
(`notifierDocumentDemande`, `notifierDocumentEnvoye`,
`notifierDocumentTeleverse`), réutilisant `envoyerNotification()` générique
avec le vrai `rdv_id` de `citoyen_documents` (pas de nouveau lien à
construire).
- `app/api/institution/documents-citoyen/route.ts` (POST) — notifie le
  citoyen juste après la création d'une demande ou d'un envoi, best-effort
  (échec de notification n'empêche jamais la création).
- `app/api/citoyen/documents/upload/route.ts` (POST) — notifie
  l'institution quand le citoyen téléverse en réponse à une demande.
- ⚠️ Limite connue, pas corrigée ici (préexistante, pas une régression) :
  le clic sur une notification (citoyen comme institution) route toujours
  de façon générique par présence de `rdv_id` (messagerie côté citoyen,
  onglet RDV côté institution) — pas de routage spécifique par `type` vers
  Mes documents/Documents clients. Vrai pour les 8 phases RDV existantes
  aussi, pas propre à ce correctif.

**Item 2 du plan — bilan périodique (terminé le 22/07/2026)** :
`app/compte/activites/activites-client.tsx` — nouvelle carte "Votre
bilan" au-dessus du "Résumé" existant : "Membre depuis {X}" (framing
"il y a {X}, vous rejoigniez Yelen" si ≥1 an) + compteurs "ce mois-ci"
(RDV créés, avis publiés, documents). **Entièrement calculé côté client**
depuis les activités déjà chargées par `/api/citoyen/activites` (aucune
route serveur modifiée, aucune requête supplémentaire) : "membre depuis"
dérive de l'activité `compte_cree` déjà présente dans la liste, "ce
mois-ci" est un simple filtre par date sur la même liste. N'inclut pas
les démarches ("Mes démarches" reste volontairement absent de la
timeline Activités passées — Lot 3 de ce chantier séparé, pas fait ici).

**Item 5 du plan — "Résumé de mon espace" (terminé le 22/07/2026, réalisé
en étendant Mon Assistant plutôt qu'un nouveau widget)** : découverte en
cours de route que `components/MonAssistant.tsx` (voir
`/chantier-mon-assistant` ci-dessus) couvrait déjà exactement ce rôle —
construire un second bandeau aurait été redondant. Étendu avec :
- `app/api/citoyen/assistant/route.ts` — 2 nouvelles requêtes
  (`citoyen_demarches` statut en_cours, `citoyen_documents` sens=demande +
  statut=en_attente) + calcul démarches en retard/échéance proche (7
  jours), même logique que `estEnRetard()` côté client, dupliquée
  volontairement (pas de module partagé client/serveur existant pour ça).
- `lib/assistantMessages.ts` — 3 nouveaux messages déterministes
  (`MESSAGE_DOCUMENT_ATTENTE`, `MESSAGE_DEMARCHE_RETARD`,
  `MESSAGE_DEMARCHE_ECHEANCE`).
- `components/MonAssistant.tsx` — 2 nouvelles sections dépliées
  ("Documents à fournir", "Démarches à surveiller"), priorité du message
  résumé mise à jour : RDV imminent > documents en attente > démarches en
  retard > avis à laisser > démarches à échéance proche > annonces.

**Plan rétention v2 — items 1, 2 et 5 terminés.** Item 3 (échéances comme
cas particulier de démarche) déjà satisfait par le design du Lot 1. Reste
ouvert, pas commencé : lots internes de "Mes démarches" (rappels
automatiques, apparition dans Activités passées, pièce jointe, visibilité
institution optionnelle, modèles Yelen très reportés).

**Lot 1 — écran "Mes démarches" (code écrit le 22/07/2026, migration PAS
ENCORE EXÉCUTÉE par Bryan)** :
- `supabase/migrations/20260724000011_citoyen_demarches.sql` —
  `citoyen_demarches` (citoyen_id, institution_id nullable, titre,
  description, date_cible, statut en_cours/terminee, created_at,
  termine_le) + `citoyen_demarche_etapes` (demarche_id, citoyen_id
  dénormalisé, libelle, date_echeance, fait, fait_le, ordre). RLS
  classique `auth.uid() = citoyen_id` sur les deux (mirroring
  citoyen_favoris — pas le style service_role-only des tables de
  sécurité). Décision actée le 22/07/2026 : une démarche peut exister
  sans aucune étape (cas "échéance simple"), `statut` reste un champ
  stocké et modifiable manuellement pour ce cas.
- `app/compte/mes-demarches/{page,mes-demarches-client}.tsx` (nouveau,
  remplace le stub) — écrasement direct via Supabase côté client (RLS
  suffit, pas de route API dédiée, mirroring `favoris-client.tsx`) :
  liste avec KPI (total/en cours/terminées/en retard), création (titre +
  institution optionnelle via recherche `institutions.name` + date cible
  optionnelle + étapes optionnelles), détail (cocher/ajouter/supprimer une
  étape, statut terminée automatique quand toutes les étapes existantes
  sont cochées — et réversible si on décoche ou ajoute une étape après
  coup —, bouton manuel "Marquer terminée"/"Rouvrir" pour le cas sans
  étape, suppression de la démarche).
- Menu (`app/page.tsx`, section "Mon Activité") — entrée "Mes démarches"
  ajoutée juste après "Activités passées".
- **Volontairement pas dans ce lot** (additifs plus tard, voir plan de
  lots ci-dessus) : rappels automatiques sur `date_echeance`, apparition
  dans "Activités passées", pièce jointe à une étape, édition du
  titre/institution/date cible après création, visibilité institution.
- `tsc --noEmit` : 0 erreur.
- ⚠️ **Action requise de Bryan avant tout test** : exécuter la migration
  `20260724000011_citoyen_demarches.sql`.

**Correctif post-test (22/07/2026)** — retour direct de Bryan après un
premier test réel (captures d'écran) : l'écran fonctionnait techniquement
mais était "incompréhensible" — badge "Terminée" affiché en même temps
qu'une étape non cochée (0/1), aucun texte expliquant la valeur de
l'écran ou comment s'en servir, actions jugées trop limitées.
- **Vraie incohérence corrigée** : "Marquer terminée" pouvait clôturer une
  démarche avec des étapes encore non cochées sans le signaler. Ajout
  d'une confirmation (`window.confirm`) quand des étapes restent non
  cochées, et badge distinct **"Clôturée"** (au lieu de "Terminée") sur la
  carte et dans le détail quand c'est le cas — pour ne plus jamais
  afficher "Terminée" à côté d'une progression incomplète.
- Guide "Comment ça marche ?" (3 puces) ajouté sous l'intro de la liste.
  État vide enrichi avec 4 exemples cliquables (pré-remplissent le titre
  et ouvrent la création — pas des modèles avec étapes pré-remplies,
  juste des intitulés, cohérent avec la décision "zéro modèle Yelen").
  Texte explicatif ajouté quand une démarche n'a aucune étape, et
  au-dessus du bouton Marquer terminée/Rouvrir pour expliquer la
  conséquence selon le contexte.
- **Action débloquée** : édition du titre et de la date cible depuis le
  détail (bouton "Modifier"). L'édition de l'établissement lié reste
  différée (pas demandée explicitement, complexité UI plus grande).
- Erreurs silencieuses corrigées : les mises à jour automatiques de
  `statut` (bascule terminée/en_cours déclenchée par le cochage ou l'ajout
  d'une étape) affichent désormais un toast d'erreur si elles échouent,
  au lieu d'échouer sans retour.

**2e correctif post-test (22/07/2026)** — nouveau retour Bryan (capture
d'écran d'un `window.confirm` natif du navigateur, jugé "nul" visuellement,
plus demande de contenu explicatif plus poussé) :
- Les 2 `window.confirm()` restants (clôturer avec étapes non cochées,
  supprimer une démarche) remplacés par une modale de confirmation stylée
  cohérente avec le reste de l'écran (overlay + carte, boutons
  Annuler/Confirmer), au lieu du dialogue générique du navigateur.
- Guide "Comment ça marche ?" — bouton X ajouté (masque le bloc pour la
  session en cours ; il réapparaît naturellement à la prochaine ouverture
  de l'écran, aucune persistance volontaire).
- Micro-copy ajoutée sous chaque champ du formulaire de création
  (établissement lié, date cible, étapes) expliquant à quoi sert le champ
  et ce qu'il faut y mettre — le formulaire n'expliquait rien avant.
- **FAQ explicite ajoutée en bas de l'écran** (accordéon, 8 questions) —
  couvre le fonctionnement précis de chaque mécanisme (étapes optionnelles,
  bascule automatique vs clôture manuelle, différence Terminée/Clôturée,
  sens du badge En retard, confidentialité vis-à-vis de l'établissement
  lié, ce qui est modifiable après coup).
- **Texte de marque Yelen ajouté après la FAQ** (mission/valeur du produit,
  pas spécifique à cet écran) — même logique qu'un footer d'appli
  bancaire, demandé explicitement par Bryan.

**Élargissement d'audience (22/07/2026)** — constat de Bryan lui-même en
testant l'écran : "Mes démarches" fonctionnait déjà techniquement pour un
usage professionnel (rien n'empêchait de taper un titre business) mais
rien sur l'écran ne le signalait, ce qui excluait de fait les citoyens
entrepreneurs/chefs d'entreprise (segment particulièrement pertinent en
Guinée, économie informelle/PME) — pas un conflit avec le compte
"institution" existant, toujours un usage citoyen (interaction avec des
institutions de l'extérieur), pas une gestion d'organisation.
- `supabase/migrations/20260724000012_citoyen_demarches_categorie.sql` —
  `citoyen_demarches.categorie` (nullable, CHECK personnel/professionnel,
  aucun backfill des démarches déjà créées).
- Sélecteur catégorie optionnel (2 boutons bascule, cliquer sur celui déjà
  sélectionné le désélectionne) dans la création ET dans l'édition du
  détail.
- Nouveau filtre par catégorie (Toutes/Personnel/Professionnel), affiché
  seulement si au moins une démarche existante a une catégorie renseignée
  — n'encombre pas l'écran pour un usage 100% personnel.
- Badge catégorie sur la carte liste et dans le détail (bleu pour
  Professionnel, neutre pour Personnel).
- État vide : exemples désormais séparés en deux groupes (Personnel :
  passeport/université/ordonnance ; Professionnel : RCCM/déclaration
  fiscale/fournisseur/licence commerciale) — cliquer pré-remplit le titre
  ET la catégorie avant d'ouvrir la création.
- Guide "Comment ça marche ?" et FAQ mis à jour pour mentionner les deux
  audiences ; nouvelle question FAQ dédiée à la catégorie.

**3e correctif post-test (22/07/2026)** — discipline de saisie + vue des
cartes enrichie + célébration, demandés par Bryan pour éviter un écran
"fictif" où l'on tape n'importe quoi sans structure :
- **Champs disciplinés en douceur, pas bloqués en dur** (arbitrage retenu
  entre les deux options proposées par Bryan — catégorie/date
  cible/étapes "obligatoires" VS message honnête + choix) : le bouton
  "Créer la démarche" reste cliquable avec seulement un titre (comme
  avant), mais si catégorie, date cible ou étapes manquent (établissement
  volontairement exclu de cette règle), une confirmation liste
  précisément ce qui manque et pourquoi ("pas de détection en retard
  fiable, pas de progression visible"), avec le choix de créer quand même
  ou de revenir compléter.
- **Confirmation au cochage d'une étape si la date ne correspond pas à
  aujourd'hui** : cocher une étape dont `date_echeance` est fixée à un
  autre jour que la date du jour demande confirmation ("elle était prévue
  pour le X, la marquer terminée aujourd'hui ?") — ne s'applique qu'en
  cochant (pas en décochant), et seulement si une date est fixée.
- **Cartes de la liste enrichies** (retour direct : "elles sont nulles et
  identiques") : démarche en cours affiche désormais "Se termine dans X
  jours"/"demain"/"aujourd'hui" (calculé sur la prochaine étape non
  cochée ou la date cible) quand elle n'est pas en retard ; démarche
  terminée/clôturée affiche "Terminée le {date} à {heure}" (utilise
  `termine_le`, déjà en base depuis le Lot 1 mais jamais exposé dans le
  type `Demarche` ni affiché jusqu'ici).
- **Popup de célébration** ("Bravo !", illustration médaille/ruban SVG
  trait doré, message félicitant la discipline) déclenché uniquement lors
  d'une complétion réelle : cochage de la dernière étape restante, ou
  clôture manuelle sans aucune étape non cochée (0 étape ou toutes déjà
  faites). Ne se déclenche jamais pour une "Clôturée" (fermeture manuelle
  avec des étapes encore non cochées) — distinction déjà établie au
  correctif précédent, réutilisée ici pour ne pas féliciter un abandon
  partiel comme une réussite.
