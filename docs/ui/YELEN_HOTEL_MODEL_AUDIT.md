# Audit d'architecture — Mode Hôtel (18/08/2026)

Audit READ-ONLY. Aucun fichier modifié, aucune migration créée, aucun
commit. Chaque affirmation importante est sourcée fichier:ligne, vérifiée
par lecture directe (recherches préparatoires par 6 agents read-only en
parallèle, points structurants re-vérifiés personnellement). Consigne
explicite du CEO respectée : ce document **cherche à falsifier**
l'architecture conceptuelle proposée dans le brief, pas à la confirmer —
plusieurs conclusions ci-dessous s'écartent délibérément de l'exemple
donné quand les preuves du code réel pointent ailleurs.

---

## PARTIE 1 — Cartographie du socle actuel

| Élément | Statut | Preuve |
|---|---|---|
| Modèle `Institution` (fiche publique) | EXISTE, mais **dupliqué** | Type local non exporté `app/institution/[id]/InstitutionPublicClient.tsx:24-34` ≠ type exporté `app/recherche/shared.tsx:15-22` (formes différentes) — aucune source unique |
| `secteur` | EXISTE, RÉUTILISABLE comme discriminant | `lib/secteurs.ts:9-12` (8 valeurs), CHECK `supabase/migrations/20260710000001_onboarding_prestataire.sql:12-13` |
| `category` | EXISTE mais INCOMPATIBLE comme discriminant | Cassée en écriture pour toute institution récente — `app/api/institution/auth/register/route.ts:242` n'écrit que si fourni, jamais envoyé par le wizard actuel |
| Inscription institution | EXISTE, RÉUTILISABLE (point d'ajout ciblé) | `app/institution/inscription/engine/steps/ActiviteStep.tsx:12-21,88-112` |
| Profil public (`InstitutionPublicClient.tsx`) | EXISTE, socle monolithique | 2086+ lignes, un seul composant fonction, pas de sous-composants de section |
| Dashboard institution | EXISTE, ADAPTABLE via précédent déjà identifié | 41 composants, gating par onglet `page.tsx:2370-2409` |
| CTA | EXISTE, RÉUTILISABLE tel quel | `lib/prestataireCapacites.ts` (chantier CTA V1, clos 18/08/2026) |
| Services (gratuits) | EXISTE, ADAPTABLE | `institutions.services` jsonb, `ServicesTab.tsx` |
| Services payants | EXISTE, ADAPTABLE comme squelette "type de chambre" (sans inventaire) | `paid_services` — schéma complet Partie 8 |
| Disponibilités | EXISTE, **INCOMPATIBLE** pour un séjour multi-nuits | `lib/disponibilites.ts:20-75`, `institutions.disponibilites` (créneaux horaires ponctuels) |
| Booking (`rdv`/paid_bookings) | EXISTE, **INCOMPATIBLE** structurellement pour l'inventaire hôtelier | Détail Partie 7/8 |
| `paid_services` | EXISTE, ADAPTABLE partiellement | Partie 8 |
| Réservation | EXISTE, pattern RÉUTILISABLE / modèle de données INCOMPATIBLE | Partie 7 |
| Horaires (ouverture) | EXISTE, RÉUTILISABLE (badge Ouvert/Fermé) | `lib/horaires.ts`, distinct de `disponibilites` |
| Informations générales | EXISTE, RÉUTILISABLE tel quel | `conditions_entreprise`/`informations_importantes`/`informations_legales`, section "Plus d'informations" explicitement inspirée de Booking (Property Policies) — `supabase/migrations/20260724000016_institutions_conditions_informations.sql:2-3,9-12` |
| Galerie/images | **MANQUANT** (structuré par contexte) | `logo`/`banniere` = 1 seule image chacun, écrasée à chaque upload (`app/api/institution/upload/route.ts:47-52`) ; seul `annonces.media_urls` est multi-image mais plat (pas de catégorie par image) |
| Coordonnées | EXISTE, RÉUTILISABLE tel quel | `phone`/`whatsapp`/`email`/`adresse` — colonnes texte simples |
| WhatsApp | EXISTE, RÉUTILISABLE tel quel | Déjà capacité du moteur CTA V1 |
| Téléphone | EXISTE, RÉUTILISABLE tel quel | idem |
| Website | EXISTE, RÉUTILISABLE tel quel (protégé P0) | `lib/urlValidation.ts` |
| Offres | EXISTE, RÉUTILISABLE pour vitrine marketing événementielle (pas de réservation réelle) | `offres.categorie = "evenement"` déjà une valeur existante — `lib/offresCategories.ts:6` |
| Partenariats | EXISTE, gate de visibilité, pas de transaction | `app/api/institution/partenariat/route.ts` |
| Événements | **MANQUANT** structuré (existe en texte libre via `annonces.type='evenement'`) | Aucune colonne date/capacité réelle sur `annonces` |
| Toute autre donnée exploitable | `annonces` (carrousel déjà en tête de fiche), `TABS` (nav par ancre) | `InstitutionPublicClient.tsx:888-893,1124-1180` |

---

## PARTIE 2 — Flux actuel d'inscription

**Parcours réel** : `IntroStep → PhoneStep → VerificationStep → ResponsableStep → ActiviteStep (secteur → statut juridique → présentation) → ReviewStep → SuccessStep` (`app/institution/inscription/engine/`, moteur confirmé en production depuis le 15/08/2026 — `app/institution/inscription/page.tsx:7-9`, pas l'ancien wizard).

- **Où le secteur est stocké** : `institutions.secteur text`, CHECK 8 valeurs (`supabase/migrations/20260710000001_onboarding_prestataire.sql:4,12-13`).
- **Valeurs existantes** : `sante, administratif, financier, juridique, beaute_bien_etre, commerce, artisanat, services_divers` (`lib/secteurs.ts:9-12`). **"hotel" n'existe nulle part** — 0 résultat sur un grep insensible à la casse `hotel|hôtel` sur tout le repo.
- **Normalisation** : aucune (`register/route.ts:243` écrit la valeur brute) — non nécessaire car la valeur vient toujours d'un `id` fixe de la grille du wizard, jamais d'une saisie libre.
- **`category` encore utilisée ?** Oui pour l'affichage/filtre recherche, mais cassée en écriture (Partie 1). **Ne peut pas servir de discriminant** — il faudrait de toute façon réparer son alimentation par le wizard, ce qui revient au même effort que d'étendre `secteur`.
- **Institution peut-elle changer de secteur après inscription ?** Oui, sans aucun verrou (`app/api/institution/profile/route.ts:142-147`) — contrairement à `statut_juridique` qui se verrouille si des documents ont déjà été soumis (`profile/route.ts:154-171`). **Aucun bloc symétrique n'existe pour `secteur`.**
- **Conséquence d'un changement de secteur** : aucune casse technique (`services` reste un champ libre, rien n'est réinitialisé), mais incohérence d'affichage silencieuse possible (suggestions de services, icône, tendances citoyen recalculées rétroactivement sur le nouveau secteur — Partie 14).

**`profile_type` : confirmé absent de tout le code, aucune trace.** Le modèle actuel permet déjà la spécialisation recherchée via `secteur` seul, sans nouveau champ — à condition d'accepter la petite migration décrite Partie 8/15 (extension du CHECK constraint).

⚠️ **Dette découverte, non liée à ce chantier mais pertinente pour toute évolution de `secteur`** : la taxonomie des 8 valeurs est dupliquée dans **6 emplacements** : `lib/secteurs.ts`, `lib/institutionTaxonomy.tsx`, `app/institution/inscription/engine/steps/ActiviteStep.tsx:12-21`, `app/institution/inscription/engine/steps/ReviewStep.tsx:57-60` (labels), `app/api/institution/auth/register/route.ts:17`, `app/api/institution/profile/route.ts:79`. Ajouter "hotel" nécessitera de toucher les 6 (plus le CHECK SQL) — risque de dérive documenté Partie 14.

---

## PARTIE 3 — Fiche publique actuelle

`InstitutionPublicClient.tsx` (2086+ lignes) est un **unique composant fonction** (`InstitutionProfilePageInner`), **sans découpage en sous-composants de section**. Cartographie exacte de l'ordre de rendu (confirmée par lecture directe des commentaires de section) :

```
HEADER (968)
BANNIÈRE (1008)
HERO — logo + identité + CTA principal (1024, CTA à 1070)
STATS — note/avis/services/horaires (1106)
ANNONCES — carrousel horizontal (1124)
TABS NAV — ancres Info/Horaires/Services/Avis (1182)
SECTIONS (contenu monté en permanence, scrollIntoView) :
  ├─ INFO (1218)
  ├─ HORAIRES (1306)
  ├─ SERVICES (1344)
  ├─ AVIS (1371)
  ├─ QUESTIONS DES CITOYENS (1440)
  ├─ CERTIFICATION (1495)
  ├─ FAQ (1519)
  └─ SATISFACTION PLATEFORME (1542)
PLUS D'INFORMATIONS — conditions/importantes/légales (2009)
BANDEAU CTA fixe (2082)
Toast + indicateur de scroll (2115, 2124)
```

**Constat central, contraire à l'hypothèse d'architecture du brief** : il n'existe **aucune** architecture `YelenInstitutionProfile → CommonSections → IndustrySpecificSections` dans le code actuel. Tout est un seul fichier, un seul composant, rendu séquentiel. Le seul début de "modularité" observable :

- `ctaDecision` (chantier CTA V1) — logique isolée dans `lib/prestataireCapacites.ts`, consommée par 2 sites de rendu identiques (hero + bandeau fixe) via une variable calculée une fois. **C'est le seul précédent réel de "capacité métier extraite du rendu"** dans tout le fichier.
- `TABS` (`:888-893`, rendu `:1118` env.) — seul exemple de liste pilotée par données (`.map()`), mais uniquement pour la navigation par ancre.

**Ce qui constitue le socle commun Yelen** (sections qui ne dépendent d'aucune donnée sectorielle, réutilisables telles quelles) : HEADER, BANNIÈRE, identité HERO, CTA (déjà capacité-driven), STATS, ANNONCES, Contacts (WhatsApp/téléphone/email/website), AVIS, QUESTIONS, CERTIFICATION, FAQ, SATISFACTION PLATEFORME, PLUS D'INFORMATIONS. **Ce qui varierait potentiellement par métier** : SERVICES (aujourd'hui liste plate de noms → pourrait devenir "chambres" pour un hôtel), et un futur bloc additionnel (équipements/galerie) qui n'existe pas encore pour personne.

**Recommandation d'architecture pour la Partie 12/15** : ne **pas** tenter l'extraction `CommonSections`/`IndustrySpecificSections` maintenant — ce serait un refactor risqué d'un fichier volumineux déjà audité pour la sécurité (P0) et le CTA (V1) récemment. Voir Partie 12.

---

## PARTIE 4 — Conception du mode Hôtel

Évaluation section par section de la liste A-O du brief, confrontée aux preuves du code :

| Section proposée | Pertinence Yelen | Base existante |
|---|---|---|
| A. Identité de l'hôtel | Oui — déjà le HEADER/HERO commun | RÉUTILISABLE tel quel |
| B. Galerie principale | Oui, mais **MANQUANT** structurellement | Nécessite nouvelle table (Partie 9) — pas bloquant pour une V1 sans galerie riche (logo/bannière suffisent en V1) |
| C. Présentation | Oui — déjà `description` | RÉUTILISABLE tel quel |
| D. Informations essentielles | Oui — déjà `adresse`/`horaires`/contacts | RÉUTILISABLE tel quel |
| E. Services et équipements | Services : oui (SERVICES existant) ; Équipements structurés : MANQUANT (texte libre seulement) | ADAPTABLE (services) + nouveau champ texte simple (équipements) sans migration lourde |
| F. Horaires / check-in / check-out | Horaires génériques : oui. Check-in/check-out spécifique : MANQUANT | La section "Plus d'informations" (Property Policies, déjà Booking-inspirée) est le foyer naturel pour ce contenu, **en texte libre**, sans nouvelle colonne |
| G. Chambres | MANQUANT (inventaire) | `paid_services` peut représenter des **types** de chambre nommés avec un prix, mais jamais un inventaire (Partie 7/8) |
| H. Disponibilité | **INCOMPATIBLE** en l'état (Partie 7) | Nécessite nouveau modèle, hors V1 |
| I. Tarifs | Partiellement (prix fixe par service) | `paid_services.prix` — pas de grille par nuit/saison |
| J. Conditions | Oui — "Plus d'informations" | RÉUTILISABLE tel quel |
| K. Réservation Yelen | Existe (RDV classique) mais pas au sens hôtelier réel | Voir Partie 7 — recommandation : NE PAS construire de vraie réservation par dates en V1 |
| L. Contact | Oui | RÉUTILISABLE tel quel |
| M. Localisation | Oui — `latitude`/`longitude`/LocationPicker déjà existants | RÉUTILISABLE tel quel |
| N. Événements/conférences | Partiellement — `annonces.type='evenement'` réel mais non structuré (pas de date/capacité requêtable) | ADAPTABLE en vitrine, pas en réservation de salle réelle |
| O. Informations complémentaires | Oui — "Plus d'informations" | RÉUTILISABLE tel quel |

**Principe respecté (mandat explicite du CEO)** : ne pas copier Booking.com. Concrètement, cela signifie qu'une V1 Hôtel Yelen doit s'arrêter à la **présentation** (identité, équipements en texte, politiques, types de chambres nommés avec prix indicatif, contact/RDV de type "demande") — **sans** moteur de disponibilité par date/inventaire/tarification dynamique, qui est le cœur technique d'une OTA et qui, selon les preuves de la Partie 7, n'existe dans aucune brique réutilisable du système actuel.

---

## PARTIE 5 — Menu / navigation citoyen

Le seul mécanisme de navigation contextuelle déjà existant dans la fiche est `TABS` (ancres Info/Horaires/Services/Avis, `:888-893`). **Aucune notion de menu qui change structurellement selon le secteur n'existe aujourd'hui.**

Recommandation, fondée sur le principe déjà appliqué avec succès pour le CTA V1 (une seule décision calculée, consommée à plusieurs endroits) :

- **Rester dans `TABS`** : ajouter conditionnellement une entrée `"chambres"` (remplaçant ou complétant `"services"`) uniquement si `secteur === "hotel"` — même mécanisme `.map()` déjà en place, aucun nouveau système de navigation.
- **Ne jamais créer un second menu global "Hôtel"** distinct du menu Yelen existant — cela romprait la promesse "UN SEUL YELEN".
- **Ce qui doit rester dans le socle commun** : Contacts, Avis, Questions, Certification, FAQ, Plus d'informations — aucune raison de les rendre contextuels.
- **Ce qui doit devenir contextuel** : le libellé et le contenu de la section SERVICES (renommée "Chambres" en mode Hôtel, réutilisant le même bloc de rendu avec un texte différent).

---

## PARTIE 6 — Dashboard Hôtel

**Précédent architectural directement transposable, déjà trouvé dans le code** : l'onglet `"mes-offres"` n'apparaît que si `inst?.partenaire_statut === "approuve"` — filtre additionnel explicite après le RBAC générique (`app/institution/[id]/dashboard/page.tsx:2401-2403,2408`, commentaire confirmant l'intention). **C'est exactement le patron à répliquer** pour un futur onglet Hôtel : `i.key !== "chambres" || inst?.secteur === "hotel"`.

**Ce que ce précédent implique concrètement** :
- Le mécanisme de gating par rôle (`TAB_MATRIX`, `lib/institutionPermissions.ts:58-117`) est **strictement keyé sur `MembreRole`**, aucune dimension institution/secteur — il ne peut pas être étendu directement sans casser son typage. Il ne faut **pas** tenter de l'étendre ; il faut **ajouter un filtre séparé**, comme pour `mes-offres`.
- "Clock In Shift" n'est **pas** un précédent de module conditionnel par secteur (contrairement à ce qu'un lecteur pourrait supposer) — c'est un module disponible à toutes les institutions, gaté uniquement par rôle. Seul `mes-offres` est le vrai précédent.

**Composants réutilisables comme squelette** :
- `ServicesTab.tsx` — CRUD nom/prix/description/catégorie/actif — bon point de départ pour un futur écran "Types de chambres" (V1 : les types de chambres restent des `paid_services` renommés à l'affichage, aucune nouvelle table).
- `DisponibilitesTab.tsx` — **structurellement incompatible**, ne pas réutiliser (créneaux horaires hebdomadaires globaux, pas de disponibilité par date/par item).
- `ProfilEntrepriseTab.tsx` — profil générique partagé par tous les secteurs ; y injecter des champs hôtel-spécifiques dénaturerait sa neutralité. **Un onglet séparé est préférable**, suivant le patron déjà établi par `CentreConfigurationTab.tsx` (écran dédié conditionnel).

**Combien d'écrans réellement nécessaires pour une V1 vitrine (pas de réservation par date) ?** **Un seul** est suffisant : un onglet "Configuration Hôtel" additionnel (texte libre : équipements, règles, horaires check-in/check-out — mêmes patterns que `ConditionsInformationsTab.tsx`), gaté par le filtre `secteur === "hotel"`. Les "types de chambres" peuvent être gérés dans l'onglet Services existant (renommé à l'affichage), sans nouvel écran.

⚠️ **Le dashboard général des autres organisations ne doit subir aucun changement** — respecté par construction si le filtre est additif (`i.key !== "chambres" || ...`), comme le prouve le fait que l'ajout de `mes-offres` n'a modifié l'expérience d'aucune institution non partenaire.

---

## PARTIE 7 — Réservation Hôtel (partie critique)

**Verdict, fondé sur l'audit exhaustif du wizard et du schéma DB (Parties 7/8 des recherches préparatoires)** :

Le système actuel est **fondamentalement "1 créneau horaire ponctuel = 1 rendez-vous"**, pas un modèle d'inventaire/stock. Preuves :
- Clé de disponibilité = `(date_rdv, heure_rdv)` (`app/api/rdv-disponibilite/route.ts:30`) — un point dans le temps, jamais une plage `[arrivée, départ)`.
- `capacite_par_creneau` = un **entier scalaire unique par institution** (`supabase/migrations/20260720000005_institutions_capacite_creneau.sql:6`), pas par type de ressource — un hôtel a besoin de N pools indépendants (un par type de chambre).
- `generateSlotsInRange` (`lib/disponibilites.ts:20-75`) génère des occurrences horaires hebdomadaires/quotidiennes, jamais une disponibilité calendaire par nuit.
- `paid_services.prix` est fixe par service, jamais fonction de la date/du nombre de nuits/de l'occupation.
- **Aucune colonne quantité/nombre de personnes** n'existe sur `rdv` ni `paid_bookings` — `rdv.pour_autre/nom_autre/phone_autre` permet de réserver pour une seule autre personne nommée, pas un groupe.
- **Aucune protection anti-double-réservation n'existe aujourd'hui**, indépendamment du sujet hôtelier : pas de contrainte `UNIQUE`, pas de verrou, pas de transaction combinant lecture+insert. `remainingFor()` s'appuie sur un instantané chargé une fois au montage, jamais revérifié à la confirmation. **C'est une lacune préexistante, aggravée si elle est réutilisée telle quelle pour un inventaire hôtelier à plus fort enjeu (survente de chambres).**

**Ce qui EST réutilisable** (le pattern applicatif, pas le modèle de données) :
- Le wizard multi-étapes (state machine claire, `app/rdv/[id]/page.tsx:84,662-665`).
- Le mécanisme QR + code de confirmation (`SuccessScreen`).
- Le cycle de vie (nouveau → en_attente → termine/annule) et les Server Actions RLS.
- Le principe "citoyen choisit un item nommé avec un prix" (`WizardService`) — transposable conceptuellement à "citoyen choisit un type de chambre", mais sans le "date/disponibilité/quantité" derrière.

**Recommandation ferme pour la V1** : **ne pas construire de réservation par dates/inventaire réel maintenant.** Une V1 Hôtel doit se limiter à afficher les types de chambres (nom, description, prix indicatif) comme des `paid_services` classiques, avec un flux de "demande de réservation" identique au RDV actuel (le citoyen "réserve" un type de chambre comme il réserverait un service — l'institution traite la demande manuellement, exactement comme aujourd'hui). Une vraie disponibilité par nuit/par chambre est un **chantier distinct**, avec sa propre conception de données, à ne pas bundler dans ce chantier.

---

## PARTIE 8 — Modèle de données Hôtel (audit DB read-only)

⚠️ Avertissement méthodologique : `institutions`, `rdv` et `annonces` n'ont pas de `CREATE TABLE` dans les migrations tracées (tables pré-existantes avant le suivi). Seules les colonnes ajoutées après le 09/07/2026 sont vérifiables avec certitude ; le reste est confirmé par déduction du code applicatif, signalé au cas par cas.

| Concept Hôtel | Donnée existante ? | Table existante ? | Champ existant ? | Réutilisable ? | Nouvelle donnée nécessaire ? | Migration nécessaire ? |
|---|---|---|---|---|---|---|
| HotelProfile (identité/politiques) | Oui | `institutions` | `conditions_entreprise`, `informations_importantes`, `description` | Oui, tel quel | Non (V1 vitrine) | Non |
| RoomType | Partiel | `paid_services` | `nom, prix, description, categorie` | Oui, comme catalogue nommé (sans inventaire) | Non pour V1 vitrine ; oui pour vraie gestion d'inventaire | Non pour V1 ; oui pour V2 |
| Room (unité physique) | Non | — | — | Non | Oui | Oui (V2+) |
| RoomAmenity | Non | — | — | Non | Oui (ou texte libre en V1) | Non si texte libre V1 ; oui si structuré |
| RoomImage | Non | — | — | Non | Oui | Oui (V2+, voir Partie 9) |
| Availability (par date/chambre) | Non | — | `institutions.disponibilites` existe mais incompatible (créneaux horaires, pas calendaire par nuit) | Non | Oui | Oui (V2+) |
| Rate/RatePlan | Non | — | `paid_services.prix` (fixe, pas de grille) | Partiel | Oui pour tarification réelle | Oui (V2+) |
| Booking (hôtelier réel) | Non | `rdv`/`paid_bookings` existent mais modèle horaire ponctuel | `date_rdv, heure_rdv` (pas de plage) | Non (structurellement) | Oui | Oui (V2+) |
| Guest (invités multiples) | Non | — | `rdv.pour_autre/nom_autre` (1 seule personne substituée) | Non | Oui si party size réel | Oui (V2+) |
| HotelPolicy (structurée) | Non (texte libre existant) | `institutions.conditions_entreprise` (texte) | Oui en texte libre | Oui pour V1 (texte) | Oui si structuration programmable | Non pour V1 ; oui si structuré |
| HotelFacility | Non | — | — | Non | Oui (ou texte libre en V1) | Non si texte libre V1 |
| Secteur "hotel" (discriminant) | Non | `institutions.secteur` | CHECK 8 valeurs, "hotel" absent | — | Oui (9ᵉ valeur) | **Oui — ALTER du CHECK constraint, seule migration strictement requise pour la V1** |

**Conclusion Partie 8** : la V1 vitrine décrite Partie 4/7 est réalisable avec **une seule migration** (extension du CHECK constraint `secteur`). Toute la couche "vraie réservation hôtelière" (Room/Availability/Rate/Booking/Guest) nécessite un nouveau modèle de données complet, à traiter comme un chantier séparé et non trivial.

---

## PARTIE 9 — Images

Conclusion de l'agent dédié, reconfirmée : **`institutions.logo`/`banniere` sont des colonnes texte scalaires avec chemin de storage fixe par institution (`${prefix}/${institutionId}.${ext}`, `app/api/institution/upload/route.ts:47`) et `upsert:true`** — structurellement incompatibles avec plusieurs images, sans même parler de catégorisation.

Le seul mécanisme multi-image existant, `annonces.media_urls jsonb` (`supabase/migrations/20260720000009_annonces_engagement.sql:24`), est un **tableau plat de chaînes**, sans sous-structure par élément (pas de `{url, categorie, legende, ordre}`) — la catégorie n'existe qu'au niveau de l'annonce entière, pas par image.

`institutions.documents_urls jsonb` (qui aurait pu servir de socle) est **confirmée morte** (0 usage dans `app/`, explicitement remplacée par `documents_institution` selon `supabase/migrations/20260711000005_documents_institution_workflow.sql:22-25`).

**Verdict : une nouvelle table dédiée est nécessaire pour une galerie structurée par contexte** (façade/chambres/restaurant/piscine/salle de conférence), de type `institution_medias(id, institution_id, categorie, url, ordre, legende)`. **Le pattern technique d'upload (route service_role, `validateUpload`, bucket public dédié) est en revanche directement réutilisable tel quel** — rien à changer dans la façon d'uploader vers Supabase Storage, seulement dans la façon de référencer les fichiers en base.

**Recommandation V1** : ne pas construire cette table maintenant. Une V1 vitrine peut se contenter de `logo`/`banniere` existants (déjà utilisés par toutes les institutions) — la galerie structurée est un chantier V2, indépendant du déclenchement du mode Hôtel lui-même.

---

## PARTIE 10 — Recherche et cartes (évolution future, non modifiée maintenant)

`secteur` et `category` n'ont aujourd'hui **aucune valeur hôtel-like** :
- `secteur` (8 valeurs, `lib/secteurs.ts:9-12`) — pas de "hotel".
- `category` (`CAT_META`, `app/recherche/shared.tsx:24-35`, `components/CarteMapHome.tsx:34-44`, 10 valeurs) — pas de "Hôtel" non plus, retomberait sur `"Autre"`.
- Filtre serveur `/recherche` sur `category` (`RechercheInner.tsx:846`) et libellé CTA carte (`CATEGORIES_RESERVATION`, `shared.tsx:39-42`) — aucun des deux n'aurait de comportement dédié pour un hôtel tant qu'aucune valeur n'est ajoutée.

**Ce qui devra éventuellement évoluer plus tard (pas maintenant)** : ajouter une icône/couleur dédiée pour `secteur="hotel"` dans `SECTEUR_META`, envisager une valeur `category` alignée (si `category` est un jour réparée — hors périmètre de ce chantier), et décider si le libellé CTA carte doit devenir "Découvrir"/"Voir les chambres" plutôt que "Prendre RDV" générique pour les hôtels (cohérent avec le moteur CTA V1 déjà en place sur la fiche complète, mais **non répliqué sur les cartes** — limite déjà actée et documentée dans `docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md` §13, Option A).

---

## PARTIE 11 — Philosophie Yelen

Évaluation explicite du modèle Hôtel proposé (V1 vitrine, Partie 4/7) contre les principes énoncés :

| Principe | Respecté par la V1 proposée ? | Justification |
|---|---|---|
| Yelen ne vend pas | Oui | Aucun paiement in-app pour l'hébergement en V1 — même modèle que le RDV actuel ("Yelen ne collecte aucun paiement", `app/rdv/[id]/page.tsx:1042-1058`) |
| Yelen ne devient pas une marketplace | Oui, **à condition de refuser la réservation par inventaire/tarif dynamique en V1** (Partie 7) | Un moteur de disponibilité/tarification par nuit serait le premier pas vers une logique d'OTA — explicitement écarté de cette V1 |
| Yelen ne devient pas un annuaire de produits | Oui | Les "chambres" restent des `paid_services` nommés avec description, pas un catalogue e-commerce avec panier |
| Yelen guide / informe / vérifie | Oui | Réutilisation intégrale du socle de confiance existant (badge vérifié, avis, certification) |
| Yelen met en relation | Oui | Flux "demande de réservation" traité manuellement par l'hôtel, comme un RDV classique |
| Réservation seulement si le métier le justifie | Oui | L'hôtellerie est explicitement le cas d'usage où la réservation est pertinente (contrairement à un CTA "Prendre RDV" forcé, déjà corrigé par le chantier CTA V1) |
| Organisation plus facilement trouvée/contactée | Oui | Aucun changement de ce principe |
| Relation progressive citoyen/organisation | Oui | Le cycle RDV existant (historique, avis, réputation) s'applique sans changement |

**Point de vigilance identifié (pas une violation, mais un risque à surveiller)** : si une V2 future introduit un vrai moteur de disponibilité/tarification par date (Partie 7/8), la frontière avec une marketplace devient plus fine. La garde-fou structurel recommandé : **le citoyen ne doit jamais pouvoir comparer/réserver plusieurs hôtels dans un même flux transactionnel** (pas de "panier multi-établissements") — chaque réservation reste un dialogue 1:1 citoyen↔organisation, exactement comme un RDV aujourd'hui. Tant que cette règle tient, même une V2 avec disponibilité réelle reste dans la philosophie Yelen.

**Verdict Partie 11 : la V1 vitrine proposée respecte intégralement la philosophie Yelen.** Une future V2 avec vraie disponibilité/tarification devra être re-évaluée spécifiquement sur ce point au moment de sa conception.

---

## PARTIE 12 — Architecture générale

**Falsification de l'hypothèse du brief** : l'architecture `YelenInstitutionProfile → CommonSections → IndustrySpecificSections → HotelSections` **ne correspond pas** à l'architecture réelle actuelle (Partie 3 : un seul composant monolithique, zéro découpage en sous-composants de section). Recommander cette architecture MAINTENANT signifierait un refactor complet d'un fichier de 2000+ lignes déjà durci en sécurité (P0) et récemment modifié (CTA V1) — risque élevé, gain immédiat faible pour un seul métier spécialisé.

**Meilleure architecture, fondée sur ce qui existe réellement et a déjà fait ses preuves dans ce projet (CTA V1 et `mes-offres`)** :

```
SOCLE YELEN COMMUN (inchangé, InstitutionPublicClient.tsx tel quel)
  +
GATE DÉTERMINISTE (secteur === "hotel", calculé une fois, comme ctaDecision)
  +
BLOCS CONDITIONNELS ADDITIFS (dans le même fichier, pas de nouveau composant)
  — section SERVICES relabelée "Chambres" si secteur=hotel
  — nouveau bloc "Équipements & règles" (texte libre) si secteur=hotel, positionné
    près de "Plus d'informations"
```

C'est un principe **"Common capabilities + Industry capabilities + rendu contextuel additif"**, mais implémenté par **conditions inline** (comme `ctaDecision`/`mes-offres`), pas par une hiérarchie de composants séparés. **Recommandation explicite : reporter l'extraction en vrais composants `CommonSections`/`IndustrySections` à un moment où au moins 2-3 métiers auront prouvé un besoin de spécialisation substantielle** — évite la sur-ingénierie prématurée (cohérent avec le protocole du projet : "pas d'abstraction avant qu'un besoin réel et répété ne l'exige").

Architecture cible à moyen terme (sans la construire maintenant) :
```
Yelen
├── Socle commun (identité, contacts, avis, confiance — jamais dupliqué)
├── Capacités transverses (CTA, booking classique — déjà génériques)
└── Modules métier optionnels, gatés par secteur (patron mes-offres)
    ├── Hôtel (V1 : vitrine ; V2 éventuelle : inventaire réel)
    ├── Restaurant (futur, hors périmètre)
    ├── Cabinet/Clinique (déjà couvert par le RDV classique, pas de module nécessaire)
    └── autres métiers futurs
```

---

## PARTIE 13 — Réutilisation

| Élément | Statut |
|---|---|
| Fiche publique (HEADER/HERO/CTA/Contacts/Avis/Questions/Certification/FAQ/Satisfaction/Plus d'informations) | **RÉUTILISABLE TEL QUEL** |
| Moteur CTA (`lib/prestataireCapacites.ts`) | **RÉUTILISABLE TEL QUEL** |
| `TABS` (navigation par ancre) | **RÉUTILISABLE TEL QUEL**, extension additive (nouvelle entrée conditionnelle) |
| `ServicesTab.tsx` (catalogue payant) | **ADAPTABLE** — squelette pour "types de chambres" sans inventaire |
| Section "Plus d'informations" | **RÉUTILISABLE TEL QUEL** — foyer naturel des politiques hôtelières en texte libre |
| Pattern `mes-offres` (gating dashboard additif) | **RÉUTILISABLE TEL QUEL** comme patron pour un futur onglet Hôtel |
| Pattern d'upload (routes service_role + `validateUpload`) | **RÉUTILISABLE TEL QUEL** pour toute future galerie |
| `DisponibilitesTab.tsx` / `lib/disponibilites.ts` | **NE PAS TOUCHER** — incompatible, ne pas tenter d'adapter en place |
| `rdv`/`paid_bookings` (modèle horaire ponctuel) | **NE PAS TOUCHER** pour l'inventaire hôtelier — laisser tel quel pour son usage RDV actuel |
| `capacite_par_creneau` | **NE PAS TOUCHER** — scalaire global, pas un modèle d'inventaire par type |
| `secteur` (taxonomie) | **ADAPTABLE** — ajout d'une 9ᵉ valeur, migration minimale |
| `category` | **NE PAS TOUCHER** — dette séparée, hors périmètre |
| `institutions.documents_urls` | **NE PAS TOUCHER** — colonne morte, ne pas la réutiliser (remplacée par `documents_institution`) |
| Galerie structurée par contexte (nouvelle table) | **NOUVEAU → NÉCESSAIRE**, mais **DEFER** à V2 |
| Inventaire chambres/disponibilité/tarifs réels | **NOUVEAU → NÉCESSAIRE**, **DEFER** à un chantier séparé |
| Extraction `CommonSections`/`IndustrySections` en composants | **DEFER** — pas nécessaire avant 2-3 métiers spécialisés réels |
| Réparation de `category` | **DEFER** — chantier indépendant déjà identifié dans un audit antérieur |
| Verrou sur changement de `secteur` post-inscription | **DEFER** — risque faible (incohérence d'affichage, pas de casse), à surveiller |

---

## PARTIE 14 — Risques

1. **Duplication de fiche** : évitée par construction (approche conditionnelle additive, pas de fork de fichier) — risque réel seulement si l'implémentation dévie de la Partie 12.
2. **Duplication de logique CTA** : aucun risque nouveau — le moteur CTA V1 reste la source unique, aucune modification prévue.
3. **Incohérence fiche/recherche** : réelle et déjà actée pour le CTA (Option A, incohérence temporaire assumée) — s'appliquerait de la même façon au mode Hôtel si les cartes ne sont pas mises à jour (Partie 10, DEFER explicite).
4. **Dépendance excessive au secteur** : `secteur` est déjà dupliqué dans 6 emplacements (Partie 2) — ajouter "hotel" sans discipline augmenterait cette dette. Recommandation : centraliser au moins la liste de valeurs dans un seul fichier avant d'ajouter "hotel" (petit chantier de nettoyage préalable, hors scope strict mais fortement recommandé).
5. **Changement de secteur après création** : aucun verrou aujourd'hui — un hôtel pourrait redevenir "commerce" sans garde-fou, laissant des données hôtel orphelines à l'affichage (pas de casse technique, juste confusion possible).
6. **Migration DB inutile** : évitée — une seule migration minimale identifiée (CHECK constraint), aucune autre nécessaire pour la V1.
7. **Complexification du modèle Institution** : limitée si la V1 reste vitrine — s'aggraverait fortement si l'inventaire/disponibilité réelle (Partie 7/8) était tentée sans conception dédiée.
8. **Transformation involontaire en marketplace** : risque réel **seulement si une V2 disponibilité/tarification est construite sans le garde-fou de la Partie 11** (jamais de comparaison multi-établissements dans un flux transactionnel unique).
9. **Surcharge du dashboard** : évitée par le patron `mes-offres` (un seul onglet conditionnel additionnel en V1).
10. **Surcharge de la navigation citoyenne** : évitée — une seule entrée `TABS` renommée, pas de nouveau menu.
11. **Double logique CTA / double logique réservation** : aucun risque si le moteur CTA V1 et le flux RDV existant restent la seule voie (pas de nouveau moteur de réservation en V1).
12. **Sécurité/permissions** : un nouvel onglet dashboard nécessitera une nouvelle `ActionKey` dans `lib/institutionPermissions.ts` (gating standard, aucun risque nouveau si le patron existant est suivi).
13. **Concurrence/race conditions sur disponibilité, double réservation, prix incohérents** : **déjà un risque réel et non traité aujourd'hui**, indépendamment de l'hôtel (Partie 7) — ne serait qu'hérité, pas créé, par une V1 qui réutilise `paid_services`/RDV classique sans inventaire réel. **Deviendrait critique** si une V2 disponibilité/inventaire était construite sans corriger cette lacune au préalable.
14. **Évolution future vers d'autres métiers** : le patron `secteur`-gated + filtre additif dashboard + section conditionnelle fiche généralise correctement (Partie 16) tant que la discipline "pas de duplication, pas de nouveau composant par métier" est maintenue.

---

## PARTIE 15 — Proposition V1

1. **Comment activer le mode Hôtel ?** `institutions.secteur === "hotel"`, calculé une fois côté fiche/dashboard, jamais dupliqué (même discipline que `ctaDecision`).
2. **Quelle donnée détermine le mode ?** `secteur` — pas de nouveau `profile_type`, conforme à la contrainte explicite.
3. **Où placer la logique ?** Un petit module `lib/` dédié (ex. `lib/modeHotel.ts`, calque du modèle `lib/prestataireCapacites.ts`) exposant un simple booléen/label, consommé par la fiche publique et le dashboard.
4. **Comment conserver la fiche actuelle intacte ?** Blocs conditionnels additifs dans le fichier existant (Partie 12), zéro extraction de composant, zéro changement pour `secteur !== "hotel"`.
5. **Quels composants communs réutiliser ?** Tous sauf la section SERVICES (relabelée), voir Partie 3/13.
6. **Quels composants Hôtel ajouter ?** Un bloc "Équipements & règles" (texte libre) près de "Plus d'informations" ; relabellage de SERVICES en "Chambres".
7. **Quels écrans dashboard ajouter ?** Un seul, "Configuration Hôtel" (texte libre, patron `ConditionsInformationsTab.tsx`), gaté comme `mes-offres`.
8. **Quelles données sont nécessaires ?** Aucune nouvelle colonne au-delà de la valeur `secteur="hotel"` — les "chambres" réutilisent `paid_services` tel quel.
9. **Quelles migrations sont nécessaires ?** **Une seule** : extension du CHECK constraint `institutions_secteur_check` pour ajouter `'hotel'`. Aucune autre.
10. **Plus petit chantier V1** : (a) migration CHECK constraint, (b) 9ᵉ option dans `ActiviteStep.tsx` + synchronisation des 5 autres emplacements de taxonomie (Partie 2), (c) 1-2 blocs conditionnels dans `InstitutionPublicClient.tsx`, (d) 1 onglet dashboard conditionnel réutilisant des patterns existants (texte libre), (e) relabellage de "Services" en "Chambres" en mode hôtel. **Aucune réservation par date, aucun inventaire, aucune galerie structurée en V1.**

---

## PARTIE 16 — Vision future

Le patron `secteur`-gated (gate déterministe + filtre dashboard additif + section fiche conditionnelle) généralise proprement à d'autres métiers **tant que chaque métier reste additif et ne nécessite pas son propre moteur de données** :

- **Hôtel → réservation** : V1 vitrine (ce document) ; vraie réservation par date = chantier séparé avec son propre modèle (Partie 7/8).
- **Restaurant → réservation** : même limite que l'hôtel — le RDV classique (créneau ponctuel) convient probablement mieux à un restaurant (réservation de table à une heure donnée) qu'à l'hôtel (séjour multi-nuits) ; **pas nécessairement besoin d'un nouveau modèle**, à réévaluer au moment venu.
- **Cabinet/Clinique → RDV/services** : déjà entièrement couvert par le système actuel, **aucun mode spécialisé nécessaire**.
- **Centre de conférence → réservation d'espace** : proche du cas hôtelier (créneaux longs, capacité, tarif) — bénéficierait du même chantier "inventaire/disponibilité réelle" que l'hôtel, à mutualiser si les deux sont un jour construits.
- **Entreprise → contact/services** : déjà couvert par le CTA V1 (Découvrir/Contacter), aucun mode spécialisé nécessaire.
- **Institution → démarches** : déjà couvert par le socle actuel.

**Le principe qui tient** : `UNE PHILOSOPHIE (Partie 11) + UN SOCLE (fiche/dashboard actuels, inchangés) + DES CAPACITÉS MÉTIER (secteur-gated, additives) + DES EXPÉRIENCES ADAPTÉES (blocs conditionnels, pas de nouvelle app)`. Le risque à surveiller à long terme : si 3+ métiers nécessitent un jour un vrai moteur d'inventaire/disponibilité (hôtel, centre de conférence, éventuellement restaurant), envisager alors — et seulement alors — un modèle de données partagé (`resource_inventory`/`resource_availability` générique plutôt qu'un par métier) pour éviter de reconstruire la même chose trois fois.

---

## PARTIE 17 — Décisions CEO requises

1. **Confirmer `secteur` comme discriminant** (9ᵉ valeur "hotel"), impliquant une migration minimale (extension CHECK constraint) — seule option viable, `category` étant cassée et un nouveau `profile_type` étant explicitement exclu.
2. **Valider le périmètre V1 "vitrine"** (identité + équipements/politiques en texte libre + chambres affichées comme des `paid_services` nommés, PAS de réservation par date/inventaire/tarification réelle) — la vraie réservation hôtelière est un chantier séparé et plus lourd, à planifier après validation du concept en production.
3. **Valider l'absence de verrou sur le changement de `secteur`** post-inscription pour cette V1 (risque = incohérence d'affichage silencieuse, jamais une casse) — ou demander l'ajout d'un verrou symétrique à celui de `statut_juridique`.
4. **Confirmer que la galerie structurée par contexte et le vrai moteur d'inventaire/disponibilité sont explicitement DEFER** (chantiers séparés, non inclus dans cette V1).
5. **Confirmer l'approche additive dans les fichiers existants** (pas d'extraction `CommonSections`/`IndustrySections` maintenant) — réévaluer uniquement si 2-3 métiers similaires s'accumulent.

---

## PARTIE 18 — Recommandation finale

**GO — MAIS AVEC CONDITIONS.**

Le mode Hôtel V1 tel que scopé Partie 15 (vitrine : identité, équipements/politiques en texte, chambres comme services nommés, aucune réservation par date/inventaire réel) est réalisable avec une seule migration minimale, sans `profile_type`, sans casser la fiche actuelle, sans dupliquer aucune logique métier, et respecte intégralement la philosophie Yelen (Partie 11).

**Conditions non négociables pour que ce GO reste valable** :
1. Aucune tentative de construire une vraie disponibilité/tarification par date dans ce même chantier — c'est structurellement incompatible avec le système actuel (Partie 7/8) et nécessite une conception de données dédiée, séparée.
2. Aucune extraction de composants `CommonSections`/`IndustrySections` maintenant — approche additive uniquement (Partie 12).
3. La lacune de concurrence/race condition déjà présente sur le booking actuel (Partie 7, point 6) doit être corrigée **avant** toute tentative future d'inventaire hôtelier réel — sinon le risque de survente serait hérité et aggravé.
4. La dette de duplication de la taxonomie `secteur` (6 emplacements, Partie 2) devrait idéalement être nettoyée avant d'y ajouter une 9ᵉ valeur, pour ne pas aggraver un problème déjà identifié.

Si ces conditions sont respectées, ce chantier peut être lancé sans réanalyse complète — cette spécification est suffisamment précise pour démarrer l'implémentation dès validation CEO des points de la Partie 17.

---

**Aucun code, aucune migration, aucun commit n'a été effectué pendant cet
audit. Implémentation en attente de validation explicite du CEO sur les
points de la Partie 17.**

---

## PARTIE 19 — État d'implémentation (mis à jour 20/08/2026)

Légende : **Clos** = code livré, pas de travail restant prévu ·
**In progress** = travail délibérément incomplet ou en attente d'une
décision · **Not verified** = code livré + `tsc --noEmit`/`build` propres,
mais **jamais ouvert dans un navigateur** (aucun outil de test visuel
disponible dans cet environnement — voir CLAUDE.md `/honnetete`) ·
**Verified** = confirmé par un test réel de Bryan en conditions réelles.

| Item | Fichiers | Statut |
|---|---|---|
| Gate Hôtel V1 (`activite_principale_code === "hotellerie"`) | `page.tsx`, `InstitutionPublicClient.tsx` | **Clos** |
| Onglet dashboard "Configuration Hôtel" (Équipements & règles) | `ConfigurationHotelTab.tsx` | **Clos**, Not verified |
| Onglet dashboard "Services" scindé Chambres/Prestations (V2) | `ServicesHotelTab.tsx` (nouveau, remplace `ServicesTab.tsx` pour les hôtels) | **Clos**, Not verified |
| `ServicesTab.tsx` (14 autres secteurs) | `ServicesTab.tsx` | **Clos**, Verified — inchangé fonctionnellement ; nettoyé le 20/08/2026 d'un relabellage "Chambres" devenu mort (le composant n'est plus jamais monté pour un hôtel depuis l'introduction de `ServicesHotelTab.tsx`, voir Partie 20 ci-dessous) |
| Chambres — CRUD nom/description/prix/**jusqu'à 5 photos**/**1 vidéo (≤60s)** | `ChambreForm`, route `api/institution/services`, `api/institution/services/media` | **Clos**, Not verified |
| Prestations (réservable/commandable/supplément/horaires limités), familles dynamiques | `PrestationForm` | **Clos**, Not verified. "Inclus"/"sur demande sans tarif" explicitement hors périmètre (validation `prix>0` partagée, non modifiée) |
| Horaires structurés (widget identique à Profil Entreprise, plus de texte libre) | `ServicesHotelTab.tsx`, `lib/horaires.ts` | **Clos**, Not verified |
| Fiche publique — section "Chambres" (grille photo/prix) | `InstitutionPublicClient.tsx` | **Clos**, Not verified |
| Fiche publique — bloc additif "Expérience & Services" (prestations) | `InstitutionPublicClient.tsx` | **Clos**, Not verified |
| Fiche publique — Vue 2 (détail chambre plein écran) + Vue 3 (galerie photo/vidéo plein écran) | `InstitutionPublicClient.tsx` | **Clos**, Not verified |
| Migration colonnes `paid_services` (type_prestation/unite_prix/horaires/localisation/est_chambre/photos/video_url/video_duree_secondes) | `20260821000010...sql` + correctif `20260821000011...sql` | **In progress** — correctif écrit suite à erreur 42701 (colonnes déjà partiellement créées par une exécution antérieure de 000010), **en attente d'exécution par Bryan** ; 2 points nécessitent sa confirmation avant lancement (perte des anciennes valeurs `horaires` texte libre non-JSON, suppression de `photo_url`) |
| Assistant de réservation (`/rdv/[id]`) — distinction chambre vs prestation | `app/rdv/[id]/page.tsx` | **In progress**, non touché — chambres et prestations apparaissent aujourd'hui mélangées dans la même liste "Services premium" du wizard, sans distinction visuelle. Le paramètre `?service=` utilisé par les CTA "Réserver"/"Demander une réservation" n'est **toujours pas lu** par cette page (dette préexistante, confirmée à nouveau ce tour-ci, jamais corrigée) — le citoyen atterrit dans l'assistant mais doit resélectionner manuellement l'item |
| Demandes suivies (statut Envoyée→Terminée, ménage/room service) | — | **Not started**, reporté explicitement (dépendance non résolue : aucune notion de "citoyen en séjour" dans le modèle de données actuel) |

### Incohérence trouvée et corrigée le 20/08/2026 (revue critique)

`ServicesTab.tsx` contenait un relabellage conditionnel `isHotel` ("Offre
gratuite" → "Chambres", placeholders/textes hôtel-spécifiques) hérité du
tout premier lot de ce chantier (avant l'introduction de
`ServicesHotelTab.tsx`, qui a depuis remplacé `ServicesTab.tsx` **en
intégralité** pour les institutions hôtelières — `page.tsx:4266-4268`).
Conséquence : `isHotel` ne pouvait plus jamais être vrai dans ce fichier,
code mort et trompeur pour un futur lecteur (commentaires affirmant que
cette section "alimente la section Chambres de la fiche publique", faux
depuis le passage aux chambres `paid_services`). Retiré intégralement —
`ServicesTab.tsx` est revenu à un comportement strictement générique,
identique pour les 15 secteurs.

### Point ouvert, pas corrigé ce tour-ci (nécessite une décision)

L'assistant de réservation ne sait pas aujourd'hui présenter différemment
une chambre (photo, prix/nuit) d'une prestation (massage, transfert…) —
les deux sont des `paid_services` actifs, listés ensemble sans
distinction. Corriger cela toucherait `app/rdv/[id]/page.tsx`, fichier
critique du parcours de réservation citoyen — non modifié sans validation
explicite, conformément au protocole (2 fichiers max, jamais de
modification du flux de réservation sans accord préalable).
