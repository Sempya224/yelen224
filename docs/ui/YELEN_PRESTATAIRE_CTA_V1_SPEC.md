**STATUT : CLOSED (18/08/2026)** — voir §22 pour le bilan
d'implémentation complet et §23 pour la final review read-only +
validation visuelle CEO qui clôture le chantier. Aucun commit, aucun
déploiement.

# Spécification V1 — CTA dynamique fiche Prestataire (17/08/2026)

Phase de décision/spécification, suite directe de `docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT.md`
(Phase 0), `docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT_PHASE_0_5.md` (Phase 0.5)
et `docs/ui/YELEN_PRESTATAIRE_CTA_AUDIT.md` (audit CTA). **READ-ONLY —
aucun code, aucune migration, aucune modification DB, aucune suppression
de champ, aucune fonctionnalité implémentée.** Chaque affirmation
technique importante est sourcée fichier:ligne, vérifiée par lecture
directe (pas reprise telle quelle des audits précédents sans
recontrôle sur les points structurants).

---

## §1. Objectif produit

Faire évoluer la fiche Prestataire d'un annuaire "Prendre RDV partout"
vers une fiche d'activité où le CTA principal reflète l'action la plus
pertinente pour l'activité réelle du prestataire (ex. Nimba SMS = PME
tech → "Découvrir" + WhatsApp/Appeler en secondaire + "Prendre RDV" en
tertiaire si réellement disponible), en s'appuyant sur les **capacités
réelles** du prestataire plutôt que sur un nouveau champ `profile_type`
artificiel — sauf si les données actuelles s'avèrent insuffisantes.

---

## §2. État actuel réel

Rappel factuel (détail complet et sourcé dans `YELEN_PRESTATAIRE_CTA_AUDIT.md`
§4-§5, non re-démontré ici) : le CTA "Prendre RDV"/"Réserver" est rendu
**inconditionnellement** sur 5 surfaces (fiche hero, fiche bandeau fixe,
carte accueil, cartes recherche grille+liste, page Ambassades statique),
et **seul** le wizard `/rdv/[id]` vérifie réellement services/créneaux
avant de laisser le citoyen avancer (`app/rdv/[id]/page.tsx:878-899`).
Le seul CTA déjà 100% piloté par une capacité réelle dans tout le
produit est celui des Offres partenaires (`app/offres/[id]/page.tsx:220-235`,
`offre.cta_url`), système séparé du modèle prestataire.

---

## §3. Modèle de capacités existant

| Capacité | Champ(s) source | Type | Vivant aujourd'hui ? |
|---|---|---|---|
| Booking | `institutions.services` (jsonb) + `paid_services.is_active` + `institutions.disponibilites` (jsonb) | dérivée | Oui côté wizard, **non calculée** côté fiche publique |
| Website | `institutions.website` (text) | colonne directe, validée | Oui (post-P0) |
| WhatsApp | `institutions.whatsapp` (text) | colonne directe | Oui, **mais masqué par un fallback générique** (§14) |
| Téléphone | `institutions.phone` (text) | colonne directe | Oui |
| Email | `institutions.email` (text) | colonne directe | Oui |
| Adresse | `institutions.adresse` (text) | colonne directe | Oui, affichage seulement |
| Horaires | `institutions.horaires` (jsonb, `lib/horaires.ts`) | dérivée (`isOuvertNow`) | Oui, affichage seulement (badge Ouvert/Fermé) |
| Secteur | `institutions.secteur` (CHECK, 8 valeurs) | colonne directe | Oui, obligatoire au wizard |
| Category | `institutions.category` (text libre) | colonne directe | Vivante dans le code, **NULL pour toute institution récente** (§9) |

Aucune capacité listée ici ne nécessite une colonne supplémentaire —
toutes existent déjà et sont déjà lues quelque part dans le code
(preuve détaillée §5).

---

## §4. Sources de données

- `institutions.services` (jsonb) : structure `{ nom, description,
  duree_minutes, champs_complementaires }`, écrite via `PUT
  /api/institution/profile` (`EDITABLE_FIELDS`,
  `app/api/institution/profile/route.ts:55`), lue publiquement dans
  `InstitutionPublicClient.tsx:1278-1298` (rendu confirmé par lecture
  directe : liste de lignes cliquables `Link href="/rdv/{id}?service=..."`,
  chaque service étant une simple chaîne côté fiche — voir `toServiceLabel`/
  `parseArr`, lignes 129-147, qui n'extraient que `.nom`).
- `paid_services` (table séparée) : colonnes confirmées
  `app/api/institution/services/route.ts:66-78`
  (`institution_id, nom, prix, duree_minutes, description, categorie,
  champs_complementaires, is_active, taux_taxe, prix_promo, promo_actif`),
  filtrée `is_active=true` lors de la lecture wizard
  (`app/rdv/[id]/page.tsx:584-601`). **Non chargée aujourd'hui dans
  `InstitutionPublicClient.tsx`** (0 occurrence de `paid_services` dans
  ce fichier, confirmé par grep exhaustif lors de l'audit CTA).
- `institutions.disponibilites` (jsonb) : parsée par
  `generateSlotsInRange(raw, days)` (`lib/disponibilites.ts:20-75`),
  3 formats de chaîne supportés (ISO / hebdo / quotidien), sortie
  `{key, dateRdv, heureRdv}[]` triée. Un tableau vide signifie
  fiablement "aucun créneau réel" (aucune valeur par défaut dans la
  fonction).
- `institutions.website` : validée par `lib/urlValidation.ts`
  (`validerUrlExterne` à l'écriture, `urlExterneSure` à l'affichage —
  chantier P0, `app/institution/[id]/InstitutionPublicClient.tsx:865`).
- `institutions.whatsapp`, `.phone`, `.email` : colonnes texte simples,
  castées `String(...)` sans validation de format
  (`InstitutionPublicClient.tsx:542-545`).

---

## §5. Règles de calcul des capacités (dérivation, preuve par le code)

```
hasBooking  = (services.length > 0 || paidServicesActifs.length > 0)
              && generateSlotsInRange(disponibilites, N).length > 0

hasWebsite  = urlExterneSure(website) !== null

hasWhatsApp = typeof whatsapp === "string" && whatsapp.trim() !== ""
              // ⚠️ PAS whatsappUrl !== undefined — whatsappUrl existe
              // TOUJOURS aujourd'hui (fallback générique, §14). Un futur
              // hasWhatsApp doit tester whatsapp brut, pas la variable
              // dérivée actuelle.

hasPhone    = typeof phone === "string" && phone.trim() !== ""

hasEmail    = typeof email === "string" && email.trim() !== ""
```

**Preuve de dérivabilité — `hasBooking`** :
- `generateSlotsInRange` : `lib/disponibilites.ts:20-75`, signature et
  comportement confirmés (Phase CTA_AUDIT §6, re-vérifié).
- `services.length` : déjà vérifié en 3 endroits de la fiche publique
  (`InstitutionPublicClient.tsx:891,1044,1278`) — confirmé par lecture
  directe ligne 1278 ce tour-ci (`{inst.services.length === 0 ? (...) : (...)}`).
- `paidServicesActifs` : **gap confirmé** — nécessite une requête
  supplémentaire côté fiche publique (`paid_services` filtré
  `is_active=true`), non chargée aujourd'hui. C'est le seul élément
  manquant pour calculer `hasBooking` correctement sur cette page — un
  ajout de requête, pas une migration.

**Preuve — `hasWhatsApp` doit être recalculé, pas réutiliser
`whatsappUrl`** : `InstitutionPublicClient.tsx:872-874`, lu ce tour-ci :
```tsx
const whatsappUrl = inst.whatsapp
  ? `https://wa.me/${inst.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappMsg)}`
  : `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;
```
`whatsappUrl` est **toujours** une chaîne non vide, avec ou sans
`inst.whatsapp` — un `hasWhatsApp` basé sur `!!whatsappUrl` serait donc
toujours vrai, ce qui est faux fonctionnellement (voir §14).

---

## §6. Matrice capacité → CTA

| Capacité vraie | Libellé CTA principal | Icône suggérée (existante dans le code) |
|---|---|---|
| `hasBooking` | "Prendre RDV" | `Icons.Cal` (déjà utilisée ligne 1022/2032) |
| `hasWebsite` (et pas `hasBooking`) | "Découvrir" | `Icons.Globe` (déjà utilisée ligne 1202 section Contacts) |
| `hasWhatsApp` (et pas les précédents) | "Contacter" | `Icons.Whatsapp` (déjà utilisée ligne 1025) |
| `hasPhone` (et pas les précédents) | "Appeler" | icône téléphone (déjà utilisée ligne 1031/1179) |
| Aucune capacité vraie | Pas de CTA principal doré — fiche informative seule (adresse/horaires si présents) | — |

Aucune nouvelle icône nécessaire — toutes existent déjà dans
`InstitutionPublicClient.tsx` pour d'autres usages (actions secondaires
actuelles), réutilisables telles quelles pour le CTA principal.

---

## §7. Priorité du CTA principal — déterminée par l'architecture réelle, pas une hypothèse

La proposition de Bryan (booking > website > WhatsApp > téléphone) est
**confirmée comme la bonne priorité**, mais par une preuve d'architecture
et non reprise telle quelle :

1. **Booking est, de très loin, la capacité la plus investie
   techniquement dans Yelen.** Preuve par le volume d'infrastructure
   dédiée, aucune autre capacité n'a d'équivalent : wizard dédié
   (`app/rdv/[id]/page.tsx`, 1212 lignes), cycle de vie complet
   (`rdv_events`), QR de présence (`api/qr/generate`, `api/qr/validate`),
   validation institution (`ValiderRdvTab.tsx`), paiements liés
   (`paid_bookings`, `recus`, `transactions` — module financier
   complet, voir CLAUDE.md `/modules-livres`), notifications de cycle
   de vie RDV. **Aucune** autre capacité (website, whatsapp, phone) n'a
   de système de suivi, de statut ou de traçabilité côté Yelen — elles
   sont de simples liens sortants. Quand `hasBooking` est vrai, c'est
   objectivement l'action qui engage le plus le prestataire *dans*
   Yelen (donnée traçable, mesurable, génératrice de revenu pour
   certains — `paid_bookings`) — elle doit primer.
2. **Website ensuite** : c'est la seule capacité restante qui permette
   un vrai "approfondissement" de la compréhension de l'activité par le
   citoyen (catalogue, présentation, offre) sans nécessiter un contact
   humain immédiat — cohérent avec l'exemple Nimba SMS donné par Bryan
   ("Découvrir" avant tout contact direct). Déjà validée strictement
   (P0), c'est la capacité la plus sûre à afficher en confiance après
   `hasBooking`.
3. **WhatsApp ensuite** : contact humain direct mais asynchrone, plus
   léger qu'un appel — cohérent avec son usage déjà démontré dans le
   produit (bouton dédié systématique à côté du CTA RDV aujourd'hui,
   `InstitutionPublicClient.tsx:1024-1026`).
4. **Téléphone en dernier repli** : contact humain immédiat mais le
   moins qualifiable côté Yelen (aucune trace de l'échange, contrairement
   à WhatsApp qui au moins pré-remplit un message contextualisé,
   `whatsappMsg` ligne 871).

**Contrainte explicite respectée** : `secteur` n'intervient **à aucun
moment** dans cette priorité — il ne sert qu'en absence de toute
capacité forte, comme classification d'affichage (icône/couleur), jamais
pour *prétendre* qu'une capacité existe. Une banque avec un `website`
renseigné mais `hasBooking=true` affichera "Prendre RDV", pas
"Découvrir" — conforme à l'exemple donné en Phase 0.5 et reconfirmé par
Bryan dans ce brief.

---

## §8. Actions secondaires

Règle : toute capacité vraie **non retenue comme CTA principal** devient
une action secondaire, dans le même ordre de priorité (§7), toujours
affichée si vraie — comportement déjà partiellement présent aujourd'hui
(section Contacts, `InstitutionPublicClient.tsx:1165-1214`, chaque canal
gardé indépendamment `{inst.x && (...)}`), à généraliser pour inclure
"Prendre RDV" comme action secondaire quand une autre capacité est
choisie en CTA principal (cas Nimba SMS : `[Découvrir]` en principal,
`[Prendre RDV]` toujours visible en dessous si `hasBooking`).

---

## §9. Secteur vs category — analyse complète

**Pourquoi `category` existe encore** : c'est l'ancienne taxonomie de
classification (10 valeurs françaises avec accents : `"Hopital /
Clinique"`, `"Ecole / Universite"`, `"Mairie / Administration"`,
`"Banque / Microfinance"`, `"Pharmacie"`, `"Cabinet medical"`,
`"Tribunal / Justice"`, `"Transport / Logistique"`, `"ONG /
Association"`, `"Autre"` — confirmé `app/recherche/shared.tsx:24-35`),
antérieure à l'introduction de `secteur` (8 valeurs, CHECK contraint,
migration `20260710000001`). Le commentaire `lib/secteurs.ts:6-8` la
qualifie de "dépréciée" mais c'est **inexact** au niveau du code.

**Où elle est consommée (vivante)** :
- Filtre serveur `/recherche` : `RechercheInner.tsx:846` (`query.eq("category", filterCat)`).
- Libellé du CTA (badge grille/liste) : `app/recherche/shared.tsx:39-42`
  (`CATEGORIES_RESERVATION`/`libelleAction`), consommé
  `RechercheInner.tsx:76` (grille) et `:1421` (liste) — confirmé par
  lecture directe ce tour-ci.
- Icône/gradient de carte : `CAT_META` (`app/recherche/shared.tsx:24-35`),
  consommé `RechercheInner.tsx:48,1371`, `RechercheOverlay.tsx`,
  `app/rdv/[id]/page.tsx:155`, `app/institution/codeqr/page.tsx:348-369`.
- KPIs admin par catégorie : `app/api/admin/kpis/route.ts:62,87,128`.
- Export CSV admin : `app/api/admin/export/route.ts:82`.

**Où elle est cassée** : `app/api/institution/auth/register/route.ts:242`
n'écrit `category` que si le body la fournit ; **aucun écran du wizard
actuel** (`app/institution/inscription/**`) ne l'envoie (0 occurrence,
confirmé par grep exhaustif). Toute institution créée depuis le passage
au wizard `secteur` a donc `category = NULL`, et `CAT_META["Autre"]`
sert de repli silencieux partout où `category` est lue pour l'affichage
(`app/recherche/shared.tsx:59,134`) — sans erreur visible, juste une
dégradation silencieuse de la pertinence des filtres/icônes/CTA-labels.

**Doit-elle être supprimée, réparée ou conservée ?**
Trois options, aucune tranchée ici (décision CEO, §20) :
- **Réparer** : faire écrire `category` automatiquement depuis
  `secteur` au wizard (mapping 8→10 valeurs, ou réduire `CAT_META`/
  `CATEGORIES_RESERVATION` à 8 clés alignées sur `secteur`) — coût
  applicatif faible, aucune migration, restaure la fiabilité de tout ce
  qui consomme `category` aujourd'hui.
- **Supprimer** : migrer tous les consommateurs listés ci-dessus vers
  `secteur` (8 valeurs au lieu de 10 — perte de granularité pour
  `CAT_META`, ex. distinction "Hopital/Clinique" vs "Cabinet medical"
  aujourd'hui possible via `category` n'existe pas dans `secteur` qui
  regroupe tout sous `sante`) — plus gros chantier, aucune migration DB
  nécessaire non plus (juste suppression d'usages code, la colonne
  peut rester non lue), mais risque de régression sur les KPIs
  admin/export historiques qui datent d'avant `secteur`.
- **Conserver tel quel** : ne rien faire, le système de capacités V1
  n'a pas besoin de `category` (le CTA se base sur les capacités
  réelles + `secteur` comme classification par défaut, jamais
  `category`) — le bug reste, mais isolé aux filtres de recherche/
  icônes déjà identifiés comme dégradés silencieusement, indépendant du
  chantier CTA.

**`secteur` doit-il devenir l'unique typologie ?** Techniquement oui, il
l'est déjà de fait pour tout ce qui est récent (seul champ toujours
renseigné, obligatoire au wizard) — mais `category` reste la seule
source pour les 10 valeurs de granularité fine utilisées par `CAT_META`/
`CATEGORIES_RESERVATION`/`libelleAction`. Un passage complet à `secteur`
nécessite de redéfinir cette granularité sur 8 valeurs au lieu de 10 —
décision produit, pas seulement technique.

**Impact sur le système de capacités V1 proposé (§10)** : **aucun** —
le modèle de capacités proposé ici n'utilise ni `category` ni
`secteur` pour déterminer le CTA principal (uniquement les capacités
réelles, §7). `secteur` n'intervient qu'en classification d'affichage
secondaire (icône/couleur méta), jamais pour le calcul du CTA. Le bug
`category` peut donc être traité indépendamment, dans un chantier
séparé.

---

## §10. Architecture proposée

Une fonction pure de décision, calculée une seule fois par institution,
à partir des capacités dérivées (§5) et retournant `{ cta: {label,
action}, secondaires: [...] }` selon la priorité fixe (§7). Elle
n'existe nulle part aujourd'hui — aucune fonction équivalente trouvée
dans le repo (`libelleAction`, `app/recherche/shared.tsx:40-42`, ne
fait que choisir un **libellé** entre 2 valeurs selon `category`, sans
jamais vérifier une capacité réelle ni décider de la **présence** du
bouton).

Elle devrait vivre dans un module partagé (`lib/`) plutôt que dupliquée
dans chaque composant consommateur, pour permettre — si l'Option B est
retenue plus tard — sa réutilisation identique entre la fiche complète
et les cartes de recherche/accueil, sans réécrire la logique à chaque
fois.

---

## §11. Source de vérité

**Aujourd'hui, il n'existe aucune source de vérité unique** — deux
types `Institution` incompatibles coexistent :
- `InstitutionPublicClient.tsx:24-34` (local, non exporté).
- `app/recherche/shared.tsx:15-22` (exporté, forme différente — inclut
  `latitude`/`longitude`/`statut` obligatoires, exclut `website`/
  `whatsapp`/`services`).

Pour qu'une fonction de décision de CTA (§10) serve de source de vérité
réelle à travers toutes les surfaces, elle doit être **indépendante du
type `Institution` complet** — n'exiger en entrée que les champs
strictement nécessaires au calcul des capacités (`services`,
`disponibilites`, `website`, `whatsapp`, `phone`, et `paid_services`
actifs si disponibles). Cela permet de l'appeler depuis n'importe quel
composant qui a accès à ces champs bruts, même sans unifier les deux
types `Institution` existants dans l'immédiat.

---

## §12. Surfaces impactées

| Surface | Fichier | CTA aujourd'hui | Duplication de logique constatée |
|---|---|---|---|
| Fiche — hero | `InstitutionPublicClient.tsx:1020-1027` | "Prendre RDV" + WhatsApp, en dur | Bloc JSX dupliqué avec la ligne suivante |
| Fiche — bandeau fixe | `InstitutionPublicClient.tsx:2030-2034` | "Prendre RDV", en dur | Doublon exact du hero (même `href`, style différent) |
| Fiche — état vide avis | `InstitutionPublicClient.tsx:1649` | "Prendre rendez-vous" | Condition sans rapport (nb avis) |
| Fiche — quota questions | `InstitutionPublicClient.tsx:1854` | "Prendre rendez-vous" | Condition sans rapport (quota) |
| Carte accueil (bottom-sheet) | `components/CarteMapHome.tsx:381-396` | "Prendre un rendez-vous", en dur | Logique indépendante, aucun lien avec la fiche |
| Cartes recherche — grille | `app/recherche/RechercheInner.tsx:74-76` | `libelleAction(inst.category)`, présence en dur | Logique indépendante (fichier `shared.tsx`) |
| Cartes recherche — liste | `app/recherche/RechercheInner.tsx:1413-1422` | `CATEGORIES_RESERVATION.has(inst.category) ? "Réserver" : "RDV"`, présence en dur | Même logique que grille, dupliquée inline au lieu d'appeler `libelleAction` |
| `CarteInstitutionCard` (partagée recherche/overlay) | `app/recherche/shared.tsx:129-187` | Aucun CTA RDV — seulement "Voir la fiche" (174), "Appeler" conditionnel (175-179) | Pas de duplication (n'a pas cette logique du tout aujourd'hui) |

**Confirmation directe (ce tour-ci)** de la duplication ligne 1421 :
`{CATEGORIES_RESERVATION.has(inst.category) ? "Réserver" : "RDV"}` —
réimplémente l'intérieur de `libelleAction()` au lieu de l'appeler,
alors que `libelleAction` est importé et utilisé correctement ligne 76
du même dossier. C'est une duplication existante indépendante du
chantier CTA, mais qui illustre concrètement le risque de dérive déjà
présent aujourd'hui sur seulement 2 fichiers — un signal d'alerte pour
l'Option B (§13) si la logique de capacités n'est pas centralisée dans
un module partagé unique dès le départ.

---

## §13. Option A vs Option B

### Option A — V1 sur la fiche Prestataire uniquement

- **Fichiers touchés** : `InstitutionPublicClient.tsx` (calcul des
  capacités + rendu CTA hero/bandeau fixe/actions secondaires) + un
  nouveau module `lib/` pour la fonction de décision (§10), + requête
  `paid_services` ajoutée à ce fichier (gap §5).
- **Risque** : faible — un seul fichier de rendu modifié, logique
  isolée, aucune autre surface touchée.
- **Cohérence UX** : **incohérence temporaire assumée** — la fiche
  complète afficherait un CTA intelligent ("Découvrir" pour Nimba SMS)
  tandis que la carte de recherche menant à cette même fiche
  afficherait encore "Prendre RDV"/"Réserver" (`libelleAction`, non
  touché). Un citoyen verrait un libellé différent entre la carte et la
  fiche pour la même institution.
- **Risque de régression** : très faible — la fiche est déjà le seul
  endroit où la logique complète de RDV est gérée (wizard, services,
  disponibilités) ; les autres surfaces ne font que router vers elle
  (confirmé §12, aucune n'implémente sa propre logique de réservation).
- **Complexité** : faible.
- **Dépendances** : aucune — n'exige pas de résoudre le problème des
  deux types `Institution` (§11) ni le bug `category` (§9).

### Option B — fiche + cartes recherche + accueil + autres surfaces

- **Fichiers touchés (en plus d'Option A)** : `app/recherche/shared.tsx`
  (type `Institution`, remplacement de `CATEGORIES_RESERVATION`/
  `libelleAction` par la nouvelle fonction de décision, `CAT_META` à
  reconsidérer), `app/recherche/RechercheInner.tsx` (2 sites de rendu,
  lignes 74-76 et 1413-1422), `components/CarteMapHome.tsx` (lignes
  381-396), potentiellement `app/ambassades/page.tsx` si inclus (§15 —
  non recommandé), potentiellement `app/compte/favoris/favoris-client.tsx`
  (actuellement sans CTA RDV du tout, à vérifier si un ajout est désiré).
- **Risque** : moyen à élevé — 4-6 fichiers modifiés simultanément,
  deux types `Institution` à réconcilier ou à faire cohabiter (§11)
  pour que la fonction de décision reçoive les bons champs partout
  (ex. `app/recherche/shared.tsx:15-22` n'a aujourd'hui ni `website` ni
  `whatsapp` ni `services` dans son type — ajout de champs de type
  nécessaire, sans toucher la DB, mais touchant la requête `.select()`
  qui alimente ces cartes).
- **Cohérence UX** : meilleure au global (cohérence totale entre toutes
  les surfaces dès la V1).
- **Risque de régression** : plus élevé — `app/recherche/RechercheInner.tsx`
  est un fichier dense (recherche, filtres, tri, 2 vues) déjà identifié
  comme ayant une duplication de logique existante (§12) ; y intervenir
  touche une surface à fort trafic citoyen.
- **Complexité** : moyenne à élevée.
- **Dépendances** : nécessite de traiter — ou explicitement de
  contourner sans les résoudre — le problème des deux types
  `Institution` (§11) et la question `category`/`secteur` pour les
  icônes de carte (§9), qui n'ont pas d'impact si on reste sur
  l'Option A.

### Recommandation argumentée

**Option A pour la V1.** Elle respecte strictement l'instruction CEO de
rester isolé et minimal, couvre le cas d'usage central de l'exemple
donné (Nimba SMS — la fiche complète est l'endroit où le citoyen
"Découvre" réellement), et ne dépend d'aucune décision non tranchée
(`category`, unification des types). L'incohérence temporaire avec les
cartes de recherche est un compromis UX réel mais mineur et déjà
partiellement présent aujourd'hui (le libellé varie déjà entre "RDV" et
"Réserver" selon la carte sans que cela ait été signalé comme
problématique). Concevoir la fonction de décision comme un module
`lib/` indépendant (§10-§11) dès l'Option A rend l'extension à
l'Option B, plus tard, une extension et non une réécriture.

---

## §14. WhatsApp

**Comportement réel confirmé par lecture directe** —
`InstitutionPublicClient.tsx:872-874` :
```tsx
const whatsappUrl = inst.whatsapp
  ? `https://wa.me/${inst.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappMsg)}`
  : `https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`;
```
Le bouton WhatsApp du hero (`:1024-1026`) utilise `whatsappUrl` **sans
aucune garde** — contrairement au bouton Téléphone juste en dessous
(`{inst.phone && (...)}`, ligne 1029). Résultat : le bouton WhatsApp est
**toujours affiché et toujours cliquable**, même quand `inst.whatsapp`
est vide — il ouvre alors le compose WhatsApp générique (`wa.me/` sans
destinataire), ce qui ne mène à aucune conversation utile pour le
citoyen. C'est un **faux CTA** au sens où Bryan le décrit.

Le commentaire lignes 866-870 explique que ce fallback existe
**volontairement** pour une raison différente (cohérence entre le hero
et la section Contacts, corrigé le 24/07/2026 — avant cette date le
hero ignorait carrément `inst.whatsapp` même quand il existait) — mais
ce correctif n'a jamais ajouté de garde sur la **présence** du bouton,
seulement sur son **contenu**.

**Règle correcte à appliquer (V1)** : `hasWhatsApp = !!inst.whatsapp`
(chaîne non vide) — le bouton WhatsApp (principal ou secondaire) ne doit
être rendu **que** si cette condition est vraie. Le fallback générique
`https://wa.me/?text=...` ne doit plus jamais être utilisé comme
`href` d'un bouton visible — soit le bouton n'existe pas, soit il pointe
vers un vrai numéro.

**Section Contacts déjà correcte à titre de référence** :
`InstitutionPublicClient.tsx:1187` garde déjà `{inst.whatsapp && (...)}`
pour son propre bouton WhatsApp (distinct de celui du hero) — la
correction proposée aligne le hero sur ce pattern déjà existant et
correct ailleurs dans le même fichier.

---

## §15. Ambassades

**Ces données ne représentent pas des institutions réelles au sens du
modèle prestataire.** `AMBASSADES` est un tableau **statique codé en
dur** dans `app/ambassades/page.tsx` (confirmé Phase CTA_AUDIT, lignes
16-45+), objets `{pays, ville, phone, email, statut: "actif", flag,
services}` sans `id` Supabase, sans lien avec la table `institutions`.

**Pourquoi elles ont un CTA "Prendre RDV" aujourd'hui** : le CTA
(`app/ambassades/page.tsx:312-314`, `📅 Prendre RDV — {ville}`) ne mène
même pas à une institution précise — il redirige vers `/recherche?pays=...`,
une recherche filtrée par pays. C'est un CTA marketing/orientation,
pas un vrai lien de réservation vers un prestataire identifiable.

**Recommandation** : **exclure explicitement la page Ambassades du
périmètre V1** (Option A comme Option B) — elle n'a pas de capacités
réelles à calculer (pas de `services`/`disponibilites`/`website` en
base, juste des champs statiques dans le code source), et le CTA
"Prendre RDV" y est déjà, de fait, un raccourci de recherche et non un
vrai engagement de réservation. Migrer ces données vers de vraies lignes
`institutions` (pour qu'elles bénéficient un jour du même moteur de
capacités) est une décision produit distincte, non nécessaire pour cette
V1, et hors périmètre de cette spécification.

---

## §16. Liens externes / in-app browser

**Pour la V1** : conserver la navigation externe actuelle — `<a
href={websiteHref} target="_blank" rel="noreferrer">`
(`InstitutionPublicClient.tsx:1206`, HTML standard, validé par
`urlExterneSure` depuis le chantier P0). Aucune iframe, aucun WebView,
aucune dépendance ajoutée.

**Contrainte technique confirmée** (déjà actée Phase 0.5 §8, reconfirmée
lors de l'audit CTA §9-§10) : un site tiers peut bloquer son intégration
via `X-Frame-Options`/CSP `frame-ancestors` — Yelen ne doit jamais tenter
de contourner ces protections (ni proxy, ni scraping, ni réécriture de
headers). Aucune infrastructure WebView/native n'existe dans le repo
actuel (`package.json` sans dépendance Capacitor/Cordova/react-native-webview,
aucun dossier `ios/`/`android/` — confirmé lors de l'audit CTA).

**Architecture future (documentée, non codée)** : une expérience
"browser dans Yelen" fiable nécessiterait une app native (WebView
`SFSafariViewController`/Chrome Custom Tabs ou équivalent), hors de la
PWA web actuelle — cohérent avec la conclusion déjà actée en Phase 0.5.
Aucune décision, aucune dépendance, aucun choix technique n'est pris ici
— cette section documente uniquement la contrainte pour référence
future.

---

## §17. Migration ou absence de migration

**Cette V1 (Option A) peut être réalisée intégralement sans nouvelle
colonne, sans migration DB, sans `profile_type` — démonstration
complète :**

| Besoin | Donnée déjà existante | Preuve |
|---|---|---|
| `hasBooking` | `institutions.services`, `paid_services.is_active`, `institutions.disponibilites` | §5 — toutes colonnes/tables déjà en base |
| `hasWebsite` | `institutions.website` | Déjà validée depuis P0 |
| `hasWhatsApp` | `institutions.whatsapp` | Colonne déjà existante, juste mal exploitée aujourd'hui (§14) |
| `hasPhone` | `institutions.phone` | Colonne déjà existante |
| Fonction de décision CTA | Nouveau code applicatif (`lib/`) | Aucune donnée nouvelle, juste une fonction pure |
| Requête `paid_services` sur la fiche | Table déjà existante, filtre déjà utilisé ailleurs (`app/rdv/[id]/page.tsx:584-601`) | Ajout d'une requête, pas d'une colonne |

**Ce qui manque réellement** n'est **jamais une donnée manquante en
base**, mais une **requête non encore faite** (`paid_services` côté
fiche publique) et une **fonction de décision non encore écrite** —
les deux sont du code applicatif pur, zéro migration.

---

## §18. Risques

1. **Incohérence UX temporaire (Option A)** — voir §13, compromis
   assumé, à valider explicitement par le CEO.
2. **`hasWhatsApp` mal calculé si le futur code réutilise `whatsappUrl`
   au lieu de `inst.whatsapp` brut** (§14) — risque de régression
   silencieuse si la distinction n'est pas respectée à l'implémentation.
3. **`category` cassé** (§9) reste un risque **si et seulement si** une
   future itération V2 décide de l'utiliser en complément de `secteur`
   pour la classification — sans impact sur cette V1 qui ne s'appuie sur
   aucun des deux pour le calcul du CTA.
4. **Duplication de logique déjà existante** (§12, ligne 1421 vs 76) —
   signal que toute nouvelle logique de capacités doit être centralisée
   dans un seul module dès le départ, sous peine de reproduire le même
   problème.
5. **Aucun test navigateur réel possible** dans cet environnement — à
   valider par Bryan une fois implémenté (comportement visuel du CTA
   selon les capacités, sur mobile notamment).
6. **Page Ambassades** — si elle n'est pas explicitement exclue du
   périmètre à l'implémentation, son CTA "Prendre RDV" statique
   pourrait être modifié par erreur alors qu'elle n'a pas de vraies
   capacités à calculer (§15).

---

## §19. Tests nécessaires (pour la future implémentation, non exécutés ici)

1. `hasBooking = true` (services + créneaux réels) → CTA "Prendre RDV".
2. `hasBooking = false`, `hasWebsite = true` → CTA "Découvrir",
   "Prendre RDV" absent des actions secondaires (cohérent : pas de
   capacité réelle).
3. `hasBooking = false`, `hasWebsite = false`, `hasWhatsApp = true`
   (numéro réel renseigné) → CTA "Contacter".
4. Toutes capacités fortes fausses, `hasPhone = true` → CTA "Appeler".
5. Aucune capacité vraie → pas de CTA principal doré, fiche informative
   seule.
6. `hasBooking = true` **et** `hasWebsite = true` → CTA "Prendre RDV"
   priorisé, "Découvrir" en action secondaire (vérifie l'ordre §7).
7. `inst.whatsapp` vide → bouton WhatsApp absent (régression du
   fallback générique actuel, §14).
8. `inst.whatsapp` renseigné → bouton WhatsApp présent, lien vers le
   vrai numéro.
9. Régression : une institution avec `hasBooking = true` uniquement
   (cas actuel typique, banque/mairie) continue d'afficher "Prendre
   RDV" exactement comme aujourd'hui — non-régression du cas majoritaire.
10. `tsc --noEmit` + `npm run build` propres après implémentation.

---

## §20. Questions nécessitant décision CEO

1. **Option A confirmée pour la V1**, avec incohérence temporaire
   assumée sur les cartes de recherche/accueil (§13) — ou faut-il
   inclure au moins le libellé du badge recherche dès la V1 pour éviter
   l'incohérence, sans toucher au reste (option intermédiaire non
   développée ici, à évaluer si souhaitée) ?
2. **`category`** : réparer (auto-remplissage depuis `secteur`),
   supprimer (migrer tous les consommateurs vers `secteur`), ou
   conserver tel quel pour l'instant (§9) — indépendant de cette V1,
   mais à trancher pour la suite.
3. **Page Ambassades** : confirmer l'exclusion explicite de tout
   périmètre V1 (§15).
4. **Fonction de décision CTA** : accepter qu'elle vive dans un nouveau
   module `lib/` dès la V1 (même si Option A), pour faciliter une
   extension future vers l'Option B sans réécriture ?
5. **Cas "aucune capacité vraie"** (§6, §19 test 5) : la fiche doit-elle
   rester sans CTA principal doré, ou faut-il un CTA de repli minimal
   (ex. "Voir les informations" scrollant vers Contacts) — à trancher
   avant implémentation.

---

## §21. Proposition finale

**Architecture V1 recommandée** : Option A (fiche complète uniquement),
fonction de décision pure dans un nouveau module `lib/`, priorité fixe
`hasBooking > hasWebsite > hasWhatsApp > hasPhone` (§7, justifiée par le
volume d'infrastructure Yelen réellement investi dans le booking),
`hasWhatsApp` recalculé sur `inst.whatsapp` brut (jamais `whatsappUrl`,
§14), requête `paid_services` ajoutée à `InstitutionPublicClient.tsx`
pour fiabiliser `hasBooking` (§5), aucune touche à `category`/`secteur`
pour le calcul du CTA (§9), page Ambassades explicitement exclue (§15),
aucun in-app browser (§16), **zéro migration, zéro nouvelle colonne,
zéro `profile_type`** (§17).

### Ce qui est déjà possible avec l'existant
Toutes les capacités (`hasBooking`, `hasWebsite`, `hasWhatsApp`,
`hasPhone`) sont dérivables dès aujourd'hui à partir de colonnes/tables
déjà en base, avec les fonctions de parsing déjà écrites et éprouvées
(`generateSlotsInRange`, `urlExterneSure`).

### Ce qui manque réellement
Une requête `paid_services` côté fiche publique (absente aujourd'hui) et
une fonction de décision de CTA (n'existe nulle part) — les deux sont du
code applicatif, aucune donnée manquante en base.

### Proposition d'architecture V1
Option A, module `lib/` dédié, priorité fixe capacités > secteur,
`hasWhatsApp` corrigé pour exiger un vrai numéro (§14), Ambassades
exclues (§15).

### Décisions CEO restantes
Les 5 points du §20 — aucun code ne doit commencer avant leur validation
explicite.

### Fichiers qui seraient touchés lors de la future implémentation (Option A)
- `app/institution/[id]/InstitutionPublicClient.tsx` (calcul capacités,
  requête `paid_services` ajoutée, rendu CTA hero + bandeau fixe +
  actions secondaires, correction garde WhatsApp).
- Nouveau fichier `lib/` (fonction de décision de CTA, nom à définir à
  l'implémentation).
- Aucun autre fichier si Option A confirmée ; en cas d'extension future
  vers l'Option B : `app/recherche/shared.tsx`,
  `app/recherche/RechercheInner.tsx`, `components/CarteMapHome.tsx`
  (§12/§13).

---

**Aucun code, aucune migration, aucune modification n'a été effectuée
pendant cette phase de spécification. Implémentation en attente de
validation explicite du CEO sur les points du §20.**

---

## §22. Bilan d'implémentation (17/08/2026) — IMPLEMENTED

Implémentation exactement selon l'Option A verrouillée par le CEO
(décision reçue le 17/08/2026, reprenant tous les points §1-§21
ci-dessus tels quels, sans écart d'architecture).

### 22.1 Fichiers réellement modifiés

Confirmé par `git status` — **seuls les 2 fichiers autorisés ont été
touchés**, aucun autre :

- **`lib/prestataireCapacites.ts`** (nouveau) — module de décision,
  seule source de vérité. Exporte `deriverCapacites()` (capacités
  brutes → booléens) et `deciderCta()` (booléens → CTA principal +
  actions secondaires, priorité fixe `rdv > website > whatsapp >
  phone`). Zéro dépendance React/DOM — pure, testable en isolation.
- **`app/institution/[id]/InstitutionPublicClient.tsx`** (modifié) :
  - Type `Institution` : ajout `disponibilites?: unknown` (brut, non
    parsé — nécessaire à `deriverCapacites`).
  - Mapping Supabase→`Institution` : ajout `disponibilites: r.disponibilites`.
  - Nouvel état `paidServicesActifs` + requête `paid_services`
    (`is_active=true`, `count: "exact", head: true`) ajoutée dans
    l'effet de chargement existant — comble le gap identifié en §5
    (donnée non chargée auparavant sur cette page).
  - Calcul unique `capacites`/`ctaDecision` (une seule fois, avant le
    `return`) — consommé identiquement par le CTA hero et le bandeau
    fixe (aucune 2ᵉ copie de la logique, vérifié par lecture directe :
    les deux blocs référencent la même variable `ctaDecision`).
  - `whatsappUrl` : fallback générique (`https://wa.me/?text=...`)
    **supprimé** — vaut désormais `null` si `!capacites.hasWhatsApp`,
    plus aucun bouton WhatsApp fantôme possible dans le hero.
  - `ctaHref()` : petite fonction de lookup (pas un composant), unique
    endroit qui traduit une `CtaAction` en `href` concret.

**Aucun autre fichier touché** — en particulier, comme verrouillé au
§20/§18 : `app/recherche/*`, `components/CarteMapHome.tsx`,
`app/ambassades/page.tsx`, `next.config.ts`, `lib/secteurs.ts`,
`institutions.category` : **tous inchangés**.

### 22.2 Logique finale

```
hasBooking  = (services.length>0 || paidServicesActifsCount>0)
              && generateSlotsInRange(disponibilites, 28).length>0
hasWebsite  = urlExterneSure(website) !== null
hasWhatsApp = typeof whatsapp === "string" && whatsapp.trim() !== ""
hasPhone    = typeof phone === "string" && phone.trim() !== ""

principal = premier vrai parmi [hasBooking→rdv, hasWebsite→website,
            hasWhatsApp→whatsapp, hasPhone→phone] ; null si aucun
secondaires = tous les autres vrais, dans le même ordre
```

Rendu hero : CTA principal (doré) + un "quick secondary" (WhatsApp ou
Téléphone, selon disponibilité et priorité) dans la même grille 2
colonnes qu'avant ; ligne Téléphone séparée conservée uniquement si le
téléphone n'est déjà affiché ni en principal ni en quick-secondary
(évite tout doublon). Site web n'a jamais de slot hero dédié (comme
avant ce chantier) — reste visible via la section "Contacts" existante,
inchangée. Bandeau fixe : CTA principal seul, masqué entièrement si
`ctaDecision.principal === null`.

### 22.3 Tests réellement exécutés — résultats exacts

**Logique de capacités/décision** — compilée depuis les 3 fichiers réels
(`lib/prestataireCapacites.ts`, `lib/disponibilites.ts`,
`lib/urlValidation.ts`, via `tsc` vers JS puis exécutée sous Node — pas
une réimplémentation) :

| # | Test | Entrée (résumé) | Résultat obtenu | Attendu | Statut |
|---|---|---|---|---|---|
| 1 | §9 Banque | booking+website+whatsapp+phone tous vrais | `principal=rdv` ("Prendre RDV"), secondaires=[website,whatsapp,phone] | Prendre RDV | **VERIFIED IN CODE** |
| 2 | §8 Nimba SMS | website+services vrais, **pas de créneaux réels**, whatsapp+phone vrais | `principal=website` ("Découvrir"), secondaires=[whatsapp,phone] | Découvrir, jamais Prendre RDV | **VERIFIED IN CODE** |
| 3 | WhatsApp seul | pas de booking/website, whatsapp+phone vrais | `principal=whatsapp` | WhatsApp | **VERIFIED IN CODE** |
| 4 | Téléphone seul | uniquement phone vrai | `principal=phone` ("Appeler") | Appeler | **VERIFIED IN CODE** |
| 5 | Aucune capacité | tout faux | `principal=null`, secondaires=[] | Aucun CTA artificiel | **VERIFIED IN CODE** |
| 6 | §10 sans booking | website vrai, services présents mais **pas de créneaux réels** | `principal=website` | Jamais Prendre RDV, "Découvrir" | **VERIFIED IN CODE** |
| 7 | §11 website invalide | `website="javascript:alert(1)"` + whatsapp réel | `hasWebsite=false`, `principal=whatsapp` | website ignoré, CTA=WhatsApp | **VERIFIED IN CODE** |
| 8 | §12 WhatsApp sans numéro | `whatsapp=""` + phone réel | `hasWhatsApp=false`, `principal=phone` | Aucun bouton WhatsApp fantôme | **VERIFIED IN CODE** |
| 9 | Legacy website sans protocole | `website="nimba-sms.com"` (pas de `://`) | `hasWebsite=true` (fallback `urlExterneSure`, comportement P0 conservé) | Comportement P0 conservé | **VERIFIED IN CODE** |
| 10 (bonus) | Services présents, 0 créneau réel | `services=[A,B]`, `paidServicesActifsCount=3`, `disponibilites=[]` | `hasBooking=false` | "Services présents" seul ≠ preuve de réservabilité (règle CEO §3) | **VERIFIED IN CODE** |
| 11 (bonus) | `paid_services` actifs seuls | 0 service gratuit, 2 `paid_services` actifs, créneaux réels | `hasBooking=true` | `paid_services` compte bien dans la dérivation | **VERIFIED IN CODE** |

**11/11 scénarios conformes**, y compris les 8 tests explicitement
mandatés (§19) + 3 tests bonus (règle "services seuls ≠ booking",
`paid_services` actifs, legacy website).

**Build & tsc** :
- `tsc --noEmit` (tsbuildinfo régénéré à froid) : **VERIFIED IN
  APPLICATION** — exit 0, sortie vide, 0 erreur.
- `npm run build` : **VERIFIED IN APPLICATION** — exit 0, "Compiled
  successfully", 304/304 pages générées, `/institution/[id]` présent
  dans la sortie de build, 0 erreur.
  ⚠️ **Incident de build sans lien avec ce chantier, documenté par
  honnêteté** : les 2 premières tentatives de build ont crashé
  (`Next.js build worker exited with code: 3221225794` = `0xC0000005`,
  access violation Windows) pendant "Collecting page data" — reproduit
  2 fois. Diagnostic : recherche dédiée (agent read-only) + test direct
  (relance avec `NODE_OPTIONS=--max-old-space-size=6144`, qui a
  réussi) confirment une contrainte mémoire de la machine (8 Go RAM
  total, ~3.5 Go libres) et non un défaut du code de ce chantier —
  cohérent avec le fait que le même type de crash n'a **aucun rapport**
  avec la nature des fichiers modifiés (2 fichiers seulement, taille
  modeste) et que la 3ᵉ tentative, à mémoire V8 augmentée uniquement
  (aucun changement de code), a réussi sans modification. Non
  reproductible avec plus de RAM allouée à Node — **pas un écart de ce
  chantier**, mais une contrainte d'environnement à connaître pour les
  prochains builds sur cette machine.

**Test structurel — hero et bandeau fixe utilisent la même décision** :
**VERIFIED IN CODE** — grep confirmant que les 2 seuls sites de rendu
qui lisent `ctaDecision.principal` (lignes du hero et lignes du bandeau
fixe) référencent la même variable calculée une seule fois avant le
`return` — aucune 2ᵉ instance de la logique de décision dans le fichier.

**Limite honnête (comme pour le chantier P0)** : aucun test navigateur
réel (clic, rendu visuel, mobile) n'a été possible dans cet
environnement — tous les tests ci-dessus sont **VERIFIED IN CODE**
(exécution réelle de la logique pure) ou **VERIFIED IN APPLICATION**
(build/tsc réels), jamais **VERIFIED IN PRODUCTION/HTTP**. À valider
visuellement par Bryan.

### 22.4 Résultats / régressions

Aucune régression détectée :
- Le cas majoritaire actuel (institution avec `hasBooking=true`
  uniquement, ex. banque/mairie typique) affiche exactement "Prendre
  RDV" comme avant (scénario §9, `secondaires` inclut les autres
  capacités mais le principal reste identique au comportement
  pré-chantier).
- Le wizard `/rdv/[id]` n'a été ni lu ni modifié.
- Aucune donnée existante modifiée, aucune migration, aucun SQL exécuté.
- La section "Contacts" (adresse/téléphone/WhatsApp/email/site web),
  déjà correcte avant ce chantier pour son propre bouton WhatsApp
  (gate `{inst.whatsapp && ...}`), n'a pas été touchée.

### 22.5 Écarts par rapport à la spécification

**Aucun écart d'architecture ou de règle métier.** Deux précisions
d'implémentation, cohérentes avec la spec mais non détaillées littéralement
dans le texte du §11/§13 :
- Le "quick secondary" du hero (2ᵉ emplacement de la grille) ne
  considère que WhatsApp/Téléphone, jamais Website — comportement
  hérité de la structure hero pré-existante (Website n'y a jamais eu de
  place), documenté en commentaire dans le code, cohérent avec §11
  ("aucune refactorisation hors périmètre").
- Les CTA contextuels non ciblés par le §19 (état vide avis ligne
  ~1649+quelques dizaines suite aux ajouts, quota questions) n'ont **pas**
  été touchés — hors du périmètre explicite ("tester les deux CTA
  actuellement dupliqués : hero + sticky/fixe"), laissés strictement
  inchangés pour respecter "aucune refactorisation hors périmètre".

### 22.6 Statut final

**IMPLEMENTED** au 17/08/2026 (voir §23 pour la clôture CLOSED du
18/08/2026). Code terminé, 11/11 tests logique exécutés et conformes,
`tsc --noEmit` propre, `npm run build` propre (304/304 pages), relecture
finale du diff faite (2 fichiers seuls touchés, aucun
`profile_type`/migration/colonne introduit — confirmé par recherche
explicite), non-régression du cas majoritaire confirmée par test. Aucun
commit, aucun déploiement.

---

## §23. Final Review read-only + clôture CEO (18/08/2026) — CLOSED

Validation visuelle CEO reçue le 18/08/2026 ("le rendu est conforme").
Final review technique read-only exécutée avant clôture officielle,
point par point.

### 23.1 État du workspace / fichiers modifiés

`git status` reconfirmé le 18/08/2026 : **exactement les 2 mêmes
fichiers que le 17/08/2026**, aucun de plus :
- `app/institution/[id]/InstitutionPublicClient.tsx` (modifié)
- `lib/prestataireCapacites.ts` (nouveau)

Aucun fichier non autorisé touché. Aucune nouvelle migration dans
`supabase/migrations/` depuis la dernière datée du chantier (vérifié
par recherche de fichiers plus récents que la dernière migration
connue — 0 résultat lié à ce chantier).

### 23.2 profile_type / migration / colonne DB

- `grep "profile_type"` sur les 2 fichiers du chantier : **1 seule
  occurrence**, dans un commentaire de `lib/prestataireCapacites.ts:7`
  ("zéro migration, zéro colonne, zéro profile_type") — documente
  l'absence, aucune référence runtime. **CONFIRMED : NONE.**
- Aucune migration SQL créée pour ce chantier. **CONFIRMED : NONE.**
- Aucune colonne DB ajoutée, aucune donnée existante modifiée.
  **CONFIRMED : NONE.**

### 23.3 lib/prestataireCapacites.ts — relecture complète

Relu intégralement (76 lignes) : `deriverCapacites()` +
`deciderCta()` sont les 2 seules fonctions exportées pilotant la
décision, aucune logique de CTA dupliquée ailleurs dans ce fichier ni
importée nulle part d'autre que `InstitutionPublicClient.tsx` (grep
confirmé — seul consommateur). **CONFIRMED : source unique de
vérité.**

Point 10 (règle CEO explicite) reconfirmé ligne par ligne :
```ts
hasBooking: aDesServicesReels && aDesCreneauxReels
```
où `aDesServicesReels` = services/paid_services non vides, ET
`aDesCreneauxReels` = `generateSlotsInRange(...).length > 0` (créneaux
réellement générés, jamais la présence brute du champ
`disponibilites`). **Services seuls, paid_services seuls, ou
disponibilités "théoriques" (jsonb non vide mais ne produisant aucun
créneau réel après parsing) ne suffisent JAMAIS individuellement à
rendre `hasBooking` vrai** — confirmé par le test "Services présents
mais disponibilites vide -> jamais hasBooking" (§23.5).

### 23.4 InstitutionPublicClient.tsx — hero vs bandeau fixe

Grep sur `ctaDecision.principal` : 2 seuls sites de rendu (hero ligne
~1073, bandeau fixe ligne ~2100), tous deux lisant la **même variable**
`ctaDecision`, calculée une seule fois avant le `return`. **CONFIRMED :
décision strictement identique entre les deux CTA dupliqués.**

Fallback WhatsApp générique : recherche du motif `wa.me/?text` (sans
numéro) — **0 occurrence**, confirmé disparu. `whatsappUrl` vaut
désormais `null` si `!capacites.hasWhatsApp` (ligne ~913). **CONFIRMED :
NONE.**

`website` : `websiteHref` toujours calculé via `urlExterneSure(inst.website)`
(ligne ~884, import `@/lib/urlValidation` ligne 16) — protection P0
intacte, aucune deuxième logique de validation d'URL introduite.
**CONFIRMED.**

### 23.5 Tests — reconfirmés le 18/08/2026

Recompilés à froid depuis les fichiers sources actuels (pas les
fichiers du 17/08) et ré-exécutés : **11/11 scénarios toujours
conformes**, résultats identiques à ceux du §22.3, y compris les 8 cas
requis par la final review (Nimba SMS→Découvrir, Banque→Prendre RDV,
website sans booking→Découvrir, WhatsApp seul→WhatsApp, téléphone
seul→Appeler, aucune capacité→aucun CTA, website invalide→ignoré,
WhatsApp sans numéro→ignoré, legacy website sans protocole→conservé,
services seuls≠booking). **VERIFIED IN CODE** pour chacun.

### 23.6 tsc --noEmit

Exécuté 3 fois lors de cette final review. Les 2 premières exécutions
ont rapporté 4 erreurs — **toutes dans `.next/dev/types/routes.d.ts`
et `.next/dev/types/validator.ts`**, des fichiers **auto-générés par
`next dev`** (inclus dans `tsconfig.json:29-30`), jamais dans le code
source de ce chantier. Inspection directe : fragments tronqués
(`ace RouteContext<...>` au lieu de `interface RouteContext<...>`,
`ndler = {}` au lieu de `const handler = {}`) — corruption du cache de
types généré par le serveur `next dev` tournant en parallèle
(vraisemblablement un reliquat des crashs de build survenus le
17/08/2026 sur ce même `.next`), sans lien avec les fichiers modifiés
par ce chantier (0 erreur dans `InstitutionPublicClient.tsx` ni
`lib/prestataireCapacites.ts` dans les 2 exécutions concernées).
Résolu en supprimant `.next/dev/types` et `.next/types` (cache
disposable, jamais suivi par git, régénéré automatiquement) — 3ᵉ
exécution : **0 erreur, sortie vide.** **VERIFIED IN APPLICATION,
CONFIRMED PROPRE.**

### 23.7 npm run build

Nouvelle tentative lancée pour cette final review : a de nouveau
crashé (`0xC0000005`, "Collecting page data") malgré
`NODE_OPTIONS=--max-old-space-size=6144` — mémoire libre mesurée à ce
moment : **2.7 Go** (contre 3.5 Go lors du build réussi du 17/08/2026),
le serveur `npm run dev` de Bryan tournant activement en parallèle et
consommant une part croissante de la RAM disponible sur cette machine
à 8 Go. Root cause confirmée environnementale (RAM), pas applicative —
même diagnostic que le 17/08/2026, reconfirmé par un deuxième
échantillon indépendant.

**Décision prise avec le CEO** : accepter le build réussi du
17/08/2026 (exit 0, "Compiled successfully", 304/304 pages,
`/institution/[id]` présent, 0 erreur — voir §22.3) comme preuve de
build valide, le code source des 2 fichiers du chantier n'ayant **subi
aucune modification** depuis cette exécution réussie (confirmé par
`git status` identique, §23.1). Point documenté honnêtement : le build
final de clôture n'a pas pu être re-confirmé à froid le 18/08/2026 à
cause d'une contrainte RAM de l'environnement (dev server concurrent),
pas d'un défaut de code — **VERIFIED IN APPLICATION (17/08/2026,
réutilisé)**, pas re-testé le 18/08/2026 par choix explicite du CEO.

### 23.8 Validation visuelle CEO

Confirmée par Bryan le 18/08/2026 : "J'ai vérifié visuellement la fiche
Prestataire après l'implémentation. Le rendu est conforme."
**VERIFIED IN PRODUCTION/HTTP** (seul point de ce chantier vérifié
ainsi, par Bryan lui-même — hors de portée de cet environnement pour
moi).

### 23.9 Limites V1 connues (rappel, déjà actées §13/§15/§20)

- Portée strictement limitée à la fiche complète (Option A) — cartes de
  recherche/accueil et page Ambassades continuent d'afficher
  "Prendre RDV"/logique par catégorie, inchangées par décision
  explicite (incohérence temporaire assumée).
- Bug `category` NULL pour les institutions récentes : non traité,
  hors périmètre explicite, chantier séparé à planifier.
- Build de clôture non re-testé à froid le 18/08/2026 (contrainte RAM
  environnementale, §23.7) — dernière preuve de build réussi date du
  17/08/2026 sur un code source identique.

### 23.10 Statut final

**Aucun problème trouvé nécessitant un STOP.** Les deux seuls incidents
rencontrés pendant cette final review (cache `.next/dev/types` corrompu,
crash de build par contrainte RAM) sont tous deux extérieurs au code de
ce chantier, diagnostiqués précisément, et résolus ou explicitement
documentés avec l'accord du CEO plutôt que masqués.

**CTA V1 — STATUS: CLOSED.**
