# Yelen Public Help Center — Audit UX/UI & Structure Freeze

Document de conception, pas de contenu, pas de code modifié. Réponse au
brief "STRUCTURE FREEZE" de Bryan (22/09/2026) : geler définitivement la
navigation, l'architecture de pages et le design system du Help Center
public **avant** de reprendre la rédaction des 28 articles restants du
corpus (`YELEN_PUBLIC_HELP_CENTER_CORPUS_V1.md`).

**Méthode** : chaque constat ci-dessous s'appuie sur une lecture directe
du code réel du scaffolding (`app/guide-prestataire/**`,
`app/guide-prestataire/help-center.css`, `lib/helpCenter/*`), pas sur une
supposition. Aucun changement de code dans ce document — livrable
demandé explicitement avant tout codage (§17 du brief).

---

## A. Ce qui fonctionne déjà

- **Architecture de routes** : `/guide-prestataire` (accueil),
  `/guide-prestataire/[domaine]` (catégorie),
  `/guide-prestataire/[domaine]/[article]` (article),
  `/guide-prestataire/recherche` — **correspond exactement** à la cible
  du brief (§1). Aucun changement de route nécessaire.
- **SSG réel** : `generateStaticParams`/`generateMetadata` sur les 2
  routes dynamiques — cohérent avec l'objectif SEO déjà verrouillé.
- **Layout global cohérent** : header + footer partagés via
  `app/guide-prestataire/layout.tsx`, identiques sur les 4 types de page
  (accueil/catégorie/article/recherche) — répond déjà à l'exigence §2.
- **Recherche fonctionnelle sans JS** : `SearchForm` est un vrai
  `<form action="..." method="GET">`, la barre de suggestions en direct
  est un rehaussement progressif (§8, en partie).
- **Métadonnées d'article déjà conformes au brief** : temps de lecture
  calculé (jamais saisi à la main), auteur avec valeur par défaut, date
  affichée **seulement** si `miseAJourAffichee` — correspond exactement
  à la structure demandée en §6, aucun changement nécessaire ici.
- **Encadrés sémantiques** : `SectionBlock` distingue déjà Important/
  Conseil/À savoir par bordure de couleur + libellé texte (jamais la
  couleur seule) — bonne base pour §12.
- **Zéro emoji, zéro icône décorative gratuite** — conforme à la règle
  no-emoji du projet et à la demande §4.
- **Light-only avec tokens nommés** (`--hc-*`) — conforme à la décision
  déjà verrouillée §10, prêt pour un futur dark mode sans réécriture.
- **Sidebar catégories déjà partagée** sur les 4 types de page (pas
  seulement l'accueil) — bonne base pour §4, mais son comportement
  mobile actuel doit changer (voir B).
- **Fallback support déjà présent à 2 endroits** (footer de page normale
  via `SupportCallout`, état zéro résultat via `EmptyState`) — la
  demande §9 (support visible header + fin de page + zéro résultat) est
  déjà 2/3 remplie, il ne manque que le header (déjà présent en fait via
  `hc-contact-link` du layout — **en réalité 3/3 déjà remplie**, à
  confirmer en implémentation).

---

## B. Ce qui doit changer

Classé par sévérité.

### B1 — Bloquant (empêche une exigence explicite du brief)

1. **Recherche invisible sur mobile sur les pages catégorie et article.**
   `HeaderSearch` est masqué en dessous de 640px
   (`help-center.css:131-135`) et **aucune page catégorie/article
   n'affiche de recherche de repli sur mobile** — `DomainePage` a bien
   un `<SearchForm>` dans son contenu (donc mobile OK sur catégorie),
   mais `ArticlePage` n'en a **aucune**, ni dans le header (masqué) ni
   dans le contenu. Un visiteur mobile arrivé sur un article n'a
   **aucun moyen de rechercher** sans revenir à l'accueil. Contredit
   directement §8 ("la recherche doit fonctionner depuis... article")
   et §11 ("recherche pleine largeur" sur mobile).
2. **Aucun breadcrumb nulle part** (§5, §6, §7 — explicitement
   "obligatoires sur les pages profondes"). La page article affiche
   aujourd'hui le nom de catégorie en texte simple, non cliquable
   (`[article]/page.tsx:54-58`) — ce n'est pas un breadcrumb, juste une
   étiquette.
3. **Sidebar mobile = simple pile verticale, pas une navigation
   adaptée.** En dessous de 1024px, `.hc-layout` reste en colonne
   (`help-center.css:151-156`) : la liste des 9 liens (Accueil + 8
   catégories) s'affiche donc **en pleine largeur, au-dessus du
   contenu**, sur toutes les pages y compris un article — un visiteur
   mobile doit scroller au travers de 9 liens avant d'atteindre le
   contenu qu'il est venu lire. Contredit explicitement §4
   ("ne doit pas être simplement compressée... bouton/menu catégories OU
   sélecteur de catégorie").

### B2 — Important (dégrade l'expérience mais ne bloque rien)

4. **"0 articles" visible sur 4 des 8 catégories** (`commencer`,
   `rdv-clients`, `services-offres`, `securite-conformite`) — sur
   l'accueil (`page.tsx:36`) et la sidebar (`CategoryNav.tsx:23`).
   Aucune valeur UX démontrée à afficher un compte à zéro à ce stade
   (§3 : "à conserver uniquement si leur valeur UX est démontrée").
5. **Cartes de catégorie de l'accueil trop décoratives pour un produit
   documentaire** : grille `minmax(220px, 1fr)` avec `.hc-card` (padding
   20px, pas de contenu dense) — correspond à l'esprit "landing page"
   que le brief demande justement d'éviter (§10 : "documentation produit
   professionnelle", pas "landing page marketing").
6. **Indicateur de catégorie active insuffisamment distinct du survol**
   dans `CategoryNav` : actif et survolé partagent le même fond
   (`--hc-surface`), seule la couleur de bordure change (gold vs
   `--hc-border`) — repose presque uniquement sur la couleur, à renforcer
   (§4 : "aucune dépendance à la couleur seule", §12).
7. **`ArticleCard` sans indicateur visuel de navigation** (pas de
   chevron/flèche) — le brief demande explicitement le motif
   "ARTICLE / Titre / Description / →" (§5).
8. **Absence de distinction entre "Important" et "Attention"** dans la
   taxonomie de sections actuelle (`SectionType` n'a qu'un seul niveau
   `warn` → libellé "Important") alors que le brief §6 liste les 4
   encadrés comme des types distincts (À savoir / Important / Astuce /
   Attention). Décision à prendre : soit "Attention" est un synonyme
   volontairement fusionné avec "Important" (aucun changement de type
   nécessaire), soit c'est un second niveau de sévérité à ajouter au
   modèle. **Ne pas trancher seul — voir section K.**
9. **Libellé "Conseil" vs "Astuce"** : le code actuel labellise le type
   `tip` "Conseil" (`SectionBlock.tsx:6`), le brief §6 utilise "Astuce".
   Changement cosmétique trivial, à aligner sur le vocabulaire du brief
   sauf si "Conseil" est déjà un terme établi ailleurs dans Yelen (à
   vérifier avant de renommer).

### B3 — Absent, à construire (fonctionnalités du brief non encore scaffoldées)

10. **Breadcrumb component** — inexistant, à créer (§5, §6, §7).
11. **Navigation mobile catégories** — à concevoir (§4, voir section E).
12. **"Articles associés"** (§13) — le modèle de données n'a même pas de
    champ pour ça aujourd'hui (voir §15 / section J ci-dessous).
13. **Navigation "Article précédent / suivant"** (§14) — absente, et à
    ne construire que si une vraie séquence pédagogique existe (le brief
    le dit explicitement) : aucune catégorie du corpus V1 n'a aujourd'hui
    de logique séquentielle démontrée (les 5 articles rédigés sont
    chacun autonomes) — **candidat à ne pas construire en V1**, voir K.
14. **États de recherche "aucun résultat" incomplets** : `EmptyState`
    propose déjà un message clair + lien support (conforme à une partie
    de §8), mais **aucune suggestion de reformulation** n'est generée —
    absent du code actuel.

---

## C. Architecture finale des routes

**Aucun changement recommandé au niveau V1.** La structure déjà en place
correspond exactement à la cible du brief :

```
/guide-prestataire                              → accueil Help Center
/guide-prestataire/[domaine]                    → page catégorie
/guide-prestataire/[domaine]/[article]          → page article
/guide-prestataire/recherche                    → résultats de recherche
```

Conforme à la règle V1 du brief ("Catégorie → Article doit suffire dans
la majorité des cas") : **aucune sous-catégorie créée**, aucun besoin
réel démontré à ce jour (le plus gros candidat, Finance & Yelen Business,
reste dans la fourchette 2-4 articles — largement en dessous du seuil où
une sous-catégorie se justifierait). Si un jour un domaine dépasse ~8-10
articles, le brief prévoit déjà le gabarit
`/guide-prestataire/[categorie]/[sous-categorie]/[article]` — non
implanté tant qu'aucun domaine n'atteint ce volume.

**Nom de segment** : le code utilise `[domaine]` (issu de l'audit
technique, où "domaine fonctionnel" est le terme déjà employé partout
dans `YELEN_PROVIDER_HELP_CENTER_AUDIT.md`) là où le brief dit
"catégorie". **Terminologie interne seulement** (nom de dossier/variable,
jamais montré au visiteur) — aucun changement fonctionnel requis, mais à
signaler pour éviter toute confusion dans les échanges futurs entre
"domaine" (code) et "catégorie" (UX/produit) : ce sont le même concept.

---

## D. Navigation desktop

**Conserver la sidebar actuelle avec 3 renforcements ciblés**, pas une
refonte :

1. **Ordre des 9 entrées** : déjà exactement celui du brief
   (Accueil du centre d'aide, puis les 8 catégories dans l'ordre
   `CATEGORIES` de `lib/helpCenter/data.ts`) — aucun changement.
2. **Renforcer l'indicateur d'état actif** (B2.6) : ajouter un repère non
   coloré (ex. graisse de police plus marquée, ou une barre verticale
   pleine à gauche du lien actif) en plus de la bordure dorée déjà
   présente — pour ne jamais dépendre uniquement de la couleur.
3. **Masquer/adapter le compteur "(0)"** (B2.4) tant qu'une catégorie
   n'a aucun article — cohérence avec la recommandation homepage (F).
4. **Navigation clavier** : déjà native (ce sont des `<Link>` standards,
   focus visible déjà géré globalement par `.hc :focus-visible`) —
   aucun changement structurel nécessaire, seulement vérification
   manuelle de l'ordre de tabulation une fois les autres changements
   faits (skip link → recherche header → nav → contenu → footer).

**Largeur de lecture** : `.hc-shell` est déjà borné à 1180px, la colonne
de contenu (`.hc-main`) prend le reste une fois la sidebar de 240px
retirée — dans la fourchette confortable d'une colonne de lecture
(~900px), conforme à §11 sans changement.

---

## E. Navigation mobile

**Point non tranché du brief ("À définir proprement avant implantation
finale")** — 2 options réalistes, chacune avec un compromis réel :

| Option | Fonctionnement | Avantage | Inconvénient |
|---|---|---|---|
| **A — Bouton "Catégories" + panneau plein écran** | Un bouton sous le header ouvre une liste des 9 entrées en overlay (façon menu mobile déjà utilisé ailleurs sur Yelen, ex. `CitoyenMenu.tsx`) | Cohérent avec un pattern déjà existant ailleurs dans le produit ; le contenu de la page reste immédiatement visible en arrivant | Un clic de plus pour changer de catégorie |
| **B — Sélecteur natif (`<select>`) synchronisé sur la route** | Un menu déroulant natif au-dessus du contenu, qui navigue au changement de valeur | Zéro JS de panneau à construire, accessible nativement | Moins engageant visuellement, ne montre pas les 9 options d'un coup d'œil |

**Recommandation** : Option A, pour cohérence avec le pattern mobile
déjà établi ailleurs dans Yelen (`CitoyenMenu.tsx`, overlay plein écran)
plutôt qu'un composant natif isolé qui n'existe nulle part ailleurs dans
le produit — mais **c'est une préférence, pas une preuve**, à valider
avec Bryan avant implantation (aucun des deux n'est un mauvais choix).

Dans les deux cas : le contenu de page (hero, article, liste) doit
occuper tout l'écran mobile immédiatement, sans que les 9 liens de
catégorie s'interposent avant lui (corrige B1.3).

---

## F. Structure homepage

**Conserver la hiérarchie actuelle**, avec 2 ajustements :

```
1. Hero — "Comment pouvons-nous vous aider ?" (déjà conforme)
2. Recherche principale (déjà conforme, intégrée au hero)
3. [Accès rapides — absent aujourd'hui, correctement absent :
    aucune donnée réelle ne le justifie encore (0 tracking de
    recherche, corpus trop jeune) — ne pas construire avant un
    signal réel, conforme à §3]
4. Catégories principales — À REVOIR (B2.5) : remplacer la grille de
   cartes décoratives par une liste plus dense (voir G, même logique
   que les listes d'articles)
5. "Vous ne trouvez pas de réponse ?" (déjà conforme, SupportCallout)
6. Footer (déjà conforme, global)
```

Le point 3 ("Accès rapides / sujets fréquents") reste une case vide
**volontairement** — le brief lui-même l'exige ("uniquement si les
données existent réellement"). Aucune analytics de recherche n'existe
en V1 (décision déjà verrouillée), donc aucune fréquentation réelle à
afficher. À revisiter si/quand une mesure d'usage est un jour construite
(hors périmètre V1, déjà noté dans l'architecture §11.4).

---

## G. Structure catégorie

**Changement principal : densité de la liste d'articles**, pas
l'architecture de la page (breadcrumb → H1 → description → recherche →
liste, déjà l'ordre du code actuel une fois le breadcrumb ajouté).

Recommandation concrète pour `ArticleCard` (remplace la carte actuelle,
garde le même composant, change son contenu visuel) :

```
[Titre de l'article, gras]                                    →
[Résumé court en une ligne, tronqué si besoin]
```
— une ligne de séparation fine entre chaque article plutôt qu'une carte
bordée indépendante à chaque fois (réduit la sensation de "carte
décorative empilée", rapproche du motif liste demandé §5), tout en
gardant la cible de clic pleine largeur pour l'accessibilité tactile.

**Description de catégorie** : le brief demande une "description courte"
sous le H1 — **absente aujourd'hui du modèle `Categorie`**
(`{ id, titre, ordre }` seulement, `lib/helpCenter/types.ts:27-31`).
À ajouter au modèle (`description?: string`) — décision de contenu (quoi
écrire pour chacune des 8), pas seulement de structure, à traiter avec
Bryan au moment de l'implantation.

---

## H. Structure article

**Déjà largement conforme** (voir A) — 3 ajustements :

1. Ajouter le breadcrumb au-dessus du H1 (le H1 reste tel quel,
   indépendant, conforme §7).
2. Transformer l'étiquette catégorie actuelle (texte simple,
   `[article]/page.tsx:54-58`) en premier maillon du breadcrumb plutôt
   qu'un élément séparé — évite la redondance visuelle (aujourd'hui
   catégorie apparaît 2 fois : au-dessus du H1 ET dans la sidebar active).
3. **"Articles associés"** (§13) : à ajouter en toute fin, après
   `SupportCallout` ou avant — À trancher (le brief liste "support" puis
   "éventuellement articles associés", donc support avant, cohérent avec
   l'ordre actuel). Bloqué tant que `relatedArticles` n'existe pas dans
   le modèle (voir J) et qu'aucune relation n'a été assignée aux 5
   articles déjà rédigés.

---

## I. États recherche

| État | Aujourd'hui | Cible brief | Écart |
|---|---|---|---|
| Normal (page recherche, champ vide) | Message neutre "Entrez un mot-clé..." | Identique | Aucun |
| Résultats | Liste `ArticleCard` + compteur | Identique | Aucun (bénéficiera de la densification G) |
| Aucun résultat | Message + lien support (`EmptyState`) | Message + **suggestions de reformulation** + support | **Suggestions absentes** — à construire. Sans tracking réel de recherche (§8 : "aucun tracking analytics en V1"), les suggestions ne peuvent pas venir d'un historique — proposer plutôt les 2-3 catégories les plus proches par mot-clé (`motsClefs` déjà indexés) ou simplement la liste des 8 catégories, jamais une suggestion inventée |
| Suggestions live (dropdown clavier) | Fonctionnel, 6 résultats max, fermeture au clic extérieur/Échap | Non demandé explicitement mais cohérent avec "recherche par intention" | Déjà au-delà du brief minimal, à conserver |

---

## J. Accessibilité

| Exigence brief | État actuel | Constat |
|---|---|---|
| H1 unique par page | **Conforme** | Vérifié sur les 4 types de page |
| Hiérarchie H2/H3 sans saut | **À vérifier à la rédaction** | `SectionBlock` rend des `<h3>` directement sous le H1 de la page (pas de H2 intermédiaire) — à corriger : le titre de section doit être `<h2>`, pas `<h3>`, tant qu'aucun sous-titre n'existe entre les deux |
| Navigation clavier complète | **Conforme structurellement** | Liens natifs partout, formulaire de recherche au clavier fonctionnel (Échap ferme le dropdown) |
| Focus visible | **Conforme** | `.hc :focus-visible` global, couleur alignée sur le focus ring du reste du produit |
| Aucune information portée uniquement par la couleur | **Écart identifié** (B2.6) | Catégorie active dans la sidebar — voir D.2 |
| Liens explicites (jamais "cliquez ici") | **Conforme** | Aucune occurrence trouvée dans le code actuel |
| Champs de recherche labellisés | **Conforme** | `<label>` visuellement masqué mais présent (`SearchForm.tsx:59-61`) |
| Contraste | **Non vérifié** | Aucun outil Lighthouse/axe disponible dans cet environnement (limite déjà connue du projet) — vérification manuelle par Bryan requise avant mise en production, comme pour le reste du produit |
| Zoom 200% | **Non vérifié** | Même limite d'outillage — aucune unité `px` fixe bloquante repérée à la lecture du CSS (tout en `rem`/`%`/`px` raisonnables), mais seule une vérification réelle au navigateur peut le confirmer |
| Boutons réellement accessibles (taille de cible tactile) | **À vérifier** | Boutons d'effacement de recherche (`.hc-search-clear`, 20×20px) sous la cible tactile recommandée de 44×44px — à agrandir la zone cliquable (padding invisible) sans changer l'apparence visuelle |

---

## K. Composants réutilisables nécessaires

Nouveaux composants à créer (aucun code produit dans ce document,
uniquement leur périmètre) :

1. **`Breadcrumb`** — liste de `{ label, href? }`, dernier élément non
   cliquable (page courante). Utilisé sur catégorie (2 niveaux) et
   article (3 niveaux). Un seul composant partagé, jamais dupliqué par
   page (cohérent avec la discipline "source unique" déjà pratiquée
   partout ailleurs dans le produit).
2. **`MobileCategoryNav`** (ou équivalent selon l'option E retenue) —
   remplace le rendu actuel de `CategoryNav` en dessous de 1024px,
   partage les mêmes données (`getCategories()`, `countArticles()`).
3. **`RelatedArticles`** — affiche 3 à 5 articles liés à partir d'un
   nouveau champ `relatedArticles?: ArticleId[]` sur le type `Article`
   (voir modèle de données ci-dessous), rendu uniquement si le tableau
   est non vide et que les IDs référencés existent réellement (jamais un
   article fantôme si un ID est mal orthographié — vérification à faire
   au moment de la rédaction, pas silencieusement ignorée).
4. **`ArticleCard` révisé** — même composant, contenu visuel densifié
   (G), ajout d'un chevron `→`.

### Vérification du modèle de données (§15 du brief)

| Champ demandé | Existe déjà ? | Sous quel nom | Écart |
|---|---|---|---|
| `id` | Oui | `id` | — |
| `slug` | Oui (fusionné) | `id` sert aussi de slug d'URL | Aucun besoin de champ séparé : `id` est déjà un slug unique par domaine, cohérent avec l'usage réel dans les routes |
| `category` | Oui | `domaine` | Nom différent (terminologie interne, voir C), même fonction |
| `title` | Oui | `titre` | — |
| `description` | Oui | `resume` | — |
| `content` | Oui, en mieux | `sections: Section[]` | Structure déjà plus riche qu'un `content` texte plat — aucun changement nécessaire |
| `readingTime` | Calculé, jamais stocké | `estimerDureeLecture(article)` | Volontaire (§9 architecture : jamais une valeur saisie à la main) — **ne pas ajouter de champ stocké**, le calcul dynamique est le comportement correct |
| `audience` | Oui | `audiences?: MembreRole[]` | Présent dans le type, **mais aucun mécanisme de filtrage réel construit** (déjà noté limite connue, Phase E.1 point 4 de l'architecture in-product) — cohérent avec la décision déjà actée de ne pas construire de filtrage d'audience en V1 |
| `sourceCode` | Oui | `sourceCode?: string[]` | — |
| `derniereVerification` | Oui | `derniereVerification` | — |
| `miseAJourAffichee` | Oui | `miseAJourAffichee?: boolean` | — |
| `relatedArticles` | **Absent** | — | **À ajouter** : `relatedArticles?: ArticleId[]`, nécessaire pour K.3 |
| `status` | **Absent** | — | **À ajouter** : le cycle de vie simplifié déjà décidé dans l'architecture (`Brouillon → Publié → À revoir → Archivé`, §9 de `YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md`) n'a **aucun champ concret** dans le type `Article` aujourd'hui — actuellement, un article dans `ARTICLES[]` est implicitement "publié" dès qu'il existe. Sans ce champ, impossible de préparer un article à l'avance sans le rendre visible, ou de marquer un article "à revoir" après un changement de code. **Recommandé avant de reprendre la rédaction des 28 articles restants**, pour éviter de devoir migrer les 5 déjà écrits plus tard. |

**Conclusion §15** : le modèle supporte déjà la majorité des champs
demandés, souvent en mieux (content structuré, readingTime calculé
plutôt que stocké). **2 champs manquent réellement** (`status`,
`relatedArticles`) — ajout mécanique au type + valeur par défaut
rétrocompatible (`status: "publie"` implicite si absent), pas une
refonte.

---

## Décisions à trancher avant implantation (pas seules)

1. **Navigation mobile** (section E) — Option A (menu overlay) ou B
   (sélecteur natif) ?
2. **"Attention" vs "Important"** (B2.8) — synonyme fusionné ou second
   niveau de sévérité à ajouter au modèle `SectionType` ?
3. **"Conseil" vs "Astuce"** (B2.9) — renommer le libellé, ou "Conseil"
   est-il un terme déjà établi ailleurs à conserver ?
4. **Champ `description` sur `Categorie`** (section G) — à écrire pour
   les 8 catégories, décision de contenu à faire avec Bryan, pas
   seulement de structure.
5. **`status`/`relatedArticles`** (section K) — confirmer l'ajout au
   modèle avant de reprendre la rédaction, pour ne pas migrer les 5
   articles déjà écrits plus tard.

---

**ARRÊT — Audit UX/UI restitué, aucun code modifié. En attente de
validation de Bryan sur les points B1 (bloquants), l'option de
navigation mobile (E) et les 5 décisions ci-dessus avant toute
implantation.**
