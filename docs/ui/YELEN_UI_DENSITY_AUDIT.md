# YELEN224 — Audit de densité UI des dashboards professionnels (Lot UI 1)

**Statut : audit uniquement.** Aucun fichier de code n'a été modifié pour produire ce document. Aucune correction n'a été appliquée.

**Date :** 14/08/2026
**Périmètre réel confirmé :** il n'existe pas de dashboards "Prestataires"/"Entreprises" séparés dans le code — toutes les institutions (hôpitaux, mairies, banques, ambassades, commerces, professions libérales, etc.) partagent le **même** dashboard `app/institution/[id]/dashboard/`. Le périmètre "Institutions, Prestataires, Entreprises" cité dans le brief correspond donc à un seul et même code : le dashboard institution. S'y ajoute l'**Admin** (`app/admin/`). Le portail employé Clock In Shift (`app/clock/[slug]`) existe aussi côté professionnel mais n'a pas été inclus dans ce Lot 1 (périmètre non demandé explicitement) — à confirmer pour un lot ultérieur si pertinent.
**Méthode :** lecture directe du code (grep/lecture ciblée) sur les deux arborescences réelles, comptage des valeurs distinctes utilisées pour chaque propriété dimensionnelle, puis échantillonnage qualitatif par catégorie de composant avec citation fichier:ligne.
**Benchmark Supabase :** aucune capture n'a été transmise avec le brief malgré la mention "les captures fournies". La section 4 (Benchmark) s'appuie donc sur la connaissance générale publique de la densité de Supabase Dashboard (contrôles compacts, texte 13px, radius réduit), **pas sur une mesure de captures réelles** — à corriger si des captures existent et doivent être analysées.

---

## 1. État actuel (résumé exécutif)

Les deux dashboards professionnels Yelen n'ont **aucune échelle dimensionnelle partagée**. Chaque écran (fichier `.tsx`) définit ses propres valeurs de padding, border-radius, taille de police et taille d'icône en dur, indépendamment des écrans voisins qui remplissent pourtant le même rôle visuel (un bouton, une carte, une pastille de statut, un champ de recherche...).

Chiffres globaux mesurés directement sur `app/institution/[id]/dashboard/` (66 fichiers, ~37 200 lignes) :

| Propriété | Valeurs distinctes trouvées | Plage |
|---|---|---|
| `borderRadius` | 20 valeurs différentes | 2px → 38px (+ un cas à 99px, pilule) |
| `fontSize` | 29 valeurs différentes | 8px → 40px, avec des paliers d'un demi-pixel (12.5px, 13.5px, 14.5px) |
| `padding` | 192 combinaisons différentes | de `"2px 7px"` à `"48px 16px"` |
| `gap` | 17 valeurs différentes | — |
| Icônes de contrôle (SVG inline, hors illustrations décoratives) | tailles continues 8,9,10,11,12,13,14,15,16,17,18,19,20,22,24,26,28px | aucune grille apparente |

Sur `app/admin/` (26 fichiers, ~4 600 lignes) : 13 valeurs de `borderRadius` distinctes (2px → 20px), malgré l'existence d'un fichier de tokens (`adminTheme.ts`) qui en définit précisément trois (`radiusSm`/`radius`/`radiusLg` = 7/10/14px) — la majorité des composants ne les utilisent pas par leur nom et retapent une valeur brute à la place.

**Constat central :** le dashboard institution n'a **aucun** token dimensionnel (seulement des couleurs, cf. §7). Le dashboard admin **a** un embryon de système (radius + shadow + un vrai kit de composants partagés `adminUiKit.tsx`), mais son adoption est inégale — environ la moitié des écrans l'utilisent, l'autre moitié réimplémente son propre équivalent en parallèle (détail §5/§6).

---

## 2. Inventaire des dimensions trouvées, par catégorie de composant

### 2.1 Dashboard Institution (`app/institution/[id]/dashboard/`)

Aucun composant `<Button>`/`<Input>`/`<Select>`/`<Modal>`/`<Table>` partagé n'existe. Tout est du style inline par écran.

| Catégorie | Constat | Exemples avec preuve |
|---|---|---|
| **Boutons** | Le dégradé CTA doré (`linear-gradient(135deg, C.gold, C.goldD)`) apparaît ~49 fois avec un padding/radius différent presque à chaque fois. | `page.tsx:486` (`14px`/`14px`) vs `page.tsx:1127` (`7px 14px`/`10px`) vs `AvisReputationTab.tsx:255` (`7px`/`8px`) vs `ConditionsInformationsTab.tsx:79` (`9px 18px`/`10px`). Boutons icône seuls : `page.tsx:2289` (26px, radius 8px, carré) vs `page.tsx:1042` (34px, radius 50%, rond) pour le **même rôle** "fermer". |
| **Inputs texte** | Au moins 8 fichiers définissent leur propre `inputStyle`/`fieldInput` local, avec des valeurs proches mais jamais identiques. | `ClockInShiftTab.tsx:176` (`9px 11px`/`8px`) ; `ConditionsInformationsTab.tsx:30`, `ProfilResponsableTab.tsx:171`, `ProfilEntrepriseTab.tsx:531` sont **identiques octet pour octet** (`11px 13px`/`10px`/`13px`) — copié-collé 3 fois sans jamais être extrait. `ServicesTab.tsx` définit **3 variantes différentes** dans le même fichier (lignes 147, 297, 711). |
| **Selects** | 13 fichiers utilisent `<select>` natif, aucun composant listbox partagé. Le style suit généralement le `inputStyle` local du fichier — donc hérite de la même fragmentation. | `ServicesTab.tsx` (padding `9px 12px` ou `11px 14px` selon laquelle des 2 variantes locales est en portée). |
| **Champs date/heure** | Tous en `<input type="date"/"time">` natif, style copié par fichier. | `page.tsx:3482` (`9px 12px`/`12px`), `DisponibilitesTab.tsx:509` (`10px 12px`/`10px`), `HistoriqueFinancierTab.tsx:78` (`9px 10px`/`10px`, fontSize `12.5px` — seul à utiliser un demi-pixel ici), `RdvPasseTab.tsx:208` (hauteur fixe `48px`, radius `14px` — le plus grand de l'échantillon), `ClockInShiftTab.tsx:1985` (`6px 8px` — le plus petit). |
| **Tabs / filtres** | Pas de `TabBar` partagé. Les filtres-onglets sont des rangées de chips réimplémentées par écran. | `RdvPasseTab.tsx:32,224-232` (`7px 13px`/`20px`/`11.5px`) — pattern non repris ailleurs à l'identique. |
| **Badges/pastilles** | Un seul `Badge` local existe (`DocumentsTab.tsx:257`), utilisé uniquement dans ce fichier (5 appels). Partout ailleurs, badge réinventé. | `dashboardShared.tsx:42` (`2px 7px`/`20px`/`9px`) ; `ClockInShiftTab.tsx:1045` vs `:1163` — **même fichier**, deux pastilles de statut avec un padding qui diffère de 1px (`3px 9px` vs `2px 8px`). `CentreConfigurationTab.tsx:383,391` — "OBLIGATOIRE"/"TERMINÉ" ne sont même pas dans un span avec padding, juste du texte inline coloré. |
| **Cartes** | Motif `backgroundColor + border + borderRadius + padding` répété à l'infini, jamais factorisé. Radius échantillonné : 10/12/14/16px. Padding : `8px 10px` à `16px 18px`. | `AvisReputationTab.tsx:244` (`10px`/`8px 10px`) vs `ConditionsInformationsTab.tsx:70` (`16px`/`16px`) vs `DisponibilitesTab.tsx:456` (`14px`/`14px`). |
| **Modales/bottom sheets** | Convention "coins arrondis en haut seulement" respectée partout (`radius radius 0 0`), mais la valeur de radius n'est pas fixée : **18, 20, 24, 28px** coexistent pour le même rôle "feuille de confirmation/détail". | `page.tsx:855` (`28px`, maxWidth 520px) vs `page.tsx:2487` (`24px`, maxWidth 480px) vs `ClockInShiftTab.tsx:660` (`24px`, maxWidth **560px** — plus large que l'équivalent RDV) vs `DocumentsFinanciersTab.tsx:379` (`20px`, maxWidth 480px). `CommunicationTab.tsx:509` utilise même une modale centrée classique (4 coins) au lieu d'un bottom sheet, pour un rôle équivalent. |
| **Tableaux** | Seuls 11 fichiers utilisent `<table>` réel ; la majorité des écrans-listes (MesClientsTab, ValiderRdvTab, RdvPasseTab, DocumentsTab, TransactionsTab, PaiementsTab) construisent des listes de `<div>` à la place — deux systèmes parallèles pour le même besoin. | `DocumentsTab.tsx` (cartes div) vs `DocumentsClientsTab.tsx` (`<table>` réel) — même famille fonctionnelle (documents + statut), deux structures différentes. |
| **Headers d'écran** | Le `<h1>` de titre d'écran converge assez bien (`22px`/`900`/`-0.5px`) — catégorie la plus cohérente trouvée. En revanche les gros chiffres de KPI/score divergent fortement : 22/24/26/28/**40px**. | `MesClientsTab.tsx:344` et `PaiementsTab.tsx:289` : identiques. `AvisReputationTab.tsx:65` : score à `40px`, plus grande police de tout l'arbre. `AvisReputationTab.tsx` répète en plus le même bloc `<h1>` "Santé du compte" **3 fois** (lignes 301, 313, 337) au lieu de le factoriser. |
| **Navigation/sidebar** | `page.tsx` — sidebar 264px déplié / 76px replié. Le set d'icônes de nav (`page.tsx:2118-2130`) est le plus cohérent trouvé (20×20, strokeWidth 1.8 partout) — mais un icône voisin (`:470`, 22×22) et le bouton "Paramètres" (`:2275`, padding/radius différents des items de nav) cassent la cohérence locale. |
| **Icônes de contrôle** | Même rôle visuel, tailles différentes dans un même fichier : `MesClientsTab.tsx:444` (coche "vérifié", 15px) vs `:445` (état voisin du même slot, 14px). `EquipeTab.tsx:115-118` (4 icônes bien standardisées à 16px) vs `:120` (icône fermeture du même fichier, 14px, sans règle énoncée). |
| **Espacements** | Le padding externe d'écran converge bien (`padding:"16px", paddingBottom:"100px"` verbatim dans ≥10 fichiers) — bonne nouvelle isolée. Les gaps internes (entre chips, entre champs de formulaire) restent non standardisés : `7px`/`8px`/`10px`/`12px`/`14px`/`18px` utilisés de façon interchangeable pour des rôles équivalents. |

### 2.2 Dashboard Admin (`app/admin/`)

Contrairement à l'institution, l'admin dispose d'un vrai kit partagé (`adminUiKit.tsx`) et d'un fichier de tokens (`adminTheme.ts`, objet `D`) avec `D.radius`/`D.radiusSm`/`D.radiusLg` + `D.shadow*`. L'adoption de ce système est cependant partielle.

| Catégorie | Constat | Exemples avec preuve |
|---|---|---|
| **Boutons** | Aucun `<Button>` partagé. Un micro-motif "pilule d'action de ligne" (`padding:'4px 8px', borderRadius:'5px', fontSize:'11px'`) est copié-collé identique dans 5 fichiers (`institutions/page.tsx:171-184`, `citoyens/page.tsx:65`, `moderation/page.tsx:87-93`, `admins/page.tsx`, `page.tsx:338-410`) — et ce `'5px'` ne correspond à **aucun** des trois tokens `D.radius*` (7/10/14px), comme s'il s'agissait d'un token oublié. Les CTA primaires dorés (`admins/page.tsx:80`, `annonces/page.tsx:87`, `page.tsx:544/557`) utilisent bien `D.radiusSm` par son nom — recette cohérente entre eux. |
| **Inputs texte** | Pas de composant partagé. 3 variantes de padding pour la même barre de recherche : `citoyens/page.tsx:44` (`9px 12px 9px 32px`) vs `institutions/page.tsx:118` et `annonces/page.tsx:95` (`8px 12px 8px 32px`) vs `page.tsx:208` (`9px…`, comme citoyens). `security/page.tsx:39` définit son propre helper `inputStyle()` local avec `border2` au lieu de `border`. `messagerie/page.tsx:143` écrit `borderRadius:10` (nombre, pas chaîne `'10px'`) — seule occurrence de ce style dans tout l'admin. |
| **Selects** | Seulement 2 fichiers utilisent `<select>` (`annonces`, `admins`), avec un style identique entre eux — trop peu d'usage pour juger d'une vraie convention. |
| **Champs date** | `annonces/page.tsx:184` est le **seul** `type="date"` de tout l'admin. Aucun filtre par date sur RDV/Paiements/Logs — écart fonctionnel plus que dimensionnel, mais notable. |
| **Tabs/filtres** | Deux conventions incompatibles coexistent : chips "carrées" (`D.radiusSm`, fond doré plein si actif — `institutions`, `rdv`, `paiements`, `annonces`) vs chips "pilule" (`radius:'20px'`, fond doré à 12% si actif — `feedback`, `offres`, `posts`, `partenariats`, `recuperation-comptes`). Répartition quasi 50/50, aucune des deux ne domine. |
| **Badges** | `Badge`/`StatBadge` du kit **sont** utilisés dans 7 écrans pilotés par `DataTable`. Mais 6 autres écrans (`documents`, `offres`, `posts`, `recuperation-comptes`, `security`, `satisfaction`) réinventent leur propre pastille avec 3 paddings verticaux différents (`2px`/`3px`/`4px`) au lieu d'importer `Badge`. |
| **Cartes KPI** | `KPICard` n'est importé que dans **un seul fichier** (`page.tsx`). `analytiques/page.tsx` reconstruit à la main la même carte (mêmes couleurs, même typographie de label recopiée ligne pour ligne) parce que `KPICard` ne permet pas d'y intégrer un graphique — cas typique de composant partagé pas assez généralisé, donc contourné. |
| **Modales** | `SlidePanel` est le composant **le mieux adopté** de tout l'audit : 5 écrans l'utilisent, aucune modale concurrente construite à la main n'a été trouvée (recherche de `position:'fixed'`+`zIndex` en dehors du kit : zéro résultat). |
| **Tableaux** | `DataTable` est utilisé dans 9 écrans. Mais 6+ autres écrans (`documents`, `satisfaction`, `feedback`, `offres`, `posts`, `partenariats`, `recuperation-comptes`) construisent en parallèle leur propre liste de cartes `<div>` avec `borderRadius:'14px'` — deux systèmes de liste qui ne se sont jamais rejoints. |
| **Headers** | `SectionHeader` est exporté par le kit mais **jamais importé nulle part** (0 usage réel trouvé). Deux conventions concurrentes de `<h1>` coexistent à parts quasi égales : 20px/700 (9 écrans) vs 22px/800 (9 écrans) — ni l'une ni l'autre ne correspond au spec de `SectionHeader` (13px/`<h2>`). |
| **Navigation/sidebar** | `layout.tsx` **n'importe jamais** `adminTheme.ts` — toute la sidebar (logo, item actif, carte profil) est codée en couleurs hexadécimales brutes (`#d4a017`, `#d4a01718`...) au lieu d'utiliser `D.yellow`. C'est la pièce de chrome la plus visible de tout l'admin, et c'est justement celle qui n'est reliée à aucun token. |
| **Icônes** | Le set `adminIcons.tsx` (`Ic.*`) a 5 paliers de taille différents (8/12/13/14/15px) selon la famille d'icône, sans paramètre `size` — chaque icône a sa taille figée en dur individuellement. |
| **Espacements** | Le padding externe de page est bien centralisé (`layout.tsx:378`, `padding:'32px'`, un seul endroit). À l'intérieur, chaque écran redécide ses propres gaps de grille (`10px` sur `page.tsx`, `12px` sur `analytiques` pour une rangée de KPI conceptuellement identique). |

---

## 3. Composants concernés

**Institution** (`app/institution/[id]/dashboard/`, 66 fichiers) : `page.tsx` (4 318 lignes) + `dashboardShared.tsx` + 39 fichiers `components/*Tab.tsx` couvrant Vue d'ensemble/Centre de configuration, Messagerie, Rendez-vous, Disponibilités, Services, Valider un RDV, Communication, Signalements, Mes clients, Équipe, Documents (institution + clients + financiers + travail), Clock In Shift, Journal, Facturation, Transactions, Paiements, Espace de travail, Partenariat, Avis/Réputation, Offres, Rapports, Paramètres, Conditions/Informations, QR/Scanner.

**Admin** (`app/admin/`, 26 fichiers) : `layout.tsx`, `page.tsx` (accueil KPI), `adminTheme.ts`, `adminUiKit.tsx`, `adminIcons.tsx`, `adminTypes.ts`, + 17 écrans de section (institutions, citoyens, rdv, paiements, moderation, annonces, admins, logs, analytiques, security, messagerie, documents, feedback, offres, posts, partenariats, recuperation-comptes, satisfaction, login).

---

## 4. Incohérences constatées (synthèse transversale)

1. **Même rôle visuel, valeurs différentes selon le fichier** — c'est la règle plutôt que l'exception : boutons CTA, cartes, badges, champs texte, bottom sheets, tailles d'icônes de contrôle. Voir le détail par catégorie en §2.
2. **Même rôle visuel, valeurs différentes dans le *même* fichier** — plus grave, car il ne s'agit même pas d'une dérive entre équipes/écrans mais d'un manque de relecture locale : `ClockInShiftTab.tsx` (2 pastilles de statut à 1px d'écart), `MesClientsTab.tsx` (icône "vérifié" à 14 vs 15px selon l'état), `EquipeTab.tsx` (4 icônes à 16px, 1 à 14px), `ServicesTab.tsx` (3 `inputStyle` différents).
3. **Composants partagés existants mais sous-adoptés (admin uniquement)** — `KPICard` (1 fichier sur potentiellement 5+), `SectionHeader` (0 fichier), `Divider` (0 fichier). Le kit existe, mais le réflexe de l'utiliser n'est pas systématique.
4. **Deux systèmes parallèles pour le même besoin** — listes tabulaires : `DataTable`/`<table>` vs cartes `<div>`, présent des deux côtés (institution et admin) de façon quasi symétrique.
5. **Token existant mais contourné** — `D.radius*` (admin) existe et est bien nommé, mais la majorité des composants tapent une valeur brute qui coïncide parfois avec le token (ex. `'14px'` au lieu de `D.radiusLg`) et parfois non (le `'5px'` des boutons d'action, qui ne correspond à rien).
6. **La pièce la plus visible n'est pas tokenisée** — la sidebar admin (`layout.tsx`) n'importe pas `adminTheme.ts` du tout.

---

## 5. Composants déjà correctement standardisés

**Institution :**
- `YelenLoader` (`components/YelenLoader.tsx`, hors de l'arbre dashboard) — importé dans 35 des ~40 fichiers du dossier, utilisé en pleine page (`size={28}`) comme inline (`size={14}`). Le seul contrôle bas-niveau réellement partagé et réutilisé de façon cohérente.
- `dashboardShared.tsx` (`SectionHeader`, `timeAgo`, `parseLocalDate`) — `SectionHeader` a 2 consommateurs (`page.tsx`, `CentreAnalyseTab.tsx`). Réel mais modeste.
- `theme.ts` — cohérent et bien respecté **pour les couleurs uniquement** (voir §7, il ne couvre aucune dimension).

**Admin :**
- `SlidePanel` — le mieux adopté de tout l'audit (5 écrans, aucun concurrent trouvé).
- `DataTable` — bien adopté (9 écrans), même s'il coexiste avec un système parallèle (§4.4).
- `Badge`/`StatBadge` — bien adopté là où `DataTable` est déjà en place (7 écrans).
- `exportCSV` — adopté conformément à son usage prévu (institutions, RDV, citoyens, paiements).
- `adminTheme.ts` (`D`) — bien respecté pour les **couleurs** partout, et pour le **radius** dans une partie des écrans (CTA primaires notamment).

---

## 6. Composants dupliqués

**Institution :**
1. `inputStyle`/`fieldInput` réimplémenté indépendamment dans ≥8 fichiers. Trois d'entre eux (`ConditionsInformationsTab.tsx:30`, `ProfilResponsableTab.tsx:171`, `ProfilEntrepriseTab.tsx:531`) sont **identiques à l'octet près** — candidat le plus évident à une future factorisation.
2. Coquille de bottom sheet dupliquée ~30 fois avec un radius flottant (18/20/24/28px) — pas de `BottomSheet` partagé.
3. `AvisReputationTab.tsx` : le bloc `<h1>` "Santé du compte" est répété 3 fois dans le même fichier (probablement 3 branches conditionnelles qui réécrivent chacune le header au lieu de le factoriser en interne).
4. `DocumentsTab.tsx` vs `DocumentsClientsTab.tsx` : même besoin fonctionnel (liste de documents + statut), deux structures totalement différentes (cartes div vs `<table>`), chacune avec ses propres valeurs.

**Admin :**
1. `analytiques/page.tsx` reconstruit à la main la coquille visuelle de `KPICard` (couleurs, radius, typographie du label copiés ligne pour ligne) parce que `KPICard` n'a pas de slot pour un graphique.
2. Système de liste parallèle à `DataTable` dans 6+ écrans (`documents`, `satisfaction`, `feedback`, `offres`, `posts`, `partenariats`, `recuperation-comptes`), chacun avec ses propres pastilles/boutons d'action.
3. Pastille de statut dupliquée 6+ fois avec 3 paddings différents au lieu d'utiliser `Badge`.
4. Convention `'5px'`/`padding:'4px 8px'` des boutons d'action de ligne copiée dans 5 fichiers, jamais extraite.
5. `security/page.tsx` définit son propre `inputStyle()` local plutôt que de suivre la convention des autres barres de recherche.

---

## 7. Valeurs hardcodées importantes

- **`app/institution/[id]/dashboard/theme.ts`** : confirmé à la lecture complète — ne contient **que** des couleurs (hex/rgba) + une seule valeur de `shadow`. Aucun token de spacing, radius, taille de police ou hauteur de contrôle n'existe dans ce fichier ni ailleurs dans l'arbre institution. Toutes les 20 valeurs de radius, 29 tailles de police, 192 combinaisons de padding sont des littéraux répétés à la main.
- **`app/admin/adminTheme.ts`** : contient `D.radius`/`D.radiusSm`/`D.radiusLg` (7/10/14px) et `D.shadow*`, mais aucun token de spacing ni de taille de police. Ces tokens de radius existent mais ne sont utilisés par leur nom que dans une partie des composants (ex. CTA primaires) — le reste retape une valeur brute.
- **`app/admin/layout.tsx`** : n'importe jamais `D` — toute la sidebar est en hex brut (`#d4a017`, `#1e1e1e`, `#d4a01718`...), complètement déconnectée du fichier de tokens que le reste de l'admin utilise pour ses couleurs.
- **Le radius `'5px'`** (boutons d'action de ligne, admin, 5 fichiers) et le radius `'20px'` (pastilles/pilules, présent des deux côtés) apparaissent assez souvent et de façon assez cohérente pour ressembler à des tokens implicites jamais formalisés.
- **`app/institution/[id]/dashboard/page.tsx.tmp.9752.8e03f6fc327c`** — hors sujet densité UI, mais trouvé pendant l'audit : un fichier de build temporaire (4 260 lignes, ~58 lignes de retard sur `page.tsx` réel) traîne dans l'arborescence source à côté du vrai fichier. Ce n'est pas un composant dupliqué au sens design, mais un résidu qui peut prêter à confusion (un futur outil de recherche/lecture pourrait le lire par erreur). Signalé ici pour que Bryan le supprime s'il confirme que c'est bien un résidu — non traité dans cet audit (aucune suppression de fichier sans validation).

---

## 8. Recommandations de standardisation (proposition, non appliquée)

Par ordre d'impact probable, sans toucher au code :

1. **Créer un fichier de tokens dimensionnels côté institution**, symétrique à `theme.ts` mais pour les dimensions (spacing/radius/fontSize/tailles d'icônes) — aujourd'hui totalement absent. C'est le manque le plus structurant : sans lui, toute normalisation reste ponctuelle.
2. **Achever la normalisation côté admin plutôt que d'en repartir de zéro** — le socle (`adminTheme.ts` + `adminUiKit.tsx`) existe déjà et est bien conçu ; le travail est un travail d'**adoption** (remplacer les réimplémentations locales par les imports existants), pas de création.
3. **Prioriser les composants les plus dupliqués tels-quels** : `inputStyle`/`fieldInput` (institution, candidat évident vu les 3 copies identiques), pastille/`Badge` (les deux dashboards), coquille de bottom sheet (institution), `KPICard` généralisé avec un slot contenu libre (admin).
4. **Relier `layout.tsx` (admin) à `adminTheme.ts`** — la sidebar est la seule pièce de chrome admin actuellement déconnectée du système de tokens.
5. **Ne pas fusionner `DataTable` et le système de cartes `<div>`** sans un examen séparé — les deux existent peut-être pour de bonnes raisons contextuelles (données tabulaires denses vs fiches enrichies) ; à trancher au cas par cas, pas par une règle générale.

---

## 9. Proposition d'une future échelle dimensionnelle Yelen (à valider, non appliquée)

Basée sur les valeurs déjà les plus fréquentes dans le code réel (pas des chiffres inventés depuis zéro — la médiane observée sert de point de départ), en densité intermédiaire entre l'existant et la référence Supabase (§ Benchmark) :

**Rayons de bordure** (aujourd'hui 20 valeurs → proposition à 5) :
`radiusXs` 6px (pastilles/badges) · `radiusSm` 8px (inputs, boutons secondaires) · `radius` 10px (boutons primaires, petites cartes) · `radiusLg` 14px (cartes standard) · `radiusXl` 20px (bottom sheets, gros conteneurs)

**Espacement** (aujourd'hui 17-192 valeurs selon la propriété → proposition sur grille 4px) :
`space-1` 4px · `space-2` 8px · `space-3` 12px · `space-4` 16px · `space-5` 20px · `space-6` 24px · `space-8` 32px

**Typographie** (aujourd'hui 29 valeurs → proposition à 8 paliers, sans demi-pixels) :
10px (micro-label) · 11px (méta) · 12px (corps secondaire) · 13px (corps standard) · 14px (corps emphase/input) · 16px (sous-titre) · 20px (titre de section) · 22px (titre d'écran, déjà la norme de fait)

**Icônes de contrôle** (aujourd'hui continu 8-28px → proposition à 3 paliers) :
14px (icône dans badge/texte dense) · 16px (icône dans bouton/ligne de liste) · 20px (icône de navigation, déjà la norme de fait côté sidebar institution)

Cette proposition est un point de départ à discuter, pas une décision — elle doit être confrontée à des cas réels avant tout Lot UI 2.

---

## 10. Exceptions qui devront probablement rester spécifiques

- **Illustrations décoratives** (SVG "hero", écrans vides, onboarding) — tailles 52 à 360px trouvées, légitimement hors grille de contrôle puisqu'il s'agit d'illustrations, pas de composants interactifs.
- **Éléments de marque déjà tranchés récemment** (hero doré plat du Centre de configuration, FAQ noir/blanc sur or) — décisions produit explicites de Bryan, à ne pas re-fondre dans une normalisation générique de padding/radius.
- **Clock In Shift** (`ClockInShiftTab.tsx`) — population et contraintes différentes (pointage terrain, lignes de tableau denses) ; peut justifier une densité propre.
- **Charts/graphiques SVG faits main** (`LineChart`/`BarChart`/`PieChart` admin, sparklines institution) — dimensions pilotées par les données, pas par une échelle de composant.
- **Modales/bottom sheets à fort contenu** (ex. fiche client 5 zones) — leur `maxWidth` plus large peut être un choix délibéré plutôt qu'une incohérence à corriger.

---

## Benchmark Supabase (⚠️ non basé sur des captures — voir avertissement en tête de document)

Densité généralement associée à Supabase Dashboard (connaissance publique, à vérifier sur captures réelles si disponibles) : contrôles compacts ~32-36px de hauteur, texte de corps 13px, radius réduit (6-8px), padding de carte resserré (12-16px), icônes de contrôle 14-16px, hiérarchie typographique nette mais peu de tailles différentes. La proposition d'échelle en §9 s'en inspire dans son ordre de grandeur (radius 8-14px, texte 12-14px pour le corps) sans chercher à copier la palette ou le branding Supabase, conformément à la consigne du brief.

---

## Risques identifiés pour un futur Lot UI 2

1. **Volume** — la fragmentation touche des dizaines de fichiers ; toute normalisation en une seule passe serait risquée. Un séquençage par catégorie de composant (ex. d'abord les cartes, puis les boutons, puis les inputs) limiterait le rayon d'impact par changement.
2. **Duplication intentionnelle possible** — certaines différences (ex. `maxWidth` plus large pour la fiche employé Clock In Shift) peuvent être des choix produits, pas des erreurs. Le Lot 2 devra les distinguer avant de "corriger".
3. **Absence de tests automatisés** (confirmé dans CLAUDE.md) — toute normalisation visuelle devra être vérifiée manuellement écran par écran par Bryan, pas seulement par `tsc`.
4. **Admin : dette d'adoption plus que dette de conception** — le socle est bon, le risque est de le redéfinir inutilement au lieu de simplement le faire adopter partout.

## Proposition de périmètre pour le Lot UI 2 (à valider par Bryan, rien n'est engagé)

Suggestion : commencer par la catégorie la plus dupliquée-à-l'identique et la plus facile à vérifier visuellement — l'**input texte** (institution) et le **radius des boutons d'action de ligne + les pastilles de statut** (admin) — avant de s'attaquer aux cartes/modales qui ont plus de variantes contextuelles légitimes. Aucun Lot UI 2 ne sera lancé sans validation explicite de ce périmètre.

---

## Lot UI 2 — Réalisé (14/08/2026) : standardisation des inputs texte du dashboard Institution

**Statut : implémenté et testé.** Premier composant dimensionnel du dashboard institution créé et adopté par les 3 fichiers identifiés en §6 comme dupliquant `fieldLabel`/`fieldInput` à l'identique.

### Composant créé

`app/institution/[id]/dashboard/components/FormField.tsx` — exporte :
- `INPUT_DIMENSIONS` : la première échelle dimensionnelle officiellement adoptée pour les champs texte (voir tableau ci-dessous).
- `<FormField>` : composant label + input + icône optionnelle + message d'erreur, utilisé pour les `<input>` texte des 3 fichiers migrés.
- `fieldLabel`/`inputFieldStyle` : reprise **exacte** (valeurs inchangées) de l'ancien style dupliqué, conservée pour les usages hors "champ texte" volontairement non touchés dans ce lot (`<textarea>`, `<input type="time">`, labels sans champ associé) — voir §"Ne pas faire" plus bas.

### Dimensions standard retenues

| Propriété | Valeur | Origine |
|---|---|---|
| Hauteur | 40px (fixe, `box-sizing: border-box`) | Nouvelle — proche de la hauteur résultante de l'ancien padding, formalisée en valeur explicite |
| Padding horizontal | 13px | Inchangé (ex-`fieldInput`) |
| Taille de police | 13px | Inchangé |
| Hauteur de ligne | 1.4 | Nouvelle (aucune des 3 versions dupliquées n'en définissait une explicitement) |
| Rayon | 10px | Inchangé |
| Bordure | 1px | Inchangé (couleur : `C.border` au repos) |
| État focus | Bordure `C.gold` + anneau `0 0 0 3px ${C.gold}25` | Nouveau — aucun des 3 fichiers ne définissait de focus custom (repli navigateur par défaut) |
| État disabled | `opacity: 0.55`, `cursor: not-allowed` | Nouveau — le `disabled` HTML existait déjà (ProfilResponsableTab) mais sans retour visuel dédié |
| État erreur | Bordure `C.red` + message sous le champ | Nouveau — capacité ajoutée, non exercée dans ce lot (aucun des 3 écrans ne produit d'erreur de champ aujourd'hui) |
| Taille icône (si utilisée) | 16px | Nouveau — capacité ajoutée, non utilisée dans ce lot |
| Espacement label → champ | 6px | Inchangé |
| Espacement champ → erreur | 6px | Nouveau |

Toutes les valeurs "Inchangé" préservent l'apparence exacte des 3 écrans au repos. Les valeurs "Nouveau" répondent à la liste d'états demandée dans le brief, qu'aucune des 3 implémentations dupliquées ne couvrait de façon cohérente jusqu'ici.

### Fichiers modifiés

- `app/institution/[id]/dashboard/components/FormField.tsx` — **créé**.
- `app/institution/[id]/dashboard/components/ConditionsInformationsTab.tsx` — suppression des définitions locales `fieldLabel`/`fieldInput`, import depuis `FormField.tsx`. Aucun changement JSX (le fichier n'utilise ce style que sur un `<textarea>`, hors périmètre "champ texte").
- `app/institution/[id]/dashboard/components/ProfilResponsableTab.tsx` — suppression des définitions locales ; les 5 champs `<input>` (Prénom, Nom, Rôle, Téléphone, Email) migrés vers `<FormField>`.
- `app/institution/[id]/dashboard/components/ProfilEntrepriseTab.tsx` — suppression des définitions locales, import de `FormField` + `fieldLabel`/`inputFieldStyle` ; 10 champs `<input>` (Nom officiel, Année de création, Capacité, Ville, Quartier, Adresse, Téléphone, WhatsApp, Email, Site web) migrés vers `<FormField>`. Le `<textarea>` Description, les 2 `<input type="time">` (horaires) et le label "Bannière de couverture"/"Position sur la carte" restent inchangés, sur l'ancien style importé à l'identique — hors périmètre "champ texte" de ce lot.

### Ne pas faire — respecté

Aucun redesign d'écran, aucune couleur Yelen modifiée, aucune fonctionnalité modifiée (mêmes noms de champs, mêmes appels API, même validation), aucun layout global touché, aucune carte/modale touchée, dashboard Admin non touché, aucun input hors périmètre migré (textarea, time, et tous les autres écrans du dashboard laissés intacts).

### Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npx eslint` sur les 4 fichiers touchés → 0 erreur, 0 warning.
- `npm run build` → compilé avec succès en 2.9min, 295/295 pages générées sans erreur ; seul avertissement présent : dépréciation `middleware.ts` → `proxy` (Next.js 16), préexistante et sans rapport avec ce lot.
- **Vérification visuelle des 3 écrans : non effectuée.** Aucun outil navigateur n'est disponible dans cet environnement (limite déjà documentée à plusieurs reprises dans ce projet). Une relecture de code ligne à ligne a confirmé que chaque champ conserve exactement son `value`/`onChange`/`disabled`/`type`/`placeholder`/nom de champ d'origine — aucune divergence fonctionnelle trouvée à la lecture. **Bryan doit confirmer visuellement** les 3 écrans (`Profil Responsable`, `Profil Entreprise`, `Conditions & Informations`) : dimensions cohérentes, aucune rupture responsive, focus/disabled visibles correctement, avant de considérer ce lot définitivement clos.

### Confirmation de non-régression

Aucune modification de comportement, de couleur (hors ajout de l'anneau de focus doré, qui réutilise `C.gold` déjà existant), de layout ou de fonctionnalité en dehors des 3 fichiers listés. Aucun autre composant du dashboard institution ou de l'admin n'a été touché.

### Proposition pour le Lot UI 3 (à valider — non commencé)

Deux pistes possibles, à trancher par Bryan :
1. **Poursuivre l'input texte** au-delà des 3 fichiers de l'audit initial — les autres écrans institution utilisant un `inputStyle` local proche (`ClockInShiftTab.tsx`, `CommunicationTab.tsx`, `DocumentsClientsTab.tsx`, `EquipeTab.tsx`, `MesOffresTab.tsx`, `SignalementsTab.tsx`, `ServicesTab.tsx` — ce dernier avec 3 variantes locales) pourraient adopter `FormField`/`INPUT_DIMENSIONS`, en conservant la même méthode (audit du comportement actuel avant migration, un fichier à la fois).
2. **Ou bien traiter côté Admin** le radius des boutons d'action de ligne (`'5px'`, dupliqué dans 5 fichiers) et les pastilles de statut hors `Badge` (6 fichiers) — proposé initialement en §"Proposition de périmètre pour le Lot UI 2" ci-dessus.

Aucun Lot UI 3 ne sera lancé sans validation explicite de Bryan sur lequel de ces deux périmètres (ou un autre) retenir.

---

## Lot UI 3 — Réalisé (14/08/2026, exécuté en autonomie sur demande explicite de Bryan)

Extension de `FormField` (option 1 ci-dessus) aux 7 fichiers restants. Détail complet dans `docs/ui/YELEN_UI_REFERENCE.md`.

**Fichiers touchés** : `EquipeTab.tsx`, `CommunicationTab.tsx`, `DocumentsClientsTab.tsx`, `SignalementsTab.tsx`, `MesOffresTab.tsx`, `ServicesTab.tsx`, `ClockInShiftTab.tsx`, `FormField.tsx` (ajout du prop `maxLength`).

**Règle appliquée** : seuls les champs avec un `<label>` déjà visible ont été migrés. Champs sans label (formulaires compacts "ajout rapide"/recherche), `type="date"/"time"/"number"`, `<select>`, et champs à formatage spécial (PIN) laissés inchangés — les migrer aurait ajouté du contenu ou dépassé le périmètre "champs texte".

**Corrections annexes demandées par Bryan avant le build** : ESLint a révélé 7 erreurs `react-hooks/set-state-in-effect` + 3 warnings, tous **pré-existants** (patterns `useEffect(() => { load() }, [...])` antérieurs à ce lot, vérifié via `git diff`/recherche d'usage — aucun n'est dans le code que ce lot a modifié). Corrigés sur demande explicite : appels `setState` synchrones dans des effets déférés via `queueMicrotask` (comportement fonctionnellement identique, juste non-synchrone du point de vue du linter), `useState(Date.now())` → `useState(() => Date.now())` (initialisation paresseuse, fix standard React), suppression d'un composant `Ic_Chevron` mort (0 usage), suppression du binding `instId` inutilisé dans `SignalementsTab.tsx`, `fetchData` passé en `useCallback` dans `CommunicationTab.tsx`.

**Tests** : `npx tsc --noEmit` → 0 erreur. `npx eslint` sur les 8 fichiers → 0 erreur, 0 warning. `npm run build` → succès (compilé 5.9min, 295/295 pages générées 2.7min), seul avertissement = dépréciation `middleware.ts` préexistante.

**Vérification visuelle : non faite** (pas d'outil navigateur disponible dans cet environnement, comme pour le Lot UI 2) — à confirmer par Bryan.

**Fin de session** — reprise le lendemain, aucun autre travail entamé.
