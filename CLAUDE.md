═══════════════════════════════════════════════════════════════
YELEN224 — CONTEXTE PROJET COMPLET
Plateforme civique de prise de rendez-vous — République de Guinée
Niveau : Google / Meta / Uber / DoorDash — Zéro amateurisme
═══════════════════════════════════════════════════════════════

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
Supabase CLI : installée (v2.107.0 au 07/07/2026), init + link faits
Docker      : NON disponible sur cette machine (RAM insuffisante, 
              système Braswell bas de gamme) → db pull/db dump impossibles, 
              tout audit DB passe par SQL Editor manuel exclusivement

## /supabase — INFRASTRUCTURE
Project ID actuel : pgcabxgrgjgukuagpuhc
URL              : pgcabxgrgjgukuagpuhc.supabase.co
Organisation     : Sempya224 (ajouté le 2026-05-30)
supabase/config.toml : présent
supabase/migrations/ : vide au 07/07/2026, à peupler progressivement

⚠️ HISTORIQUE RÉEL : Yelen224 n'a JAMAIS fait partie de Sempya224 à l'origine. 
Le projet existait sous un compte séparé yelen224@gmail.com, accès perdu 
définitivement (email inaccessible). Le projet actuel dans Sempya224 a été 
recréé par Bryan avec les tables reconstruites manuellement — AUCUNE 
continuité de migrations avec l'ancien compte. Ne jamais supposer qu'un 
historique antérieur au 30/05/2026 existe.

## /auth — DEUX SYSTÈMES D'AUTHENTIFICATION COHABITENT
Ne jamais les confondre. Chaque route/fonctionnalité doit clarifier 
explicitement lequel elle utilise.

1. CITOYENS : Supabase Auth
   - public.users lié à auth.users via id (FK ON DELETE CASCADE)
   - Session gérée par Supabase (cookies/JWT Supabase natif)
   - Login prévu : téléphone +224 + OTP (actuellement HARDCODÉ en dev, 
     ex: 123456 — décision explicite et assumée de Bryan, PAS une dette 
     à corriger sans demande explicite. Ne jamais brancher Twilio/Phone 
     Auth sans validation préalable)

2. INSTITUTIONS : email + mot de passe + JWT custom
   - Colonne institutions.mot_de_passe_hash confirmée en base
   - Mécanisme JWT exact à vérifier dans le code (Phase 2, non confirmé)

3. ADMINS : email + mot de passe bcrypt + JWT signé
   - Colonne admins.mot_de_passe_hash confirmée en base
   - Secret : ADMIN_JWT_SECRET (jamais exposé côté client, vérification 
     systématique côté serveur avant toute route /api/admin/* si applicable)

## /schema — SCHÉMA RÉEL CONFIRMÉ LE 07/07/2026 (par SELECT direct exécuté 
## par Bryan — AUCUNE colonne/table ici n'est supposée, tout est vérifié)

14 TABLES dans public :
admins, annonces, avis, disponibilites, documents_institution, 
institutions, logs_admin, messages, notifications, rdv, rdv_alertes, 
services_payants, signalements, users

### public.users (liée à auth.users, PAS une table autonome d'auth)
id (uuid, FK → auth.users.id ON DELETE CASCADE), nom, prenom, email, 
date_naissance, adresse, ville, photo_url, biometrie_activee (bool, 
default false), onboarding_complete (bool, default false), cree_le, 
mis_a_jour_le, phone
⚠️ Colonne "telephone" supprimée le 07/07/2026 (résidu mort, table 
était vide, zéro perte de données réelles — vérifié par grep exhaustif 
avant suppression)

### Autres tables — colonnes clés (voir audit SQL complet du 07/07/2026 
### pour le détail exhaustif, ne pas re-deviner, interroger la base si besoin)
- admins : id, nom, email, mot_de_passe_hash, type (enum type_admin), actif
- annonces : id, institution_id (FK), titre, contenu, publiee, date_debut, date_fin
- avis : id, citoyen_id (FK→users), institution_id (FK), rdv_id (FK), note, commentaire
- disponibilites : id, institution_id (FK), jour_semaine, heure_debut, heure_fin, capacite, actif
- documents_institution : id, institution_id (FK), nom, url, type
- institutions : id, nom, type (enum), email, mot_de_passe_hash, telephone, 
  adresse, ville, pays (default 'Guinée'), description, logo_url, 
  statut (enum), plan (enum), badge_verifie, latitude, longitude, horaires (jsonb), services (jsonb)
- logs_admin : id, admin_id (FK), action, cible_type, cible_id, details (jsonb)
- messages : id, expediteur_citoyen_id, expediteur_institution_id, 
  destinataire_citoyen_id, destinataire_institution_id (FKs), contenu, lu
- notifications : id, citoyen_id (FK), institution_id (FK), titre, message, type, lu, lien
- rdv : id, citoyen_id (FK), institution_id (FK), service, date_rdv, heure_rdv, 
  statut (enum), motif_refus, qr_code, qr_valide, qr_scanne_le, notes
- rdv_alertes : id, institution_id (FK), rdv_id (FK), message, lu
- services_payants : id, institution_id (FK), nom, description, prix, devise (default 'GNF'), actif
- signalements : id, citoyen_id (FK), institution_id (FK), rdv_id (FK), titre, 
  description, statut (enum), traite_par (FK→admins), traite_le

## /enums — 6 TYPES ÉNUMÉRÉS CONFIRMÉS (valeurs exactes, 07/07/2026)
type_admin          : super_admin, moderateur
type_institution     : hopital, mairie, banque, ambassade, autre
statut_institution   : en_attente, validee, suspendue, refusee
plan_abonnement      : essentiel, pro, entreprise
statut_rdv           : en_attente, confirme, refuse, annule, termine
statut_signalement   : ouvert, en_cours, resolu, ignore

## /securite — ÉTAT SÉCURITÉ CRITIQUE CONFIRMÉ LE 07/07/2026
### RLS (Row Level Security)
✅ Activé sur les 14 tables, sans exception (rowsecurity = true partout)

### Policies — SEULEMENT 6 POLICIES SUR 5 TABLES
- avis : avis_citoyen_own (ALL, auth.uid() = citoyen_id)
- messages : messages_citoyen_own (ALL, expediteur OU destinataire = auth.uid())
- notifications : notif_citoyen_own (ALL, auth.uid() = citoyen_id)
- rdv : rdv_citoyen_insert (INSERT, with_check auth.uid()=citoyen_id) + 
        rdv_citoyen_own (SELECT, auth.uid()=citoyen_id)
- users : citoyen_own_profile (ALL, auth.uid() = id)

### ⚠️ 9 TABLES SANS AUCUNE POLICY (verrouillées par défaut grâce à RLS, 
### mais AUCUNE fonctionnalité ne peut les utiliser côté client actuellement) :
admins, annonces, disponibilites, documents_institution, institutions, 
logs_admin, rdv_alertes, services_payants, signalements

Conséquences fonctionnelles concrètes à corriger en Phase 4 :
- Institutions ne peuvent pas lire/modifier leur propre profil
- Annonces publiées invisibles côté client
- Disponibilités inconsultables pour réserver un RDV
- Admins sans policy de gestion d'eux-mêmes
- Signalements, alertes RDV, documents, services payants, logs admin 
  tous inaccessibles côté client

### ⚠️ GRANTS — CONFIGURATION DANGEREUSE CONFIRMÉE
anon ET authenticated ont TOUS les privilèges (SELECT, INSERT, UPDATE, 
DELETE, TRUNCATE, REFERENCES, TRIGGER) sur les 14 tables, SANS DISTINCTION.
Grant générique appliqué partout (14 grants par table = 7 privilèges × 2 rôles).

Risque réel : le jour où une policy est ajoutée sans vigilance sur le rôle 
ciblé, le grant anon déjà présent permettrait un accès public non authentifié 
immédiat — notamment dangereux pour admins et logs_admin.
À corriger : affiner les grants par rôle en même temps que chaque policy 
ajoutée (jamais l'un sans l'autre), retirer anon des tables qui n'en ont 
pas besoin.

## /protocole — NIVEAU GOOGLE/META/UBER/DOORDASH, NON NÉGOCIABLE

### Zéro improvisation
- Zéro donnée inventée : nom de colonne, enum, type, structure de table — 
  si non confirmé par lecture réelle ou requête SQL exécutée par Bryan, 
  ne jamais l'utiliser dans le code
- Zéro hypothèse présentée comme diagnostic — une supposition reste une 
  supposition tant qu'elle n'est pas vérifiée en base ou dans le code réel
- Zéro fausse certitude — "je ne suis pas certain, voici comment vérifier" 
  toujours préférable à une affirmation non fondée
- Zéro fix avant validation explicite : Lire → Diagnostiquer (message 
  séparé) → Attendre validation de Bryan → Corriger seulement après accord

### Zéro dette technique
- TypeScript strict — zéro any, zéro @ts-ignore sans justification écrite validée
- Zéro eslint-disable sans justification
- Zéro TODO en production
- Zéro mock data, zéro donnée hardcodée (OTP '123456' = dette CONNUE et 
  TEMPORAIRE assumée, pas un pattern à reproduire ailleurs)
- 2 fichiers/pages maximum modifiés à la fois — jamais plus
- npx tsc --noEmit → 0 erreur avant de considérer une tâche terminée

### Audit préalable obligatoire — AVANT TOUT CODE
- Avant toute modification de table      → SELECT colonnes réelles
- Avant toute nouvelle policy RLS        → lire les policies existantes 
  (voir section /securite ci-dessus, déjà à jour au 07/07/2026)
- Avant toute nouvelle route API         → lire les routes existantes 
  similaires pour respecter le pattern déjà en place
- Avant toute dépendance ajoutée         → vérifier compatibilité Next.js 
  15 App Router et stack existante
- Avant tout déploiement                 → build Netlify réussi + 
  tsc --noEmit à 0 erreur

### /securite-institutionnelle
Ce système gère des données citoyennes réelles (téléphone, dossiers RDV, 
historique) en lien avec des institutions publiques guinéennes. Traiter 
chaque donnée comme sensible :
- Zéro donnée personnelle exposée avant authentification
- RLS sur toutes les tables, sans exception, à auditer avant tout 
  lancement public (audit du 07/07/2026 = état de départ, pas un état final validé)
- JAMAIS de credentials en dur dans le code
- JAMAIS de console.log de données sensibles en production
- Deux systèmes d'auth cohabitent — chaque nouvelle fonctionnalité doit 
  clarifier explicitement lequel des deux elle utilise

### /stack-specifique
- Next.js 15 App Router — Server Components pour vérifications d'auth, 
  Client Components pour interactivité uniquement
- Tailwind CSS — classes utilitaires cohérentes avec l'existant
- Supabase — client unique dans lib/supabase.ts, jamais de nouvelle 
  instance créée ailleurs (à vérifier que ce fichier existe bien à cet 
  emplacement précis — Phase 2)
- Migrations — toute modification de schéma désormais versionnée dans 
  supabase/migrations/ (actuellement vide — dette à corriger 
  progressivement, pas en un seul chantier)
- JWT admin — ADMIN_JWT_SECRET jamais exposé côté client

### /honnetete
- Si une approche semble incorrecte → le dire clairement, avec les 
  raisons, avant de continuer
- Le briefing peut être partiellement périmé (changement de compte 
  Supabase, plusieurs mois sans ouverture du projet) → revérifier en 
  base avant d'agir dessus, ne jamais supposer qu'un état documenté 
  est toujours vrai
- Chaque bug → reproduit, compris, corrigé, puis vérifié — jamais 
  "corrigé en théorie"
- Chaque livraison → testée réellement (build Netlify, flux end-to-end) 
  avant d'être considérée terminée

### /separation-projets
Yelen224 et Youngouser sont deux bases de code, deux bases de données, 
deux mémoires strictement séparées (Youngouser : project ID 
uaikztzfhregzsnagznw, repo Sempya224/Youngouser, chemin 
C:\Users\Balde224\Documents\GitHub\Youngouser). Ne jamais réutiliser un 
pattern, une décision, ou une donnée de l'un pour l'autre sans demande 
explicite de Bryan.

### /rappel-fondamental
Yelen224 traite des rendez-vous réels de citoyens avec des institutions 
réelles — hôpitaux, mairies, ambassades. Une erreur ici n'est pas 
cosmétique : un rendez-vous manqué à cause d'un bug peut avoir un impact 
réel sur la vie de quelqu'un (accès à un service médical, administratif, 
consulaire). La rigueur n'est pas optionnelle. C'est la baseline.

## /a-verifier — CE QUI RESTE HYPOTHÈSE, PAS FAIT ÉTABLI (Phase 2 à venir)
- Routes réelles présentes dans app/ (le briefing du 30/05 mentionnait 
  institution/*, rdv/*, mon-qr/*, carte/* — PRÉSENCE NON CONFIRMÉE, 
  à vérifier sur disque avant d'en supposer l'existence)
- Emplacement exact et contenu du client Supabase (lib/supabase.ts supposé)
- Mécanisme JWT custom institutions (implémentation non lue)
- Où et comment le middleware.ts (présent à la racine, vu dans 
  l'explorateur) distingue les 3 profils d'auth

## /historique-session — 07/07/2026
- supabase init + supabase link --project-ref pgcabxgrgjgukuagpuhc : faits
- Docker Desktop installé + WSL2 configuré, mais Docker Engine ne démarre 
  pas (machine Braswell, RAM insuffisante ~1.4GB disponible) → abandon 
  de la piste Docker pour ce projet, audit fait entièrement via SQL Editor
- Intégration GitHub (Sempya224/yelen224) connectée au projet Supabase 
  dans Settings > Integrations, working directory "."
- Phase 1 (audit sécurité) terminée le 07/07/2026, résumée ci-dessus
- Phase 2 (audit code sur disque) : prochaine étape
