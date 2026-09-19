# Audit réel du système prestataire / CTA — Phase 0 (17/08/2026)

Document produit en mode **audit read-only strict** — aucune ligne de code
métier écrite ou modifiée pendant cette phase, conformément à la mission.
Méthodologie : 4 agents de lecture directe du code lancés en parallèle
(modèle de données + formulaires admin ; fiche publique + logique CTA ;
recherche globale CTA + architecture RDV ; ouverture de liens externes +
sécurité), chaque affirmation sourcée fichier+ligne, jamais déduite d'un
nom de variable. Statuts stricts utilisés partout : **VERIFIED** / **NOT
VERIFIED** / **IN PROGRESS** / **CLOS** / **BUG CONFIRMED** / **GAP**.

---

## 1. Objectif

Le CEO veut faire évoluer Yelen de `Prestataire → Fiche → Prendre RDV`
vers `Prestataire → Fiche → action principale adaptée à son activité`
(Découvrir, Commander, Réserver, Contacter, avec RDV en action secondaire
quand pertinent). Avant toute décision d'architecture, cette Phase 0
détermine ce que Yelen possède **réellement** aujourd'hui, pour savoir ce
qui est réutilisable sans migration lourde.

---

## 2. État actuel — résumé en une phrase

Le CTA "Prendre RDV" est **hardcodé et inconditionnel** sur toute la
plateforme (aucune des ~20 occurrences trouvées ne vérifie le secteur, les
services ou les disponibilités avant de s'afficher), le seul champ de
typologie réellement actif est `institutions.secteur` (8 valeurs fixes),
et **aucun** `profile_type`, `primary_action`, `booking_url` ou champ
réseaux sociaux n'existe nulle part dans le schéma ou le code — tout ceci
est **VERIFIED** par recherche exhaustive à 0 résultat.

---

## 3. Modèle de données

### 3.1 Origine de la table
La table `institutions` a été créée **hors du dépôt** (dashboard Supabase
/ setup initial non versionné) — `supabase/migrations/` ne contient aucun
`CREATE TABLE institutions`, seulement des `ALTER TABLE` à partir de
`20260709000001_alter_institutions.sql`. Cohérent avec le rappel déjà
présent dans `CLAUDE.md` sur l'historique du projet (compte d'origine
perdu, table reconstruite manuellement). **VERIFIED**.

### 3.2 Colonnes confirmées par migration SQL réelle

| Colonne | Type / contrainte | Statut |
|---|---|---|
| `name`, `logo`, `phone`, `created_at` | text/timestamptz (renommées) | VERIFIED |
| `category` | text, **sans CHECK** | VERIFIED (existe) — voir 3.5, champ mort en écriture |
| `secteur` | text + CHECK 8 valeurs : `sante, administratif, financier, juridique, beaute_bien_etre, commerce, artisanat, services_divers` | VERIFIED |
| `statut_juridique` | text + CHECK 4 valeurs : `public, prive_formel, liberal, individuel_informel` | VERIFIED |
| `niveau_confiance` | text DEFAULT `profil_basique` + CHECK 3 valeurs : `profil_basique, profil_verifie, institution_certifiee` | VERIFIED |
| `website`, `whatsapp` | text | VERIFIED |
| `disponibilites` | jsonb | VERIFIED |
| `document_officiel`, `documents_urls` | text / jsonb | VERIFIED (existent) — **champs morts, voir 3.5** |
| `partenaire_statut` | text DEFAULT `aucun` + CHECK 4 valeurs | VERIFIED |
| `slug` | text UNIQUE + CHECK format | VERIFIED (ajouté pour `/clock/{slug}`) |
| `capacite_par_creneau` | int DEFAULT 1 | VERIFIED — jamais reliée à une vraie logique de réservation (commentaire de la migration elle-même) |
| `conditions_entreprise`, `informations_importantes`, `informations_legales` (+ dates) | text / timestamptz | VERIFIED |

**Colonnes supprimées depuis (à ne jamais réutiliser)** : `mot_de_passe_hash`,
`site_web` (fusionnée dans `website`, dropée par `20260711000003_drop_site_web.sql`
— **voir bug §11**), `responsable_prenom/nom/role` (déplacées vers la
table `institution_responsables`), `paid_rdv_active` (ajoutée puis
supprimée, `20260720000008_drop_paid_rdv_active.sql`).

### 3.3 Colonnes confirmées uniquement par usage applicatif réel (pré-existantes, absentes des migrations)

Source : `SELECT` complet de `app/api/institution/profile/route.ts:25`.

| Colonne | Confirmation | Statut |
|---|---|---|
| `statut` | text simple, **aucune CHECK Postgres trouvée**. Valeurs réellement utilisées : `en_attente`, `validee`, `suspendue`, `refusee` | VERIFIED |
| `plan` | text simple, **aucune CHECK**. Validée côté app avec `['gratuit','premium']` (`app/api/admin/institutions/[id]/plan/route.ts:18`) | VERIFIED — **contredit `CLAUDE.md` qui documente `essentiel/pro/entreprise`, drift déjà signalé, non corrigé** |
| `badge_verifie` | boolean | VERIFIED |
| `adresse`, `ville`, `latitude`, `longitude` | éditables `app/api/institution/profile/route.ts:54,121-125` | VERIFIED — `latitude`/`longitude` sont bien écrites via `LocationPicker` (contrairement à une note `CLAUDE.md` obsolète qui affirmait le contraire) |
| `services` | jsonb, structure `{nom, description, duree_minutes, champs_complementaires}[]` | VERIFIED |
| `horaires` | jsonb, structure `{jour, ouvert, debut, fin}[]` | VERIFIED |
| `email`, `phone`, `whatsapp`, `website` | text | VERIFIED |

### 3.4 Champs demandés explicitement par le CEO — recherche exhaustive, résultat

| Champ recherché | Résultat |
|---|---|
| `profile_type` | **NOT VERIFIED** — 0 occurrence dans tout le dépôt |
| sous-catégorie | **NOT VERIFIED** — 0 occurrence |
| `booking_url` / URL externe générique | **NOT VERIFIED** — 0 occurrence, aucun champ "lien de réservation externe" |
| réseaux sociaux (`facebook`, `instagram`, `tiktok`, `linkedin`) | **NOT VERIFIED** — 0 occurrence |
| Système RDV interne | **VERIFIED indirectement** — existe via les tables `rdv` (gratuit) et `paid_services`/`paid_bookings` (payant), jamais via un champ sur `institutions` lui-même |

### 3.5 Champs morts (existent en base, jamais écrits par un écran produit actuel)

- **`document_officiel` / `documents_urls`** — encore lus et affichés par l'admin (`app/admin/institutions/page.tsx:243`, *"Document officiel : Fourni / Non fourni"*), mais le vrai workflow documentaire depuis juillet 2026 passe par la table dédiée `documents_institution`. **BUG CONFIRMED (fonctionnel)** : l'admin voit "Non fourni" pour toute institution récente ayant pourtant soumis des documents via le vrai circuit.
- **`category`** — le champ le plus **lu** côté produit (30+ fichiers, ex. `app/page.tsx:2079`), mais **jamais écrit** par aucun écran actuel : absent du formulaire d'inscription réellement transmis (`ReviewStep.tsx:72-89` ne l'envoie jamais dans le body JSON, malgré une API qui l'accepterait), absent de `EDITABLE_FIELDS` du dashboard institution, aucune route admin de mutation. **`secteur` est le seul champ de typologie réellement vivant aujourd'hui** — `category` ne doit pas être utilisé comme base d'une nouvelle taxonomie.

---

## 4. Fiche prestataire actuelle

| Élément | Détail |
|---|---|
| **Route** | `app/institution/[id]/page.tsx` (Server Component, SEO uniquement — filtre `statut='validee'` ligne 21) |
| **Page réelle** | `app/institution/[id]/InstitutionPublicClient.tsx` (2081 lignes, `"use client"`, toute la logique y vit) |
| **Composants** | Tous les sous-composants (Stars, SectionTitle, MetaVerifiedBadge, icônes) sont définis localement dans ce même fichier, aucun composant partagé importé |
| **API données** | **Aucune route API dédiée** — requête Supabase directe côté navigateur `supabase.from("institutions").select("*").eq("id", id)` (`:526`), **sans filtre statut côté code** — protégé uniquement par la policy RLS `institutions_public_read` (`USING (statut = 'validee')`, `supabase/migrations/20260709000014_policy_institutions_public_read.sql:6-8`) |
| **CTA principal** | "Prendre RDV" — voir §5, hardcodé sans condition |
| **CTA secondaires** | WhatsApp (toujours affiché, dégrade vers compose générique si `whatsapp` vide), Appeler (conditionnel `phone`), Site web (conditionnel `site_web` — **champ mort, ne s'affiche jamais**, voir bug §11), Email (conditionnel) |
| **Services** | Rendus depuis `inst.services` (jsonb) ; état vide "Services non renseignés" si `length === 0` — **n'affecte pas** le CTA RDV au-dessus |
| **Horaires** | État vide "Horaires non renseignés" si `inst.horaires.length === 0` ; badge Ouvert/Fermé dynamique sinon |
| **Avis** | Aperçu inline + plein écran ; état vide avec CTA secondaire "Prendre rendez-vous" |
| **Questions** | Section citoyenne + formulaire, limité à 2 questions par citoyen côté UI |
| **Vérification** | Badge `badge_verifie` (booléen, accordé par admin) affiché à 2 endroits, strictement conditionnel |

### Où le CTA "Prendre RDV" est-il décidé ?

**Hardcodé, aucune condition.** Deux occurrences identiques :
`InstitutionPublicClient.tsx:1016-1018` (hero) et `:2025-2028` (bandeau
fixe bas d'écran). Aucun `if`/ternaire ne le conditionne à `secteur`, à
`services.length`, à la présence de disponibilités ou à `badge_verifie`.
**VERIFIED.**

### Différenciation par secteur sur la fiche

**Strictement cosmétique** — les 3 seuls usages de `inst.secteur` dans
tout le fichier (`:856-857, 975, 983`) choisissent une couleur d'accent,
une icône et un libellé texte. Aucun secteur ne change le nombre, l'ordre
ou la présence des CTA ni d'aucune section. **VERIFIED.**

### Institution avec secteur mais sans service ni disponibilité

Le bouton "Prendre RDV" reste **visible et cliquable** sur la fiche.
Cliquer redirige vers `app/rdv/[id]/page.tsx`, qui affiche un état vide
explicite si `allServices.length === 0` (`:878-883`, message + retour) —
mais rien n'empêche d'y arriver depuis la fiche. **VERIFIED.**

---

## 5. CTA existants — tableau complet

| Action | Fichier | Ligne | Condition d'affichage |
|---|---|---|---|
| Prendre RDV (hero) | `InstitutionPublicClient.tsx` | 1016-1018 | **Aucune** |
| Prendre RDV (bandeau fixe) | `InstitutionPublicClient.tsx` | 2025-2028 | **Aucune** (visibilité pilotée par le scroll uniquement) |
| WhatsApp (hero) | `InstitutionPublicClient.tsx` | 1019-1021, 867-869 | Toujours affiché, dégrade si `whatsapp` vide |
| WhatsApp (bloc Contacts) | `InstitutionPublicClient.tsx` | 1182-1189 | Conditionnel à `inst.whatsapp` |
| Appeler (hero + Contacts) | `InstitutionPublicClient.tsx` | 1024-1029, 1173-1180 | Conditionnel à `inst.phone` |
| Site web (bloc Contacts) | `InstitutionPublicClient.tsx` | 1200-1207 | Conditionnel à `inst.site_web` — **champ mort, ne s'affiche jamais en pratique** |
| Service → RDV pré-rempli | `InstitutionPublicClient.tsx` | 1282 | Un item par service si `services.length > 0` (seule occurrence déjà conditionnée) |
| Prendre RDV (accueil, raccourci) | `app/page.tsx` | 1093-1098 | Toujours affiché (vers `/recherche`, pas une institution précise) |
| Réserver / Prendre RDV (carte résultat recherche) | `app/recherche/shared.tsx` | 39-42 | Libellé dynamique déjà existant : "Réserver" si secteur ∈ {Transport/Logistique, Pharmacie, Autre}, sinon "Prendre RDV" — **seule trace de personnalisation de libellé par catégorie trouvée dans tout l'audit** |
| Itinéraire Google Maps | `recherche/shared.tsx`, `CarteMapHome.tsx`, `carte/page.tsx` | multiples | Toujours affiché (construit depuis lat/lng internes) |
| Prendre un rendez-vous (popup carte Home) | `CarteMapHome.tsx` | 381-396 | **Aucune condition** |
| CTA offre partenaire | `app/offres/[id]/page.tsx` | 220-234 | Conditionnel à `offre.cta_url` (redirection tracée côté serveur) |

**Constat central : sur ~10 emplacements distincts, "Prendre RDV" pointe
vers `/rdv/{id}` sans jamais vérifier au préalable si l'institution a des
services ou des disponibilités configurés.** Seule l'occurrence
service-par-service (`:1282`) est déjà conditionnée. **VERIFIED.**

`rel="noopener"` est présent partout où `target="_blank"` est utilisé,
sauf quelques occurrences en `rel="noreferrer"` seul (protection
équivalente dans les navigateurs modernes, incohérence stylistique
seulement — pas une faille).

---

## 6. Système RDV

### Pipeline réel (VERIFIED)

```
institutions (statut='validee', RLS)
  → services (colonne institutions.services, jsonb — PAS de table dédiée)
      + paid_services (table séparée, RDV payant)
  → disponibilites (colonne institutions.disponibilites, jsonb, 3 formats acceptés)
  → créneaux générés côté client (lib/disponibilites.ts::generateSlotsInRange, 28 jours glissants)
  → réservation (table rdv)
  → confirmation (statut/presence_status sur rdv)
```

### Une institution peut-elle exister sans RDV ?

**Oui, sans aucun blocage, à toutes les étapes vérifiées — VERIFIED :**
- Inscription (`SignupEngine`, live depuis le 15/08/2026) ne collecte
  jamais services ni disponibilités — seuls secteur/statut_juridique/name/
  ville sont obligatoires (`app/institution/inscription/engine/types.ts:74-76`).
- `POST /api/institution/auth/register` n'écrit ni `services` ni
  `disponibilites` à la création.
- La validation admin (`.../valider/route.ts:20-23`) ne vérifie **aucune**
  présence de services/disponibilités avant de passer `statut='validee'`.

### Un prestataire sans RDV peut-il avoir une fiche publique complète ?

**Oui** — la fiche se charge normalement (seule condition réelle :
`statut='validee'` au niveau RLS), affiche juste un état vide dans la
section Services. Le CTA "Prendre RDV" reste affiché et cliquable
(§4-5). **VERIFIED.**

### Existe-t-il déjà des prestataires avec activité mais sans RDV ?

**NOT VERIFIED** — nécessiterait une requête SQL réelle en base (hors
périmètre de cet audit code, Bryan devra vérifier). Ce qui est confirmé :
rien dans le code n'empêche cet état d'exister.

### Un flag `hasBooking` existe-t-il déjà (même sous un autre nom) ?

**GAP — Aucun équivalent n'existe.** Recherche exhaustive
(`hasBooking|peutReserver|canBook|has_booking|rdv_actif`, etc.) : 0
résultat. Le seul flag booléen proche, `institutions.paid_rdv_active`,
**a été supprimé** de la base (`20260720000008_drop_paid_rdv_active.sql`)
et de toute façon ne gérait qu'un périmètre plus étroit (visibilité des
services payants uniquement, jamais les CTA génériques).

### Recherche/découverte — institutions sans disponibilités

**Non exclues par défaut.** Le filtre "Avec créneaux disponibles"
(`app/recherche/RechercheInner.tsx:558`) est **opt-in, désactivé par
défaut**. `app/carte/page.tsx:36-44` ne filtre même pas le statut côté
code (protection RLS uniquement — documenté comme connu et volontaire
dans le commentaire de la migration RLS elle-même). **VERIFIED.**

### Gap silencieux trouvé dans le wizard

`app/rdv/[id]/page.tsx:878-883` gère explicitement le cas "0 service"
(message clair + retour). En revanche, "services existants mais 0
disponibilité" **dégrade silencieusement** : tout le calendrier devient
désactivé sans aucun message explicite au citoyen (`:645,929-930`).
**GAP.**

**Conclusion pour l'architecture cible** : un flag `hasBooking` calculé à
la volée (`services.length > 0 && disponibilites non vides`) est
**totalement faisable sans migration** — la donnée brute existe déjà, il
manque uniquement la fonction de dérivation et son branchement sur les
CTA.

---

## 7. Champs administratifs

**Constat central : il n'existe aucun formulaire admin de création ou
d'édition des champs d'identité d'une institution.** `app/admin/institutions/page.tsx`
(lu intégralement) ne contient que des actions de statut :

| Action admin | Endpoint | Champ modifié |
|---|---|---|
| Valider | `.../valider/route.ts` | `statut = 'validee'` |
| Refuser | `.../refuser/route.ts` | `statut = 'refusee'` + motif requis |
| Suspendre | `.../suspendre/route.ts` | `statut = 'suspendue'` + motif, durée optionnelle |
| Réactiver | `.../reactiver/route.ts` | `statut = 'validee'` |
| Avertir | `.../avertir/route.ts` | `avertissements += 1` |
| Badge | `.../badge/route.ts` | `badge_verifie` |
| Plan | `.../plan/route.ts` | `plan` (validé `['gratuit','premium']`) |

Aucune route `PUT`/`POST` ne permet à un admin de modifier `name`,
`category`, `secteur`, `description`, `adresse`, `logo`, `services`,
`horaires`. **Tous ces champs sont exclusivement auto-gérés par
l'institution elle-même** via son propre dashboard
(`ProfilEntrepriseTab.tsx` → `PUT /api/institution/profile`).

### Inventaire des champs — édition par l'institution (`ProfilEntrepriseTab.tsx`)

| Champ | Existe | Obligatoire | Note |
|---|---|---|---|
| Identité (`name`) | Oui | Non re-validé au PUT | |
| Catégorie (`category`) | **N'existe pas dans ce formulaire** | — | Absent de `EDITABLE_FIELDS` |
| Secteur/statut juridique | Oui, sélecteur 2 étapes | Validés contre listes CHECK | |
| Description | Oui | Optionnel | |
| Logo / Cover (`banniere`) | Oui, upload | Optionnel | |
| Adresse/ville/quartier | Oui | `ville` obligatoire à l'inscription | |
| Téléphone/WhatsApp/Email | Oui | Optionnels ici | |
| Site web | Oui | Optionnel | |
| Services | Oui, CRUD complet (`ServicesTab.tsx`) | Optionnel | |
| Horaires | Oui | Optionnel (défaut Lun-Ven 8h-17h) | |
| RDV (capacité/créneau) | Oui | — | |
| Réseaux sociaux | **N'existe pas** | — | |
| Vérification (badge) | **Non éditable par l'institution** | — | Admin uniquement |

### Champs collectés à l'inscription (`app/institution/auth/register/route.ts`)

Obligatoires : `phone`, `secteur`, `statut_juridique`, `name`, `ville`,
`responsable_prenom/nom`. Optionnels : `email`, `website`, `description`.
**`category` est accepté par l'API mais jamais transmis par le
formulaire réel** (`ReviewStep.tsx:72-89`) — code mort côté frontend.
Services/disponibilités : jamais collectés à cette étape.

---

## 8. URLs externes

| Champ | Stocké où | Qui modifie | Validé ? | Affiché | Ouverture |
|---|---|---|---|---|---|
| `website` | `institutions.website` (text) | Institution (dashboard) | **Aucune validation** (ni format, ni protocole, ni CHECK DB) | Dashboard institution + demandes partenariat admin | `<a href target="_blank">` brut |
| `site_web` | **Colonne supprimée** (`20260711000003_drop_site_web.sql`) | — | — | Code encore présent mais champ toujours `undefined` | **Bug confirmé, §11** |
| `whatsapp` | `institutions.whatsapp` (text) | Institution | Aucune validation de format, mais neutralisé par construction à l'affichage (`.replace(/\D/g,"")`) | Fiche publique | `wa.me/{digits}` — **safe by construction** |
| `booking_url` / URL externe générique | **N'existe pas** | — | — | — | — |
| réseaux sociaux | **N'existe pas** | — | — | — | — |

**Aucune fonction centralisée d'ouverture de lien externe n'existe** —
chaque écran gère `window.open`/`<a target="_blank">` au cas par cas
(GAP). Tous les `window.open` trouvés ciblent des routes internes ou des
URLs signées Supabase Storage de première partie — **aucun `window.open`
n'ouvre une URL tierce saisie librement**, celles-ci passent exclusivement
par `<a target="_blank">`.

---

## 9. profile_type / catégories

Deux systèmes de typologie coexistent, avec des statuts très différents :

| Système | Statut | Utilisation réelle |
|---|---|---|
| `secteur` (CHECK 8 valeurs) | **Vivant** | Obligatoire à l'inscription, modifiable ensuite, seul champ qui pilote déjà une nuance de libellé CTA (`shared.tsx:39-42`, "Réserver" vs "Prendre RDV") |
| `category` (text libre, sans CHECK) | **Mort en écriture** | Lu par 30+ fichiers mais jamais écrit par aucun écran produit actuel |
| `type` (enum legacy documenté dans CLAUDE.md) | **NOT VERIFIED / mort** | 0 occurrence trouvée dans le code applicatif actuel |
| `niveau_confiance` (CHECK 3 valeurs) | Vivant mais périmètre différent | Confiance/certification, pas un type d'activité |
| `partenaire_statut` (CHECK 4 valeurs) | Vivant | Statut de partenariat Yelen, pas un type de prestataire |

**Réponse à la question essentielle du CEO** : **oui**, `secteur` peut
servir de base pour déterminer un CTA principal sans nouvelle taxonomie
dans un premier temps — c'est le seul champ à la fois (a) réellement
rempli à l'inscription, (b) modifiable par l'institution, et (c) déjà
utilisé une fois pour nuancer un libellé de CTA. Ses 8 valeurs actuelles
(santé, administratif, financier, juridique, beauté_bien_être, commerce,
artisanat, services_divers) ne couvrent cependant pas finement les
exemples du CEO (PME tech, média, restaurant) — mapper `secteur → action
principale` donnerait un premier niveau grossier mais fonctionnel
(ex. `commerce`/`artisanat` → Découvrir/Commander, `services_divers` →
Contacter), à affiner si le besoin de granularité se confirme.

---

## 10. Ouverture externe actuelle

- **Aucun navigateur intégré / WebView / in-app browser n'existe** —
  recherche exhaustive de Capacitor/Cordova/Expo/InAppBrowser/WebView : 0
  résultat dans le code et `package.json`. Seule mention : une checklist
  sécurité **future**, explicitement conditionnée à *"lorsque Yelen native
  commencera"* (`docs/security/YELEN_SECURITY_MASTER.md:667`) — pas une
  fonctionnalité existante.
- **PWA confirmée** : `app/layout.tsx:27` (`manifest: "/manifest.json"`),
  `public/manifest.json` (`display: "standalone"`), service worker
  `public/sw.js` enregistré manuellement (pas de plugin `next-pwa`).
- Tous les liens externes s'ouvrent aujourd'hui en **navigation top-level
  classique** (`target="_blank"`), expulsant l'utilisateur vers le
  navigateur système ou un nouvel onglet — exactement le comportement que
  le CEO veut faire évoluer.
- **Comportement iOS/Android réel non documenté dans le code** — aucune
  mention trouvée sur une différence de comportement d'ouverture de lien
  selon la plateforme. **NOT VERIFIED, nécessiterait un test réel sur
  appareil.**

---

## 11. Sécurité des liens

### BUG CONFIRMED — Sécurité (stored XSS via URL non validée)

**Chaîne complète, preuve par fichier+ligne** :
1. Une institution saisit un `website` de type `javascript:...` via
   `ProfilEntrepriseTab.tsx:343` → `PUT /api/institution/profile`
   (`app/api/institution/profile/route.ts:108-116`) — **aucune validation
   de format, aucun contrôle de protocole**, valeur stockée telle quelle.
2. L'institution soumet une demande de partenariat
   (`app/api/institution/partenariat/route.ts:130`) : `site_web:
   inst.website` copie la valeur malveillante sans contrôle dans
   `institution_partenariat_demandes` (colonne `NOT NULL`, **aucune CHECK
   de format**, `20260726000010_partenariat_yelen.sql:19`).
3. Un admin consulte `app/admin/partenariats/page.tsx:100` — le lien
   `d.site_web` est rendu tel quel dans un `<a href>`, cliqué dans le
   cadre normal du workflow de review → exécution dans le contexte de la
   session admin.
- Nécessite un clic admin (pas un XSS zero-click), mais ce clic est
  l'action normale attendue du flux de modération — vecteur réaliste.
- **Aucune correction appliquée** conformément à la règle de cette phase
  (documentation uniquement).

### BUG CONFIRMED — Fonctionnel (lien mort)

Le bouton "Site web" de la fiche publique (`InstitutionPublicClient.tsx:1200-1207`)
lit `inst.site_web` — colonne **supprimée** de la base depuis
`20260711000003_drop_site_web.sql` (fusionnée dans `website`). Le code
n'a jamais été mis à jour : `r.site_web` vaut toujours `undefined`, donc
ce bouton **ne s'affiche jamais** sur la fiche publique, alors que
`website` est bien renseigné en base et utilisé ailleurs (dashboard,
partenariat). Effet de bord accidentel : réduit l'exposition citoyenne au
bug de sécurité ci-dessus, mais reste une vraie régression produit.

### Autres constats sécurité

| Sujet | Verdict |
|---|---|
| WhatsApp | VERIFIED safe by construction (`.replace(/\D/g,"")` neutralise tout payload) |
| `rel="noopener/noreferrer"` | Incohérent (parfois `noreferrer` seul) mais non exploitable — `noreferrer` implique déjà `noopener` |
| CSP | Existe (`middleware.ts:80-120`) mais **Report-Only**, non bloquante — gap déjà documenté et tracé en interne (`GAP-16-01`). N'aurait de toute façon pas bloqué le vecteur `javascript:` (clic direct sur `<a href>`, hors périmètre CSP) |
| Validation de format URL (institution ou admin) | **GAP total** — aucune, à aucune étape de la chaîne (formulaire → API → DB) |

---

## 12. Architecture potentiellement réutilisable

- **`secteur`** — champ de typologie vivant, réutilisable en premier
  niveau pour dériver un CTA principal (voir §9).
- **`services` (jsonb) + `paid_services`/`paid_bookings`** — deux
  systèmes de service déjà distincts et fonctionnels, base exploitable
  pour différencier "a des services à vendre" vs "propose du RDV".
- **`disponibilites` (jsonb) + `generateSlotsInRange`** — donnée brute
  suffisante pour dériver un flag `hasBooking = services.length > 0 &&
  disponibilites non vides` **sans aucune migration**, uniquement une
  fonction de dérivation à écrire et à brancher sur les CTA existants.
- **Libellé CTA déjà dynamique par catégorie** — `app/recherche/shared.tsx:39-42`
  prouve que le pattern "CTA texte différent selon le type d'institution"
  existe déjà ailleurs dans le code, juste jamais généralisé à la fiche
  elle-même.

---

## 13. Gaps (capacité absente, pas nécessairement un bug)

1. Aucun `profile_type` / `primary_action` / `secondary_actions[]`.
2. Aucun champ réseaux sociaux.
3. Aucun `booking_url` externe.
4. Aucun flag `hasBooking` (dérivable sans migration, voir §12).
5. Aucune fonction centralisée d'ouverture de lien externe.
6. Aucune validation de format d'URL nulle part dans la chaîne (institution/admin).
7. CSP en mode Report-Only (non bloquante), déjà connu en interne.
8. Aucun formulaire admin d'édition de fiche institution.
9. Wizard RDV : dégradation silencieuse quand services existent mais 0 disponibilité (pas de message explicite).
10. Comportement d'ouverture de lien iOS/Android non documenté, jamais testé sur appareil réel dans cet environnement.

---

## 14. Bugs confirmés

1. **BUG CONFIRMED — Sécurité** : stored XSS via `website` non validé,
   chaîne complète jusqu'à l'admin (§11).
2. **BUG CONFIRMED — Fonctionnel** : lien "Site web" mort sur la fiche
   publique (`inst.site_web`, colonne supprimée) (§11).
3. **BUG CONFIRMED — Fonctionnel** : admin affiche "Document officiel :
   Non fourni" pour des institutions ayant pourtant soumis des documents
   via le vrai circuit (`documents_institution`), car l'écran lit encore
   la colonne morte `institutions.document_officiel` (§3.5).
4. **Drift déjà documenté, non corrigé** : `plan` valide
   `['gratuit','premium']` côté code contre `essentiel/pro/entreprise`
   documenté dans `CLAUDE.md` (§3.3).

---

## 15. Proposition de modèle cible (à valider, non implémentée)

**Rien de ceci n'est construit — proposition à discuter avant toute Phase 1.**

Architecture envisageable **sans migration lourde initiale**, en
réutilisant l'existant :

```
Prestataire (institutions, inchangé)
    │
    ├── secteur (existant, réutilisé comme 1er niveau de typologie)
    ├── hasBooking (dérivé à la volée : services.length > 0 && disponibilites non vides — 0 migration)
    ├── primary_action (NOUVEAU — soit dérivé de secteur par une table de mapping en code,
    │                    soit un vrai champ si le mapping automatique s'avère insuffisant)
    ├── services[] (existant, jsonb)
    ├── contact_methods (existant, dispersé : phone/whatsapp/email/website)
    └── external_links (NOUVEAU si besoin de réseaux sociaux/booking_url — vrai gap DB)
```

Deux niveaux de décision distincts pour le CEO :
- **Sans migration** : dériver `primary_action` depuis `secteur` en code
  (table de correspondance), avec RDV toujours proposé en secondaire si
  `hasBooking` est vrai. Corrige aussi de facto le problème "CTA RDV menant
  à un état vide" (§4/§6).
- **Avec migration légère** : ajouter `primary_action` (text + CHECK) si
  le mapping automatique par secteur s'avère trop grossier pour les
  exemples cités (Nimba SMS, BilletFacile, MansaTalent) — ces cas
  précis sont tous `secteur` probablement `services_divers` ou
  `commerce` aujourd'hui, donc indistinguables entre eux par `secteur`
  seul.

---

## 16. Questions ouvertes

1. Le mapping `secteur → action principale` est-il suffisant pour les cas
   cités par le CEO (PME tech, commerçant, média, restaurant,
   professionnel), sachant que `secteur` n'a que 8 valeurs génériques ?
2. Faut-il un vrai champ `primary_action`/`profile_type` dès maintenant,
   ou le dérivé-par-secteur suffit-il en V1 ?
3. Le champ `category` mort en écriture doit-il être réactivé, remplacé,
   ou définitivement abandonné au profit de `secteur` ?
4. Le bug XSS (§11, §14-1) doit-il être corrigé immédiatement (hors
   périmètre de cette phase d'audit, mais signalé comme prioritaire) ou
   attendre un chantier sécurité dédié ?
5. Le navigateur intégré (in-app browser) évoqué en vision produit
   nécessite une étude technique séparée (capacités réelles PWA iOS/Safari
   vs Android/Chrome) — qui n'a pas pu être menée dans cet environnement
   (pas d'accès à un appareil réel). À prévoir avant toute Phase 1 sur ce
   point précis.
6. Faut-il un formulaire admin d'édition de fiche institution (aujourd'hui
   inexistant), ou l'auto-déclaration exclusive par l'institution
   reste-t-elle le modèle voulu ?

---

## 17. Tableau de statut

| Élément | Statut | Preuve |
|---|---|---|
| Modèle de données `institutions` cartographié | CLOS | §3, 4 agents, migrations + code applicatif |
| Fiche prestataire cartographiée | CLOS | §4, `InstitutionPublicClient.tsx` lu intégralement |
| CTA existants recensés | CLOS | §5, recherche globale exhaustive |
| Système RDV cartographié | CLOS | §6, pipeline complet tracé |
| Champs admin inventoriés | CLOS | §7 — constat : formulaire admin inexistant |
| URLs externes cartographiées | CLOS | §8 |
| profile_type / catégories audité | CLOS | §9 |
| Ouverture externe actuelle documentée | CLOS pour le code ; NOT VERIFIED pour le comportement réel iOS/Android | §10 |
| Sécurité des liens auditée | CLOS | §11 — 2 bugs confirmés, non corrigés (hors périmètre) |
| Architecture réutilisable identifiée | CLOS | §12 |
| Existence de prestataires sans RDV en base réelle | **NOT VERIFIED** | nécessite une requête SQL par Bryan |
| Proposition de modèle cible | **IN PROGRESS** — proposée, non validée par le CEO | §15 |

---

## RÉSUMÉ CEO

**CE QUE YELEN A DÉJÀ**
- `secteur` : champ de typologie vivant, obligatoire à l'inscription, modifiable, déjà utilisé une fois pour nuancer un libellé CTA.
- Deux systèmes de services distincts et fonctionnels (`services` jsonb gratuit + `paid_services`/`paid_bookings` payant).
- Un pipeline RDV complet (services → disponibilités → créneaux → réservation → confirmation) déjà opérationnel.
- Une PWA réelle (manifest + service worker), sans navigateur intégré.

**CE QUI EST RÉUTILISABLE**
- `secteur` comme 1er niveau de mapping vers un CTA principal, sans migration.
- Un flag `hasBooking` dérivable à la volée depuis les données déjà stockées (`services`/`disponibilites`), sans migration.
- Le pattern "libellé CTA dynamique par type" existe déjà dans la recherche (`shared.tsx:39-42`), juste jamais porté sur la fiche elle-même.

**CE QUI MANQUE**
- `profile_type`/`primary_action`/`secondary_actions[]`/`external_links[]`/réseaux sociaux : 0 existant, à créer si le mapping par `secteur` seul s'avère insuffisant.
- Fonction centralisée d'ouverture de lien externe.
- Formulaire admin d'édition de fiche institution (n'existe pas du tout aujourd'hui).
- Navigateur intégré / in-app browser (vision long terme, rien n'existe).

**BUGS CONFIRMÉS**
1. Stored XSS via `website` non validé, chaîne complète jusqu'à une session admin (§11, §14-1) — **non corrigé, hors périmètre de cette phase**.
2. Lien "Site web" mort sur la fiche publique — colonne DB supprimée, code jamais mis à jour (§11, §14-2).
3. Admin affiche "Document officiel : Non fourni" à tort pour des institutions ayant réellement soumis des documents (§3.5, §14-3).
4. Drift déjà documenté `plan` (`gratuit/premium` code vs `essentiel/pro/entreprise` doc), non corrigé (§14-4).

**GAPS**
Liste complète en §13 — les plus structurants : aucun flag `hasBooking` existant (mais dérivable sans migration), aucune validation d'URL nulle part dans la chaîne, CSP non bloquante, comportement d'ouverture de lien iOS/Android jamais testé sur appareil réel.

**CE QUI PEUT ÊTRE FAIT SANS MIGRATION**
- Dériver `hasBooking` et un `primary_action` de premier niveau depuis `secteur` existant, entièrement en code.
- Corriger le CTA RDV pour qu'il ne soit plus systématiquement dominant (logique de branchement en code uniquement).
- Réparer le lien "Site web" mort (utiliser `website` au lieu de `site_web`).

**CE QUI NÉCESSITE UNE ÉVOLUTION DU MODÈLE**
- Un vrai champ `primary_action`/`profile_type` si le mapping automatique par `secteur` (8 valeurs génériques) s'avère trop grossier pour distinguer PME tech / commerçant / média / restaurant / professionnel entre eux.
- Réseaux sociaux et `booking_url` externe si le CEO les juge nécessaires au modèle cible.
- Un formulaire admin d'édition (actuellement inexistant) si l'admin doit pouvoir intervenir sur ces nouveaux champs.

**RISQUES TECHNIQUES**
- Le bug XSS (§11) est un risque de sécurité réel et actif, indépendant de cette évolution produit — à trancher séparément et rapidement selon la gravité perçue par le CEO.
- Toute nouvelle logique de CTA basée sur `secteur` hérite du fait que ce champ n'a que 8 valeurs pensées pour des institutions civiques (santé, administratif...) — pas calibrées pour PME tech/commerçants/médias, risque de mapping grossier ou de classe "fourre-tout" (`services_divers`) surchargée.
- Aucun test réel du comportement d'ouverture de lien sur iOS/Android n'a pu être fait dans cet environnement — toute promesse de "retour facile vers Yelen" via navigateur intégré doit être validée techniquement avant d'être promise au produit.

**PROPOSITION D'ARCHITECTURE**
Voir §15 — approche en 2 temps : (1) dérivation par code depuis `secteur` existant, zéro migration, corrige déjà le problème central (CTA RDV toujours dominant) ; (2) migration légère (`primary_action` + éventuels `external_links`) seulement si le niveau (1) s'avère insuffisant en pratique, décision à prendre après un premier retour d'usage.

---

**Aucun code n'a été écrit pendant cette phase. Aucune Phase 1 ne
commence avant validation explicite du CEO sur les points ouverts en
§16 et sur la proposition d'architecture en §15.**
