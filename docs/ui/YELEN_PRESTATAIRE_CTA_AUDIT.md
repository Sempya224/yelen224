# Audit CTA dynamique — Fiche Prestataire Yelen (17/08/2026)

Suite directe de `docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT.md` (Phase 0) et
`docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT_PHASE_0_5.md` (Phase 0.5, security
blocker + validation du modèle). **Aucun code, aucune migration, aucun
composant, aucun changement de CTA ou de comportement de lien externe
n'a été écrit pendant cet audit.** Chaque affirmation ci-dessous est
sourcée fichier:ligne, vérifiée par lecture directe (pas seulement
reprise des 4 recherches préparatoires — les points les plus
structurants ont été re-lus personnellement avant rédaction).

Objectif : déterminer si/comment le CTA principal de la fiche
prestataire (aujourd'hui "Prendre RDV" partout) peut devenir piloté par
les **capacités réelles** du prestataire (booking, site web, WhatsApp,
catalogue...) plutôt que par un futur champ `profile_type` artificiel.

---

## 1. État actuel

Le produit affiche un CTA de réservation ("Prendre RDV" / "Réserver")
de façon **quasi omniprésente et inconditionnelle** à chaque point
d'entrée citoyen vers une institution : fiche complète (2 boutons),
bottom-sheet carte accueil, cartes de recherche, page ambassades
statique. **Seul le wizard `/rdv/[id]` lui-même** vérifie réellement
l'existence de services et de créneaux disponibles avant de laisser le
citoyen avancer (`app/rdv/[id]/page.tsx:878-899`, état vide explicite
si `allServices.length === 0`). Autrement dit : le produit peut
aujourd'hui inviter un citoyen à "Prendre RDV" chez un prestataire qui
n'a ni service ni créneau configuré, et ne le découvre qu'après le
clic, une fois dans le wizard.

Le seul CTA du produit **déjà piloté par une vraie donnée de
disponibilité de l'action** est celui des Offres partenaires
(`app/offres/[id]/page.tsx:220-235`, conditionné par `offre.cta_url`)
— un système totalement séparé du modèle prestataire/RDV.

---

## 2. Modèle de données réel

### `institutions` — colonnes effectivement utilisées dans le code

Select le plus complet trouvé : `app/api/institution/profile/route.ts:26`
— `id,name,category,secteur,statut_juridique,ville,logo,badge_verifie,
moyenne_avis,nb_avis,description,phone,whatsapp,email,website,
created_at,statut,plan,adresse,quartier,latitude,longitude,
disponibilites,disponibilites_modifie_le,disponibilites_modifie_par,
banniere,annee_creation,capacite,capacite_par_creneau,langue,services,
horaires,conditions_prestataire_acceptees_le,conditions_entreprise,
informations_importantes,informations_legales,
conditions_entreprise_le,informations_importantes_le,
informations_legales_le,partenaire_statut`.

Colonnes additionnelles confirmées ailleurs : `avertissements`,
`document_officiel` (`app/api/admin/institutions/route.ts:23`),
`niveau_confiance` (`app/api/admin/institutions/[id]/verification/route.ts:21`),
`slug` (unique, obligatoire depuis migration `20260805000010`, portail
Clock In `/clock/{slug}` — `app/api/institution/auth/register/route.ts:207-233`).

**`EDITABLE_FIELDS`** (ce qui est réellement écrivable par
l'institution, `app/api/institution/profile/route.ts:55`) : `name,
ville, quartier, adresse, description, logo, website, email, phone,
whatsapp, banniere, annee_creation, capacite, capacite_par_creneau,
langue, services, horaires, conditions_entreprise,
informations_importantes, informations_legales, latitude, longitude`
— `secteur`/`statut_juridique` gérés séparément lignes 142-173 (whitelist
stricte).

⚠️ **Correction d'une affirmation obsolète de CLAUDE.md** : `latitude`/
`longitude` **sont** dans `EDITABLE_FIELDS` (ligne 55) et validées par
bornes (lignes 135-140), commentaire ligne 132-134 confirmant qu'un
`LocationPicker` existe côté client pour les envoyer — contredit
CLAUDE.md `/backlog-produit` ("aucun écran ne permet... jamais écrites").
Point à signaler à Bryan pour mise à jour de CLAUDE.md, hors périmètre
de cet audit.

### `secteur` — classification vivante, 8 valeurs

`lib/secteurs.ts:9-23` : `SECTEUR_LABELS`/`SECTEUR_META`, 8 clés
(`sante, administratif, financier, juridique, beaute_bien_etre,
commerce, artisanat, services_divers`). CHECK confirmé en base :
`supabase/migrations/20260710000001_onboarding_prestataire.sql:12-13`.
Lu pour une vraie logique (pas juste affiché) : suggestions de service
(`ServicesTab.tsx:710`), whitelist serveur écriture (`profile/route.ts:79,142-147`
et `register/route.ts:17`), recherche texte (`RechercheOverlay.tsx:237`).

### `category` — vivante mais silencieusement cassée pour les nouvelles institutions

**Constat majeur, contredit le commentaire "dépréciée" de
`lib/secteurs.ts:6-8`.** `category` pilote encore de la vraie logique :
- Filtre serveur actif sur `/recherche` : `app/recherche/RechercheInner.tsx:846`.
- Libellé du CTA principal ("Réserver" vs "Prendre RDV") :
  `app/recherche/shared.tsx:39-42` (`CATEGORIES_RESERVATION`/`libelleAction`,
  confirmé par lecture directe ci-dessous).
- Icône/gradient de carte : `CAT_META` (`app/recherche/shared.tsx:24-35`,
  confirmé par lecture directe — 10 valeurs françaises avec accents,
  ex. `"Hopital / Clinique"`, `"Banque / Microfinance"`, `"Autre"`).
- KPIs admin (`app/api/admin/kpis/route.ts:62,87,128`), export CSV
  (`app/api/admin/export/route.ts:82`).

**Mais l'écriture est cassée depuis le passage à `secteur`** :
`app/api/institution/auth/register/route.ts:242` — `...(typeof category
=== 'string' && category.trim() ? { category: category.trim() } : {})`
— n'écrit `category` **que si le body le fournit**. Grep exhaustif sur
`app/institution/inscription/**/*.tsx` (le wizard d'inscription actuel) :
**0 occurrence de `category`** — confirmé directement, aucun écran
n'envoie ce champ. Toute institution créée depuis le passage à `secteur`
a donc `category = NULL`, et `CAT_META["Autre"]` sert de repli partout
(`app/recherche/shared.tsx:59,134` : `CAT_META[inst.category] ||
CAT_META["Autre"]`) — le filtre catégorie de `/recherche` est
**opérant sur le code mais mort en pratique** pour toute institution
récente. Bug fonctionnel réel, indépendant du chantier CTA, signalé ici
pour mémoire (voir §15).

`type_institution` (enum hopital/mairie/banque/ambassade/autre,
CLAUDE.md `/enums`) : **NOT VERIFIED** — aucune occurrence dans le code
applicatif (seul CLAUDE.md le mentionne), nécessite une requête SQL
(`SELECT enum_range(NULL::type_institution)`) par Bryan pour confirmer
s'il existe encore et s'il est attaché à une colonne active.

### `services` (jsonb) vs `paid_services`/`paid_bookings` — deux catalogues indépendants

- **`institutions.services`** (jsonb, "offre générale" gratuite/vitrine) :
  structure `{ nom, description, duree_minutes, champs_complementaires }`
  (`ServicesTab.tsx:586-601,605-613`), sauvegardée via `PUT
  /api/institution/profile`. La fiche publique n'affiche que `.nom`
  (`InstitutionPublicClient.tsx:129-147`, bug historique "[object
  Object]" corrigé le 27/07/2026 selon commentaire ligne 123-129).
- **`paid_services`/`paid_bookings`** : tables SQL séparées, réservations
  payantes réelles, gérées par `app/api/institution/services/route.ts`
  (service role, `paid_services` policy SELECT anon `is_active=true`
  uniquement, `paid_bookings` aucune policy — verrouillé volontairement,
  commentaire lignes 6-14). Colonnes confirmées `app/api/institution/services/route.ts:66-78`.
- **Aucune clé commune** entre les deux — deux systèmes de catalogue
  distincts, gérés par deux UI dans le même onglet dashboard.

### `horaires` vs `disponibilites` — deux jsonb distincts, deux libs distinctes

- **`disponibilites`** : `lib/disponibilites.ts:1-8` (commentaire),
  tableau de chaînes (ISO / hebdo "Lundi 09:00" / quotidien "09:00"),
  parsé par `generateSlotsInRange(raw, days)` (lignes 20-75, confirmé
  directement par un agent avec lecture ligne à ligne des 3 regex).
  Sortie : `{ key, dateRdv, heureRdv }[]`, triée.
- **`horaires`** : `lib/horaires.ts:9-24` (`parseHoraires`), format
  objet `{ jour, ouvert, debut, fin }` (nouveau) ou `{ jour|day,
  heures|hours }` texte libre (ancien, `ouvert` déduit du mot "ferm").
  Utilisé pour le badge Ouvert/Fermé (`isOuvertNow`, lignes 26-38).
- ⚠️ Bug déjà documenté (CLAUDE.md `/backlog-produit`,
  `components/CarteMapHome.tsx::getStatus()`) : le format attendu par
  ce composant ne correspond pas au format réel écrit par l'écran
  Disponibilités — non corrigé, sans lien avec ce chantier.

### `website`, `phone`, `whatsapp`, `email` — colonnes texte simples

Confirmé `InstitutionPublicClient.tsx:542-545` : castées `String(...)`
depuis `select("*")`, aucune sous-structure. `website` est le seul
champ URL validé strictement (allow-list http(s), voir P0 §16 du doc
Phase 0.5) — `phone`/`whatsapp`/`email` n'ont aucune validation de
format, ni à l'écriture ni à l'affichage (hors périmètre XSS, ce sont
des liens `tel:`/`mailto:`/`wa.me`, pas des `href` de type URL libre).

### `statut` — 4 valeurs, RLS comme seul filet de sécurité réel

Valeurs confirmées par le code d'écriture admin : `validee`
(`.../valider/route.ts:22`, `.../reactiver/route.ts:18`), `refusee`
(`.../refuser/route.ts:31`), `suspendue` (`.../suspendre/route.ts:42`),
`en_attente` (valeur par défaut, **NOT VERIFIED** — non écrite
explicitement dans `register/route.ts`, probablement défaut colonne
DB, à confirmer par Bryan).

Policy RLS confirmée par lecture directe —
`supabase/migrations/20260709000014_policy_institutions_public_read.sql:6-8` :
```sql
CREATE POLICY institutions_public_read ON institutions
  FOR SELECT TO anon, authenticated
  USING (statut = 'validee');
```
Le commentaire de la migration (lignes 1-4) précise qu'elle a été
ajoutée en filet de sécurité DB après un bug applicatif réel (filtre
`"active"` invalide côté `/recherche`, absence totale de filtre côté
`/carte`) — c'est **cette policy**, pas un filtre applicatif, qui
protège `InstitutionPublicClient.tsx:527` (`select("*").eq("id", id)`,
sans filtre `statut` explicite) contre l'exposition publique d'une
institution non validée.

---

## 3. Capacités réellement disponibles

| Capacité | Donnée source | Dérivable aujourd'hui ? | Preuve |
|---|---|---|---|
| **Booking** (RDV réel) | `services`/`paid_services` non vides ET `generateSlotsInRange(disponibilites)` non vide | **Oui**, mais non calculé nulle part sur la fiche publique aujourd'hui (voir §6) | `lib/disponibilites.ts:20-75`, `app/rdv/[id]/page.tsx:618-645` |
| **Site web** | `website` (validé http(s) post-P0) | Oui, déjà calculé (`websiteHref`, `InstitutionPublicClient.tsx:865`) | `lib/urlValidation.ts:53-73` |
| **WhatsApp** | `whatsapp` | Partiellement — un `whatsappUrl` **existe toujours** même sans `whatsapp` renseigné (fallback générique `https://wa.me/?text=...`), donc ce n'est **pas un booléen fiable "a WhatsApp"** en l'état | `InstitutionPublicClient.tsx:871-874` (à vérifier lignes exactes du fallback, confirmé par un agent, non re-lu ligne à ligne par moi — **VERIFIED par agent uniquement**) |
| **Téléphone** | `phone` (truthy) | Oui, déjà gardé partout (`{inst.phone && ...}`) | `InstitutionPublicClient.tsx:1029,1178`, `CarteInstitutionCard` (`app/recherche/shared.tsx:175`, confirmé par lecture directe) |
| **Email** | `email` (truthy) | Oui, déjà gardé | `InstitutionPublicClient.tsx:1191` (garde confirmée par agent) |
| **Secteur** (classification) | `secteur`, 8 valeurs | Oui, mais **insuffisant seul** (conclusion déjà actée Phase 0.5 §4) | `lib/secteurs.ts:9-23` |
| **Category** (classification alternative) | `category` | Oui pour les anciennes institutions, **NULL pour toute institution créée via le wizard actuel** (§2) | `register/route.ts:242` + grep wizard = 0 résultat |
| **CTA offre externe** | `offre.cta_url` (table `offres`, hors `institutions`) | Oui, seul système déjà 100% capacité-driven du produit | `app/offres/[id]/page.tsx:220-235` |

---

## 4. Cartographie des CTA (vue produit)

| Surface | CTA affiché | Piloté par |
|---|---|---|
| Fiche complète — hero | "Prendre RDV" | Rien (toujours visible) |
| Fiche complète — bandeau fixe bas | "Prendre RDV" | Rien (visibilité = scroll, pas donnée métier) |
| Fiche complète — état vide avis | "Prendre rendez-vous" | `nbAvis === 0` (pas la réservabilité) |
| Fiche complète — quota questions | "Prendre rendez-vous" | `mesQuestions.length >= 2` (pas la réservabilité) |
| Bottom-sheet carte accueil | "Prendre un rendez-vous" | Rien (toujours visible) |
| Cartes recherche (grille + liste) | "Réserver" ou "Prendre RDV"/"RDV" | **Libellé** dérivé de `category` (`CATEGORIES_RESERVATION`), **présence** toujours visible |
| Carte `CarteInstitutionCard` (partagée recherche/overlay) | "Voir la fiche" (pas un CTA RDV direct) | — (mène à la fiche, pas au wizard) |
| Page Ambassades | "📅 Prendre RDV — {ville}" | Rien — donnée source 100% statique (`AMBASSADES`, tableau codé en dur, aucune institution réelle liée) |
| Fiche Offre | Libellé variable ("Accéder à l'offre" ou `cta_label`) | `offre.cta_url` (vraie donnée) |
| Wizard `/rdv/[id]` (destination finale) | Étape service / état vide | `allServices.length`, `dayStatus()`/`remainingFor()` (vraies données) |

---

## 5. Cartographie détaillée "Prendre RDV" — statuts

**HARDCODÉ** (toujours affiché, aucun lien avec les données réelles) :
- `InstitutionPublicClient.tsx:1021-1023` (CTA hero) — **confirmé par
  lecture directe** : `<Link href={`/rdv/${inst.id}`}>...Prendre
  RDV</Link>`, aucune garde JSX autour.
- `InstitutionPublicClient.tsx:2031-2033` (bandeau fixe) — **confirmé
  par lecture directe** : même `href`, seule la `transform`
  (`ctaVisible`, état de scroll UI) contrôle la visibilité, jamais une
  donnée métier.
- `components/CarteMapHome.tsx:381-396` — **confirmé par lecture
  directe** : `<a href={`/rdv/${inst.id}`}>...Prendre un
  rendez-vous</a>`, aucune condition.
- `app/recherche/RechercheInner.tsx:74-76,1421` — présence du badge CTA
  toujours rendue (seul le libellé varie).
- `app/ambassades/page.tsx:312-314` — CTA sur donnée 100% statique, ne
  pointe même pas vers une institution réelle (redirige vers
  `/recherche?pays=...`).

**CONDITIONNEL** (condition présente mais sans lien avec la réservabilité) :
- `InstitutionPublicClient.tsx:1649` — condition `nbAvis === 0`.
- `InstitutionPublicClient.tsx:1854` — condition `mesQuestions.length >= 2`.

**DÉRIVÉ D'UNE DONNÉE RÉELLE** :
- `app/rdv/[id]/page.tsx:878-899` — `allServices.length === 0` (fusion
  `institutions.services` + `paid_services.is_active`).
- `app/rdv/[id]/page.tsx:652-660` — `dayStatus()`/`remainingFor()`
  (créneaux réels + capacité réelle via `/api/rdv-disponibilite`).
- `app/offres/[id]/page.tsx:220-235` — `offre.cta_url`.
- Libellé seul (pas la présence) : `app/recherche/shared.tsx:39-42`.

**Écart principal à retenir** : le produit invite quasi systématiquement
à "Prendre RDV" sans jamais vérifier en amont si le prestataire a
réellement quelque chose à réserver — seul le wizard le découvre, après
coup, via un état vide explicite déjà bien géré (`app/rdv/[id]/page.tsx:878-883`).

---

## 6. Dérivation possible de `hasBooking`

**Formule confirmée toujours valide après le chantier P0** (P0 n'a
touché que le rendu de `website`, jamais `lib/disponibilites.ts` ni les
tables `paid_services`/`paid_bookings`) :

```
hasBooking = (services.length > 0 || paid_services_actifs.length > 0)
             && generateSlotsInRange(disponibilites, N).length > 0
```

- `generateSlotsInRange` (`lib/disponibilites.ts:20-75`) : un tableau
  vide en sortie signifie fiablement "aucun créneau réel" — aucune
  valeur par défaut, aucun créneau factice, confirmé par lecture ligne
  à ligne du parsing (3 regex, `continue` sur toute entrée invalide,
  ligne 27 pour `raw` non-array).
- `generateSlotsInRange` **n'est appelée nulle part dans
  `InstitutionPublicClient.tsx`** aujourd'hui (0 occurrence, confirmé
  par grep exhaustif du fichier) — elle sert dans 4 autres endroits :
  `app/rdv/[id]/page.tsx:645`, `DisponibilitesTab.tsx:237`,
  `lib/analyseHeatmap.ts:75`, `app/api/citoyen/favoris/route.ts:169`.
- **Gap concret pour une future implémentation** : `paid_services actifs`
  n'est **pas chargé** dans `InstitutionPublicClient.tsx` aujourd'hui
  (aucune requête `paid_services` dans ce fichier) — seul
  `inst.services.length` (services gratuits) y est vérifié
  (lignes 891, 1044, 1278, confirmé par agent). Calculer un vrai
  `hasBooking` sur la fiche publique nécessiterait donc d'ajouter une
  requête `paid_services` (filtrée `is_active=true`, même logique que
  `app/rdv/[id]/page.tsx:584-601`) — travail applicatif réel, mais
  **sans nouvelle colonne DB**.

**Statut** : DERIVABLE — preuve par le code complète, avec un gap
identifié (donnée non encore chargée à l'endroit voulu, pas un manque
structurel).

---

## 7. Données manquantes

- **Pas de type `Institution` unique et partagé.** Deux définitions
  distinctes et incompatibles coexistent :
  - `InstitutionPublicClient.tsx:24-34` — type local, non exporté,
    utilisé uniquement dans ce fichier.
  - `app/recherche/shared.tsx:15-22` — `export type Institution`
    (confirmé par lecture directe), forme différente (inclut
    `latitude`/`longitude`/`statut` en champs obligatoires, pas
    `website`/`whatsapp`/`services`), consommée par
    `RechercheInner.tsx`, `RechercheOverlay`, et `CarteInstitutionCard`.
  - Un champ "capacités" calculé pour l'un ne bénéficie donc pas
    automatiquement à l'autre.
- **`paid_services` actifs non chargés** sur la fiche publique (voir §6).
- **`category` NULL pour toute institution récente** (§2) — si une
  future logique de CTA s'appuie sur `category` en complément de
  `secteur`, elle héritera de cette donnée cassée pour tout prestataire
  créé depuis le passage au wizard `secteur`.
- **`type_institution` (enum hopital/mairie/banque/ambassade/autre)** :
  NOT VERIFIED en base, aucune trace dans le code applicatif.
- **Aucune variable de capacités consolidée** dans
  `InstitutionPublicClient.tsx` — chaque capacité est soit une variable
  ad hoc (`websiteHref`, `whatsappUrl`), soit un accès direct gardé au
  point d'usage (`inst.phone &&`, `inst.services.length`).
- **Page Ambassades non reliée à des institutions réelles** — `AMBASSADES`
  est un tableau statique codé en dur (`app/ambassades/page.tsx:16-45+`,
  aucun `id`, pas de table Supabase) — un CTA capacité-driven ne peut
  pas s'y appliquer sans une décision produit séparée (relier ces
  données à de vraies lignes `institutions`, ou exclure cette page du
  périmètre CTA dynamique).

---

## 8. Contraintes techniques

- **Aucun système d'actions itérable existant** pour les canaux de
  contact/réservation. Le seul pattern `.map()` du fichier est `TABS`
  (`InstitutionPublicClient.tsx:888-893`, rendu ligne 1118) — mais il
  gère la navigation par ancre (Info/Horaires/Services/Avis), pas les
  actions de contact. La section "Contacts" (lignes 1165-1214) et le
  bloc CTA hero (1020-1035) sont **chacun du JSX répété en dur**, pas
  une liste pilotée par données — un futur système de capacités devrait
  être créé de novo, pas branché sur un mécanisme existant.
- **Deux patterns de rendu incohérents** entre la section Contacts et
  le bloc CTA hero (styles, structure, gardes différentes) — un
  refactor vers un composant partagé toucherait les deux.
- **Le calcul de capacités le plus naturel** vivrait entre les lignes
  857-893 de `InstitutionPublicClient.tsx` (à côté de `ouvert`,
  `websiteHref`, `whatsappUrl` déjà calculés là), ou dans le mapping
  Supabase→`Institution` (lignes 530-555) si le champ doit être stocké
  sur `inst` plutôt que recalculé localement.
- **Propager un système de capacités aux cartes de recherche/accueil**
  nécessiterait de dupliquer le calcul dans `app/recherche/shared.tsx`
  (type `Institution` séparé, lignes 15-22) et dans
  `components/CarteMapHome.tsx` — ces surfaces n'important pas le type
  local de la fiche complète.

---

## 9. État actuel des liens externes ("Visiter le site")

**Confirmé par lecture directe** — `InstitutionPublicClient.tsx:865` :
`const websiteHref = urlExterneSure(inst.website);` (post-correctif P0,
`urlValidation.ts`), rendu ligne 1205-1206 :
```tsx
{websiteHref && (
  <a href={websiteHref} target="_blank" rel="noreferrer" ...>
```
C'est un **`<a>` HTML standard**, `target="_blank"`, `rel="noreferrer"`
— aucun mécanisme custom. `urlExterneSure` ne fait que valider/
normaliser l'URL, elle ne modifie ni `target` ni le comportement de
navigation.

**Aucune infrastructure in-app browser / WebView native n'existe dans
ce repo** — confirmé par lecture directe de `package.json` (dependencies
complètes listées ci-dessus, §2) : ni `capacitor`, ni `cordova`, ni
`react-native-webview`, ni `expo-web-browser`, ni `electron`/`tauri`.
Aucun dossier `ios/`/`android/`, aucun `capacitor.config.*`.

**Manifest PWA confirmé par lecture directe** (`public/manifest.json`) :
`display: "standalone"`, pas de `scope` défini, pas de config liée à
l'ouverture de liens externes. En mode `standalone` installé, un lien
`target="_blank"` vers un domaine externe est typiquement délégué par
l'OS/navigateur au navigateur système par défaut — **comportement
plateforme, pas applicatif** (aucun code Yelen ne l'orchestre).

**Conclusion factuelle** : aujourd'hui, "Visiter le site" ouvre soit un
nouvel onglet du navigateur qui héberge la PWA (usage web classique),
soit le navigateur système externe (PWA installée en `standalone`) —
dans les deux cas via le comportement HTML/OS standard, jamais un
composant Yelen dédié.

---

## 10. Faisabilité de l'ouverture in-app

Reprend et **re-confirme** la conclusion déjà actée en Phase 0.5 §8/§9
(non re-démontrée en détail ici pour éviter la duplication — voir ce
document pour l'analyse complète X-Frame-Options/CSP) : une iframe "in-app
browser" sur la PWA actuelle **n'est pas construisible de façon fiable**
— limitation technique hors du contrôle de Yelen (dépend du header
`X-Frame-Options`/CSP de chaque site tiers, imprévisible et non
garanti). Une expérience "sans perdre le contexte Yelen" comparable aux
apps natives modernes nécessiterait un **WebView natif**
(`SFSafariViewController`/Chrome Custom Tabs équivalent), réservé à une
future app native — **hors périmètre explicite de cette phase et de la
Phase 1**, confirmé par l'absence totale d'infrastructure native dans
le repo actuel (§9).

**Aucune dépendance ajoutée, aucun choix WebView imposé dans cet
audit** — conforme à l'instruction explicite du CEO.

---

## 11. Architecture candidate minimale (éléments bruts, pas une proposition d'implémentation)

- **Calcul des capacités** : entre les lignes 857-893 de
  `InstitutionPublicClient.tsx`, aux côtés de `ouvert`, `websiteHref`,
  `whatsappUrl` déjà présents — le point d'intégration le plus petit
  pour une V1 limitée à la fiche complète.
- **Cibles de rendu à faire dépendre de ce calcul** : bloc CTA hero
  (1020-1027) et bandeau fixe (2030-2034) — aujourd'hui deux blocs JSX
  dupliqués et inconditionnels, pas un composant partagé.
- **Type à faire évoluer si le champ de capacités doit être partagé
  au-delà de la fiche** : `Institution` local (24-34) vs `Institution`
  de `app/recherche/shared.tsx` (15-22) — deux types séparés
  aujourd'hui, aucune source unique.
- **Aucune capacité "site web" additionnelle nécessaire côté validation**
  — `urlExterneSure`/`validerUrlExterne` (chantier P0) couvrent déjà ce
  qu'il faut pour exposer un booléen "a un site web valide" fiable.

---

## 12. Ce qui peut être fait SANS migration

- Calculer `hasBooking` sur la fiche publique (§6) — nécessite une
  requête `paid_services` supplémentaire (application), zéro colonne
  DB nouvelle.
- Faire dépendre le CTA principal hero/bandeau fixe des capacités
  réelles déjà dérivables (`hasBooking`, `websiteHref`, `phone`,
  `whatsapp` truthy) — toutes les données existent déjà sur `inst`.
- Réutiliser `secteur` (8 valeurs déjà vivantes) comme signal de
  classification par défaut, capacités réelles prioritaires — reprend
  l'Option B déjà validée Phase 0.5 §8/CEO summary point 8.

## 13. Ce qui nécessiterait une migration

- Un nouveau champ `profile_type` ou toute colonne dénormalisée de
  capacités persistée — **explicitement écarté par le CEO pour cette
  phase**, non nécessaire techniquement (dérivation applicative pure
  suffit, conclusion déjà actée Phase 0.5 §11, toujours valable).
- Relier `AMBASSADES` (page statique) à de vraies lignes `institutions`
  si on veut un jour que cette page bénéficie du même système de
  capacités — décision produit séparée, pas une nécessité de ce
  chantier.
- Réintroduire un enum `type_institution` strict si le CEO veut
  remplacer `category` plutôt que le réparer — dépend de la décision
  prise pour le bug `category` (§15).

---

## 14. Risques

1. **Portée de propagation.** Un système de capacités ajouté uniquement
   dans `InstitutionPublicClient.tsx` ne bénéficiera pas automatiquement
   aux autres surfaces (`CarteMapHome.tsx`, `RechercheInner.tsx`, page
   Ambassades) — deux types `Institution` distincts, zéro composant
   partagé de CTA aujourd'hui. Une V1 limitée à la fiche complète est
   cohérente avec l'instruction CEO de rester isolé, mais crée une
   incohérence temporaire produit (CTA intelligent sur la fiche, CTA
   toujours "Prendre RDV" sur les cartes) — à trancher explicitement.
2. **`category` cassé.** Toute logique de classification qui
   s'appuierait sur `category` en plus de `secteur` hériterait de
   données NULL pour toute institution récente (§2) — bug indépendant
   du chantier CTA mais qui contaminerait un futur système de
   capacités s'il n'en tient pas compte.
3. **Page Ambassades non rattachée au modèle réel** — un CTA
   capacité-driven ne peut techniquement pas s'y appliquer sans
   décision produit séparée sur le rattachement de ces données.
4. **Le wizard reste nécessaire même après un CTA intelligent** — il
   continuera de re-vérifier lui-même service/créneaux/capacité (bonne
   pratique existante, `app/rdv/[id]/page.tsx:878-899`), un correctif
   au niveau CTA réduit la fréquence des états vides côté citoyen mais
   ne les élimine pas totalement (double réservation concurrente,
   etc.).
5. **Aucun test navigateur réel possible** dans cet environnement pour
   valider visuellement un futur comportement de CTA dynamique — à
   faire par Bryan une fois implémenté.

---

## 15. Questions ouvertes (nécessitent une décision CEO)

1. La V1 du CTA dynamique doit-elle se limiter à la fiche complète
   (`InstitutionPublicClient.tsx`), ou inclure dès le départ les cartes
   de recherche/accueil (`RechercheInner.tsx`, `CarteMapHome.tsx`) ?
2. Le bug `category` (NULL pour toute institution récente) doit-il être
   corrigé dans le même chantier, ou reste-t-il explicitement hors
   périmètre (traité séparément plus tard) ?
3. Faut-il unifier les deux types `Institution` existants (fiche vs
   recherche) dès cette phase, ou dupliquer volontairement le calcul de
   capacités dans chaque composant consommateur pour rester isolé ?
4. La page Ambassades reste-t-elle un contenu marketing statique
   distinct du modèle prestataire, ou doit-elle un jour être rattachée
   à de vraies institutions en base ?
5. Le CTA "WhatsApp" doit-il devenir conditionnel sur un vrai numéro
   dédié (`inst.whatsapp` renseigné), au lieu du fallback générique
   actuel qui le rend toujours cliquable même sans donnée réelle ?

---

## 16. Proposition recommandée

Reprendre l'**Option B** déjà validée en Phase 0.5 (§8, CEO summary
point 8) : `secteur` comme signal de classification par défaut,
**surclassé par les capacités réelles** (`hasBooking` en priorité
absolue — jamais `secteur=X → bouton=Y` mécanique). Portée V1
recommandée : **fiche complète uniquement** (plus petit rayon d'impact,
cohérent avec la demande explicite du CEO de rester isolé), capacités
calculées dans le bloc pré-`return` déjà existant
(`InstitutionPublicClient.tsx:857-893`), fonction de décision de CTA
isolée et testable, zéro migration DB. Propagation aux cartes de
recherche/accueil et correction du bug `category` : reportées à une
décision CEO séparée et explicite (§15), pas incluses par défaut dans
cette V1.

---

## 17. Résumé CEO

1. **État actuel** : "Prendre RDV" est affiché de façon quasi
   inconditionnelle sur 5+ surfaces (fiche ×2, carte accueil, cartes
   recherche, ambassades) ; seul le wizard final vérifie réellement la
   disponibilité. Un seul CTA du produit est déjà 100% capacité-driven
   : les Offres partenaires (`offre.cta_url`), système séparé.
2. **`hasBooking`** : toujours dérivable sans migration après le
   chantier P0 (formule inchangée), mais **non calculé aujourd'hui**
   sur la fiche publique — `paid_services actifs` n'y est pas encore
   chargé (gap applicatif identifié, pas structurel).
3. **`secteur`** : seule classification vivante et fiable (8 valeurs,
   CHECK, toujours écrite par le wizard actuel).
4. **`category`** : toujours vivante dans le code (filtre recherche,
   libellé CTA, KPIs admin) mais **NULL pour toute institution créée
   depuis le passage à `secteur`** — le wizard actuel ne l'envoie
   jamais. Bug réel, indépendant de ce chantier, signalé pour décision.
5. **Liens externes** : `<a target="_blank" rel="noreferrer">` HTML
   standard, validé par `urlExterneSure` (P0). Aucune infrastructure
   in-app browser/WebView native dans le repo (confirmé sur
   `package.json`, absence de dossiers natifs).
6. **In-app browser** : toujours non recommandé sur la PWA actuelle
   (contrainte X-Frame-Options/CSP hors du contrôle de Yelen, déjà
   actée Phase 0.5) — nécessiterait une app native future, hors
   périmètre.
7. **Architecture candidate** : capacités calculées dans le bloc
   pré-`return` déjà existant de la fiche complète (lignes 857-893),
   CTA hero + bandeau fixe (actuellement dupliqués et inconditionnels)
   comme cibles de rendu — zéro migration nécessaire pour une V1
   limitée à la fiche complète.
8. **Risque principal** : deux types `Institution` distincts
   (fiche/recherche) signifient qu'une V1 limitée à la fiche complète
   créera une incohérence temporaire avec les cartes de recherche/
   accueil qui continueront d'afficher "Prendre RDV" partout — à
   valider comme acceptable pour une V1, ou à élargir le périmètre.

### Classification finale

**CONFIRMED** (prouvé par lecture directe du code) :
- Les 5+ points d'affichage inconditionnel de "Prendre RDV" (§5).
- Le comportement réel des liens externes — `<a target="_blank">`
  standard, aucun in-app browser (§9).
- L'absence de toute infrastructure WebView/native (`package.json`, §9).
- Le bug `category` NULL pour les nouvelles institutions (§2).
- La formule et le fonctionnement de `generateSlotsInRange` (§6).
- La policy RLS `institutions_public_read` comme seul filet de sécurité
  public réel (§2).

**DERIVABLE** (prouvé possible par le code, non encore implémenté) :
- `hasBooking` sur la fiche publique (nécessite d'ajouter une requête
  `paid_services`, sans migration DB).
- Un CTA principal piloté par capacités réelles au lieu d'un
  `profile_type` (§11/§16).

**MISSING** (donnée ou structure absente aujourd'hui) :
- Type `Institution` unique et partagé entre fiche et cartes de recherche.
- Variable de capacités consolidée (aujourd'hui : accès dispersés
  `inst.x &&`).
- Rattachement de la page Ambassades à de vraies institutions.

**BLOCKED** (hors du contrôle de Yelen ou explicitement hors périmètre) :
- In-app browser fiable sur la PWA actuelle (X-Frame-Options/CSP
  tiers) — nécessite une app native future.

**NÉCESSITE UNE DÉCISION PRODUIT** (§15) :
- Portée V1 : fiche seule vs propagation immédiate aux cartes.
- Correction du bug `category` : même chantier ou reporté.
- Unification des types `Institution` : maintenant ou dette assumée.
- Avenir de la page Ambassades.
- Fiabilisation du CTA WhatsApp (fallback générique actuel).

---

**Aucun code, aucune migration, aucun composant n'a été écrit pendant
cette phase. Phase d'implémentation suivante attend la validation
explicite du CEO sur les points du §15/§17.**
