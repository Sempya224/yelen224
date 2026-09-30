# Yelen Public Help Center — Architecture technique

Document de conception, pas de contenu. Aucun article rédigé, aucun code
modifié dans ce document. Complète (ne remplace pas)
`docs/product/YELEN_PROVIDER_HELP_CENTER_AUDIT.md` (audit produit) et
`docs/product/YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` (architecture
de l'aide contextuelle in-product) — les 3 docs coexistent, chacun sur
sa couche.

**Statut : spécification technique verrouillée (22/09/2026) — les 4
points ouverts de la version précédente sont tranchés (§11). Prête pour
scaffolding. Aucun article rédigé, aucun code encore écrit.**

---

## 0. Rappel du périmètre (verrouillé le 22/09/2026)

Correction de périmètre actée : le "Help Center" désigne un **Help
Center public** — accessible sans connexion, sans session, sans
`TabKey`, sans rôle — dans l'esprit des Help Centers Apple/DoorDash/
Netlify/GitHub/Supabase. Distinct et complémentaire de :

- **Couche 1 — Help Center public** (`/guide-prestataire`) — ce document.
- **Couche 2 — Aide contextuelle in-product** (dashboard, `TabKey`) —
  déjà livrée (vertical slice Signalements, T5, T11-A, T11-B), voir
  `YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` section 12. Peut pointer
  vers la Couche 1 via un lien "En savoir plus", jamais l'inverse.
- **Couche 3 — Support humain** — `SupportYelenTab` (dashboard,
  authentifié) + `/contact` (public, générique, non spécifique
  prestataire). Aucun canal de support public spécifique prestataire
  n'existe aujourd'hui (voir section 8).

---

## 1. Audit du moteur historique `/guide-prestataire`

Lecture via `git show HEAD:"app/guide-prestataire/page.tsx"` (dernière
version commitée avant suppression, 458 lignes, `Suspense`+
`GuidePrestataireInner`).

### Réutilisable (comme idée, jamais comme code copié)

- **Taxonomie `SectionType`** (`text`/`warn`/`tip`/`info`/`list`/
  `checklist`/`steps`/`plans`) — modèle de contenu raisonnable pour
  structurer un article.
- **Structure `Chapitre { id, numero, titre, sections }`** — base
  correcte pour un modèle d'article.
- **`Suspense` + `useSearchParams()`** pour le deep-link — pattern
  techniquement correct, conforme au piège déjà documenté (CLAUDE.md
  `/pieges-techniques-connus`), à reproduire à l'identique.
- **Principe du deep-link** (`?chapitre=<id>` depuis le popover
  dashboard) — l'idée de contextualisation est bonne, l'implémentation
  ne l'est pas (voir ci-dessous).

### Non réutilisable, à reconstruire entièrement

- **Emojis codés en dur dans les données elles-mêmes**, pas seulement
  décoratifs (`"⚠️ Important"`, `"💡 Conseil pro"`, `"ℹ️ Saviez-vous ?"`,
  icônes de chapitre 🚀🏛️📅✅📊📢✓💳📲🛟...) — viole la règle no-emoji du
  projet. Le couplage est fort : reconstruire proprement suppose de
  réécrire chaque valeur de `section.titre`/`items`, pas juste retirer
  un composant.
- **Palette 100% hex codée en dur** (`#1a1200`, `#6b5000`, `#8B6914`...),
  aucun `ThemeTokens`/`T[theme]` — pas de dark mode, incohérent avec le
  design system réel du produit (`app/[slug]/[id]/theme.ts`).
- **`@font-face` chargée depuis un CDN TikTok externe**
  (`sf16-website-login.neutral.ttwstatic.com`) — dépendance externe
  injustifiée, aucune raison produit identifiée, à ne jamais reproduire.
- **Zéro media query desktop** — aucune occurrence de `@media`/
  `min-width` dans tout le fichier (vérifié), layout 100% mobile-only,
  alors qu'un Help Center public attire structurellement plus de trafic
  desktop qu'un dashboard institution.
- **Zéro recherche réelle** — uniquement une liste de chapitres dans un
  drawer, aucun moteur de recherche sur le contenu.
- **Navigation 100% côté client** (`useState` pour le chapitre actif) —
  un chapitre n'a pas d'URL propre indexable/partageable au-delà du
  query param `?chapitre=` — mauvais pour le SEO.
- **Contenu obsolète/inventé** : prix erronés (7$/15$ vs les plans
  réels `essentiel/pro/entreprise`), statistiques fabriquées sans
  source ("+65% de vues profil", "+80% de conversion" — viole
  directement le principe "zéro donnée inventée"), fonctionnalités non
  vérifiées (API Yelen224, chat en direct, Mobile Money, PayPal) —
  déjà tranché par vous : contenu entièrement neuf, aucune reprise.

**Verdict** : ne pas réutiliser le fichier ni son moteur tel quel.
Nouvelle implémentation reprenant uniquement les 2 idées structurelles
validées (taxonomie de section, `Suspense`+`useSearchParams`), avec le
design system réel (`ThemeTokens`), zéro emoji, responsive réel, vraie
recherche.

---

## 2. Structure de route proposée

`/guide-prestataire` confirmé (URL déjà connue de cette audience,
évite une nouvelle famille d'URL, aucun terme anglais). Contrairement à
l'ancien `?chapitre=` (query param, non indexable individuellement),
**chaque article a sa propre URL statique** :

```
app/guide-prestataire/
  page.tsx                      → Accueil HC (catégories + recherche + mis en avant)
  [domaine]/page.tsx            → Liste des articles d'un domaine (ex. /guide-prestataire/rendez-vous)
  [domaine]/[article]/page.tsx  → Article individuel (ex. /guide-prestataire/rendez-vous/annuler-un-rdv)
  recherche/page.tsx            → Résultats de recherche (entrée dédiée)
```

Segments `[domaine]`/`[article]` = slugs statiques connus à l'avance
(contenu codé en dur, cohérent avec §3) — `generateStaticParams` liste
tous les couples réels pour un rendu SSG, meilleur pour SEO et
performance publique qu'un rendu 100% client.

**Catégories de premier niveau — 10 au total (Services/Partenariat
séparés le 23/09/2026)** : "Commencer avec Yelen" en tête, puis 9
domaines fonctionnels (Accueil & configuration, RDV & clients, Services,
Partenariat, Communication & réputation, Équipe & organisation, Sécurité &
conformité, Finance, Yelen Business). Cette liste est désormais la seule
source de vérité, identique à `CATEGORIES` dans `lib/helpCenter/data.ts`.

⚠️ Historique du 22/09/2026, pour éviter de reproduire l'aller-retour :
Phase D proposait à l'origine Finance et Yelen Business séparés → une
première correction du 22/09/2026 les avait fusionnés en une seule
catégorie (réconciliation d'une contradiction interne à ce document,
voir git blame si le détail est utile) → **re-séparés le jour même**, sur
demande explicite de Bryan pendant la correction du menu mobile,
retour à la proposition initiale de Phase D. `pourquoi-admin-ne-peut-pas-rembourser`
(remboursements clients) est resté en Finance ; `difference-facturation-clients-facturation-yelen`
(article qui explique justement la distinction entre les deux écrans) est
allé en Yelen Business — décision éditoriale, pas une preuve produit,
à revoir si un jour un signal réel indique le contraire.

**Services / Partenariat — séparés le 23/09/2026** (retour Bryan,
principe verrouillé §11 point 5) : "Services & offres" mélangeait deux
sujets distincts (catalogue de services vendus aux clients d'un côté,
candidature/offres du programme Partenariat de l'autre), même défaut que
la fusion Finance/Yelen Business ci-dessus. `services` couvre `4.1`
(catalogue gratuit/payant) ; `partenariat` couvre `4.3` (statuts d'offre,
Suspendre/Archiver) et `4.4` (candidature Partenariat). `4.2`
(comparaison "pourquoi mon service est visible tout de suite mais pas
mon offre") va dans `partenariat` — décision éditoriale (la confusion
part de l'écran Mes Offres, pas de Services), à revoir si un jour un
signal réel indique le contraire, même logique que la note ci-dessus.

**Granularité du corpus V1 (décision verrouillée §11.2)** : une
catégorie peut exister dans la navigation sans contenu artificiel — un
article n'est créé que si une connaissance produit réelle et vérifiable
le justifie. Fourchettes de capacité (pas un quota à remplir) :

| Catégorie | V1 |
|---|---:|
| Commencer avec Yelen | 3-5 |
| Accueil & configuration | 3-5 |
| RDV & clients | 3-5 |
| Services | 1-3 |
| Partenariat | 1-3 |
| Communication & réputation | 2-4 |
| Équipe & organisation | 2-4 |
| Sécurité & conformité | 3-5 |
| Finance | 1-3 |
| Yelen Business | 1-3 |

Soit ~20-36 articles potentiels. Premiers candidats : les connaissances
déjà démontrées généralisables par l'audit (T5, T9, T11, T1+T2-A quand
applicable — voir mémoire du chantier) transformées en véritables
articles publics autonomes, jamais un copier-coller des notes
contextuelles in-product (principe 9, ces dernières supposent un
dashboard déjà vu).

---

## 3. Architecture des données codées en dur

Modèle de données proposé (structure, pas le contenu) :

```ts
type ArticleId = string;   // slug unique, ex. "annuler-un-rdv"
type DomaineId = string;   // slug de domaine, ex. "rendez-vous"

type Section = {
  titre: string;
  contenu?: string;
  type: "text" | "warn" | "tip" | "info" | "list" | "checklist" | "steps";
  items?: string[];
};
// "plans" (comparatif tarifs) retiré de la taxonomie d'origine — la
// tarification réelle vit dans institutions.plan (essentiel/pro/
// entreprise), jamais recopiée en dur dans un article sans revérification.

type Article = {
  id: ArticleId;
  domaine: DomaineId;
  titre: string;
  resume: string;                 // carte de liste + meta description SEO
  sections: Section[];
  sourceCode?: string[];          // fichiers/routes réels cités (principe 8, ARCHITECTURE.md §8) — interne, jamais rendu au lecteur
  derniereVerification: string;   // date ISO (principe états du contenu, §9) — interne par défaut
  miseAJourAffichee?: boolean;    // décision éditoriale par article : afficher "Mis à jour le" au lecteur seulement si ça apporte une vraie valeur (ex. article sur une fonctionnalité qui a changé récemment) — jamais automatique, jamais le nom du fichier source
  audiences?: MembreRole[];       // réutilise le type existant (lib/institutionPermissions.ts), optionnel, absent = tous
  motsClefs?: string[];           // recherche (§6 de l'architecture D)
};
```

Différence clé avec l'ancien `Chapitre` : `sourceCode`/
`derniereVerification` rendent explicite et vérifiable la discipline
"rattaché au code réel" — absente de l'ancien moteur. **Décision
verrouillée (§11.3)** : ces deux champs sont de la gouvernance interne
(commentaire de code / traçabilité), jamais exposés tels quels au
lecteur (pas de "Source : AvisReputationTab.tsx" ni de date affichée par
défaut) — seul `miseAJourAffichee` permet, article par article, d'en
tirer une date visible quand elle a une vraie valeur éditoriale.

---

## 4. Système catégories / articles / recherche

- **Catégories** = domaines, chacune une landing `[domaine]/page.tsx`
  listant ses articles (titre + résumé, pas le contenu complet).
- **Recherche** : index généré au build (titre + résumé + motsClefs +
  contenu aplati), recherche côté client par correspondance de
  sous-chaîne/score simple — pas de service tiers (Algolia etc.),
  cohérent avec la discipline "zéro dépendance externe non justifiée"
  et avec le volume attendu (quelques dizaines d'articles, pas
  des milliers).
- **Contextualisation dashboard → HC** : reprendre l'idée du deep-link
  avec de vraies URLs (`/guide-prestataire/[domaine]/[article]?from=dashboard&tab=<TabKey>`)
  plutôt que le flat `?chapitre=` d'origine.

---

## 5. Stratégie SEO

**Constat vérifié** : zéro `sitemap.xml`, zéro `robots.txt` dans tout
le projet aujourd'hui. Le Help Center public serait la première pièce
de contenu réellement SEO-sensible du produit (le dashboard n'a jamais
eu besoin d'indexation).

- SSG par article (`generateStaticParams` + `generateMetadata`,
  title/description dérivés de `resume`).
- `app/sitemap.ts` (API native Next.js) — à créer, première
  introduction dans le projet.
- `app/robots.ts` — à créer, autorise explicitement l'indexation
  (aujourd'hui rien ne l'interdit ni ne l'autorise explicitement).
- Googlebot/bots déjà exemptés du mur mobile (`estRobotOuApercu()`,
  `lib/deviceAccess.ts:28`, inclut `Googlebot|bingbot|Applebot`,
  passe toujours) — **aucune action requise sur ce point précis**.

---

## 6. Comportement visiteur connecté/non connecté — découverte technique

**Point bloquant identifié, à corriger avant tout déploiement** : le
mur mobile-only citoyen (`proxy.ts` + `lib/deviceAccess.ts`) bloque
aujourd'hui tout visiteur desktop non-bot sur les chemins non exemptés.
`/guide-prestataire` a été retiré de `MOBILE_WALL_EXEMPT_PREFIXES`
(`lib/deviceAccess.ts:40-60`) en même temps que la page elle-même le
21/09/2026 et **n'y est plus**. Si `MOBILE_WALL_ENABLED=true` en
production, un prospect ou un admin visitant `/guide-prestataire`
depuis un ordinateur de bureau serait rewritté vers
`/acces-mobile-requis` — l'inverse exact de l'objectif "accessible sans
connexion, sur tout appareil".

**Action requise (au moment de l'implantation, pas ce document)** :
réajouter `/guide-prestataire` à `MOBILE_WALL_EXEMPT_PREFIXES`, au même
titre que `/contact`/`/cgu`/`/institution`.

Pour le reste : connecté vs non connecté ne change rien à l'affichage
de la page (principe "le public ne dépend jamais du dashboard", posé en
amont de ce document) — seule différence possible : un lien "Retour au
dashboard" si l'article est ouvert avec `?from=dashboard` (paramètre
optionnel, jamais requis pour le fonctionnement de la page).

---

## 7. Liaison depuis le dashboard

- Les 4 notes contextuelles déjà livrées (Signalements, T5, T11-A,
  T11-B) **pourront** recevoir un lien "En savoir plus" vers l'article
  public correspondant une fois celui-ci écrit — à faire lot par lot,
  jamais en modification groupée.
- Popover "Aide Yelen" (`app/[slug]/[id]/layout.tsx` L3889+) : la carte
  "Guide Yelen" a été retirée le 21/09/2026 avec le reste — à
  reconstruire pour pointer vers le nouveau `/guide-prestataire`
  (nouvel onglet, puisque c'est désormais une destination publique
  distincte du dashboard, pas une modale interne).
- `TabKey → article` : principe déjà posé en Phase D (architecture
  in-product, section 5) conservé — un `TabKey` peut référencer 0..n
  articles publics, jamais l'inverse (un article ne dépend d'aucun
  `TabKey` pour être lisible).

---

## 8. Gestion du support public

Confirmé : aucun canal de support dédié prestataire non connecté
n'existe aujourd'hui. Recommandation V1 : pointer vers `/contact`
(existant, générique entreprise) comme filet de sécurité, sans
construire de nouveau canal. La réconciliation des canaux de contact
(question ouverte n°7 de l'audit, jamais tranchée — plusieurs emails
affichés à des endroits différents) reste un préalable si un canal plus
spécifique est voulu plus tard.

---

## 9. Contraintes responsive / mobile

- Contrairement à l'ancien moteur (0 media query), le Help Center doit
  suivre la discipline responsive déjà établie ailleurs dans le produit
  (breakpoint `≥1024px`, cf. `.dispo-layout`/`.profil-acces-grid`) —
  probablement liste/onglets sur mobile, 2-3 colonnes (catégories |
  liste | contenu) sur desktop.
- Le mur mobile (§6) est un mécanisme **d'accès** (qui peut charger la
  page), indépendant de la mise en page responsive (comment elle
  s'affiche une fois chargée) — les deux sujets sont distincts, tous
  deux à traiter.
- **Thème — décision verrouillée (§11.1)** : **light-only en V1**,
  cohérent avec toutes les pages publiques existantes (`/faq`,
  `/contact`), sans `ThemeProvider` public. Ceci ne dispense pas
  d'utiliser des tokens de couleur structurés (jamais de hex brut dispersé
  comme l'ancien moteur, voir §1) — l'objectif est qu'un futur dark mode
  public, s'il est décidé un jour, s'ajoute sans réécriture, pas qu'il
  soit construit maintenant.

---

## 9bis. Accessibilité — exigence V1 (décision verrouillée)

Contrairement au reste des points de cette section, l'accessibilité
n'est pas un point ouvert : c'est une exigence explicite dès V1, au même
titre que le responsive. Base WCAG applicable à un site de documentation
public (référence W3C WAI, pas de norme interne inventée) :

- **Structure de titres** cohérente (`h1` unique par page, hiérarchie
  `h2`/`h3` sans saut de niveau) — un article a une vraie structure
  sémantique, pas des `<div>` stylées en gras.
- **Navigation clavier complète** : catégories, recherche, liens
  d'article, tout atteignable et activable sans souris, ordre de
  tabulation logique.
- **Contraste suffisant** en light-only (le seul thème livré en V1) —
  vérifié sur les tokens réellement utilisés, pas supposé.
- **Liens explicites** (jamais un "cliquez ici" nu) et libellés de
  recherche/formulaire associés à leur champ (`label`/`aria-label`).
- **Responsive = accessibilité aussi** : zoom navigateur jusqu'à 200%
  sans perte de contenu ni de fonction.

Aucun audit automatisé (Lighthouse/axe) n'est disponible dans cet
environnement (déjà noté ailleurs dans le projet, /backlog-produit
CLAUDE.md) — vérification manuelle par Bryan requise avant mise en
production, comme pour le reste du produit.

---

## 10. Estimation des fichiers/routes à créer

| Élément | Fichier(s) | Statut |
|---|---|---|
| Accueil HC | `app/guide-prestataire/page.tsx` | Reconstruit (ancien supprimé) |
| Landing domaine | `app/guide-prestataire/[domaine]/page.tsx` | Nouveau |
| Article | `app/guide-prestataire/[domaine]/[article]/page.tsx` | Nouveau |
| Recherche | `app/guide-prestataire/recherche/page.tsx` | Nouveau |
| Données articles | `app/guide-prestataire/data/*.ts` (ou `lib/helpCenter/*.ts`) | Nouveau |
| Types | `lib/helpCenter/types.ts` | Nouveau |
| Rendu des sections | `app/guide-prestataire/components/SectionBlock.tsx` | Reconstruit (idée reprise, code neuf) |
| Sitemap | `app/sitemap.ts` | Nouveau (absent du projet) |
| Robots | `app/robots.ts` | Nouveau (absent du projet) |
| Exemption mur mobile | `lib/deviceAccess.ts` | Modification (1 ligne) |
| Lien "Guide Yelen" popover dashboard | `app/[slug]/[id]/layout.tsx` | Modification |

Estimation : **~8-10 nouveaux fichiers + 2 fichiers existants modifiés**,
hors contenu des articles eux-mêmes (lot par lot, jamais en un seul
passage — même méthode que le reste du chantier).

---

## 11. Décisions verrouillées (22/09/2026)

Les 4 points laissés ouverts par la version précédente de ce document
sont tranchés par Bryan :

1. **Thème** : light-only en V1, sans `ThemeProvider` public — voir §9.
   Architecture visuelle prête pour une évolution ultérieure (tokens
   structurés), sans construire de dark mode maintenant.
2. **Granularité du corpus V1** : fourchettes de capacité par catégorie
   (~20-36 articles), aucune obligation de remplir — voir §2. Un article
   n'existe que si une connaissance produit réelle le justifie.
3. **`sourceCode`/`derniereVerification`** : gouvernance interne
   uniquement, jamais exposés au lecteur par défaut — voir §3.
4. **Mesure d'usage (analytics Help Center)** : différée. Aucun système
   de tracking, aucune table, aucune instrumentation en V1. L'architecture
   (URLs statiques par article, §2) n'empêche rien de ce type plus tard
   (recherches sans résultat, articles les plus consultés) — juste rien
   construit maintenant, cohérent avec la question déjà laissée ouverte
   en Phase D section 6 pour la couche in-product.
5. **Jamais de fusion d'articles/catégories entre sujets distincts**
   (retour Bryan 23/09/2026) — chaque écran/sujet reçoit son propre
   candidat, même à faible preuve (priorité basse plutôt qu'absorption).
   Décision retirée : `YELEN_PUBLIC_HELP_CENTER_CORPUS_V1.md` §8, item
   8.4 ("Litiges") prévoyait de l'absorber dans l'article 8.3 — en plus
   de contredire ce principe, 8.3 est un article Yelen Business et
   Litiges relève de Finance, donc la fusion aurait aussi mélangé deux
   catégories différentes. Le Help Center doit rester fluide : un
   article = un sujet, jamais un sujet noyé dans un autre pour éviter
   d'en écrire un de plus. Deuxième application du même principe, même
   jour : catégorie "Services & offres" scindée en `services` et
   `partenariat` — voir §2 ci-dessus.

**Accessibilité** (§9bis) est ajoutée comme exigence V1 explicite,
non négociable au même titre que le responsive — absente des versions
précédentes de ce document.

---

## 12. Mapping dashboard ↔ Help Center et registre de suivi (verrouillé 24/09/2026)

Décision de Bryan (24/09/2026) formalisant en principe explicite ce qui
était déjà implicite dans le corpus (chaque article du Corpus V1 §2 est
déjà tracé par sa colonne `Écran/route`) : le Help Center devient
progressivement la documentation miroir des écrans métier à valeur
métier réelle du dashboard Institution. **Ne remet en cause aucune des
décisions verrouillées en §11** — les 3 points ci-dessous ont été
tranchés explicitement pour éviter toute ambiguïté au moment du
scaffolding.

**Granularité — pas de rebuild.** On ne passe pas à "1 écran = 1 guide
dédié". Le "guide d'un écran" = l'ensemble des articles du Corpus V1
dont la colonne `Écran/route` référence cet écran (0, 1 ou plusieurs).
Un écran sans article associé reste sans guide — jamais de contenu
fabriqué pour remplir une case (§11.2 inchangé). Vue inverse détaillée
(écran → guide(s)) : `YELEN_PUBLIC_HELP_CENTER_REGISTRE_SUIVI.md`.

**Mapping centralisé — source unique.** `lib/helpCenter/dashboardMapping.ts`
(à créer au moment du scaffolding, pas dans ce document) exportera une
seule table `TabKey → ArticleId[]`, réutilisant le principe déjà posé en
§7 mais regroupé dans un seul fichier plutôt que dispersé par composant
au fil des lots. Toute évolution future d'URL d'article ne touche qu'un
seul fichier.

**Captures d'écran — politique verrouillée.** Toute capture publiée dans
le Help Center provient exclusivement d'un **compte institution de
démonstration dédié**, données manifestement fictives — jamais un
compte réel en production, même anonymisé a posteriori (le dashboard
expose des données citoyennes/institutionnelles réelles, principe
`/securite-institutionnelle` du CLAUDE.md). Modèle de données (`Article`,
§3) étendu d'un champ optionnel `captures?: { src: string; alt: string }[]`
— structure seulement, aucune image produite ni compte de démo créé dans
le cadre de cette décision.

**Câblage du lien "Guide" — discipline inchangée.** Le principe "lot par
lot, jamais en modification groupée" du §7 est confirmé, pas remis en
cause par cette décision : le mapping centralisé peut exister avant que
le bouton "Guide" soit effectivement câblé sur chaque écran. Câblage
écran par écran, dans le même lot que la rédaction du guide correspondant.

**Registre de suivi.** Voir `YELEN_PUBLIC_HELP_CENTER_REGISTRE_SUIVI.md`
(nouveau document, 24/09/2026) — vue par écran (plutôt que par article)
du Corpus V1, colonnes Capture/Lien contextuel/Statut ajoutées. Devient
la source de suivi du chantier continu : écran dashboard stabilisé →
documentation créée/mise à jour → capture ajoutée → lien contextuel
câblé → parcours testé → statut mis à jour. Ne pas attendre d'avoir
traité tout le dashboard pour documenter — un lot à la fois, comme le
reste du chantier.

**Aucun code écrit, aucune capture prise, aucun article rédigé dans le
cadre de cette décision.**

---

## Récapitulatif — Help Center public Yelen V1 (spécification verrouillée)

- URL : `/guide-prestataire`, chaque article sur sa propre route statique
  (§2), `generateStaticParams` (SSG).
- Audience : public (prospect, visiteur SEO) + prestataire connecté —
  jamais de dépendance au dashboard (principe 9).
- Thème : light-only, tokens structurés pour évolution future.
- Contenu : codé en dur (`lib/helpCenter/*`), zéro CMS/table en V1.
- Corpus : ~20-36 articles potentiels sur 8 catégories, alimenté selon
  connaissance réellement démontrée (§2).
- Traçabilité : `sourceCode`/`derniereVerification` internes ; date
  visible au lecteur seulement si `miseAJourAffichee` le justifie (§3).
- Recherche : index généré au build, correspondance côté client, pas de
  service tiers (§4).
- SEO : `app/sitemap.ts` + `app/robots.ts` à créer, `generateMetadata`
  par article (§5).
- Accessibilité : exigence V1 explicite (§9bis).
- Analytics Help Center : différé, architecture non bloquante pour plus
  tard (§11.4).
- Support humain : `/contact` comme filet de sécurité V1, pas de nouveau
  canal (§8).
- Mur mobile : réajouter `/guide-prestataire` à
  `MOBILE_WALL_EXEMPT_PREFIXES` au moment de l'implantation (§6).
- Dashboard : peut lier vers `/guide-prestataire` (popover "Aide Yelen",
  notes contextuelles T5/T11), jamais l'inverse (§7).
- Mapping dashboard ↔ Help Center : table centralisée unique
  (`lib/helpCenter/dashboardMapping.ts`), granularité par article
  existant (pas de rebuild 1 écran = 1 guide), registre de suivi dédié,
  câblage du lien "Guide" toujours lot par lot (§12).
- Captures d'écran : uniquement depuis un compte institution de
  démonstration dédié, jamais un compte réel — aucune capture produite
  à ce stade (§12).

**Aucun code écrit, aucun article rédigé. Spécification prête pour
scaffolding — démarrage du code toujours soumis à l'accord explicite de
Bryan pour ce lot précis (protocole CLAUDE.md), pas une autorisation
implicite de ce document.**
